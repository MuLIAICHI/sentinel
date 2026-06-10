---
name: ayf:task-done
description: |
  Mark a task complete: unlock, update board, cascade unblocks, log.
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

# /task-done -- Mark Task Complete

Finalize a completed task: clean up locks, update tracking, cascade unblocks, log everything.

## Input

The human specifies which task to mark done by number. If not specified, check for the currently locked task in `.ay/tracking/locks/`. If exactly one lock exists, use that task. If multiple or none, ask.

## Step 1: Validate

1. Read the task file at `docs/tasks/task-{N}.md`.
2. Confirm the task status in `docs/BOARD.md` is IN PROGRESS.
3. Confirm a lock file exists at `.ay/tracking/locks/task-{N}.lock`.

If the task is not IN PROGRESS or not locked, warn the human and ask how to proceed.

## Step 2: Delete Lock

Remove `.ay/tracking/locks/task-{N}.lock`.

## Step 3: Update Board

Edit `docs/BOARD.md`:
- Change task {N} status from IN PROGRESS to DONE.
- Add completion timestamp.

## Step 4: Cascade Unblocks

Scan `docs/BOARD.md` for tasks with status BLOCKED that list task {N} as a dependency.

For each blocked task:
1. Check if ALL of its dependencies are now DONE.
2. If yes, change its status from BLOCKED to READY.
3. Note which tasks were unblocked.

Report any unblocked tasks to the human.

## Step 5: Log to AGENTS-LOG

Append to `docs/AGENTS-LOG.md`:

```markdown
## Task {N}: {title}
- Agent: {agent-name or "human"}
- Started: {from lock file timestamp}
- Completed: {current timestamp}
- Files: {count} created, {count} modified, {count} deleted
- Deviations: {count from diff-from-plan.md, or 0}
- Learnings: {count of entries added to HANDOFFS or learnings.jsonl}
```

## Step 6: Log to CHANGELOG

Append to `docs/CHANGELOG.md` under the current date heading (create the heading if it does not exist):

```markdown
- Task {N}: {one-line summary of what was delivered}
```

## Step 7: Report

Show the human:
- Task {N} marked DONE
- Tasks unblocked (if any)
- Remaining READY tasks available for next cycle
- Current board summary (counts by status)
