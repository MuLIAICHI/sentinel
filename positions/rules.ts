/**
 * Mechanical exit rules — pure functions, no I/O, no clock, no LLM. Ever.
 *
 * Each rule is evaluated per price tick over an immutable {@link RuleInput}
 * snapshot. `evaluateExit` runs them in strict precedence order and returns
 * the single winning {@link ExitAction} for that tick:
 *
 *   kill_switch > hard_stop > time_stop > trailing_stop > take_profit
 *
 * Thresholds and defaults come from docs/SPEC.md §4 (`positions/` section):
 * take profit sells 50% at +80%, trailing stop gives back 25% from peak,
 * hard stop at −35%, time stop at 45 minutes, kill switch flattens always.
 */

import type { Position } from '../core/types.js';

/** A concrete exit reason (the optional `Position.exitReason` made required). */
export type ExitReason = NonNullable<Position['exitReason']>;

/**
 * Exit-rule thresholds. All percentage fields are fractions (0.8 = 80%).
 * Defaults in {@link defaultExitConfig} are the SPEC §4 values.
 */
export interface ExitConfig {
  /** Gain over entry that triggers the take-profit partial. SPEC: +80%. */
  takeProfitTriggerPct: number;
  /** Fraction of current holdings sold when take profit fires. SPEC: 50%. */
  takeProfitSellFraction: number;
  /** Give-back from peak that triggers the trailing stop. SPEC: 25%. */
  trailingGivebackPct: number;
  /** Loss from entry that triggers the hard stop. SPEC: −35%. */
  hardStopPct: number;
  /** Maximum hold time after entry before the time stop flattens. SPEC: 45 min. */
  timeStopMs: number;
}

/** SPEC §4 defaults: +80% TP (sell 50%), 25% trail, −35% hard stop, 45 min time stop. */
export const defaultExitConfig: ExitConfig = {
  takeProfitTriggerPct: 0.8,
  takeProfitSellFraction: 0.5,
  trailingGivebackPct: 0.25,
  hardStopPct: 0.35,
  timeStopMs: 45 * 60 * 1000,
};

/**
 * Fast momentum "scalp" profile (experimental, paper-only). The 2026-06
 * backtest found the bonding curve is parabolic-then-fade on a minutes
 * timescale and our 20-min entry lands after the peak 72% of the time. Paired
 * with an earlier entry (FILTER_MIN_AGE_SEC), this profile rides the spike and
 * bails on the first fade: take a bigger partial sooner, trail tight, stop
 * tight, and cap the hold at minutes — NOT the SPEC survivor regime.
 */
export const scalpExitConfig: ExitConfig = {
  takeProfitTriggerPct: 0.4,
  takeProfitSellFraction: 0.6,
  trailingGivebackPct: 0.15,
  hardStopPct: 0.18,
  timeStopMs: 8 * 60 * 1000,
};

/** Named exit profiles selectable at boot (via EXIT_PROFILE). */
const EXIT_PROFILES: Record<string, ExitConfig> = {
  default: defaultExitConfig,
  scalp: scalpExitConfig,
};

/**
 * Pick an exit profile by name and apply optional per-field overrides — pure,
 * no I/O. Unknown/undefined `profile` falls back to {@link defaultExitConfig}
 * (the SPEC strategy stays the safe default). `overrides` lets a run tune any
 * field without a code change; only defined fields override the base profile.
 */
export function selectExitConfig(
  profile: string | undefined,
  overrides?: Partial<ExitConfig>,
): ExitConfig {
  const base = (profile && EXIT_PROFILES[profile]) || defaultExitConfig;
  if (!overrides) return { ...base };
  const merged: ExitConfig = { ...base };
  for (const key of Object.keys(overrides) as Array<keyof ExitConfig>) {
    const v = overrides[key];
    if (v !== undefined) merged[key] = v;
  }
  return merged;
}

/** Everything a rule may look at for one tick. Rules never reach outside this. */
export interface RuleInput {
  /** The open position being evaluated. */
  position: Position;
  /** Latest traded price (SOL per token). */
  currentPrice: number;
  /** Highest price seen since entry, including this tick. */
  peakPrice: number;
  /** Tick timestamp (unix ms) — injected, never read from Date.now() here. */
  nowMs: number;
  /** Whether the take-profit partial already fired for this position. */
  takenProfit: boolean;
  /** Whether the global kill switch is active. */
  killSwitchActive: boolean;
  /** Thresholds to evaluate against. */
  config: ExitConfig;
}

/**
 * The decision for one tick. `fraction` is the share of the position's
 * CURRENT holdings (`amountTokens`) to sell, in (0, 1].
 */
export type ExitAction =
  | { kind: 'none' }
  | { kind: 'sell'; fraction: number; reason: ExitReason };

const NONE: ExitAction = { kind: 'none' };

/** Kill switch: flatten everything immediately while active. Unconditional. */
export function checkKillSwitch(input: RuleInput): ExitAction {
  return input.killSwitchActive ? { kind: 'sell', fraction: 1, reason: 'kill_switch' } : NONE;
}

/** Hard stop: sell everything at or below −35% from entry (SPEC §4). */
export function checkHardStop(input: RuleInput): ExitAction {
  const floor = input.position.entryPrice * (1 - input.config.hardStopPct);
  return input.currentPrice <= floor ? { kind: 'sell', fraction: 1, reason: 'hard_stop' } : NONE;
}

/** Time stop: sell everything once 45 minutes have elapsed since entry (SPEC §4). */
export function checkTimeStop(input: RuleInput): ExitAction {
  const expired = input.nowMs - input.position.entryAt >= input.config.timeStopMs;
  return expired ? { kind: 'sell', fraction: 1, reason: 'time_stop' } : NONE;
}

/**
 * Trailing stop: once a peak above entry exists, sell the remainder when price
 * gives back 25% from that peak (SPEC §4). Armed only when `peakPrice` is
 * strictly above entry — otherwise a flat position's −25% would pre-empt the
 * −35% hard stop, which is the hard stop's job.
 */
export function checkTrailingStop(input: RuleInput): ExitAction {
  if (input.peakPrice <= input.position.entryPrice) return NONE;
  const trigger = input.peakPrice * (1 - input.config.trailingGivebackPct);
  return input.currentPrice <= trigger
    ? { kind: 'sell', fraction: 1, reason: 'trailing_stop' }
    : NONE;
}

/**
 * Take profit: at +80% from entry, sell 50% of current holdings — once per
 * position (SPEC §4). `takenProfit` guards the once-only behavior.
 */
export function checkTakeProfit(input: RuleInput): ExitAction {
  if (input.takenProfit) return NONE;
  const trigger = input.position.entryPrice * (1 + input.config.takeProfitTriggerPct);
  return input.currentPrice >= trigger
    ? { kind: 'sell', fraction: input.config.takeProfitSellFraction, reason: 'take_profit' }
    : NONE;
}

/** Rules in precedence order — first sell action wins the tick. */
const RULES_IN_PRECEDENCE: ReadonlyArray<(input: RuleInput) => ExitAction> = [
  checkKillSwitch,
  checkHardStop,
  checkTimeStop,
  checkTrailingStop,
  checkTakeProfit,
];

/**
 * Evaluate all exit rules for one tick and return the single winning action.
 *
 * Precedence when several trigger on the same tick:
 * kill_switch > hard_stop > time_stop > trailing_stop > take_profit.
 */
export function evaluateExit(input: RuleInput): ExitAction {
  for (const rule of RULES_IN_PRECEDENCE) {
    const action = rule(input);
    if (action.kind === 'sell') return action;
  }
  return NONE;
}
