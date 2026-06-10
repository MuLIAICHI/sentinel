---
name: ayf:task-start
description: |
  Start building a task: load or create plan, lock, enter build mode.
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

# /task-start -- Start Building a Task

Begin work on a specific task. Ensures a plan exists, locks the task, and enters build mode.

## Input

The human specifies which task to start by number or title. If not specified, ask.

## Step 1: Check Plan

Look for an existing plan at `.ay/plans/task-{N}/`.

- **Plan exists:** Read it. Confirm with the human: "Plan for task {N} exists. Use it or re-plan?"
- **Plan does not exist:** Run `/plan` for this task first. Do not start building without a verified plan.

## Step 2: Check Lock

Check `.ay/tracking/locks/` for an existing lock on this task.

- **Lock exists:** Another agent or session is working on this task. Show the lock details and stop. Do not override another session's lock.
- **No lock:** Proceed.

## Step 3: Check Dependencies

Read `docs/BOARD.md`. Verify all dependencies for this task are DONE.

- **All dependencies DONE:** Proceed.
- **Dependencies not DONE:** Show which dependencies are blocking. Ask the human: "Dependencies {X, Y} are not done. Start anyway or work on a dependency first?"

## Step 4: Lock

1. Create lock file at `.ay/tracking/locks/task-{N}.lock`:
   ```
   agent: {agent-name}
   task: {task-number}
   started: {ISO timestamp}
   session: {session-id}
   ```
2. Update `docs/BOARD.md`: set task status to IN PROGRESS.

## Step 5: Load Build Context

Load into working memory:
- `.ay/plans/task-{N}/README.md` -- goal and approach
- `.ay/plans/task-{N}/rules.md` -- all rules to follow
- `.ay/plans/task-{N}/sequence.md` -- build order
- `.ay/plans/task-{N}/context.md` -- codebase context
- `.ay/plans/task-{N}/files.md` -- what to create/modify/delete
- `.ay/plans/task-{N}/schema.md` -- data structures
- `.ay/plans/task-{N}/api-reference.md` -- external APIs

## Step 6: Enter Build Mode

Begin executing the sequence from step 1.

Follow the checkpoint protocol for each step:

- **[auto]** -- Complete the step, run build/typecheck/lint, proceed if passing.
- **[human-verify]** -- Complete the step, show the human what was done, wait for "ok" or feedback.
- **[decision]** -- Present the options described in the step, wait for the human to choose.
- **[human-action]** -- Describe what the human needs to do, wait for them to confirm completion.

After every 3-5 files changed, run the project's build/typecheck/lint cycle. Fix any failures before continuing.

Log deviations in `.ay/plans/task-{N}/diff-from-plan.md` as they occur.

## When Done

After the last step in the sequence is complete, announce: "Build complete for task {N}. Run `/task-done` to finalize or `/review` to self-review first."
