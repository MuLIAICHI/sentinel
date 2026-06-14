/**
 * Process entry — owns the boot order, the wiring, and graceful shutdown.
 *
 * Boot order (db handoff): config preflight → persistence → daily/kill state →
 * executor + engine → nursery + pipeline → ingestion → tick loop → sweeps.
 * Shutdown: ingestion first (stop the inflow), then loops, then a short flush
 * grace for in-flight persistence.
 *
 * PAPER MODE ONLY: the executor is constructed without a mode override, and
 * LIVE_TRADING is false (risk/guards.ts). This file never changes that.
 */

import { bus } from '../core/bus.js';
import { defaultThresholds, requireEnv, optionalEnv, apiBindConfig } from '../core/config.js';
import { createLogger } from '../core/logger.js';
import type { Candidate } from '../core/types.js';
import { attachPersistence } from '../db/persist.js';
import {
  getClosedPositions,
  getDailyStats,
  getDecisions,
  getKillState,
  utcDay,
} from '../db/queries.js';
import { closePool } from '../db/client.js';
import { createApiServer } from '../api/server.js';
import { evaluate } from '../filter/index.js';
import {
  bondingCurveProgressPct,
  start as startIngestion,
  stop as stopIngestion,
  subscribeTrades,
  tradeBuffer,
  unsubscribeTrades,
} from '../ingestion/index.js';
import { createHeliusProvider } from '../enrichment/helius.js';
import { enrich } from '../enrichment/index.js';
import { decide } from '../decision/index.js';
import { activateKill, approve, isKillActive, releaseKill } from '../risk/index.js';
import { createExecutor } from '../execution/index.js';
import { PositionEngine } from '../positions/index.js';
import { DailyTracker } from './daily.js';
import { Nursery } from './nursery.js';
import { evaluateCandidate, type PipelineDeps } from './pipeline.js';
import { startTickLoop } from './ticks.js';

const log = createLogger('orchestrator');

/** Volume window used for the re-acceleration signal (warmup is ~2 min). */
const VOLUME_WINDOW_MS = 4 * 60 * 1000;
const NURSERY_TICK_MS = 15_000;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

let stopFns: Array<() => void> = [];
let shuttingDown = false;

/** Boot the whole paper-trading pipeline. */
export async function boot(): Promise<void> {
  // 1. Config preflight: fail fast, by name, before touching anything.
  for (const name of [
    'DATABASE_URL',
    'PUMPPORTAL_WS_URL',
    'HELIUS_API_KEY',
    'SOLANA_RPC_URL',
    'ANTHROPIC_API_KEY',
  ] as const) {
    requireEnv(name);
  }

  // 2. Log first, act second.
  attachPersistence(bus);

  // 3. Daily P&L + kill state.
  const daily = new DailyTracker({
    loadPnl: async (day) => (await getDailyStats(day))?.realizedPnlSol ?? 0,
    activateKill,
    releaseKill,
    getKillReason: async () => {
      const s = await getKillState();
      return { active: s.active, reason: s.reason };
    },
  });
  await daily.boot();
  daily.attach(bus);

  // Cache kill state in-process; refresh from kill_switch events.
  let killActive = await isKillActive();
  bus.on('kill_switch', (payload) => {
    killActive = payload.active;
    log.warn('kill switch state change', { active: payload.active, reason: payload.reason });
  });

  // 4. Execution + exit engine (paper).
  const executor = createExecutor({
    priceOf: (mint) => tradeBuffer.latestPrice(mint),
    bus,
  });
  const engine = new PositionEngine({ executor: executor.sell, bus });

  // 5. Pipeline deps — the one place every module meets.
  const provider = createHeliusProvider();

  // Local (FREE) signals from the trade ring buffer. Used in BOTH filter
  // passes: feeding them into the cheap pass rejects dead tokens before any
  // paid Helius call — identical verdicts to the full pass (same data, same
  // rules), radically smaller bill. Live finding: pump.fun launches ~28
  // tokens/min; without this, every one of them costs an enrichment.
  const localVolumeAccelerating = (mint: string): boolean =>
    tradeBuffer.volumeStats(mint, VOLUME_WINDOW_MS).accelerating;
  const localCurvePct = (mint: string): number => {
    const ticks = tradeBuffer.recentTicks(mint);
    const last = ticks[ticks.length - 1];
    // No trades during the 2-min warmup = dead token; 0 fails the curve band
    // and the candidate is rejected, which is correct.
    return last ? bondingCurveProgressPct(last.vSol) : 0;
  };

  const deps: PipelineDeps = {
    cheapFilter: (c) =>
      evaluate(
        c,
        {
          bondingCurvePct: localCurvePct(c.mint),
          volumeAccelerating: localVolumeAccelerating(c.mint),
        },
        defaultThresholds,
      ),
    enrich: (c) =>
      enrich(c, {
        provider,
        volumeAccelerating: localVolumeAccelerating,
        bondingCurvePct: localCurvePct,
        bus,
      }),
    fullFilter: (c, ctx) => evaluate(c, ctx, defaultThresholds),
    decide,
    getPortfolio: async () => ({
      openPositionsCount: engine.openPositions().length,
      dailyRealizedPnlSol: daily.currentPnl(),
      killSwitchActive: killActive,
    }),
    approve,
    buy: (order, symbol) => executor.buy(order, symbol),
    bus,
  };

  // 6. Nursery: birth → warmup → evaluation → age-out.
  const openMints = () => new Set(engine.openPositions().map((p) => p.mint));
  const nursery = new Nursery({
    ripenAgeSec: defaultThresholds.minAgeSeconds,
    onWarmup: (mint) => subscribeTrades([mint]),
    onRipe: (candidate: Candidate) => {
      void evaluateCandidate(candidate, deps).then((outcome) => {
        log.info('candidate evaluated', { mint: candidate.mint, outcome });
        // Keep the trade stream only for opened positions.
        if (outcome !== 'opened') unsubscribeTrades([candidate.mint]);
      });
    },
    onDrop: (mint) => unsubscribeTrades([mint]),
  });
  bus.on('raw_token', (event) => nursery.add(event));
  const nurseryTimer = setInterval(() => nursery.tick(), NURSERY_TICK_MS);
  nurseryTimer.unref();
  stopFns.push(() => clearInterval(nurseryTimer), () => nursery.stop());

  // Closed positions release their trade stream.
  bus.on('position_closed', (position) => {
    unsubscribeTrades([position.mint]);
  });

  // 7. Inflow + tick delivery.
  startIngestion(bus);
  stopFns.push(() => stopIngestion());
  const tickLoop = startTickLoop({
    engine,
    latestPrice: (mint) => tradeBuffer.latestPrice(mint),
  });
  stopFns.push(() => tickLoop.stop());

  // 8. Housekeeping: ring-buffer eviction (never for open positions — the
  //    buffer keeps fresh ticks for subscribed mints anyway), day rollover.
  const sweepTimer = setInterval(() => {
    const open = openMints();
    const dropped = tradeBuffer.evictStale().filter((m) => !open.has(m));
    if (dropped.length > 0) unsubscribeTrades(dropped);
    void daily.rollover().catch((err) => log.error('rollover failed', { error: String(err) }));
  }, SWEEP_INTERVAL_MS);
  sweepTimer.unref();
  stopFns.push(() => clearInterval(sweepTimer));

  // 9. The API server (REST + websocket for the UI) — same process, same bus.
  const api = createApiServer({
    bus,
    // Open positions from the engine (authoritative in-memory state).
    openPositions: async () => engine.openPositions(),
    closedPositions: (limit) => getClosedPositions(limit),
    decisions: (limit) => getDecisions(limit),
    dailyStats: () => getDailyStats(utcDay(Date.now())),
    killState: () => getKillState(),
    activateKill,
    releaseKill,
    authToken: optionalEnv('API_TOKEN'),
    dashboardOrigin: optionalEnv('DASHBOARD_ORIGIN'),
  });
  const { port, host } = apiBindConfig();
  const apiPort = await api.start(port, host);
  stopFns.push(() => void api.stop());

  log.info('sentinel booted', {
    apiPort,
    mode: 'paper',
    ripenAgeSec: defaultThresholds.minAgeSeconds,
    killActive,
    dailyPnlSol: daily.currentPnl(),
  });
}

/** Stop inflow first, then loops, then flush. Idempotent. */
export async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info('shutting down');
  for (const stop of stopFns.reverse()) {
    try {
      stop();
    } catch (err) {
      log.error('stop hook failed', { error: String(err) });
    }
  }
  stopFns = [];
  // Grace for in-flight persistence writes.
  await new Promise((r) => setTimeout(r, 2000));
  await closePool().catch(() => undefined);
  log.info('shutdown complete');
}

// Entry point when run directly (tsx orchestrator/index.ts / PM2).
const isMain = process.argv[1]?.endsWith('orchestrator/index.ts');
if (isMain) {
  process.on('SIGINT', () => void shutdown().then(() => process.exit(0)));
  process.on('SIGTERM', () => void shutdown().then(() => process.exit(0)));
  boot().catch((err) => {
    log.error('boot failed', { error: String(err) });
    process.exitCode = 1;
  });
}
