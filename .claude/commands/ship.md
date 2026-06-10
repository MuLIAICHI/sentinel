---
name: ayf:ship
description: |
  Ship mode: pre-deploy checklist, deployment execution, post-deploy verification.
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

# /ship -- Ship Mode

Execute the full deployment pipeline: pre-flight checks, deploy, verify, monitor.

## Step 1: Load Ship Context

1. Read `docs/CLAUDE-SHIP.md` if it exists for project-specific deployment rules, environments, and commands.
2. Read `docs/CHANGELOG.md` to understand what is being shipped.
3. Check `docs/BOARD.md` for any IN PROGRESS tasks (warn if shipping with incomplete work).
4. Check `.ay/tracking/locks/` for active locks (warn if any exist).

## Step 2: Pre-Deploy Checklist

Run through every item. All must PASS before deploying.

```
PRE-DEPLOY CHECKLIST
====================

Code Quality
  [ ] Build passes
  [ ] TypeCheck passes (if applicable)
  [ ] Lint clean (no errors, warnings acceptable)
  [ ] All tests pass
  [ ] No critical issues from /review

Configuration
  [ ] Environment variables documented
  [ ] No hardcoded secrets in codebase
  [ ] Config files are environment-aware (dev/staging/prod)
  [ ] Feature flags set correctly for this release

Dependencies
  [ ] Lock file is up to date (package-lock.json, yarn.lock, etc.)
  [ ] No known vulnerability alerts in dependencies
  [ ] No unpinned dependency versions in production

Data
  [ ] Database migrations are reversible (if applicable)
  [ ] No breaking schema changes without migration plan
  [ ] Seed data is current (if applicable)

Documentation
  [ ] CHANGELOG.md is updated
  [ ] API documentation reflects changes (if applicable)
  [ ] README is current (if applicable)

Git
  [ ] All changes committed
  [ ] Branch is up to date with base branch
  [ ] No merge conflicts
```

For each item, run the appropriate check (build command, grep for secrets, etc.) and mark PASS or FAIL.

If any item FAILS, stop and report. Do not proceed to deployment.

## Step 3: Human Approval Gate

Present the checklist results and what will be shipped:

```
Ready to ship:
  - {summary of changes from CHANGELOG}
  - {X} files changed
  - {Y} tests passing
  - All pre-deploy checks PASS

Deploy to: {environment from CLAUDE-SHIP.md or ask}
```

Wait for the human to confirm: "ship it" or "abort".

## Step 4: Execute Deployment

Follow the deployment steps defined in `docs/CLAUDE-SHIP.md`. If no ship config exists, ask the human for deployment commands.

Common patterns (adapt to project):
1. Tag the release (if versioned).
2. Run the deploy command.
3. Wait for deployment to complete.
4. Capture deployment output/logs.

## Step 5: Post-Deploy Verification

After deployment completes:

1. **Smoke test** -- Run the project's smoke test suite if one exists, or verify the most critical paths manually.
2. **Health check** -- Hit health/status endpoints if applicable.
3. **Log check** -- Look for errors in deployment logs.
4. **Rollback readiness** -- Confirm rollback procedure is known and documented.

Report results:

```
POST-DEPLOY
===========
Deploy status: {SUCCESS/FAILED}
Smoke tests:   {PASS/FAIL}
Health check:  {PASS/FAIL}
Errors in logs: {count}

Rollback command: {command or "see CLAUDE-SHIP.md"}
```

## Step 6: Finalize

If deployment succeeded:
1. Update `docs/CHANGELOG.md` with deployment timestamp and environment.
2. Log to `docs/AGENTS-LOG.md`:
   ```
   ## Deployment: {date}
   - Environment: {env}
   - Changes: {summary}
   - Status: SUCCESS
   - Deployed by: {agent/human}
   ```

If deployment failed:
1. Ask the human: "Rollback or investigate?"
2. If rollback, execute the rollback procedure and verify.
3. Log the failure to `docs/AGENTS-LOG.md`.
