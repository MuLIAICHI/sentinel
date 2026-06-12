# Plan: wave3-api — Express + websocket server

## Goal

Expose the running bot to the UI: REST snapshots (/positions, /decisions,
/stats, /health), a websocket forwarding every BotEvent with snapshot-on-connect,
and the ONLY two state-changing endpoints: POST /kill and POST /kill/release.
Ends with the first live end-to-end kill-switch flip.

## Approach

1. **Same process as the orchestrator** — the bus is an in-process singleton, so
   event forwarding requires it. `createApiServer(deps)` is started from
   orchestrator boot() and stopped in shutdown() (both dirs are integration scope).
2. **DI throughout** (codebase convention): the server takes injected getters
   ({openPositions, closedPositions, decisions, dailyStats, killState,
   activateKill, releaseKill, bus}) — fully testable with no db/risk mocking
   gymnastics; real wiring happens once in boot().
3. **ws piggybacks the http server** (`new WebSocketServer({ server })`); on
   connect, send a `snapshot` message (positions + recent decisions + today's
   stats + kill state), then forward every BotEvent as {type, payload}.
4. Kill endpoints call risk's activateKill/releaseKill — NEVER write kill_state
   directly (risk owns it; it also emits the bus event the engine listens to).
5. Bind 127.0.0.1, port 3001 as an in-module constant (localhost paper rig; no
   new env var — KnownEnvVar is core's frozen-ish contract, not worth a change).
6. Tests run the real server on an ephemeral port (port 0) and use global fetch
   + the ws client — no supertest dependency needed.

## Key decisions

- No endpoint can enable live trading — nothing in api/ imports execution/live
  or touches guards (rule, SPEC §4).
- /kill takes an optional JSON {reason}; defaults 'manual_ui'. /kill/release
  reason fixed 'manual_ui_release'.
- Websocket backpressure: at ~28 raw_token events/min the firehose is tiny
  (<1 msg/s); send unconditionally, drop clients whose socket errors.

## Risks

- First live kill-switch flip happens in this task's verification (deliberate —
  it exercises risk → bus → engine → orchestrator cache end to end).
- Express 5 typings: pin to express@4 if @types friction appears.
