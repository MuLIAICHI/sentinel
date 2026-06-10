---
name: ayf:pipeline-view
description: |
  ASCII kanban board showing tasks in BACKLOG, READY, IN PROGRESS, DONE columns.
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

# /pipeline-view -- Kanban Board

Display an ASCII kanban board of all tasks grouped by status.

## Step 1: Read State

1. Read `docs/BOARD.md` for all tasks and statuses.
2. Read `.ay/tracking/locks/` for active locks.
3. Read task files in `docs/tasks/` for titles and priorities.

## Step 2: Render Board

Display tasks in four columns. Each task shows its number, title (truncated to fit), priority, and agent.

```
BACKLOG             | READY               | IN PROGRESS         | DONE
--------------------+---------------------+---------------------+--------------------
[P2] #8 Write docs  | [P0] #3 Build API   | [P0] #2 Auth mod    | [P0] #1 Project
     Agent: docs    |      Agent: backend |      Agent: backend |      setup
                    |                     |      LOCKED         |
[P3] #9 Perf audit  | [P1] #6 Error       |                     | [P1] #7 Config
     Agent: --      |      handling       |                     |      loader
                    |      Agent: backend |                     |
                    |                     |                     |
--------------------+---------------------+---------------------+--------------------
Count: 2            | Count: 2            | Count: 1            | Count: 2
```

### Rendering Rules

- **LOCKED** indicator on any IN PROGRESS task that has a lock file.
- Priority tags: `[P0]` `[P1]` `[P2]` `[P3]`.
- Sort within each column by priority (P0 first), then by task number.
- BLOCKED tasks appear in the BACKLOG column with a `BLOCKED by #X` note.
- Truncate task titles to 18 characters if needed for column width.

## Step 3: Stats Footer

```
Pipeline: {backlog} backlog | {ready} ready | {in_progress} active | {done} done
Progress: {done}/{total} tasks ({percentage}%)
Blocked: {count} tasks waiting on dependencies
```

## Step 4: Alerts

Show alerts for notable conditions:

- Tasks locked for more than 24 hours.
- READY tasks at P0 priority that nobody has started.
- Tasks in BACKLOG that have all dependencies met (should be READY).
- Zero READY tasks remaining (pipeline stall risk).
