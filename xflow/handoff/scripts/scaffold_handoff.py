#!/usr/bin/env python3
import argparse
import json
import re
import subprocess
from datetime import date, datetime, timezone
from pathlib import Path


CURRENT_START = "<!-- xflow:handoff-current:start -->"
CURRENT_END = "<!-- xflow:handoff-current:end -->"
VERIFIED_START = "<!-- xflow:handoff-verified:start -->"
VERIFIED_END = "<!-- xflow:handoff-verified:end -->"

TEMPLATE = """# {title} Handoff

Date: {today}

## Current State

- Fill in the latest high-signal status.

## Context Pack

### TL;DR

- Objective:
- Current status:
- Next action:
- Key risks:

### Key Facts

- (Anchor to code/paths/commands/numbers/dates)

### Decisions

- (Decision + brief rationale)

### Commands

- (High-value commands, include caveats)

### Pointers

- (Key files/dirs + 1-line description)

### Gotchas

- (Operational sharp edges)

## Project Background

- What this project is and why it exists.

## Architecture

- Core system shape.
- Non-negotiable invariants.

## Current Objective

- The specific task or delivery target the next session is inheriting.

## Progress

- What has been completed and what was verified.

## Open Problems

- Current blockers, risks, unknowns, and failure modes.

## Lessons Learned

- Operational gotchas, failed approaches, and patterns worth preserving.

## Recommendations

1. First recommended next action.
2. Second recommended next action.

## Key Files

- `HANDOFF.md`
"""


def read_json(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def git_value(project_root: Path, args: list[str], fallback: str = "unknown") -> str:
    try:
        result = subprocess.run(
            ["git", *args],
            cwd=str(project_root),
            text=True,
            capture_output=True,
            check=True,
        )
    except Exception:
        return fallback
    return result.stdout.strip() or fallback


def format_issue(status: dict) -> str:
    if status.get("issue_url"):
        return str(status["issue_url"])
    repo = status.get("issue_repo") or status.get("target_repo")
    issue_number = status.get("issue_number")
    if repo and issue_number:
        return f"{repo}#{issue_number}"
    return "none"


def build_current_state_block(project_root: Path, change_id: str | None) -> str:
    status = read_json(project_root / "specs" / "changes" / str(change_id or "") / "status.json")
    branch = git_value(project_root, ["branch", "--show-current"], status.get("branch_name") or "unknown")
    resolved_change_id = status.get("change_id") or change_id or "none"
    updated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    lines = [
        CURRENT_START,
        f"- Updated: {updated_at}",
        f"- Git branch: `{branch}`",
        f"- Change: `{resolved_change_id}`",
        f"- Title: {status.get('title') or 'none'}",
        f"- Stage / status: `{status.get('current_stage') or 'unknown'}` / `{status.get('status') or 'unknown'}`",
        f"- Verification: `{status.get('verification_status') or 'unknown'}`",
        f"- Archive: `{status.get('archival_status') or 'unknown'}`",
        f"- Issue: {format_issue(status)}",
        f"- Next action: {status.get('next_action') or 'none'}",
        CURRENT_END,
    ]
    return "\n".join(lines)


def code_span(value: object) -> str:
    text = str(value)
    if "`" not in text:
        return f"`{text}`"
    return f"`` {text} ``"


def build_verified_commands_block(project_root: Path, change_id: str | None) -> str:
    status = read_json(project_root / "specs" / "changes" / str(change_id or "") / "status.json")
    proof = read_json(project_root / "specs" / "changes" / str(change_id or "") / "verify_proof.json")
    results = proof.get("results") if isinstance(proof.get("results"), list) else []
    resolved_change_id = status.get("change_id") or change_id or "none"
    updated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    passed_count = sum(1 for result in results if result.get("passed"))
    total_count = len(results)
    summary = f"{passed_count}/{total_count} passed" if total_count else "no verify_proof results"

    lines = [
        VERIFIED_START,
        f"- Updated: {updated_at}",
        f"- Change: `{resolved_change_id}`",
        f"- Verification: `{status.get('verification_status') or 'unknown'}`",
        f"- Proof recorded: `{proof.get('recorded_at') or 'unknown'}`",
        f"- Summary: `{summary}`",
    ]
    if total_count:
        lines.append("- Commands:")
        for result in results:
            verdict = "PASS" if result.get("passed") else "FAIL"
            command = code_span(result.get("command") or "unknown")
            exit_code = code_span(result.get("exit_code", "unknown"))
            lines.append(f"  - {verdict} {command} (exit {exit_code})")
    else:
        lines.append("- Commands: none recorded")
    lines.append(VERIFIED_END)
    return "\n".join(lines)


def upsert_current_state(content: str, block: str) -> str:
    managed_pattern = re.compile(
        rf"{re.escape(CURRENT_START)}.*?{re.escape(CURRENT_END)}",
        re.DOTALL,
    )
    if managed_pattern.search(content):
        return managed_pattern.sub(block, content, count=1)

    heading_pattern = re.compile(r"(^## Current State\s*\n)", re.MULTILINE)
    heading_match = heading_pattern.search(content)
    if heading_match:
        section_start = heading_match.start()
        body_start = heading_match.end()
        next_heading = re.search(r"^## ", content[body_start:], re.MULTILINE)
        section_end = body_start + next_heading.start() if next_heading else len(content)
        return (
            content[:section_start]
            + "## Current State\n\n"
            + block
            + "\n\n"
            + content[section_end:].lstrip("\n")
        )

    first_heading = re.match(r"^# .*\n", content)
    if first_heading:
        insert_at = first_heading.end()
        return content[:insert_at] + "\n## Current State\n\n" + block + "\n" + content[insert_at:]
    return "## Current State\n\n" + block + "\n\n" + content


def upsert_verified_commands(content: str, block: str) -> str:
    managed_pattern = re.compile(
        rf"{re.escape(VERIFIED_START)}.*?{re.escape(VERIFIED_END)}",
        re.DOTALL,
    )
    if managed_pattern.search(content):
        return managed_pattern.sub(block, content, count=1)

    heading_pattern = re.compile(r"(^## Latest Verified Commands(?: and Results)?\s*\n)", re.MULTILINE)
    heading_match = heading_pattern.search(content)
    if heading_match:
        section_start = heading_match.start()
        body_start = heading_match.end()
        next_heading = re.search(r"^## ", content[body_start:], re.MULTILINE)
        section_end = body_start + next_heading.start() if next_heading else len(content)
        return (
            content[:section_start]
            + "## Latest Verified Commands\n\n"
            + block
            + "\n\n"
            + content[section_end:].lstrip("\n")
        )

    current_section = re.search(r"^## Current State\s*\n", content, re.MULTILINE)
    if current_section:
        body_start = current_section.end()
        next_heading = re.search(r"^## ", content[body_start:], re.MULTILINE)
        insert_at = body_start + next_heading.start() if next_heading else len(content)
        return (
            content[:insert_at].rstrip()
            + "\n\n## Latest Verified Commands\n\n"
            + block
            + "\n\n"
            + content[insert_at:].lstrip("\n")
        )

    first_heading = re.match(r"^# .*\n", content)
    if first_heading:
        insert_at = first_heading.end()
        return content[:insert_at] + "\n## Latest Verified Commands\n\n" + block + "\n" + content[insert_at:]
    return "## Latest Verified Commands\n\n" + block + "\n\n" + content


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create or overwrite the canonical root HANDOFF.md scaffold.",
    )
    parser.add_argument(
        "--project-root",
        default=".",
        help="Project root where HANDOFF.md should be written.",
    )
    parser.add_argument(
        "--title",
        default=None,
        help="Project title for the handoff heading. Defaults to the project root directory name.",
    )
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="Keep an existing HANDOFF.md intact. Create a scaffold only when missing.",
    )
    parser.add_argument(
        "--change-id",
        default=None,
        help="Accepted for atom-run compatibility; not used by this scaffold.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    project_root = Path(args.project_root).expanduser().resolve()
    title = args.title or project_root.name
    handoff_path = project_root / "HANDOFF.md"
    project_root.mkdir(parents=True, exist_ok=True)
    if args.refresh and handoff_path.exists():
        if args.change_id:
            content = handoff_path.read_text(encoding="utf-8")
            content = upsert_current_state(content, build_current_state_block(project_root, args.change_id))
            content = upsert_verified_commands(content, build_verified_commands_block(project_root, args.change_id))
            handoff_path.write_text(content, encoding="utf-8")
        print(str(handoff_path))
        return 0
    content = TEMPLATE.format(title=title, today=date.today().isoformat())
    if args.change_id:
        content = upsert_current_state(content, build_current_state_block(project_root, args.change_id))
        content = upsert_verified_commands(content, build_verified_commands_block(project_root, args.change_id))
    handoff_path.write_text(content, encoding="utf-8")
    print(str(handoff_path))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
