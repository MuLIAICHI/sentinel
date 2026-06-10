# Task: Wave 1 — core/ (shared contracts, bus, config, logger)

## Dependencies

None. This task is READY. **Everything else imports this — build it first, get the
human to approve the contracts, then FREEZE.**

## Files to Create

- `core/types.ts` — the shared contracts, **copied literally from `docs/SPEC.md` §3**
- `core/bus.ts` — typed `EventEmitter` wrapper; every module emits/subscribes `BotEvent`
- `core/config.ts` — config loader (env names + filter thresholds); **never reads `.env` itself via dotenv-style file parsing of secrets it shouldn't have — it reads `process.env` only, and missing required vars produce a named, human-actionable error**
- `core/logger.ts` — structured logger; must make it impossible to accidentally log secrets (redaction list)
- `package.json`, `tsconfig.json` — Node 22, TypeScript strict
- `tests/core/bus.test.ts`, `tests/core/config.test.ts`

## Implementation

1. Read `docs/SPEC.md` §3 and transcribe the interfaces into `core/types.ts` exactly:
   `RawTokenEvent`, `Candidate`, `FilterResult`, `EnrichedCandidate`, `Decision`,
   `Position`, `BotEvent`.
2. `core/bus.ts`: typed wrapper over `EventEmitter` with `emit(event: BotEvent)` and
   `on(type, handler)` narrowed by event type.
3. `core/config.ts`: filter thresholds (age, bonding-curve band 55–85%, top-10
   concentration ~25%, dev-sold, volume) as a typed config object with defaults;
   env var accessor that lists `PUMPPORTAL_WS_URL`, `SOLANA_RPC_URL`,
   `ANTHROPIC_API_KEY`, indexer key (name TBD) as known names.
4. `core/logger.ts`: leveled JSON logger with a redaction mechanism.
5. Tests: bus type-safety and pub/sub; config defaults and missing-var errors.

## Verification

- [ ] All files listed above exist
- [ ] `npx tsc --noEmit` clean
- [ ] `npm test -- core` passes
- [ ] Manual check: human reviews `core/types.ts` against SPEC §3 and approves the freeze (record in DECISIONS.md)

## Unblocks

- `.ay/tasks/wave1-db.md`
- (together with wave1-db) all Wave 2 tasks

Update BOARD.md when marking this DONE.
