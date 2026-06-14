# Files: wave3-ui

## Create (17)

| File | Purpose |
|------|---------|
| `ui/package.json` | Next.js app deps + dev/build scripts (own tree) |
| `ui/tsconfig.json` | Next-flavored TS config (jsx, bundler resolution) |
| `ui/next.config.mjs` | Minimal config |
| `ui/app/layout.tsx` | Root layout, dark body, metadata |
| `ui/app/page.tsx` | The dashboard page: composes hook + components |
| `ui/app/globals.css` | Dark theme, grid layout, feed/table styles |
| `ui/lib/types.ts` | Wire-type mirrors (source of truth: core/types.ts + api handoff) |
| `ui/lib/reducer.ts` | PURE dashboard state machine: snapshot + per-event application, caps, derived funnel |
| `ui/lib/format.ts` | PURE helpers: sol/pct/age/price formatting, distance-to-exit math, EXIT_CONFIG mirror |
| `ui/lib/useStream.ts` | ws hook: connect, reconnect w/ backoff, dispatch to reducer, connection state |
| `ui/components/Header.tsx` | PAPER badge, today P&L (realized + unrealized), kill switch w/ confirm |
| `ui/components/Funnel.tsx` | seen → cheap-pass → enriched → full-pass → decisions → positions |
| `ui/components/DecisionFeed.tsx` | streaming feed: rejects compact, decisions prominent (BUY green/SKIP gray) |
| `ui/components/PositionsTable.tsx` | open: entry, current, uPnL, age, distance to each exit |
| `ui/components/HistoryTable.tsx` | closed: exit reason, realized P&L |
| `ui/components/StatsPanel.tsx` | skip rate, win rate, realized pnl, counts |
| `tests/ui/reducer.test.ts` + `tests/ui/format.test.ts` | pure-logic suites run by root vitest |

## Modify (1)

| File | Change |
|------|--------|
| `api/server.ts` | CORS headers for http://localhost:3000 + OPTIONS preflight (kill POSTs) |

Total: 18 — integration scope.
