# Context: wave3-orchestrator

All seven Wave 2 modules are DONE; their handoffs (HANDOFFS.md) are the
integration contracts. The relevant surfaces:

- ingestion: start(bus), stop(), subscribeTrades/unsubscribeTrades(mints),
  tradeBuffer.{latestPrice, volumeStats, evictStale, recentTicks},
  bondingCurveProgressPct(vSol). Emits raw_token only. Reconnect-safe.
- filter: evaluate(candidate, context, thresholds?) → FilterResult. Run twice:
  cheap (empty context) then full (map EnrichedCandidate fields). Missing-context
  rules skip. Orchestrator emits candidate_filtered itself.
- enrichment: enrich(candidate, deps) → EnrichedCandidate | null; REQUIRED deps:
  provider (createHeliusProvider()), volumeAccelerating(mint), bondingCurvePct(mint).
  Emits candidate_enriched internally. Never throws.
- decision: decide(enriched) → Promise<Decision>; never rejects; emits + persists
  internally. Call only for filter survivors.
- risk: approve(decision, portfolioState) pure → RiskedOrder|RiskBlock (caller
  emits risk_block); isKillActive/activateKill/releaseKill; checkDailyLossKill(pnl).
  Day rollover is THIS module's job.
- execution: createExecutor({priceOf, bus}) → {buy(order, symbol?), sell};
  buy emits position_opened; refuses (throws) when priceOf undefined.
- positions: PositionEngine({executor: executor.sell, bus}) — auto-opens from
  position_opened events; engine.onTick(mint, price); onKillSwitch auto via bus;
  engine.openPositions().
- db: attachPersistence(bus) ONCE at boot; getDailyStats(utcDay(now)); decision
  rows written by decision/ (do not re-persist).

Conventions: ESM/NodeNext (.js imports), strict TS, vitest, createLogger, no
console.log. tsconfig needs orchestrator/** added to include (orchestrator-scope
toolchain touch, sanctioned). Env all verified live 2026-06-12; PumpPortal wallet
funded (trade streams unlocked).
