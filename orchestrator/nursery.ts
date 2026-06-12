/**
 * The nursery — where newborn tokens wait to become candidates.
 *
 * The filter rejects tokens younger than ~20 minutes BY DESIGN (we skip the
 * sniper bloodbath), so the pipeline cannot be a straight event chain: every
 * brand-new token would fail. Instead, tokens enter here at birth and:
 *
 *   1. at ripenAge − warmup (default 18 min): onWarmup(mint) fires so the
 *      orchestrator can subscribe the trade stream — by evaluation time there
 *      are ~2 minutes of tick history for the volume/curve signals;
 *   2. at ripenAge (default 20 min, matching defaultThresholds.minAgeSeconds):
 *      onRipe(candidate) fires exactly once — the pipeline evaluates;
 *   3. at maxAge (default 60 min): the token is dropped (graduation window
 *      over) and onDrop(mint) fires so trade streams get unsubscribed.
 *
 * Bounded: beyond `cap` entries the oldest is dropped (it would age out
 * soonest anyway). This bound plus the warmup window is what keeps the metered
 * PumpPortal trade-stream spend small.
 */

import type { Candidate, RawTokenEvent } from '../core/types.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('orchestrator/nursery');

export interface NurseryOptions {
  /** Age at which a token is evaluated, seconds. Default 1200 (20 min). */
  ripenAgeSec?: number;
  /** How long before ripening the trade-stream warmup fires, seconds. Default 120. */
  warmupSec?: number;
  /** Age at which an unevaluated token is dropped, seconds. Default 3600. */
  maxAgeSec?: number;
  /** Max tokens held; oldest dropped beyond this. Default 1000. */
  cap?: number;
  /** Clock, injectable for tests. */
  now?: () => number;
  /** Subscribe the mint's trade stream (warm-up before evaluation). */
  onWarmup: (mint: string) => void;
  /** Evaluate the ripe candidate. Fired exactly once per mint. */
  onRipe: (candidate: Candidate) => void;
  /** The mint left the nursery without an open position — unsubscribe it. */
  onDrop: (mint: string) => void;
}

interface Entry {
  event: RawTokenEvent;
  warmupFired: boolean;
  ripeFired: boolean;
}

export class Nursery {
  private readonly entries = new Map<string, Entry>();
  private readonly ripenAgeMs: number;
  private readonly warmupMs: number;
  private readonly maxAgeMs: number;
  private readonly cap: number;
  private readonly now: () => number;
  private readonly onWarmup: (mint: string) => void;
  private readonly onRipe: (candidate: Candidate) => void;
  private readonly onDrop: (mint: string) => void;

  constructor(options: NurseryOptions) {
    this.ripenAgeMs = (options.ripenAgeSec ?? 1200) * 1000;
    this.warmupMs = (options.warmupSec ?? 120) * 1000;
    this.maxAgeMs = (options.maxAgeSec ?? 3600) * 1000;
    this.cap = options.cap ?? 1000;
    this.now = options.now ?? Date.now;
    this.onWarmup = options.onWarmup;
    this.onRipe = options.onRipe;
    this.onDrop = options.onDrop;
  }

  /** Admit a newborn token. Duplicate mints are ignored. */
  add(event: RawTokenEvent): void {
    if (this.entries.has(event.mint)) return;
    if (this.entries.size >= this.cap) {
      // Maps iterate in insertion order; the first key is the oldest entry.
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) {
        this.dropMint(oldest, 'capacity');
      }
    }
    this.entries.set(event.mint, { event, warmupFired: false, ripeFired: false });
  }

  /**
   * Advance the lifecycle: fire warmups, ripenings, and age-outs that are due.
   * Called on an interval by the orchestrator.
   */
  tick(): void {
    const now = this.now();
    for (const [mint, entry] of this.entries) {
      const age = now - entry.event.createdAt;

      if (age >= this.maxAgeMs) {
        this.dropMint(mint, 'aged_out');
        continue;
      }

      if (!entry.warmupFired && age >= this.ripenAgeMs - this.warmupMs) {
        entry.warmupFired = true;
        try {
          this.onWarmup(mint);
        } catch (err) {
          log.error('onWarmup threw', { mint, error: String(err) });
        }
      }

      if (!entry.ripeFired && age >= this.ripenAgeMs) {
        entry.ripeFired = true;
        const candidate: Candidate = {
          mint: entry.event.mint,
          creator: entry.event.creator,
          createdAt: entry.event.createdAt,
          ageSeconds: Math.floor(age / 1000),
          symbol: entry.event.symbol,
          name: entry.event.name,
        };
        // The entry leaves the nursery on evaluation; whether its trade
        // subscription survives is the pipeline's call (open position keeps it).
        this.entries.delete(mint);
        try {
          this.onRipe(candidate);
        } catch (err) {
          log.error('onRipe threw', { mint, error: String(err) });
        }
      }
    }
  }

  /** Drop everything (shutdown). onDrop is NOT fired — the socket is closing anyway. */
  stop(): void {
    this.entries.clear();
  }

  /** Number of tokens currently waiting. */
  size(): number {
    return this.entries.size;
  }

  private dropMint(mint: string, reason: string): void {
    const entry = this.entries.get(mint);
    this.entries.delete(mint);
    if (entry?.warmupFired) {
      // Only warmed-up mints have a trade subscription to release.
      try {
        this.onDrop(mint);
      } catch (err) {
        log.error('onDrop threw', { mint, error: String(err) });
      }
    }
    log.debug('nursery drop', { mint, reason });
  }
}
