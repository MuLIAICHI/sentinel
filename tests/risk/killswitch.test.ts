import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the DB layer entirely — these tests are deterministic and need no live DB.
vi.mock('../../db/queries.js', () => ({
  getKillState: vi.fn(),
  setKillState: vi.fn().mockResolvedValue(undefined),
}));

import { bus } from '../../core/bus.js';
import { getKillState, setKillState } from '../../db/queries.js';
import { activateKill, isKillActive, releaseKill } from '../../risk/killswitch.js';

const mockedGetKillState = vi.mocked(getKillState);
const mockedSetKillState = vi.mocked(setKillState);

/** Collect kill_switch payloads emitted on the singleton bus during a test body. */
function collectKillEvents(): { active: boolean; reason: string }[] {
  const events: { active: boolean; reason: string }[] = [];
  bus.on('kill_switch', (payload) => {
    events.push(payload);
  });
  return events;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('isKillActive', () => {
  it('returns true when the DB row is active', async () => {
    mockedGetKillState.mockResolvedValue({ active: true, reason: 'manual', updatedAt: 'now' });
    await expect(isKillActive()).resolves.toBe(true);
    expect(mockedGetKillState).toHaveBeenCalledTimes(1);
  });

  it('returns false when the DB row is inactive', async () => {
    mockedGetKillState.mockResolvedValue({ active: false, reason: 'boot', updatedAt: 'now' });
    await expect(isKillActive()).resolves.toBe(false);
  });
});

describe('activateKill', () => {
  it('persists active=true with the reason and emits kill_switch active:true', async () => {
    const events = collectKillEvents();
    await activateKill('daily_loss');

    expect(mockedSetKillState).toHaveBeenCalledTimes(1);
    expect(mockedSetKillState).toHaveBeenCalledWith(true, 'daily_loss');
    expect(events).toEqual([{ active: true, reason: 'daily_loss' }]);
  });

  it('writes the DB before emitting (no event if the DB write fails)', async () => {
    const events = collectKillEvents();
    mockedSetKillState.mockRejectedValueOnce(new Error('db down'));

    await expect(activateKill('manual')).rejects.toThrow('db down');
    expect(events).toEqual([]);
  });
});

describe('releaseKill', () => {
  it('persists active=false with the reason and emits kill_switch active:false', async () => {
    const events = collectKillEvents();
    await releaseKill('manual_release');

    expect(mockedSetKillState).toHaveBeenCalledTimes(1);
    expect(mockedSetKillState).toHaveBeenCalledWith(false, 'manual_release');
    expect(events).toEqual([{ active: false, reason: 'manual_release' }]);
  });
});

describe('state round-trip', () => {
  it('activate then release produces the matching DB calls and bus emissions in order', async () => {
    const events = collectKillEvents();

    await activateKill('daily_loss');
    await releaseKill('new_utc_day');

    expect(mockedSetKillState.mock.calls).toEqual([
      [true, 'daily_loss'],
      [false, 'new_utc_day'],
    ]);
    expect(events).toEqual([
      { active: true, reason: 'daily_loss' },
      { active: false, reason: 'new_utc_day' },
    ]);
  });
});
