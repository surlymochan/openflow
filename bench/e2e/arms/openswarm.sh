#!/usr/bin/env bash
# Planner cursor-agent writes a task file. openswarm run --backend cursor executes it.
# Executor token usage is read from the openswarm result, not re-parsed here.
set -euo pipefail

if [[ $# -ne 3 ]]; then
  echo "usage: openswarm.sh <workdir> <task.md> <events-dir>" >&2
  exit 2
fi

WORKDIR=$1
TASK_MD=$2
EVENTS=$3
# shellcheck source=common.sh
source "$(dirname "$(readlink -f "$0")")/common.sh"
HARNESS="$(dirname "$(readlink -f "$0")")/../harness/openswarm_finish.py"

if [[ -z "${OPENSWARM_DIR:-}" || ! -f "$OPENSWARM_DIR/bin/openswarm" ]]; then
  echo "OPENSWARM_DIR must be an openswarm checkout containing bin/openswarm" >&2
  exit 2
fi
if [[ -z "${BENCH_VISIBLE_CMD:-}" ]]; then
  echo "BENCH_VISIBLE_CMD is required" >&2
  exit 2
fi
SKILL="$OPENSWARM_DIR/SKILL.md"
if [[ ! -f "$SKILL" ]]; then
  echo "missing $SKILL" >&2
  exit 2
fi

COMMIT="$(git -C "$OPENSWARM_DIR" rev-parse HEAD 2>/dev/null || echo unknown)"
mkdir -p "$EVENTS"
python3 - "$EVENTS/tool-version.json" "$COMMIT" "$OPENSWARM_DIR" << 'PY'
import json, sys
path, commit, directory = sys.argv[1:]
with open(path, "w", encoding="utf-8") as handle:
    json.dump({"name": "openswarm", "version": None, "commit": commit, "dir": directory}, handle)
    handle.write("\n")
PY

TASK_FILE="$EVENTS/executor-task.md"
python3 - "$TASK_FILE" "$SKILL" "$TASK_MD" "$BENCH_VISIBLE_CMD" "$EVENTS/planner-prompt.txt" << 'PY'
import pathlib, sys
task_file, skill, task_md, visible, dest = sys.argv[1:]
text = (
    "You are the planner in an openswarm workflow. Read the skill and the engineering task.\n"
    "Write one self-contained task file for an executor that has none of this conversation.\n\n"
    "Write that file, and only that file, to:\n"
    f"{task_file}\n\n"
    "The file must include the goal, the files or areas to change, constraints, acceptance criteria, "
    "and this visible test command:\n"
    f"{visible}\n\n"
    "Do not modify any file inside the repository. Do not commit. The executor starts from a clean worktree.\n\n"
    "## openswarm skill\n\n"
    + pathlib.Path(skill).read_text(encoding="utf-8")
    + "\n\n## engineering task\n\n"
    + pathlib.Path(task_md).read_text(encoding="utf-8")
)
pathlib.Path(dest).write_text(text, encoding="utf-8")
PY
PLAN_PROMPT="$(cat "$EVENTS/planner-prompt.txt")"

cd "$WORKDIR"
set +e
cursor_invoke "$EVENTS/agent-1.jsonl" "$PLAN_PROMPT"
plan_rc=$?
set -e
if [[ ! -s "$TASK_FILE" ]]; then
  echo "planner did not write $TASK_FILE (exit $plan_rc)" >&2
  exit 1
fi

# The executor worktree is cut from HEAD. Drop anything the planner wrote in the repo.
git reset --hard HEAD
git clean -fd

export OPENSWARM_HOME="$EVENTS/openswarm-home"
mkdir -p "$OPENSWARM_HOME"
# Do not forward provider API keys into openswarm's probe. Cursor auth stays with cursor-agent.
unset DEEPSEEK_API_KEY OPENAI_API_KEY ANTHROPIC_API_KEY GOOGLE_API_KEY GEMINI_API_KEY || true
set +e
python3 "$OPENSWARM_DIR/bin/openswarm" run \
  --backend cursor \
  --model "$BENCH_MODEL" \
  --cwd "$WORKDIR" \
  --task-file "$TASK_FILE" \
  --verify "$BENCH_VISIBLE_CMD" \
  --budget-minutes 15 \
  > "$EVENTS/openswarm-stdout.txt" \
  2> "$EVENTS/openswarm.err"
swarm_rc=$?
set -e

set +e
python3 "$HARNESS" "$EVENTS/openswarm-stdout.txt" "$EVENTS" "$WORKDIR"
finish_rc=$?
set -e
if [[ "$swarm_rc" -ne 0 ]]; then
  exit "$swarm_rc"
fi
exit "$finish_rc"
