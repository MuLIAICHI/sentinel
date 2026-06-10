# Agent Handoffs

Write gotchas, API discoveries, and decisions here.
Other agents read this before starting work.

Format:
---
[YYYY-MM-DD HH:MM] agent-name > target-agent (or "all")
Subject: one-line summary
Detail: what you discovered, why it matters, what to do about it
---

---
[2026-06-10 13:30] first-contact > all
Subject: Board generated from docs/SPEC.md — read your agent file before starting
Detail: 13 tasks across Waves 0–3 are on BOARD.md. Each agent has a definition in
.claude/agents/<name>.md with scope, hard rules, and Gate 1 requirements baked in.
READY now: wave0-audit-pumpmolt and wave1-core (both foundation). Everything else is
BACKLOG until Wave 1 is DONE and the human freezes core/types.ts. Four tasks carry a
Gate 1 human pause (ingestion, enrichment, decision, execution) — do not start their
external wiring without sign-off. Open questions for the human are listed in the
First Contact summary: enrichment data provider, current Haiku-class model id, and
the dollar→SOL conversion for risk constants.
---
