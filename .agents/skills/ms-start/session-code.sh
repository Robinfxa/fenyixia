#!/usr/bin/env bash
# Register a unique 3-letter code for this Director session.
#
# Usage:
#   bash .agents/skills/ms-start/session-code.sh abc [label]
#
# Writes .multi-subflow/sessions/abc.json. The file is runtime state and should
# stay untracked because .multi-subflow/ is gitignored.
set -euo pipefail

CODE="${1:-}"
LABEL="${2:-director-session}"

case "$CODE" in
  [A-Za-z][A-Za-z][A-Za-z]) CODE=$(printf '%s' "$CODE" | tr '[:upper:]' '[:lower:]') ;;
  *) echo "GATE: FAIL session code must be exactly 3 letters, e.g. abc"; exit 2 ;;
esac

DIR=".multi-subflow/sessions"
FILE="$DIR/$CODE.json"
mkdir -p "$DIR"

if [ -e "$FILE" ]; then
  if [ "${MS_SESSION_REUSE:-0}" = "1" ]; then
    echo "GATE: PASS session code reused: $CODE"
    exit 0
  fi
  echo "GATE: FAIL session code already registered: $CODE"
  echo "NEXT: choose another 3-letter code, or set MS_SESSION_REUSE=1 if this is the same resumed session."
  exit 1
fi

now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
tmp="$FILE.tmp.$$"
safe_label=$(printf '%s' "$LABEL" | sed 's/\\/\\\\/g; s/"/\\"/g')
printf '{\n  "code": "%s",\n  "label": "%s",\n  "created_at": "%s"\n}\n' "$CODE" "$safe_label" "$now" > "$tmp"
if mv -n "$tmp" "$FILE" 2>/dev/null; then
  echo "GATE: PASS session code registered: $CODE"
  echo "FILE: $FILE"
else
  rm -f "$tmp"
  echo "GATE: FAIL session code race/collision: $CODE"
  exit 1
fi
