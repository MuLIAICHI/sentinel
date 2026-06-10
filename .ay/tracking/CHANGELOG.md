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

### Changed
### Fixed
