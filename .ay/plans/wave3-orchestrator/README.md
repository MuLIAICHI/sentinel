# Plan: wave3-orchestrator — wire the pipeline, own the event loop

## Goal

A bootable paper-trading process: `raw_token → (nursery ripening) → filter →
enrich → decide → (BUY) → risk.approve → execute → positions`, with persistence,
kill-switch handling, daily-loss tracking, graceful shutdown, and a PM2 config.

## The central design problem this task solves

`age_too_young` rejects tokens younger than ~20 min — deliberately. So the
pipeline is NOT a straight event chain: every newborn fails today. The
orchestrator adds a **nursery**: tokens enter at birth, trade subscriptions warm
up at ripenAge − warmup (18 min default, so 2 min of tick history exists at
evaluation), evaluation fires once at ripenAge (20 min), tokens age out at
maxAge (60 min, end of the graduation window). This also bounds the metered
PumpPortal trade-stream spend: we never subscribe to the firehose, only to
tokens inside the [18 min, evaluation] window and open positions.

## Approach

1. `nursery.ts` — pure-ish age-keyed queue with injected clock; emits "ripe"
   candidates to a callback; bounded size (drop oldest — they age out anyway).
2. `pipeline.ts` — evaluateCandidate(): two-stage filter per filter's handoff
   (cheap context, then enriched context), enrich with injected ingestion
   signals, decide(), risk.approve() with live PortfolioState, executor.buy(),
   each stage emitting its proper bus event. All deps injected (fully testable).
3. `ticks.ts` — 2s poll loop: open-position mints → tradeBuffer.latestPrice →
   engine.onTick. (Minutes-scale strategy; polling beats new bus plumbing.)
4. `daily.ts` — daily realized P&L tracking (boot from getDailyStats, accumulate
   from position_closed), checkDailyLossKill → activateKill('daily_loss'), UTC
   rollover release of daily_loss kills only.
5. `index.ts` — boot order per db handoff: config preflight → attachPersistence
   → kill state load → engine+executor → ingestion.start → nursery scheduler →
   tick loop. SIGINT/SIGTERM: stop ingestion first, flush, exit.
6. `ecosystem.config.cjs` — PM2 (cjs because the repo is ESM), runs via tsx.

## Key decisions

- Nursery instead of straight chaining (see above) — the SPEC's funnel implies it.
- bondingCurvePct(mint): latest tick's vSol via bondingCurveProgressPct; no ticks
  → 0 → fails the 55–85 band → rejected. Correct: no trades in 18 min = dead.
- knownBadCreators: empty set v1 (rug labeling doesn't exist yet; documented).
- holderGrowthPerMin stays 0 (one enrichment sample; two-sample fn exists for later).
- PortfolioState: openPositionsCount from engine (in-memory), pnl from daily.ts,
  kill from cached bus state (refreshed by kill_switch events + DB at boot).

## Risks

- Live behavior depends on real traffic shape; the [human-verify] step is a
  supervised live run watching the funnel before calling it done.
- Metered spend: bounded by design (subscribe window + unsubscribe on reject/
  close + evictStale sweep), but the live run should sanity-check message volume.
