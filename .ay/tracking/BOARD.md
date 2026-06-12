# Pipeline Board

| # | Title | Agent | Status | Blocked By |
|---|-------|-------|--------|------------|
| 1 | wave0-audit-pumpmolt | foundation (report only; human reviews) | DONE (2026-06-10) | — (SAFE-WITH-CHANGES, ADR-006) |
| 2 | wave1-core | foundation | DONE (2026-06-10) | — (contracts frozen, ADR-001) |
| 3 | wave1-db | foundation | DONE (2026-06-10) | — (Supabase live, ADR-004) |
| 4 | wave2-ingestion | ingestion (A) | DONE (2026-06-10) | — (ADR-007; live smoke PASS) |
| 5 | wave2-filter | filter (B) | DONE (2026-06-10) | — |
| 6 | wave2-enrichment | enrichment (C) | DONE (2026-06-10) | — (ADR-008; Helius, awaiting key) |
| 7 | wave2-decision | decision (D) | DONE (2026-06-10) | — (ADR-009; awaiting key) |
| 8 | wave2-risk | risk (E) | DONE (2026-06-10) | — (SOL=$150 sizing assumption flagged) |
| 9 | wave2-execution | execution (F) | DONE (2026-06-10) | — (ADR-006; live path gated) |
| 10 | wave2-positions | positions (G) | DONE (2026-06-10) | — |
| 11 | wave3-orchestrator | integration | DONE (2026-06-12) | — (live-verified; bot running) |
| 12 | wave3-api | integration | READY | — |
| 13 | wave3-ui | integration | BACKLOG | wave3-api |

Status values: BACKLOG, READY, IN PROGRESS, DONE, BLOCKED

## Standing rules (apply to every task)

- LIVE_TRADING stays false — no agent enables it, ever.
- Never read/touch/create `.env` — ask the human for secrets by name.
- Never `git push`.
- Gate 1 pause for external APIs and the pumpmolt layer (rows marked "Gate 1").
- Only `execution/signer.ts` ever touches the private key.
