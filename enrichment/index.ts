/**
 * enrich(candidate, deps) — turn a filter survivor into an EnrichedCandidate.
 *
 * Composition, by cost (cheap first, so a cheap failure spends no credits):
 * 1. creator history (DB, free) → devPriorLaunches
 * 2. meta tags (DB, free) — injectable, defaults to the 6h raw_tokens scan
 * 3. volumeAccelerating + bondingCurvePct — INJECTED functions backed by
 *    ingestion's in-memory ring buffer / stream state. We never import
 *    ingestion/ (hard rule); the orchestrator wires these at boot.
 * 4. provider.holderSnapshot (≤50 Helius credits)
 * 5. provider.devActivity (≤16 Helius credits)
 *
 * Field notes (documented data-quality gaps):
 * - devPriorLaunches = launches − 1 from getCreatorHistory (the candidate's
 *   own launch doesn't count as "prior"), floored at 0.
 * - devPriorRugs = 0 for now — rug labeling requires position/outcome data
 *   that doesn't exist yet; future enrichment will derive it from closed
 *   positions + curve collapses. Documented so the model isn't lied to:
 *   0 means "unknown", not "clean".
 * - holderGrowthPerMin = 0 in v1 — growth needs two holder samples; see
 *   enrichment/meta.ts. The orchestrator can sample twice later.
 *
 * Failure contract: any error → log + return null (candidate dropped). This
 * function NEVER throws through; a flaky provider must not crash the pipeline.
 * On success it emits {type:'candidate_enriched'} on the bus.
 */

import { bus as defaultBus, type Bus } from '../core/bus.js';
import { createLogger } from '../core/logger.js';
import type { Candidate, EnrichedCandidate } from '../core/types.js';
import { getCreatorHistory, type CreatorHistory } from '../db/queries.js';
import { holderGrowthPerMin, loadCurrentMetaTags } from './meta.js';
import type { DataProvider } from './provider.js';

const log = createLogger('enrichment/index');

export interface EnrichDeps {
  /** The on-chain data seam (Helius today, Moralis later). */
  provider: DataProvider;
  /**
   * Volume re-acceleration signal from ingestion's trade ring buffer.
   * Injected — never imported (Wave 2 modules don't import each other).
   */
  volumeAccelerating: (mint: string) => boolean;
  /**
   * Bonding-curve progress 0..100 from ingestion's stream state (PumpPortal
   * trade events carry the curve reserves). Injected for the same reason.
   */
  bondingCurvePct: (mint: string) => number;
  /** Override for tests; defaults to the DB-backed getCreatorHistory. */
  creatorHistory?: (creator: string) => Promise<CreatorHistory>;
  /** Override for tests; defaults to loadCurrentMetaTags (6h raw_tokens). */
  metaTags?: () => string[] | Promise<string[]>;
  /** Override for tests; defaults to the process-wide singleton bus. */
  bus?: Bus;
}

export async function enrich(
  candidate: Candidate,
  deps: EnrichDeps,
): Promise<EnrichedCandidate | null> {
  const bus = deps.bus ?? defaultBus;
  try {
    // Cheap, local/DB signals first — spend no provider credits on a candidate
    // we can't even contextualize.
    const history = await (deps.creatorHistory ?? getCreatorHistory)(candidate.creator);
    const currentMetaTags = await (deps.metaTags ?? loadCurrentMetaTags)();
    const volumeAccelerating = deps.volumeAccelerating(candidate.mint);
    const bondingCurvePct = deps.bondingCurvePct(candidate.mint);

    // Provider calls — the expensive part, survivors only.
    const holders = await deps.provider.holderSnapshot(candidate.mint);
    const dev = await deps.provider.devActivity(candidate.creator, candidate.mint);

    const enriched: EnrichedCandidate = {
      ...candidate,
      bondingCurvePct,
      uniqueHolders: holders.uniqueHolders,
      holderGrowthPerMin: holderGrowthPerMin(), // 0 in v1 — single sample (see meta.ts)
      top10HolderPct: holders.top10HolderPct,
      devSoldPct: dev.devSoldPct,
      devPriorLaunches: Math.max(0, history.launches - 1),
      devPriorRugs: 0, // unknown until position outcomes exist — see module docs
      volumeAccelerating,
      currentMetaTags,
    };

    bus.emit({ type: 'candidate_enriched', payload: enriched });
    log.info('candidate enriched', {
      mint: candidate.mint,
      uniqueHolders: enriched.uniqueHolders,
      top10HolderPct: enriched.top10HolderPct,
      devSoldPct: enriched.devSoldPct,
    });
    return enriched;
  } catch (err) {
    log.warn('enrichment failed — dropping candidate', {
      mint: candidate.mint,
      error: String(err),
    });
    return null;
  }
}

export type { DataProvider, DevActivity, HolderSnapshot } from './provider.js';
export { HOLDER_COUNT_CAP, ProviderError } from './provider.js';
export { createHeliusProvider, HeliusProvider } from './helius.js';
export { computeMetaTags, holderGrowthPerMin, loadCurrentMetaTags, META_WINDOW_MS } from './meta.js';
