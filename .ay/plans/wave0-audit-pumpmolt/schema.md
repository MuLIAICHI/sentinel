# Schema: wave0-audit-pumpmolt

No data models introduced. Report structure:

1. Header: repo URL, commit hash, audit date, auditor
2. Key-handling trace (file:line evidence) → verdict
3. Outbound-call inventory (endpoint | trigger | data sent | file:line)
4. Dependency review (npm audit summary, tree notes, lifecycle scripts)
5. Verdict: SAFE / UNSAFE / SAFE-WITH-CHANGES + conditions
6. Recommendations for wave2-execution's wrapper
