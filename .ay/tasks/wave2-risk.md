# Task: Wave 2 — risk/ (Agent E) — the boss

## Dependencies

- [ ] `.ay/tasks/wave1-core.md`
- [ ] `.ay/tasks/wave1-db.md`

If all dependencies are DONE, this task is READY.

## Files to Create

- `risk/guards.ts` — the hardcoded constants (NOT env, NOT config, NOT user input)
- `risk/approve.ts` — `approve(decision, portfolioState): RiskedOrder | RiskBlock`
- `risk/killswitch.ts` — global kill switch backed by the `kill_state` DB row
- `risk/index.ts` — module entry, bus wiring
- `tests/risk/approve.test.ts`, `tests/risk/killswitch.test.ts`

## Implementation

1. `risk/guards.ts` exactly per SPEC §4 / project hard rules:
   ```ts
   export const LIVE_TRADING = false;   // human edits this by hand to go live — NO AGENT EVER CHANGES IT
   export const MAX_POSITION_SOL = ...; // ≈ $5
   export const MAX_CONCURRENT = 2;
   export const DAILY_LOSS_LIMIT_SOL = ...; // ≈ $15
   export const WALLET_HARD_CAP_SOL = ...;  // ≈ $50
   ```
   (Convert $ to SOL at a stated assumed price; document the assumption in a comment.)
2. `approve()` — the ONLY entity that can authorize an entry. Checks, in order:
   kill switch off → daily-loss not tripped → concurrency < MAX_CONCURRENT →
   size = min(cap, cap × confidence-derived scalar). **Confidence may only shrink
   size below the cap, never grow it.** Reject → emit `risk_block` with reason.
3. Daily-loss kill: when realized losses hit the limit, emit
   `{ type: 'kill_switch', payload: { active: true, reason: 'daily_loss' } }` and
   block all new entries until the next UTC day.
4. Kill switch: DB-backed flag the UI flips; expose check + set; on activation
   optionally signal flatten (positions module listens).

## Verification

- [ ] All files exist; `npx tsc --noEmit` clean
- [ ] `npm test -- risk` passes — include adversarial tests: confidence > 1, negative sizes, concurrency races, approval while kill active, loss exactly at limit
- [ ] `LIVE_TRADING === false` asserted by a test (a tripwire if anyone flips it)
- [ ] Manual check: human reviews `risk/guards.ts` constants

## Unblocks

- `.ay/tasks/wave3-orchestrator.md` (with the rest of Wave 2)

Update BOARD.md when marking this DONE.
