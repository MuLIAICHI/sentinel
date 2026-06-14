'use client';

/**
 * The live feed. Rejects are compact one-liners with color-coded rule chips
 * (the firehose); decisions and position events are visually prominent. Newest
 * first, capped by the reducer. Keys are content-stable so only newly-arrived
 * rows play the entry animation.
 */

import type { DashState } from '../lib/reducer.js';
import type { FeedItem } from '../lib/types.js';
import { fmtSol } from '../lib/format.js';
import { pumpFunUrl } from '../lib/links.js';

/** A token symbol that links out to its pump.fun coin page (live chart). */
function CoinSym({ mint, label }: { mint: string; label: string }) {
  return (
    <a className="fsym" href={pumpFunUrl(mint)} target="_blank" rel="noreferrer" title={mint}>
      {label}
    </a>
  );
}

/** Map a filter rule id to a short label + chip color class + plain-English meaning. */
const RULE_META: Record<string, { label: string; cls: string; desc: string }> = {
  age_too_young: { label: 'age', cls: 'chip-age', desc: 'younger than 20 min' },
  bonding_curve_out_of_band: { label: 'curve', cls: 'chip-curve', desc: 'curve % outside 55–85 band' },
  dead_volume: { label: 'vol', cls: 'chip-vol', desc: 'volume not accelerating' },
  holder_concentration: { label: 'top10', cls: 'chip-conc', desc: 'top-10 wallets hold > 25%' },
  dev_dumped: { label: 'dev-sold', cls: 'chip-dev', desc: 'dev sold > 50% of bag' },
  dev_repeat_rugger: { label: 'rugger', cls: 'chip-rug', desc: 'creator is a known rugger' },
};

/** Order shown in the legend. */
const LEGEND_ORDER = [
  'age_too_young',
  'bonding_curve_out_of_band',
  'dead_volume',
  'holder_concentration',
  'dev_dumped',
  'dev_repeat_rugger',
];

function Legend() {
  return (
    <div className="legend">
      <span className="legend-title">reject reasons:</span>
      {LEGEND_ORDER.map((id) => {
        const m = RULE_META[id]!;
        return (
          <span key={id} className="legend-item" title={m.desc}>
            <span className={`chip ${m.cls}`}>{m.label}</span>
            <span className="legend-desc">{m.desc}</span>
          </span>
        );
      })}
    </div>
  );
}

function clock(at: number): string {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function keyOf(item: FeedItem): string {
  switch (item.kind) {
    case 'reject':
      return `r-${item.at}-${item.mint}`;
    case 'decision':
      return `d-${item.at}-${item.decision.mint}`;
    case 'position':
      return `p-${item.at}-${item.position.id}-${item.event}`;
    case 'kill':
      return `k-${item.at}-${item.active}`;
  }
}

function Row({ item }: { item: FeedItem }) {
  const at = <span className="at">{clock(item.at)}</span>;

  switch (item.kind) {
    case 'reject':
      return (
        <div className="feed-row">
          {at}
          <CoinSym mint={item.mint} label={item.symbol || item.mint.slice(0, 6)} />
          <span className="chip chip-stage">{item.stage}</span>
          {item.rules.map((r) => {
            const meta = RULE_META[r] ?? { label: r, cls: 'chip-stage' };
            return (
              <span key={r} className={`chip ${meta.cls}`}>
                {meta.label}
              </span>
            );
          })}
        </div>
      );
    case 'decision': {
      const buy = item.decision.action === 'BUY';
      return (
        <div className={`feed-row decision ${buy ? 'buy' : 'skip'}`}>
          {at}
          <CoinSym mint={item.decision.mint} label={item.decision.mint.slice(0, 8)} />
          <span className={`chip ${buy ? 'chip-buy' : 'chip-skip'}`}>{item.decision.action}</span>
          <span className="detail">
            {Math.round(item.decision.confidence * 100)}% · {item.decision.reasoning}
          </span>
        </div>
      );
    }
    case 'position':
      return (
        <div className="feed-row position">
          {at}
          <span className="fsym">{item.position.symbol}</span>
          <span className="chip chip-pos">{item.event}</span>
          <span className="detail">
            {item.event === 'closed'
              ? `${item.position.exitReason ?? ''} · ${fmtSol(item.position.realizedPnlSol ?? 0)}`
              : `entry ${fmtSol(item.position.entrySol)}`}
          </span>
        </div>
      );
    case 'kill':
      return (
        <div className="feed-row kill">
          {at}
          <span className="fsym">⚠ KILL</span>
          <span className="detail">
            {item.active ? 'activated' : 'released'} — {item.reason}
          </span>
        </div>
      );
  }
}

export function DecisionFeed({ state }: { state: DashState }) {
  return (
    <section className="panel" style={{ flex: 1 }}>
      <h2>
        live feed <span className="count">— {state.feed.length} recent</span>
      </h2>
      <Legend />
      {state.feed.length === 0 ? (
        <div className="empty">waiting for activity…</div>
      ) : (
        <div className="feed">
          {state.feed.map((item) => (
            <Row key={keyOf(item)} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}
