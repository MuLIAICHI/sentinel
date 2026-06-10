# Tests: wave1-core

Runner: vitest. All deterministic — no network, no timers, no randomness.

## tests/core/bus.test.ts

| Test | Requirement covered | Expected |
|------|--------------------|----------|
| emit `raw_token`, typed handler receives payload | bus carries `BotEvent` | handler called once with exact payload |
| `on('decision')` does NOT fire for `raw_token` | per-type subscription | zero calls |
| handler payload type narrows by event type | typed wrapper (compile-time) | compiles with narrowed type, no casts |
| a throwing handler doesn't break other handlers | rule 7: explicit error handling | second handler still called; error logged |
| `onAny` receives every event type | api/db subscribe-to-all use case | called for each emitted event |

## tests/core/config.test.ts

| Test | Requirement covered | Expected |
|------|--------------------|----------|
| thresholds have SPEC defaults (curve band 55–85, top10 ~25, age ~20min) | configurable thresholds | values match SPEC §4 filter section |
| `requireEnv('PUMPPORTAL_WS_URL')` missing → error **naming the var** | "ask the human by name" | error message contains var name + "ask the human" guidance |
| `requireEnv` present → returns value | env accessor | exact value |
| `optionalEnv` missing → undefined, no throw | non-fatal vars | undefined |
| config module performs no file reads (no dotenv) | hard rule: never touch `.env` | source contains no `readFile`/`dotenv`; test asserts known-vars registry only uses `process.env` |

## tests/core/logger.test.ts

| Test | Requirement covered | Expected |
|------|--------------------|----------|
| `info()` writes one JSON line with level/msg/time | structured logging | parseable JSON, fields present |
| field named `apiKey`/`secret`/`token`/`privateKey` → value `[REDACTED]` | redaction (T4) | secret value absent from output |
| nested objects redacted recursively | redaction depth | nested secret absent |
| level filtering: `debug` suppressed at `info` level | leveled logger | no output line |
| logger never throws on circular input | robustness | safe fallback, no crash |

Every requirement in `.ay/tasks/wave1-core.md` maps to ≥1 test above, except the
types.ts literal-transcription requirement, which is verified by compile (step 6)
plus the human freeze review (step 7).
