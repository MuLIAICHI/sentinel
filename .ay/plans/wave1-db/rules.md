# Rules: wave1-db

## Universal rules (13, addressed)

1. **Scope** — `db/`, `tests/db/`, plus two sanctioned toolchain touches:
   tsconfig `include` gains `db/**`, package.json gains `pg` deps.
2. **Single responsibility** — migrations / client / queries / persist are separate files.
3. **No hardcoded secrets** — connection only from `requireEnv('DATABASE_URL')`;
   no connection strings in code, tests, or fixtures.
4. **Doc comments** on every exported helper.
5. **Naming** — snake_case in SQL, camelCase in TS, mapping localized in queries.ts.
6. **No TODO/FIXME** without task link — none planned.
7. **Explicit errors** — pool errors logged via logger; persist executor catches
   per-op failures, logs, and continues (a bad row must not kill the pipeline);
   migration applier fails loudly and stops.
8. **No circular deps** — db imports core only; core never imports db.
9. **Deterministic tests** — mapper tests are pure; DB-touching tests are in a
   separate suite that auto-skips when DATABASE_URL is unset.
10. **No console.log** — `createLogger('db/...')` everywhere.
11. **Explicit imports** — no wildcards.
12. **No dead code** — helpers exist only if a named Wave 2/3 consumer needs them.
13. **Traceability** — files ↔ sequence steps below.

## Task-specific rules

- **T1. Never touch `.env`** — DATABASE_URL comes from the human's shell env or is
  handled inside the Supabase MCP; its VALUE is never written to any file, log,
  or tracking entry.
- **T2. Frozen contracts** — `Position`/`Decision` map to columns as-is; no new
  fields invented on the frozen types (nullable cost_usd column is a DB-side
  extension, not a type change).
- **T3. Parameterized SQL only** — every query uses $n placeholders; no string
  interpolation of values (SQL injection rule).
- **T4. Single-row kill_state** — enforced with a CHECK (id = 1) constraint.
- **T5. Supabase is replaceable** — nothing imports a supabase SDK; pure `pg`.
- **T6. Never run `git push`.**
