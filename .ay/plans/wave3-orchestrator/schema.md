# Schema: wave3-orchestrator

No new DB tables, no contract changes (core/types.ts untouched, ADR-001).
New orchestrator-local types only:

```ts
// nursery.ts
interface NurseryEntry { event: RawTokenEvent; addedAt: number;
  warmupFired: boolean; ripeFired: boolean }
interface NurseryConfig { ripenAgeSec: 1200; warmupSec: 120; maxAgeSec: 3600;
  cap: 1000 }   // defaults; ripenAge matches defaultThresholds.minAgeSeconds

// pipeline.ts
type PipelineOutcome = 'cheap_reject' | 'enrich_failed' | 'full_reject'
  | 'skip' | 'risk_block' | 'buy_failed' | 'opened'

// daily.ts
interface DailyState { day: string; realizedPnlSol: number; killTripped: boolean }
```

Candidate construction (RawTokenEvent → Candidate): mint, creator, createdAt,
symbol, name copied; ageSeconds = (now − createdAt)/1000 computed at ripe time.

FilterContext mapping (EnrichedCandidate → full pass): bondingCurvePct,
top10HolderPct, devSoldPct, volumeAccelerating copied; knownBadCreators = empty
set v1.
