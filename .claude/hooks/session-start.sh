#!/usr/bin/env bash
# AY Framework -- SessionStart hook
# Checks framework installation, loads state, throttled update check.
# Works on Mac, Linux, Windows (Git Bash).

set -euo pipefail

AYF_DIR=""
STATE_FILE=""
UPDATE_MARKER=""

# Find .ay directory (walk up from cwd, then check home)
find_ay_dir() {
  local dir="$PWD"
  while [ "$dir" != "/" ]; do
    if [ -d "$dir/.ay" ]; then
      AYF_DIR="$dir/.ay"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  # Check global install
  local home="${HOME:-$(eval echo ~)}"
  if [ -d "$home/.ay" ]; then
    AYF_DIR="$home/.ay"
    return 0
  fi
  return 1
}

# Cross-platform temp directory
get_tmp_dir() {
  if [ -n "${TMPDIR:-}" ]; then
    echo "$TMPDIR"
  elif [ -n "${TMP:-}" ]; then
    echo "$TMP"
  elif [ -n "${TEMP:-}" ]; then
    echo "$TEMP"
  else
    echo "/tmp"
  fi
}

# Step 1: Check if ay-framework is installed
if ! find_ay_dir; then
  echo "[AY Framework] Not installed in this project or globally."
  echo "[AY Framework] Run: npx ay-framework --local"
  exit 0
fi

echo "[AY Framework] Found at $AYF_DIR"

# Step 2: Load state.json if it exists
STATE_FILE="$AYF_DIR/state.json"
if [ -f "$STATE_FILE" ]; then
  echo "[AY Framework] State loaded from $STATE_FILE"
else
  # Create minimal state
  mkdir -p "$AYF_DIR"
  cat > "$STATE_FILE" << 'STATEJSON'
{
  "version": "1.0.0",
  "installed_at": "",
  "last_update_check": 0,
  "mode": "local"
}
STATEJSON
  echo "[AY Framework] Created initial state at $STATE_FILE"
fi

# Step 3: Throttled update check (once per hour)
UPDATE_MARKER="$(get_tmp_dir)/ayf-update-check"
CURRENT_TIME=$(date +%s 2>/dev/null || echo "0")
LAST_CHECK=0

if [ -f "$UPDATE_MARKER" ]; then
  LAST_CHECK=$(cat "$UPDATE_MARKER" 2>/dev/null || echo "0")
fi

ELAPSED=$((CURRENT_TIME - LAST_CHECK))

if [ "$ELAPSED" -gt 3600 ]; then
  echo "[AY Framework] Checking for updates..."
  # Check npm registry (non-blocking, fail silently)
  if command -v npm >/dev/null 2>&1; then
    LATEST=$(npm view ay-framework version 2>/dev/null || echo "unknown")
    LOCAL="1.0.0"
    if [ -f "$AYF_DIR/../VERSION" ]; then
      LOCAL=$(cat "$AYF_DIR/../VERSION" 2>/dev/null || echo "1.0.0")
    fi
    if [ "$LATEST" != "unknown" ] && [ "$LATEST" != "$LOCAL" ]; then
      echo "[AY Framework] Update available: $LOCAL -> $LATEST"
      echo "[AY Framework] Run: npx ay-framework@latest"
    fi
  fi
  echo "$CURRENT_TIME" > "$UPDATE_MARKER"
else
  echo "[AY Framework] Update check skipped (checked $((ELAPSED / 60))m ago)"
fi

echo "[AY Framework] Session ready."
