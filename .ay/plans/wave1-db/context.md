# Context: wave1-db

## Codebase state

`core/` exists and is FROZEN (ADR-001): types, bus (`bus.onAny` is the designed
hook for persistence), config (`requireEnv('DATABASE_URL')` already in the
KnownEnvVar union), logger (redacts secret-named fields — DATABASE_URL value must
never be logged; pass it nowhere except the Pool constructor).

## Conventions inherited (ADR-002)

- ESM + NodeNext: relative imports need `.js` extensions.
- Strict TS (+ noUncheckedIndexedAccess, exactOptionalPropertyTypes).
- vitest; all logging via `createLogger('db/...')`.
- tsconfig `include` must gain `"db/**/*.ts"` — one-line toolchain edit, in scope.

## SPEC §6 requirements

Five tables: raw_tokens (audit all seen), decisions (every Claude call w/ input
snapshot, action, confidence, reasoning, latency, cost), positions (full Position
records), daily_stats (per-day P&L, counts, kill events), kill_state (single row).
"Log first, act second — if it's not in the DB, it didn't happen."

## BotEvent → persistence map (all 9 types accounted for)

| Event | Path |
|---|---|
| raw_token | insert `raw_tokens` + daily_stats.tokens_seen++ |
| candidate_filtered | daily_stats.passed_filter++ (when passed) / no row otherwise — filter results ride on decisions' input snapshots |
| candidate_enriched | daily_stats.enriched++ |
| decision | insert `decisions` + daily_stats.buy/skip++ |
| position_opened | upsert `positions` + daily_stats.positions_opened++ |
| position_updated | upsert `positions` |
| position_closed | upsert `positions` + daily_stats.realized_pnl_sol += |
| risk_block | daily_stats.risk_blocks++ |
| kill_switch | update `kill_state` + daily_stats.kill_events++ (on activation) |

## Wave 2 consumers (what the helpers must serve)

- risk/ (E): `getOpenPositions()`, `getDailyStats()`, `getKillState()`/`setKillState()`
- positions/ (G): open positions + closes
- api/ (W3): `/positions`, `/decisions`, `/stats` snapshots
- filter/ (B): known-bad creator set → `getCreatorHistory(creator)` over raw_tokens/positions (seeded later by enrichment)
