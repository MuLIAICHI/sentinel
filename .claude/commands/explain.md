---
name: ayf:explain
description: |
  Explain code, architecture, or decisions. Generate documentation on demand.
allowed-tools:
  - Read
  - Glob
  - Grep
  - AskUserQuestion
---

# /explain -- Understand and Document

Explains any part of the codebase. Can target a file, function, system, or the entire architecture. Optionally writes documentation.

Replaces the need for separate explain, document, generate-docs, and architecture-overview commands.

## Input

The human asks:
- `/explain src/services/auth.ts` -- explain a specific file
- `/explain how does authentication work` -- explain a system
- `/explain the database schema` -- explain data model
- `/explain this project to a new developer` -- onboarding overview
- `/explain and document` -- explain + write docs

## Protocol

### For a specific file/function:

1. Read the file
2. Identify the purpose, inputs, outputs, side effects
3. Trace dependencies (what calls this, what does this call)
4. Explain in plain language:
   - **What** it does (one sentence)
   - **Why** it exists (the problem it solves)
   - **How** it works (step by step, referencing key lines)
   - **Dependencies** (what it imports, what imports it)
   - **Edge cases** (error handling, null checks, limits)

### For a system/concept:

1. Search the codebase for relevant files
2. Map the data flow (entry point > processing > output)
3. Identify the key components and their relationships
4. Explain as a narrative:
   - **Overview** (what the system does)
   - **Components** (what each piece handles)
   - **Flow** (how data moves through the system)
   - **Configuration** (environment variables, settings)
   - **Common operations** (how to add/modify/debug)

### For onboarding ("explain this project"):

1. Read README, CLAUDE.md, package.json
2. Map the directory structure (top 2 levels)
3. Identify the tech stack
4. Find the entry points
5. Produce an onboarding guide:
   - **What this is** (one paragraph)
   - **Tech stack** (languages, frameworks, tools)
   - **Directory map** (what lives where)
   - **How to run it** (setup, dev server, tests)
   - **Key files** (the 5-10 most important files to read first)
   - **Architecture** (how the pieces fit together)

### If "and document" is included:

Write the explanation to a markdown file:
- For a file: add JSDoc/docstring to the source
- For a system: create `docs/[system-name].md`
- For onboarding: create or update `docs/ONBOARDING.md`

## Rules

- Explain at the level the human needs -- ask if unsure (beginner vs expert)
- Use concrete examples from the actual codebase, not generic patterns
- Reference specific file paths and line numbers
- Never modify source code unless "and document" is explicitly requested
