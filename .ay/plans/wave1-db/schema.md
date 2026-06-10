# Schema: wave1-db

## Tables (db/migrations/001_init.sql)

```sql
raw_tokens (
  mint            text PRIMARY KEY,
  creator         text NOT NULL,
  created_at      bigint NOT NULL,          -- unix ms, as in RawTokenEvent
  symbol          text NOT NULL,
  name            text NOT NULL,
  initial_buy_sol double precision NOT NULL,
  source          text NOT NULL,
  seen_at         timestamptz NOT NULL DEFAULT now()
)  -- + INDEX on creator (getCreatorHistory)

decisions (
  id              bigserial PRIMARY KEY,
  mint            text NOT NULL,
  input_snapshot  jsonb NOT NULL,           -- the EnrichedCandidate Claude saw
  action          text NOT NULL CHECK (action IN ('BUY','SKIP')),
  confidence      double precision NOT NULL,
  reasoning       text NOT NULL,
  latency_ms      integer NOT NULL,
  cost_usd        double precision,         -- nullable until decision/ computes it
  created_at      timestamptz NOT NULL DEFAULT now()
)  -- + INDEX on created_at DESC

positions (
  id               text PRIMARY KEY,        -- Position.id
  mint             text NOT NULL,
  symbol           text NOT NULL,
  mode             text NOT NULL CHECK (mode IN ('paper','live')),
  entry_sol        double precision NOT NULL,
  entry_price      double precision NOT NULL,
  entry_at         bigint NOT NULL,
  amount_tokens    double precision NOT NULL,
  status           text NOT NULL CHECK (status IN ('open','closed')),
  exit_price       double precision,
  exit_at          bigint,
  exit_reason      text CHECK (exit_reason IN
                     ('take_profit','trailing_stop','hard_stop','time_stop','kill_switch')),
  realized_pnl_sol double precision
)  -- + partial INDEX on status WHERE status='open'

daily_stats (
  day              date PRIMARY KEY,
  tokens_seen      integer NOT NULL DEFAULT 0,
  passed_filter    integer NOT NULL DEFAULT 0,
  enriched         integer NOT NULL DEFAULT 0,
  buys             integer NOT NULL DEFAULT 0,
  skips            integer NOT NULL DEFAULT 0,
  positions_opened integer NOT NULL DEFAULT 0,
  risk_blocks      integer NOT NULL DEFAULT 0,
  kill_events      integer NOT NULL DEFAULT 0,
  realized_pnl_sol double precision NOT NULL DEFAULT 0
)

kill_state (
  id         integer PRIMARY KEY CHECK (id = 1),   -- single row, enforced
  active     boolean NOT NULL DEFAULT false,
  reason     text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
)  -- seeded with (1, false, 'init')

schema_migrations ( name text PRIMARY KEY, applied_at timestamptz DEFAULT now() )
```

## New TS types (db-local, not contract changes)

```ts
type DbOp = { sql: string; values: unknown[] }
type DailyStatCounter = 'tokens_seen' | 'passed_filter' | 'enriched' | 'buys'
  | 'skips' | 'positions_opened' | 'risk_blocks' | 'kill_events';
interface DailyStats { day: string; /* counters above */ realizedPnlSol: number }
interface KillState { active: boolean; reason: string; updatedAt: string }
interface CreatorHistory { launches: number; rugs: number }   // rugs heuristic refined by enrichment later
```

Frozen `core/types.ts` is untouched (ADR-001).
