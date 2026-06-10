/**
 * Config: filter thresholds with SPEC defaults, and the ONLY sanctioned way to
 * read environment variables.
 *
 * Hard rule: this project never reads, touches, or creates `.env` files — no
 * dotenv, no file parsing. Values come from `process.env` only; a missing
 * required variable produces an error that names it so the human can be asked
 * for it by name.
 */

/** Every env var the system may use. Asking for anything else is a contract violation. */
export type KnownEnvVar =
  | 'PUMPPORTAL_WS_URL'   // ingestion (Agent A)
  | 'SOLANA_RPC_URL'      // enrichment (Agent C)
  | 'INDEXER_API_KEY'     // enrichment (Agent C) — final name set by chosen provider
  | 'ANTHROPIC_API_KEY'   // decision (Agent D)
  | 'DATABASE_URL';       // db layer

/** Thresholds for the deterministic filter rules (SPEC §4, filter/ section). */
export interface FilterThresholds {
  /** age_too_young — reject tokens younger than this. SPEC: ~20 min. */
  minAgeSeconds: number;
  /** bonding_curve_out_of_band — accept only inside [curveMinPct, curveMaxPct]. SPEC: 55–85. */
  curveMinPct: number;
  curveMaxPct: number;
  /** holder_concentration — reject if top-10 holders own more than this. SPEC: ~25%. */
  top10MaxPct: number;
  /** dev_dumped — reject if the dev sold more than this share of their bag. */
  devSoldMaxPct: number;
}

export const defaultThresholds: FilterThresholds = {
  minAgeSeconds: 20 * 60,
  curveMinPct: 55,
  curveMaxPct: 85,
  top10MaxPct: 25,
  devSoldMaxPct: 50,
};

/**
 * Read a required env var. Throws an error naming the variable and what to do
 * about it — never a vague "config error".
 */
export function requireEnv(name: KnownEnvVar): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        `Per project rules agents never touch .env — ask the human to populate ${name}.`,
    );
  }
  return value;
}

/** Read an optional env var; returns undefined when unset. */
export function optionalEnv(name: KnownEnvVar): string | undefined {
  const value = process.env[name];
  return value === undefined || value === '' ? undefined : value;
}
