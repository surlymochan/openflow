#!/usr/bin/env python3
import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

sys.path.append(str(Path(__file__).resolve().parent))

from common import (  # noqa: E402
    find_git_root,
    get_current_branch,
    get_remote_url,
    gh_json,
    load_status,
    remote_branch_exists,
    resolve_project_context,
)


def extract_repo_from_remote_url(remote_url: str) -> str | None:
    import re

    match = re.search(r"github\.com[:/](?P<repo>[^/]+/[^/.]+?)(?:\.git)?$", remote_url.strip(), flags=re.IGNORECASE)
    if not match:
        return None
    return str(match.group("repo"))


def check(name: str, ok: bool, detail: str, *, value: Any | None = None, severity: str = "error") -> dict[str, Any]:
    payload: dict[str, Any] = {
        "name": name,
        "ok": ok,
        "detail": detail,
        "severity": severity,
    }
    if value is not None:
        payload["value"] = value
    return payload


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate Superflow repo / remote / issue / branch / project / status.json consistency.")
    parser.add_argument("--project-root", default=".", help="Project root containing specs/changes.")
    parser.add_argument("--change-id", required=True, help="Superflow change id.")
    parser.add_argument("--repo", help="Override target repo from status.json.")
    parser.add_argument("--issue-number", type=int, help="Override issue number from status.json.")
    parser.add_argument("--branch-name", help="Override linked branch from status.json.")
    parser.add_argument("--checkout-path", help="Override checkout path from status.json.")
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON output.")
    return parser.parse_args()


def issue_branch_comment_present(repo: str, issue_number: int, branch_name: str) -> bool:
    marker = "<!-- xflow:branch-link -->"
    try:
        comments = gh_json(["api", f"repos/{repo}/issues/{issue_number}/comments"])
    except subprocess.CalledProcessError:
        return False
    for comment in comments:
        body = comment.get("body") or ""
        if marker in body and f"`{branch_name}`" in body:
            return True
    return False


def run_doctor_checks(
    *,
    project_root: str | Path,
    change_id: str,
    repo: str | None = None,
    issue_number: int | None = None,
    branch_name: str | None = None,
    checkout_path_override: str | Path | None = None,
) -> dict[str, Any]:
    status_path, status = load_status(project_root, change_id)

    repo = repo or status.get("issue_repo") or status.get("target_repo")
    issue_number = issue_number or status.get("issue_number")
    branch_name = branch_name or status.get("branch_name")
    checkout_path_value = str(checkout_path_override) if checkout_path_override else status.get("checkout_path")
    code_repo = status.get("code_repo")
    checkout_path = None
    checks: list[dict[str, Any]] = []

    checks.append(
        check(
            "status-file",
            status_path.exists(),
            f"Loaded status file {status_path}" if status_path.exists() else f"Missing status file {status_path}",
            value=str(status_path),
        )
    )
    checks.append(check("status-issue-repo", bool(repo), "issue_repo is present" if repo else "issue_repo missing from status.json"))
    checks.append(check("status-issue-number", bool(issue_number), "issue_number is present" if issue_number else "issue_number missing from status.json"))
    checks.append(check("status-branch-name", bool(branch_name), "branch_name is present" if branch_name else "branch_name missing from status.json"))
    checks.append(check("status-code-repo", bool(code_repo), "code_repo is present" if code_repo else "code_repo missing from status.json", value=code_repo, severity="warn"))
    checks.append(
        check(
            "status-checkout-path",
            bool(checkout_path_value),
            "checkout_path is present" if checkout_path_value else "checkout_path missing from status.json",
            value=checkout_path_value,
        )
    )

    if checkout_path_value:
        try:
            checkout_path = Path(checkout_path_value).expanduser().resolve()
            checks.append(check("checkout-resolve", True, f"Resolved checkout {checkout_path}", value=str(checkout_path)))
        except Exception as exc:
            checks.append(check("checkout-resolve", False, f"Unable to resolve checkout path: {exc}", severity="error"))
    else:
        try:
            checkout_path = find_git_root(project_root)
            checks.append(check("checkout-resolve", True, f"Resolved checkout {checkout_path} from project root", value=str(checkout_path)))
        except subprocess.CalledProcessError as exc:
            checks.append(check("checkout-resolve", False, f"Unable to resolve checkout from project root: {exc}", severity="error"))

    checkout_remote_url = None
    checkout_repo = None
    if checkout_path:
        try:
            checkout_remote_url = get_remote_url(checkout_path)
            checkout_repo = extract_repo_from_remote_url(checkout_remote_url)
            checks.append(check("checkout-remote", True, "Resolved checkout remote", value={"remote_url": checkout_remote_url, "checkout_repo": checkout_repo}))
        except subprocess.CalledProcessError as exc:
            checks.append(check("checkout-remote", False, f"Unable to resolve checkout remote: {exc}", severity="error"))

    if code_repo and checkout_repo:
        checks.append(
            check(
                "checkout-code-repo-match",
                code_repo == checkout_repo,
                "checkout remote matches recorded code_repo" if code_repo == checkout_repo else "checkout remote differs from recorded code_repo",
                value={"recorded_code_repo": code_repo, "checkout_repo": checkout_repo},
            )
        )

    current_branch = None
    if checkout_path:
        try:
            current_branch = get_current_branch(checkout_path)
            checks.append(check("current-branch", True, "Current branch resolved", value=current_branch))
        except subprocess.CalledProcessError as exc:
            checks.append(check("current-branch", False, f"Unable to resolve current branch: {exc}", severity="error"))

    if branch_name and checkout_path:
        linked_branch_exists = bool(current_branch == branch_name or remote_branch_exists(checkout_path, branch_name))
        checks.append(
            check(
                "linked-branch-local-or-remote",
                linked_branch_exists,
                f"Linked branch {branch_name} exists locally or on origin" if linked_branch_exists else f"Linked branch {branch_name} not found locally or on origin",
                value=branch_name,
            )
        )
        if current_branch is not None:
            checks.append(
                check(
                    "linked-branch-current-match",
                    current_branch == branch_name,
                    f"Current branch matches linked branch {branch_name}" if current_branch == branch_name else f"Current branch {current_branch} differs from linked branch {branch_name}",
                    value={"current_branch": current_branch, "linked_branch": branch_name},
                )
            )
        checks.append(
            check(
                "branch-worktree-ready",
                linked_branch_exists and current_branch == branch_name,
                "Linked branch is available and the current checkout matches it"
                if (linked_branch_exists and current_branch == branch_name)
                else f"Linked branch/worktree is not ready: current={current_branch}, linked={branch_name}",
                value={
                    "current_branch": current_branch,
                    "linked_branch": branch_name,
                    "checkout_path": str(checkout_path),
                },
            )
        )

    issue_data = None
    if repo and issue_number:
        try:
            issue_data = gh_json(
                [
                    "issue",
                    "view",
                    str(issue_number),
                    "--repo",
                    repo,
                    "--json",
                    "number,title,url,state,projectItems",
                ]
            )
            checks.append(check("issue-exists", True, f"Issue {repo}#{issue_number} exists", value={"url": issue_data.get("url"), "state": issue_data.get("state")}))
        except subprocess.CalledProcessError as exc:
            checks.append(check("issue-exists", False, f"Unable to resolve issue {repo}#{issue_number}: {exc}", severity="error"))

    if repo and issue_number and branch_name:
        has_branch_comment = issue_branch_comment_present(repo, int(issue_number), branch_name)
        checks.append(
            check(
                "issue-branch-comment-link",
                has_branch_comment,
                "Found Superflow branch-link comment on issue" if has_branch_comment else "Missing Superflow branch-link comment on issue",
                value=branch_name,
                severity="warn",
            )
        )

    project_context = None
    if repo and issue_number:
        project_context = resolve_project_context(repo, int(issue_number))
        checks.append(
            check(
                "project-context",
                project_context is not None,
                f"Resolved project context {project_context['owner']}#{project_context['number']}" if project_context else "No unique project context discovered from issue",
                value=project_context,
                severity="warn",
            )
        )

    recorded_project = status.get("project_status") or status.get("project_done") or status.get("project_context")
    if recorded_project and project_context:
        same_owner = recorded_project.get("owner") == project_context.get("owner")
        same_number = int(recorded_project.get("number")) == int(project_context.get("number"))
        checks.append(
            check(
                "project-record-match",
                same_owner and same_number,
                "Recorded project context matches discovered project context" if (same_owner and same_number) else "Recorded project context differs from discovered project context",
                value={"recorded": recorded_project, "discovered": project_context},
                severity="warn",
            )
        )

    ok = all(item["ok"] or item["severity"] == "warn" for item in checks)
    hard_failures = [item for item in checks if (not item["ok"] and item["severity"] != "warn")]
    warnings = [item for item in checks if (not item["ok"] and item["severity"] == "warn")]

    result = {
        "change_id": change_id,
        "ok": ok,
        "hard_failures": len(hard_failures),
        "warnings": len(warnings),
        "checks": checks,
    }
    return result


def main() -> int:
    args = parse_args()
    result = run_doctor_checks(
        project_root=args.project_root,
        change_id=args.change_id,
        repo=args.repo,
        issue_number=args.issue_number,
        branch_name=args.branch_name,
        checkout_path_override=args.checkout_path,
    )

    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(f"Superflow doctor: {args.change_id}")
        print(f"Overall: {'OK' if result['ok'] else 'FAIL'}")
        for item in result["checks"]:
            icon = "PASS" if item["ok"] else ("WARN" if item["severity"] == "warn" else "FAIL")
            print(f"- [{icon}] {item['name']}: {item['detail']}")

    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
