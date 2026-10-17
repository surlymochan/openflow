#!/usr/bin/env bash
# openswarm's pi backend calls `$OPENSWARM_PI_BIN -p --mode json [...] --tools ... <prompt>`.
# This shim sends the same prompt through run_pi.sh (the only allowed entry to the model) in the
# worktree openswarm chose, then prints Pi's json events so openswarm parses them as usual.
set -uo pipefail
PROMPT="${!#}"
N=$(ls "$SHIM_EVENTS"/executor-*-prompt.md 2>/dev/null | wc -l)
LABEL="executor-$((N+1))"
PF="$SHIM_EVENTS/$LABEL-prompt.md"
printf '%s' "$PROMPT" > "$PF"
OUT=$("${RUN_PI:-<pi>/run_pi.sh}" --task-id "$SHIM_TASK_ID" --rw --workdir "$PWD" \
      --timeout "${SHIM_TIMEOUT:-1200}" --effort medium --prompt-file "$PF" 2>"$SHIM_EVENTS/$LABEL-run_pi.stderr.txt")
RC=$?
EVT=$(printf '%s\n' "$OUT" | tail -1 | python3 -c 'import json,sys; print(json.load(sys.stdin).get("events_file",""))' 2>/dev/null)
printf '%s\n' "$OUT" | tail -1 > "$SHIM_EVENTS/$LABEL-record.json"
if [[ -n "$EVT" && -f "$EVT" ]]; then cp "$EVT" "$SHIM_EVENTS/$LABEL-events.jsonl"; cat "$EVT"; fi
exit $RC
