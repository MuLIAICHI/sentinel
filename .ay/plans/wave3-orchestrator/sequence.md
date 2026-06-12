# Sequence: wave3-orchestrator

| # | Step | Files | Checkpoint |
|---|------|-------|------------|
| 1 | tsconfig include + `orchestrator/nursery.ts` + tests | tsconfig.json, orchestrator/nursery.ts, tests/orchestrator/nursery.test.ts | [auto] tsc + nursery tests green |
| 2 | `orchestrator/daily.ts` + tests | orchestrator/daily.ts, tests/orchestrator/daily.test.ts | [auto] tests green |
| 3 | `orchestrator/pipeline.ts` + tests (the core chain, fully mocked) | orchestrator/pipeline.ts, tests/orchestrator/pipeline.test.ts | [auto] tests green |
| 4 | `orchestrator/ticks.ts` + `orchestrator/index.ts` (boot/shutdown wiring) | orchestrator/ticks.ts, orchestrator/index.ts | [auto] tsc green; full suite green |
| 5 | `ecosystem.config.cjs` + full repo gate | ecosystem.config.cjs | [auto] tsc + all tests |
| 6 | **Supervised live run**: `source ~/.sentinel-env && tsx orchestrator/index.ts` for 10–20 min; watch funnel counters in Supabase + log output; verify clean SIGINT shutdown; sanity-check trade-stream message volume | — | [human-verify] human sees the funnel moving and approves |

Boot order inside index.ts (step 4): config preflight (requireEnv fail-fast for
DATABASE_URL, PUMPPORTAL_WS_URL, HELIUS_API_KEY, SOLANA_RPC_URL, ANTHROPIC_API_KEY)
→ attachPersistence(bus) → daily.boot() + kill-state load → executor + engine →
nursery + pipeline wiring → ingestion.start(bus) → tick loop → evictStale sweep
timer. Shutdown: ingestion.stop() first → tick loop stop → nursery stop → 2s
flush grace → exit.
