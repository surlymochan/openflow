#!/usr/bin/env bash
# Shared cursor-agent flags. Source this file; do not execute it as an arm.
# Every arm must call cursor_invoke so the model and flags cannot drift.

CURSOR_BIN="${CURSOR_AGENT_BIN:-cursor-agent}"
BENCH_MODEL="${BENCH_MODEL:-grok-4.7-high}"

node_is_ok() {
  local bin="$1"
  [[ -n "$bin" && -x "$bin" ]] || return 1
  "$bin" -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 5) ? 0 : 1);'
}

find_node22() {
  local candidate
  for candidate in ${BENCH_NODE:-} $HOME/.local/node22/bin/node "$(command -v node 2>/dev/null || true)"; do
    if node_is_ok "$candidate"; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

# cursor_invoke STREAM_PATH PROMPT [extra cursor-agent args...]
# stdin is /dev/null. The prompt is a single argument after --.
cursor_invoke() {
  local stream_path="$1"
  local prompt="$2"
  shift 2
  mkdir -p "$(dirname "$stream_path")"
  "$CURSOR_BIN" \
    -p --trust --force \
    --model "$BENCH_MODEL" \
    --output-format stream-json \
    "$@" \
    -- "$prompt" < /dev/null > "$stream_path" 2> "${stream_path}.err"
}
