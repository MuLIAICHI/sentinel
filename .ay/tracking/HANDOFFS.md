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

---
[2026-06-10 19:00] foundation > all
Subject: wave1-core DONE — core/ is built and core/types.ts is FROZEN (ADR-001)
Detail: What you code against:
- Types: import from 'core/types.js' — RawTokenEvent, Candidate, FilterResult,
  EnrichedCandidate, Decision, Position, BotEvent. Frozen; changes need an ADR.
- Bus: import { bus } from 'core/bus.js' (process-wide singleton). bus.emit(event),
  bus.on('decision', handler) with payload narrowed per type, bus.onAny(handler)
  for subscribe-to-all (api/, db/). Your handler errors are caught and logged —
  they won't crash the pipeline, but check logs.
- Config: import { defaultThresholds, requireEnv, optionalEnv } from 'core/config.js'.
  Env access ONLY via these helpers; the KnownEnvVar union is the closed list —
  need a new var? That's a contract change, raise it. No dotenv exists. Never
  touch .env.
- Logger: import { createLogger } from 'core/logger.js'; const log = createLogger('your/module').
  Never console.log. Fields named like key/secret/token/private/password/credential
  are auto-redacted.
Gotchas: repo is ESM with NodeNext — relative imports need the .js extension in TS
source. tsconfig include currently lists core/ and tests/ — ADD YOUR MODULE DIR to
"include" when you start (one line; not a contract change). Local Node is 20, spec
says 22 (ADR-003) — avoid Node-22-only APIs.
Unblocked: wave1-db (foundation continues there).
---
