import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Nursery } from '../../orchestrator/nursery.js';
import type { Candidate, RawTokenEvent } from '../../core/types.js';

const T0 = 1_750_000_000_000;
const MIN = 60_000;

function makeEvent(mint: string, createdAt = T0): RawTokenEvent {
  return {
    mint,
    creator: `creator-${mint}`,
    createdAt,
    symbol: 'TST',
    name: 'Test',
    initialBuySol: 0.5,
    source: 'pumpportal',
  };
}

describe('Nursery', () => {
  let now: number;
  let warmups: string[];
  let ripes: Candidate[];
  let drops: string[];
  let nursery: Nursery;

  beforeEach(() => {
    now = T0;
    warmups = [];
    ripes = [];
    drops = [];
    nursery = new Nursery({
      now: () => now,
      onWarmup: (m) => warmups.push(m),
      onRipe: (c) => ripes.push(c),
      onDrop: (m) => drops.push(m),
    });
  });

  it('fires warmup at 18 min, before ripe', () => {
    nursery.add(makeEvent('A'));
    now = T0 + 18 * MIN;
    nursery.tick();
    expect(warmups).toEqual(['A']);
    expect(ripes).toHaveLength(0);
  });

  it('fires ripe exactly once at 20 min with correct ageSeconds', () => {
    nursery.add(makeEvent('A'));
    now = T0 + 20 * MIN;
    nursery.tick();
    nursery.tick();
    expect(ripes).toHaveLength(1);
    expect(ripes[0]).toMatchObject({ mint: 'A', creator: 'creator-A', ageSeconds: 1200 });
    expect(nursery.size()).toBe(0);
  });

  it('drops unevaluated tokens at max age and fires onDrop for warmed mints', () => {
    // Use a nursery whose ripe handler throws nothing but where ripe never
    // fires because we jump straight past maxAge in one tick: age checks run
    // before ripen checks, so the token ages out.
    nursery.add(makeEvent('A'));
    now = T0 + 18 * MIN;
    nursery.tick(); // warmup fires, subscription exists
    now = T0 + 61 * MIN;
    // Simulate the ripe callback having been missed (e.g. process restart):
    // re-add a fresh token that goes stale without ever ripening.
    nursery.add(makeEvent('B', T0));
    nursery.tick();
    // A ripened at the 61-min tick? No: aged_out check runs first at 61 min.
    expect(drops).toContain('A');
    expect(ripes.map((r) => r.mint)).not.toContain('A');
  });

  it('does not fire onDrop for mints that never warmed up', () => {
    nursery.add(makeEvent('A'));
    now = T0 + 61 * MIN; // never ticked during warmup window
    nursery.tick();
    expect(drops).toHaveLength(0);
    expect(nursery.size()).toBe(0);
  });

  it('evicts the oldest beyond capacity', () => {
    const small = new Nursery({
      cap: 2,
      now: () => now,
      onWarmup: (m) => warmups.push(m),
      onRipe: (c) => ripes.push(c),
      onDrop: (m) => drops.push(m),
    });
    small.add(makeEvent('A'));
    small.add(makeEvent('B'));
    small.add(makeEvent('C'));
    expect(small.size()).toBe(2);
    // A was evicted; it never warmed up, so no onDrop.
    now = T0 + 20 * MIN;
    small.tick();
    expect(ripes.map((r) => r.mint).sort()).toEqual(['B', 'C']);
  });

  it('ignores duplicate mints', () => {
    nursery.add(makeEvent('A'));
    nursery.add(makeEvent('A', T0 + 5 * MIN));
    expect(nursery.size()).toBe(1);
    now = T0 + 20 * MIN;
    nursery.tick();
    expect(ripes).toHaveLength(1);
  });

  it('survives a throwing ripe handler', () => {
    const explosive = new Nursery({
      now: () => now,
      onWarmup: vi.fn(),
      onRipe: () => {
        throw new Error('boom');
      },
      onDrop: vi.fn(),
    });
    explosive.add(makeEvent('A'));
    now = T0 + 20 * MIN;
    expect(() => explosive.tick()).not.toThrow();
    expect(explosive.size()).toBe(0);
  });
});
