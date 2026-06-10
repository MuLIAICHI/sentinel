-- SPEC §6: minimum tables. Log first, act second — if it's not in the DB, it didn't happen.

CREATE TABLE raw_tokens (
  mint            text PRIMARY KEY,
  creator         text NOT NULL,
  created_at      bigint NOT NULL,                 -- unix ms, mirrors RawTokenEvent.createdAt
  symbol          text NOT NULL,
  name            text NOT NULL,
  initial_buy_sol double precision NOT NULL,
  source          text NOT NULL,
  seen_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX raw_tokens_creator_idx ON raw_tokens (creator);

CREATE TABLE decisions (
  id              bigserial PRIMARY KEY,
  mint            text NOT NULL,
  input_snapshot  jsonb NOT NULL,                  -- the EnrichedCandidate Claude saw
  action          text NOT NULL CHECK (action IN ('BUY', 'SKIP')),
  confidence      double precision NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  reasoning       text NOT NULL,
  latency_ms      integer NOT NULL,
  cost_usd        double precision,                -- nullable until decision/ computes per-call cost
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX decisions_created_at_idx ON decisions (created_at DESC);

CREATE TABLE positions (
  id               text PRIMARY KEY,
  mint             text NOT NULL,
  symbol           text NOT NULL,
  mode             text NOT NULL CHECK (mode IN ('paper', 'live')),
  entry_sol        double precision NOT NULL,
  entry_price      double precision NOT NULL,
  entry_at         bigint NOT NULL,
  amount_tokens    double precision NOT NULL,
  status           text NOT NULL CHECK (status IN ('open', 'closed')),
  exit_price       double precision,
  exit_at          bigint,
  exit_reason      text CHECK (exit_reason IN
                     ('take_profit', 'trailing_stop', 'hard_stop', 'time_stop', 'kill_switch')),
  realized_pnl_sol double precision
);
CREATE INDEX positions_open_idx ON positions (status) WHERE status = 'open';

CREATE TABLE daily_stats (
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
);

-- Single row, enforced: the kill switch has exactly one state.
CREATE TABLE kill_state (
  id         integer PRIMARY KEY CHECK (id = 1),
  active     boolean NOT NULL DEFAULT false,
  reason     text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO kill_state (id, active, reason) VALUES (1, false, 'init');
