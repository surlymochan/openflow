#!/usr/bin/env bash
# Interface placeholder. Does not call cursor-agent or any provider.
set -euo pipefail

if [[ $# -ne 3 ]]; then
  echo "usage: omo.sh <workdir> <task.md> <events-dir>" >&2
  exit 2
fi

EVENTS=$3
mkdir -p "$EVENTS"
printf '%s\n' 'skipped: needs an OpenCode-compatible provider subscription or paid API key' > "$EVENTS/skipped.txt"
printf '%s\n' '{"name":"omo","version":null,"commit":null,"skipped":true}' > "$EVENTS/tool-version.json"
exit 0
