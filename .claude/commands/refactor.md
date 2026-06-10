---
name: ayf:refactor
description: |
  Safe refactoring with verification. Rename, extract, restructure -- with tests passing before and after.
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
---

# /refactor -- Safe Code Refactoring

Restructures code while keeping behavior identical. Tests must pass before and after.

Replaces the need for separate refactor, rename, extract, restructure, and clean-up commands.

## Input

The human describes what to refactor:
- `/refactor extract the auth logic from UserController into AuthService`
- `/refactor rename userId to accountId across the codebase`
- `/refactor split this 500-line file into modules`
- `/refactor convert class components to hooks`
- `/refactor this function is too complex, simplify it`

## Protocol

### Phase 1: Understand

1. Read the target code and its dependencies
2. Find all references (who calls this, who imports this)
3. Identify existing tests that cover this code
4. Run tests to confirm they pass BEFORE refactoring

### Phase 2: Plan

Present the plan to the human:
```
Refactoring: [what]
Files affected: [N]
  - [file 1] -- [what changes]
  - [file 2] -- [what changes]

Tests covering this: [N test files]
Risk: [low/medium/high]
```

Wait for "go" before proceeding.

### Phase 3: Execute

1. Make changes incrementally (one file at a time)
2. After each file: run the build to confirm it compiles
3. After all files: run the full test suite
4. If any test fails: revert and report what went wrong

### Phase 4: Verify

1. Run full test suite -- all must pass
2. Run build -- must compile clean
3. Diff summary: show what changed
4. Commit: `refactor: [what was refactored]`

## Rules

- Tests must pass BEFORE and AFTER -- if no tests exist, say so and ask if the human wants to add them first
- Never change behavior -- refactoring is structure only
- Show the plan before making any changes
- One commit per logical refactoring unit
- If the refactoring is large (10+ files), break it into steps and confirm after each step
