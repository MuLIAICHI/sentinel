/**
 * Wire-type mirrors for the dashboard.
 *
 * SOURCE OF TRUTH: ../../core/types.ts (BotEvent / Decision / Position) and
 * ../../db/queries.ts (DailyStats / KillState). These are hand-mirrored rather
 * than imported because the UI is a separate package tree with its own build;
 * if the backend contracts change, update these to match. The shapes are frozen
 * by ADR-001, so drift should be rare.
 */

export interface RawTokenEvent {
  mint: string;
  creator: string;
  createdAt: number;
  symbol: string;
  name: string;
  initialBuySol: number;
  source: 'pumpportal';
}

export interface Candidate {
  mint: string;
  creator: string;
  createdAt: number;
  ageSeconds: number;
  symbol: string;
  name: string;
}

export interface FilterResult {
  passed: boolean;
  failedRules: string[];
}

export interface EnrichedCandidate extends Candidate {
  bondingCurvePct: number;
  uniqueHolders: number;
  holderGrowthPerMin: number;
  top10HolderPct: number;
  devSoldPct: number;
  devPriorLaunches: number;
  devPriorRugs: number;
  volumeAccelerating: boolean;
  currentMetaTags: string[];
}

export interface Decision {
  mint: string;
  action: 'BUY' | 'SKIP';
  confidence: number;
  reasoning: string;
  modelLatencyMs: number;
}

export type ExitReason =
  | 'take_profit'
  | 'trailing_stop'
  | 'hard_stop'
  | 'time_stop'
  | 'kill_switch';

export interface Position {
  id: string;
  mint: string;
  symbol: string;
  mode: 'paper' | 'live';
  entrySol: number;
  entryPrice: number;
  entryAt: number;
  amountTokens: number;
  status: 'open' | 'closed';
  exitPrice?: number;
  exitAt?: number;
  exitReason?: ExitReason;
  realizedPnlSol?: number;
}

export type BotEvent =
  | { type: 'raw_token'; payload: RawTokenEvent }
  | { type: 'candidate_filtered'; payload: { candidate: Candidate; result: FilterResult } }
  | { type: 'candidate_enriched'; payload: EnrichedCandidate }
  | { type: 'decision'; payload: Decision }
  | { type: 'position_opened'; payload: Position }
  | { type: 'position_updated'; payload: Position }
  | { type: 'position_closed'; payload: Position }
  | { type: 'risk_block'; payload: { mint: string; reason: string } }
  | { type: 'kill_switch'; payload: { active: boolean; reason: string } };

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

/** The first frame the websocket sends on connect (see api/stream.ts). */
export interface SnapshotPayload {
  open: Position[];
  closed: Position[];
  decisions: Decision[];
  stats: DailyStats | null;
  kill: KillState;
}

/** A position annotated with live price tracking for the open-positions table. */
export interface PositionView extends Position {
  /** Latest price seen from a position_updated tick (falls back to entryPrice). */
  lastPrice: number;
  /** Highest price seen since entry — arms the trailing-stop distance. */
  peakPrice: number;
}

/** One entry in the streaming decision feed. */
export type FeedItem = { at: number } & (
  | { kind: 'reject'; mint: string; symbol: string; stage: 'cheap' | 'full'; rules: string[] }
  | { kind: 'decision'; decision: Decision }
  | { kind: 'position'; event: 'opened' | 'closed'; position: Position }
  | { kind: 'kill'; active: boolean; reason: string }
);
