#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[2] / "scripts"))

from doctor import run_doctor_checks  # noqa: E402
from common import (  # noqa: E402
    assert_status_transition_allowed,
    assert_stage_transition_allowed,
    ensure_branch_checked_out,
    find_git_root,
    get_current_branch,
    get_remote_url,
    load_status,
    maybe_relative,
    record_stage_transition,
    record_value_transition,
    resolve_project_context,
    save_status,
    set_project_single_select_status,
    upsert_issue_comment,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Move a Superflow issue into In Progress and sync status metadata.")
    parser.add_argument("--project-root", default=".", help="Project root containing specs/changes.")
    parser.add_argument("--change-id", required=True, help="Superflow change id.")
    parser.add_argument("--repo", help="Override repo from status.json.")
    parser.add_argument("--issue-number", type=int, help="Override issue number from status.json.")
    parser.add_argument("--branch-name", help="Override branch name from status.json.")
    parser.add_argument("--checkout-path", help="Override checkout path from status.json.")
    parser.add_argument("--project-owner", help="GitHub project owner login for project status updates.")
    parser.add_argument("--project-number", type=int, help="GitHub project number for project status updates.")
    parser.add_argument("--status-field-name", default="Status", help="Project single select field name.")
    parser.add_argument("--target-status", default="In Progress", help="Project status option to apply.")
    parser.add_argument("--skip-doctor-precheck", action="store_true", help="Skip the automatic doctor precheck before state transition.")
    parser.add_argument("--skip-doctor-postcheck", action="store_true", help="Skip the automatic doctor postcheck after state transition.")
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON output.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    status_path, status = load_status(args.project_root, args.change_id)

    repo = args.repo or status.get("issue_repo") or status.get("target_repo")
    issue_number = args.issue_number or status.get("issue_number")
    branch_name = args.branch_name or status.get("branch_name")
    checkout_path = Path(args.checkout_path or status.get("checkout_path") or find_git_root(args.project_root))
    assert_stage_transition_allowed(status.get("current_stage"), "tdd", current_status=status.get("status"))
    assert_status_transition_allowed(status.get("status"), "active")

    if not repo or not issue_number or not branch_name:
        raise SystemExit("status.json must include target_repo, issue_number, and branch_name or they must be passed explicitly.")

    if not args.skip_doctor_precheck:
        pre_result = run_doctor_checks(
            project_root=args.project_root,
            change_id=args.change_id,
            repo=repo,
            issue_number=int(issue_number),
            branch_name=branch_name,
            checkout_path_override=checkout_path,
        )
        if not pre_result["ok"]:
            raise SystemExit("Doctor precheck failed before exec state transition. Run doctor.py for details.")

    remote_url = get_remote_url(checkout_path)
    ensure_branch_checked_out(checkout_path, branch_name)
    current_branch = get_current_branch(checkout_path)
    if current_branch != branch_name:
        raise SystemExit(
            f"Execution branch mismatch: current branch is {current_branch!r}, expected linked issue branch {branch_name!r}."
        )

    project_context = resolve_project_context(repo, int(issue_number), args.project_owner, args.project_number)
    project_result = None
    if project_context:
        project_result = set_project_single_select_status(
            project_context["owner"],
            int(project_context["number"]),
            args.status_field_name,
            args.target_status,
            repo,
            int(issue_number),
        )
    else:
        marker = "<!-- xflow:exec-state -->"
        upsert_issue_comment(
            repo,
            int(issue_number),
            marker,
            f"Execution started on branch `{branch_name}`.\n\nNo GitHub Project context was provided, so Superflow recorded the active state via issue comment fallback.",
        )

    record_value_transition(status, "status", "active", reason="exec entered active implementation")
    record_stage_transition(status, "tdd", reason="exec moved the linked issue into active implementation")
    status["verification_status"] = "running"
    status["next_action"] = "Implement on the linked branch, then verify and archive."
    status["target_repo"] = repo
    status["issue_repo"] = repo
    status["issue_number"] = int(issue_number)
    status["branch_name"] = branch_name
    status["checkout_path"] = str(checkout_path)
    status["execution_started"] = True
    if project_result:
        status["project_status"] = {
            "owner": project_context["owner"],
            "number": int(project_context["number"]),
            "field_name": args.status_field_name,
            "option_name": args.target_status,
            "source": project_context.get("source", "explicit"),
            **project_result,
        }
    save_status(status_path, status)
    doctor_result = None
    if not args.skip_doctor_postcheck:
        doctor_result = run_doctor_checks(
            project_root=args.project_root,
            change_id=args.change_id,
            repo=repo,
            issue_number=int(issue_number),
            branch_name=branch_name,
            checkout_path_override=checkout_path,
        )
        if not doctor_result["ok"]:
            raise SystemExit("Doctor postcheck failed after exec state transition. Run doctor.py for details.")

    result = {
        "change_id": args.change_id,
        "repo": repo,
        "issue_number": int(issue_number),
        "branch_name": branch_name,
        "checkout_path": str(checkout_path),
        "remote_url": remote_url,
        "project_status_updated": bool(project_result),
        "project_context_source": project_context.get("source") if project_context else None,
        "status_path": maybe_relative(status_path, base=args.project_root),
    }
    if doctor_result is not None:
        result["doctor"] = {"ok": doctor_result["ok"], "hard_failures": doctor_result["hard_failures"], "warnings": doctor_result["warnings"]}
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(f"Execution prepared for {repo}#{issue_number}")
        print(f"Branch: {branch_name}")
        print(f"Checkout: {checkout_path}")
        print(f"Remote: {remote_url}")
        print(f"Project status updated: {'yes' if project_result else 'fallback issue comment'}")
        print(f"Status: {status_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
