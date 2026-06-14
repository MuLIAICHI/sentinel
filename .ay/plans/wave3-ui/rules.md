# Rules: wave3-ui

## Universal rules (13, addressed)

1. **Scope** — ui/, tests/ui/, api/server.ts (CORS only; integration owns api/).
2. Single responsibility — one component per concern; reducer/hook/format split.
3. No secrets — the UI holds none; it talks to localhost:3001 only.
4. Doc comments on lib exports. 5. Conventions followed. 6. No TODO/FIXME.
7. Explicit errors — ws close/error → reconnect + banner; kill POST failures
   surface in the button state. 8. No cycles. 9. Deterministic tests — pure
   reducer only, fixed timestamps. 10. No console.log. 11. Explicit imports.
12. No dead code. 13. Files ↔ steps.

## Task-specific rules

- **T1. The kill switch is the ONLY write.** No other mutating control may
  exist. Nothing in ui/ may reference live trading, mode switching, or any
  affordance to enable it (grep-verified before review).
- **T2. Honest data only** — no fabricated wallet balance; display what the
  system actually knows (realized P&L, unrealized from ticks, funnel counts).
- **T3. CORS allowance is localhost:3000 only** — no wildcard origins.
- **T4. Never touch .env / never push.**
