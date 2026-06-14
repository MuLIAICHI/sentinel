# Context: wave3-ui

- Bot LIVE on 127.0.0.1:3001 (orchestrator + api in one process).
- WS wire (api handoff): first frame {type:'snapshot', payload:{open, closed,
  decisions, stats, kill}}; then BotEvents verbatim. REST: /health /positions
  /decisions /stats; POST /kill {reason?}, POST /kill/release.
- Event volume: raw_token ~28/min (trivial for a browser); candidate_filtered
  bursts at ripening; decision/position events rare.
- stats.passedFilter counts BOTH filter passes — label "filter passes (2-stage)"
  and ALSO derive live per-stage counts from candidate_filtered events client-side.
- Exit thresholds for distance-to-exit: positions/rules.ts defaultExitConfig =
  {takeProfitTriggerPct:0.8, takeProfitSellFraction:0.5, trailingGivebackPct:
  0.25, hardStopPct:0.35, timeStopMs:2_700_000} — mirror as constants with a
  source-of-truth comment.
- Scope: ui/ + tests/ui/ + api/server.ts (CORS, integration scope). Root
  tsconfig include does NOT cover ui/ (deliberate); tests/ui/*.test.ts imports
  only plain-TS files from ui/lib (no JSX) so root tsc stays clean.
- Conventions: components thin, logic pure + tested; no console.log in ui/lib
  (components may not log either; the hook surfaces connection state in UI).
