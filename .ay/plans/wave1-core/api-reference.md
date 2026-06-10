# API Reference: wave1-core

No external APIs are called by this task (no network, no LLM, no chain access).

External libraries used (dev-time only):

- **typescript** ^5.x — `tsc --noEmit` for typechecking.
- **vitest** ^3.x — test runner; `describe/it/expect`, `vi.spyOn(process.stdout, 'write')`
  for logger output capture, `vi.stubEnv` for config tests.
- **@types/node** — `node:events.EventEmitter`, `process.env`, `process.stdout`.

Runtime dependencies: **none**. `core/` uses only `node:events` and globals.

## Public surface exported by core/ (what Wave 2 codes against)

```ts
// core/types.ts — all SPEC §3 interfaces + BotEvent union (see schema.md)

// core/bus.ts
export class Bus {
  emit(event: BotEvent): void
  on<T extends BotEvent['type']>(type: T, handler: (payload: Extract<BotEvent, {type: T}>['payload']) => void): void
  onAny(handler: (event: BotEvent) => void): void
}
export const bus: Bus   // process-wide singleton

// core/config.ts
export interface FilterThresholds { minAgeSeconds; curveMinPct; curveMaxPct; top10MaxPct; devSoldMaxPct; /* + volume */ }
export const defaultThresholds: FilterThresholds
export function requireEnv(name: KnownEnvVar): string      // throws named error
export function optionalEnv(name: KnownEnvVar): string | undefined
export type KnownEnvVar = 'PUMPPORTAL_WS_URL' | 'SOLANA_RPC_URL' | 'ANTHROPIC_API_KEY' | 'DATABASE_URL' | 'INDEXER_API_KEY'

// core/logger.ts
export interface Logger { debug; info; warn; error }       // (msg: string, fields?: object) => void
export function createLogger(module: string): Logger
```
