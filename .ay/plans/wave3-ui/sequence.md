# Sequence: wave3-ui

| # | Step | Files | Checkpoint |
|---|------|-------|------------|
| 1 | ui package scaffold (package/tsconfig/next.config/layout/globals) + npm install | ui/package.json, ui/tsconfig.json, ui/next.config.mjs, ui/app/layout.tsx, ui/app/globals.css | [auto] install ok |
| 2 | Pure logic: types, reducer, format + root tests | ui/lib/{types,reducer,format}.ts, tests/ui/*.test.ts | [auto] root tsc + vitest green |
| 3 | useStream hook + Header/Funnel/Feed components | ui/lib/useStream.ts, ui/components/{Header,Funnel,DecisionFeed}.tsx | [auto] — |
| 4 | Tables + stats + page composition | ui/components/{PositionsTable,HistoryTable,StatsPanel}.tsx, ui/app/page.tsx | [auto] `npm run build` in ui/ green |
| 5 | CORS in api/server.ts; restart bot; full repo gate | api/server.ts | [auto] tests green; curl preflight ok |
| 6 | **Live verification**: `npm run dev` in ui/, human opens http://localhost:3000 — sees feed streaming, funnel incrementing, kill round-trip from the button; grep ui/ for live-trading affordances (none) | — | [human-verify] |
