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
  | 'PUMPPORTAL_WS_URL'    // ingestion (Agent A) — wss://pumpportal.fun/api/data
  | 'PUMPPORTAL_API_KEY'   // ingestion (Agent A) — required for trade streams (ADR-007)
  | 'SOLANA_RPC_URL'       // enrichment + execution — keyed Helius RPC endpoint (ADR-008)
  | 'HELIUS_API_KEY'       // enrichment (Agent C) — primary data provider (ADR-008)
  | 'MORALIS_API_KEY'      // enrichment (Agent C) — optional secondary provider (ADR-008)
  | 'ANTHROPIC_API_KEY'    // decision (Agent D)
  | 'SOLANA_PRIVATE_KEY'   // execution/signer.ts ONLY — never read anywhere else, live mode only
  | 'DATABASE_URL'         // db layer
  // ── deploy / ops (optional; defaults preserve the local rig) ──────────────
  | 'PORT'                 // api bind port (Railway injects this); default 3001
  | 'API_HOST'             // api bind host; default 127.0.0.1 (set 0.0.0.0 on Railway)
  | 'API_TOKEN'            // when set, REST (except /health) + ws require this token
  | 'DASHBOARD_ORIGIN'     // extra CORS origin (the deployed dashboard URL)
  // ── filter tuning (optional; defaults are the SPEC strict strategy) ───────
  | 'FILTER_MIN_AGE_SEC'
  | 'FILTER_CURVE_MIN'
  | 'FILTER_CURVE_MAX'
  | 'FILTER_TOP10_MAX'
  | 'FILTER_DEV_SOLD_MAX'
  // ── exit tuning (optional; unset = SPEC default profile, see positions/) ──
  | 'EXIT_PROFILE'         // 'default' | 'scalp'; selects the exit threshold set
  | 'EXIT_TP_TRIGGER'      // take-profit trigger, fraction over entry (0.4 = +40%)
  | 'EXIT_TP_SELL'         // take-profit sell fraction (0.6 = sell 60%)
  | 'EXIT_TRAIL'           // trailing giveback from peak, fraction (0.15 = 15%)
  | 'EXIT_HARD_STOP'       // hard stop loss from entry, fraction (0.18 = −18%)
  | 'EXIT_TIME_STOP_SEC';  // time stop in seconds (480 = 8 min)

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

/**
 * Filter thresholds. The defaults below are the SPEC strict strategy; each can
 * be overridden by an env var so a validation run can be loosened WITHOUT a code
 * change (and tightened again for live by simply removing the override). Env is
 * read once at import — set it before the process starts (Railway does).
 */
export const defaultThresholds: FilterThresholds = {
  minAgeSeconds: numEnv('FILTER_MIN_AGE_SEC', 20 * 60),
  curveMinPct: numEnv('FILTER_CURVE_MIN', 55),
  curveMaxPct: numEnv('FILTER_CURVE_MAX', 85),
  top10MaxPct: numEnv('FILTER_TOP10_MAX', 25),
  devSoldMaxPct: numEnv('FILTER_DEV_SOLD_MAX', 50),
};

/** Where the API server binds. Defaults keep the local-only rig; Railway sets these. */
export function apiBindConfig(): { port: number; host: string } {
  const port = Number(optionalEnv('PORT'));
  const host = optionalEnv('API_HOST') ?? '127.0.0.1';
  return { port: Number.isFinite(port) && port > 0 ? port : 3001, host };
}

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

/** Read an optional numeric env var, falling back when unset or unparseable. */
export function numEnv(name: KnownEnvVar, fallback: number): number {
  const raw = optionalEnv(name);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}
