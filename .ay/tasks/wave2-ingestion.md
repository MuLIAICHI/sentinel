# Task: Wave 2 — ingestion/ (Agent A)

## Dependencies

- [ ] `.ay/tasks/wave1-core.md`
- [ ] `.ay/tasks/wave1-db.md`

If all dependencies are DONE, this task is READY.

> **GATE 1:** wires an external API (PumpPortal websocket). Human sign-off on the
> connection plan required before writing connection code.

## Files to Create

- `ingestion/ws.ts` — PumpPortal websocket client (`ws` package)
- `ingestion/normalize.ts` — raw messages → `RawTokenEvent` / trade ticks
- `ingestion/ringbuffer.ts` — in-memory recent-trades-per-mint buffer with a read API
- `ingestion/index.ts` — module entry: connect, subscribe, emit on bus
- `tests/ingestion/normalize.test.ts`, `tests/ingestion/ringbuffer.test.ts`

## Implementation

1. Connect to PumpPortal WS (`PUMPPORTAL_WS_URL` via `core/config.ts` — ask human to
   populate it; never touch `.env`). Subscribe to new-token and token-trade streams.
2. Auto-reconnect with exponential backoff + jitter. Heartbeat watchdog: reconnect
   if no message in N seconds (N in config).
3. Normalize messages into `RawTokenEvent` (validate at the boundary — malformed
   messages are logged and dropped, never thrown through).
4. Emit `{ type: 'raw_token', payload }` on the bus; feed trade ticks into the ring buffer.
5. Ring buffer: fixed-size per mint, exposes reads for enrichment (volume slope) and
   positions (mark-to-market). Document the read API in your HANDOFF.

## Verification

- [ ] All files exist; `npx tsc --noEmit` clean
- [ ] `npm test -- ingestion` passes (normalization fixtures, ring-buffer eviction)
- [ ] Manual check: run against the live WS for a few minutes, observe `raw_token` events flowing and a clean reconnect after killing the socket

## Unblocks

- `.ay/tasks/wave3-orchestrator.md` (with the rest of Wave 2)

Update BOARD.md when marking this DONE.
