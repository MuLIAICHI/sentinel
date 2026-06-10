import { describe, expect, it } from 'vitest';
import { Bus } from '../../core/bus.js';
import type { Position } from '../../core/types.js';
import { PositionEngine, type SellExecutor } from '../../positions/index.js';

const ENTRY_AT = 1_700_000_000_000;

function makePosition(overrides: Partial<Position> = {}): Position {
  return {
    id: 'pos-1',
    mint: 'MintAAA',
    symbol: 'TST',
    mode: 'paper',
    entrySol: 10,
    entryPrice: 1.0,
    entryAt: ENTRY_AT,
    amountTokens: 10,
    status: 'open',
    ...overrides,
  };
}

interface SellCall {
  positionId: string;
  amountTokens: number;
  fraction: number;
  reason: Position['exitReason'];
}

/** Mock executor: records calls, fills at a price chosen per call. */
function makeMockExecutor(fillPrice: (call: SellCall) => number) {
  const calls: SellCall[] = [];
  const executor: SellExecutor = async (position, fraction, reason) => {
    const call: SellCall = {
      positionId: position.id,
      amountTokens: position.amountTokens,
      fraction,
      reason,
    };
    calls.push(call);
    return { exitPrice: fillPrice(call) };
  };
  return { calls, executor };
}

function collectEvents(bus: Bus) {
  const updated: Position[] = [];
  const closed: Position[] = [];
  bus.on('position_updated', (p) => updated.push(p));
  bus.on('position_closed', (p) => closed.push(p));
  return { updated, closed };
}

describe('PositionEngine', () => {
  it('runs open → ticks → partial TP → trailing close with correct events and P&L', async () => {
    const bus = new Bus();
    const { updated, closed } = collectEvents(bus);
    // Fill exactly at the rule's trigger-time market price for hand-checkable math.
    const { calls, executor } = makeMockExecutor((call) =>
      call.reason === 'take_profit' ? 1.8 : 1.5,
    );
    const engine = new PositionEngine({ executor, bus });

    engine.open(makePosition());

    // Quiet tick — nothing should happen.
    await engine.onTick('MintAAA', 1.2, ENTRY_AT + 60_000);
    expect(calls).toHaveLength(0);

    // +80%: take profit sells 50% of 10 tokens at 1.8.
    await engine.onTick('MintAAA', 1.8, ENTRY_AT + 120_000);
    expect(calls).toEqual([
      { positionId: 'pos-1', amountTokens: 10, fraction: 0.5, reason: 'take_profit' },
    ]);
    expect(updated).toHaveLength(1);
    expect(updated[0]?.amountTokens).toBe(5);
    expect(updated[0]?.status).toBe('open');

    // New peak at 2.0 — and TP must NOT re-fire even though price >= +80%.
    await engine.onTick('MintAAA', 2.0, ENTRY_AT + 180_000);
    expect(calls).toHaveLength(1);

    // Give back 25% from peak 2.0 → trailing trigger at 1.5: close the remainder.
    await engine.onTick('MintAAA', 1.5, ENTRY_AT + 240_000);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual({
      positionId: 'pos-1',
      amountTokens: 5,
      fraction: 1,
      reason: 'trailing_stop',
    });

    // P&L by hand: entry spent 10 SOL for 10 tokens at 1.0.
    //   TP leg:    5 tokens × 1.8 = 9.0 SOL
    //   trail leg: 5 tokens × 1.5 = 7.5 SOL
    //   proceeds 16.5 − entry 10 = +6.5 SOL realized.
    expect(closed).toHaveLength(1);
    const final = closed[0]!;
    expect(final.status).toBe('closed');
    expect(final.exitReason).toBe('trailing_stop');
    expect(final.exitPrice).toBe(1.5);
    expect(final.exitAt).toBe(ENTRY_AT + 240_000);
    expect(final.realizedPnlSol).toBeCloseTo(6.5, 10);

    // Fully untracked: further ticks are ignored.
    await engine.onTick('MintAAA', 0.1, ENTRY_AT + 300_000);
    expect(calls).toHaveLength(2);
    expect(engine.openPositions()).toEqual([]);
  });

  it('tracks positions arriving via position_opened on the bus', async () => {
    const bus = new Bus();
    const { closed } = collectEvents(bus);
    const { calls, executor } = makeMockExecutor(() => 0.5);
    const engine = new PositionEngine({ executor, bus });

    // Bus delivery is synchronous — the engine tracks before emit() returns.
    bus.emit({ type: 'position_opened', payload: makePosition() });
    expect(engine.openPositions()).toHaveLength(1);

    // Gap straight through the hard stop (−50% in one tick, no intermediate prints).
    await engine.onTick('MintAAA', 0.5, ENTRY_AT + 60_000);
    expect(calls).toEqual([
      { positionId: 'pos-1', amountTokens: 10, fraction: 1, reason: 'hard_stop' },
    ]);
    expect(closed).toHaveLength(1);
    // P&L by hand: 10 × 0.5 = 5 SOL back on 10 SOL in → −5 SOL.
    expect(closed[0]?.realizedPnlSol).toBeCloseTo(-5, 10);
  });

  it('open() is idempotent by id and ignores closed positions', async () => {
    const bus = new Bus();
    const { calls, executor } = makeMockExecutor(() => 1.8);
    const engine = new PositionEngine({ executor, bus });

    engine.open(makePosition());
    engine.open(makePosition()); // duplicate — must not double-track
    engine.open(makePosition({ id: 'pos-closed', status: 'closed' }));

    expect(engine.openPositions()).toHaveLength(1);
    await engine.onTick('MintAAA', 1.8, ENTRY_AT + 60_000);
    expect(calls).toHaveLength(1); // one position, one TP — not two
  });

  it('onKillSwitch flattens every open position across mints', async () => {
    const bus = new Bus();
    const { closed } = collectEvents(bus);
    const { calls, executor } = makeMockExecutor(() => 1.1);
    const engine = new PositionEngine({ executor, bus, now: () => ENTRY_AT + 90_000 });

    engine.open(makePosition({ id: 'pos-a', mint: 'MintAAA' }));
    engine.open(makePosition({ id: 'pos-b', mint: 'MintBBB', entrySol: 20, amountTokens: 20 }));

    await engine.onKillSwitch();

    expect(calls.map((c) => ({ id: c.positionId, fraction: c.fraction, reason: c.reason }))).toEqual([
      { id: 'pos-a', fraction: 1, reason: 'kill_switch' },
      { id: 'pos-b', fraction: 1, reason: 'kill_switch' },
    ]);
    expect(closed).toHaveLength(2);
    for (const p of closed) {
      expect(p.status).toBe('closed');
      expect(p.exitReason).toBe('kill_switch');
      expect(p.exitAt).toBe(ENTRY_AT + 90_000);
    }
    // P&L by hand: pos-a 10 × 1.1 = 11 − 10 = +1; pos-b 20 × 1.1 = 22 − 20 = +2.
    expect(closed.find((p) => p.id === 'pos-a')?.realizedPnlSol).toBeCloseTo(1, 10);
    expect(closed.find((p) => p.id === 'pos-b')?.realizedPnlSol).toBeCloseTo(2, 10);
    expect(engine.openPositions()).toEqual([]);
  });

  it('flattens on a kill_switch bus event and blocks rule sells on later ticks', async () => {
    const bus = new Bus();
    const { closed } = collectEvents(bus);
    const { executor } = makeMockExecutor(() => 1.0);
    const engine = new PositionEngine({ executor, bus, now: () => ENTRY_AT + 90_000 });

    engine.open(makePosition());
    bus.emit({ type: 'kill_switch', payload: { active: true, reason: 'manual' } });
    // The bus handler kicks off an async flatten; let the microtask queue drain.
    await new Promise((resolve) => setImmediate(resolve));

    expect(closed).toHaveLength(1);
    expect(closed[0]?.exitReason).toBe('kill_switch');

    // A position opened while the switch is active is flattened on its first tick.
    engine.open(makePosition({ id: 'pos-late', mint: 'MintCCC' }));
    await engine.onTick('MintCCC', 1.9, ENTRY_AT + 120_000);
    expect(closed).toHaveLength(2);
    expect(closed[1]?.exitReason).toBe('kill_switch');
  });
});
