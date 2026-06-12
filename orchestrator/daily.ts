/**
 * Daily realized-P&L tracking, the daily-loss kill, and the UTC day rollover.
 *
 * Per risk/'s handoff: checkDailyLossKill() is the pure threshold; ACTIVATING
 * the kill and RELEASING it on day rollover are the orchestrator's job — that
 * is this file. Manual kills (a human hit the button) are never auto-released.
 */

import type { Bus } from '../core/bus.js';
import { createLogger } from '../core/logger.js';
import { checkDailyLossKill } from '../risk/index.js';
import { utcDay } from '../db/queries.js';

const log = createLogger('orchestrator/daily');

export interface DailyTrackerOptions {
  /** Load a day's already-realized pnl at boot (db getDailyStats wrapper). */
  loadPnl: (day: string) => Promise<number>;
  /** Trip the kill switch (risk activateKill). */
  activateKill: (reason: string) => Promise<void>;
  /** Release the kill switch (risk releaseKill). */
  releaseKill: (reason: string) => Promise<void>;
  /** Current kill state, used at rollover (risk getKillState wrapper). */
  getKillReason: () => Promise<{ active: boolean; reason: string }>;
  /** Clock, injectable for tests. */
  now?: () => number;
}

export class DailyTracker {
  private readonly opts: DailyTrackerOptions;
  private readonly now: () => number;
  private day = '';
  private pnlSol = 0;
  private killTripped = false;

  constructor(options: DailyTrackerOptions) {
    this.opts = options;
    this.now = options.now ?? Date.now;
  }

  /** Load today's already-realized pnl (process restarts mid-day must not forget losses). */
  async boot(): Promise<void> {
    this.day = utcDay(this.now());
    this.pnlSol = await this.opts.loadPnl(this.day);
    this.killTripped = checkDailyLossKill(this.pnlSol);
    log.info('daily tracker booted', { day: this.day, pnlSol: this.pnlSol, killTripped: this.killTripped });
  }

  /** Subscribe to realized P&L (position_closed events). */
  attach(bus: Bus): void {
    bus.on('position_closed', (position) => {
      if (position.realizedPnlSol === undefined) return;
      this.record(position.realizedPnlSol);
    });
  }

  /** Today's realized P&L in SOL (negative = loss). */
  currentPnl(): number {
    return this.pnlSol;
  }

  /**
   * Advance the day if UTC midnight passed. Called on an interval. Resets the
   * counter and releases the kill ONLY if it was a daily_loss kill.
   */
  async rollover(): Promise<void> {
    const today = utcDay(this.now());
    if (today === this.day) return;
    log.info('utc day rollover', { from: this.day, to: today, closedDayPnl: this.pnlSol });
    this.day = today;
    this.pnlSol = await this.opts.loadPnl(today);
    this.killTripped = false;
    try {
      const kill = await this.opts.getKillReason();
      if (kill.active && kill.reason === 'daily_loss') {
        await this.opts.releaseKill('new_utc_day');
      }
    } catch (err) {
      log.error('rollover kill-release failed', { error: String(err) });
    }
  }

  private record(realizedPnlSol: number): void {
    this.pnlSol += realizedPnlSol;
    if (!this.killTripped && checkDailyLossKill(this.pnlSol)) {
      this.killTripped = true;
      log.warn('daily loss limit reached — tripping kill switch', { pnlSol: this.pnlSol });
      void this.opts.activateKill('daily_loss').catch((err) => {
        // If the DB write failed the switch is NOT active; allow a retry on
        // the next losing close rather than believing we are protected.
        this.killTripped = false;
        log.error('activateKill failed', { error: String(err) });
      });
    }
  }
}
