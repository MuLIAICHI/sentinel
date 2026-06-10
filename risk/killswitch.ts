/**
 * Global kill switch — a thin wrapper over the single `kill_state` DB row.
 *
 * The UI/API flips this via the same DB row; risk/ trips it automatically on
 * daily-loss breach. State transitions are broadcast on the bus as
 * `kill_switch` events so positions/ can flatten and the UI can react.
 */

import { bus } from '../core/bus.js';
import { createLogger } from '../core/logger.js';
import { getKillState, setKillState } from '../db/queries.js';

const log = createLogger('risk/killswitch');

/** True when the global kill switch is active (no new entries allowed). */
export async function isKillActive(): Promise<boolean> {
  const state = await getKillState();
  return state.active;
}

/**
 * Activate the kill switch with a reason (e.g. 'daily_loss', 'manual').
 * Persists to the DB, then emits `kill_switch { active: true }` on the bus.
 */
export async function activateKill(reason: string): Promise<void> {
  await setKillState(true, reason);
  log.warn('kill switch ACTIVATED', { reason });
  bus.emit({ type: 'kill_switch', payload: { active: true, reason } });
}

/**
 * Release the kill switch with a reason (e.g. 'manual_release', 'new_utc_day').
 * Persists to the DB, then emits `kill_switch { active: false }` on the bus.
 */
export async function releaseKill(reason: string): Promise<void> {
  await setKillState(false, reason);
  log.info('kill switch released', { reason });
  bus.emit({ type: 'kill_switch', payload: { active: false, reason } });
}
