/**
 * approve() — the ONLY entity that can authorize an entry.
 *
 * Pure function: all state is injected via PortfolioState, no I/O, no bus, no
 * DB. Callers (orchestrator) gather state, call approve(), and act on the
 * result — emitting `risk_block` themselves on rejection.
 *
 * Claude proposes; this function disposes. Confidence may only SHRINK the
 * position size below MAX_POSITION_SOL — it can NEVER grow it.
 */

import type { Decision } from '../core/types.js';
import { DAILY_LOSS_LIMIT_SOL, MAX_CONCURRENT, MAX_POSITION_SOL } from './guards.js';

/** Snapshot of portfolio state injected by the caller — approve() does no I/O. */
export interface PortfolioState {
  /** Number of currently open positions (paper or live). */
  openPositionsCount: number;
  /** Realized P&L for the current UTC day, in SOL (losses are negative). */
  dailyRealizedPnlSol: number;
  /** Whether the global kill switch is currently active. */
  killSwitchActive: boolean;
}

/** An entry approved by risk — the only ticket execution will accept. */
export interface RiskedOrder {
  approved: true;
  mint: string;
  /** Position size in SOL: MAX_POSITION_SOL × clamped confidence, never above the cap. */
  sizeSol: number;
  /** The confidence value actually used for sizing (clamped to (0, 1]). */
  confidence: number;
}

/** A rejected entry, with a machine-readable reason for the `risk_block` event. */
export interface RiskBlock {
  approved: false;
  mint: string;
  reason:
    | 'kill_switch_active'
    | 'not_a_buy'
    | 'daily_loss_limit'
    | 'max_concurrent'
    | 'invalid_confidence';
}

/**
 * Gate a Decision against the hardcoded guards. Checks run in fixed order:
 * kill switch → action is BUY → daily loss under limit → concurrency under
 * MAX_CONCURRENT → confidence valid → size.
 *
 * Sizing: sizeSol = MAX_POSITION_SOL × clamp(confidence, 0, 1), hard-capped at
 * MAX_POSITION_SOL. Confidence > 1 is clamped down to 1 (it can never grow the
 * size); confidence ≤ 0 or NaN is rejected outright.
 */
export function approve(decision: Decision, portfolio: PortfolioState): RiskedOrder | RiskBlock {
  if (portfolio.killSwitchActive) {
    return { approved: false, mint: decision.mint, reason: 'kill_switch_active' };
  }

  if (decision.action !== 'BUY') {
    return { approved: false, mint: decision.mint, reason: 'not_a_buy' };
  }

  // Losses are negative P&L; block when realized losses reach the limit.
  if (portfolio.dailyRealizedPnlSol <= -DAILY_LOSS_LIMIT_SOL) {
    return { approved: false, mint: decision.mint, reason: 'daily_loss_limit' };
  }

  if (portfolio.openPositionsCount >= MAX_CONCURRENT) {
    return { approved: false, mint: decision.mint, reason: 'max_concurrent' };
  }

  // NaN fails both comparisons below via the explicit isNaN check; <= 0 means
  // the model expressed no conviction — nothing to size.
  if (Number.isNaN(decision.confidence) || decision.confidence <= 0) {
    return { approved: false, mint: decision.mint, reason: 'invalid_confidence' };
  }

  // Confidence may only SHRINK size below the cap, never grow it: clamp to 1
  // before multiplying, then hard-cap again as a belt-and-braces guard.
  const clampedConfidence = Math.min(decision.confidence, 1);
  const sizeSol = Math.min(MAX_POSITION_SOL * clampedConfidence, MAX_POSITION_SOL);

  return {
    approved: true,
    mint: decision.mint,
    sizeSol,
    confidence: clampedConfidence,
  };
}
