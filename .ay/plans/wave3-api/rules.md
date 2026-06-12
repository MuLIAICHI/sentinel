# Rules: wave3-api

## Universal rules (13, addressed)

1. **Scope** — api/, tests/api/, orchestrator/index.ts (integration agent owns
   both), tsconfig include, package.json dep add (sanctioned toolchain touch).
2. Single responsibility — server / routes / stream split. 3. No secrets —
   nothing in api/ reads env at all (deps injected). 4. Doc comments on exports.
5. Naming conventions. 6. No TODO/FIXME. 7. Explicit errors — route handlers
   wrap in try/catch → 500 JSON {error}; ws send failures drop the client.
8. No cycles — api imports nothing that imports api. 9. Deterministic tests —
   ephemeral ports, injected fake deps, no live db/network. 10. createLogger
   only. 11. Explicit imports. 12. No dead code. 13. Files ↔ steps.

## Task-specific rules

- **T1. Only two state-changing endpoints**: POST /kill, POST /kill/release.
  Everything else is GET. No endpoint can enable live trading — api/ never
  imports execution/ or touches risk/guards.
- **T2. Kill goes through risk/** — activateKill/releaseKill only; kill_state
  is never written directly (risk owns the row AND the bus emission).
- **T3. Bind localhost only** (127.0.0.1) — this is a local paper rig; exposing
  the kill switch to a network is a human decision for another day.
- **T4. Never touch .env / never push** (project hard rules).
