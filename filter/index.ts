/**
 * Filter module entry point — composes the deterministic rules into
 * `evaluate(candidate, context, thresholds?) → FilterResult` (SPEC §4, `filter/`).
 *
 * Pure and deterministic: no I/O, no network, no LLM, no DB. Anything the
 * rules need beyond the `Candidate` itself (curve %, holder concentration,
 * dev-sold %, volume acceleration, the known-bad-creator set) is delivered by
 * the caller through `FilterContext`.
 */

import type { Candidate, FilterResult } from '../core/types.js';
import type { FilterThresholds } from '../core/config.js';
import { defaultThresholds } from '../core/config.js';
import {
  age_too_young,
  bonding_curve_out_of_band,
  dead_volume,
  dev_dumped,
  dev_repeat_rugger,
  holder_concentration,
} from './rules.js';
import type { RuleId } from './rules.js';

export { RULE_IDS } from './rules.js';
export type { RuleId } from './rules.js';
export {
  age_too_young,
  bonding_curve_out_of_band,
  dead_volume,
  dev_dumped,
  dev_repeat_rugger,
  holder_concentration,
};

/**
 * Caller-supplied data the rules consume beyond the bare `Candidate`.
 *
 * Every field is optional ON PURPOSE: the filter runs both pre-enrichment
 * (only `Candidate` fields + maybe the known-bad set are available) and
 * post-enrichment (everything is available). A rule whose context data is
 * absent is SKIPPED — it neither passes nor fails the candidate, because
 * inventing a verdict from missing data would be a lie in the UI funnel.
 * The orchestrator decides when each piece of context becomes available.
 */
export interface FilterContext {
  /**
   * Creators known to have rugged before (seeded from enrichment/DB over
   * time, e.g. via `db/queries.ts` getCreatorHistory — but the DB read happens
   * upstream, never here). Absent ⇒ `dev_repeat_rugger` is skipped.
   */
  knownBadCreators?: ReadonlySet<string>;
  /** Bonding-curve progress 0..100. Absent ⇒ `bonding_curve_out_of_band` is skipped. */
  bondingCurvePct?: number;
  /** Top-10 holder concentration 0..100. Absent ⇒ `holder_concentration` is skipped. */
  top10HolderPct?: number;
  /** Share of the dev's bag already sold, 0..100. Absent ⇒ `dev_dumped` is skipped. */
  devSoldPct?: number;
  /** Volume re-acceleration signal. Absent ⇒ `dead_volume` is skipped. */
  volumeAccelerating?: boolean;
}

/**
 * Run ALL filter rules against a candidate and collect EVERY failed rule id —
 * the UI funnel needs the complete list of reasons a candidate died, so we
 * never short-circuit on the first failure.
 *
 * Rules whose required context data is absent are skipped (see
 * `FilterContext`). `age_too_young` always runs (it only needs the
 * `Candidate`). Thresholds default to `defaultThresholds` from
 * `core/config.ts`; pass an override for tuning or tests.
 */
export function evaluate(
  candidate: Candidate,
  context: FilterContext,
  thresholds: FilterThresholds = defaultThresholds,
): FilterResult {
  const verdicts: Array<RuleId | null> = [
    age_too_young(candidate.ageSeconds, thresholds),
    context.knownBadCreators === undefined
      ? null
      : dev_repeat_rugger(candidate.creator, context.knownBadCreators),
    context.bondingCurvePct === undefined
      ? null
      : bonding_curve_out_of_band(context.bondingCurvePct, thresholds),
    context.top10HolderPct === undefined
      ? null
      : holder_concentration(context.top10HolderPct, thresholds),
    context.devSoldPct === undefined ? null : dev_dumped(context.devSoldPct, thresholds),
    context.volumeAccelerating === undefined
      ? null
      : dead_volume(context.volumeAccelerating),
  ];

  const failedRules = verdicts.filter((v): v is RuleId => v !== null);
  return { passed: failedRules.length === 0, failedRules };
}
