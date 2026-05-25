#!/usr/bin/env python3
import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[2] / "scripts"))

from doctor import run_doctor_checks  # noqa: E402
from common import (  # noqa: E402
    assert_stage_transition_allowed,
    assert_status_transition_allowed,
    discover_project_from_issue,
    find_git_root,
    get_remote_url,
    gh_json,
    load_status,
    record_stage_transition,
    record_value_transition,
    local_branch_exists,
    maybe_relative,
    now_iso,
    read_text,
    remote_branch_exists,
    run,
    run_stdout,
    save_status,
    slugify,
    upsert_issue_comment,
    write_text,
)


DEFAULT_ISSUE_REPO = os.environ.get("XFLOW_DEFAULT_ISSUE_REPO", "owner/internal-tracker")
WORKSPACE_ROOT = Path.home() / "Documents/workspace"
_CJK_RE = re.compile(r"[\u3400-\u9fff]")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Open or normalize a GitHub issue, create a linked branch, and update Superflow change metadata.")
    parser.add_argument("--project-root", default=".", help="Project root where specs/changes lives.")
    parser.add_argument("--repo", help="Target repository in owner/name form. Defaults to .as-xflow/config.json issue_routing.repo.")
    parser.add_argument("--change-id", required=True, help="Existing or new Superflow change id.")
    parser.add_argument("--title", help="Issue title. Required when creating a new issue.")
    parser.add_argument("--body", help="Issue body text.")
    parser.add_argument("--body-file", help="Path to a file containing the issue body.")
    parser.add_argument("--issue-number", type=int, help="Reuse and optionally update an existing issue instead of creating a new one.")
    parser.add_argument("--change-type", choices=["backend", "frontend", "full-stack", "infrastructure", "docs"], default="backend")
    parser.add_argument("--checkout-path", help="Local checkout path for the target repo.")
    parser.add_argument("--base-branch", help="Base branch to branch from. Defaults to the repo default branch.")
    parser.add_argument("--branch-name", help="Override the branch name. Defaults to issue-<number>-<change-id>.")
    parser.add_argument("--with-design", action="store_true", help="Create DESIGN.md if the scaffold needs it.")
    parser.add_argument("--skip-doctor-postcheck", action="store_true", help="Skip the automatic doctor postcheck after issue/branch setup.")
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON output.")
    return parser.parse_args()


def load_project_config(project_root: str | Path) -> dict[str, object]:
    config_path = Path(project_root).expanduser().resolve() / ".as-xflow" / "config.json"
    if not config_path.exists():
        return {}
    return json.loads(config_path.read_text(encoding="utf-8"))


def configured_issue_repo(project_root: str | Path) -> str | None:
    config = load_project_config(project_root)
    issue_routing = config.get("issue_routing")
    if isinstance(issue_routing, dict):
        repo = issue_routing.get("repo")
        if isinstance(repo, str) and repo.strip():
            return repo.strip()
    return None


def resolve_issue_repo(args: argparse.Namespace) -> str:
    return args.repo or configured_issue_repo(args.project_root) or DEFAULT_ISSUE_REPO


def load_issue_body(args: argparse.Namespace) -> str | None:
    if args.body_file:
        return Path(args.body_file).expanduser().read_text(encoding="utf-8")
    return args.body


def contains_cjk(text: str | None) -> bool:
    return bool(text and _CJK_RE.search(text))


def parse_repo_from_remote_url(remote_url: str) -> str | None:
    match = re.search(r"github\.com[:/](?P<repo>[^/]+/[^/.]+?)(?:\.git)?$", remote_url.strip(), flags=re.IGNORECASE)
    if not match:
        return None
    return str(match.group("repo"))


def resolve_code_checkout(preferred: str | None, project_root: str | Path) -> Path:
    if preferred:
        checkout_path = Path(preferred).expanduser().resolve()
        if not checkout_path.exists():
            raise SystemExit(f"Checkout path does not exist: {checkout_path}")
        return checkout_path
    return find_git_root(project_root)


def get_checkout_repo(checkout_path: Path) -> str:
    remote_url = get_remote_url(checkout_path)
    repo = parse_repo_from_remote_url(remote_url)
    if not repo:
        raise SystemExit(f"Unable to derive owner/name from checkout remote: {remote_url!r}")
    return repo


def get_checkout_default_branch(checkout_path: Path) -> str:
    try:
        symbolic_ref = run_stdout(["git", "symbolic-ref", "refs/remotes/origin/HEAD"], cwd=checkout_path)
        if symbolic_ref:
            return symbolic_ref.rsplit("/", 1)[-1]
    except subprocess.CalledProcessError:
        pass
    try:
        remote_show = run_stdout(["git", "remote", "show", "origin"], cwd=checkout_path)
        for line in remote_show.splitlines():
            stripped = line.strip()
            if stripped.startswith("HEAD branch:"):
                branch_name = stripped.split(":", 1)[1].strip()
                if branch_name:
                    return branch_name
    except subprocess.CalledProcessError:
        pass
    current_branch = run_stdout(["git", "branch", "--show-current"], cwd=checkout_path)
    return current_branch or "main"


def enforce_as_xflow_openissue_contract(repo: str, title: str | None, body: str | None, checkout_path: Path) -> None:
    if repo != DEFAULT_ISSUE_REPO:
        raise SystemExit(f"as-xflow openissue must file into {DEFAULT_ISSUE_REPO}, not {repo!r}.")
    if not contains_cjk(title):
        raise SystemExit("as-xflow openissue requires a Chinese issue title containing CJK characters.")
    if not contains_cjk(body):
        raise SystemExit("as-xflow openissue requires a Chinese issue body containing CJK characters.")
    resolved_checkout = checkout_path.expanduser().resolve()
    if not resolved_checkout.is_relative_to(WORKSPACE_ROOT):
        raise SystemExit(f"as-xflow code checkout must live under {WORKSPACE_ROOT}, got {resolved_checkout}.")


def extract_section(body: str, headings: list[str]) -> str:
    if not body:
        return "-"
    lines = body.splitlines()
    normalized = [heading.lower() for heading in headings]
    capture = False
    collected: list[str] = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("#"):
            heading_text = stripped.lstrip("#").strip().lower()
            if any(heading_text.startswith(heading) for heading in normalized):
                capture = True
                collected = []
                continue
            if capture:
                break
        if capture:
            collected.append(line)
    text = "\n".join(collected).strip()
    return text or "-"


def is_scaffold_placeholder_line(line: str) -> bool:
    stripped = line.strip()
    if not stripped:
        return True
    if stripped.startswith("#"):
        return True
    if stripped in {"-", "1.", "2.", "3.", "```", "```bash"}:
        return True
    if stripped.startswith("# Fill in the smallest proof commands"):
        return True
    return stripped in {
        "- Visual tone:",
        "- Key differentiator:",
        "- Reference brand (if any):",
        "- Key specifications to verify:",
    }


def should_hydrate_doc(path: Path) -> bool:
    if not path.exists():
        return True
    content = read_text(path)
    if not content.strip():
        return True
    return all(is_scaffold_placeholder_line(line) for line in content.splitlines())


def hydrate_change_docs(project_root: str | Path, change_id: str, issue_title: str, issue_body: str | None, branch_name: str) -> None:
    change_root = Path(project_root).expanduser().resolve() / "specs" / "changes" / change_id
    proposal_path = change_root / "proposal.md"
    plan_path = change_root / "plan.md"
    issue_path = change_root / "issue.md"
    issue_body = issue_body or ""

    objective = issue_title.strip() or change_id
    problem = extract_section(issue_body, ["problem", "context", "background"])
    expected = extract_section(issue_body, ["expected outcome", "outcome"])
    scope = extract_section(issue_body, ["scope", "in scope"])
    non_goals = extract_section(issue_body, ["non-goals", "non goals", "out of scope"])
    acceptance = extract_section(issue_body, ["acceptance criteria", "acceptance"])

    proposal = f"""# Proposal

## Objective

- {objective}

## Problem / Context

{problem}

## Chosen Path

- Track execution through issue branch `{branch_name}`
- Use the linked GitHub issue as the external coordination anchor

## Rejected Paths

- Leave issue and branch unlinked
- Execute without change-scoped artifacts

## In Scope

{scope}

## Out of Scope

{non_goals}

## Acceptance Intent

{acceptance if acceptance != '-' else expected}
"""

    plan = f"""# Plan

## Target Outcome

- {objective}

## Chosen Path

- Work on linked branch `{branch_name}`
- Keep implementation aligned with the GitHub issue and change artifacts

## In Scope

{scope}

## Out of Scope

{non_goals}

## Task Slices

1. Finalize frozen scope against the issue
2. Implement on the linked branch
3. Verify and prepare archive artifacts

## Verification Commands

```bash
# Fill in the smallest proof commands for this change
```

## Main Risk

- Scope drift between issue, proposal, and implementation
"""

    if should_hydrate_doc(proposal_path):
        write_text(proposal_path, proposal.rstrip() + "\n")
    if should_hydrate_doc(plan_path):
        write_text(plan_path, plan.rstrip() + "\n")
    write_text(issue_path, f"# {objective}\n\n{issue_body.strip()}\n")


def scaffold_change_workspace(args: argparse.Namespace) -> None:
    script_path = Path(__file__).resolve().parents[2] / "yolo" / "scripts" / "scaffold_specs_change.py"
    cmd = [
        "python3",
        str(script_path),
        "--project-root",
        str(Path(args.project_root).expanduser().resolve()),
        "--change-id",
        args.change_id,
        "--title",
        args.title or args.change_id,
        "--change-type",
        args.change_type,
    ]
    if args.with_design or args.change_type in {"frontend", "full-stack"}:
        cmd.append("--with-design")
    run(cmd)


def create_or_update_issue(repo: str, title: str | None, body: str | None, issue_number: int | None) -> dict[str, object]:
    if issue_number is None:
        if not title:
            raise SystemExit("--title is required when creating a new issue")
        if not body:
            raise SystemExit("Issue body is required when creating a new issue. Pass --body or --body-file.")
        cmd = ["gh", "issue", "create", "--repo", repo, "--title", title, "--body", body]
        issue_url = run_stdout(cmd)
        return gh_json(["issue", "view", issue_url, "--repo", repo, "--json", "number,url,title"])

    edit_cmd = ["gh", "issue", "edit", str(issue_number), "--repo", repo]
    mutated = False
    if title:
        edit_cmd.extend(["--title", title])
        mutated = True
    if body is not None:
        edit_cmd.extend(["--body", body])
        mutated = True
    if mutated:
        run(edit_cmd)
    return gh_json(["issue", "view", str(issue_number), "--repo", repo, "--json", "number,url,title"])


def ensure_linked_branch(issue_repo: str, issue_number: int, branch_name: str, base_branch: str, checkout_path: Path) -> dict[str, object]:
    run(["git", "fetch", "origin", base_branch], cwd=checkout_path)

    created = False
    if local_branch_exists(checkout_path, branch_name):
        run(["git", "checkout", branch_name], cwd=checkout_path)
    elif remote_branch_exists(checkout_path, branch_name):
        run(["git", "checkout", "-B", branch_name, "--track", f"origin/{branch_name}"], cwd=checkout_path)
    else:
        run(["git", "checkout", "-B", branch_name, f"origin/{base_branch}"], cwd=checkout_path)
        created = True

    if not remote_branch_exists(checkout_path, branch_name):
        run(["git", "push", "-u", "origin", branch_name], cwd=checkout_path)

    code_repo = get_checkout_repo(checkout_path)
    marker = "<!-- xflow:branch-link -->"
    upsert_issue_comment(
        issue_repo,
        issue_number,
        marker,
        f"Linked branch: `{branch_name}`\n\nCode repo: `{code_repo}`\nBase branch: `{base_branch}`\nCheckout: `{checkout_path}`",
    )
    return {
        "branch_name": branch_name,
        "base_branch": base_branch,
        "created": created,
        "code_repo": code_repo,
    }


def main() -> int:
    args = parse_args()
    issue_repo = resolve_issue_repo(args)
    scaffold_change_workspace(args)
    status_path, status = load_status(args.project_root, args.change_id)
    assert_stage_transition_allowed(status.get("current_stage"), "plan", current_status=status.get("status"))
    assert_status_transition_allowed(status.get("status"), "active")

    issue_body = load_issue_body(args)
    checkout_path = resolve_code_checkout(args.checkout_path, args.project_root)
    enforce_as_xflow_openissue_contract(issue_repo, args.title, issue_body, checkout_path)
    issue = create_or_update_issue(issue_repo, args.title, issue_body, args.issue_number)
    issue_number = int(issue["number"])
    issue_url = str(issue["url"])
    base_branch = args.base_branch or get_checkout_default_branch(checkout_path)
    branch_name = args.branch_name or f"issue-{issue_number}-{slugify(args.change_id)}"
    branch_result = ensure_linked_branch(issue_repo, issue_number, branch_name, base_branch, checkout_path)
    hydrate_change_docs(args.project_root, args.change_id, str(issue.get("title") or args.title or args.change_id), issue_body, branch_result["branch_name"])
    discovered_project = discover_project_from_issue(issue_repo, issue_number)

    record_value_transition(status, "status", "active", reason="openissue prepared the change for tracked execution")
    record_stage_transition(status, "plan", reason="openissue prepared linked issue and branch")
    status["archival_status"] = "not_ready"
    status["target_repo"] = issue_repo
    status["issue_repo"] = issue_repo
    status["code_repo"] = branch_result["code_repo"]
    status["issue_number"] = issue_number
    status["issue_url"] = issue_url
    status["issue_title"] = issue.get("title") or args.title or args.change_id
    status["branch_name"] = branch_result["branch_name"]
    status["base_branch"] = branch_result["base_branch"]
    status["checkout_path"] = str(checkout_path)
    status["issue_language"] = "zh-CN"
    status["next_action"] = "Continue with xflow:yolo or xflow:corps from the frozen plan."
    status["issue_prepared_at"] = now_iso()
    if discovered_project:
        status["project_context"] = discovered_project
    save_status(status_path, status)
    doctor_result = None
    if not args.skip_doctor_postcheck:
        doctor_result = run_doctor_checks(
            project_root=args.project_root,
            change_id=args.change_id,
            repo=issue_repo,
            issue_number=issue_number,
            branch_name=branch_result["branch_name"],
            checkout_path_override=checkout_path,
        )
        if not doctor_result["ok"]:
            raise SystemExit("Doctor postcheck failed after openissue setup. Run doctor.py for details.")

    result = {
        "change_id": args.change_id,
        "repo": issue_repo,
        "issue_repo": issue_repo,
        "code_repo": branch_result["code_repo"],
        "issue_number": issue_number,
        "issue_url": issue_url,
        "branch_name": branch_result["branch_name"],
        "base_branch": branch_result["base_branch"],
        "checkout_path": str(checkout_path),
        "status_path": maybe_relative(status_path, base=args.project_root),
    }
    if discovered_project:
        result["project_context"] = discovered_project
    if doctor_result is not None:
        result["doctor"] = {"ok": doctor_result["ok"], "hard_failures": doctor_result["hard_failures"], "warnings": doctor_result["warnings"]}
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(f"Prepared change {args.change_id}")
        print(f"Issue: {issue_repo}#{issue_number} {issue_url}")
        print(f"Branch: {branch_result['branch_name']} (base: {branch_result['base_branch']})")
        print(f"Checkout: {checkout_path}")
        print(f"Status: {status_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
