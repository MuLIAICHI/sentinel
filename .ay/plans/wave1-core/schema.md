# Schema: wave1-core

All types come **literally** from `docs/SPEC.md` §3 (lines 57–133). They are listed
here by name only — the SPEC block is the source of truth and `core/types.ts` is its
transcription. Reproducing them twice in this plan would create a third copy to
drift.

| Type | Role |
|------|------|
| `RawTokenEvent` | raw thing off the websocket |
| `Candidate` | after cheap filters decide it's worth enriching |
| `FilterResult` | passed + failedRules[] |
| `EnrichedCandidate` | Candidate + on-chain context + meta tags |
| `Decision` | Claude's BUY/SKIP — strictly this shape |
| `Position` | paper or live position, open→closed lifecycle |
| `BotEvent` | discriminated union of all 9 bus event types |

New types introduced by this task (NOT in SPEC — small, additive, non-contract):

```ts
// core/config.ts
interface FilterThresholds {
  minAgeSeconds: number;      // default 1200 (~20 min, SPEC: age_too_young)
  curveMinPct: number;        // default 55  (SPEC: bonding_curve_out_of_band)
  curveMaxPct: number;        // default 85
  top10MaxPct: number;        // default 25  (SPEC: holder_concentration)
  devSoldMaxPct: number;      // default — propose 50, tunable (SPEC: dev_dumped)
}
type KnownEnvVar = 'PUMPPORTAL_WS_URL' | 'SOLANA_RPC_URL' | 'ANTHROPIC_API_KEY'
                 | 'DATABASE_URL' | 'INDEXER_API_KEY';

// core/logger.ts
type LogLevel = 'debug' | 'info' | 'warn' | 'error';
```

No database models in this task (that's wave1-db).
