#!/usr/bin/env bash
# AY Framework -- PreToolUse hook for Bash(git commit)
# Verifies that a lock file exists for the active task before allowing commits.
# Outputs JSON: {"decision":"allow"} or {"decision":"deny","message":"..."}
# Works on Mac, Linux, Windows (Git Bash).

set -euo pipefail

# Find .ay directory (walk up from cwd)
find_ay_dir() {
  local dir="$PWD"
  while [ "$dir" != "/" ]; do
    if [ -d "$dir/.ay" ]; then
      echo "$dir/.ay"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  return 1
}

AYF_DIR=$(find_ay_dir 2>/dev/null || echo "")

# If framework not installed, allow (don't block non-framework projects)
if [ -z "$AYF_DIR" ]; then
  echo '{"decision":"allow"}'
  exit 0
fi

LOCK_DIR="$AYF_DIR/locks"

# If no locks directory exists, allow (framework installed but no task system active)
if [ ! -d "$LOCK_DIR" ]; then
  echo '{"decision":"allow"}'
  exit 0
fi

# Check for any active lock file (*.lock)
LOCK_COUNT=0
ACTIVE_TASK=""

for lockfile in "$LOCK_DIR"/*.lock 2>/dev/null; do
  if [ -f "$lockfile" ]; then
    LOCK_COUNT=$((LOCK_COUNT + 1))
    ACTIVE_TASK=$(basename "$lockfile" .lock)
  fi
done

if [ "$LOCK_COUNT" -eq 0 ]; then
  echo '{"decision":"deny","message":"No active task lock found. Claim a task before committing: create a lock file in .ay/locks/{task-name}.lock"}'
  exit 0
fi

if [ "$LOCK_COUNT" -gt 1 ]; then
  echo '{"decision":"deny","message":"Multiple task locks found. Only one task should be active at a time. Clean up .ay/locks/ first."}'
  exit 0
fi

# Exactly one lock file exists -- allow the commit
echo '{"decision":"allow"}'
