# Changelog

## [Unreleased]

### Added
- `core/` foundation (task wave1-core): SPEC §3 contracts in `core/types.ts`
  (FROZEN, ADR-001), typed event bus with handler isolation (`core/bus.ts`),
  config loader with named-env-var errors and filter threshold defaults
  (`core/config.ts`), JSON-line logger with default-on secret redaction
  (`core/logger.ts`). 16 tests. Toolchain: ESM, strict TS, vitest (ADR-002).

### Changed
### Fixed
