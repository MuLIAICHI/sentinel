# Plan: wave0-audit-pumpmolt — security audit of the pumpmolt execution library

## Goal

Produce `docs/audits/pumpmolt-audit.md` answering one question with evidence:
**can this library be trusted anywhere near a funded wallet?** Deliverable is a
report with a SAFE / UNSAFE / SAFE-WITH-CHANGES verdict; the human reviews and
signs off (recorded in DECISIONS.md). No production code is written.

## Approach

1. Clone https://github.com/PlaydaDev/pumpmolt into /tmp (outside the repo, never
   vendored), **install with --ignore-scripts** so no postinstall code runs.
2. Trace every code path that touches key material: where the secret key enters,
   what constructs the Keypair, what signs, what could serialize/log/transmit it.
3. Inventory every outbound network call (grep for URLs, fetch/axios/ws usage,
   http(s) module use) — list each endpoint and exactly what data it sends.
4. Dependency review: npm audit, dependency tree size, install scripts,
   typosquat-looking names, anything fetching code at runtime.
5. Write the report: outbound-call inventory table, key-handling verdict with
   file:line references, dependency findings with severities, explicit verdict +
   conditions if SAFE-WITH-CHANGES.

## Key Decisions

- **--ignore-scripts on install** — we're auditing potentially untrusted code; its
  lifecycle scripts don't get to run on this machine before we've read them.
- **Read the code at a pinned commit** and record the commit hash in the report —
  the verdict applies to that hash, not to "whatever main is later."

## Risks / Open Questions

- Repo may have moved/changed since the spec was written; if it's missing or
  archived, that's itself a critical finding — report and stop.
- A clean audit of THIS code doesn't cover its transitive deps' future releases;
  report will recommend a lockfile pin when execution/ eventually vendors it.
