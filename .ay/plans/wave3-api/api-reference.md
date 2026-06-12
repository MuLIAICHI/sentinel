# API Reference: wave3-api

## External libs
- express ^4 (router, json body parsing via express.json())
- ws (already installed): `new WebSocketServer({ server })`, ws.readyState === OPEN

## The HTTP surface this task creates (consumed by wave3-ui)

| Method | Path | Response |
|---|---|---|
| GET | /health | {ok, killActive, openPositions, uptimeSec} |
| GET | /positions | {open: Position[], closed: Position[]} |
| GET | /decisions?limit=N | Decision[] (latest first, default 100) |
| GET | /stats | {day, stats: DailyStats \| null, kill: KillState} |
| POST | /kill {reason?} | {ok:true} after activateKill |
| POST | /kill/release | {ok:true} after releaseKill |
| WS | / (same port) | first frame {type:'snapshot', payload:{...}}, then every BotEvent as {type, payload} |

## Internal seam

```ts
export interface ApiDeps {
  bus: Bus;
  openPositions(): Promise<Position[]>;
  closedPositions(limit?: number): Promise<Position[]>;
  decisions(limit?: number): Promise<Decision[]>;
  dailyStats(): Promise<DailyStats | undefined>;
  killState(): Promise<KillState>;
  activateKill(reason: string): Promise<void>;
  releaseKill(reason: string): Promise<void>;
}
export function createApiServer(deps: ApiDeps): {
  start(port?: number, host?: string): Promise<number>; // resolves actual port
  stop(): Promise<void>;
}
```
