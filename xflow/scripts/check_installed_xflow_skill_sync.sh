#!/bin/sh
# Check that the installed xflow skill matches this repo's xflow skill.
# The installed skill may keep .skillhub-source as source metadata.
# Ignore generated Python cache artifacts in both trees.

set -eu

SCRIPT_PATH=$0
case "$SCRIPT_PATH" in
  /*) ;;
  *) SCRIPT_PATH=$(pwd)/$SCRIPT_PATH ;;
esac

SCRIPT_DIR=$(cd "$(dirname "$SCRIPT_PATH")" && pwd)
PROJECT_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)

SOURCE_DIR=${XFLOW_SKILL_SOURCE_DIR:-$PROJECT_ROOT/xflow}
TARGET_DIR=${XFLOW_INSTALLED_SKILL_DIR:-$HOME/.codex/skills/xflow}

if [ ! -d "$SOURCE_DIR" ]; then
  printf 'check_installed_xflow_skill_sync.sh: missing source xflow dir: %s\n' "$SOURCE_DIR" >&2
  exit 1
fi

if [ ! -d "$TARGET_DIR" ]; then
  printf 'check_installed_xflow_skill_sync.sh: missing installed xflow dir: %s\n' "$TARGET_DIR" >&2
  printf 'Run npm run skill:sync first, or set XFLOW_INSTALLED_SKILL_DIR.\n' >&2
  exit 1
fi

diff_file=$(mktemp)
filtered_file=$(mktemp)
trap 'rm -f "$diff_file" "$filtered_file"' EXIT

diff -qr "$SOURCE_DIR" "$TARGET_DIR" >"$diff_file" 2>&1 || true
grep -v -E '(\.skillhub-source|__pycache__|\.pyc$)' "$diff_file" >"$filtered_file" || true

if [ -s "$filtered_file" ]; then
  printf 'check_installed_xflow_skill_sync.sh: unexpected installed xflow skill drift:\n' >&2
  cat "$filtered_file" >&2
  exit 1
fi

printf 'verified xflow skill diff target: %s\n' "$TARGET_DIR"
