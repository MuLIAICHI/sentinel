/** Injected fakes shared by the api test suites. */

import { vi } from 'vitest';
import { Bus } from '../../core/bus.js';
import type { ApiDeps } from '../../api/server.js';
import type { Decision, Position } from '../../core/types.js';

export const fakePosition: Position = {
  id: 'paper-FAKE-1',
  mint: 'MintFake',
  symbol: 'FAK',
  mode: 'paper',
  entrySol: 0.02,
  entryPrice: 0.000001,
  entryAt: 1_750_000_000_000,
  amountTokens: 19000,
  status: 'open',
};

export const fakeDecision: Decision = {
  mint: 'MintFake',
  action: 'SKIP',
  confidence: 0.2,
  reasoning: 'fixture',
  modelLatencyMs: 700,
};

export function makeDeps(overrides: Partial<ApiDeps> = {}): ApiDeps {
  return {
    bus: new Bus(),
    openPositions: vi.fn(async () => [fakePosition]),
    closedPositions: vi.fn(async () => []),
    decisions: vi.fn(async (limit?: number) => Array(Math.min(limit ?? 100, 3)).fill(fakeDecision)),
    dailyStats: vi.fn(async () => ({
      day: '2026-06-12',
      tokensSeen: 100,
      passedFilter: 5,
      enriched: 2,
      buys: 0,
      skips: 2,
      positionsOpened: 0,
      riskBlocks: 0,
      killEvents: 0,
      realizedPnlSol: 0,
    })),
    killState: vi.fn(async () => ({ active: false, reason: '', updatedAt: 'now' })),
    excursions: vi.fn(async () => []),
    activateKill: vi.fn(async () => undefined),
    releaseKill: vi.fn(async () => undefined),
    ...overrides,
  };
}
