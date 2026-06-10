# Task: Wave 2 — execution/ (Agent F)

## Dependencies

- [ ] `.ay/tasks/wave1-core.md`
- [ ] `.ay/tasks/wave1-db.md`
- [ ] `.ay/tasks/wave0-audit-pumpmolt.md` (DONE **and** human-approved)

If all dependencies are DONE, this task is READY.

> **GATE 1:** wires the pumpmolt execution layer. Human sign-off on the integration
> plan required before writing `live.ts`. Paper simulator can be built while waiting.

## Files to Create

- `execution/signer.ts` — **the ONLY file in the entire repo that touches the private key**
- `execution/paper.ts` — simulated fills (default path)
- `execution/live.ts` — gated pumpmolt wrapper
- `execution/index.ts` — `execute(order)` facade routing paper/live by guard
- `tests/execution/paper.test.ts`, `tests/execution/gate.test.ts`

## Implementation

1. `signer.ts`: read key once at startup, `Keypair.fromSecretKey`, sign, submit to
   configured RPC. Never logged, never exported beyond a `sign()` surface, never
   serialized. Env var name for the key: ask the human; read via `core/config.ts`;
   never touch `.env`. Tests use a freshly generated throwaway keypair only.
2. `paper.ts`: fill at current stream price (ingestion ring buffer read API) minus a
   modeled haircut — PumpPortal 0.5% + priority fee + realistic slippage. Mark open
   positions to market off the trade stream. Document the model in comments.
3. `live.ts`: thin wrapper over pumpmolt `buyTokens`/`sellTokens`.
   **Top of EVERY exported function:**
   `if (!LIVE_TRADING || killSwitchActive()) throw/refuse` — unreachable unless both
   human gates are open. `LIVE_TRADING` imported read-only from `risk/guards.ts`.
4. `execute(order)` facade: routes to paper by default; live only past the guard.
   Emits `position_opened` on fills.

## Verification

- [ ] All files exist; `npx tsc --noEmit` clean
- [ ] `npm test -- execution` passes
- [ ] Gate test proves `live.ts` functions refuse when `LIVE_TRADING === false` (i.e., always, today)
- [ ] `grep -r` the repo: no file other than `execution/signer.ts` references the key env var or any key material
- [ ] Manual check: paper fill prices vs. raw stream prices show the expected haircut

## Unblocks

- `.ay/tasks/wave3-orchestrator.md` (with the rest of Wave 2)

Update BOARD.md when marking this DONE.
