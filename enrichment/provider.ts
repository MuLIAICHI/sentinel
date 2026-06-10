/**
 * The data-provider seam (ADR-008).
 *
 * Every on-chain question the enrichment layer asks goes through this
 * interface. Helius (free tier) is the primary implementation today
 * (`enrichment/helius.ts`); a Moralis adapter can slot in later by
 * implementing the same interface WITH THE SAME SEMANTICS — the semantics
 * below are part of the contract, not implementation details.
 *
 * ## holderSnapshot(mint) semantics
 *
 * - `uniqueHolders`: count of distinct OWNER wallets holding a non-zero
 *   balance of the mint (token accounts are aggregated per owner). The count
 *   is CAPPED at {@link HOLDER_COUNT_CAP} (5000): an adapter may stop
 *   paginating once it has seen that many token accounts and report exactly
 *   5000, meaning "at least 5000". Filters only care about small counts, so
 *   the cap loses nothing and bounds API spend.
 * - `top10HolderPct`: share (0..100) of the observed circulating supply held
 *   by the 10 largest owners EXCLUDING the single largest owner. Rationale:
 *   for pre-graduation pump.fun tokens the largest token account is the
 *   bonding-curve reserve itself; including it would put every token over any
 *   sane concentration threshold. The denominator is the observed total minus
 *   that largest owner's balance ("observed circulating"). When the holder
 *   list is truncated at the cap, the figure is computed from what was
 *   fetched — a lower-bound, monotone signal, documented and accepted.
 *
 * ## devActivity(creator, mint) semantics
 *
 * - `devSoldPct`: ESTIMATED share (0..100) of the creator's initial bag of
 *   the mint that has been sold, derived from the creator's recent
 *   transaction history. Adapters use a peak-vs-latest heuristic (see
 *   `enrichment/helius.ts`); perfect accuracy is not required — the value
 *   must be monotone in actual selling (more selling never lowers it) and
 *   default to 0 when no activity is observable.
 *
 * ## Errors
 *
 * Adapters throw {@link ProviderError} (never raw fetch errors) so callers
 * can branch on `kind`. `enrich()` treats any throw as "drop the candidate".
 */

/** Pagination/spend cap: never enumerate more holders than this. */
export const HOLDER_COUNT_CAP = 5000;

export interface HolderSnapshot {
  /** Distinct non-zero owner wallets, capped at HOLDER_COUNT_CAP ("5000+"). */
  uniqueHolders: number;
  /** 0..100 — top-10 owner concentration, largest owner (curve) excluded. */
  top10HolderPct: number;
}

export interface DevActivity {
  /** 0..100 — estimated fraction of the dev's initial bag that was sold. */
  devSoldPct: number;
}

export interface DataProvider {
  holderSnapshot(mint: string): Promise<HolderSnapshot>;
  devActivity(creator: string, mint: string): Promise<DevActivity>;
}

/** Why a provider call failed, for callers that want to branch. */
export type ProviderErrorKind =
  | 'timeout' // request exceeded the configured timeout
  | 'rate_limited' // 429 persisted through retries
  | 'http' // non-2xx other than 429
  | 'bad_response' // 2xx but unparseable / JSON-RPC error object
  | 'network'; // fetch itself rejected (DNS, conn reset, ...)

export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}
