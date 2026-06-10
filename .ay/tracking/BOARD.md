# Pipeline Board

| # | Title | Agent | Status | Blocked By |
|---|-------|-------|--------|------------|
| 1 | wave0-audit-pumpmolt | foundation (report only; human reviews) | DONE (2026-06-10) | — (SAFE-WITH-CHANGES, ADR-006) |
| 2 | wave1-core | foundation | DONE (2026-06-10) | — (contracts frozen, ADR-001) |
| 3 | wave1-db | foundation | DONE (2026-06-10) | — (Supabase live, ADR-004) |
| 4 | wave2-ingestion | ingestion (A) | READY | — (Gate 1: PumpPortal WS) |
| 5 | wave2-filter | filter (B) | DONE (2026-06-10) | — |
| 6 | wave2-enrichment | enrichment (C) | READY | — (Gate 1: data provider sign-off) |
| 7 | wave2-decision | decision (D) | READY | — (Gate 1: Anthropic API) |
| 8 | wave2-risk | risk (E) | DONE (2026-06-10) | — (SOL=$150 sizing assumption flagged) |
| 9 | wave2-execution | execution (F) | READY | — (Gate 1: pumpmolt integration plan; audit conditions in task file) |
| 10 | wave2-positions | positions (G) | DONE (2026-06-10) | — |
| 11 | wave3-orchestrator | integration | BACKLOG | all Wave 2 tasks |
| 12 | wave3-api | integration | BACKLOG | wave3-orchestrator |
| 13 | wave3-ui | integration | BACKLOG | wave3-api |

Status values: BACKLOG, READY, IN PROGRESS, DONE, BLOCKED

## Standing rules (apply to every task)

- LIVE_TRADING stays false — no agent enables it, ever.
- Never read/touch/create `.env` — ask the human for secrets by name.
- Never `git push`.
- Gate 1 pause for external APIs and the pumpmolt layer (rows marked "Gate 1").
- Only `execution/signer.ts` ever touches the private key.
