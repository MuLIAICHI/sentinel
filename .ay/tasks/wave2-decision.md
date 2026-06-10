# Task: Wave 2 — decision/ (Agent D)

## Dependencies

- [ ] `.ay/tasks/wave1-core.md`
- [ ] `.ay/tasks/wave1-db.md`

If all dependencies are DONE, this task is READY.

> **GATE 1:** wires an external API (Anthropic). Human sign-off on model id, prompt,
> and per-hour call ceiling before wiring. Confirm the current Haiku-class model id
> with the human / `claude-api` skill — do NOT hardcode a stale string.

## Files to Create

- `decision/prompt.ts` — system prompt + candidate rendering
- `decision/client.ts` — Anthropic SDK call with timeout + per-hour ceiling
- `decision/parse.ts` — defensive JSON parse → `Decision`
- `decision/index.ts` — `decide(candidate): Promise<Decision>`, emits on bus
- `tests/decision/parse.test.ts`, `tests/decision/prompt.test.ts`

## Implementation

1. System prompt enforces: judge ONLY the minutes-scale graduation-window setup;
   default to SKIP; BUY requires multiple confirming signals; return ONLY the
   `Decision` JSON, no prose.
2. Input: `EnrichedCandidate` rendered as a compact structured block + meta tags.
3. `parse.ts`: strip code fences, validate shape strictly (action ∈ {BUY, SKIP},
   confidence ∈ [0,1]); ANY parse failure → SKIP with reasoning `'parse_failure'`.
4. Record `modelLatencyMs` and per-call cost; emit `{ type: 'decision', payload }`.
5. **Cost guards:** never called for filter failures (orchestrator enforces order,
   but assert it here too); hard per-hour call ceiling — when hit, auto-SKIP with
   reasoning `'call_ceiling'`.
6. Env (ask human by name, via `core/config.ts`, never touch `.env`): `ANTHROPIC_API_KEY`.

## Verification

- [ ] All files exist; `npx tsc --noEmit` clean
- [ ] `npm test -- decision` passes: parse fixtures (clean JSON, fenced, malformed, wrong shape → SKIP), ceiling behavior
- [ ] Manual check: one real call with a sample candidate returns a valid `Decision` and sane latency

## Unblocks

- `.ay/tasks/wave3-orchestrator.md` (with the rest of Wave 2)

Update BOARD.md when marking this DONE.
