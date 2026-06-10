---
name: ayf:pause
description: |
  Save session state for handoff: snapshot context, progress, and next steps.
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

# /pause -- Save Session State

Capture the full session context so a future session (or another agent) can resume exactly where this one left off.

## Step 1: Gather State

Collect the following information:

1. **Current task** -- Which task is in progress (from `.ay/tracking/locks/`).
2. **Current step** -- Which step in the build sequence was last completed or is in progress.
3. **Files modified** -- List all files changed in this session (from git status or working memory).
4. **Decisions made** -- Any choices made during this session that are not yet recorded in DECISIONS.md.
5. **Context summary** -- Key information held in working memory that a new session would need.
6. **What to do next** -- The exact next action to take when resuming.
7. **Open questions** -- Anything unresolved that needs human input.
8. **Build state** -- Does the project currently build? Are tests passing?

## Step 2: Create Pause File

Generate a timestamp: `{YYYY-MM-DD-HH-MM}`.

Create `.ay/sessions/pause-{timestamp}.md`:

```markdown
# Paused Session: {timestamp}

## Task
- Number: {N}
- Title: {title}
- Status: IN PROGRESS
- Plan: .ay/plans/task-{N}/

## Progress
- Current step: {step number} of {total steps} in sequence.md
- Last completed step: {step number}: {description}
- Next step: {step number}: {description}

## Files Modified This Session
{list of file paths with one-line description of changes}

## Decisions Made
{list of decisions with rationale, not yet in DECISIONS.md}

## Context Summary
{Key information the next session needs to know. Include:
- Any patterns discovered
- Any gotchas encountered
- Any assumptions made
- State of external services/APIs if relevant}

## What To Do Next
{Explicit instructions for resuming. Be specific:
- "Continue from step 4 of the sequence"
- "The auth module is half-built, X and Y are done, Z remains"
- "Waiting for human to provide API key before proceeding"}

## Open Questions
{Anything unresolved that needs human input before continuing}

## Build State
- Builds: {yes/no}
- Tests passing: {yes/no/partial -- X of Y}
- Lint clean: {yes/no}
```

## Step 3: Ensure Directory Exists

Create `.ay/sessions/` if it does not exist.

## Step 4: Report

Tell the human:
- Session paused successfully.
- Pause file location.
- Current task remains locked (the lock stays so nobody else picks it up).
- How to resume: run `/resume`.
