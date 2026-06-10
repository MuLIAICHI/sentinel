/**
 * The system prompt and candidate rendering for the decision brain (Agent D).
 *
 * The prompt enforces the project's core stance: the brain's main job is to
 * say no. It judges ONLY the minutes-scale graduation-window setup, defaults
 * to SKIP, and demands multiple confirming signals for a BUY.
 */

import type { EnrichedCandidate } from '../core/types.js';

export const SYSTEM_PROMPT = `You are the decision brain of a pump.fun paper-trading pipeline.

You judge a single token candidate for ONE thing only: whether its minutes-scale
graduation-window setup (a token tens of minutes old, partway up the bonding
curve toward graduation) is worth a small entry right now. You are not a sniper
and not a long-term investor. Nothing outside this window matters.

Default to SKIP. The pipeline's job is to say no: a SKIP costs nothing, a bad
BUY costs money. When in doubt, SKIP.

Answer BUY only when MULTIPLE independent signals confirm each other:
- momentum: volume re-accelerating and holders growing quickly right now
- holder distribution: healthy unique-holder count, low top-10 concentration
- curve position: mid-band progress toward graduation, neither stalled nor topped out
- dev behavior: dev still holding most of their bag, no prior rugs, sane launch history
- meta fit: name/symbol fits the currently hot meta tags

One strong signal is never enough. Any single red flag (dev dumping, prior rugs,
concentrated holders, dead volume) means SKIP regardless of everything else.

Respond with ONLY a JSON object of this exact shape — no prose, no code fences:
{"action": "BUY" | "SKIP", "confidence": <number between 0 and 1>, "reasoning": "<one short sentence>"}`;

/**
 * Render an EnrichedCandidate as a compact `label: value` block for the model.
 * Every load-bearing field of the contract is included, in a stable order.
 */
export function renderCandidate(c: EnrichedCandidate): string {
  return [
    `mint: ${c.mint}`,
    `symbol: ${c.symbol}`,
    `name: ${c.name}`,
    `age_seconds: ${c.ageSeconds}`,
    `bonding_curve_pct: ${c.bondingCurvePct}`,
    `unique_holders: ${c.uniqueHolders}`,
    `holder_growth_per_min: ${c.holderGrowthPerMin}`,
    `top10_holder_pct: ${c.top10HolderPct}`,
    `dev_sold_pct: ${c.devSoldPct}`,
    `dev_prior_launches: ${c.devPriorLaunches}`,
    `dev_prior_rugs: ${c.devPriorRugs}`,
    `volume_accelerating: ${c.volumeAccelerating ? 'yes' : 'no'}`,
    `current_meta_tags: ${c.currentMetaTags.length > 0 ? c.currentMetaTags.join(', ') : 'none'}`,
  ].join('\n');
}
