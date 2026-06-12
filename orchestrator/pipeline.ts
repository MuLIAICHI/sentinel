/**
 * The evaluation chain for one ripe candidate. Order is FIXED (SPEC §4, rule
 * T1) and risk.approve is never bypassed:
 *
 *   cheap filter → enrich → full filter → decide → risk.approve → execute.buy
 *
 * Every dependency is injected so the chain is fully testable; the real wiring
 * happens once in orchestrator/index.ts. Every exit path returns a tagged
 * PipelineOutcome — nothing fails silently.
 */

import type { Bus } from '../core/bus.js';
import type { Candidate, EnrichedCandidate, Decision, FilterResult, Position } from '../core/types.js';
import type { FilterContext } from '../filter/index.js';
import type { PortfolioState, RiskBlock, RiskedOrder } from '../risk/index.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('orchestrator/pipeline');

/** Where a candidate's journey ended. */
export type PipelineOutcome =
  | 'cheap_reject'
  | 'enrich_failed'
  | 'full_reject'
  | 'skip'
  | 'risk_block'
  | 'buy_failed'
  | 'opened';

export interface PipelineDeps {
  /** Pre-enrichment filter pass (cheap context — typically just the age rule). */
  cheapFilter: (candidate: Candidate, context: FilterContext) => FilterResult;
  /** Enrichment; resolves null on any provider failure (its contract). */
  enrich: (candidate: Candidate) => Promise<EnrichedCandidate | null>;
  /** Post-enrichment filter pass over the full FilterContext. */
  fullFilter: (candidate: Candidate, context: FilterContext) => FilterResult;
  /** The Claude brain; never rejects (its contract). */
  decide: (enriched: EnrichedCandidate) => Promise<Decision>;
  /** Live portfolio snapshot for the risk gate. */
  getPortfolio: () => Promise<PortfolioState>;
  /** THE risk gate — the only entity that can authorize an entry. */
  approve: (decision: Decision, portfolio: PortfolioState) => RiskedOrder | RiskBlock;
  /** Execute an approved entry (paper today). Throws when no price is known. */
  buy: (order: RiskedOrder, symbol?: string) => Promise<Position>;
  /** Bus for candidate_filtered / risk_block events. */
  bus: Bus;
}

/** Map the enriched fields into the filter's context shape (full pass). */
export function toFilterContext(enriched: EnrichedCandidate): FilterContext {
  return {
    bondingCurvePct: enriched.bondingCurvePct,
    top10HolderPct: enriched.top10HolderPct,
    devSoldPct: enriched.devSoldPct,
    volumeAccelerating: enriched.volumeAccelerating,
    // knownBadCreators: empty in v1 — rug labeling needs position-outcome
    // history that does not exist yet (enrichment handoff).
    knownBadCreators: new Set<string>(),
  };
}

/** Run one candidate through the whole chain. Never throws. */
export async function evaluateCandidate(
  candidate: Candidate,
  deps: PipelineDeps,
): Promise<PipelineOutcome> {
  const { mint } = candidate;
  try {
    // Stage 1 — cheap deterministic kill (no I/O spent yet).
    const cheap = deps.cheapFilter(candidate, {});
    deps.bus.emit({ type: 'candidate_filtered', payload: { candidate, result: cheap } });
    if (!cheap.passed) {
      log.debug('cheap reject', { mint, failedRules: cheap.failedRules });
      return 'cheap_reject';
    }

    // Stage 2 — paid enrichment (filter survivors only: cost control).
    const enriched = await deps.enrich(candidate);
    if (enriched === null) {
      log.warn('enrichment failed, dropping candidate', { mint });
      return 'enrich_failed';
    }

    // Stage 3 — full filter over on-chain context.
    const full = deps.fullFilter(candidate, toFilterContext(enriched));
    deps.bus.emit({ type: 'candidate_filtered', payload: { candidate, result: full } });
    if (!full.passed) {
      log.info('full reject', { mint, failedRules: full.failedRules });
      return 'full_reject';
    }

    // Stage 4 — the brain. Emits + persists internally; never rejects.
    const decision = await deps.decide(enriched);
    if (decision.action !== 'BUY') {
      return 'skip';
    }

    // Stage 5 — the boss. approve() is pure; we gather state and relay verdicts.
    const portfolio = await deps.getPortfolio();
    const verdict = deps.approve(decision, portfolio);
    if (!verdict.approved) {
      deps.bus.emit({ type: 'risk_block', payload: { mint, reason: verdict.reason } });
      log.info('risk block', { mint, reason: verdict.reason });
      return 'risk_block';
    }

    // Stage 6 — execution (paper). position_opened is emitted by the executor.
    try {
      const position = await deps.buy(verdict, candidate.symbol);
      log.info('position opened', { mint, id: position.id, sizeSol: verdict.sizeSol });
      return 'opened';
    } catch (err) {
      log.error('buy failed', { mint, error: String(err) });
      return 'buy_failed';
    }
  } catch (err) {
    // Belt and braces: no single candidate may kill the loop.
    log.error('pipeline stage threw unexpectedly', { mint, error: String(err) });
    return 'enrich_failed';
  }
}
