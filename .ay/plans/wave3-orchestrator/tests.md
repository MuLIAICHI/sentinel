# Tests: wave3-orchestrator

All deterministic: injected clocks, mocked stage functions, no network/db.

## nursery.test.ts
| Test | Expect |
|---|---|
| token added at t0; clock → t0+18m | warmup(mint) fired, ripe not yet |
| clock → t0+20m | ripe(candidate) fired exactly once (ageSeconds correct) |
| clock → t0+60m without evaluation | dropped + onDrop fired (for unsubscribe) |
| 1001 tokens at cap 1000 | oldest dropped, onDrop fired |
| same mint added twice | second add ignored |

## pipeline.test.ts (deps fully mocked, test Bus instance)
| Test | Expect |
|---|---|
| happy BUY path | call order: cheapFilter→enrich→fullFilter→decide→approve→buy; candidate_filtered emitted twice (cheap+full, passed) |
| cheap filter reject | candidate_filtered(failed) emitted; enrich NEVER called |
| enrich returns null | drop; no decide call |
| full filter reject post-enrich | candidate_filtered(failed); no decide |
| decide → SKIP | no approve, no buy |
| approve → RiskBlock | risk_block emitted with reason; no buy |
| buy throws (no price) | logged, outcome 'buy_failed', loop survives |
| kill switch active in portfolio | RiskBlock kill_switch_active path passes through |

## daily.test.ts
| Test | Expect |
|---|---|
| boot loads existing day pnl from injected loader | pnl matches |
| position_closed events accumulate (incl. negative) | running pnl correct |
| pnl hits exactly −DAILY_LOSS_LIMIT_SOL | killFn called once with 'daily_loss'; not re-called on further losses |
| UTC day rollover | pnl resets; release called only if active kill reason was daily_loss |
| rollover with manual kill active | release NOT called |

Step-6 live run is the [human-verify] integration test (real feed, real funnel).
