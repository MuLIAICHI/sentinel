---
name: ayf:task-status
description: |
  Show all tasks with status, agents, blockers, and next-task recommendations.
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

# /task-status -- Task Status Overview

Display all tasks with their current status and recommend what to work on next.

## Step 1: Read State

1. Read `docs/BOARD.md` to get all tasks and their statuses.
2. Read `.ay/tracking/locks/` to identify actively locked tasks.
3. Read task files in `docs/tasks/` for titles, priorities, and dependencies.

## Step 2: Build Table

Display an ASCII table with these columns:

```
+------+-----------------------------------+-------------+----------+---------+------------+
| #    | Title                             | Status      | Priority | Agent   | Blockers   |
+------+-----------------------------------+-------------+----------+---------+------------+
| 1    | Set up project structure          | DONE        | P0       | arch    | --         |
| 2    | Implement auth module             | IN PROGRESS | P0       | backend | --         |
| 3    | Build API endpoints               | READY       | P1       | backend | --         |
| 4    | Create UI components              | BLOCKED     | P1       | frontend| Task 2     |
| 5    | Write integration tests           | BACKLOG     | P2       | qa      | Tasks 2,3  |
+------+-----------------------------------+-------------+----------+---------+------------+
```

Mark locked tasks with `[LOCKED]` next to their status.

## Step 3: Summary Counts

```
Total: {N} tasks
  DONE:        {count}
  IN PROGRESS: {count} ({count} locked)
  READY:       {count}
  BLOCKED:     {count}
  BACKLOG:     {count}
```

## Step 4: Recommendations

Analyze the board and recommend what to work on next:

1. **Highest priority READY tasks** -- List them in priority order.
2. **Critical path** -- Identify tasks that block the most downstream work. Completing these first maximizes throughput.
3. **Stale locks** -- If any lock file is older than 24 hours, flag it as potentially stale.
4. **Blocked tasks close to unblocking** -- Tasks where only 1 dependency remains incomplete.

Present as:

```
Recommended next:
  1. Task {N}: {title} (P0, unblocks {X} tasks)
  2. Task {N}: {title} (P1, no blockers)
  3. Task {N}: {title} (P1, ready)

Warnings:
  - Task {N} lock is {X} hours old (may be stale)
  - Task {N} is 1 dependency away from READY (needs Task {M})
```
