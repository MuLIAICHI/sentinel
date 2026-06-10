---
name: ayf:plan
description: |
  Plan a specific task with full research, context gathering, and 8-dimension verification.
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

# /plan -- Plan a Task

Create a comprehensive, verified plan for a specific task before any code is written.

## Input

The human specifies which task to plan by number or title. If not specified, ask.

## Step 1: Gather Context

1. Read the task file at `docs/tasks/task-{N}.md`. Extract:
   - Requirements (every MUST/SHOULD/MAY)
   - Acceptance criteria
   - Dependencies on other tasks
   - Assigned agent (if any)
2. Read the agent definition file if an agent is assigned. Extract:
   - Scope (which files/directories this agent owns)
   - Skills available
   - Constraints
3. Read `docs/HANDOFFS.md` for prior learnings relevant to this task.
4. Read `docs/DECISIONS.md` for architectural constraints that apply.
5. Scan the codebase for:
   - Existing patterns this task should follow
   - Files that will be affected
   - Conventions (naming, structure, error handling)
   - Related code that provides context

## Step 2: Research

If the task involves external APIs, libraries, or tools:

1. Fetch real documentation. Use MCP tools or web search. Never guess.
2. Capture exact API signatures, endpoints, types, and error codes.
3. Note version requirements and compatibility constraints.
4. Save reference material to `.ay/plans/task-{N}/references/`.

## Step 3: Create Plan Folder

Create `.ay/plans/task-{N}/` with these files:

### README.md
```markdown
# Plan: Task {N} - {title}

## Goal
{What this task achieves in 1-2 sentences}

## Approach
{High-level strategy: what gets built, in what order, why}

## Key Decisions
{List decisions made during planning and their rationale}

## Risks
{What could go wrong, mitigations}

## Dependencies
{What must exist before this task can start}
```

### context.md
```markdown
# Context for Task {N}

## Existing Patterns
{Patterns found in codebase that this task must follow}

## Related Files
{Files that provide context or will be affected}

## Conventions
{Naming, structure, style conventions observed}

## Prior Learnings
{Relevant entries from HANDOFFS.md}
```

### rules.md
```markdown
# Rules for Task {N}

## Universal Rules
1. Never modify files outside your agent scope without explicit approval
2. Every new file must have a clear single responsibility
3. No hardcoded secrets, keys, or environment-specific values
4. All public functions/methods must have doc comments
5. Follow existing naming conventions in the codebase
6. No TODO/FIXME/HACK without a linked task number
7. Error handling must be explicit, never swallowed
8. No circular dependencies
9. Tests must be deterministic (no flaky tests)
10. No console.log/print in production code (use proper logging)
11. Imports must be explicit (no wildcard imports in production)
12. No dead code committed
13. Every file change must be traceable to a plan step

## Task-Specific Rules
{Rules derived from task requirements, agent constraints, or DECISIONS.md}
```

### files.md
```markdown
# Files for Task {N}

## Create
| File | Purpose |
|------|---------|
| {path} | {why this file is needed} |

## Modify
| File | Changes | Reason |
|------|---------|--------|
| {path} | {what changes} | {why} |

## Delete
| File | Reason |
|------|--------|
| {path} | {why it should be removed} |

## Total: {X} create, {Y} modify, {Z} delete = {total} files
```

### sequence.md
```markdown
# Build Sequence for Task {N}

## Step 1: {description}
- Files: {list}
- Checkpoint: [auto] | [human-verify] | [decision] | [human-action]
- Verify: {what to check after this step}

## Step 2: {description}
...
```

### tests.md
```markdown
# Test Plan for Task {N}

## Requirement Coverage
| Requirement | Test | Type |
|-------------|------|------|
| {req from task} | {test description} | unit/integration/e2e |

## Test Cases
### {Test name}
- Input: {what goes in}
- Expected: {what should come out}
- Edge cases: {boundaries to test}
```

### api-reference.md
```markdown
# API Reference for Task {N}

{External API signatures, endpoints, request/response types, error codes.
Leave empty if task has no external API dependencies.}
```

### schema.md
```markdown
# Schema for Task {N}

{Data models, type definitions, interfaces introduced or modified.
Leave empty if task introduces no new data structures.}
```

### diff-from-plan.md
```markdown
# Deviations from Plan -- Task {N}

{Starts empty. Updated during BUILD phase with any changes from the original plan.}
```

### references/
Create this subdirectory. Add any reference docs, examples, or external material gathered during research.

## Step 4: Verify

Run the 8-dimension quality check (same as `/verify-plan`):

1. **Requirement coverage** -- Every requirement maps to a build step and a test. FAIL if any requirement is orphaned.
2. **Task atomicity** -- No step touches more than 5 files. FAIL if any step exceeds this.
3. **Dependency ordering** -- No step references output from a later step. FAIL if forward references exist.
4. **File scope** -- All files within agent scope. Total files < 30. FAIL if out of scope or too many files.
5. **Test mapping** -- Every requirement has at least one test. FAIL if coverage gaps exist.
6. **Context fit** -- Plan folder total < 2000 lines. FAIL if plan is too large (split the task).
7. **Gap detection** -- No missing exports, unhandled errors, or undefined types. FAIL if gaps found.
8. **Rules compliance** -- All 13 universal rules present in rules.md. FAIL if any missing.

Output results as:
```
VERIFY: [PASS/FAIL]
  1. Requirement coverage:  [PASS/FAIL] {detail}
  2. Task atomicity:        [PASS/FAIL] {detail}
  3. Dependency ordering:   [PASS/FAIL] {detail}
  4. File scope:            [PASS/FAIL] {detail}
  5. Test mapping:          [PASS/FAIL] {detail}
  6. Context fit:           [PASS/FAIL] {detail}
  7. Gap detection:         [PASS/FAIL] {detail}
  8. Rules compliance:      [PASS/FAIL] {detail}
```

If any dimension FAILS, fix the plan and re-verify. Repeat until all PASS.

## Step 5: Present

Show the human:
- Plan summary (from README.md)
- File count and step count
- Test count
- Verification results (all PASS)
- Any open questions or decisions needed

The plan is ready for `/go` or `/task-start` to begin building.
