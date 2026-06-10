# Plan: wave1-db — Postgres schema, migrations, typed queries, event persistence

## Goal

Build `db/` — the SPEC §6 schema (raw_tokens, decisions, positions, daily_stats,
kill_state), a pg client, typed query helpers, and a bus subscriber that persists
every BotEvent ("log first, act second"). Completing this unblocks all seven
Wave 2 tasks.

## Approach

1. Schema as plain SQL migration files under `db/migrations/` — no ORM, no
   migration framework (buy-before-build cuts the other way here: one bot, five
   tables; a `node:fs` loop that applies `NNN_*.sql` in order is the whole tool).
2. `db/client.ts` — `pg` Pool built from `requireEnv('DATABASE_URL')`, lazy.
3. `db/queries.ts` — typed helpers per table.
4. `db/persist.ts` — **split into a pure mapper and a thin executor**:
   `routeEvent(BotEvent) → DbOp[]` is pure and deterministically tested with no
   database; the executor applies ops through the client. Funnel events
   (candidate_filtered, candidate_enriched, risk_block) persist as daily_stats
   counter increments — every one of the 9 BotEvent types has a stated path.
5. **Database = Supabase** (human offered it this cycle). The code is
   vendor-neutral Postgres; Supabase provisioning happens via its MCP
   (OAuth → create project → apply migrations). Integration tests run only when
   `DATABASE_URL` is present in the environment; otherwise they skip cleanly.

## Key Decisions

- **No ORM / no migration framework** — plain SQL + a 30-line applier.
- **Pure mapper / thin executor** split so core correctness is testable without
  a live DB (deterministic-tests rule).
- **Supabase as hosted Postgres** — zero local install; connection string is
  standard Postgres so nothing locks in. Human supplies `DATABASE_URL` via shell
  env when running integration tests / the bot. **Never via `.env`.**

## Risks / Open Questions

- Supabase MCP needs OAuth in-session — if the flow stalls, fallback is the human
  pasting `DATABASE_URL` into the shell env and migrations applied via `psql`/node.
- Supabase free-tier pauses idle projects (~1 week); fine for build phase, noted
  for the 3–4 day paper run (keep activity or upgrade).
- `decisions.cost_usd`: SPEC §6 wants cost logged; the Decision type (frozen) has
  no cost field — decision/ (Agent D) will compute it; column is nullable until then.
