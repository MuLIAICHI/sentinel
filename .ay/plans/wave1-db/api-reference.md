# API Reference: wave1-db

## pg (node-postgres) ^8.x — runtime dependency

```ts
import pg from 'pg';                      // CJS default import under NodeNext ESM
const pool = new pg.Pool({ connectionString });   // standard Postgres URL (Supabase-compatible)
await pool.query<Row>(text, values);      // $1..$n parameterized
await pool.end();
```
Supabase note: use the **session pooler** connection string (port 5432/6543) —
plain Postgres wire protocol, TLS on. No supabase-js SDK anywhere (rule T5).

## Supabase MCP (provisioning only, step 5)

Tools available pre-auth: `authenticate` → returns OAuth URL for the user;
`complete_authentication(callback_url)`. Real tools (project create, SQL execute)
appear post-auth — discovered then. Used only to provision; the shipped code never
talks to the MCP.

## Public surface exported by db/ (what Wave 2/3 codes against)

```ts
// db/client.ts
export function query<R>(text: string, values?: unknown[]): Promise<R[]>
export function closePool(): Promise<void>

// db/migrate.ts
export function migrate(): Promise<number>          // returns # applied

// db/queries.ts
export function insertRawToken(t: RawTokenEvent): Promise<void>
export function insertDecision(d: Decision, snapshot: EnrichedCandidate): Promise<void>
export function upsertPosition(p: Position): Promise<void>
export function getOpenPositions(): Promise<Position[]>
export function getDecisions(limit?: number): Promise<Decision[]>
export function getDailyStats(day: string): Promise<DailyStats | undefined>
export function bumpDailyStat(day: string, field: DailyStatCounter, by?: number): Promise<void>
export function getKillState(): Promise<KillState>
export function setKillState(active: boolean, reason: string): Promise<void>
export function getCreatorHistory(creator: string): Promise<CreatorHistory>

// db/persist.ts
export function routeEvent(event: BotEvent): DbOp[]          // pure
export function attachPersistence(bus: Bus): void
```
