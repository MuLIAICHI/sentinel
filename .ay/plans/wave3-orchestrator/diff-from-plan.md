# Diff from plan: wave3-orchestrator

1. **Live finding — pump.fun launch rate is ~28 tokens/min (~40k/day), not the
   ~1–2/min assumed.** First live run (20:23–20:56 UTC): 584 tokens seen in 21
   minutes, zero errors, funnel flowing, 7+ candidates enriched and correctly
   full-rejected. Consequence: the planned cheap pass (age-only context) passed
   100% of ripened tokens → every token cost a Helius enrichment → ~1.6M
   credits/day projected, which would exhaust the 10M Developer plan in ~6 days.
2. **Fix (same verdicts, smaller bill):** the cheap filter pass now receives the
   FREE local ring-buffer signals (bondingCurvePct, volumeAccelerating) — the
   exact same injected values the full pass sees via enrichment, so the set of
   rejected tokens is identical; only the rejection POINT moves to before the
   paid call. Implemented in orchestrator/index.ts (cheapContext); v2 run
   relaunched 20:58 UTC to validate the cheap/full split live.
3. **Graceful shutdown verified under real SIGINT** during the v1→v2 restart:
   shutting down → ingestion shutdown complete → ingestion stopped, no errors.
4. **Funnel accounting note:** daily_stats.passed_filter counts BOTH filter
   passes (cheap + full) since the pipeline emits candidate_filtered twice per
   surviving candidate — the wave3-ui task should present the two stages
   distinctly (cheap-passes vs enriched-passes) rather than as one number.
5. tests/orchestrator/daily.test.ts and nursery.test.ts: 22 unit tests written
   (plan said ~18) — extra cases for throwing handlers and manual-kill rollover.
