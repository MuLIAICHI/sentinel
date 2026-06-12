import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Bus } from '../../core/bus.js';
import { DAILY_LOSS_LIMIT_SOL } from '../../risk/guards.js';
import { DailyTracker } from '../../orchestrator/daily.js';
import type { Position } from '../../core/types.js';

const DAY1_NOON = Date.UTC(2026, 5, 12, 12, 0, 0);
const DAY2_NOON = Date.UTC(2026, 5, 13, 12, 0, 0);

function closed(pnl: number): Position {
  return {
    id: `p-${Math.abs(pnl)}-${pnl < 0 ? 'l' : 'w'}`,
    mint: 'M',
    symbol: 'T',
    mode: 'paper',
    entrySol: 0.03,
    entryPrice: 1,
    entryAt: DAY1_NOON,
    amountTokens: 1,
    status: 'closed',
    realizedPnlSol: pnl,
  };
}

describe('DailyTracker', () => {
  let now: number;
  let bus: Bus;
  let activateKill: ReturnType<typeof vi.fn>;
  let releaseKill: ReturnType<typeof vi.fn>;
  let killState: { active: boolean; reason: string };
  let tracker: DailyTracker;

  beforeEach(async () => {
    now = DAY1_NOON;
    bus = new Bus();
    activateKill = vi.fn(async () => {
      killState = { active: true, reason: 'daily_loss' };
    });
    releaseKill = vi.fn(async () => {
      killState = { active: false, reason: 'new_utc_day' };
    });
    killState = { active: false, reason: '' };
    tracker = new DailyTracker({
      loadPnl: async () => 0,
      activateKill,
      releaseKill,
      getKillReason: async () => killState,
      now: () => now,
    });
    await tracker.boot();
    tracker.attach(bus);
  });

  it('boots from the loader', async () => {
    const t = new DailyTracker({
      loadPnl: async () => -0.04,
      activateKill,
      releaseKill,
      getKillReason: async () => killState,
      now: () => now,
    });
    await t.boot();
    expect(t.currentPnl()).toBe(-0.04);
  });

  it('accumulates realized pnl from position_closed events', () => {
    bus.emit({ type: 'position_closed', payload: closed(0.02) });
    bus.emit({ type: 'position_closed', payload: closed(-0.05) });
    expect(tracker.currentPnl()).toBeCloseTo(-0.03);
  });

  it('trips the kill exactly once when losses reach the limit', async () => {
    bus.emit({ type: 'position_closed', payload: closed(-DAILY_LOSS_LIMIT_SOL) });
    await vi.waitFor(() => expect(activateKill).toHaveBeenCalledTimes(1));
    expect(activateKill).toHaveBeenCalledWith('daily_loss');
    bus.emit({ type: 'position_closed', payload: closed(-0.01) });
    await new Promise((r) => setTimeout(r, 10));
    expect(activateKill).toHaveBeenCalledTimes(1);
  });

  it('rolls the day over: pnl resets and a daily_loss kill is released', async () => {
    bus.emit({ type: 'position_closed', payload: closed(-DAILY_LOSS_LIMIT_SOL) });
    await vi.waitFor(() => expect(activateKill).toHaveBeenCalled());
    now = DAY2_NOON;
    await tracker.rollover();
    expect(tracker.currentPnl()).toBe(0);
    expect(releaseKill).toHaveBeenCalledWith('new_utc_day');
  });

  it('does NOT release a manual kill at rollover', async () => {
    killState = { active: true, reason: 'human pressed the button' };
    now = DAY2_NOON;
    await tracker.rollover();
    expect(releaseKill).not.toHaveBeenCalled();
  });

  it('rollover is a no-op within the same day', async () => {
    bus.emit({ type: 'position_closed', payload: closed(-0.02) });
    await tracker.rollover();
    expect(tracker.currentPnl()).toBeCloseTo(-0.02);
  });
});
