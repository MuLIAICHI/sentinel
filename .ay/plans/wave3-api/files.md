# Files: wave3-api

## Create (6)

| File | Purpose |
|------|---------|
| `api/server.ts` | createApiServer(deps): express app + http server + ws attach; start(port?)/stop(); ApiDeps interface (injected getters + kill fns + bus) |
| `api/routes.ts` | buildRouter(deps): GET /health /positions /decisions /stats; POST /kill /kill/release |
| `api/stream.ts` | attachStream(wss, deps): snapshot-on-connect + bus.onAny forwarding + client cleanup |
| `tests/api/routes.test.ts` | ephemeral-port server + fetch: each GET shape, kill round-trip calls injected fns, 500 path, unknown route 404 |
| `tests/api/stream.test.ts` | ws client: snapshot arrives first, bus events forwarded in order, dead client dropped without crashing |
| *(plan folder)* | — |

## Modify (3)

| File | Change |
|------|--------|
| `orchestrator/index.ts` | boot(): create + start api server with real deps; shutdown(): stop it |
| `tsconfig.json` | include += api/** |
| `package.json` | deps += express, @types/express |

Total: 9 — integration scope.
