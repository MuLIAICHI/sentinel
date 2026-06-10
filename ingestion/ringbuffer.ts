/**
 * Fixed-size per-mint ring buffer of TradeTicks.
 *
 * This is the read contract consumed by enrichment (volume slope, curve
 * progress inputs), positions (mark-to-market), and execution (paper fills):
 *
 *   latestPrice(mint)             → number | undefined — most recent tick's price.
 *   recentTicks(mint, sinceMs?)   → TradeTick[] — chronological; `sinceMs` is an
 *                                   ABSOLUTE unix-ms cutoff (ticks at/after it).
 *   volumeStats(mint, windowMs)   → { buyCount, sellCount, solVolume, accelerating }
 *                                   over the trailing window; `accelerating` is
 *                                   true iff SOL volume in the latest half-window
 *                                   strictly exceeds the earlier half-window.
 *   trackedMints()                → string[] — mints currently holding ticks.
 *
 * Eviction, two mechanisms:
 *   1. Per-mint cap: each mint keeps at most `perMintCapacity` ticks (oldest
 *      overwritten, classic ring).
 *   2. Stale-mint drop: a mint with no tick for `staleMintMs` is removed
 *      entirely. Sweeps run opportunistically during push (driven by tick
 *      receipt times, so behavior is deterministic) and via evictStale(now).
 *
 * Time never comes from Date.now() inside this class implicitly except as the
 * documented default for read methods — every method takes an explicit clock
 * value so tests are deterministic.
 */

import type { TradeTick } from './types.js';

export interface VolumeStats {
  buyCount: number;
  sellCount: number;
  solVolume: number;
  /** SOL volume in the latest half-window strictly exceeds the earlier half. */
  accelerating: boolean;
}

export interface RingBufferOptions {
  /** Max ticks retained per mint. Default 256. */
  perMintCapacity?: number;
  /** Drop a mint after this long with no tick. Default 15 minutes. */
  staleMintMs?: number;
}

export const DEFAULT_PER_MINT_CAPACITY = 256;
export const DEFAULT_STALE_MINT_MS = 15 * 60_000;

/** One mint's circular buffer. */
interface MintRing {
  ticks: (TradeTick | undefined)[];
  /** Index of the oldest tick. */
  head: number;
  size: number;
  lastTickAt: number;
}

export class TradeRingBuffer {
  private readonly perMintCapacity: number;
  private readonly staleMintMs: number;
  private readonly rings = new Map<string, MintRing>();
  /** Receipt time of the last opportunistic stale sweep. */
  private lastSweepAt = 0;

  constructor(options: RingBufferOptions = {}) {
    this.perMintCapacity = options.perMintCapacity ?? DEFAULT_PER_MINT_CAPACITY;
    this.staleMintMs = options.staleMintMs ?? DEFAULT_STALE_MINT_MS;
  }

  /** Append a tick to its mint's ring, evicting the oldest at capacity. */
  push(tick: TradeTick): void {
    let ring = this.rings.get(tick.mint);
    if (ring === undefined) {
      ring = { ticks: new Array<TradeTick | undefined>(this.perMintCapacity), head: 0, size: 0, lastTickAt: 0 };
      this.rings.set(tick.mint, ring);
    }
    if (ring.size < this.perMintCapacity) {
      ring.ticks[(ring.head + ring.size) % this.perMintCapacity] = tick;
      ring.size += 1;
    } else {
      ring.ticks[ring.head] = tick;
      ring.head = (ring.head + 1) % this.perMintCapacity;
    }
    ring.lastTickAt = Math.max(ring.lastTickAt, tick.receivedAt);

    // Opportunistic stale sweep, clocked by tick receipt times (deterministic).
    const sweepInterval = Math.min(this.staleMintMs, 60_000);
    if (tick.receivedAt - this.lastSweepAt >= sweepInterval) {
      this.lastSweepAt = tick.receivedAt;
      this.evictStale(tick.receivedAt);
    }
  }

  /** Price of the most recent tick for the mint, or undefined if untracked. */
  latestPrice(mint: string): number | undefined {
    const ring = this.rings.get(mint);
    if (ring === undefined || ring.size === 0) return undefined;
    const last = ring.ticks[(ring.head + ring.size - 1) % this.perMintCapacity];
    return last?.price;
  }

  /**
   * Ticks for the mint in chronological order. When `sinceMs` (absolute unix
   * ms) is given, only ticks with receivedAt >= sinceMs are returned.
   */
  recentTicks(mint: string, sinceMs?: number): TradeTick[] {
    const ring = this.rings.get(mint);
    if (ring === undefined) return [];
    const out: TradeTick[] = [];
    for (let i = 0; i < ring.size; i += 1) {
      const tick = ring.ticks[(ring.head + i) % this.perMintCapacity];
      if (tick !== undefined && (sinceMs === undefined || tick.receivedAt >= sinceMs)) {
        out.push(tick);
      }
    }
    return out;
  }

  /**
   * Buy/sell counts and total SOL volume over the trailing `windowMs`, plus
   * the acceleration flag: volume in (now - windowMs/2, now] strictly greater
   * than volume in (now - windowMs, now - windowMs/2].
   */
  volumeStats(mint: string, windowMs: number, now: number = Date.now()): VolumeStats {
    const cutoff = now - windowMs;
    const halfBoundary = now - windowMs / 2;
    let buyCount = 0;
    let sellCount = 0;
    let solVolume = 0;
    let earlierVolume = 0;
    let latestVolume = 0;
    for (const tick of this.recentTicks(mint, cutoff)) {
      if (tick.receivedAt > now) continue; // future-dated ticks excluded
      if (tick.side === 'buy') buyCount += 1;
      else sellCount += 1;
      solVolume += tick.solAmount;
      if (tick.receivedAt > halfBoundary) latestVolume += tick.solAmount;
      else earlierVolume += tick.solAmount;
    }
    return { buyCount, sellCount, solVolume, accelerating: latestVolume > earlierVolume };
  }

  /** Mints currently holding at least one tick. */
  trackedMints(): string[] {
    return [...this.rings.keys()];
  }

  /**
   * Drop every mint whose last tick is older than `staleMintMs`. Returns the
   * dropped mints (the orchestrator may unsubscribe their trade streams).
   */
  evictStale(now: number = Date.now()): string[] {
    const dropped: string[] = [];
    for (const [mint, ring] of this.rings) {
      if (now - ring.lastTickAt >= this.staleMintMs) {
        this.rings.delete(mint);
        dropped.push(mint);
      }
    }
    return dropped;
  }
}
