# Files: wave1-db

## Create (8)

| File | Purpose |
|------|---------|
| `db/migrations/001_init.sql` | SPEC §6 tables: raw_tokens, decisions, positions, daily_stats, kill_state (+ CHECK id=1, seed row) |
| `db/migrate.ts` | Tiny applier: schema_migrations table, applies `NNN_*.sql` in order, idempotent |
| `db/client.ts` | Lazy `pg` Pool from `requireEnv('DATABASE_URL')`; `query()` + `closePool()` |
| `db/queries.ts` | Typed helpers: inserts/upserts per table, getOpenPositions, getDecisions, getDailyStats, bumpDailyStat, getKillState/setKillState, getCreatorHistory |
| `db/persist.ts` | `routeEvent(BotEvent) → DbOp[]` (pure) + `attachPersistence(bus)` executor |
| `tests/db/persist.test.ts` | Pure mapper: all 9 BotEvent types → expected ops (deterministic, no DB) |
| `tests/db/integration.test.ts` | Live round-trips; auto-skips without DATABASE_URL |
| `tests/db/fixtures.ts` | Shared BotEvent/Position/Decision fixtures |

## Modify (2)

| File | Change |
|------|--------|
| `package.json` | deps: `pg`; devDeps: `@types/pg`; script: `db:migrate` |
| `tsconfig.json` | `include` += `db/**/*.ts` |

## Delete (0)

Total: 10 files — within foundation scope (`db/`, `tests/db/`) + sanctioned
toolchain touches (rules.md #1).
