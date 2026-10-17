#!/usr/bin/env bash
# Plain cursor-agent. No workflow plugin and no extra instruction line.
set -euo pipefail

if [[ $# -ne 3 ]]; then
  echo "usage: baseline.sh <workdir> <task.md> <events-dir>" >&2
  exit 2
fi

WORKDIR=$1
TASK_MD=$2
EVENTS=$3
# shellcheck source=common.sh
source "$(dirname "$(readlink -f "$0")")/common.sh"

mkdir -p "$EVENTS"
printf '%s\n' '{"name":"baseline","version":null,"commit":null}' > "$EVENTS/tool-version.json"

PROMPT="$(cat "$TASK_MD")

Implement it; run the visible tests."

cd "$WORKDIR"
set +e
cursor_invoke "$EVENTS/agent-1.jsonl" "$PROMPT"
rc=$?
set -e
exit "$rc"
