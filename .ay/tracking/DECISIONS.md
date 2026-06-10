# Architecture Decision Records

Record format:
[ADR-NNN] Title
Context: ...
Decision: ...
Rationale: ...
Alternatives: ...
Date: YYYY-MM-DD

[ADR-001] core/types.ts contracts FROZEN
Context: Every Wave 2 agent codes against the shared contracts. The spec mandates
  building them literally from docs/SPEC.md §3, human-reviewing, then freezing.
Decision: core/types.ts as shipped in task wave1-core is frozen. Human approved at
  the wave1-core review gate ("ship"). Any change now requires a new ADR + human sign-off.
Rationale: Parallel agents without merge hell requires a stable shared API.
Alternatives: Living types (rejected — drift would break seven parallel agents).
Date: 2026-06-10

[ADR-002] Repo toolchain: ESM + strict TypeScript + vitest, no dotenv
Context: wave1-core is the first code in the repo and sets conventions.
Decision: "type": "module" with NodeNext resolution (.js import specifiers),
  tsc strict (+ noUncheckedIndexedAccess, exactOptionalPropertyTypes), vitest for
  tests, zero runtime dependencies in core/. No dotenv anywhere — config reads
  process.env only and missing vars throw errors that name the variable.
Rationale: Modern Node defaults; the no-dotenv stance enforces the "never touch
  .env" hard rule at the dependency level, not just by convention.
Alternatives: CJS (legacy), jest (heavier), dotenv (violates hard rule).
Date: 2026-06-10

[ADR-003] Node version: spec says 22, dev machine runs 20
Context: docs/SPEC.md targets Node 22; the local machine has v20.20.2.
Decision: engines ">=20" for now; core uses no Node-22-only APIs. Human to either
  upgrade Node or amend the spec before orchestrator/deploy work (PM2, Wave 3).
Rationale: Nothing in Wave 1–2 needs 22; don't block the build on an upgrade.
Alternatives: Hard-require 22 (blocks dev today for no functional gain).
Date: 2026-06-10

[ADR-004] Hosted Postgres = Supabase project "sentinel-bot" (tztjjxhrvcruewxlujpi)
Context: Human offered their connected Supabase account for the DB layer.
Decision: Supabase free tier hosts the Postgres ("sentinel-bot", eu-west-1). Code is
  vendor-neutral: pure `pg` over DATABASE_URL (session pooler); no supabase-js
  anywhere. DATABASE_URL is human-supplied shell env, never a .env file.
Rationale: Zero local install, standard wire protocol, swappable for any Postgres.
Alternatives: Local Postgres (install burden), Docker (heavier dev loop).
Caveats: Free tier pauses idle projects (~1 week) — mind the 3–4 day paper run.
  RLS hardening on the 6 tables surfaced to human, pending decision.
Date: 2026-06-10

[ADR-005] Bus persistence writes counters; snapshot rows are written at source
Context: The decisions table requires the input snapshot (NOT NULL jsonb), but the
  frozen bus-level Decision (ADR-001) deliberately carries no snapshot.
Decision: db/persist.ts routes the `decision` event to daily buy/skip counters only.
  decision/ (Agent D) writes the full row via insertDecision(decision, snapshot) at
  call time. General pattern: modules holding rich context write their own rows; the
  bus subscriber persists what events carry.
Rationale: Keeps the frozen contract intact and the audit row complete.
Alternatives: Add snapshot to the Decision event (contract change, rejected);
  nullable snapshot column (loses the audit guarantee).
Date: 2026-06-10

[ADR-006] pumpmolt audit verdict: SAFE-WITH-CHANGES — vendor, don't install
Context: wave0-audit-pumpmolt audited github.com/PlaydaDev/pumpmolt at commit
  7119de43 (full report: docs/audits/pumpmolt-audit.md). Key handling verified
  local (no key egress); but the library reads SOLANA_PRIVATE_KEY inside its own
  code, and it blind-signs PumpPortal-built transactions.
Decision: Human approved SAFE-WITH-CHANGES. wave2-execution vendors the ~200-LOC
  trade path with keypair injection (signer isolation preserved), adds
  fee-payer/program-id verification before signing, pins provenance to 7119de43,
  always sets SOLANA_RPC_URL, and ports none of launch/burn/CLI/Docker.
Rationale: npm-installing it would create a second key-reader (hard-rule violation)
  and import unused attack surface.
Alternatives: npm dependency (rejected, isolation); writing the PumpPortal client
  from scratch (vendoring audited code is less new surface).
Date: 2026-06-10
