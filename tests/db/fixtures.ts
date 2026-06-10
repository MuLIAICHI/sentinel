/** Shared fixtures for db tests. Deterministic values only. */

import type {
  Candidate,
  Decision,
  EnrichedCandidate,
  Position,
  RawTokenEvent,
} from '../../core/types.js';

export const rawToken: RawTokenEvent = {
  mint: 'MintFixture1111111111111111111111111111111',
  creator: 'CreatorFixture111111111111111111111111111',
  createdAt: 1_750_000_000_000,
  symbol: 'FIX',
  name: 'Fixture Token',
  initialBuySol: 0.75,
  source: 'pumpportal',
};

export const candidate: Candidate = {
  mint: rawToken.mint,
  creator: rawToken.creator,
  createdAt: rawToken.createdAt,
  ageSeconds: 1500,
  symbol: rawToken.symbol,
  name: rawToken.name,
};

export const enriched: EnrichedCandidate = {
  ...candidate,
  bondingCurvePct: 68,
  uniqueHolders: 140,
  holderGrowthPerMin: 4.2,
  top10HolderPct: 18,
  devSoldPct: 10,
  devPriorLaunches: 2,
  devPriorRugs: 0,
  volumeAccelerating: true,
  currentMetaTags: ['dog', 'agent'],
};

export const buyDecision: Decision = {
  mint: rawToken.mint,
  action: 'BUY',
  confidence: 0.7,
  reasoning: 'fixture buy',
  modelLatencyMs: 850,
};

export const skipDecision: Decision = {
  ...buyDecision,
  action: 'SKIP',
  confidence: 0.3,
  reasoning: 'fixture skip',
};

export const openPosition: Position = {
  id: 'pos-fixture-1',
  mint: rawToken.mint,
  symbol: rawToken.symbol,
  mode: 'paper',
  entrySol: 0.03,
  entryPrice: 0.0000045,
  entryAt: 1_750_000_100_000,
  amountTokens: 6_500_000,
  status: 'open',
};

export const closedPosition: Position = {
  ...openPosition,
  status: 'closed',
  exitPrice: 0.0000071,
  exitAt: 1_750_001_000_000,
  exitReason: 'take_profit',
  realizedPnlSol: 0.0169,
};
