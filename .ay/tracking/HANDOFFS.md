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

---
[2026-06-10 19:30] foundation > all
Subject: wave1-db DONE — Wave 1 complete, all of Wave 2 except execution is READY
Detail: The DB layer is live against Supabase project "sentinel-bot" (ADR-004).
What you code against (import from 'db/queries.js' / 'db/persist.js'):
- queries: insertRawToken, insertDecision(d, snapshot), upsertPosition,
  getOpenPositions, getClosedPositions, getDecisions, getDailyStats, bumpDailyStat,
  addRealizedPnl, getKillState/setKillState, getCreatorHistory, utcDay.
- persist: attachPersistence(bus) is called ONCE by the orchestrator at boot —
  leaf modules just emit events; rows happen.
- migrations: npm run db:migrate (idempotent); add NNN_name.sql under db/migrations/.
Per-agent notes:
- decision (D): you MUST call insertDecision(decision, enrichedSnapshot) yourself —
  the bus only counts buys/skips; your row carries the audit snapshot (ADR-005).
- risk (E): kill switch state = getKillState/setKillState (single DB row, CHECK id=1).
  Concurrency check = getOpenPositions().length.
- filter (B): getCreatorHistory(creator) gives launch counts for dev_repeat_rugger
  (rug labeling lands later via enrichment).
- Env: DATABASE_URL = Supabase session-pooler URI, human-supplied shell env only.
  Passwords with + $ / , must be percent-encoded in the URI.
Open: RLS hardening SQL pending human decision (see diff-from-plan #5).
---

---
[2026-06-10 20:10] foundation > execution
Subject: pumpmolt audit DONE (SAFE-WITH-CHANGES, ADR-006) — your task is READY with conditions
Detail: Read docs/audits/pumpmolt-audit.md before planning. Binding conditions
(already merged into .ay/tasks/wave2-execution.md): VENDOR the ~200-LOC trade path
at commit 7119de43 with keypair injection — do not npm-install pumpmolt (it reads
the key env var internally; that breaks signer isolation). Verify fee payer +
program ids before signing (it blind-signs PumpPortal responses). §6 of the report
has the API shapes worth keeping (PumpPortal request fields, OperationResult).
Your Gate 1 (integration plan sign-off) still applies before writing live.ts.
---
