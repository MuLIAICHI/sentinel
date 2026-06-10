---
name: ayf:go
description: |
  Full /go cycle: observe, lock, plan, verify, build, review, test, learn, finalize.
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

# /go -- Full Build Cycle

This is the core command. It runs the complete task lifecycle from picking a task to shipping it.

## Phase 1: OBSERVE

1. Check for paused sessions in `.ay/sessions/pause-*.md`. If one exists, ask: "Found paused session from {timestamp}. Resume it or start fresh?"
2. Read `docs/BOARD.md` to see all tasks and their statuses.
3. Check `.ay/tracking/locks/` for any active lock files. Locked tasks are off-limits.
4. Pick the best READY task using this priority:
   - Highest priority first (P0 > P1 > P2 > P3)
   - No unresolved blockers
   - Dependencies already DONE
   - If multiple equal candidates, pick the one with the most downstream dependents
5. Present the selected task to the human. If no READY tasks exist, say so and stop.

## Phase 2: LOCK

1. Create lock file at `.ay/tracking/locks/task-{N}.lock` with content:
   ```
   agent: {agent-name}
   task: {task-number}
   started: {ISO timestamp}
   session: {session-id}
   ```
2. Update `docs/BOARD.md`: move task status from READY to IN PROGRESS.

## Phase 3: PLAN

1. Read the task file at `docs/tasks/task-{N}.md`.
2. Read the agent definition if one is assigned.
3. Read relevant skills referenced by the task.
4. Read `docs/HANDOFFS.md` for prior learnings.
5. Read `docs/DECISIONS.md` for architectural constraints.
6. Check what already exists in the codebase (files, patterns, conventions).
7. If the task references external APIs or libraries, fetch real documentation via MCP or web search. Never guess API shapes.
8. Create the plan folder `.ay/plans/task-{N}/` with these files:

   - **README.md** -- Plan overview: goal, approach, key decisions, risks.
   - **context.md** -- Relevant codebase context: existing patterns, conventions, related files.
   - **rules.md** -- 13 universal rules + task-specific rules. Universal rules:
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
   - **files.md** -- Complete list of files to create/modify/delete with purpose for each.
   - **sequence.md** -- Ordered build steps. Each step has: description, files involved, checkpoint type.
   - **tests.md** -- Test plan: what to test, how, expected results, mapped to requirements.
   - **api-reference.md** -- External API signatures, endpoints, types used in this task.
   - **schema.md** -- Data models, type definitions, interfaces introduced or modified.
   - **diff-from-plan.md** -- Starts empty. Filled during BUILD with any deviations from plan.
   - **references/** -- Subfolder for any reference docs, examples, or external material.

## Phase 4: VERIFY

Run the 8-dimension plan quality check (same as `/verify-plan`):

1. **Requirement coverage** -- Every requirement in the task maps to at least one build step and one test.
2. **Task atomicity** -- No single step touches more than 5 files.
3. **Dependency ordering** -- No step references output from a later step.
4. **File scope** -- All files are within the agent's declared scope. Total files < 30.
5. **Test mapping** -- Every requirement has at least one test.
6. **Context fit** -- Plan folder total content < 2000 lines.
7. **Gap detection** -- No missing exports, unhandled error paths, or undefined types.
8. **Rules compliance** -- All 13 universal rules are addressed in rules.md.

If any dimension FAILS, fix the plan before proceeding. Re-verify after fixes.

## Phase 5: HUMAN APPROVAL GATE

Present the plan to the human with:
- Task summary (1-2 sentences)
- File count (create/modify/delete)
- Step count
- Test count
- Any risks or open questions
- Estimated complexity (S/M/L)

Wait for response:
- **"go"** -- Proceed to BUILD.
- **"change X"** -- Modify the plan as requested, re-verify, re-present.
- **"skip"** -- Unlock the task, revert BOARD status to READY, stop.

Do NOT proceed without explicit human approval.

## Phase 6: BUILD

Follow the sequence from `.ay/plans/task-{N}/sequence.md` step by step.

### Checkpoint Types

Each step in the sequence has a checkpoint type:

- **[auto]** -- Verify programmatically (build passes, tests pass, types check). Proceed automatically.
- **[human-verify]** -- Show the human what was built. Wait for confirmation before continuing.
- **[decision]** -- Present options to the human. Wait for a choice before continuing.
- **[human-action]** -- Something the human must do (e.g., create an API key, configure a service). Wait for them to confirm completion.

### Build Rhythm

- After every 3-5 files changed, run the build/typecheck/lint cycle.
- If a build fails, fix it before proceeding. Do not accumulate broken state.
- Log any deviations from the plan in `.ay/plans/task-{N}/diff-from-plan.md`.

### Build Rules

- Follow the sequence order exactly. Do not skip ahead.
- If a step is blocked by something unexpected, stop and ask the human.
- If you discover the plan is wrong, update `diff-from-plan.md` and ask the human before deviating.

## Phase 7: SELF-REVIEW

Two passes over all changes:

### Pass 1: Critical (must fix before proceeding)
- Syntax errors
- Type errors
- Missing imports/exports
- Broken references
- Security issues (hardcoded secrets, SQL injection, XSS)
- Logic errors (off-by-one, null handling, race conditions)

### Pass 2: Quality (fix if reasonable, note if not)
- Code style consistency
- Naming clarity
- Documentation completeness
- Error message quality
- Edge case handling
- Performance concerns

Fix all Critical issues. Fix Quality issues that take < 2 minutes. Note remaining Quality issues for the human.

Run the full build + typecheck + test suite after fixes.

## Phase 8: HUMAN REVIEW GATE

Present the completed work:
- Summary of what was built
- Files changed (with line counts)
- Tests passing/failing
- Any deviations from plan (from diff-from-plan.md)
- Any Quality issues noted but not fixed
- Any risks

Wait for response:
- **"ship"** -- Proceed to TEST and FINALIZE.
- **"fix X"** -- Make the requested fixes, re-run self-review, re-present.
- **"redo"** -- Discard changes, return to PLAN phase.

## Phase 9: TEST

1. Run the full test suite.
2. Verify every requirement from the task file is covered by a passing test.
3. Verify the build completes without errors.
4. If any test fails, fix it and re-run. If a fix is non-trivial, escalate to the human.

## Phase 10: LEARN

1. Update `.ay/plans/task-{N}/diff-from-plan.md` with final deviations.
2. Extract gotchas and write them to `docs/HANDOFFS.md` under the relevant section.
3. If any learnings apply broadly, add them to `.ay/learnings.jsonl`.

## Phase 11: FINALIZE

1. Delete lock file `.ay/tracking/locks/task-{N}.lock`.
2. Update `docs/BOARD.md`: move task to DONE with completion timestamp.
3. Check if completing this task unblocks other tasks. Move any BLOCKED tasks to READY if all their dependencies are now DONE.
4. Append entry to `docs/AGENTS-LOG.md`:
   ```
   ## Task {N}: {title}
   - Agent: {agent}
   - Started: {timestamp}
   - Completed: {timestamp}
   - Files: {count} created, {count} modified, {count} deleted
   - Deviations: {count}
   - Learnings: {count}
   ```
5. Append entry to `docs/CHANGELOG.md` under the current version/date.

## Phase 12: NEXT

Report what was done:
- Task completed
- Time spent (if trackable)
- Files touched
- Tests added

List available READY tasks from BOARD.md for the next cycle.
