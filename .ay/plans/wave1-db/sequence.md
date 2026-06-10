# Sequence: wave1-db

| # | Step | Files | Checkpoint |
|---|------|-------|------------|
| 1 | Add `pg`/`@types/pg`, extend tsconfig include, `npm install` | package.json, tsconfig.json | [auto] install ok, tsc clean |
| 2 | Write `001_init.sql` (5 tables + constraints + kill_state seed) and `db/migrate.ts` | db/migrations/001_init.sql, db/migrate.ts | [auto] tsc clean (SQL exercised in step 6) |
| 3 | `db/client.ts` + `db/queries.ts` | db/client.ts, db/queries.ts | [auto] tsc clean |
| 4 | `db/persist.ts` (pure router + executor) + fixtures + mapper tests | db/persist.ts, tests/db/fixtures.ts, tests/db/persist.test.ts | [auto] `vitest run persist` green — all 9 event types covered |
| 5 | **Provision Supabase**: MCP OAuth (user clicks auth URL), create/select project, get pooler connection string into shell env as DATABASE_URL | — | [human-action] user completes OAuth + confirms DATABASE_URL exported |
| 6 | Run `db:migrate` against Supabase; run integration suite | tests/db/integration.test.ts | [auto] migrations applied, integration green |
| 7 | Full gate: `tsc --noEmit` + `vitest run` (entire repo) | — | [auto] all green |

Fallback for step 5 if the MCP OAuth flow stalls: human creates the project in the
Supabase dashboard and exports DATABASE_URL in the shell — same end state, step 6
unchanged. No step touches more than 5 files.
