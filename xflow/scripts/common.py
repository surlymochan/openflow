#!/usr/bin/env python3
import json
import os
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


PROJECT_SEARCH_ROOTS = [
    Path.home() / "workspace/project/private",
    Path.home() / "workspace/project/public",
    Path.home() / "workspace/project/third-party",
    Path.home() / "Documents/workspace/project/private",
    Path.home() / "Documents/workspace/project/public",
    Path.home() / "Documents/workspace/project/third-party",
]


ALLOWED_STAGE_TRANSITIONS: dict[str, set[str]] = {
    "change-init": {"change-init", "design-check", "brainstorm", "proposal-freeze", "proposal-consistency-check", "plan"},
    "design-check": {"design-check", "brainstorm", "proposal-freeze", "proposal-consistency-check", "plan"},
    "brainstorm": {"brainstorm", "proposal-freeze", "proposal-consistency-check", "plan"},
    "proposal-freeze": {"proposal-freeze", "proposal-consistency-check", "plan"},
    "proposal-consistency-check": {"proposal-consistency-check", "plan"},
    "plan": {"plan", "tdd"},
    "openissue": {"openissue", "tdd"},
    "tdd": {"tdd", "execute", "verify"},
    "execute": {"execute", "tdd", "verify"},
    "verify": {"verify", "tdd", "execute", "archive"},
    "archive": {"archive"},
}

ALLOWED_STATUS_TRANSITIONS: dict[str, set[str]] = {
    "draft": {"draft", "active", "blocked"},
    "active": {"active", "done", "blocked"},
    "blocked": {"blocked", "active", "done"},
    "done": {"done"},
}


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = re.sub(r"-{2,}", "-", value)
    return value.strip("-") or "change"


def run(cmd: list[str], *, cwd: str | Path | None = None, capture_output: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        cwd=str(cwd) if cwd else None,
        check=True,
        text=True,
        capture_output=capture_output,
    )


def run_stdout(cmd: list[str], *, cwd: str | Path | None = None) -> str:
    return run(cmd, cwd=cwd).stdout.strip()


def gh_json(args: list[str], *, cwd: str | Path | None = None) -> Any:
    output = run_stdout(["gh", *args], cwd=cwd)
    return json.loads(output)


def gh_graphql(query: str, variables: dict[str, Any] | None = None) -> Any:
    cmd = ["gh", "api", "graphql", "-f", f"query={query}"]
    for key, value in (variables or {}).items():
        if isinstance(value, bool):
            cmd.extend(["-F", f"{key}={'true' if value else 'false'}"])
        else:
            cmd.extend(["-F", f"{key}={value}"])
    output = run_stdout(cmd)
    return json.loads(output)


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(read_text(path))


def write_json(path: Path, data: dict[str, Any]) -> None:
    write_text(path, json.dumps(data, indent=2) + "\n")


def _is_allowed_transition(mapping: dict[str, set[str]], current_value: str | None, target_value: str) -> bool:
    if not current_value:
        return False
    allowed = mapping.get(current_value)
    if not allowed:
        return False
    return target_value in allowed


def is_allowed_stage_transition(current_stage: str | None, target_stage: str) -> bool:
    return _is_allowed_transition(ALLOWED_STAGE_TRANSITIONS, current_stage, target_stage)


def is_allowed_status_transition(current_status: str | None, target_status: str) -> bool:
    return _is_allowed_transition(ALLOWED_STATUS_TRANSITIONS, current_status, target_status)


def assert_stage_transition_allowed(
    current_stage: str | None,
    target_stage: str,
    *,
    current_status: str | None = None,
    allow_terminal_status_override: tuple[str, ...] = (),
) -> None:
    if current_status in allow_terminal_status_override:
        return
    if not is_allowed_stage_transition(current_stage, target_stage):
        raise SystemExit(
            f"Illegal Superflow stage transition: {current_stage!r} -> {target_stage!r}. "
            "Update status.json through the canonical workflow order instead of skipping phases."
        )


def assert_status_transition_allowed(
    current_status: str | None,
    target_status: str,
    *,
    allow_terminal_status_override: tuple[str, ...] = (),
) -> None:
    if current_status in allow_terminal_status_override:
        return
    if not is_allowed_status_transition(current_status, target_status):
        raise SystemExit(
            f"Illegal Superflow status transition: {current_status!r} -> {target_status!r}. "
            "Use the canonical workflow state progression instead of forcing status.json."
        )


def record_stage_transition(status: dict[str, Any], target_stage: str, *, reason: str) -> None:
    current_stage = status.get("current_stage")
    history = status.setdefault("stage_history", [])
    if not isinstance(history, list):
        history = []
        status["stage_history"] = history
    if current_stage != target_stage:
        history.append(
            {
                "from": current_stage,
                "to": target_stage,
                "reason": reason,
                "at": now_iso(),
            }
        )
    status["current_stage"] = target_stage


def record_value_transition(status: dict[str, Any], field: str, target_value: str, *, reason: str) -> None:
    current_value = status.get(field)
    history_field = f"{field}_history"
    history = status.setdefault(history_field, [])
    if not isinstance(history, list):
        history = []
        status[history_field] = history
    if current_value != target_value:
        history.append(
            {
                "from": current_value,
                "to": target_value,
                "reason": reason,
                "at": now_iso(),
            }
        )
    status[field] = target_value


def find_git_root(start: str | Path) -> Path:
    root = run_stdout(["git", "rev-parse", "--show-toplevel"], cwd=start)
    return Path(root)


def get_remote_url(checkout_path: str | Path, remote: str = "origin") -> str:
    return run_stdout(["git", "remote", "get-url", remote], cwd=checkout_path)


def get_current_branch(checkout_path: str | Path) -> str:
    return run_stdout(["git", "branch", "--show-current"], cwd=checkout_path)


def remote_matches_repo(remote_url: str, repo: str) -> bool:
    normalized = remote_url.lower()
    owner_repo = repo.lower()
    return normalized.endswith(f"/{owner_repo}.git") or normalized.endswith(f":{owner_repo}.git") or normalized.endswith(f"/{owner_repo}") or normalized.endswith(f":{owner_repo}")


def ensure_checkout_matches_repo(checkout_path: str | Path, repo: str, remote: str = "origin") -> str:
    remote_url = get_remote_url(checkout_path, remote)
    if not remote_matches_repo(remote_url, repo):
        raise SystemExit(
            f"Checkout remote mismatch: {checkout_path} points {remote} to {remote_url!r}, expected repository {repo!r}."
        )
    return remote_url


def resolve_checkout_path(repo: str, *, preferred: str | Path | None = None, cwd_hint: str | Path | None = None) -> Path:
    candidates: list[Path] = []

    if preferred:
        preferred_path = Path(preferred).expanduser().resolve()
        if not preferred_path.exists():
            raise SystemExit(f"Checkout path does not exist: {preferred_path}")
        candidates.append(preferred_path)

    if cwd_hint:
        try:
            git_root = find_git_root(cwd_hint)
            candidates.append(git_root)
        except subprocess.CalledProcessError:
            pass

    repo_name = repo.split("/", 1)[1]
    for root in PROJECT_SEARCH_ROOTS:
        candidate = root / repo_name
        if candidate.exists():
            candidates.append(candidate.resolve())

    unique_candidates: list[Path] = []
    seen: set[str] = set()
    for candidate in candidates:
        key = str(candidate)
        if key in seen:
            continue
        seen.add(key)
        unique_candidates.append(candidate)

    matches: list[Path] = []
    for candidate in unique_candidates:
        try:
            remote_url = get_remote_url(candidate)
        except subprocess.CalledProcessError:
            continue
        if remote_matches_repo(remote_url, repo):
            matches.append(candidate)

    if not matches:
        raise SystemExit(
            f"Unable to resolve a local checkout for {repo}. Pass --checkout-path explicitly or create a checkout under a standard project root."
        )
    if len(matches) > 1:
        joined = "\n".join(f"- {path}" for path in matches)
        raise SystemExit(f"Multiple local checkouts match {repo}. Pass --checkout-path explicitly:\n{joined}")
    return matches[0]


def ensure_branch_checked_out(checkout_path: str | Path, branch_name: str) -> None:
    current = run_stdout(["git", "branch", "--show-current"], cwd=checkout_path)
    if current == branch_name:
        return
    if local_branch_exists(checkout_path, branch_name):
        run(["git", "checkout", branch_name], cwd=checkout_path)
        return
    if remote_branch_exists(checkout_path, branch_name):
        run(["git", "checkout", "-B", branch_name, "--track", f"origin/{branch_name}"], cwd=checkout_path)
        return
    raise SystemExit(f"Branch not found locally or on origin: {branch_name}")


def local_branch_exists(checkout_path: str | Path, branch_name: str) -> bool:
    result = subprocess.run(
        ["git", "show-ref", "--verify", "--quiet", f"refs/heads/{branch_name}"],
        cwd=str(checkout_path),
        text=True,
        capture_output=True,
    )
    return result.returncode == 0


def remote_branch_exists(checkout_path: str | Path, branch_name: str) -> bool:
    result = subprocess.run(
        ["git", "ls-remote", "--exit-code", "--heads", "origin", branch_name],
        cwd=str(checkout_path),
        text=True,
        capture_output=True,
    )
    return result.returncode == 0


def get_default_branch(repo: str) -> str:
    data = gh_json(["repo", "view", repo, "--json", "defaultBranchRef"])
    default_branch = data.get("defaultBranchRef", {}).get("name")
    if not default_branch:
        raise SystemExit(f"Could not determine default branch for {repo}")
    return default_branch


def upsert_issue_comment(repo: str, issue_number: int, marker: str, body: str) -> int:
    comments = gh_json(["api", f"repos/{repo}/issues/{issue_number}/comments"])
    existing = None
    for comment in comments:
        if marker in comment.get("body", ""):
            existing = comment
            break

    comment_body = f"{marker}\n{body}".strip() + "\n"
    if existing:
        comment_id = existing["id"]
        gh_json(
            [
                "api",
                f"repos/{repo}/issues/comments/{comment_id}",
                "--method",
                "PATCH",
                "-f",
                f"body={comment_body}",
            ]
        )
        return int(comment_id)

    created = gh_json(
        [
            "api",
            f"repos/{repo}/issues/{issue_number}/comments",
            "--method",
            "POST",
            "-f",
            f"body={comment_body}",
        ]
    )
    return int(created["id"])


def discover_project_from_issue(repo: str, issue_number: int) -> dict[str, Any] | None:
    owner, name = repo.split("/", 1)
    query = """
    query($owner:String!, $name:String!, $number:Int!) {
      repository(owner:$owner, name:$name) {
        issue(number:$number) {
          projectItems(first:20) {
            nodes {
              id
              project {
                id
                number
                title
                closed
                owner {
                  __typename
                  login
                }
              }
            }
          }
        }
      }
    }
    """
    try:
        data = gh_graphql(query, {"owner": owner, "name": name, "number": issue_number})
    except subprocess.CalledProcessError:
        return None
    nodes = (((data or {}).get("data") or {}).get("repository") or {}).get("issue", {}).get("projectItems", {}).get("nodes", [])
    open_nodes = [node for node in nodes if not ((node.get("project") or {}).get("closed"))]
    if len(open_nodes) == 1:
        project = open_nodes[0]["project"]
        return {
            "owner": project["owner"]["login"],
            "number": int(project["number"]),
            "title": project["title"],
        }
    return None


def resolve_project_status_components(owner: str, project_number: int, status_field_name: str, option_name: str, repo: str, issue_number: int) -> tuple[str, str, str, str]:
    project = gh_json(["project", "view", str(project_number), "--owner", owner, "--format", "json"])
    project_id = project.get("id")
    if not project_id:
        raise SystemExit(f"Could not resolve project id for {owner} project {project_number}")

    fields = gh_json(["project", "field-list", str(project_number), "--owner", owner, "--format", "json"])
    status_field = next((field for field in fields if field.get("name") == status_field_name), None)
    if not status_field:
        raise SystemExit(f"Project field not found: {status_field_name}")
    field_id = status_field.get("id")
    if not field_id:
        raise SystemExit(f"Project field id missing for {status_field_name}")

    options = status_field.get("options") or []
    option = next((entry for entry in options if entry.get("name") == option_name), None)
    if not option:
        available = ", ".join(entry.get("name", "?") for entry in options)
        raise SystemExit(f"Project option not found: {option_name}. Available: {available}")
    option_id = option.get("id")
    if not option_id:
        raise SystemExit(f"Project option id missing for {option_name}")

    owner_name, repo_name = repo.split("/", 1)
    items = gh_json(["project", "item-list", str(project_number), "--owner", owner, "--format", "json", "--limit", "200"])
    item_id = None
    for item in items:
        content = item.get("content") or {}
        if int(content.get("number", -1)) != int(issue_number):
            continue
        repository = content.get("repository") or {}
        repo_owner = (repository.get("owner") or {}).get("login")
        repo_name_value = repository.get("name")
        if repo_owner == owner_name and repo_name_value == repo_name:
            item_id = item.get("id")
            break

    if not item_id:
        raise SystemExit(f"Project item for issue {repo}#{issue_number} not found in {owner} project {project_number}")
    return (
        project_id if isinstance(project_id, str) else str(project_id),
        field_id if isinstance(field_id, str) else str(field_id),
        option_id if isinstance(option_id, str) else str(option_id),
        item_id if isinstance(item_id, str) else str(item_id),
    )


def set_project_single_select_status(owner: str, project_number: int, status_field_name: str, option_name: str, repo: str, issue_number: int) -> dict[str, str]:
    project_id, field_id, option_id, item_id = resolve_project_status_components(owner, project_number, status_field_name, option_name, repo, issue_number)
    run(
        [
            "gh",
            "project",
            "item-edit",
            "--id",
            item_id,
            "--project-id",
            project_id,
            "--field-id",
            field_id,
            "--single-select-option-id",
            option_id,
        ]
    )
    return {
        "project_id": project_id,
        "item_id": item_id,
        "field_id": field_id,
        "option_id": option_id,
    }


def resolve_project_context(repo: str, issue_number: int, explicit_owner: str | None = None, explicit_number: int | None = None) -> dict[str, Any] | None:
    if explicit_owner and explicit_number:
        return {"owner": explicit_owner, "number": int(explicit_number), "source": "explicit"}
    discovered = discover_project_from_issue(repo, issue_number)
    if discovered:
        discovered["source"] = "issue-project-item"
        return discovered
    return None


def load_status(project_root: str | Path, change_id: str) -> tuple[Path, dict[str, Any]]:
    path = Path(project_root).expanduser().resolve() / "specs" / "changes" / change_id / "status.json"
    if not path.exists():
        raise SystemExit(f"Missing status.json: {path}")
    return path, read_json(path)


def save_status(path: Path, status: dict[str, Any]) -> None:
    status["updated_at"] = now_iso()
    write_json(path, status)


def maybe_relative(path: str | Path, *, base: str | Path) -> str:
    try:
        return str(Path(path).resolve().relative_to(Path(base).resolve()))
    except ValueError:
        return str(Path(path).resolve())
