# Task: Wave 1 — db/ (Postgres schema, migrations, query helpers)

## Dependencies

- [ ] `.ay/tasks/wave1-core.md`

If all dependencies are DONE, this task is READY.

## Files to Create

- `db/schema.sql` (or migrations under `db/migrations/`)
- `db/client.ts` — pg pool, connection from config
- `db/queries.ts` — typed query helpers per table
- `db/persist.ts` — bus subscriber that persists every `BotEvent` ("log first, act second")
- `tests/db/queries.test.ts`

## Implementation

1. Tables per SPEC §6:
   - `raw_tokens` — audit of everything seen
   - `decisions` — every Claude call: input snapshot, action, confidence, reasoning, latency, cost
   - `positions` — full `Position` records
   - `daily_stats` — per-day P&L, counts, kill events
   - `kill_state` — single row: current switch state + reason
2. Typed helpers: insert/select per table, `getOpenPositions()`, `getDailyStats(date)`,
   `getKillState()` / `setKillState()`.
3. `db/persist.ts` subscribes to all `BotEvent`s on the bus and writes them.
4. Connection string via `core/config.ts` (`DATABASE_URL` — ask human to populate;
   never touch `.env`).

## Verification

- [ ] All files listed above exist
- [ ] `npx tsc --noEmit` clean
- [ ] `npm test -- db` passes (against a local/ephemeral Postgres)
- [ ] Manual check: every `BotEvent` type has a persistence path or an explicit "not persisted" note

## Unblocks

- `.ay/tasks/wave2-ingestion.md`
- `.ay/tasks/wave2-filter.md`
- `.ay/tasks/wave2-enrichment.md`
- `.ay/tasks/wave2-decision.md`
- `.ay/tasks/wave2-risk.md`
- `.ay/tasks/wave2-execution.md` (also needs wave0-audit-pumpmolt)
- `.ay/tasks/wave2-positions.md`

Update BOARD.md when marking this DONE.
