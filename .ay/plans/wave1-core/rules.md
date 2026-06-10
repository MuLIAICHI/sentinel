# Rules: wave1-core

## Universal rules (all 13, addressed for this task)

1. **Scope** — only `core/`, `tests/core/`, and root toolchain files (`package.json`,
   `tsconfig.json`) are touched. Root toolchain files are foundation's to create as
   first-code-in-repo; noted here as the explicit approval trail.
2. **Single responsibility** — one file per concern: types / bus / config / logger.
3. **No hardcoded secrets** — config reads `process.env` only; no values committed.
4. **Doc comments** — every exported function/type gets a doc comment (types.ts
   carries the SPEC field comments verbatim).
5. **Naming** — establishes convention: camelCase functions, PascalCase types,
   SCREAMING_SNAKE constants (matches SPEC's `risk/guards.ts` style).
6. **No TODO/FIXME without task link** — none planned.
7. **Explicit error handling** — `requireEnv` throws a named, actionable error;
   bus handler errors are caught and logged, never swallowed silently.
8. **No circular deps** — core imports nothing from other modules; internally
   types ← bus/config/logger only (types imports nothing).
9. **Deterministic tests** — no network, no timers, no randomness in core tests.
10. **No console.log** — logger uses `process.stdout.write`; everything else uses logger.
11. **Explicit imports** — no wildcard imports.
12. **No dead code** — only what Wave 2 contracts require.
13. **Traceability** — every file maps to a step in sequence.md.

## Task-specific rules

- **T1. Literal transcription:** `core/types.ts` interface/field names, types, and
  comments come from SPEC §3 exactly. Any perceived improvement is raised to the
  human, not applied.
- **T2. Freeze gate:** after human approval, `core/types.ts` changes require a
  DECISIONS.md entry + human sign-off.
- **T3. No `.env` anywhere:** no dotenv dependency, no file reads of env files, no
  `.env*` paths in code or tests.
- **T4. Redaction default-on:** logger redacts values of `ANTHROPIC_API_KEY`,
  `PUMPPORTAL_WS_URL` credentials, indexer keys, `DATABASE_URL`, and any key matching
  `/key|secret|token|private/i` in structured fields.
- **T5. Never run `git push`.**
