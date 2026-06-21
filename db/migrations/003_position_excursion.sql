-- Intra-trade price path per position: max favorable (peak) and max adverse
-- (trough) excursion, captured by the exit engine at close. Lets backtests
-- read the exact path instead of reconstructing it from on-chain swaps.
-- Separate table on purpose: keeps the frozen Position contract untouched.
-- No FK to positions(id): the row is written on close via a best-effort sink,
-- and we never want an ordering race to drop the excursion record.

CREATE TABLE position_excursion (
  position_id  text PRIMARY KEY,
  mint         text NOT NULL,
  entry_price  double precision NOT NULL,
  peak_price   double precision NOT NULL,
  trough_price double precision NOT NULL,
  peak_at      bigint NOT NULL,                 -- unix ms
  trough_at    bigint NOT NULL,                 -- unix ms
  closed_at    bigint NOT NULL,                 -- unix ms
  recorded_at  timestamptz NOT NULL DEFAULT now()
);

-- Match the project RLS posture (002): close the anon-key REST path; the bot
-- connects as the postgres role and bypasses RLS.
ALTER TABLE public.position_excursion ENABLE ROW LEVEL SECURITY;


