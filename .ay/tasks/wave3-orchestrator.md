# Task: Wave 3 — orchestrator/ (pipeline wiring)

## Dependencies

- [ ] `.ay/tasks/wave2-ingestion.md`
- [ ] `.ay/tasks/wave2-filter.md`
- [ ] `.ay/tasks/wave2-enrichment.md`
- [ ] `.ay/tasks/wave2-decision.md`
- [ ] `.ay/tasks/wave2-risk.md`
- [ ] `.ay/tasks/wave2-execution.md`
- [ ] `.ay/tasks/wave2-positions.md`

If all dependencies are DONE, this task is READY.

## Files to Create

- `orchestrator/pipeline.ts` — the event loop
- `orchestrator/index.ts` — process entry: boot order, graceful shutdown
- `ecosystem.config.js` — PM2 config (paper mode)
- `tests/orchestrator/pipeline.test.ts`

## Implementation

1. Read ALL Wave 2 HANDOFF entries first — they are the integration contracts.
2. Wire the fixed pipeline:
   `raw_token → filter → (pass) → enrich → decide → (BUY) → risk.approve → execute → positions`.
   Risk approval is never bypassed or reordered. Filter failures stop the chain
   (still logged/persisted for the funnel).
3. Boot order: config → db → bus → killswitch state → ingestion → everything else.
   Graceful shutdown: stop ingestion first, let positions finish persisting.
4. Backpressure: enrichment + decision are async and rate-limited; queue with a
   bounded depth, drop oldest candidates when full (they age out anyway), log drops.
5. Integration test with a mocked ingestion feed: one token flows end-to-end in
   paper mode; one risk_block path; one kill-switch path.

## Verification

- [ ] All files exist; `npx tsc --noEmit` clean
- [ ] `npm test -- orchestrator` passes
- [ ] Manual check: `pm2 start` in paper mode runs against the live stream without crashing for 30+ min; funnel counts in DB look sane

## Unblocks

- `.ay/tasks/wave3-api.md`

Update BOARD.md when marking this DONE.
