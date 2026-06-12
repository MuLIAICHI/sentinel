import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Bus } from '../../core/bus.js';
import { evaluateCandidate, toFilterContext, type PipelineDeps } from '../../orchestrator/pipeline.js';
import type { BotEvent, Candidate, Decision, EnrichedCandidate, Position } from '../../core/types.js';
import type { RiskBlock, RiskedOrder } from '../../risk/index.js';

const candidate: Candidate = {
  mint: 'MintP',
  creator: 'CreatorP',
  createdAt: 1_750_000_000_000,
  ageSeconds: 1230,
  symbol: 'PIP',
  name: 'Pipeline Test',
};

const enriched: EnrichedCandidate = {
  ...candidate,
  bondingCurvePct: 70,
  uniqueHolders: 200,
  holderGrowthPerMin: 0,
  top10HolderPct: 15,
  devSoldPct: 5,
  devPriorLaunches: 1,
  devPriorRugs: 0,
  volumeAccelerating: true,
  currentMetaTags: ['dog'],
};

const buyDecision: Decision = {
  mint: candidate.mint,
  action: 'BUY',
  confidence: 0.7,
  reasoning: 't',
  modelLatencyMs: 500,
};

const order: RiskedOrder = { approved: true, mint: candidate.mint, sizeSol: 0.02, confidence: 0.7 };
const block: RiskBlock = { approved: false, mint: candidate.mint, reason: 'max_concurrent' };

const position: Position = {
  id: 'paper-MintP-1',
  mint: candidate.mint,
  symbol: 'PIP',
  mode: 'paper',
  entrySol: 0.02,
  entryPrice: 0.000001,
  entryAt: 1_750_000_001_000,
  amountTokens: 19000,
  status: 'open',
};

describe('evaluateCandidate', () => {
  let bus: Bus;
  let events: BotEvent[];
  let deps: PipelineDeps;

  beforeEach(() => {
    bus = new Bus();
    events = [];
    bus.onAny((e) => events.push(e));
    deps = {
      cheapFilter: vi.fn(() => ({ passed: true, failedRules: [] })),
      enrich: vi.fn(async () => enriched),
      fullFilter: vi.fn(() => ({ passed: true, failedRules: [] })),
      decide: vi.fn(async () => buyDecision),
      getPortfolio: vi.fn(async () => ({
        openPositionsCount: 0,
        dailyRealizedPnlSol: 0,
        killSwitchActive: false,
      })),
      approve: vi.fn(() => order),
      buy: vi.fn(async () => position),
      bus,
    };
  });

  it('happy BUY path: fixed stage order, both filter events emitted', async () => {
    const outcome = await evaluateCandidate(candidate, deps);
    expect(outcome).toBe('opened');

    // Order: cheapFilter before enrich before fullFilter before decide before approve before buy.
    const order_ = [deps.cheapFilter, deps.enrich, deps.fullFilter, deps.decide, deps.approve, deps.buy].map(
      (f) => (f as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0],
    );
    expect([...order_]).toEqual([...order_].sort((a, b) => a! - b!));

    const filterEvents = events.filter((e) => e.type === 'candidate_filtered');
    expect(filterEvents).toHaveLength(2);
    expect(deps.buy).toHaveBeenCalledWith(order, 'PIP');
  });

  it('cheap reject: candidate_filtered(failed) emitted, enrich never called', async () => {
    deps.cheapFilter = vi.fn(() => ({ passed: false, failedRules: ['age_too_young'] }));
    const outcome = await evaluateCandidate(candidate, deps);
    expect(outcome).toBe('cheap_reject');
    expect(deps.enrich).not.toHaveBeenCalled();
    const ev = events.find((e) => e.type === 'candidate_filtered');
    expect(ev && ev.type === 'candidate_filtered' && ev.payload.result.failedRules).toEqual([
      'age_too_young',
    ]);
  });

  it('enrichment null: dropped, no decide call', async () => {
    deps.enrich = vi.fn(async () => null);
    expect(await evaluateCandidate(candidate, deps)).toBe('enrich_failed');
    expect(deps.decide).not.toHaveBeenCalled();
  });

  it('full filter reject after enrichment: no model call', async () => {
    deps.fullFilter = vi.fn(() => ({ passed: false, failedRules: ['holder_concentration'] }));
    expect(await evaluateCandidate(candidate, deps)).toBe('full_reject');
    expect(deps.decide).not.toHaveBeenCalled();
  });

  it('SKIP decision: approve and buy never called', async () => {
    deps.decide = vi.fn(async () => ({ ...buyDecision, action: 'SKIP' as const }));
    expect(await evaluateCandidate(candidate, deps)).toBe('skip');
    expect(deps.approve).not.toHaveBeenCalled();
    expect(deps.buy).not.toHaveBeenCalled();
  });

  it('RiskBlock: risk_block emitted with reason, buy never called', async () => {
    deps.approve = vi.fn(() => block);
    expect(await evaluateCandidate(candidate, deps)).toBe('risk_block');
    const ev = events.find((e) => e.type === 'risk_block');
    expect(ev && ev.type === 'risk_block' && ev.payload).toEqual({
      mint: candidate.mint,
      reason: 'max_concurrent',
    });
    expect(deps.buy).not.toHaveBeenCalled();
  });

  it('buy throwing (no price) is contained', async () => {
    deps.buy = vi.fn(async () => {
      throw new Error('no current price');
    });
    expect(await evaluateCandidate(candidate, deps)).toBe('buy_failed');
  });

  it('a throwing stage never escapes', async () => {
    deps.getPortfolio = vi.fn(async () => {
      throw new Error('db down');
    });
    await expect(evaluateCandidate(candidate, deps)).resolves.toBe('enrich_failed');
  });

  it('toFilterContext maps the enriched fields and an empty bad-creator set', () => {
    const ctx = toFilterContext(enriched);
    expect(ctx).toMatchObject({
      bondingCurvePct: 70,
      top10HolderPct: 15,
      devSoldPct: 5,
      volumeAccelerating: true,
    });
    expect(ctx.knownBadCreators?.size).toBe(0);
  });
});
