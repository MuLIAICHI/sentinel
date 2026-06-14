'use client';

/**
 * Day stats from the snapshot baseline: skip rate, win rate, realized P&L, and
 * raw counts. These are server-side day totals (db daily_stats), distinct from
 * the since-connect funnel counters.
 */

import type { DashState } from '../lib/reducer.js';
import { fmtSol } from '../lib/format.js';

function Stat({ value, label, cls }: { value: string; label: string; cls?: string }) {
  return (
    <div className="stat">
      <div className={`v ${cls ?? ''}`}>{value}</div>
      <div className="l">{label}</div>
    </div>
  );
}

export function StatsPanel({ state }: { state: DashState }) {
  const s = state.stats;
  const buys = s?.buys ?? 0;
  const skips = s?.skips ?? 0;
  const decided = buys + skips;
  const skipRate = decided > 0 ? Math.round((skips / decided) * 100) : 0;

  const closed = state.closed;
  const wins = closed.filter((p) => (p.realizedPnlSol ?? 0) > 0).length;
  const winRate = closed.length > 0 ? Math.round((wins / closed.length) * 100) : 0;

  const realized = s?.realizedPnlSol ?? 0;

  return (
    <section className="panel">
      <h2>stats — {s?.day ?? 'today'}</h2>
      <div className="stat-grid">
        <Stat value={fmtSol(realized)} label="realized p&l" cls={realized > 0 ? 'pos' : realized < 0 ? 'neg' : 'flat'} />
        <Stat value={`${winRate}%`} label="win rate" />
        <Stat value={`${skipRate}%`} label="skip rate" />
        <Stat value={String(s?.tokensSeen ?? 0)} label="tokens seen" />
        <Stat value={String(s?.enriched ?? 0)} label="enriched" />
        <Stat value={String(buys)} label="buys" />
        <Stat value={String(s?.positionsOpened ?? 0)} label="positions" />
        <Stat value={String(s?.riskBlocks ?? 0)} label="risk blocks" />
      </div>
    </section>
  );
}
