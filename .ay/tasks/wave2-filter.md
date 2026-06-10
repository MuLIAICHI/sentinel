# Task: Wave 2 — filter/ (Agent B)

## Dependencies

- [ ] `.ay/tasks/wave1-core.md`
- [ ] `.ay/tasks/wave1-db.md`

If all dependencies are DONE, this task is READY.

## Files to Create

- `filter/rules.ts` — one pure function per rule
- `filter/index.ts` — `evaluate(candidate, context): FilterResult` composing all rules
- `tests/filter/rules.test.ts` — fixture per rule, pass + fail cases

## Implementation

Pure, deterministic, no network, no I/O, no LLM. Thresholds from `core/config.ts`.

1. Implement rules (each returns a rule id on failure):
   - `age_too_young` — younger than ~20 min (skip the sniper bloodbath)
   - `dev_repeat_rugger` — creator in known-bad set (set is provided as input context, seeded by enrichment over time)
   - `bonding_curve_out_of_band` — not in the 55–85% window
   - `holder_concentration` — top-10 > ~25%
   - `dev_dumped` — devSoldPct above threshold
   - `dead_volume` — no volume re-acceleration
2. `evaluate()` runs all rules, returns `FilterResult { passed, failedRules }` —
   collect ALL failed rules (the UI funnel wants to know why things die).
3. Note: some rules need enriched-style data delivered via the context argument;
   keep rule signatures honest about what they consume.

## Verification

- [ ] All files exist; `npx tsc --noEmit` clean
- [ ] `npm test -- filter` passes; every rule has both pass and fail fixtures
- [ ] Manual check: replay a fixture batch and confirm rejection rate >95% on representative data

## Unblocks

- `.ay/tasks/wave3-orchestrator.md` (with the rest of Wave 2)

Update BOARD.md when marking this DONE.
