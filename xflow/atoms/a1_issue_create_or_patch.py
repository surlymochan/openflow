#!/usr/bin/env python3
"""
A1.issue.create_or_patch — GitHub issue create or patch.
Delegates to open_issue_flow.py. Accepts same CLI args.
"""
import sys, os, json, subprocess
from pathlib import Path

def cli_value(flag):
    argv = sys.argv[1:]
    for index, arg in enumerate(argv):
        if arg == flag and index + 1 < len(argv):
            return argv[index + 1]
    return None

def load_body_from_cli():
    body_file = cli_value("--body-file")
    if body_file:
        return Path(body_file).expanduser().read_text(encoding="utf-8")
    return cli_value("--body")

def ensure_issue_doc(project_root, change_id):
    body = load_body_from_cli()
    if not body:
        return False
    change_root = Path(project_root).expanduser().resolve() / "specs" / "changes" / change_id
    change_root.mkdir(parents=True, exist_ok=True)
    title = cli_value("--title") or change_id
    issue_path = change_root / "issue.md"
    issue_path.write_text(f"# {title}\n\n{body.strip()}\n", encoding="utf-8")
    return True

def main():
    project_root = "."
    change_id = None
    for index, arg in enumerate(sys.argv[1:]):
        if arg == "--project-root" and index + 2 <= len(sys.argv[1:]):
            project_root = sys.argv[index + 2]
        elif arg == "--change-id" and index + 2 <= len(sys.argv[1:]):
            change_id = sys.argv[index + 2]

    if change_id:
        status_path = Path(project_root).expanduser().resolve() / "specs" / "changes" / change_id / "status.json"
        issue_path = status_path.parent / "issue.md"
        if status_path.exists():
            try:
                status = json.loads(status_path.read_text())
                if status.get("issue_number") and status.get("branch_name") and status.get("checkout_path"):
                    if not issue_path.exists():
                        ensure_issue_doc(project_root, change_id)
                    if not issue_path.exists():
                        raise RuntimeError("issue.md is still missing for prepared issue")
                    print(json.dumps({
                        "ok": True,
                        "skipped": True,
                        "reason": "issue_already_prepared",
                        "issue_number": status.get("issue_number"),
                        "branch_name": status.get("branch_name"),
                        "checkout_path": status.get("checkout_path"),
                    }))
                    return
            except Exception:
                pass

    script = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'openissue', 'scripts', 'open_issue_flow.py'))
    result = subprocess.run([sys.executable, script] + sys.argv[1:])
    sys.exit(result.returncode)

if __name__ == '__main__':
    main()
