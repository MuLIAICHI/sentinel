import { describe, expect, it } from 'vitest';
import { CallCeiling, DEFAULT_CALLS_PER_HOUR } from '../../decision/ceiling.js';

const HOUR_MS = 60 * 60 * 1000;

/** A fake clock the test advances by hand. */
function fakeClock(startAt = 0) {
  let now = startAt;
  return {
    clock: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe('CallCeiling', () => {
  it('defaults to the ADR-009 ceiling of 100 calls/hour', () => {
    expect(DEFAULT_CALLS_PER_HOUR).toBe(100);
  });

  it('allows 100 calls and blocks the 101st', () => {
    const { clock, advance } = fakeClock();
    const ceiling = new CallCeiling(100, clock);

    for (let i = 0; i < 100; i++) {
      expect(ceiling.atCeiling()).toBe(false); // each of the 100 calls is allowed
      ceiling.recordCall();
      advance(1000); // calls spread over ~100s, all inside the window
    }

    expect(ceiling.callsLastHour()).toBe(100);
    expect(ceiling.atCeiling()).toBe(true); // the 101st is blocked
  });

  it('slides the window: old calls expire and free up budget', () => {
    const { clock, advance } = fakeClock();
    const ceiling = new CallCeiling(100, clock);

    // Fill the ceiling at t=0..99s.
    for (let i = 0; i < 100; i++) {
      ceiling.recordCall();
      advance(1000);
    }
    expect(ceiling.atCeiling()).toBe(true);

    // Just before the first call exits the window: still blocked.
    advance(HOUR_MS - 100_000 - 1);
    expect(ceiling.atCeiling()).toBe(true);

    // Slide past the first call: one slot frees up.
    advance(1);
    expect(ceiling.atCeiling()).toBe(false);
    expect(ceiling.callsLastHour()).toBe(99);

    // Use the freed slot: blocked again.
    ceiling.recordCall();
    expect(ceiling.atCeiling()).toBe(true);

    // A full hour with no calls drains the window completely.
    advance(HOUR_MS);
    expect(ceiling.callsLastHour()).toBe(0);
    expect(ceiling.atCeiling()).toBe(false);
  });

  it('counts calls within the last hour only', () => {
    const { clock, advance } = fakeClock();
    const ceiling = new CallCeiling(100, clock);

    ceiling.recordCall();
    advance(30 * 60 * 1000); // +30 min
    ceiling.recordCall();
    expect(ceiling.callsLastHour()).toBe(2);

    advance(31 * 60 * 1000); // first call is now 61 min old
    expect(ceiling.callsLastHour()).toBe(1);
  });

  it('respects a custom limit', () => {
    const { clock } = fakeClock();
    const ceiling = new CallCeiling(2, clock);
    ceiling.recordCall();
    expect(ceiling.atCeiling()).toBe(false);
    ceiling.recordCall();
    expect(ceiling.atCeiling()).toBe(true);
  });
});
