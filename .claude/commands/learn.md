---
name: ayf:learn
description: |
  Capture a learning to the project knowledge base with tags and source context.
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

# /learn -- Capture a Learning

Record an insight, gotcha, or discovery to the project's persistent knowledge base.

## Input

The human provides the learning in one of these forms:
- Direct text: `/learn "Always validate webhook signatures before processing"`
- From context: `/learn` (then asked what to capture)
- With tags: `/learn "Redis connections need explicit close" --tags=redis,connections,gotcha`

If no input is provided, ask: "What did you learn?"

## Step 1: Structure the Learning

Extract or ask for:

1. **Insight** -- The learning itself. One clear sentence or short paragraph.
2. **Tags** -- Categorization. If not provided, infer 2-4 tags from the content. Common tags:
   - Technical: `api`, `auth`, `database`, `testing`, `types`, `performance`, `security`
   - Process: `planning`, `estimation`, `debugging`, `deployment`, `review`
   - Patterns: `gotcha`, `workaround`, `best-practice`, `anti-pattern`, `convention`
3. **Source** -- Where this learning came from:
   - `task:{N}` -- Learned during a specific task
   - `file:{path}` -- Discovered in a specific file
   - `discovery` -- Found while exploring
   - `human` -- Told by the human
   - `debug` -- Learned while debugging an issue

## Step 2: Write to Learnings File

Ensure `.ay/learnings.jsonl` exists. Create it if not.

Append one JSON line:

```json
{"timestamp": "{ISO timestamp}", "topic": "{2-3 word topic}", "tags": ["tag1", "tag2"], "insight": "{the learning}", "source": "{source type and reference}"}
```

## Step 3: Cross-Reference

Check if this learning is relevant to any existing project files:

1. **HANDOFFS.md** -- If the learning is a gotcha or convention that future agents need to know, append it to the relevant section in `docs/HANDOFFS.md`.
2. **Skill files** -- If the learning relates to a specific skill or agent, consider noting it in that agent's or skill's documentation.
3. **DECISIONS.md** -- If the learning reveals an architectural constraint or convention, suggest adding it to `docs/DECISIONS.md`.

Ask the human before writing to any file other than `learnings.jsonl`: "This seems relevant to {HANDOFFS/DECISIONS/skill}. Add it there too?"

## Step 4: Confirm

Report:
```
Learning captured:
  Topic: {topic}
  Tags: {tags}
  Source: {source}
  Saved to: .ay/learnings.jsonl
  Also added to: {other files, if any}
```

## Querying Learnings

If the human asks to view learnings:
- `/learn list` -- Show all learnings, newest first.
- `/learn list --tag=gotcha` -- Filter by tag.
- `/learn list --topic=auth` -- Filter by topic.
- `/learn search "redis"` -- Full-text search across insights.

Read `.ay/learnings.jsonl` and display in a readable table:

```
+---------------------+------------------+------------------+--------------------------------------+
| Timestamp           | Topic            | Tags             | Insight                              |
+---------------------+------------------+------------------+--------------------------------------+
| 2026-05-09 14:30    | webhook-security | api, security    | Always validate webhook signatures   |
| 2026-05-09 10:15    | redis-cleanup    | redis, gotcha    | Redis connections need explicit close|
+---------------------+------------------+------------------+--------------------------------------+
```
