# Tests: wave3-ui

Pure-logic suites in root vitest (components verified via next build + the live
browser check — no JSDOM theater for a single-page dashboard).

## reducer.test.ts
| Test | Expect |
|---|---|
| snapshot hydrates open/closed/decisions/stats/kill | state matches payload |
| raw_token increments live tokensSeen | counter +1, no feed entry |
| candidate_filtered passed/failed update stage counts + feed | cheap/full inferred (1st vs 2nd sighting per mint), feed entry capped |
| decision event prepends to feed + decisions list | BUY/SKIP recorded, caps enforced (feed 200, decisions 100) |
| position_opened/updated/closed move between open/closed + tick price | uPnL inputs updated; closed gets exitReason |
| kill_switch event flips kill state | active + reason |
| unknown event type ignored | state unchanged |

## format.test.ts
| Test | Expect |
|---|---|
| fmtSol / fmtPct / fmtAge | fixed fixtures (incl. negatives, sub-minute ages) |
| unrealizedPnl(position, price) | hand-computed value |
| distanceToExits(position, price, peak, now) | TP/hard/trail/time distances on fixtures; trail armed only when peak > entry |

Live step 6: feed visibly streams, funnel increments, kill button round-trips,
disconnect banner appears when the bot is stopped, no live-trading affordance.
