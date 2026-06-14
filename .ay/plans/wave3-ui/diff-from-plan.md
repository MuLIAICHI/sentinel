# Diff from plan: wave3-ui

Deviations recorded during BUILD.

1. **`live` counters gained an `enriched` field.** Plan schema listed
   `{tokensSeen, cheapPass, cheapFail, fullPass, fullFail}`. Added `enriched`
   (incremented on `candidate_enriched`) so the funnel's "enriched" stage is a
   real count rather than an alias of cheapPass. Pure-logic, covered by a test.

2. **Open-position price distances are ENTRY-relative, not live-price-relative.**
   The positions engine (`positions/engine.ts`) only emits `position_updated`
   after a partial sell and never puts the live price/peak on the bus. With no
   price-tick events on the wire, the UI cannot show a live current price. The
   table therefore shows distance-to-exit measured from entry (where TP/hard/
   trail sit) and a LIVE time-stop countdown off the wall clock. `lastPrice`/
   `peakPrice` tracking is wired and unit-tested so that if throttled price
   ticks are ever added to the stream, the table goes live with no UI change.
   uPnL consequently reads 0 for open positions until close (realized P&L is
   exact). Honest given the current event surface; flagged for HANDOFFS.

3. **`next.config.mjs` got a `webpack.extensionAlias`.** The `lib/` files use
   NodeNext `.js` import specifiers (required so the root vitest/tsc compiles
   them); Next's webpack does not perform the TS `.js`→`.ts` rewrite by default.
   Added `extensionAlias` so the same specifiers resolve in the Next build.
   Also set `outputFileTracingRoot` to silence the dual-lockfile warning.

4. **Feed policy: passes are quiet, rejects are logged.** The plan said
   candidate_filtered updates "feed"; implemented so only rejections produce a
   compact feed row (the firehose), while passes advance silently toward the
   prominent decision/position rows. Keeps the feed readable at ~28 tokens/min.

No contract changes. Only backend file touched is `api/server.ts` (CORS), as
planned.
