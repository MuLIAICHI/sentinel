# CLAUDE.md

## AY Framework

This project uses the AY Framework for agent-swarm orchestration.

### Tracking Files

Before starting any task, read these files:
- `.ay/tracking/BOARD.md` -- pipeline of all tasks and their status
- `.ay/tracking/HANDOFFS.md` -- messages from other agents
- `.ay/tracking/BLOCKERS.md` -- active blockers
- `.ay/tracking/AGENTS-LOG.md` -- log of all agent actions
- `.ay/tracking/CHANGELOG.md` -- project changelog
- `.ay/tracking/DECISIONS.md` -- architecture decision records
- `.ay/tracking/METRICS.md` -- sprint metrics

### Agent Protocol

1. Read BOARD.md to find your assigned task
2. Read HANDOFFS.md for messages addressed to you
3. Check BLOCKERS.md for anything blocking your task
4. Read your task file in `tasks/`
5. Update BOARD.md status to IN PROGRESS
6. Work within your scoped directories only
7. When done: update BOARD.md to DONE, write HANDOFF entry, log in AGENTS-LOG.md

### Task Lock

Before committing, claim your task by creating `.ay/locks/{task-name}.lock`.
The pre-commit hook will deny commits without an active task lock.

## Project Hard Rules (override framework defaults)

These rules take priority over any autonomous behavior. Agents must obey them at every gate.

- **LIVE_TRADING stays false.** Enabling live execution requires me editing `risk/guards.ts` by hand AND a runtime confirmation flag. No agent enables it, ever.
- **Never read, touch, or create `.env` files.** If a secret is needed, stop and ask me for it by name.
- **Never push to a remote.** Local commits for task coordination are expected and fine; `git push` is never run without my explicit say-so.
- **Pause at Gate 1** for any task that wires an external API (data providers, RPC, indexers) or the pumpmolt execution layer. Do not wave these through.
- **The signer is isolated.** Only `execution/signer.ts` ever reads the private key. No other file imports, logs, or transmits it.
