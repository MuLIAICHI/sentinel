# Tests: wave0-audit-pumpmolt

No code is produced, so no test suite. Verification = the task file's checklist:

| Check | How |
|-------|-----|
| Outbound-call inventory complete | Cross-check: every grep hit for http/ws/URL strings appears in the report table |
| Key-handling verdict has evidence | Every claim carries file:line; the full lifecycle (read → Keypair → sign → submit) is traced |
| npm audit summarized | Severity counts + notable advisories quoted |
| Verdict is explicit | One of SAFE / UNSAFE / SAFE-WITH-CHANGES, with conditions if the latter |
| Commit hash pinned | Hash recorded in the report header |
| Human sign-off | Recorded in DECISIONS.md before task is DONE |
