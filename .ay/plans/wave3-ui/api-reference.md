# API Reference: wave3-ui

Consumes ONLY the wave3-api surface (see its handoff / plan api-reference):
- WS ws://127.0.0.1:3001 — snapshot frame then BotEvents verbatim.
- POST http://127.0.0.1:3001/kill {reason}; POST /kill/release.
- (REST GETs available but unused — snapshot covers hydration.)

External libs: next ^15, react ^19, react-dom ^19 (ui/ package only).
Browser APIs: native WebSocket, fetch.

New internal surface (ui/lib):
```ts
reducer(state: DashState, action: Action): DashState   // Action = {kind:'snapshot'|'event'|'conn', ...}
initialState(): DashState
useStream(url): { state: DashState; conn: 'connecting'|'open'|'down' }
fmtSol/fmtPct/fmtAge/fmtPrice; unrealizedPnl(p, price); distanceToExits(p, price, peak, nowMs)
```
