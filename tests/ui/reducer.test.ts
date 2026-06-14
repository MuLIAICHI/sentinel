import { describe, it, expect } from 'vitest';
import { reducer, initialState } from '../../ui/lib/reducer.js';
import type { DashState } from '../../ui/lib/reducer.js';
import type {
  BotEvent,
  Candidate,
  Decision,
  Position,
  SnapshotPayload,
} from '../../ui/lib/types.js';

const NOW = 5_000_000;

function candidate(mint: string): Candidate {
  return {
    mint,
    creator: 'devX',
    createdAt: 1_000,
    ageSeconds: 1200,
    symbol: mint.slice(0, 4).toUpperCase(),
    name: mint,
  };
}

function position(over: Partial<Position> = {}): Position {
  return {
    id: 'pos1',
    mint: 'mintAAA',
    symbol: 'AAA',
    mode: 'paper',
    entrySol: 0.033,
    entryPrice: 1e-6,
    entryAt: NOW,
    amountTokens: 33_000,
    status: 'open',
    ...over,
  };
}

function apply(state: DashState, event: BotEvent, now = NOW): DashState {
  return reducer(state, { kind: 'event', event, now });
}

describe('snapshot', () => {
  it('hydrates open/closed/decisions/stats/kill', () => {
    const snap: SnapshotPayload = {
      open: [position()],
      closed: [position({ id: 'pos0', status: 'closed', exitReason: 'time_stop', realizedPnlSol: -0.01 })],
      decisions: [{ mint: 'm', action: 'SKIP', confidence: 0.3, reasoning: 'meh', modelLatencyMs: 800 }],
      stats: {
        day: '2026-06-14',
        tokensSeen: 1000,
        passedFilter: 2,
        enriched: 2,
        buys: 0,
        skips: 1,
        positionsOpened: 0,
        riskBlocks: 0,
        killEvents: 0,
        realizedPnlSol: 0,
      },
      kill: { active: false, reason: '', updatedAt: 'now' },
    };
    const s = reducer(initialState(), { kind: 'snapshot', payload: snap, now: NOW });
    expect(s.open).toHaveLength(1);
    expect(s.open[0]!.lastPrice).toBe(s.open[0]!.entryPrice);
    expect(s.closed).toHaveLength(1);
    expect(s.decisions).toHaveLength(1);
    expect(s.stats?.tokensSeen).toBe(1000);
    expect(s.conn).toBe('connecting'); // snapshot must not clobber connection state
  });
});

describe('raw_token', () => {
  it('increments tokensSeen and adds no feed entry', () => {
    const s = apply(initialState(), { type: 'raw_token', payload: { mint: 'm', creator: 'c', createdAt: 1, symbol: 'M', name: 'M', initialBuySol: 0.1, source: 'pumpportal' } });
    expect(s.live.tokensSeen).toBe(1);
    expect(s.feed).toHaveLength(0);
  });
});

describe('candidate_filtered', () => {
  it('infers cheap on first sighting and full on second', () => {
    let s = initialState();
    // first sighting, cheap pass
    s = apply(s, { type: 'candidate_filtered', payload: { candidate: candidate('mA'), result: { passed: true, failedRules: [] } } });
    expect(s.live.cheapPass).toBe(1);
    expect(s.live.fullPass).toBe(0);
    expect(s.feed).toHaveLength(0); // passes are quiet
    // second sighting of same mint, full fail
    s = apply(s, { type: 'candidate_filtered', payload: { candidate: candidate('mA'), result: { passed: false, failedRules: ['top10_concentration'] } } });
    expect(s.live.fullFail).toBe(1);
    expect(s.feed).toHaveLength(1);
    expect(s.feed[0]).toMatchObject({ kind: 'reject', stage: 'full', rules: ['top10_concentration'] });
  });

  it('records a cheap rejection in the feed', () => {
    const s = apply(initialState(), { type: 'candidate_filtered', payload: { candidate: candidate('mB'), result: { passed: false, failedRules: ['age_too_young'] } } });
    expect(s.live.cheapFail).toBe(1);
    expect(s.feed[0]).toMatchObject({ kind: 'reject', stage: 'cheap' });
  });
});

describe('candidate_enriched', () => {
  it('increments the enriched counter', () => {
    const s = apply(initialState(), {
      type: 'candidate_enriched',
      payload: { ...candidate('mC'), bondingCurvePct: 40, uniqueHolders: 30, holderGrowthPerMin: 2, top10HolderPct: 20, devSoldPct: 0, devPriorLaunches: 0, devPriorRugs: 0, volumeAccelerating: true, currentMetaTags: [] },
    });
    expect(s.live.enriched).toBe(1);
  });
});

describe('decision', () => {
  it('prepends to decisions and feed', () => {
    const d: Decision = { mint: 'mD', action: 'BUY', confidence: 0.7, reasoning: 'momentum', modelLatencyMs: 900 };
    const s = apply(initialState(), { type: 'decision', payload: d });
    expect(s.decisions[0]).toEqual(d);
    expect(s.feed[0]).toMatchObject({ kind: 'decision', decision: d });
  });

  it('caps decisions at 100 and feed at 200', () => {
    let s = initialState();
    for (let i = 0; i < 250; i++) {
      s = apply(s, { type: 'decision', payload: { mint: `m${i}`, action: 'SKIP', confidence: 0.1, reasoning: 'x', modelLatencyMs: 1 } });
    }
    expect(s.decisions).toHaveLength(100);
    expect(s.feed).toHaveLength(200);
    expect(s.decisions[0]!.mint).toBe('m249'); // newest first
  });
});

describe('positions lifecycle', () => {
  it('opens, updates amountTokens, and closes with exit reason', () => {
    let s = apply(initialState(), { type: 'position_opened', payload: position() });
    expect(s.open).toHaveLength(1);
    expect(s.feed[0]).toMatchObject({ kind: 'position', event: 'opened' });

    // partial sell halves the token count
    s = apply(s, { type: 'position_updated', payload: position({ amountTokens: 16_500 }) });
    expect(s.open[0]!.amountTokens).toBe(16_500);
    expect(s.open[0]!.lastPrice).toBe(1e-6); // price tracking preserved

    // close moves it to history with the exit reason
    s = apply(s, { type: 'position_closed', payload: position({ status: 'closed', exitReason: 'take_profit', realizedPnlSol: 0.02 }) });
    expect(s.open).toHaveLength(0);
    expect(s.closed).toHaveLength(1);
    expect(s.closed[0]!.exitReason).toBe('take_profit');
    expect(s.feed[0]).toMatchObject({ kind: 'position', event: 'closed' });
  });
});

describe('kill_switch', () => {
  it('flips kill state and logs to the feed', () => {
    const s = apply(initialState(), { type: 'kill_switch', payload: { active: true, reason: 'manual_ui' } });
    expect(s.kill.active).toBe(true);
    expect(s.kill.reason).toBe('manual_ui');
    expect(s.feed[0]).toMatchObject({ kind: 'kill', active: true });
  });
});

describe('unknown / unhandled events', () => {
  it('ignores risk_block without mutating state', () => {
    const before = initialState();
    const after = apply(before, { type: 'risk_block', payload: { mint: 'm', reason: 'wallet_cap' } });
    expect(after).toEqual(before);
  });

  it('ignores an unknown event type', () => {
    const before = initialState();
    const after = apply(before, { type: 'totally_unknown', payload: {} } as unknown as BotEvent);
    expect(after).toEqual(before);
  });
});

describe('conn action', () => {
  it('updates connection state', () => {
    const s = reducer(initialState(), { kind: 'conn', conn: 'open' });
    expect(s.conn).toBe('open');
  });
});
