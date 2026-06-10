# Task: Wave 3 — ui/ (Next.js dashboard)

## Dependencies

- [ ] `.ay/tasks/wave3-api.md`

If all dependencies are DONE, this task is READY.

## Files to Create

- `ui/` — Next.js app (App Router), dark theme, single dashboard page
- Components: header, decision feed, open positions, history, stats panel, funnel counter
- Websocket client hook consuming the api/ stream

## Implementation

Single dark real-time dashboard per SPEC §5 — built to *watch everything*:

1. **Header:** mode badge (PAPER / LIVE — LIVE renders red), wallet balance, today's
   P&L, big **KILL SWITCH** button + release. Kill button POSTs `/kill` with a
   confirm step; release POSTs `/kill/release`.
2. **Live decision feed:** streaming list — candidate, filter result, enriched stats,
   Claude action + confidence + reasoning, color-coded BUY/SKIP.
3. **Open positions table:** entry, current price, unrealized P&L, age, distance to
   each exit trigger.
4. **Closed positions / history:** exit reason + realized P&L.
5. **Stats panel:** SKIP rate (expect ~95%+), win rate, avg hold, fees paid, model
   calls + cost today, hypothetical-vs-actual for paper validation.
6. **Funnel counter:** tokens seen → passed filter → enriched → BUY → executed.
7. Hydrate from REST snapshot, then apply websocket events. Reconnect on drop with
   a visible "stream disconnected" state.
8. **No write actions except the kill switch. The UI cannot enable live trading —
   no toggle, no hidden route, nothing.**

## Verification

- [ ] `npm run build` in `ui/` succeeds; `npx tsc --noEmit` clean
- [ ] Manual check: with the orchestrator running in paper mode, the feed streams live, the funnel increments, kill switch round-trips (activate → entries blocked → release)
- [ ] Manual check: grep the UI for any live-trading affordance — there is none

## Unblocks

- Nothing — last task. System enters the 3–4 day paper-trading observation run (human-led).

Update BOARD.md when marking this DONE.
