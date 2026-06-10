# Task: Wave 3 — api/ (Express + websocket server)

## Dependencies

- [ ] `.ay/tasks/wave3-orchestrator.md`

If all dependencies are DONE, this task is READY.

## Files to Create

- `api/server.ts` — Express app + `ws` server
- `api/routes.ts` — REST endpoints
- `api/stream.ts` — bus → UI websocket forwarder
- `tests/api/routes.test.ts`

## Implementation

1. REST snapshots (read-only): `GET /positions`, `GET /decisions`, `GET /stats`,
   `GET /health`.
2. Websocket: subscribe to ALL `BotEvent`s on the bus, forward each to connected UI
   clients as JSON. Include a snapshot-on-connect so the UI hydrates instantly.
3. State-changing endpoints — the ONLY two:
   - `POST /kill` — activate the kill switch (body: reason)
   - `POST /kill/release` — release it
   Both go through `risk/` killswitch functions; the API never writes `kill_state` directly.
4. **No endpoint can enable live trading. Do not create one.**
5. Bind to localhost by default; port via config.

## Verification

- [ ] All files exist; `npx tsc --noEmit` clean
- [ ] `npm test -- api` passes (routes return shapes the UI expects; kill endpoints flip state)
- [ ] Manual check: `curl /health` while orchestrator runs; `wscat` shows live events; POST /kill actually blocks entries

## Unblocks

- `.ay/tasks/wave3-ui.md`

Update BOARD.md when marking this DONE.
