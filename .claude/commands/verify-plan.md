---
name: ayf:verify-plan
description: |
  Run 8-dimension plan quality check: coverage, atomicity, ordering, scope, tests, context, gaps, rules.
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

# /verify-plan -- 8-Dimension Plan Quality Check

Validate a task plan against 8 quality dimensions. Every dimension must PASS before building.

## Input

The human specifies which task plan to verify by number. If not specified, check for the most recently created plan in `.ay/plans/`.

## Step 1: Load Plan

Read all files in `.ay/plans/task-{N}/`:
- README.md
- context.md
- rules.md
- files.md
- sequence.md
- tests.md
- api-reference.md
- schema.md

Also read the task file at `docs/tasks/task-{N}.md` to get the original requirements.

## Step 2: Run 8 Dimensions

### Dimension 1: Requirement Coverage

**Check:** Every requirement in the task file (every MUST, SHOULD, MAY, acceptance criterion) maps to at least one step in `sequence.md` AND at least one test in `tests.md`.

**How:**
1. Extract all requirements from `docs/tasks/task-{N}.md`.
2. For each requirement, search `sequence.md` for a step that addresses it.
3. For each requirement, search `tests.md` for a test that verifies it.
4. FAIL if any requirement has no step or no test. List orphaned requirements.

**Output:** `PASS` or `FAIL: {count} requirements not covered: {list}`

### Dimension 2: Task Atomicity

**Check:** No single step in `sequence.md` touches more than 5 files.

**How:**
1. Parse each step in `sequence.md`.
2. Count the files listed for each step.
3. FAIL if any step exceeds 5 files.

**Output:** `PASS` or `FAIL: Step {N} touches {count} files (max 5): {list}`

### Dimension 3: Dependency Ordering

**Check:** No step references output (files, exports, types) from a later step.

**How:**
1. For each step, identify what it produces (files created, exports defined).
2. For each step, identify what it consumes (files imported, types used).
3. Verify that everything consumed is produced by an earlier step or already exists.
4. FAIL if any forward reference is found.

**Output:** `PASS` or `FAIL: Step {N} references {symbol} from later step {M}`

### Dimension 4: File Scope

**Check:** All files in `files.md` are within the assigned agent's declared scope (if an agent is assigned). Total file count is under 30.

**How:**
1. Read the agent definition to get its scope boundaries (directories, file patterns).
2. Check every file in `files.md` against the scope.
3. Count total files (create + modify + delete).
4. FAIL if any file is out of scope or total exceeds 30.

**Output:** `PASS` or `FAIL: {count} files out of scope: {list}` and/or `FAIL: {count} total files exceeds limit of 30`

### Dimension 5: Test Mapping

**Check:** Every requirement has at least one test in `tests.md`.

**How:**
1. Extract requirements from the task file.
2. Match each to a test entry in the requirement coverage table in `tests.md`.
3. FAIL if any requirement lacks a test.

**Output:** `PASS` or `FAIL: {count} requirements without tests: {list}`

### Dimension 6: Context Fit

**Check:** The total content of the plan folder is under 2000 lines. Plans that are too large indicate the task should be split.

**How:**
1. Count total lines across all files in `.ay/plans/task-{N}/` (excluding references/ subfolder).
2. FAIL if total exceeds 2000 lines.

**Output:** `PASS ({count} lines)` or `FAIL: {count} lines exceeds 2000 limit. Consider splitting this task.`

### Dimension 7: Gap Detection

**Check:** No missing exports, unhandled error paths, or undefined types in the plan.

**How:**
1. Cross-reference `schema.md` types with `files.md` -- every type defined in schema must be created or imported in at least one file.
2. Cross-reference `api-reference.md` endpoints with `sequence.md` -- every API call must have error handling specified.
3. Check `files.md` for files that export symbols -- verify consumers exist in the plan or codebase.
4. FAIL if gaps are found.

**Output:** `PASS` or `FAIL: {count} gaps found: {list of missing exports/error handlers/types}`

### Dimension 8: Rules Compliance

**Check:** All 13 universal rules are present in `rules.md`.

**How:**
1. Read `rules.md`.
2. Verify each of the 13 universal rules is listed:
   1. No out-of-scope modifications
   2. Single responsibility per file
   3. No hardcoded secrets
   4. Public API documentation
   5. Follow naming conventions
   6. No unlinked TODOs
   7. Explicit error handling
   8. No circular dependencies
   9. Deterministic tests
   10. No console.log in production
   11. Explicit imports
   12. No dead code
   13. Changes traceable to plan
3. FAIL if any rule is missing.

**Output:** `PASS` or `FAIL: Missing rules: {list of numbers}`

## Step 3: Output Report

```
PLAN VERIFICATION: Task {N} - {title}
======================================

1. Requirement coverage:  {PASS/FAIL} {detail}
2. Task atomicity:        {PASS/FAIL} {detail}
3. Dependency ordering:   {PASS/FAIL} {detail}
4. File scope:            {PASS/FAIL} {detail}
5. Test mapping:          {PASS/FAIL} {detail}
6. Context fit:           {PASS/FAIL} {detail}
7. Gap detection:         {PASS/FAIL} {detail}
8. Rules compliance:      {PASS/FAIL} {detail}

Overall: {PASS/FAIL}
  Passed: {count}/8
  Failed: {count}/8
```

## Step 4: Fix Guidance

If any dimension failed, provide specific fix instructions:

```
FIX REQUIRED:
  Dimension {N} ({name}):
    Problem: {what is wrong}
    Fix: {exactly what to do}
    Files to update: {which plan files need changes}
```

After the human or agent applies fixes, re-run verification to confirm all dimensions pass.
