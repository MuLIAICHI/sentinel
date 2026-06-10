# Pipeline Board

| # | Title | Agent | Status | Blocked By |
|---|-------|-------|--------|------------|
| 1 | wave0-audit-pumpmolt | foundation (report only; human reviews) | READY | — (Gate: human sign-off on report) |
| 2 | wave1-core | foundation | DONE (2026-06-10) | — (contracts frozen, ADR-001) |
| 3 | wave1-db | foundation | READY | — |
| 4 | wave2-ingestion | ingestion (A) | BACKLOG | wave1-core, wave1-db (Gate 1: PumpPortal WS) |
| 5 | wave2-filter | filter (B) | BACKLOG | wave1-core, wave1-db |
| 6 | wave2-enrichment | enrichment (C) | BACKLOG | wave1-core, wave1-db (Gate 1: data provider sign-off) |
| 7 | wave2-decision | decision (D) | BACKLOG | wave1-core, wave1-db (Gate 1: Anthropic API) |
| 8 | wave2-risk | risk (E) | BACKLOG | wave1-core, wave1-db |
| 9 | wave2-execution | execution (F) | BACKLOG | wave1-core, wave1-db, wave0-audit-pumpmolt (Gate 1: pumpmolt) |
| 10 | wave2-positions | positions (G) | BACKLOG | wave1-core, wave1-db |
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
