/**
 * Price-tick delivery: a small poll loop feeding the exit engine.
 *
 * Ingestion accumulates trades in its ring buffer but emits no per-tick bus
 * events (deliberately — the firehose would swamp the bus). The exit rules are
 * minutes-scale, so a 2-second poll of the latest price for each OPEN position
 * is more than enough resolution, and it keeps ingestion and positions fully
 * decoupled.
 */

import { createLogger } from '../core/logger.js';
import type { PositionEngine } from '../positions/index.js';

const log = createLogger('orchestrator/ticks');

export interface TickLoopOptions {
  engine: PositionEngine;
  latestPrice: (mint: string) => number | undefined;
  /** Poll cadence in ms. Default 2000. */
  intervalMs?: number;
}

/** Start polling. Returns a stop() handle. */
export function startTickLoop(options: TickLoopOptions): { stop: () => void } {
  const interval = options.intervalMs ?? 2000;
  const timer = setInterval(() => {
    for (const position of options.engine.openPositions()) {
      const price = options.latestPrice(position.mint);
      if (price === undefined) continue; // no fresh data; rules re-fire next poll
      void options.engine.onTick(position.mint, price).catch((err) => {
        log.error('onTick failed', { mint: position.mint, error: String(err) });
      });
    }
  }, interval);
  // Never keep the process alive solely for the poll loop.
  timer.unref();
  return {
    stop: () => clearInterval(timer),
  };
}
