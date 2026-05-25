#!/usr/bin/env python3
"""
A2.branch.create_and_link — Create branch and link to issue.
Delegates to open_issue_flow.py with --branch-only flag (if supported)
or as part of the full issue flow.
"""
import sys, os, json, subprocess
from pathlib import Path

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
        if status_path.exists():
            try:
                status = json.loads(status_path.read_text())
                if status.get("issue_number") and status.get("branch_name") and status.get("checkout_path"):
                    print(json.dumps({
                        "ok": True,
                        "skipped": True,
                        "reason": "branch_already_prepared",
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
