/**
 * Sliding-window per-hour call ceiling (ADR-009: hard ceiling 100 calls/hour).
 *
 * Cost guard, not a politeness throttle: when the ceiling is hit, decision/
 * auto-SKIPs with reasoning 'call_ceiling' WITHOUT calling the API. The clock
 * is injectable so tests can drive the window deterministically.
 */

export type Clock = () => number;

/** ADR-009 approved ceiling. Override only via the CallCeiling constructor. */
export const DEFAULT_CALLS_PER_HOUR = 100;

const HOUR_MS = 60 * 60 * 1000;

export class CallCeiling {
  /** Timestamps (clock ms) of calls inside the last hour, oldest first. */
  private readonly timestamps: number[] = [];

  constructor(
    private readonly limit: number = DEFAULT_CALLS_PER_HOUR,
    private readonly clock: Clock = Date.now,
  ) {}

  /** Drop timestamps that have slid out of the one-hour window. */
  private prune(now: number): void {
    while (this.timestamps.length > 0 && (this.timestamps[0] as number) <= now - HOUR_MS) {
      this.timestamps.shift();
    }
  }

  /** Record one model call at the current clock time. */
  recordCall(): void {
    const now = this.clock();
    this.prune(now);
    this.timestamps.push(now);
  }

  /** True when the last hour already contains `limit` or more calls. */
  atCeiling(): boolean {
    this.prune(this.clock());
    return this.timestamps.length >= this.limit;
  }

  /** Number of calls inside the sliding one-hour window. */
  callsLastHour(): number {
    this.prune(this.clock());
    return this.timestamps.length;
  }
}

/** Process-wide ceiling instance used by decision/index.ts. */
export const callCeiling = new CallCeiling();
