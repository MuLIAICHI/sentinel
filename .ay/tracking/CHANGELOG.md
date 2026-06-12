# Changelog

## [Unreleased]

### Added
- `core/` foundation (task wave1-core): SPEC §3 contracts in `core/types.ts`
  (FROZEN, ADR-001), typed event bus with handler isolation (`core/bus.ts`),
  config loader with named-env-var errors and filter threshold defaults
  (`core/config.ts`), JSON-line logger with default-on secret redaction
  (`core/logger.ts`). 16 tests. Toolchain: ESM, strict TS, vitest (ADR-002).
- `db/` layer (task wave1-db): SPEC §6 schema (raw_tokens, decisions, positions,
  daily_stats, kill_state) live on Supabase (ADR-004), idempotent migration applier,
  typed query helpers, bus-driven event persistence with pure routing (ADR-005).
  21 tests (14 pure, 7 live-DB).
- pumpmolt security audit (task wave0-audit-pumpmolt): docs/audits/pumpmolt-audit.md,
  verdict SAFE-WITH-CHANGES (ADR-006) — vendor trade path with keypair injection,
  verify-before-sign, pin to commit 7119de43.
- `filter/` (task wave2-filter): six pure deterministic rules, all-failures-collected
  evaluate(), skip-on-missing-context. 26 tests.
- `risk/` (task wave2-risk): hardcoded guards (LIVE_TRADING=false + tripwire test),
  pure approve() gate (confidence can only shrink size), DB-backed kill switch.
  SOL=$150 sizing assumption flagged for review. 28 tests.
- `positions/` (task wave2-positions): mechanical exit engine — TP 50% @ +80%,
  25% trail from peak, −35% hard stop, 45-min time stop, latched kill flatten;
  injected SellExecutor contract. 22 tests.
- `ingestion/` (task wave2-ingestion): single-socket PumpPortal client (ADR-007),
  reconnect + re-subscribe, trade ring buffer read API; live smoke PASS. 42 tests.
- `enrichment/` (task wave2-enrichment): Helius free-tier provider behind a
  DataProvider seam (ADR-008), holder/dev heuristics, 6h meta tags. 29 tests.
- `decision/` (task wave2-decision): claude-haiku-4-5 with structured outputs and
  100/hr ceiling (ADR-009); decide() never throws, all failures → SKIP. 35 tests.
- `execution/` (task wave2-execution): paper fill engine implementing positions'
  SellExecutor; vendored pumpmolt trade path @7119de43 with keypair injection and
  verify-before-sign (ADR-006); live path double-gated and unreachable. 37 tests.
  WAVE 2 COMPLETE — 250 tests repo-wide.
- `orchestrator/` (task wave3-orchestrator): nursery (age-staged evaluation at
  20 min), fixed six-stage pipeline with un-bypassable risk gate, daily-loss
  kill + UTC rollover, tick delivery to the exit engine, graceful shutdown,
  PM2 config. Live-verified ~90 min on the real feed (0 errors). Free local
  pre-filter added after live discovery of ~28 launches/min — 99%+ of
  candidates now rejected before any paid API call. 272 tests repo-wide.

### Changed
### Fixed
- RLS enabled (no policies) on all 6 tables — closes the Supabase anon-key REST
  path; direct pg connection unaffected (002_enable_rls, resolves ADR-004 caveat).
