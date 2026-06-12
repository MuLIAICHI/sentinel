# API Reference: wave3-orchestrator

No NEW external APIs — this task only composes the already-built module surfaces
(listed in context.md, sourced from each module's HANDOFF entry). External
services (PumpPortal/Helius/Anthropic/Supabase) are reached exclusively through
those modules.

PM2: `ecosystem.config.cjs` with `apps: [{ name: 'sentinel', script: 'orchestrator/index.ts',
interpreter: 'node', interpreter_args: '--import tsx', autorestart: true,
max_restarts, kill_timeout }]` — env comes from the shell that runs `pm2 start`
(sourced from ~/.sentinel-env), never from a file in the repo.

## Public surface exported by orchestrator/

```ts
// orchestrator/index.ts
export async function boot(): Promise<void>
export async function shutdown(): Promise<void>

// orchestrator/nursery.ts
export class Nursery {
  constructor(opts: { ripenAgeSec?, warmupSec?, maxAgeSec?, cap?, now?,
    onWarmup(mint), onRipe(candidate: Candidate), onDrop(mint) })
  add(event: RawTokenEvent): void
  tick(): void            // advance evaluation; called on an interval
  stop(): void
  size(): number
}

// orchestrator/pipeline.ts
export interface PipelineDeps { cheapFilter; enrich; fullFilter; decide;
  getPortfolio(): PortfolioState; approve; buy; bus }
export type PipelineOutcome = 'cheap_reject'|'enrich_failed'|'full_reject'
  |'skip'|'risk_block'|'buy_failed'|'opened'
export async function evaluateCandidate(c: Candidate, deps: PipelineDeps): Promise<PipelineOutcome>

// orchestrator/ticks.ts
export function startTickLoop(opts): { stop(): void }

// orchestrator/daily.ts
export class DailyTracker { boot(); currentPnl(); attach(bus); stop() }
```
