'use client';

/**
 * The dashboard. One websocket (useStream), one reducer, six panels. Read-only
 * except the kill switch in the header. A 1s clock tick drives live ages and
 * the time-stop countdown; a slower sampler builds the header throughput
 * sparkline from the live "tokens seen" counter. Neither touches the reducer.
 */

import { useEffect, useRef, useState } from 'react';
import { useStream } from '../lib/useStream.js';
import { Header } from '../components/Header.js';
import { Funnel } from '../components/Funnel.js';
import { DecisionFeed } from '../components/DecisionFeed.js';
import { PositionsTable } from '../components/PositionsTable.js';
import { HistoryTable } from '../components/HistoryTable.js';
import { StatsPanel } from '../components/StatsPanel.js';
import { Tokenomics } from '../components/Tokenomics.js';
import { AuthGate } from '../components/AuthGate.js';

const SAMPLE_MS = 3000;
const SERIES_LEN = 40;

export default function Page() {
  return (
    <AuthGate>
      <Dashboard />
    </AuthGate>
  );
}

function Dashboard() {
  const { state } = useStream();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [throughput, setThroughput] = useState<number[]>([]);

  // Latest seen-count, refreshed every render so the sampler reads it without
  // re-subscribing on every event.
  const latestSeenRef = useRef(state.live.tokensSeen);
  latestSeenRef.current = state.live.tokensSeen;
  const lastSampleRef = useRef(state.live.tokensSeen);

  // Live clock for ages + time-stop countdown.
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Throughput sampler: tokens/min derived from the seen-counter delta.
  useEffect(() => {
    const id = setInterval(() => {
      const seen = latestSeenRef.current;
      const perMin = Math.max(0, seen - lastSampleRef.current) * (60_000 / SAMPLE_MS);
      lastSampleRef.current = seen;
      setThroughput((prev) => [...prev, perMin].slice(-SERIES_LEN));
    }, SAMPLE_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="app">
      <Header state={state} throughput={throughput} />

      {state.conn === 'down' && (
        <div className="banner">
          <span>⚠</span> stream disconnected — the bot process looks stopped. Reconnecting…
        </div>
      )}

      <div className="content">
        <div className="col-left">
          <Funnel state={state} />
          <PositionsTable state={state} nowMs={nowMs} />
          <DecisionFeed state={state} />
        </div>

        <div className="col-right">
          <StatsPanel state={state} />
          <Tokenomics state={state} />
          <HistoryTable state={state} />
        </div>
      </div>
    </div>
  );
}
