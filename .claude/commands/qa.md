---
name: ayf:qa
description: |
  QA mode: run diff-aware tests, compute health score, report results.
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Agent
  - AskUserQuestion
---

# /qa -- Quality Assurance Mode

Run targeted and full test suites, compute a project health score, and report results.

## Step 1: Load QA Context

1. Read `docs/CLAUDE-QA.md` if it exists for project-specific QA rules and test commands.
2. Identify the project's test runner and commands (look for package.json scripts, Makefile targets, pytest config, etc.).
3. Run `git diff --name-only` to identify changed files.

## Step 2: Diff-Aware Test Selection

Map changed files to their test files:
- `src/auth/login.ts` maps to `tests/auth/login.test.ts` (or similar convention).
- If a changed file has no corresponding test file, flag it as **untested change**.

Categorize tests:
- **Direct tests** -- Test files that correspond to changed source files.
- **Dependent tests** -- Test files that import or reference changed modules.
- **Full suite** -- All tests in the project.

## Step 3: Run Tests

Run in order:

1. **Direct tests only** -- Fast feedback on the exact changes.
2. **Dependent tests** -- Catch breakage in downstream consumers.
3. **Full suite** -- Confirm nothing else broke.

For each run, capture:
- Total tests
- Passed
- Failed (with failure details)
- Skipped
- Duration

If direct tests fail, report immediately. Do not run dependent or full suite until direct tests pass (unless the human asks to run all anyway).

## Step 4: Compute Health Score

Calculate a health score (0-100) based on:

| Metric | Weight | Scoring |
|--------|--------|---------|
| Test pass rate | 40% | (passed / total) * 100 |
| Build status | 20% | 100 if passes, 0 if fails |
| Type check | 15% | 100 if passes, 0 if fails |
| Lint status | 10% | 100 if clean, 50 if warnings only, 0 if errors |
| Test coverage delta | 15% | 100 if coverage increased or stable, 50 if decreased < 5%, 0 if decreased >= 5% |

```
Health Score = (pass_rate * 0.4) + (build * 0.2) + (typecheck * 0.15) + (lint * 0.1) + (coverage * 0.15)
```

## Step 5: Report

```
QA REPORT
=========

Health Score: {score}/100 [{HEALTHY / WARNING / CRITICAL}]

  HEALTHY:  80-100
  WARNING:  50-79
  CRITICAL: 0-49

Tests
-----
Direct:    {passed}/{total} passed ({duration})
Dependent: {passed}/{total} passed ({duration})
Full:      {passed}/{total} passed ({duration})

Failures:
  {test name}: {error message} ({file}:{line})
  ...

Build:     {PASS/FAIL}
TypeCheck: {PASS/FAIL}
Lint:      {PASS/FAIL} ({warning_count} warnings)

Untested Changes:
  {file}: No corresponding test file found
  ...

Coverage:
  Before: {X}%
  After:  {Y}%
  Delta:  {+/-Z}%
```

## Step 6: Recommendations

Based on the report:

- **HEALTHY (80-100):** "All clear. Ready to ship or continue building."
- **WARNING (50-79):** List specific items to address before shipping. Prioritize by impact.
- **CRITICAL (0-49):** "Do not ship. Fix these issues first:" followed by prioritized list.

If untested changes exist, recommend writing tests for them and estimate the effort.
