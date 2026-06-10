# Task: {{TASK_TITLE}}

## Dependencies

Tasks that must be DONE before this one can start:
- [ ] `tasks/{{dependency-1}}.md`
- [ ] `tasks/{{dependency-2}}.md`

If all dependencies are DONE, this task is READY.
If any dependency is not DONE, this task is BACKLOG.

## Files to Create

Exact paths of files this task must produce:
- `src/{{module}}/{{file1}}.ts`
- `src/{{module}}/{{file2}}.ts`
- `tests/{{module}}/{{file1}}.test.ts`

## Implementation

Step-by-step instructions. Be specific enough that an agent can execute without guessing.

1. Read `{{reference-file}}` to understand the interface
2. Create `{{file1}}` with:
   - Function A that does X
   - Function B that does Y
3. Create `{{file2}}` with:
   - Class C that wraps A and B
4. Write tests covering:
   - Happy path for A
   - Edge case for B
   - Integration of C

## Verification

How to confirm this task is actually done:

- [ ] All files listed above exist
- [ ] `npm test -- --grep "{{module}}"` passes
- [ ] No TypeScript errors: `npx tsc --noEmit`
- [ ] Manual check: {{describe what to verify manually}}

## Unblocks

Tasks that become READY when this one is DONE:
- `tasks/{{next-task-1}}.md`
- `tasks/{{next-task-2}}.md`

Update BOARD.md when marking this DONE.
