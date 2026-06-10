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
