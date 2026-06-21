/**
 * Typed query helpers — the only sanctioned way Wave 2/3 modules touch tables.
 * All SQL is parameterized ($n); values are never interpolated into strings.
 */

import type {
  Decision,
  EnrichedCandidate,
  Position,
  RawTokenEvent,
} from '../core/types.js';
import { query } from './client.js';

/** Counters on daily_stats that can be bumped atomically. */
export type DailyStatCounter =
  | 'tokens_seen'
  | 'passed_filter'
  | 'enriched'
  | 'buys'
  | 'skips'
  | 'positions_opened'
  | 'risk_blocks'
  | 'kill_events';

const DAILY_COUNTERS: readonly DailyStatCounter[] = [
  'tokens_seen',
  'passed_filter',
  'enriched',
  'buys',
  'skips',
  'positions_opened',
  'risk_blocks',
  'kill_events',
];

export interface DailyStats {
  day: string;
  tokensSeen: number;
  passedFilter: number;
  enriched: number;
  buys: number;
  skips: number;
  positionsOpened: number;
  riskBlocks: number;
  killEvents: number;
  realizedPnlSol: number;
}

export interface KillState {
  active: boolean;
  reason: string;
  updatedAt: string;
}

/** What the filter's dev_repeat_rugger rule consumes (refined by enrichment over time). */
export interface CreatorHistory {
  launches: number;
}

/** UTC day (YYYY-MM-DD) for a unix-ms timestamp — daily_stats bucketing. */
export function utcDay(unixMs: number): string {
  return new Date(unixMs).toISOString().slice(0, 10);
}

/** Record a token seen on the stream (idempotent on mint). */
export async function insertRawToken(t: RawTokenEvent): Promise<void> {
  await query(
    `INSERT INTO raw_tokens (mint, creator, created_at, symbol, name, initial_buy_sol, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (mint) DO NOTHING`,
    [t.mint, t.creator, t.createdAt, t.symbol, t.name, t.initialBuySol, t.source],
  );
}

/** Log a Claude call with the exact input it judged. */
export async function insertDecision(d: Decision, snapshot: EnrichedCandidate): Promise<void> {
  await query(
    `INSERT INTO decisions (mint, input_snapshot, action, confidence, reasoning, latency_ms)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [d.mint, JSON.stringify(snapshot), d.action, d.confidence, d.reasoning, d.modelLatencyMs],
  );
}

/** Most recent decisions, latest first. */
export async function getDecisions(limit = 100): Promise<Decision[]> {
  const rows = await query<{
    mint: string;
    action: 'BUY' | 'SKIP';
    confidence: number;
    reasoning: string;
    latency_ms: number;
  }>(
    'SELECT mint, action, confidence, reasoning, latency_ms FROM decisions ORDER BY created_at DESC LIMIT $1',
    [limit],
  );
  return rows.map((r) => ({
    mint: r.mint,
    action: r.action,
    confidence: r.confidence,
    reasoning: r.reasoning,
    modelLatencyMs: r.latency_ms,
  }));
}

/** Insert or fully refresh a Position record (id is the natural key). */
export async function upsertPosition(p: Position): Promise<void> {
  await query(
    `INSERT INTO positions (id, mint, symbol, mode, entry_sol, entry_price, entry_at,
                            amount_tokens, status, exit_price, exit_at, exit_reason, realized_pnl_sol)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (id) DO UPDATE SET
       amount_tokens = EXCLUDED.amount_tokens,
       status = EXCLUDED.status,
       exit_price = EXCLUDED.exit_price,
       exit_at = EXCLUDED.exit_at,
       exit_reason = EXCLUDED.exit_reason,
       realized_pnl_sol = EXCLUDED.realized_pnl_sol`,
    [
      p.id,
      p.mint,
      p.symbol,
      p.mode,
      p.entrySol,
      p.entryPrice,
      p.entryAt,
      p.amountTokens,
      p.status,
      p.exitPrice ?? null,
      p.exitAt ?? null,
      p.exitReason ?? null,
      p.realizedPnlSol ?? null,
    ],
  );
}

interface PositionRow {
  id: string;
  mint: string;
  symbol: string;
  mode: 'paper' | 'live';
  entry_sol: number;
  entry_price: number;
  entry_at: string; // bigint comes back as string
  amount_tokens: number;
  status: 'open' | 'closed';
  exit_price: number | null;
  exit_at: string | null;
  exit_reason: Position['exitReason'] | null;
  realized_pnl_sol: number | null;
}

function rowToPosition(r: PositionRow): Position {
  const p: Position = {
    id: r.id,
    mint: r.mint,
    symbol: r.symbol,
    mode: r.mode,
    entrySol: r.entry_sol,
    entryPrice: r.entry_price,
    entryAt: Number(r.entry_at),
    amountTokens: r.amount_tokens,
    status: r.status,
  };
  if (r.exit_price !== null) p.exitPrice = r.exit_price;
  if (r.exit_at !== null) p.exitAt = Number(r.exit_at);
  if (r.exit_reason !== null && r.exit_reason !== undefined) p.exitReason = r.exit_reason;
  if (r.realized_pnl_sol !== null) p.realizedPnlSol = r.realized_pnl_sol;
  return p;
}

/** All open positions (risk concurrency checks, exit engine, UI). */
export async function getOpenPositions(): Promise<Position[]> {
  const rows = await query<PositionRow>("SELECT * FROM positions WHERE status = 'open'");
  return rows.map(rowToPosition);
}

/** Recently closed positions, latest exit first (history view). */
export async function getClosedPositions(limit = 100): Promise<Position[]> {
  const rows = await query<PositionRow>(
    "SELECT * FROM positions WHERE status = 'closed' ORDER BY exit_at DESC LIMIT $1",
    [limit],
  );
  return rows.map(rowToPosition);
}

/** Intra-trade price path captured by the exit engine at close. */
export interface PositionExcursionRecord {
  id: string;
  mint: string;
  entryPrice: number;
  peakPrice: number;
  troughPrice: number;
  peakAt: number;
  troughAt: number;
  closedAt: number;
}

/** Record a closed position's max-favorable/adverse excursion (idempotent on id). */
export async function upsertPositionExcursion(e: PositionExcursionRecord): Promise<void> {
  await query(
    `INSERT INTO position_excursion
       (position_id, mint, entry_price, peak_price, trough_price, peak_at, trough_at, closed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (position_id) DO UPDATE SET
       peak_price   = EXCLUDED.peak_price,
       trough_price = EXCLUDED.trough_price,
       peak_at      = EXCLUDED.peak_at,
       trough_at    = EXCLUDED.trough_at,
       closed_at    = EXCLUDED.closed_at`,
    [e.id, e.mint, e.entryPrice, e.peakPrice, e.troughPrice, e.peakAt, e.troughAt, e.closedAt],
  );
}

/** Joined excursion + position view for fill/slippage analysis (newest first). */
export interface ExcursionView {
  positionId: string;
  symbol: string;
  mint: string;
  entryPrice: number;
  exitPrice: number | null;
  exitReason: string | null;
  realizedPnlSol: number | null;
  entrySol: number;
  amountTokens: number;
  entryAt: number;
  exitAt: number | null;
  peakPrice: number;
  troughPrice: number;
  peakAt: number;
  troughAt: number;
}

/** Closed positions joined to their recorded price path (max favorable/adverse). */
export async function getPositionExcursions(limit = 1000): Promise<ExcursionView[]> {
  const rows = await query<{
    position_id: string;
    symbol: string;
    mint: string;
    entry_price: number;
    exit_price: number | null;
    exit_reason: string | null;
    realized_pnl_sol: number | null;
    entry_sol: number;
    amount_tokens: number;
    entry_at: string;
    exit_at: string | null;
    peak_price: number;
    trough_price: number;
    peak_at: string;
    trough_at: string;
  }>(
    `SELECT e.position_id, p.symbol, p.mint, p.entry_price, p.exit_price, p.exit_reason,
            p.realized_pnl_sol, p.entry_sol, p.amount_tokens, p.entry_at, p.exit_at,
            e.peak_price, e.trough_price, e.peak_at, e.trough_at
     FROM position_excursion e JOIN positions p ON p.id = e.position_id
     ORDER BY p.exit_at DESC NULLS LAST LIMIT $1`,
    [limit],
  );
  return rows.map((r) => ({
    positionId: r.position_id,
    symbol: r.symbol,
    mint: r.mint,
    entryPrice: r.entry_price,
    exitPrice: r.exit_price,
    exitReason: r.exit_reason,
    realizedPnlSol: r.realized_pnl_sol,
    entrySol: r.entry_sol,
    amountTokens: r.amount_tokens,
    entryAt: Number(r.entry_at),
    exitAt: r.exit_at === null ? null : Number(r.exit_at),
    peakPrice: r.peak_price,
    troughPrice: r.trough_price,
    peakAt: Number(r.peak_at),
    troughAt: Number(r.trough_at),
  }));
}

/** Atomically increment a daily_stats counter, creating the day row if needed. */
export async function bumpDailyStat(day: string, field: DailyStatCounter, by = 1): Promise<void> {
  if (!DAILY_COUNTERS.includes(field)) {
    // field is typed, but guard anyway: it is interpolated as an identifier.
    throw new Error(`Unknown daily stat counter: ${String(field)}`);
  }
  await query(
    `INSERT INTO daily_stats (day, ${field}) VALUES ($1, $2)
     ON CONFLICT (day) DO UPDATE SET ${field} = daily_stats.${field} + $2`,
    [day, by],
  );
}

/** Add realized P&L (positive or negative) to a day's total. */
export async function addRealizedPnl(day: string, pnlSol: number): Promise<void> {
  await query(
    `INSERT INTO daily_stats (day, realized_pnl_sol) VALUES ($1, $2)
     ON CONFLICT (day) DO UPDATE SET realized_pnl_sol = daily_stats.realized_pnl_sol + $2`,
    [day, pnlSol],
  );
}

/** A day's stats, or undefined if nothing happened that day. */
export async function getDailyStats(day: string): Promise<DailyStats | undefined> {
  const rows = await query<{
    day: string;
    tokens_seen: number;
    passed_filter: number;
    enriched: number;
    buys: number;
    skips: number;
    positions_opened: number;
    risk_blocks: number;
    kill_events: number;
    realized_pnl_sol: number;
  }>('SELECT * FROM daily_stats WHERE day = $1', [day]);
  const r = rows[0];
  if (!r) return undefined;
  return {
    day,
    tokensSeen: r.tokens_seen,
    passedFilter: r.passed_filter,
    enriched: r.enriched,
    buys: r.buys,
    skips: r.skips,
    positionsOpened: r.positions_opened,
    riskBlocks: r.risk_blocks,
    killEvents: r.kill_events,
    realizedPnlSol: r.realized_pnl_sol,
  };
}

/** Current kill switch state (the single kill_state row). */
export async function getKillState(): Promise<KillState> {
  const rows = await query<{ active: boolean; reason: string; updated_at: string }>(
    'SELECT active, reason, updated_at FROM kill_state WHERE id = 1',
  );
  const r = rows[0];
  if (!r) throw new Error('kill_state row missing — migrations not applied?');
  return { active: r.active, reason: r.reason, updatedAt: String(r.updated_at) };
}

/** Flip the kill switch (risk/ and the API are the only callers). */
export async function setKillState(active: boolean, reason: string): Promise<void> {
  await query('UPDATE kill_state SET active = $1, reason = $2, updated_at = now() WHERE id = 1', [
    active,
    reason,
  ]);
}

/** How many launches we've seen from a creator (dev_repeat_rugger input). */
export async function getCreatorHistory(creator: string): Promise<CreatorHistory> {
  const rows = await query<{ launches: string }>(
    'SELECT count(*)::text AS launches FROM raw_tokens WHERE creator = $1',
    [creator],
  );
  return { launches: Number(rows[0]?.launches ?? 0) };
}
