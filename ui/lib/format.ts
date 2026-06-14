/**
 * Pure formatting + exit-distance math for the dashboard. No I/O, no clock —
 * every time-dependent function takes `nowMs` as an argument so it stays
 * deterministic and unit-testable.
 *
 * EXIT_CONFIG mirrors positions/rules.ts `defaultExitConfig` (SPEC §4). If the
 * backend thresholds change, update this mirror.
 */

import type { Position } from './types.js';

/** Mirror of positions/rules.ts defaultExitConfig (fractions; time in ms). */
export const EXIT_CONFIG = {
  takeProfitTriggerPct: 0.8,
  takeProfitSellFraction: 0.5,
  trailingGivebackPct: 0.25,
  hardStopPct: 0.35,
  timeStopMs: 45 * 60 * 1000,
} as const;

/** Format a SOL amount with a sign and 4 decimals: `+0.0123 ◎`, `0.0000 ◎`. */
export function fmtSol(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  return `${sign}${Math.abs(n).toFixed(4)} ◎`;
}

/** Format a fraction (0.8 → `+80.0%`, −0.35 → `−35.0%`). */
export function fmtPct(frac: number): string {
  if (!Number.isFinite(frac)) return '—';
  const sign = frac > 0 ? '+' : frac < 0 ? '−' : '';
  return `${sign}${Math.abs(frac * 100).toFixed(1)}%`;
}

/** Format an elapsed/remaining duration in ms as `12s`, `3m 04s`, `1h 02m`. */
export function fmtAge(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

/** Format a SOL-per-token price; tiny values fall back to exponential. */
export function fmtPrice(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n === 0) return '0';
  if (Math.abs(n) < 1e-4) return n.toExponential(2);
  return n.toPrecision(4);
}

/** Unrealized P&L in SOL for an open position at `price` (SOL per token). */
export function unrealizedPnl(position: Position, price: number): number {
  return (price - position.entryPrice) * position.amountTokens;
}

/** Distances from the current state to each mechanical exit. */
export interface ExitDistances {
  /** Fraction the price must RISE to hit take-profit (+, or 0 if already past). */
  takeProfitPct: number;
  /** Fraction cushion before the hard stop fires (+, or 0 if already breached). */
  hardStopPct: number;
  /** Fraction cushion before the trailing stop fires; null until peak > entry. */
  trailingPct: number | null;
  /** Milliseconds remaining before the time stop flattens the position. */
  timeStopMsLeft: number;
}

/**
 * Compute distance-to-exit for one open position. Mirrors the rule triggers in
 * positions/rules.ts so the table reads the same numbers the engine acts on.
 */
export function distanceToExits(
  position: Position,
  price: number,
  peak: number,
  nowMs: number,
): ExitDistances {
  const entry = position.entryPrice;
  const tpTrigger = entry * (1 + EXIT_CONFIG.takeProfitTriggerPct);
  const hardFloor = entry * (1 - EXIT_CONFIG.hardStopPct);

  const takeProfitPct = price > 0 ? Math.max(0, (tpTrigger - price) / price) : 0;
  const hardStopPct = price > 0 ? Math.max(0, (price - hardFloor) / price) : 0;

  let trailingPct: number | null = null;
  if (peak > entry && price > 0) {
    const trailTrigger = peak * (1 - EXIT_CONFIG.trailingGivebackPct);
    trailingPct = Math.max(0, (price - trailTrigger) / price);
  }

  const timeStopMsLeft = Math.max(0, EXIT_CONFIG.timeStopMs - (nowMs - position.entryAt));

  return { takeProfitPct, hardStopPct, trailingPct, timeStopMsLeft };
}
