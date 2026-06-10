/**
 * Public surface of execution/ — the execute facade.
 *
 * createExecutor() returns {buy, sell} routing to the paper simulator
 * (default, the product) or the gated live path. Live routing requires BOTH
 * LIVE_TRADING === true (risk/guards.ts, human-edited) AND an explicit
 * mode: 'live' — anything else is paper. With LIVE_TRADING false (today),
 * asking for 'live' throws loudly rather than silently downgrading.
 *
 * Prices are INJECTED via priceOf — execution never imports ingestion/.
 * The returned sell implements the positions/ SellExecutor contract:
 * (position, fraction, reason) => Promise<{exitPrice}> with exitPrice NET of
 * fees. buy() emits position_opened on the bus, which PositionEngine and
 * db/persist consume.
 */

import type { Position } from '../core/types.js';
import { Bus, bus as singletonBus } from '../core/bus.js';
import { createLogger } from '../core/logger.js';
import { LIVE_TRADING } from '../risk/guards.js';
import type { RiskedOrder } from '../risk/index.js';
import type { SellExecutor } from '../positions/index.js';
import { paperBuy, paperSell } from './paper.js';
import type { PaperFillConfig } from './paper.js';
import { liveBuy, liveSell } from './live.js';

export { paperBuy, paperSell, defaultPaperFillConfig } from './paper.js';
export type { PaperFillConfig } from './paper.js';
export { getSigner } from './signer.js';
export type { Signer } from './signer.js';
export {
  buildTradeRequest,
  fetchLocalTransaction,
  verifyTransaction,
  ALLOWED_PROGRAM_IDS,
} from './pumpportal.js';
export type { TradeRequest, TradeOptions, TradePool } from './pumpportal.js';

const log = createLogger('execution/index');

/** Options for {@link createExecutor}. */
export interface ExecutorOptions {
  /**
   * Current stream price for a mint (SOL per token), or undefined when no
   * price is known — injected by the orchestrator from ingestion's buffer.
   */
  priceOf: (mint: string) => number | undefined;
  /** 'paper' (default) or 'live' (requires LIVE_TRADING === true). */
  mode?: 'paper' | 'live';
  /** Fill-model overrides (fees / slippage). */
  config?: Partial<PaperFillConfig>;
  /** Event bus to emit position_opened on. Defaults to the core singleton. */
  bus?: Bus;
  /** Clock for paper position ids/timestamps. Inject in tests. */
  now?: () => number;
}

/** What the orchestrator wires into the pipeline and PositionEngine. */
export interface Executor {
  /**
   * Execute a risk-approved entry. Fills (paper) or trades (live), emits
   * position_opened, returns the Position. `symbol` is optional display
   * metadata — defaults to a mint prefix.
   */
  buy(order: RiskedOrder, symbol?: string): Promise<Position>;
  /** The positions/ SellExecutor: sell a fraction, resolve net exitPrice. */
  sell: SellExecutor;
}

const widenedLiveTrading: boolean = LIVE_TRADING;

/** Build the execute facade. Throws immediately on an impossible mode. */
export function createExecutor(options: ExecutorOptions): Executor {
  const mode = options.mode ?? 'paper';
  // Loud refusal, not a silent downgrade: live mode cannot be constructed
  // while LIVE_TRADING is false (i.e. ever, until a human edits guards.ts).
  if (mode === 'live' && !widenedLiveTrading) {
    throw new Error(
      "createExecutor: mode 'live' refused — LIVE_TRADING is false (risk/guards.ts)",
    );
  }
  const bus = options.bus ?? singletonBus;
  const { priceOf, config, now } = options;

  function requirePrice(mint: string, context: string): number {
    const price = priceOf(mint);
    if (price === undefined) {
      throw new Error(`execution ${context}: no current price for mint ${mint} — refusing`);
    }
    return price;
  }

  return {
    async buy(order: RiskedOrder, symbol?: string): Promise<Position> {
      const price = requirePrice(order.mint, 'buy');
      const position =
        mode === 'live'
          ? await liveBuy(order, price, {
              ...(symbol !== undefined ? { symbol } : {}),
              ...(config !== undefined ? { config } : {}),
            })
          : paperBuy(order, price, {
              ...(symbol !== undefined ? { symbol } : {}),
              ...(config !== undefined ? { config } : {}),
              ...(now !== undefined ? { now } : {}),
            });
      bus.emit({ type: 'position_opened', payload: position });
      log.info('position opened', { id: position.id, mint: position.mint, mode: position.mode });
      return position;
    },

    sell: async (position, fraction, reason) => {
      const price = requirePrice(position.mint, 'sell');
      return mode === 'live'
        ? liveSell(position, fraction, price, reason, config)
        : paperSell(position, fraction, price, reason, config);
    },
  };
}
