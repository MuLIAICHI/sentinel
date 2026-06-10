# Sequence: wave0-audit-pumpmolt

| # | Step | Files | Checkpoint |
|---|------|-------|------------|
| 1 | Clone to /tmp/pumpmolt-audit, record commit hash, survey layout (file list, LOC, package.json) | — | [auto] clone succeeds; if repo missing → STOP, report to human |
| 2 | Key-path trace: find every reference to secret key / Keypair / signing; map the full lifecycle of key material | — | [auto] every reference accounted for |
| 3 | Outbound inventory: grep all URLs, fetch/ws/http usage; list endpoint + payload for each | — | [auto] every network touchpoint listed |
| 4 | Dependency review: install --ignore-scripts, npm audit, inspect dep tree + lifecycle scripts of deps | — | [auto] audit output captured |
| 5 | Write docs/audits/pumpmolt-audit.md with verdict | docs/audits/pumpmolt-audit.md | [auto] all four sections + verdict present |
| 6 | Clean /tmp clone; present report to human for sign-off | — | [human-verify] human reads report, approves/rejects → DECISIONS.md |
