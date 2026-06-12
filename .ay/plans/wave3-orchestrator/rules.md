# Rules: wave3-orchestrator

## Universal rules (13, addressed)

1. **Scope** — orchestrator/, tests/orchestrator/, ecosystem.config.cjs (root,
   sanctioned: process entry artifact), tsconfig include line. NO edits to any
   Wave 1/2 module: a bug found there → BLOCKERS entry, not a cross-scope fix.
2. Single responsibility — nursery / pipeline / ticks / daily / index split.
3. No hardcoded secrets — env via core/config helpers only.
4. Doc comments on all exports. 5. Existing naming conventions.
6. No TODO/FIXME without task link. 7. Explicit error handling — every stage
   failure logged + candidate dropped; the loop never dies from one bad token.
8. No circular deps — orchestrator imports modules; nothing imports orchestrator.
9. Deterministic tests — injected clocks, mocked stages, no network.
10. No console.log — createLogger('orchestrator/...').
11. Explicit imports. 12. No dead code. 13. Files ↔ sequence steps.

## Task-specific rules

- **T1. Pipeline order is FIXED**: filter → enrich → decide → risk.approve →
  execute. risk.approve is never bypassed, reordered, or made optional.
- **T2. Risk module is the boss**: orchestrator only relays its verdicts; on
  RiskBlock emit risk_block and stop that candidate. Confidence/sizing logic
  lives in risk/, not here.
- **T3. LIVE_TRADING untouched**: executor constructed in paper mode, period.
- **T4. Never touch .env / never push** (project hard rules).
- **T5. Metered-budget discipline**: trade subscriptions only for nursery
  warmup window + open positions; unsubscribe on reject/age-out/close;
  periodic evictStale sweep with unsubscribe of dropped mints.
- **T6. One bus, one persistence attach**: attachPersistence exactly once at boot.
