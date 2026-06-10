---
name: ayf:fix
description: |
  Investigate and fix a bug. Root-cause analysis, then targeted fix with verification.
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

# /fix -- Investigate and Fix

Takes a bug report (error message, broken behavior, failing test) and handles the full cycle:
investigate root cause, propose fix, apply it, verify it works.

Replaces the need for separate debug, fix-bug, investigate, and troubleshoot commands.

## Input

The human describes the bug:
- Error message or stack trace
- What was expected vs what happened
- Steps to reproduce (if known)

## Protocol

### Phase 1: Investigate

1. **Reproduce:** Run the failing command/test to confirm the bug exists
2. **Locate:** Search for the error message in the codebase
3. **Trace:** Follow the call chain from error to root cause
4. **Understand:** Read surrounding code to understand the intended behavior
5. **Identify:** Pinpoint the exact line(s) causing the issue

Output to the human:
```
Root cause: [one sentence]
Location: [file:line]
Why it happens: [explanation]
```

### Phase 2: Fix

1. **Propose** the fix to the human before applying
2. Wait for "go" or alternative direction
3. **Apply** the fix (minimal change -- fix the bug, don't refactor the neighborhood)
4. **Verify:** Run the failing test/command again to confirm the fix
5. **Check regressions:** Run related tests to ensure nothing else broke
6. **Commit** atomically: `fix: [what was fixed]`

### Phase 3: Prevent

After fixing, briefly assess:
- Should a test be added to catch this in the future?
- If yes, write the test and commit separately: `test: prevent regression for [bug]`
- If the bug was caused by a missing validation, add the validation

## Rules

- Never apply a fix without showing it to the human first
- Never refactor surrounding code -- fix the bug only
- Always verify the fix before committing
- Always check for regressions
- If you can't find the root cause in 3 attempts, ask the human for more context
