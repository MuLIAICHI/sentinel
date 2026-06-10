# Diff from plan: wave1-core

1. **Step reorder (3 ↔ 5):** `core/logger.ts` was built before the bus tests ran,
   because `bus.ts` imports the logger for handler-error isolation. The plan's
   api-reference already showed this dependency; the sequence table just had the
   steps in the wrong order. No file or scope change.
2. **16 tests instead of 15:** config suite gained one extra case (requireEnv
   returns value when set) for symmetry with optionalEnv.
3. **dotenv-guard test tightened:** the planned regex `/dotenv/` matched the word
   in config.ts's own doc comment ("no dotenv"). Changed to match actual usage
   (`from 'dotenv'` / `require('dotenv')`) and real file-read calls instead of prose.
4. **esbuild postinstall blocked** by the local npm allow-scripts policy during
   `npm install`. Harmless — the platform binary ships as an optional dependency
   and vitest runs fine. Noted in case a future machine hits a missing-binary error.
