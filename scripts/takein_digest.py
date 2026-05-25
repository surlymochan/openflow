#!/usr/bin/env python3
"""Generate a compact xflow takeover digest from project handoff artifacts."""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path


ROOT_FILES = ("HANDOFF.md", "AHA.md", "DESIGN.md")


def run_git(project_root: Path, args: list[str]) -> str:
    try:
        return subprocess.run(
            ["git", *args],
            cwd=project_root,
            check=True,
            text=True,
            capture_output=True,
        ).stdout.strip()
    except (FileNotFoundError, subprocess.CalledProcessError):
        return ""


def read_excerpt(path: Path, limit: int) -> dict[str, object]:
    if not path.exists():
        return {
            "path": str(path),
            "exists": False,
            "excerpt": "",
            "line_count": 0,
            "truncated": False,
        }

    lines = path.read_text(encoding="utf-8").splitlines()
    excerpt_lines = lines[:limit]
    return {
      "path": str(path),
      "exists": True,
      "excerpt": "\n".join(excerpt_lines),
      "line_count": len(lines),
      "truncated": len(lines) > limit,
    }


def build_digest(project_root: Path, excerpt_lines: int) -> dict[str, object]:
    project_root = project_root.expanduser().resolve()
    files = {name: read_excerpt(project_root / name, excerpt_lines) for name in ROOT_FILES}
    status = run_git(project_root, ["status", "-sb"])
    branch = run_git(project_root, ["branch", "--show-current"])
    head = run_git(project_root, ["log", "-1", "--oneline", "--decorate"])
    origin_head = run_git(project_root, ["rev-parse", "--verify", "origin/HEAD"])

    warnings: list[str] = []
    if not files["HANDOFF.md"]["exists"]:
        warnings.append("HANDOFF.md is missing; intake context is incomplete.")
    if not files["AHA.md"]["exists"]:
        warnings.append("AHA.md is missing; durable lessons may be unavailable.")
    if status and "\n" in status:
        warnings.append("Working tree is dirty; stage deliberately and avoid blanket reset commands.")

    return {
        "project_root": str(project_root),
        "git": {
            "branch": branch or None,
            "head": head or None,
            "origin_head": origin_head or None,
            "status_sb": status or None,
        },
        "files": files,
        "warnings": warnings,
        "recommended_first_action": "Compare HANDOFF/AHA claims against git status, then inspect only files directly relevant to the active objective.",
    }


def render_markdown(digest: dict[str, object]) -> str:
    git = digest["git"]
    files = digest["files"]
    warnings = digest["warnings"]
    lines = [
        "# xflow Takein Digest",
        "",
        f"Project root: `{digest['project_root']}`",
        f"Branch: `{git.get('branch') or 'unknown'}`",
        f"HEAD: `{git.get('head') or 'unknown'}`",
        "",
        "## Git Status",
        "",
        "```text",
        git.get("status_sb") or "(unavailable)",
        "```",
        "",
        "## Warnings",
        "",
    ]
    if warnings:
        lines.extend(f"- {warning}" for warning in warnings)
    else:
        lines.append("- None")
    lines.extend(["", "## Artifacts", ""])
    for name, payload in files.items():
        exists = "present" if payload["exists"] else "missing"
        truncated = " truncated" if payload["truncated"] else ""
        lines.extend([
            f"### {name} ({exists}, {payload['line_count']} lines{truncated})",
            "",
            "```markdown",
            payload["excerpt"] or "",
            "```",
            "",
        ])
    lines.extend([
        "## Recommended First Action",
        "",
        str(digest["recommended_first_action"]),
    ])
    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", default=".", help="Project root containing HANDOFF.md and AHA.md.")
    parser.add_argument("--excerpt-lines", type=int, default=160, help="Maximum lines to include per artifact.")
    parser.add_argument("--json", action="store_true", help="Print JSON instead of markdown.")
    args = parser.parse_args()

    digest = build_digest(Path(args.project_root), max(1, args.excerpt_lines))
    if args.json:
        print(json.dumps(digest, indent=2, ensure_ascii=False))
    else:
        print(render_markdown(digest), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
