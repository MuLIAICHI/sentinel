import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bus } from '../../core/bus.js';
import type { Decision, EnrichedCandidate } from '../../core/types.js';
import { callCeiling } from '../../decision/ceiling.js';
import { callModel } from '../../decision/client.js';
import { decide } from '../../decision/index.js';
import { insertDecision } from '../../db/queries.js';

// The unit tests never touch the network or a DB: the SDK call, the DB layer,
// and the ceiling singleton are all mocked.
vi.mock('../../decision/client.js', () => ({
  callModel: vi.fn(),
}));

vi.mock('../../db/queries.js', () => ({
  insertDecision: vi.fn(),
}));

vi.mock('../../decision/ceiling.js', () => ({
  callCeiling: {
    atCeiling: vi.fn(),
    recordCall: vi.fn(),
    callsLastHour: vi.fn(() => 1),
  },
}));

function candidate(overrides: Partial<EnrichedCandidate> = {}): EnrichedCandidate {
  return {
    mint: 'MintDecide111111111111111111111111111111111',
    creator: 'CreatorDecide11111111111111111111111111111',
    createdAt: 1_770_000_000_000,
    ageSeconds: 1500,
    symbol: 'DEC',
    name: 'Decide Token',
    bondingCurvePct: 70,
    uniqueHolders: 120,
    holderGrowthPerMin: 3,
    top10HolderPct: 20,
    devSoldPct: 4,
    devPriorLaunches: 1,
    devPriorRugs: 0,
    volumeAccelerating: true,
    currentMetaTags: ['dog'],
    ...overrides,
  };
}

function modelResult(text: string, overrides: Partial<Awaited<ReturnType<typeof callModel>>> = {}) {
  return {
    text,
    stopReason: 'end_turn' as string | null,
    latencyMs: 142,
    inputTokens: 600,
    outputTokens: 40,
    ...overrides,
  };
}

// Capture every decision event emitted on the (real) bus.
const emitted: Decision[] = [];
bus.on('decision', (payload) => {
  emitted.push(payload);
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(callCeiling.atCeiling).mockReturnValue(false);
  vi.mocked(callCeiling.callsLastHour).mockReturnValue(1);
  vi.mocked(insertDecision).mockResolvedValue(undefined);
  emitted.length = 0;
});

describe('decide — BUY path end-to-end', () => {
  it('returns the validated decision, emits it on the bus, and persists with the snapshot', async () => {
    const c = candidate();
    vi.mocked(callModel).mockResolvedValue(
      modelResult('{"action":"BUY","confidence":0.82,"reasoning":"momentum + healthy holders"}'),
    );

    const decision = await decide(c);

    expect(decision).toEqual({
      mint: c.mint,
      action: 'BUY',
      confidence: 0.82,
      reasoning: 'momentum + healthy holders',
      modelLatencyMs: 142,
    });

    // Bus event carries exactly the decision.
    expect(emitted).toEqual([decision]);

    // ADR-005: the audit row is written at source with the input snapshot.
    expect(insertDecision).toHaveBeenCalledTimes(1);
    expect(insertDecision).toHaveBeenCalledWith(decision, c);

    // The call consumed ceiling budget.
    expect(callCeiling.recordCall).toHaveBeenCalledTimes(1);
  });

  it('a SKIP verdict from the model passes through unchanged', async () => {
    vi.mocked(callModel).mockResolvedValue(
      modelResult('{"action":"SKIP","confidence":0.9,"reasoning":"dev sold into strength"}'),
    );
    const decision = await decide(candidate());
    expect(decision.action).toBe('SKIP');
    expect(decision.confidence).toBe(0.9);
    expect(decision.reasoning).toBe('dev sold into strength');
  });
});

describe('decide — API error', () => {
  it("maps a thrown SDK error to SKIP 'api_error' with confidence 0", async () => {
    const c = candidate();
    vi.mocked(callModel).mockRejectedValue(new Error('connection timed out'));

    const decision = await decide(c);

    expect(decision.action).toBe('SKIP');
    expect(decision.reasoning).toBe('api_error');
    expect(decision.confidence).toBe(0);
    expect(decision.mint).toBe(c.mint);
    expect(emitted).toEqual([decision]);
    expect(insertDecision).toHaveBeenCalledWith(decision, c);
  });
});

describe('decide — call ceiling', () => {
  it("auto-SKIPs 'call_ceiling' WITHOUT calling the API", async () => {
    const c = candidate();
    vi.mocked(callCeiling.atCeiling).mockReturnValue(true);

    const decision = await decide(c);

    expect(decision).toEqual({
      mint: c.mint,
      action: 'SKIP',
      confidence: 0,
      reasoning: 'call_ceiling',
      modelLatencyMs: 0,
    });
    expect(callModel).not.toHaveBeenCalled();
    expect(callCeiling.recordCall).not.toHaveBeenCalled();
    expect(emitted).toEqual([decision]);
  });
});

describe('decide — malformed model output', () => {
  it("maps non-JSON text to SKIP 'parse_failure'", async () => {
    vi.mocked(callModel).mockResolvedValue(modelResult('I cannot evaluate this token.'));
    const decision = await decide(candidate());
    expect(decision.action).toBe('SKIP');
    expect(decision.reasoning).toBe('parse_failure');
    expect(decision.confidence).toBe(0);
    expect(decision.modelLatencyMs).toBe(142);
  });

  it("maps a wrong-shape verdict to SKIP 'parse_failure'", async () => {
    vi.mocked(callModel).mockResolvedValue(
      modelResult('{"action":"HOLD","confidence":2,"reasoning":"?"}'),
    );
    const decision = await decide(candidate());
    expect(decision.reasoning).toBe('parse_failure');
  });

  it("maps a truncated response (stop_reason max_tokens) to SKIP 'parse_failure'", async () => {
    vi.mocked(callModel).mockResolvedValue(
      modelResult('{"action":"BUY","confidence":0.9,"reasoning":"looks', {
        stopReason: 'max_tokens',
      }),
    );
    const decision = await decide(candidate());
    expect(decision.reasoning).toBe('parse_failure');
    expect(decision.action).toBe('SKIP');
  });

  it("maps a refusal to SKIP 'parse_failure' even if the text parses", async () => {
    vi.mocked(callModel).mockResolvedValue(
      modelResult('{"action":"BUY","confidence":0.9,"reasoning":"x"}', { stopReason: 'refusal' }),
    );
    const decision = await decide(candidate());
    expect(decision.reasoning).toBe('parse_failure');
    expect(decision.action).toBe('SKIP');
  });
});

describe('decide — DB failure does not fail the decision', () => {
  it('still resolves and emits when insertDecision rejects', async () => {
    vi.mocked(callModel).mockResolvedValue(
      modelResult('{"action":"BUY","confidence":0.7,"reasoning":"ok"}'),
    );
    vi.mocked(insertDecision).mockRejectedValue(new Error('db down'));

    const decision = await decide(candidate());

    expect(decision.action).toBe('BUY');
    expect(emitted).toEqual([decision]);
  });
});
