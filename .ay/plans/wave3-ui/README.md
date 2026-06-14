# Plan: wave3-ui — the Next.js dashboard

## Goal

The single dark real-time dashboard (SPEC §5): header with mode badge + today's
P&L + KILL SWITCH, live decision feed, open positions with distance-to-exit,
history, stats panel, funnel counter. Read-only except the kill switch; no
live-trading affordance exists or may be added.

## Approach

1. **Self-contained Next.js app in ui/** with its OWN package.json (Next's dep
   tree stays out of the bot's). Root tsconfig doesn't include ui/ — `next
   build` is its typecheck. App Router, one page, plain CSS (no Tailwind — one
   dark page doesn't justify a styling toolchain).
2. **All real-time data over the websocket** (snapshot frame hydrates, BotEvents
   update); REST used only for the kill POSTs. One small CORS allowance added to
   api/server.ts for localhost:3000 (REST fetches are cross-port; WS needs none).
3. **A pure reducer** (ui/lib/reducer.ts, no React) holds all state logic:
   apply snapshot, apply each BotEvent type, derive funnel/feed/positions with
   caps. Tested from the root vitest suite — the components stay thin.
4. **Feed shows candidate evaluations, not just decisions** (api handoff:
   decisions are ~1-2% of candidates; a decisions-only feed looks frozen).
   candidate_filtered events render as compact reject lines; decision events
   render big with action/confidence/reasoning.
5. Distance-to-exit computed from positions' published ExitConfig defaults
   (TP +80%, trail −25% from peak, hard −35%, time 45 min).
6. Reconnect with backoff + a visible "STREAM DISCONNECTED" banner.

## Key decisions

- Wire types mirrored in ui/lib/types.ts (Next can't cleanly import ../core
  across the package boundary; source of truth noted in a header comment).
- Header shows paper equity facts we actually have (today realized P&L +
  unrealized from open positions); no fake "wallet balance".
- Kill button = two-step confirm; release likewise; both disabled while pending.

## Risks

- Next 15 + React 19 versions move; pin what npm resolves at install.
- Browser verification is inherently manual — the [human-verify] step is the
  user opening the dashboard against the live bot.
