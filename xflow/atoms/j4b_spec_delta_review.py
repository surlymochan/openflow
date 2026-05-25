#!/usr/bin/env python3
"""
J4b.spec_delta.review - Generate a deterministic spec delta review.

This is intentionally not an LLM judge. It creates a reviewer-facing summary of
proposal, plan, tasks, verification commands, and merge-spec snippets so humans
and agents can inspect the change at the spec layer before reading code.
"""
import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path


ROOT_SPEC_FILES = ["product.md", "architecture.md", "workflow.md", "README.md"]
MERGE_SPEC_FILES = [
    "merge-product.md",
    "merge-architecture.md",
    "merge-workflow.md",
    "merge-aha.md",
]


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return ""


def headings(text: str) -> list[str]:
    return [match.strip() for match in re.findall(r"^#{1,4}\s+(.+)$", text, re.MULTILINE)]


def bullets(text: str) -> list[str]:
    return [match.strip() for match in re.findall(r"^\s*[-*]\s+(.+)$", text, re.MULTILINE)]


def requirement_statements(text: str) -> list[dict]:
    statements = []
    for line_number, raw in enumerate(text.splitlines(), start=1):
        line = raw.strip()
        if not line:
            continue
        normalized = re.sub(r"^\s*(?:[-*]|\d+\.)\s+", "", line)
        normalized = re.sub(r"^\[[ xX]\]\s+", "", normalized).strip()
        if not normalized:
            continue
        marker_match = re.search(
            r"\b(MUST|SHOULD|REQUIRED|REQUIRES|ACCEPTANCE|VERIFY|VALIDATE|PROOF|GATE)\b",
            normalized,
            re.IGNORECASE,
        )
        if marker_match:
            statements.append({
                "line": line_number,
                "marker": marker_match.group(1).upper(),
                "text": normalized,
            })
    return statements


def tasks(text: str) -> list[dict]:
    items = []
    for done, body in re.findall(r"^\s*[-*]\s+\[([ xX])\]\s+(.+)$", text, re.MULTILINE):
        items.append({"done": done.lower() == "x", "text": body.strip()})
    return items


def verification_commands(text: str) -> list[str]:
    commands = []
    for block in re.findall(r"```(?:bash|sh|shell)?\n(.*?)```", text, re.DOTALL):
        for line in block.splitlines():
            candidate = line.strip()
            if candidate and not candidate.startswith("#"):
                commands.append(candidate)
    return commands


def first_nonempty_lines(text: str, limit: int = 5) -> list[str]:
    lines = []
    for line in text.splitlines():
        stripped = line.strip()
        if stripped:
            lines.append(stripped)
        if len(lines) >= limit:
            break
    return lines


def spec_touchpoints(change_dir: Path) -> list[dict]:
    touchpoints = []
    for filename in MERGE_SPEC_FILES:
        path = change_dir / filename
        if not path.exists():
            continue
        text = read_text(path)
        touchpoints.append({
            "file": filename,
            "headings": headings(text),
            "bullets": bullets(text)[:12],
            "requirements": requirement_statements(text)[:12],
            "preview": first_nonempty_lines(text, 4),
        })
    return touchpoints


def root_spec_presence(project_root: Path) -> list[dict]:
    specs_dir = project_root / "specs"
    return [
        {
            "file": f"specs/{filename}",
            "exists": (specs_dir / filename).exists(),
        }
        for filename in ROOT_SPEC_FILES
    ]


def requirements_delta(proposal_text: str, plan_text: str, touchpoints: list[dict]) -> dict:
    proposal_requirements = requirement_statements(proposal_text)
    plan_requirements = requirement_statements(plan_text)
    touchpoint_requirements = [
        {
            "file": touchpoint["file"],
            "line": requirement["line"],
            "marker": requirement["marker"],
            "text": requirement["text"],
        }
        for touchpoint in touchpoints
        for requirement in touchpoint.get("requirements", [])
    ]
    return {
        "proposal": proposal_requirements[:20],
        "plan": plan_requirements[:20],
        "touchpoints": touchpoint_requirements[:20],
        "counts": {
            "proposal": len(proposal_requirements),
            "plan": len(plan_requirements),
            "touchpoints": len(touchpoint_requirements),
        },
    }


def render_markdown(review: dict) -> str:
    lines = [
        "# Spec Delta Review",
        "",
        f"- Change: `{review['change_id']}`",
        f"- Verdict: `{review['verdict']}`",
        f"- Recorded: `{review['recorded_at']}`",
        "",
        "## Summary",
        "",
        f"- Proposal sections: {', '.join(review['proposal']['headings']) or '(none)'}",
        f"- Plan sections: {', '.join(review['plan']['headings']) or '(none)'}",
        f"- Task count: {review['tasks']['total']} ({review['tasks']['done']} done)",
        f"- Verification commands: {len(review['plan']['verification_commands'])}",
        f"- Merge spec snippets: {len(review['spec_touchpoints'])}",
        f"- Requirement statements: {review['requirements_delta']['counts']['proposal']} proposal / {review['requirements_delta']['counts']['plan']} plan / {review['requirements_delta']['counts']['touchpoints']} touchpoint",
        "",
        "## Issues",
        "",
    ]
    if review["issues"]:
        lines.extend([f"- {issue}" for issue in review["issues"]])
    else:
        lines.append("- None")

    lines.extend(["", "## Warnings", ""])
    if review["warnings"]:
        lines.extend([f"- {warning}" for warning in review["warnings"]])
    else:
        lines.append("- None")

    lines.extend(["", "## Spec Touchpoints", ""])
    if review["spec_touchpoints"]:
        for touchpoint in review["spec_touchpoints"]:
            lines.append(f"### {touchpoint['file']}")
            if touchpoint["bullets"]:
                lines.extend([f"- {bullet}" for bullet in touchpoint["bullets"]])
            else:
                lines.append("- No bullet summary found.")
            lines.append("")
    else:
        lines.append("- No merge spec snippets found.")

    lines.extend(["", "## Requirements Delta", ""])
    for bucket in ["proposal", "plan", "touchpoints"]:
        lines.append(f"### {bucket.title()}")
        items = review["requirements_delta"][bucket]
        if items:
            for item in items:
                source = f"{item['file']}:" if "file" in item else ""
                lines.append(f"- {source}L{item['line']} `{item['marker']}` {item['text']}")
        else:
            lines.append("- None")
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", default=".")
    parser.add_argument("--change-id", required=True)
    args = parser.parse_args()

    project_root = Path(args.project_root).resolve()
    change_dir = project_root / "specs" / "changes" / args.change_id
    proposal_text = read_text(change_dir / "proposal.md")
    plan_text = read_text(change_dir / "plan.md")
    tasks_text = read_text(change_dir / "tasks.md")
    task_items = tasks(tasks_text)

    issues = []
    warnings = []
    if not proposal_text.strip():
        issues.append("proposal.md is missing or empty")
    if not plan_text.strip():
        issues.append("plan.md is missing or empty")
    if task_items and not any(item["done"] for item in task_items):
        warnings.append("tasks.md has checklist items, but none are marked done")
    if not verification_commands(plan_text):
        warnings.append("plan.md has no fenced verification commands")

    touchpoints = spec_touchpoints(change_dir)
    req_delta = requirements_delta(proposal_text, plan_text, touchpoints)
    if not touchpoints:
        warnings.append("No merge spec snippets found; archive may have no durable spec delta")
    if req_delta["counts"]["proposal"] and not req_delta["counts"]["plan"]:
        warnings.append("proposal.md has requirement statements, but plan.md has no requirement-level mapping")

    review = {
        "ok": len(issues) == 0,
        "gate": "J4b.spec_delta.review",
        "verdict": "pass" if len(issues) == 0 else "fail",
        "change_id": args.change_id,
        "proposal": {
            "exists": bool(proposal_text.strip()),
            "headings": headings(proposal_text),
            "bullets": bullets(proposal_text)[:12],
        },
        "plan": {
            "exists": bool(plan_text.strip()),
            "headings": headings(plan_text),
            "verification_commands": verification_commands(plan_text),
        },
        "tasks": {
            "exists": bool(tasks_text.strip()),
            "total": len(task_items),
            "done": sum(1 for item in task_items if item["done"]),
            "items": task_items[:20],
        },
        "root_specs": root_spec_presence(project_root),
        "spec_touchpoints": touchpoints,
        "requirements_delta": req_delta,
        "issues": issues,
        "warnings": warnings,
        "recorded_at": datetime.now(timezone.utc).isoformat(),
    }

    change_dir.mkdir(parents=True, exist_ok=True)
    json_path = change_dir / "spec_delta_review.json"
    md_path = change_dir / "spec_delta_review.md"
    json_path.write_text(json.dumps(review, indent=2) + "\n", encoding="utf-8")
    md_path.write_text(render_markdown(review), encoding="utf-8")

    print(json.dumps({
        "ok": review["ok"],
        "verdict": review["verdict"],
        "json_file": str(json_path),
        "markdown_file": str(md_path),
        "warnings": len(warnings),
        "issues": len(issues),
    }))
    sys.exit(0 if review["ok"] else 1)


if __name__ == "__main__":
    main()
