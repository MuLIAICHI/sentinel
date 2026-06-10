# Task: Wave 2 — positions/ (Agent G) — mechanical exits, no LLM

## Dependencies

- [ ] `.ay/tasks/wave1-core.md`
- [ ] `.ay/tasks/wave1-db.md`

If all dependencies are DONE, this task is READY.

## Files to Create

- `positions/rules.ts` — exit rules as pure functions over (position, tick, peak)
- `positions/engine.ts` — per-tick evaluation loop over open positions
- `positions/index.ts` — bus wiring (`position_opened` in, sell orders out, `position_updated`/`position_closed` emitted)
- `tests/positions/rules.test.ts`, `tests/positions/engine.test.ts`

## Implementation

**No LLM call decides when to sell. Ever.** Evaluate on every price tick:

1. **Take profit:** sell 50% at +80–100% (threshold from `core/config.ts`).
2. **Trailing stop:** after TP, trail the remainder — give back 25% from peak.
3. **Hard stop:** −35%.
4. **Time stop:** flatten after 45 min.
5. **Kill-switch flatten:** on `kill_switch` active, exit everything immediately.
6. Define and document evaluation precedence when multiple rules trigger on the same
   tick (kill switch > hard stop > time stop > trailing > take profit).
7. Track per-position peak price for the trailing stop. Sells go through the
   `execute(order)` facade (contract from execution's HANDOFF — do not import
   `execution/` internals).
8. Emit `position_updated` on partials/marks, `position_closed` with `exitReason`
   and `realizedPnlSol` (fees included) on full exit.

## Verification

- [ ] All files exist; `npx tsc --noEmit` clean
- [ ] `npm test -- positions` passes — tick-sequence fixtures per rule: clean TP, trail give-back, gap through hard stop, time expiry, kill mid-flight, multiple rules same tick
- [ ] Manual check: P&L math on a worked example matches by hand

## Unblocks

- `.ay/tasks/wave3-orchestrator.md` (with the rest of Wave 2)

Update BOARD.md when marking this DONE.
