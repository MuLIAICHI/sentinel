# Files: wave1-core

## Create (10)

| File | Purpose |
|------|---------|
| `package.json` | Toolchain: name, ESM, scripts (build/test/typecheck), devDeps (typescript, vitest, @types/node) |
| `tsconfig.json` | Strict TS, ES2022 target, NodeNext modules, includes `core/` + `tests/` |
| `.gitignore` | node_modules, dist, coverage — and `.env*` (defense in depth: never committed because never created) |
| `core/types.ts` | SPEC §3 contracts, literal: RawTokenEvent, Candidate, FilterResult, EnrichedCandidate, Decision, Position, BotEvent |
| `core/bus.ts` | Typed EventEmitter wrapper: `emit(event: BotEvent)`, `on(type, handler)` narrowed by event type |
| `core/config.ts` | Filter thresholds with defaults; `requireEnv`/`optionalEnv`; registry of known env var names |
| `core/logger.ts` | Leveled JSON-line logger with redaction list |
| `tests/core/bus.test.ts` | pub/sub, type narrowing, handler-error isolation |
| `tests/core/config.test.ts` | defaults, missing-var named error, no `.env` reads |
| `tests/core/logger.test.ts` | levels, JSON shape, redaction of secret-like fields |

## Modify (0) · Delete (0)

Total: 10 files — within agent scope (`core/`, `tests/core/`, plus root toolchain
as first code in repo, per rules.md #1).
