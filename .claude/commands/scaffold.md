---
name: ayf:scaffold
description: |
  Generate boilerplate for any component type. API routes, UI components, services, models, tests, CLI commands.
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
---

# /scaffold -- Generate Boilerplate

Smart code generator. Tell it what you need, it analyzes your project's existing patterns and generates matching boilerplate.

Replaces the need for separate create-component, create-api, create-model, create-service, create-test, and add-feature commands.

## Input

The human says what they need:
- "scaffold a user service"
- "scaffold an API route for /api/payments"
- "scaffold a React component for the settings page"
- "scaffold a CLI command for export"
- "scaffold a database migration for adding tags"

## Protocol

### Phase 1: Analyze Patterns

1. **Detect project type:** Read package.json, tsconfig, framework configs
2. **Find existing examples:** Search for similar files in the codebase
   - For a service: find existing `*.service.ts` files
   - For a component: find existing `*.tsx` files in the components directory
   - For an API route: find existing route handlers
   - For a test: find existing `*.test.ts` files
3. **Extract the pattern:** Read 1-2 existing examples to understand:
   - File naming convention
   - Import patterns
   - Code structure (class vs function, hooks pattern, etc.)
   - Error handling pattern
   - Export pattern

### Phase 2: Generate

1. **Show the plan:**
   ```
   I'll create:
   - [file path 1] -- [what it does]
   - [file path 2] -- [what it does]

   Based on the pattern from: [existing file used as reference]
   ```
2. Wait for "go" or adjustments
3. **Create files** matching the existing project patterns exactly
4. **Update barrel exports** (index.ts) if the project uses them
5. **Add to BOARD.md** if a task is active

### Phase 3: Verify

1. Run build to confirm the new files compile
2. If a test file was generated, run it
3. Commit: `feat: scaffold [component type] for [name]`

## Rules

- Always match existing project patterns -- never impose external conventions
- Always show the plan before creating files
- Always update barrel exports
- If no existing pattern is found, ask the human what pattern to follow
- Generate the minimum viable boilerplate -- no premature abstractions
