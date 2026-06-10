---
name: ayf:resume
description: |
  Continue from a paused session: load context, show summary, pick up where left off.
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

# /resume -- Continue from Paused Session

Load the most recent paused session and continue working.

## Step 1: Find Pause File

1. List files in `.ay/sessions/` matching `pause-*.md`.
2. Sort by timestamp (newest first).
3. If multiple pause files exist, show the list and ask the human which one to resume. Default to the most recent.
4. If no pause files exist, report "No paused sessions found" and stop.

## Step 2: Load Context

Read the selected pause file. Extract:
- Task number and title
- Current step in the sequence
- Files modified so far
- Decisions made
- Context summary
- What to do next
- Open questions
- Build state

## Step 3: Verify Lock

Check that `.ay/tracking/locks/task-{N}.lock` still exists.
- **Lock exists:** Good. This session owns the task.
- **Lock missing:** The task was unlocked since the pause. Ask the human: "Task {N} was unlocked since pause. Re-lock and continue, or abort?"

## Step 4: Verify Build State

Run the project's build/typecheck cycle to confirm the current state matches what the pause file reports.
- If the build state differs from what was recorded, report the discrepancy.

## Step 5: Load Plan

Read the plan from `.ay/plans/task-{N}/`:
- sequence.md (to know remaining steps)
- rules.md (to stay compliant)
- diff-from-plan.md (to know what deviated so far)

## Step 6: Present Summary

Show the human:

```
Resuming paused session from {timestamp}

Task: #{N} - {title}
Progress: Step {X} of {Y}
Last completed: Step {X-1}: {description}
Next action: {from "What To Do Next"}

Open questions:
{list, or "None"}

Build state: {builds: yes/no, tests: X/Y passing}
```

Wait for the human to confirm: "continue" or provide additional context.

## Step 7: Continue

Enter build mode starting from the next step indicated in the pause file. Follow the same checkpoint protocol as `/task-start`.

## Step 8: Cleanup

After successfully resuming and completing at least one more step, the pause file is no longer the active snapshot. It remains in `.ay/sessions/` as history but is no longer the resume target. If the session is paused again, a new pause file is created.
