'use client';

/**
 * Open positions with distance-to-exit. The pipeline engine does not stream
 * price ticks (only partial-sell updates), so price-based distances are shown
 * relative to ENTRY — where each mechanical exit sits — while the time stop
 * counts down live off the wall clock passed in as `nowMs`.
 */

import type { DashState } from '../lib/reducer.js';
import { distanceToExits, fmtAge, fmtPct, fmtSol, unrealizedPnl } from '../lib/format.js';

export function PositionsTable({ state, nowMs }: { state: DashState; nowMs: number }) {
  return (
    <section className="panel">
      <h2>open positions ({state.open.length})</h2>
      {state.open.length === 0 ? (
        <div className="empty">no open positions</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>sym</th>
              <th className="num">entry ◎</th>
              <th className="num">u-pnl</th>
              <th className="num">age</th>
              <th className="num">→ tp</th>
              <th className="num">→ hard</th>
              <th className="num">→ trail</th>
              <th className="num">→ time</th>
            </tr>
          </thead>
          <tbody>
            {state.open.map((p) => {
              const upnl = unrealizedPnl(p, p.lastPrice);
              const d = distanceToExits(p, p.lastPrice, p.peakPrice, nowMs);
              return (
                <tr key={p.id}>
                  <td><span className="sym">{p.symbol}</span></td>
                  <td className="num">{p.entrySol.toFixed(4)}</td>
                  <td className={`num ${upnl > 0 ? 'pos' : upnl < 0 ? 'neg' : 'flat'}`}>{fmtSol(upnl)}</td>
                  <td className="num">{fmtAge(nowMs - p.entryAt)}</td>
                  <td className="num"><span className="dist">{fmtPct(d.takeProfitPct)}</span></td>
                  <td className="num"><span className="dist">{fmtPct(d.hardStopPct)}</span></td>
                  <td className="num"><span className="dist">{d.trailingPct === null ? '—' : fmtPct(d.trailingPct)}</span></td>
                  <td className="num"><span className="dist">{fmtAge(d.timeStopMsLeft)}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
