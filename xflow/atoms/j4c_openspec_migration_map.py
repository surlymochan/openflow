#!/usr/bin/env python3
"""
J4c.openspec.migration_map - Map an OpenSpec project to openflow surfaces.

This atom is intentionally read-only. It reports how `openspec/specs` and
`openspec/changes` would map into `specs/` and `specs/changes/` without copying
or rewriting user files.
"""
import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path


def slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return re.sub(r"-+", "-", value).strip("-") or "change"


def markdown_files(root: Path) -> list[Path]:
    if not root.exists():
        return []
    return sorted(path for path in root.rglob("*.md") if path.is_file())


def map_change(change_dir: Path, openspec_root: Path) -> dict:
    files = {path.name: path for path in markdown_files(change_dir)}
    change_id = slugify(change_dir.name)
    proposal = files.get("proposal.md")
    design = files.get("design.md")
    tasks = files.get("tasks.md")
    spec_files = [
        str(path.relative_to(openspec_root))
        for path in markdown_files(change_dir)
        if "spec" in path.name.lower() or "specs" in path.parts
    ]

    return {
        "openspec_change": str(change_dir.relative_to(openspec_root)),
        "xflow_change_id": change_id,
        "target_dir": f"specs/changes/{change_id}",
        "proposal": str(proposal.relative_to(openspec_root)) if proposal else None,
        "design": str(design.relative_to(openspec_root)) if design else None,
        "tasks": str(tasks.relative_to(openspec_root)) if tasks else None,
        "spec_files": spec_files,
        "recommended_xflow_files": {
            "proposal": f"specs/changes/{change_id}/proposal.md",
            "plan": f"specs/changes/{change_id}/plan.md",
            "tasks": f"specs/changes/{change_id}/tasks.md",
            "spec_delta_review": f"specs/changes/{change_id}/spec_delta_review.json",
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", default=".")
    parser.add_argument("--openspec-root", default="openspec")
    args = parser.parse_args()

    project_root = Path(args.project_root).resolve()
    openspec_root = (project_root / args.openspec_root).resolve()
    specs_root = openspec_root / "specs"
    changes_root = openspec_root / "changes"

    issues = []
    if not openspec_root.exists():
        issues.append(f"OpenSpec root not found: {openspec_root}")

    root_specs = [
        {
            "openspec_file": str(path.relative_to(openspec_root)),
            "recommended_target": f"specs/{path.name}",
        }
        for path in markdown_files(specs_root)
    ]

    changes = [
        map_change(path, openspec_root)
        for path in sorted(changes_root.iterdir()) if changes_root.exists() and path.is_dir()
    ]

    report = {
        "ok": len(issues) == 0,
        "gate": "J4c.openspec.migration_map",
        "project_root": str(project_root),
        "openspec_root": str(openspec_root),
        "root_specs": root_specs,
        "changes": changes,
        "command_mapping": {
            "/opsx:new <change>": "xflow init --project-root .; xflow:plan",
            "/opsx:ff": "xflow:plan creates/refreshes plan.md",
            "/opsx:apply": "xflow workflow run yolo|corps --project-root .",
            "/opsx:archive": "xflow archive phase via A5.archive.commit_push_close",
            "openspec validate": "xflow workflow validate yolo|corps plus J4a/J4b gates",
        },
        "issues": issues,
        "recorded_at": datetime.now(timezone.utc).isoformat(),
    }

    output_dir = project_root / ".as-xflow"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / "openspec-migration.json"
    output_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    print(json.dumps({
        "ok": report["ok"],
        "report_file": str(output_path),
        "root_specs": len(root_specs),
        "changes": len(changes),
        "issues": issues,
    }))
    sys.exit(0 if report["ok"] else 1)


if __name__ == "__main__":
    main()
