# Task: Wave 2 — enrichment/ (Agent C)

## Dependencies

- [ ] `.ay/tasks/wave1-core.md`
- [ ] `.ay/tasks/wave1-db.md`

If all dependencies are DONE, this task is READY.

> **GATE 1 (double):** wires external APIs AND the data provider is an open decision.
> Free Solana RPC covers basics; holder distribution + dev wallet history realistically
> needs an indexer (Helius / Birdeye / Moralis free tier). Present a provider
> comparison + recommendation and get human sign-off BEFORE wiring anything.

## Files to Create

- `enrichment/onchain.ts` — holder count/distribution, dev wallet history, bonding-curve %, volume slope
- `enrichment/meta.ts` — `currentMetaTags` from the last 6h of the stream
- `enrichment/index.ts` — `enrich(candidate): Promise<EnrichedCandidate>`, emits on bus
- `tests/enrichment/meta.test.ts`, `tests/enrichment/onchain.test.ts` (mocked providers)

## Implementation

1. **First:** provider comparison (coverage of needed fields, free-tier rate limits,
   reliability) → recommendation → human sign-off → record in DECISIONS.md.
2. Fetch for filter survivors ONLY (cost control): holders, distribution, dev wallet
   history (`devPriorLaunches`, `devPriorRugs`), bonding-curve %, recent volume slope
   (volume slope can come from ingestion's ring buffer — use its HANDOFF-published read API).
3. `meta.ts`: scan last 6h of new tokens from the stream, cluster names/symbols,
   surface hot themes as `currentMetaTags`.
4. All provider calls: timeouts, typed errors, rate-limit respect. A failed enrichment
   drops the candidate (logged), it never crashes the pipeline.
5. Env (ask human by name, read via `core/config.ts`, never touch `.env`):
   `SOLANA_RPC_URL`, indexer key (name set by chosen provider).

## Verification

- [ ] All files exist; `npx tsc --noEmit` clean
- [ ] `npm test -- enrichment` passes with mocked provider responses
- [ ] Manual check: enrich one real mint end-to-end and eyeball every `EnrichedCandidate` field for sanity

## Unblocks

- `.ay/tasks/wave3-orchestrator.md` (with the rest of Wave 2)

Update BOARD.md when marking this DONE.
