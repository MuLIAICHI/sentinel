# Sequence: wave3-api

| # | Step | Files | Checkpoint |
|---|------|-------|------------|
| 1 | Install express + types; tsconfig include | package.json, tsconfig.json | [auto] install + tsc |
| 2 | api/routes.ts + api/server.ts | api/routes.ts, api/server.ts | [auto] tsc |
| 3 | api/stream.ts + both test suites | api/stream.ts, tests/api/*.test.ts | [auto] api tests green |
| 4 | Wire into orchestrator boot()/shutdown(); full repo gate | orchestrator/index.ts | [auto] 272+ tests green |
| 5 | **Live verification**: restart the running bot (SIGINT → relaunch with API); curl /health /positions /stats; ws smoke; then THE FIRST LIVE KILL FLIP: POST /kill → verify risk_block behavior + engine state → POST /kill/release → verify recovery | — | [human-verify] human approves the kill round-trip evidence |
