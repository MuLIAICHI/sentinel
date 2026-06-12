# Tests: wave3-api

All against a real server on port 0 with injected fake deps. No db/network.

## routes.test.ts
| Test | Expect |
|---|---|
| GET /health | 200 {ok:true, killActive, openPositions, uptime} |
| GET /positions | 200 {open:[...], closed:[...]} from injected getters |
| GET /decisions?limit=5 | 200 array, limit passed through (default 100) |
| GET /stats | 200 today's DailyStats (or null) + kill state |
| POST /kill {reason:'x'} | 200; injected activateKill called with 'x' |
| POST /kill no body | 200; activateKill called with 'manual_ui' |
| POST /kill/release | 200; releaseKill called |
| injected getter throws | 500 {error}, server survives |
| GET /nope | 404 |

## stream.test.ts
| Test | Expect |
|---|---|
| connect | first message type 'snapshot' with positions/decisions/stats/kill |
| bus.emit raw_token + decision after connect | both forwarded as {type, payload} in order after snapshot |
| two clients | both receive events |
| client closes, more events emitted | no crash; remaining client still receives |

Step-5 live run covers: real /health against the running bot, ws firehose, and
the first end-to-end kill flip (risk → bus → engine + orchestrator cache → release).
