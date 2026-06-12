# Files: wave3-orchestrator

## Create (9)

| File | Purpose |
|------|---------|
| `orchestrator/nursery.ts` | Age-keyed candidate queue: add at birth, warmup callback at ripenAge−warmup, ripe callback once at ripenAge, drop at maxAge; bounded; injected clock |
| `orchestrator/pipeline.ts` | evaluateCandidate(candidate, deps): cheap filter → enrich → full filter → decide → approve → buy; emits candidate_filtered / risk_block; returns a stage-tagged outcome for logging/tests |
| `orchestrator/ticks.ts` | startTickLoop(engine, tradeBuffer, intervalMs): poll open-position mints → onTick; returns stop() |
| `orchestrator/daily.ts` | DailyTracker: boot from db, accumulate position_closed, trip daily-loss kill, UTC-rollover release (only daily_loss reasons); exposes pnl + day |
| `orchestrator/index.ts` | boot()/shutdown(): wiring per sequence; signal handlers; the PM2 entry |
| `ecosystem.config.cjs` | PM2 app def (tsx orchestrator/index.ts, env passthrough note, autorestart) |
| `tests/orchestrator/nursery.test.ts` | fake clock: warmup fires before ripe; ripe fires once; max-age drop; bound eviction |
| `tests/orchestrator/pipeline.test.ts` | mocked deps: full BUY path (order of stage calls + events), cheap-filter reject (no enrich call), enrich null (drop), SKIP (no approve), RiskBlock (risk_block emitted, no buy), buy throw (logged, survives) |
| `tests/orchestrator/daily.test.ts` | accumulation, kill trip at exactly −limit, rollover releases daily_loss only |

## Modify (1)

| File | Change |
|------|--------|
| `tsconfig.json` | include += `orchestrator/**/*.ts` |

Total: 10 — within integration scope.
