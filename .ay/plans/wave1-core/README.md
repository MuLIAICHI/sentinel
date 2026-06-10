# Plan: wave1-core — shared contracts, bus, config, logger

## Goal

Build `core/` — the frozen foundation every other module imports: the SPEC §3 type
contracts (transcribed literally), a typed event bus, a config loader, and a
secret-redacting logger. Plus the repo's TypeScript/test toolchain, since this is
the first code in the repo.

## Approach

1. Scaffold the toolchain first (package.json, tsconfig) so every later step can
   typecheck — strict TypeScript, ESM, vitest.
2. Transcribe `docs/SPEC.md` §3 into `core/types.ts` verbatim. Zero creativity.
3. Build the three runtime pieces (bus, config, logger), each with tests.
4. End at the human freeze gate: human approves `core/types.ts`, recorded in
   DECISIONS.md.

## Key Decisions

- **vitest** as test runner: TypeScript-native, zero config, fast. (Buy before build.)
- **ESM** (`"type": "module"`, moduleResolution NodeNext) — Node-native modern default.
- **No dotenv.** `core/config.ts` reads `process.env` only. The hard rule is "never
  touch `.env`" — we don't even install a library whose job is reading it.
- **Logger writes JSON lines to stdout** via `process.stdout.write` with a redaction
  list seeded with the known secret env var names. The logger is the project's
  "proper logging" that rule 10 points everyone at.

## Risks / Open Questions

- **Local Node is v20.20.2; spec says Node 22.** Core uses nothing Node-22-specific,
  so this only matters at deploy time. Flagged for the human: upgrade local Node or
  amend the spec. `engines` field will say `>=20` so dev isn't blocked today.
- The `EnrichedCandidate.currentMetaTags` and friends are consumed by modules not
  yet built; any contract gap found later goes through DECISIONS.md, not a quiet edit.
