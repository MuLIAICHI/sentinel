/**
 * Deterministic filter rules — the cheap kill layer (SPEC §4, `filter/`).
 *
 * Every rule is a pure function: no I/O, no network, no LLM, no DB. Each rule
 * takes exactly the data it consumes (honest signatures) plus the threshold
 * config, and returns its rule id on failure or `null` on pass. Thresholds are
 * NEVER hardcoded in rule bodies — they always arrive via the
 * `FilterThresholds` parameter (defaults live in `core/config.ts`).
 */

import type { FilterThresholds } from '../core/config.js';

/** All rule ids the filter can emit, in evaluation order. */
export const RULE_IDS = [
  'age_too_young',
  'dev_repeat_rugger',
  'bonding_curve_out_of_band',
  'holder_concentration',
  'dev_dumped',
  'dead_volume',
] as const;

/** A filter rule identifier — the strings that appear in `FilterResult.failedRules`. */
export type RuleId = (typeof RULE_IDS)[number];

/**
 * Reject tokens younger than `thresholds.minAgeSeconds` (~20 min by default).
 * We deliberately skip the sniper bloodbath. A token exactly at the threshold
 * passes (strictly-younger fails).
 *
 * Consumes: `Candidate.ageSeconds`.
 */
export function age_too_young(
  ageSeconds: number,
  thresholds: FilterThresholds,
): RuleId | null {
  return ageSeconds < thresholds.minAgeSeconds ? 'age_too_young' : null;
}

/**
 * Reject creators that appear in the known-bad set. The set is supplied by the
 * caller (seeded from enrichment / DB over time) — this function never touches
 * the DB itself. Takes no threshold: membership is binary.
 *
 * Consumes: `Candidate.creator` + the caller-provided known-bad set.
 */
export function dev_repeat_rugger(
  creator: string,
  knownBadCreators: ReadonlySet<string>,
): RuleId | null {
  return knownBadCreators.has(creator) ? 'dev_repeat_rugger' : null;
}

/**
 * Reject tokens whose bonding-curve progress is outside the
 * `[curveMinPct, curveMaxPct]` window (55–85 by default). Both bounds are
 * inclusive: exactly-at-bound passes.
 *
 * Consumes: enriched-style `bondingCurvePct` (0..100), delivered via context.
 */
export function bonding_curve_out_of_band(
  bondingCurvePct: number,
  thresholds: FilterThresholds,
): RuleId | null {
  return bondingCurvePct < thresholds.curveMinPct || bondingCurvePct > thresholds.curveMaxPct
    ? 'bonding_curve_out_of_band'
    : null;
}

/**
 * Reject tokens where the top-10 holders own more than `thresholds.top10MaxPct`
 * (~25% by default). Exactly-at-threshold passes (strictly-greater fails).
 *
 * Consumes: enriched-style `top10HolderPct` (0..100), delivered via context.
 */
export function holder_concentration(
  top10HolderPct: number,
  thresholds: FilterThresholds,
): RuleId | null {
  return top10HolderPct > thresholds.top10MaxPct ? 'holder_concentration' : null;
}

/**
 * Reject tokens whose dev has sold more than `thresholds.devSoldMaxPct` of
 * their bag (50% by default). Exactly-at-threshold passes (strictly-greater fails).
 *
 * Consumes: enriched-style `devSoldPct` (0..100), delivered via context.
 */
export function dev_dumped(
  devSoldPct: number,
  thresholds: FilterThresholds,
): RuleId | null {
  return devSoldPct > thresholds.devSoldMaxPct ? 'dev_dumped' : null;
}

/**
 * Reject tokens with no volume re-acceleration. Takes no threshold: the
 * acceleration signal is computed upstream and arrives as a boolean.
 *
 * Consumes: enriched-style `volumeAccelerating`, delivered via context.
 */
export function dead_volume(volumeAccelerating: boolean): RuleId | null {
  return volumeAccelerating ? null : 'dead_volume';
}
