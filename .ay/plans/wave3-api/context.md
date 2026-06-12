# Context: wave3-api

- Bot is LIVE (paper mode) via `tsx orchestrator/index.ts`; restart needed after
  wiring the API into boot() — also re-verifies graceful shutdown.
- bus.onAny(handler) is the forwarder hook (built for exactly this — api/db).
- Snapshot sources (db/queries.js): getOpenPositions, getClosedPositions,
  getDecisions(limit), getDailyStats(utcDay(now)), getKillState.
- Kill: risk/index.js activateKill(reason)/releaseKill(reason) — DB write then
  bus emit; orchestrator caches kill state from the bus event; PositionEngine
  auto-flattens on active:true.
- Funnel display note (orchestrator handoff): daily_stats.passed_filter counts
  both filter passes; UI/api should expose stats as-is and let the UI label it.
- Conventions: ESM/NodeNext .js imports, strict TS, vitest, createLogger,
  injected deps, no console.log. tsconfig include += api/**.
- deps to install: express, @types/express (ws already present).
- Scope (integration agent): api/, tests/api/, orchestrator/ (mine), tsconfig.
