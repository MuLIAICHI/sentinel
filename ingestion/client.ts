/**
 * The single PumpPortal websocket connection (ADR-007).
 *
 * Connection policy — verified against the live service:
 *  - ONE socket total. Multiple connections trigger temporary hourly bans, so
 *    every subscription (newToken + all token-trade streams) multiplexes over
 *    this one connection.
 *  - Subscriptions are PER-CONNECTION: after any reconnect we re-send
 *    subscribeNewToken plus the full current trade-mint set.
 *  - Incremental subscribes are additive; ≤5000 addresses per message (we
 *    chunk), well under the ≤200 subscription msgs/sec limit.
 *  - The API key (optional) is appended as ?api-key=... — trade streams
 *    REQUIRE it; newToken does not. Without a key the client runs in a
 *    documented DEGRADED MODE: newToken still flows, subscribeTrades logs a
 *    warning and no-ops.
 *
 * Resilience:
 *  - Heartbeat watchdog: if no frame arrives within heartbeatTimeoutMs
 *    (default 30s) the socket is terminated, which triggers reconnect.
 *  - Reconnect uses exponential backoff with jitter (delay drawn uniformly
 *    from [base·2^n / 2, base·2^n], capped at backoffMaxMs).
 */

import WebSocket from 'ws';
import { createLogger } from '../core/logger.js';

const log = createLogger('ingestion/client');

/** PumpPortal hard limit: addresses per subscription message. */
const MAX_KEYS_PER_MESSAGE = 5000;

export const DEFAULT_HEARTBEAT_TIMEOUT_MS = 30_000;
export const DEFAULT_BACKOFF_BASE_MS = 1_000;
export const DEFAULT_BACKOFF_MAX_MS = 30_000;

export interface PumpPortalClientOptions {
  /** Base WS URL (from PUMPPORTAL_WS_URL) — key appended here, never logged. */
  url: string;
  /** Optional API key; absent → degraded mode (newToken only). */
  apiKey?: string | undefined;
  /** Called with each JSON-parsed frame and its receipt time (unix ms). */
  onMessage: (raw: unknown, receivedAt: number) => void;
  /** Reconnect if no frame within this many ms. Default 30 000. */
  heartbeatTimeoutMs?: number;
  /** First reconnect delay base. Default 1 000. */
  backoffBaseMs?: number;
  /** Reconnect delay ceiling. Default 30 000. */
  backoffMaxMs?: number;
}

export class PumpPortalClient {
  private readonly url: string;
  private readonly apiKey: string | undefined;
  private readonly onMessage: (raw: unknown, receivedAt: number) => void;
  private readonly heartbeatTimeoutMs: number;
  private readonly backoffBaseMs: number;
  private readonly backoffMaxMs: number;

  private ws: WebSocket | null = null;
  /** Every mint we are (or should be, post-reconnect) subscribed to. */
  private readonly tradeMints = new Set<string>();
  private reconnectAttempt = 0;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(options: PumpPortalClientOptions) {
    this.url = options.url;
    this.apiKey = options.apiKey;
    this.onMessage = options.onMessage;
    this.heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? DEFAULT_HEARTBEAT_TIMEOUT_MS;
    this.backoffBaseMs = options.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS;
    this.backoffMaxMs = options.backoffMaxMs ?? DEFAULT_BACKOFF_MAX_MS;
  }

  /** Open the single connection. Safe to call once; reconnects are internal. */
  connect(): void {
    if (this.stopped || this.ws !== null) return;

    const sep = this.url.includes('?') ? '&' : '?';
    const fullUrl = this.apiKey === undefined ? this.url : `${this.url}${sep}api-key=${this.apiKey}`;
    const ws = new WebSocket(fullUrl);
    this.ws = ws;

    ws.on('open', () => {
      this.reconnectAttempt = 0;
      this.armHeartbeat();
      log.info('connected', { degraded: this.apiKey === undefined, trackedMints: this.tradeMints.size });
      // Per-connection subscriptions: always (re-)subscribe everything.
      this.send({ method: 'subscribeNewToken' });
      if (this.apiKey !== undefined && this.tradeMints.size > 0) {
        this.sendTradeSubscription('subscribeTokenTrade', [...this.tradeMints]);
      }
    });

    ws.on('message', (data) => {
      this.armHeartbeat();
      const receivedAt = Date.now();
      let parsed: unknown;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        log.warn('non-JSON frame dropped', { bytes: data.toString().length });
        return;
      }
      this.onMessage(parsed, receivedAt);
    });

    ws.on('error', (err) => {
      log.warn('socket error', { error: String(err) });
    });

    ws.on('close', (code) => {
      this.clearHeartbeat();
      this.ws = null;
      if (this.stopped) return;
      log.warn('socket closed', { code });
      this.scheduleReconnect();
    });
  }

  /**
   * Additively subscribe trade streams for new mints. Already-tracked mints
   * are skipped (incremental subscribes are additive — no full resend needed).
   * DEGRADED MODE: without an API key this logs a warning and no-ops.
   */
  subscribeTrades(mints: string[]): void {
    if (this.apiKey === undefined) {
      log.warn('subscribeTrades ignored: no PUMPPORTAL_API_KEY (degraded mode, newToken only)', {
        requested: mints.length,
      });
      return;
    }
    const added = mints.filter((m) => !this.tradeMints.has(m));
    for (const mint of added) this.tradeMints.add(mint);
    if (added.length > 0 && this.isConnected()) {
      this.sendTradeSubscription('subscribeTokenTrade', added);
    }
  }

  /** Stop tracking mints and unsubscribe their trade streams if connected. */
  unsubscribeTrades(mints: string[]): void {
    const removed = mints.filter((m) => this.tradeMints.delete(m));
    if (this.apiKey !== undefined && removed.length > 0 && this.isConnected()) {
      this.sendTradeSubscription('unsubscribeTokenTrade', removed);
    }
  }

  /** Mints currently tracked for trade subscription. */
  subscribedMints(): string[] {
    return [...this.tradeMints];
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /** Clean shutdown: no reconnects, timers cleared, socket closed. */
  shutdown(): void {
    this.stopped = true;
    this.clearHeartbeat();
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws !== null) {
      if (this.ws.readyState === WebSocket.OPEN) this.ws.close();
      else this.ws.terminate();
      this.ws = null;
    }
    log.info('shutdown complete');
  }

  private send(message: Record<string, unknown>): void {
    if (this.ws !== null && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private sendTradeSubscription(method: 'subscribeTokenTrade' | 'unsubscribeTokenTrade', keys: string[]): void {
    for (let i = 0; i < keys.length; i += MAX_KEYS_PER_MESSAGE) {
      this.send({ method, keys: keys.slice(i, i + MAX_KEYS_PER_MESSAGE) });
    }
  }

  /** (Re)arm the watchdog: any frame proves liveness; silence forces reconnect. */
  private armHeartbeat(): void {
    this.clearHeartbeat();
    this.heartbeatTimer = setTimeout(() => {
      log.warn('heartbeat timeout, terminating socket', { timeoutMs: this.heartbeatTimeoutMs });
      // terminate() fires 'close', which schedules the reconnect.
      this.ws?.terminate();
    }, this.heartbeatTimeoutMs);
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    this.reconnectAttempt += 1;
    const exp = Math.min(this.backoffMaxMs, this.backoffBaseMs * 2 ** (this.reconnectAttempt - 1));
    // Jitter: uniform in [exp/2, exp] so a fleet of restarts cannot stampede.
    const delay = exp / 2 + Math.random() * (exp / 2);
    log.info('reconnect scheduled', { attempt: this.reconnectAttempt, delayMs: Math.round(delay) });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}
