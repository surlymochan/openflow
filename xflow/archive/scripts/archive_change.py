#!/usr/bin/env python3
import argparse
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[2] / "scripts"))

from doctor import run_doctor_checks  # noqa: E402
from common import assert_stage_transition_allowed, assert_status_transition_allowed, find_git_root, get_current_branch, get_remote_url, load_status, maybe_relative, now_iso, record_stage_transition, record_value_transition, resolve_project_context, run, save_status, set_project_single_select_status, upsert_issue_comment  # noqa: E402


TARGETS = {
    "product": "product.md",
    "architecture": "architecture.md",
    "workflow": "workflow.md",
    "ux": "ux.md",
    "design": "DESIGN.md",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Conservatively archive a Superflow change into root specs.",
    )
    parser.add_argument(
        "--project-root",
        default=".",
        help="Project root containing specs/.",
    )
    parser.add_argument(
        "--change-id",
        required=True,
        help="Change identifier under specs/changes/.",
    )
    parser.add_argument("--repo", help="Override target repository for issue/project close-out.")
    parser.add_argument("--issue-number", type=int, help="Override linked issue number for close-out.")
    parser.add_argument("--checkout-path", help="Override local checkout path for git commit/push.")
    parser.add_argument("--commit-message", help="Commit message to use for archive publishing.")
    parser.add_argument("--push", action="store_true", help="Push the current branch after commit.")
    parser.add_argument("--allow-detached-branch-publish", action="store_true", help="Allow commit/push even when the current branch does not match the linked issue branch.")
    parser.add_argument("--skip-doctor-precheck", action="store_true", help="Skip the automatic doctor precheck before archive publish.")
    parser.add_argument("--close-issue", action="store_true", help="Close the linked issue after archive.")
    parser.add_argument("--project-owner", help="GitHub project owner login for project status updates.")
    parser.add_argument("--project-number", type=int, help="GitHub project number for project status updates.")
    parser.add_argument("--status-field-name", default="Status", help="Project single select field name.")
    parser.add_argument("--done-option-name", default="Done", help="Project status option name to apply.")
    parser.add_argument("--merge-snippets-only", action="store_true", help="Only merge change-scoped merge-*.md snippets into root specs.")
    return parser.parse_args()


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write_text(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")


def stage_archive_paths(project_root: Path, specs_root: Path, change_root: Path) -> None:
    candidates = [
        specs_root,
        project_root / "HANDOFF.md",
        project_root / "AHA.md",
        project_root / "DESIGN.md",
    ]
    existing = [str(path) for path in candidates if path.exists()]
    if existing:
        run(["git", "add", *existing], cwd=project_root)


def list_unstaged_tracked_changes(project_root: Path) -> list[str]:
    result = subprocess.run(
        ["git", "diff", "--name-only"],
        cwd=str(project_root),
        text=True,
        capture_output=True,
        check=True,
    )
    return [line.strip() for line in result.stdout.splitlines() if line.strip()]


def assert_no_unstaged_tracked_changes(project_root: Path) -> None:
    paths = list_unstaged_tracked_changes(project_root)
    if not paths:
        return
    joined = "\n- ".join(paths)
    raise SystemExit(
        "Refusing archive: unstaged tracked changes remain after staging archive paths. "
        "Stage intended implementation/test changes before archive, or clean unrelated edits:\n"
        f"- {joined}"
    )


def refresh_handoff_current_state(project_root: Path, change_id: str) -> None:
    script = Path(__file__).resolve().parents[2] / "handoff" / "scripts" / "scaffold_handoff.py"
    if script.exists():
        run([
            sys.executable,
            str(script),
            "--project-root",
            str(project_root),
            "--refresh",
            "--change-id",
            change_id,
        ], cwd=project_root)


def has_staged_changes(project_root: Path) -> bool:
    result = subprocess.run(
        ["git", "diff", "--cached", "--quiet"],
        cwd=str(project_root),
        text=True,
        capture_output=True,
    )
    return result.returncode == 1


def append_change_block(target_path: Path, change_id: str, snippet_path: Path) -> bool:
    snippet = read_text(snippet_path).strip()
    if not snippet:
        return False

    existing = read_text(target_path) if target_path.exists() else ""
    marker = f"## Change: {change_id}"
    if marker in existing:
        return False

    timestamp = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    block = (
        f"\n\n{marker}\n\n"
        f"Source: `{snippet_path}`\n"
        f"Archived: {timestamp}\n\n"
        f"{snippet}\n"
    )
    if existing and not existing.endswith("\n"):
        existing += "\n"
    write_text(target_path, existing + block)
    return True


def main() -> int:
    args = parse_args()
    project_root = Path(args.project_root).expanduser().resolve()
    specs_root = project_root / "specs"
    change_root = specs_root / "changes" / args.change_id

    required_paths = [
        change_root / "proposal.md",
        change_root / "plan.md",
        change_root / "tasks.md",
        change_root / "status.json",
    ]
    missing = [str(path) for path in required_paths if not path.exists()]
    if missing:
        raise SystemExit("Missing required change artifacts:\n- " + "\n- ".join(missing))

    status_path, status = load_status(project_root, args.change_id)

    if not args.merge_snippets_only and status.get("current_stage") not in {"verify", "archive"} and status.get("status") not in {"done", "blocked"}:
        raise SystemExit("Refusing archive: change still appears in flight.")

    verification_status = status.get("verification_status")
    if not args.merge_snippets_only and status.get("status") == "done" and verification_status != "passed":
        raise SystemExit("Refusing archive: completed change must have verification_status=passed.")

    # Check design alignment for frontend changes
    change_type = status.get("change_type", "backend")
    design_aligned = status.get("design_aligned", "na")
    if not args.merge_snippets_only and change_type in ("frontend", "full-stack") and design_aligned not in ("yes", "na"):
        if design_aligned == "no":
            raise SystemExit("Refusing archive: frontend change has design_aligned=no. Resolve design drift first.")
        elif design_aligned == "pending":
            print("Warning: frontend change has design_aligned=pending. Proceeding but recommend design verification.")

    if not args.merge_snippets_only and status.get("archival_status") == "archived":
        raise SystemExit("Refusing archive: change is already archived.")

    if not args.merge_snippets_only:
        stage_archive_paths(project_root, specs_root, change_root)
        assert_no_unstaged_tracked_changes(project_root)

    updated_targets: list[str] = []
    for key, filename in TARGETS.items():
        snippet_path = change_root / f"merge-{key}.md"
        if not snippet_path.exists():
            continue
        # DESIGN.md is at project root, others are in specs/
        if key == "design":
            target_path = project_root / filename
        else:
            target_path = specs_root / filename
        if not target_path.exists():
            # For design, create if snippet exists and frontend change
            if key == "design" and change_type in ("frontend", "full-stack"):
                # Copy template
                template_path = Path(__file__).resolve().parents[2] / "yolo" / "templates" / "DESIGN.md"
                if template_path.exists():
                    write_text(target_path, read_text(template_path))
                else:
                    raise SystemExit(f"Missing DESIGN.md template at {template_path}")
            else:
                raise SystemExit(f"Missing target spec file for merge: {target_path}")
        changed = append_change_block(target_path, args.change_id, snippet_path)
        if changed:
            updated_targets.append(str(target_path))

    if args.merge_snippets_only:
        print("Mode: merge-snippets-only")
        print(f"Merged snippets for change: {args.change_id}")
        if updated_targets:
            print("Updated root specs:")
            for target in updated_targets:
                print(f"- {target}")
        else:
            print("No root specs updated: no merge-*.md snippets were present.")
        return 0

    assert_stage_transition_allowed(
        status.get("current_stage"),
        "archive",
        current_status=status.get("status"),
        allow_terminal_status_override=("done", "blocked"),
    )
    if status.get("status") == "done":
        assert_status_transition_allowed(status.get("status"), "done", allow_terminal_status_override=("done",))
    elif status.get("status") == "blocked":
        assert_status_transition_allowed(status.get("status"), "blocked", allow_terminal_status_override=("blocked",))
    else:
        assert_status_transition_allowed(status.get("status"), "done")
    record_stage_transition(status, "archive", reason="archive script began canonical close-out")
    if status.get("status") != "blocked":
        record_value_transition(status, "status", "done", reason="archive completed canonical close-out")
    status["archival_status"] = "archived"
    status["next_action"] = "Archive complete. Refresh HANDOFF.md and durable lessons if new information emerged."
    save_status(status_path, status)
    refresh_handoff_current_state(project_root, args.change_id)

    repo = args.repo or status.get("issue_repo") or status.get("target_repo")
    issue_number = args.issue_number or status.get("issue_number")
    checkout_path = Path(args.checkout_path or status.get("checkout_path") or find_git_root(project_root))
    linked_branch = status.get("branch_name")
    commit_message = args.commit_message or f"archive(xflow): close {args.change_id}"

    if repo and issue_number and linked_branch and not args.skip_doctor_precheck:
        pre_result = run_doctor_checks(
            project_root=project_root,
            change_id=args.change_id,
            repo=repo,
            issue_number=int(issue_number),
            branch_name=linked_branch,
            checkout_path_override=checkout_path,
        )
        if not pre_result["ok"]:
            raise SystemExit("Doctor precheck failed before archive publish. Run doctor.py for details.")

    remote_url = None
    if checkout_path:
        remote_url = get_remote_url(checkout_path)

    if linked_branch and not args.allow_detached_branch_publish:
        current_branch = get_current_branch(checkout_path)
        if current_branch != linked_branch:
            raise SystemExit(
                f"Refusing publish: current branch is {current_branch!r}, but linked issue branch is {linked_branch!r}. "
                "Switch to the linked branch or pass --allow-detached-branch-publish."
            )

    stage_archive_paths(project_root, specs_root, change_root)
    commit_result = "no staged changes"
    if has_staged_changes(project_root):
        run(["git", "commit", "-m", commit_message], cwd=checkout_path)
        commit_result = commit_message

    push_result = "skipped"
    if args.push:
        run(["git", "push"], cwd=checkout_path)
        push_result = "pushed"

    project_context = resolve_project_context(repo, int(issue_number), args.project_owner, args.project_number) if repo and issue_number else None
    project_result = None
    if repo and issue_number and project_context:
        project_result = set_project_single_select_status(
            project_context["owner"],
            int(project_context["number"]),
            args.status_field_name,
            args.done_option_name,
            repo,
            int(issue_number),
        )
    elif repo and issue_number:
        upsert_issue_comment(
            repo,
            int(issue_number),
            "<!-- xflow:archive-state -->",
            "Archive completed. No GitHub Project context was provided, so Superflow recorded completion via issue comment fallback.",
        )

    if repo and issue_number and args.close_issue:
        run(["gh", "issue", "close", str(issue_number), "--repo", repo], cwd=checkout_path)

    status["git_publish"] = {
        "commit": commit_result,
        "push": push_result,
        "remote_url": remote_url,
    }
    if project_result:
        status["project_done"] = {
            "owner": project_context["owner"],
            "number": int(project_context["number"]),
            "field_name": args.status_field_name,
            "option_name": args.done_option_name,
            "source": project_context.get("source", "explicit"),
            **project_result,
        }
    save_status(status_path, status)

    print("Mode: full-publish")
    print(f"Archived change: {args.change_id}")
    if updated_targets:
        print("Updated root specs:")
        for target in updated_targets:
            print(f"- {target}")
    else:
        print("No root specs updated: no merge-*.md snippets were present.")
    print(f"Commit: {commit_result}")
    print(f"Push: {push_result}")
    if project_result:
        print(f"Project status: {args.done_option_name}")
    elif repo and issue_number:
        print("Project status: issue comment fallback")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
