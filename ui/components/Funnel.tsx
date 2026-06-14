'use client';

/**
 * The pipeline funnel: how many tokens made it through each stage since this
 * tab connected, with stage-to-stage conversion and a magnitude bar. Counts are
 * session-relative (since connect); the stats panel carries the day totals.
 */

import type { DashState } from '../lib/reducer.js';

interface Stage {
  n: number;
  label: string;
}

function conv(n: number, prev: number): string {
  if (prev <= 0) return '';
  return `${((n / prev) * 100).toFixed(n / prev < 0.01 ? 2 : 1)}%`;
}

export function Funnel({ state }: { state: DashState }) {
  const { live } = state;
  const buys = state.decisions.filter((d) => d.action === 'BUY').length;
  const positions = state.open.length + state.closed.length;

  const stages: Stage[] = [
    { n: live.tokensSeen, label: 'seen' },
    { n: live.cheapPass, label: 'cheap pass' },
    { n: live.enriched, label: 'enriched' },
    { n: live.fullPass, label: 'full pass' },
    { n: state.decisions.length, label: 'decisions' },
    { n: buys, label: 'buys' },
    { n: positions, label: 'positions' },
  ];

  const top = stages[0]!.n || 1;

  return (
    <section className="panel">
      <h2>funnel <span className="count">— since connect</span></h2>
      <div className="funnel">
        {stages.map((s, i) => (
          <div key={s.label} style={{ display: 'contents' }}>
            {i > 0 && <span className="arrow">›</span>}
            <div className="stage">
              <div className="n">{s.n.toLocaleString()}</div>
              <div className="k">{s.label}</div>
              <div className="conv">{i === 0 ? ' ' : conv(s.n, stages[i - 1]!.n)}</div>
              <div className="bar" style={{ width: `${Math.max(4, (s.n / top) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
