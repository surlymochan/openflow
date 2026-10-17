#!/usr/bin/env bash
# Install OpenFlow from $OPENFLOW_TGZ into a prefix outside the repo, put xflow
# on PATH, and add the Cursor project rule documented in docs/tooling-matrix.md.
set -euo pipefail

if [[ $# -ne 3 ]]; then
  echo "usage: openflow.sh <workdir> <task.md> <events-dir>" >&2
  exit 2
fi

WORKDIR=$1
TASK_MD=$2
EVENTS=$3
# shellcheck source=common.sh
source "$(dirname "$(readlink -f "$0")")/common.sh"

if [[ -z "${OPENFLOW_TGZ:-}" || ! -f "$OPENFLOW_TGZ" ]]; then
  echo "OPENFLOW_TGZ must be the path of a local openflow tarball" >&2
  exit 2
fi

NODE="$(find_node22)" || {
  echo "openflow needs Node.js >= 22.5 on PATH (or BENCH_NODE)" >&2
  exit 2
}
PREFIX="$(cd "$WORKDIR/.." && pwd)/prefix"
mkdir -p "$PREFIX" "$EVENTS"
export PATH="$(dirname "$NODE"):$PREFIX/bin:$PATH"

npm install -g --prefix "$PREFIX" --cache "$PREFIX/npm-cache" "$OPENFLOW_TGZ"
hash -r
command -v xflow >/dev/null

MATRIX="$(find "$PREFIX" -path '*/docs/tooling-matrix.md' -print -quit || true)"
SKILL_ROOT="$(find "$PREFIX" -type d -path '*/xflow/yolo' -print -quit || true)"
if [[ -z "$MATRIX" ]]; then
  echo "installed tarball has no docs/tooling-matrix.md" >&2
  exit 2
fi

xflow init --project-root "$WORKDIR"
PKG_JSON="$(find "$PREFIX" -path '*/node_modules/@surlymochan/openflow/package.json' -print -quit || true)"
VERSION="unknown"
if [[ -n "$PKG_JSON" ]]; then
  VERSION="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$PKG_JSON")"
fi
python3 - "$EVENTS/tool-version.json" "$VERSION" "$OPENFLOW_TGZ" << 'PY'
import json, sys
path, version, tarball = sys.argv[1:]
with open(path, "w", encoding="utf-8") as handle:
    json.dump({"name": "openflow", "version": version, "commit": None, "tarball": tarball}, handle)
    handle.write("\n")
PY

RULE_DIR="$WORKDIR/.cursor/rules"
mkdir -p "$RULE_DIR"
cat > "$RULE_DIR/openflow.mdc" << EOF
---
description: OpenFlow workflow entry for Cursor
alwaysApply: true
---

Use openflow as the workflow source of truth. The tooling matrix for this install is \`$MATRIX\`.
Start with \`xflow guide\`, then run
\`xflow goal set "<project direction>" --project-root .\`, \`xflow doctor --project-root .\`,
\`xflow goal audit --project-root . --json\`, and \`xflow workflow validate yolo --project-root .\`.
For implementation, use \`xflow:plan\` first, then \`xflow:yolo\` or \`xflow:corps\`
without re-planning. Preserve the split TDD order: tdd-red before execute,
tdd-green after execute, with I6c quality proof.
Skill entry docs from this install: \`${SKILL_ROOT:-$PREFIX}\`.
\`xflow\` is on PATH. Local contract: \`.as-xflow/config.json\`.
EOF

cd "$WORKDIR"
git add -A
git -c user.email=bench-e2e@local -c user.name=bench-e2e commit -m "Install OpenFlow project entry" >/dev/null
git rev-parse HEAD > "$EVENTS/measure-from.txt"

PROMPT="$(cat "$TASK_MD")

Implement it; run the visible tests.
Use the installed workflow tool for this change."

set +e
cursor_invoke "$EVENTS/agent-1.jsonl" "$PROMPT"
rc=$?
set -e
exit "$rc"
