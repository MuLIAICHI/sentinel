# Context: wave1-core

## Codebase state

Greenfield. The repo contains only `docs/SPEC.md`, AY framework files (`.ay/`,
`.claude/`), and `CLAUDE.md`. **This task creates the first source code and
therefore sets the conventions** (ESM, strict TS, vitest, JSON logging).

## Source of truth

- `docs/SPEC.md` §3 — the contracts, to be transcribed literally into `core/types.ts`.
- `docs/SPEC.md` §0 + `CLAUDE.md` hard rules — no `.env`, secrets asked by name,
  signer isolation (not core's concern but the redaction list serves it).
- `.ay/tasks/wave1-core.md` — task requirements and verification gates.
- `.claude/agents/foundation.md` — scope: `core/`, `db/`, `tests/core/`, `tests/db/`.

## Conventions established here (downstream agents inherit)

- Imports use `.js` extension style per NodeNext ESM resolution.
- Module entry points export a narrow public surface; internals stay unexported.
- Thresholds/config: typed object in `core/config.ts` with defaults; env access only
  through `requireEnv`/`optionalEnv` helpers that name the missing variable.
- All logging through `core/logger.ts` — never `console.log`.

## Known consumers (why each piece exists)

- `types.ts` → every module.
- `bus.ts` → every module emits/subscribes `BotEvent`; api/ forwards all to UI; db/ persists all.
- `config.ts` → filter thresholds (B), env names for ingestion/enrichment/decision (A/C/D).
- `logger.ts` → everyone; redaction protects key material and API keys by default.
