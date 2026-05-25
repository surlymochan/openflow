#!/bin/sh
# Sync the repo-owned xflow skill into installed skill dirs without pruning
# skills that are managed by companion repositories.

set -eu

SCRIPT_PATH=$0
case "$SCRIPT_PATH" in
  /*) ;;
  *) SCRIPT_PATH=$(pwd)/$SCRIPT_PATH ;;
esac

SCRIPT_DIR=$(cd "$(dirname "$SCRIPT_PATH")" && pwd)
PROJECT_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)

config_value() {
  key_path=$1
  node -e '
const fs = require("fs");
const path = require("path");
const root = process.argv[1];
const keyPath = process.argv[2].split(".");
const configPath = path.join(root, ".as-xflow", "config.json");
if (!fs.existsSync(configPath)) process.exit(0);
const expandHome = (value) => typeof value === "string" && value.startsWith("~/")
  ? path.join(process.env.HOME || "", value.slice(2))
  : value;
let value = JSON.parse(fs.readFileSync(configPath, "utf8"));
for (const key of keyPath) value = value && value[key];
if (Array.isArray(value)) console.log(value.map(expandHome).join("\n"));
else if (value) console.log(expandHome(value));
' "$PROJECT_ROOT" "$key_path"
}

CONFIG_SYNC_SCRIPT=$(config_value skills.sync_script)
CONFIG_EXTRA_SOURCE_DIRS=$(config_value skills.extra_source_dirs)
CONFIG_TARGET_DIRS=$(config_value skills.installed_dir)

default_target_dirs() {
  if [ -d "$HOME/.codex/skills" ]; then
    printf '%s\n' "$HOME/.codex/skills"
    return 0
  fi

  printf '%s\n' "$HOME/.agents/skills"
}

SYNC_SCRIPT=${XFLOW_SKILL_SYNC_SCRIPT:-${SKILLHUB_SYNC_SCRIPT:-${CONFIG_SYNC_SCRIPT:-$HOME/Documents/workspace/pro/as-skillhub/skills/skills_sync.sh}}}
EXTRA_SOURCE_DIRS=${XFLOW_SKILL_SYNC_EXTRA_SOURCE_DIRS:-${SKILL_SYNC_EXTRA_SOURCE_DIRS:-${CONFIG_EXTRA_SOURCE_DIRS:-$HOME/Documents/workspace/pro/as-skillhub/skills}}}
TARGET_DIRS=${SKILL_SYNC_TARGET_DIRS:-${CONFIG_TARGET_DIRS:-$(default_target_dirs)}}
DEFAULT_XMEM_SOURCE_DIR=$(cd "$PROJECT_ROOT/../as-xmem" 2>/dev/null && pwd || true)
XMEM_SOURCE_DIR=${XFLOW_XMEM_SOURCE_DIR:-$DEFAULT_XMEM_SOURCE_DIR}

if [ ! -f "$SYNC_SCRIPT" ]; then
  printf 'sync_installed_xflow_skill.sh: missing skills sync script: %s\n' "$SYNC_SCRIPT" >&2
  exit 1
fi

if [ ! -d "$PROJECT_ROOT/xflow" ]; then
  printf 'sync_installed_xflow_skill.sh: missing source xflow dir: %s\n' "$PROJECT_ROOT/xflow" >&2
  exit 1
fi

extra_source_found=$(mktemp)
printf '%s\n' "$EXTRA_SOURCE_DIRS" | while IFS= read -r source_dir; do
  [ -n "$source_dir" ] || continue
  [ -d "$source_dir" ] || continue
  printf 'yes\n' >"$extra_source_found"
done

if [ ! -s "$extra_source_found" ]; then
  rm -f "$extra_source_found"
  printf 'sync_installed_xflow_skill.sh: no extra source dir exists in:\n%s\n' "$EXTRA_SOURCE_DIRS" >&2
  printf 'Set XFLOW_SKILL_SYNC_EXTRA_SOURCE_DIRS or SKILL_SYNC_EXTRA_SOURCE_DIRS to the as-skillhub skills dir.\n' >&2
  exit 1
fi
rm -f "$extra_source_found"

SKILLHUB="$PROJECT_ROOT" \
SKILL_SYNC_EXTRA_SOURCE_DIRS="$EXTRA_SOURCE_DIRS" \
SKILL_SYNC_TARGET_DIRS="$TARGET_DIRS" \
  sh "$SYNC_SCRIPT" xflow

install_xmem_skill_family() {
  [ -n "$XMEM_SOURCE_DIR" ] || return 0
  [ -d "$XMEM_SOURCE_DIR" ] || return 0
  [ -f "$XMEM_SOURCE_DIR/skill.md" ] || return 0

  printf '%s\n' "$TARGET_DIRS" | while IFS= read -r target_dir; do
    [ -n "$target_dir" ] || continue
    target_xmem=$target_dir/xmem

    rm -rf "$target_xmem"
    cp -RL "$XMEM_SOURCE_DIR" "$target_xmem"
    rm -f "$target_xmem/.xmem-root-skill.tmp"
    mv "$target_xmem/skill.md" "$target_xmem/.xmem-root-skill.tmp"
    mv "$target_xmem/.xmem-root-skill.tmp" "$target_xmem/SKILL.md"
    rm -f "$target_xmem/.skillhub-source"
    printf '%s\n' "$XMEM_SOURCE_DIR" >"$target_xmem/.xflow-source"

    find "$target_xmem" -type d -name '__pycache__' -prune -exec rm -rf {} +
    find "$target_xmem" -type f -name '*.pyc' -delete
    printf 'verified xmem skill sync target: %s\n' "$target_xmem"
  done
}

install_xmem_skill_family

printf '%s\n' "$TARGET_DIRS" | while IFS= read -r target_dir; do
  [ -n "$target_dir" ] || continue
  target_xflow=$target_dir/xflow

  if [ ! -d "$target_xflow" ]; then
    printf 'sync_installed_xflow_skill.sh: target xflow dir missing after sync: %s\n' "$target_xflow" >&2
    exit 1
  fi

  find "$target_xflow" -type d -name '__pycache__' -prune -exec rm -rf {} +
  find "$target_xflow" -type f -name '*.pyc' -delete

  diff_file=$(mktemp)
  filtered_file=$(mktemp)
  diff -qr "$PROJECT_ROOT/xflow" "$target_xflow" >"$diff_file" 2>&1 || true
  grep -v -E 'Only in .*/xflow: \.skillhub-source$|__pycache__|\.pyc$' "$diff_file" >"$filtered_file" || true

  if [ -s "$filtered_file" ]; then
    cat "$filtered_file" >&2
    rm -f "$diff_file" "$filtered_file"
    exit 1
  fi

  rm -f "$diff_file" "$filtered_file"
  printf 'verified xflow skill sync target: %s\n' "$target_xflow"
done
