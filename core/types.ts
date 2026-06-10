/**
 * Shared contracts for the sentinel pipeline.
 *
 * Transcribed LITERALLY from docs/SPEC.md §3. This file is FROZEN once the human
 * approves it — changes require a DECISIONS.md entry and human sign-off.
 */

// The raw thing off the websocket
export interface RawTokenEvent {
  mint: string;
  creator: string;
  createdAt: number;          // unix ms
  symbol: string;
  name: string;
  initialBuySol: number;
  source: 'pumpportal';
}

// After cheap filters decide it's worth enriching
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
  failedRules: string[];      // e.g. ['age_too_young', 'dev_repeat_rugger']
}

// After we pull on-chain context
export interface EnrichedCandidate extends Candidate {
  bondingCurvePct: number;    // 0..100, progress toward graduation
  uniqueHolders: number;
  holderGrowthPerMin: number;
  top10HolderPct: number;     // concentration
  devSoldPct: number;         // how much of dev's bag is gone
  devPriorLaunches: number;
  devPriorRugs: number;
  volumeAccelerating: boolean;
  currentMetaTags: string[];  // themes hot in last 6h, computed from the stream
}

// What Claude returns — STRICTLY this shape
export interface Decision {
  mint: string;
  action: 'BUY' | 'SKIP';
  confidence: number;         // 0..1
  reasoning: string;          // short, for the log/UI
  modelLatencyMs: number;
}

// A position (paper or live)
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
  exitReason?: 'take_profit' | 'trailing_stop' | 'hard_stop' | 'time_stop' | 'kill_switch';
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
