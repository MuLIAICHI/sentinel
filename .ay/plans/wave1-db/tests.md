# Tests: wave1-db

## tests/db/persist.test.ts — pure, deterministic, no DB

| Test | Requirement | Expected |
|------|-------------|----------|
| raw_token → [insert raw_tokens, bump tokens_seen] | audit everything seen | 2 ops, correct params |
| candidate_filtered (passed) → bump passed_filter | funnel counting | 1 op |
| candidate_filtered (failed) → no ops | only survivors counted | 0 ops |
| candidate_enriched → bump enriched | funnel | 1 op |
| decision BUY / SKIP → insert decisions + bump buys/skips | every Claude call logged | snapshot jsonb included |
| position_opened/updated/closed → upsert positions (+ stats on open/close) | full Position records | upsert params match fixture; close adds realized_pnl |
| risk_block → bump risk_blocks | risk visibility | 1 op |
| kill_switch active → update kill_state + bump kill_events | kill state tracked | 2 ops |
| kill_switch release → update kill_state only | no spurious kill count | 1 op |
| **exhaustiveness**: every BotEvent['type'] handled | task: every event has a path | compile-time `never` check + runtime loop over all 9 |

## tests/db/integration.test.ts — live DB, auto-skips without DATABASE_URL

| Test | Requirement | Expected |
|------|-------------|----------|
| migrate is idempotent (run twice) | migrations | second run applies 0 |
| raw_token insert → row readable | raw_tokens | round-trip equality |
| position open → getOpenPositions; close → gone + realized pnl stored | positions lifecycle | status transitions correct |
| decision insert → getDecisions returns ordered | decisions | latest first |
| bumpDailyStat ×2 same day → single row, value 2 | daily_stats upsert | accumulation works |
| kill_state: get → seeded row; set → updated; only one row possible | kill_state single-row | CHECK violation on second row |
| attachPersistence(bus): emit raw_token → row appears | end-to-end "log first" | row in raw_tokens |

Suite gating: `describe.skipIf(!process.env.DATABASE_URL)` — deterministic in CI
without secrets, real verification when the human has exported the URL.
