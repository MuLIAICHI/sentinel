# Diff from plan: wave1-db

1. **decisions rows are NOT written from the bus.** Plan had `decision → insert
   decisions + bump`. The bus-level `Decision` (frozen contract) carries no input
   snapshot, and the table requires one (NOT NULL). Resolution: `decision/` (Agent D)
   writes its own row via `insertDecision(decision, snapshot)` at call time; the bus
   path only bumps buys/skips counters. Documented in persist.ts and the HANDOFF.
2. **`db/migrate-cli.ts` + `tsx` devDep added** (not in files.md): `npm run db:migrate`
   needs a TS entry point and Node 20 can't strip types natively.
3. **`withClient()` added to client.ts** (not in api-reference): transactions must run
   on one dedicated connection, never across pool connections; migrate.ts uses it.
4. **001_init applied via Supabase MCP**, not the repo applier (the DB password didn't
   exist yet at that point). The migration seeds our `schema_migrations` ledger inside
   the same transaction, so the repo applier stays idempotent — verified live (applied: 0).
5. **Supabase RLS advisory:** new tables are exposed to the anon-key REST API by
   default. Remediation (enable RLS, no policies — direct pg connection unaffected)
   surfaced to the human; pending their call.
6. Test counts: 14 pure mapper + 7 live integration + 1 skip-placeholder (plan said ~17).
