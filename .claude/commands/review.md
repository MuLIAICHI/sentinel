---
name: ayf:review
description: |
  Self-review mode: two-pass code review (critical + quality) with structured report.
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

# /review -- Self-Review Mode

Perform a structured two-pass code review on recent changes. Auto-fix mechanical issues. Escalate judgment calls.

## Step 1: Load Review Context

1. Read `docs/CLAUDE-REVIEW.md` if it exists for project-specific review rules.
2. Run `git diff --name-only` to get the list of changed files.
3. Run `git diff` to get the full diff.
4. If a task is currently in progress (check `.ay/tracking/locks/`), load its plan from `.ay/plans/task-{N}/` for context.

## Step 2: Pass 1 -- Critical

Review every changed file for critical issues. These MUST be fixed before shipping.

### Critical Checklist

- [ ] **Syntax errors** -- Code parses without errors.
- [ ] **Type errors** -- All types resolve correctly (run typecheck if available).
- [ ] **Missing imports/exports** -- Every reference resolves to a real module or symbol.
- [ ] **Broken references** -- No dangling imports, broken links, or undefined variables.
- [ ] **Security issues** -- No hardcoded secrets, no SQL injection, no XSS, no path traversal.
- [ ] **Logic errors** -- No off-by-one, null pointer, race condition, infinite loop.
- [ ] **Build breaks** -- Project builds successfully after changes.
- [ ] **Test breaks** -- Existing tests still pass.
- [ ] **Data loss risk** -- No destructive operations without safeguards.
- [ ] **API contract violations** -- Request/response shapes match documented contracts.

For each critical issue found, record:
- File and line
- Category (from checklist above)
- Description
- Severity (blocks ship / high risk)

## Step 3: Auto-Fix Critical Issues

Fix every critical issue found in Pass 1:
- Add missing imports
- Fix syntax errors
- Remove hardcoded secrets (replace with env vars)
- Fix type mismatches
- Add null checks where needed

After fixes, re-run build and tests to confirm fixes are clean.

## Step 4: Pass 2 -- Quality

Review for quality issues. Fix if the fix takes under 2 minutes. Otherwise, note for the human.

### Quality Checklist

- [ ] **Naming clarity** -- Variables, functions, files have descriptive names.
- [ ] **Code style** -- Follows existing codebase conventions.
- [ ] **Documentation** -- Public APIs have doc comments. Complex logic has inline comments.
- [ ] **Error messages** -- User-facing errors are clear and actionable.
- [ ] **Edge cases** -- Boundary conditions are handled (empty arrays, null values, max lengths).
- [ ] **Performance** -- No obvious N+1 queries, unnecessary re-renders, or unbounded loops.
- [ ] **Duplication** -- No copy-pasted code that should be extracted.
- [ ] **Dead code** -- No unreachable code, unused variables, or commented-out blocks.
- [ ] **Logging** -- No console.log/print statements. Proper logging where needed.
- [ ] **Test quality** -- Tests are meaningful, not just asserting true.

For each quality issue found, record:
- File and line
- Category
- Description
- Action: FIXED / NOTED (with reason why not fixed)

## Step 5: Generate Report

Output a structured report:

```
REVIEW REPORT
=============

Pass 1: Critical
-----------------
Found: {count} issues
Fixed: {count}
Remaining: {count}

{For each remaining critical issue:}
  [{file}:{line}] {category}: {description}

Pass 2: Quality
---------------
Found: {count} issues
Fixed: {count}
Noted: {count}

{For each noted quality issue:}
  [{file}:{line}] {category}: {description}
  Reason not fixed: {reason}

Build: {PASS/FAIL}
Tests: {X}/{Y} passing
Lint:  {PASS/FAIL}

Verdict: {SHIP / FIX CRITICAL / NEEDS DISCUSSION}
```

### Verdict Criteria

- **SHIP** -- Zero critical issues remaining. Build and tests pass. Quality issues are minor.
- **FIX CRITICAL** -- Critical issues remain that could not be auto-fixed. Must resolve before shipping.
- **NEEDS DISCUSSION** -- Quality issues that require human judgment (architecture decisions, naming debates, scope questions).
