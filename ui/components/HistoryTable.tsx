'use client';

/** Closed positions: exit reason and realized P&L, newest first. */

import type { DashState } from '../lib/reducer.js';
import type { Position } from '../lib/types.js';
import { fmtAge, fmtSol } from '../lib/format.js';

/** Leftover DB test fixtures we tag rather than hide, so the table stays honest. */
function isFixture(p: Position): boolean {
  return p.id.startsWith('pos-fixture') || p.mint.startsWith('MintFixture');
}

export function HistoryTable({ state }: { state: DashState }) {
  return (
    <section className="panel">
      <h2>
        history <span className="count">({state.closed.length})</span>
      </h2>
      {state.closed.length === 0 ? (
        <div className="empty">no closed positions yet</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>sym</th>
              <th>exit</th>
              <th className="num">held</th>
              <th className="num">realized</th>
            </tr>
          </thead>
          <tbody>
            {state.closed.map((p) => {
              const pnl = p.realizedPnlSol ?? 0;
              const held = p.exitAt && p.entryAt ? p.exitAt - p.entryAt : NaN;
              return (
                <tr key={p.id}>
                  <td>
                    <span className="sym">{p.symbol}</span>
                    {isFixture(p) && <span className="fixture-tag">TEST</span>}
                  </td>
                  <td>{p.exitReason ?? '—'}</td>
                  <td className="num">{fmtAge(held)}</td>
                  <td className={`num ${pnl > 0 ? 'pos' : pnl < 0 ? 'neg' : 'flat'}`}>{fmtSol(pnl)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
