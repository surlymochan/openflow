#!/usr/bin/env bash
# cursor-agent with the pinned superpowers plugin (--plugin-dir).
set -euo pipefail

if [[ $# -ne 3 ]]; then
  echo "usage: superpowers.sh <workdir> <task.md> <events-dir>" >&2
  exit 2
fi

WORKDIR=$1
TASK_MD=$2
EVENTS=$3
# shellcheck source=common.sh
source "$(dirname "$(readlink -f "$0")")/common.sh"

SUPERPOWERS_DIR="${SUPERPOWERS_DIR:-<superpowers-dir>}"
if [[ ! -f "$SUPERPOWERS_DIR/.cursor-plugin/plugin.json" ]]; then
  echo "superpowers plugin manifest missing under $SUPERPOWERS_DIR" >&2
  exit 2
fi
TAG="$(git -C "$SUPERPOWERS_DIR" describe --tags --exact-match 2>/dev/null || true)"
if [[ "$TAG" != "v7.0.0" ]]; then
  echo "superpowers checkout tag is '${TAG:-none}', expected v7.0.0" >&2
  exit 2
fi
COMMIT="$(git -C "$SUPERPOWERS_DIR" rev-parse HEAD)"
mkdir -p "$EVENTS"
python3 - "$EVENTS/tool-version.json" "$TAG" "$COMMIT" << 'PY'
import json, sys
path, tag, commit = sys.argv[1:]
with open(path, "w", encoding="utf-8") as handle:
    json.dump({"name": "superpowers", "version": tag, "commit": commit}, handle)
    handle.write("\n")
PY

PROMPT="$(cat "$TASK_MD")

Implement it; run the visible tests.
Use the installed skills for this change."

cd "$WORKDIR"
set +e
cursor_invoke "$EVENTS/agent-1.jsonl" "$PROMPT" --plugin-dir "$SUPERPOWERS_DIR"
rc=$?
set -e
exit "$rc"
