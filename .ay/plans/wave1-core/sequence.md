# Sequence: wave1-core

| # | Step | Files | Checkpoint |
|---|------|-------|------------|
| 1 | Scaffold toolchain: package.json (ESM, scripts: `typecheck`, `test`), tsconfig.json (strict, NodeNext), .gitignore; `npm install` | package.json, tsconfig.json, .gitignore | [auto] install succeeds, `npx tsc --noEmit` runs clean on empty set |
| 2 | Transcribe SPEC §3 → `core/types.ts`, literal, comments included | core/types.ts | [auto] tsc clean; literal diff against SPEC block eyeballed in step 7 |
| 3 | `core/bus.ts`: typed EventEmitter wrapper + tests | core/bus.ts, tests/core/bus.test.ts | [auto] `npm test -- bus` green |
| 4 | `core/config.ts`: thresholds w/ defaults, env helpers, known-var registry + tests | core/config.ts, tests/core/config.test.ts | [auto] `npm test -- config` green |
| 5 | `core/logger.ts`: leveled JSON logger + redaction + tests | core/logger.ts, tests/core/logger.test.ts | [auto] `npm test -- logger` green |
| 6 | Full gate: `npx tsc --noEmit` + `npm test` (everything) | — | [auto] all green |
| 7 | **Contract freeze review**: human reads `core/types.ts` against SPEC §3, approves; record freeze in DECISIONS.md | .ay/tracking/DECISIONS.md | [human-verify] |

No step touches more than 5 files. Steps 3–5 are independent of each other but all
depend on 1–2; built in order for clean checkpoints.
