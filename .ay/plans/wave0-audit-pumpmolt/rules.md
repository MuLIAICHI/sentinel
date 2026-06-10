# Rules: wave0-audit-pumpmolt

## Universal rules — most concern production code; applicable ones:

1. **Scope** — writes only `docs/audits/pumpmolt-audit.md` (+ this plan folder).
   Clone lives in /tmp, never inside the repo.
2–6, 8–13 — no production code is written this task; n/a except:
3. **No secrets** — the audit never involves a real key; no wallet is created.
7. **Explicit errors** — if the repo is missing/moved/archived, that is reported
   as a finding, not silently worked around.

## Task-specific rules

- **T1. No lifecycle scripts:** `npm install --ignore-scripts` only. Never run the
  library's code with a real key or live RPC during the audit.
- **T2. Pin the verdict:** record the audited commit hash; the verdict applies to
  that hash only.
- **T3. Evidence or it didn't happen:** every claim in the report carries a
  file:line reference or a command + output excerpt.
- **T4. The human signs off:** the task is not DONE until the human has read the
  report and the sign-off is recorded in DECISIONS.md. Gate — do not wave through.
- **T5. Never run `git push`.** Never touch `.env`.
