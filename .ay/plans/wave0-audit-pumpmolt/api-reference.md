# API Reference: wave0-audit-pumpmolt

No APIs are called by this task. The audit READS code that talks to:
- PumpPortal trade-local API (https://pumpportal.fun/api/trade-local) — expected:
  receives unsigned tx parameters, returns a serialized tx to sign locally.
- Solana RPC (sendTransaction of the locally signed tx).
These expectations come from PumpPortal's documented local-signing flow; the audit
verifies the code matches them and flags anything beyond them.

pumpmolt public surface (per SPEC): `buyTokens` / `sellTokens` — signatures
recorded in the report for wave2-execution's wrapper.
