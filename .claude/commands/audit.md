---
name: ayf:audit
description: |
  Security + performance + quality audit. Finds vulnerabilities, bottlenecks, and code smells.
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Agent
  - WebSearch
  - AskUserQuestion
---

# /audit -- Full Codebase Audit

Runs a comprehensive audit covering security, performance, and code quality. Outputs a structured report with severity levels and fix suggestions.

Replaces the need for separate security-audit, performance-audit, code-review, and lint commands.

## Scope

The human can scope the audit:
- `/audit` -- full codebase
- `/audit security` -- security only
- `/audit performance` -- performance only
- `/audit src/api/` -- specific directory

## Protocol

### Pass 1: Security (CRITICAL)

Check for:
- [ ] Hardcoded secrets (API keys, tokens, passwords in source files)
- [ ] SQL injection (raw queries, string interpolation in SQL)
- [ ] XSS (unescaped user input in HTML/JSX, dangerouslySetInnerHTML)
- [ ] Missing authentication on API routes
- [ ] Missing authorization (can user A access user B's data?)
- [ ] Missing input validation (no Zod/joi/yup on user inputs)
- [ ] Insecure dependencies (`npm audit` or equivalent)
- [ ] Missing CSRF protection
- [ ] Exposed error details in production (stack traces in API responses)
- [ ] Missing rate limiting on public endpoints

### Pass 2: Performance

Check for:
- [ ] N+1 queries (fetching related data in loops)
- [ ] Missing pagination (fetching all records)
- [ ] Missing indexes on frequently queried columns
- [ ] Large bundle imports (importing entire library for one function)
- [ ] Missing caching where appropriate
- [ ] Unnecessary re-renders (React: missing memo, useMemo, useCallback)
- [ ] Unoptimized images (no lazy loading, no responsive sizes)
- [ ] Missing debounce on search/filter inputs
- [ ] Synchronous file I/O in request handlers

### Pass 3: Code Quality

Check for:
- [ ] Dead code (unused functions, unreachable branches)
- [ ] Duplicated logic (same pattern repeated 3+ times)
- [ ] Missing error handling (unhandled promise rejections, empty catch blocks)
- [ ] Inconsistent patterns (mix of async/await and .then, mix of class and function)
- [ ] Missing types (any types, untyped function parameters)
- [ ] TODO/FIXME/HACK comments that should be addressed
- [ ] Missing tests for critical paths

## Output Format

```
## AUDIT REPORT

### CRITICAL (fix before shipping)
1. [file:line] Hardcoded API key in source
   Risk: Key exposure in public repo
   Fix: Move to environment variable

### HIGH (fix soon)
1. [file:line] Missing input validation on /api/users POST
   Risk: Malformed data crashes the server
   Fix: Add Zod schema validation

### MEDIUM (should fix)
1. [file:line] N+1 query in getUsersWithOrders()
   Risk: Slow response at scale
   Fix: Use JOIN or batch query

### LOW (nice to have)
1. [file:line] Unused import: lodash
   Fix: Remove import

### SUMMARY
Critical: N | High: N | Medium: N | Low: N
Overall health: [score]/100
```

## Rules

- Never auto-fix critical security issues -- always show to human first
- Auto-fix LOW issues (unused imports, formatting) if fewer than 5
- If you find a hardcoded secret, flag it immediately -- don't wait for the full report
- For security issues, include the OWASP category
