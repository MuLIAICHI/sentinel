'use client';

/**
 * Header bar: brand, mode badge (PAPER), glowing connection status, a live
 * throughput sparkline, today's P&L, and the kill switch — the ONE control in
 * the dashboard. The switch confirms before tripping and reflects the live kill
 * state coming back over the stream.
 */

import { useState } from 'react';
import type { DashState } from '../lib/reducer.js';
import { postKill, postKillRelease } from '../lib/useStream.js';
import { fmtSol, unrealizedPnl } from '../lib/format.js';
import { Sparkline } from './Sparkline.js';

function pnlClass(n: number): string {
  return n > 0 ? 'pos' : n < 0 ? 'neg' : 'flat';
}

export function Header({ state, throughput }: { state: DashState; throughput: number[] }) {
  const [busy, setBusy] = useState(false);

  const realized = state.stats?.realizedPnlSol ?? 0;
  const unrealized = state.open.reduce((sum, p) => sum + unrealizedPnl(p, p.lastPrice), 0);
  const today = realized + unrealized;

  const mode = state.open[0]?.mode ?? 'paper';
  const kill = state.kill.active;

  async function toggleKill() {
    if (busy) return;
    const ok = kill
      ? window.confirm('Release the kill switch and resume the pipeline?')
      : window.confirm('Trip the KILL SWITCH? This flattens all open positions immediately.');
    if (!ok) return;
    setBusy(true);
    try {
      if (kill) await postKillRelease();
      else await postKill('manual_ui');
    } finally {
      setBusy(false);
    }
  }

  return (
    <header className="header">
      <span className="brand">
        <span className="brand-dot">◆</span>sentinel
      </span>
      <span className={`badge ${mode === 'live' ? 'live' : 'paper'}`}>{mode}</span>
      <span className={`conn-dot ${state.conn}`}>
        <span className="dot" />
        {state.conn}
      </span>

      <div className="spacer" />

      <div className="spark-wrap">
        <span className="label">throughput / min</span>
        <Sparkline data={throughput} color="var(--cyan)" />
      </div>

      <div className="hdr-metric">
        <div className="label">today p&amp;l</div>
        <div className={`value ${pnlClass(today)}`}>{fmtSol(today)}</div>
      </div>

      <button className={`kill-btn ${kill ? 'active' : ''}`} onClick={toggleKill} disabled={busy}>
        {kill ? 'KILLED — RELEASE' : 'KILL SWITCH'}
      </button>
    </header>
  );
}
