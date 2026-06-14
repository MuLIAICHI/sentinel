'use client';

/**
 * Enriched-token tokenomics. Every `candidate_enriched` carries the full
 * on-chain picture (holders, concentration, dev behavior, curve, meta tags) —
 * rare and worth surfacing. Each card links out to pump.fun (live chart),
 * Solscan, and DexScreener. Newest first.
 */

import type { DashState } from '../lib/reducer.js';
import type { EnrichedCandidate } from '../lib/types.js';
import { pumpFunUrl, solscanUrl, dexScreenerUrl } from '../lib/links.js';

/** 0..100 percentage with severity coloring (high = risk for concentration/sold). */
function pctClass(n: number, riskAbove: number): string {
  return n > riskAbove ? 'neg' : n > riskAbove * 0.7 ? 'flat' : 'pos';
}

function Metric({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="tk-metric">
      <span className="tk-v">
        <span className={cls ?? ''}>{value}</span>
      </span>
      <span className="tk-l">{label}</span>
    </div>
  );
}

function Card({ t }: { t: EnrichedCandidate }) {
  return (
    <div className="tk-card">
      <div className="tk-head">
        <span className="sym">{t.symbol || t.mint.slice(0, 6)}</span>
        <span className="tk-links">
          <a href={pumpFunUrl(t.mint)} target="_blank" rel="noreferrer">
            pump↗
          </a>
          <a href={solscanUrl(t.mint)} target="_blank" rel="noreferrer">
            scan↗
          </a>
          <a href={dexScreenerUrl(t.mint)} target="_blank" rel="noreferrer">
            chart↗
          </a>
        </span>
        <span className="spacer" />
        {t.currentMetaTags.slice(0, 3).map((tag) => (
          <span key={tag} className="chip chip-stage">
            {tag}
          </span>
        ))}
      </div>
      <div className="tk-grid">
        <Metric label="curve" value={`${t.bondingCurvePct.toFixed(0)}%`} />
        <Metric label="holders" value={`${t.uniqueHolders}`} />
        <Metric label="growth/m" value={`+${t.holderGrowthPerMin.toFixed(1)}`} />
        <Metric label="top-10" value={`${t.top10HolderPct.toFixed(0)}%`} cls={pctClass(t.top10HolderPct, 25)} />
        <Metric label="dev-sold" value={`${t.devSoldPct.toFixed(0)}%`} cls={pctClass(t.devSoldPct, 50)} />
        <Metric
          label="dev hist"
          value={`${t.devPriorLaunches}L / ${t.devPriorRugs}R`}
          cls={t.devPriorRugs > 0 ? 'neg' : 'flat'}
        />
        <Metric
          label="volume"
          value={t.volumeAccelerating ? '▲ accel' : '— flat'}
          cls={t.volumeAccelerating ? 'pos' : 'flat'}
        />
      </div>
    </div>
  );
}

export function Tokenomics({ state }: { state: DashState }) {
  return (
    <section className="panel">
      <h2>
        enriched tokenomics <span className="count">({state.enrichedTokens.length})</span>
      </h2>
      {state.enrichedTokens.length === 0 ? (
        <div className="empty">no tokens enriched yet — survivors of the cheap filter land here</div>
      ) : (
        <div className="tk-list">
          {state.enrichedTokens.map((t) => (
            <Card key={`${t.mint}-${t.createdAt}`} t={t} />
          ))}
        </div>
      )}
    </section>
  );
}
