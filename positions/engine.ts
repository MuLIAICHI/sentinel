/**
 * PositionEngine — the per-tick evaluation loop over open positions.
 *
 * Mechanical only: every exit is `evaluateExit` from rules.ts; no model call
 * can hold, override, or delay a sell. Sells go through an injected
 * {@link SellExecutor} (the execution module's `execute(order)` facade —
 * never imported here, wired by the orchestrator).
 *
 * How positions enter the engine — both paths are supported and idempotent
 * by position id:
 *   1. The engine subscribes to `position_opened` on its Bus and starts
 *      tracking automatically, or
 *   2. The orchestrator calls `open(position)` directly.
 *
 * Events emitted (db/persist.ts subscribes to the bus — the engine never
 * touches the DB itself):
 *   - `position_updated` after a partial sell (amountTokens reduced).
 *   - `position_closed` after a full exit, with exitPrice/exitAt/exitReason
 *     and realizedPnlSol.
 *
 * P&L formula (all SOL):
 *   realizedPnlSol = Σ(soldTokens_i × exitPrice_i) − entrySol
 * i.e. cumulative sale proceeds across every partial and the final exit,
 * minus the SOL paid at entry. Fees/slippage are NOT added here — the
 * SellExecutor must return a net-of-fees fill price (paper.ts models the
 * haircut), and entrySol is the all-in SOL spent on entry.
 */

import type { Position } from '../core/types.js';
import { Bus, bus as singletonBus } from '../core/bus.js';
import { createLogger } from '../core/logger.js';
import { defaultExitConfig, evaluateExit } from './rules.js';
import type { ExitConfig, ExitReason } from './rules.js';

const log = createLogger('positions/engine');

/**
 * The narrow contract the execution layer must implement and the orchestrator
 * injects. Sells `fraction` (0..1] of the position's CURRENT `amountTokens`
 * for `reason`, and resolves with the net-of-fees fill price in SOL per token.
 * A rejection leaves the position open; the engine logs and retries on the
 * next tick.
 */
export type SellExecutor = (
  position: Position,
  fraction: number,
  reason: ExitReason,
) => Promise<{ exitPrice: number }>;

/** Per-position state the engine tracks beyond the Position record itself. */
interface Tracked {
  /** The engine's own mutable copy of the position. */
  position: Position;
  /** Highest price seen since entry (starts at entryPrice). */
  peakPrice: number;
  /** Whether the once-only take-profit partial has fired. */
  takenProfit: boolean;
  /** Cumulative SOL received across all sells, for realized P&L. */
  proceedsSol: number;
  /** True while a sell for this position is in flight — blocks re-entry. */
  pending: boolean;
}

/** Constructor options for {@link PositionEngine}. */
export interface PositionEngineOptions {
  /** Executes sells — the execution facade, injected by the orchestrator. */
  executor: SellExecutor;
  /** Event bus to subscribe/emit on. Defaults to the core singleton. */
  bus?: Bus;
  /** Exit thresholds. Defaults to the SPEC §4 values. */
  config?: ExitConfig;
  /** Clock used when a caller omits nowMs. Defaults to Date.now. Inject in tests. */
  now?: () => number;
}

export class PositionEngine {
  private readonly executor: SellExecutor;
  private readonly bus: Bus;
  private readonly config: ExitConfig;
  private readonly now: () => number;
  /** Open positions by position id. */
  private readonly tracked = new Map<string, Tracked>();
  /** Open position ids by mint, for tick routing. */
  private readonly byMint = new Map<string, Set<string>>();
  private killSwitchActive = false;

  constructor(options: PositionEngineOptions) {
    this.executor = options.executor;
    this.bus = options.bus ?? singletonBus;
    this.config = options.config ?? defaultExitConfig;
    this.now = options.now ?? Date.now;

    // Auto-track positions opened anywhere in the pipeline.
    this.bus.on('position_opened', (position) => this.open(position));
    // Kill-switch flatten is unconditional and immediate. Bus handlers are
    // sync, so the async flatten is fired here and any failure is logged.
    this.bus.on('kill_switch', ({ active, reason }) => {
      this.killSwitchActive = active;
      if (active) {
        void this.onKillSwitch().catch((err) =>
          log.error('kill-switch flatten failed', { reason, error: String(err) }),
        );
      }
    });
  }

  /**
   * Start tracking an open position. Idempotent by position id; closed
   * positions are ignored. The engine keeps its own copy — callers may not
   * mutate engine state through the passed object.
   */
  open(position: Position): void {
    if (position.status !== 'open' || this.tracked.has(position.id)) return;
    this.tracked.set(position.id, {
      position: { ...position },
      peakPrice: position.entryPrice,
      takenProfit: false,
      proceedsSol: 0,
      pending: false,
    });
    let ids = this.byMint.get(position.mint);
    if (!ids) {
      ids = new Set();
      this.byMint.set(position.mint, ids);
    }
    ids.add(position.id);
    log.info('tracking position', { id: position.id, mint: position.mint, symbol: position.symbol });
  }

  /** Snapshot of currently open positions (copies — safe to hand out). */
  openPositions(): Position[] {
    return [...this.tracked.values()].map((t) => ({ ...t.position }));
  }

  /**
   * Evaluate exit rules for every open position on `mint` at `price`.
   * `nowMs` defaults to the injected clock; tests should pass it explicitly.
   * One rule (the highest-precedence trigger) acts per position per tick.
   */
  async onTick(mint: string, price: number, nowMs?: number): Promise<void> {
    const ids = this.byMint.get(mint);
    if (!ids) return;
    const at = nowMs ?? this.now();
    // Snapshot ids: executing a sell mutates the index.
    for (const id of [...ids]) {
      const t = this.tracked.get(id);
      if (!t || t.pending) continue;
      if (price > t.peakPrice) t.peakPrice = price;
      const action = evaluateExit({
        position: t.position,
        currentPrice: price,
        peakPrice: t.peakPrice,
        nowMs: at,
        takenProfit: t.takenProfit,
        killSwitchActive: this.killSwitchActive,
        config: this.config,
      });
      if (action.kind === 'sell') {
        await this.executeSell(t, action.fraction, action.reason, at);
      }
    }
  }

  /**
   * Flatten every open position immediately (kill switch). Also invoked
   * automatically when a `kill_switch { active: true }` event arrives on the
   * bus. Positions with a sell already in flight are flattened right after
   * that sell settles (see executeSell).
   */
  async onKillSwitch(): Promise<void> {
    this.killSwitchActive = true;
    for (const id of [...this.tracked.keys()]) {
      const t = this.tracked.get(id);
      if (!t || t.pending) continue;
      await this.executeSell(t, 1, 'kill_switch', this.now());
    }
  }

  /** Run one sell through the executor and emit the resulting event. */
  private async executeSell(t: Tracked, fraction: number, reason: ExitReason, nowMs: number): Promise<void> {
    t.pending = true;
    let exitPrice: number;
    try {
      ({ exitPrice } = await this.executor({ ...t.position }, fraction, reason));
    } catch (err) {
      // Leave the position open; rules re-trigger on the next tick.
      t.pending = false;
      log.error('sell executor failed', { id: t.position.id, reason, error: String(err) });
      return;
    }
    const soldTokens = t.position.amountTokens * fraction;
    t.proceedsSol += soldTokens * exitPrice;

    if (fraction >= 1) {
      // Full exit: realizedPnlSol = total SOL proceeds − SOL paid at entry.
      const closed: Position = {
        ...t.position,
        amountTokens: 0,
        status: 'closed',
        exitPrice,
        exitAt: nowMs,
        exitReason: reason,
        realizedPnlSol: t.proceedsSol - t.position.entrySol,
      };
      this.untrack(t.position.id, t.position.mint);
      this.bus.emit({ type: 'position_closed', payload: closed });
      log.info('position closed', {
        id: closed.id,
        mint: closed.mint,
        exitReason: reason,
        realizedPnlSol: closed.realizedPnlSol,
      });
      return;
    }

    // Partial sell: shrink the bag, remember TP fired, stay open.
    t.position.amountTokens -= soldTokens;
    if (reason === 'take_profit') t.takenProfit = true;
    t.pending = false;
    this.bus.emit({ type: 'position_updated', payload: { ...t.position } });
    log.info('position partially sold', {
      id: t.position.id,
      mint: t.position.mint,
      reason,
      fraction,
      remainingTokens: t.position.amountTokens,
    });
    // If the kill switch tripped while this sell was in flight, flatten now.
    if (this.killSwitchActive) {
      await this.executeSell(t, 1, 'kill_switch', this.now());
    }
  }

  /** Remove a position from both indexes. */
  private untrack(id: string, mint: string): void {
    this.tracked.delete(id);
    const ids = this.byMint.get(mint);
    if (ids) {
      ids.delete(id);
      if (ids.size === 0) this.byMint.delete(mint);
    }
  }
}
