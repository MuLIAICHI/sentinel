/**
 * Ingestion module entry (Agent A).
 *
 * Wiring: PumpPortalClient → normalize → bus + ring buffer.
 *  - New-token frames  → bus.emit({ type: 'raw_token', payload }) for filter/.
 *  - Trade frames      → tradeBuffer.push(tick) for enrichment / positions /
 *                        execution to read (see ringbuffer.ts for the contract).
 *
 * Public surface for the orchestrator:
 *  - start(bus?)              — connect the single socket and begin emitting.
 *  - stop()                   — clean shutdown (no reconnects).
 *  - subscribeTrades(mints)   — additive trade-stream subscription (degraded
 *                               no-op without PUMPPORTAL_API_KEY).
 *  - unsubscribeTrades(mints) — drop trade streams.
 *  - tradeBuffer              — the TradeRingBuffer read API.
 *  - bondingCurveProgressPct  — curve % estimate from vSOL (used by enrichment).
 *
 * Env (read only via core/config.ts, per project hard rules):
 *  - PUMPPORTAL_WS_URL  (required)
 *  - PUMPPORTAL_API_KEY (optional — absent → degraded mode, newToken only)
 */

import { Bus, bus as singletonBus } from '../core/bus.js';
import { optionalEnv, requireEnv } from '../core/config.js';
import { createLogger } from '../core/logger.js';
import { PumpPortalClient } from './client.js';
import { bondingCurveProgressPct, normalize } from './normalize.js';
import { TradeRingBuffer } from './ringbuffer.js';

const log = createLogger('ingestion/index');

/** Process-wide trade tick store. Readers: enrichment, positions, execution. */
export const tradeBuffer = new TradeRingBuffer();

let client: PumpPortalClient | null = null;

/**
 * Start ingestion: open the single PumpPortal connection and pump normalized
 * events onto the bus / into the ring buffer. Idempotent — a second call while
 * running logs a warning and does nothing (one socket, ever; ADR-007).
 */
export function start(bus: Bus = singletonBus): void {
  if (client !== null) {
    log.warn('start() called while already running — ignored (single connection rule)');
    return;
  }
  const url = requireEnv('PUMPPORTAL_WS_URL');
  const apiKey = optionalEnv('PUMPPORTAL_API_KEY');
  if (apiKey === undefined) {
    log.warn('PUMPPORTAL_API_KEY not set: degraded mode — newToken stream only, trade subscriptions disabled');
  }

  client = new PumpPortalClient({
    url,
    apiKey,
    onMessage: (raw, receivedAt) => {
      const msg = normalize(raw, receivedAt);
      if (msg === null) {
        // Subscription acks and unknown frames land here — debug, not noise.
        log.debug('unrecognized frame dropped');
        return;
      }
      if (msg.kind === 'token') {
        bus.emit({ type: 'raw_token', payload: msg.event });
      } else {
        tradeBuffer.push(msg.tick);
      }
    },
  });
  client.connect();
  log.info('ingestion started');
}

/** Clean shutdown of the websocket client. Safe to call when not started. */
export function stop(): void {
  if (client === null) return;
  client.shutdown();
  client = null;
  log.info('ingestion stopped');
}

/**
 * Additively subscribe trade streams for mints (orchestrator calls this for
 * candidates that survive the filter). No-op with a warning when ingestion is
 * not started or no API key is configured.
 */
export function subscribeTrades(mints: string[]): void {
  if (client === null) {
    log.warn('subscribeTrades ignored: ingestion not started', { requested: mints.length });
    return;
  }
  client.subscribeTrades(mints);
}

/** Unsubscribe trade streams for mints no longer of interest. */
export function unsubscribeTrades(mints: string[]): void {
  if (client === null) return;
  client.unsubscribeTrades(mints);
}

export { bondingCurveProgressPct };
export { TradeRingBuffer } from './ringbuffer.js';
export type { VolumeStats } from './ringbuffer.js';
export type { TradeTick } from './types.js';
