#!/usr/bin/env python3
"""
A6.pr.create — Open a PR from issue branch against base.
Uses gh pr create. Reads change context from status.json.
"""
import sys, os, json, argparse, subprocess
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'scripts'))
from common import load_status

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--project-root', default='.')
    p.add_argument('--change-id', required=True)
    p.add_argument('--base-branch', default='main')
    p.add_argument('--draft', action='store_true')
    args = p.parse_args()

    _, status = load_status(args.project_root, args.change_id)
    repo = status.get('code_repo', '')
    branch = status.get('branch_name', '')
    issue_num = status.get('issue_number')
    issue_repo = status.get('issue_repo') or status.get('target_repo') or repo
    issue_url = status.get('issue_url')
    title = status.get('title', args.change_id)
    checkout_path = status.get('checkout_path') or args.project_root

    if not repo or not branch:
        print(json.dumps({'ok': False, 'error': 'Missing code_repo or branch_name in status.json'}))
        sys.exit(1)

    if issue_url:
        body = f'Tracks {issue_url}'
    elif issue_num and issue_repo and issue_repo != repo:
        body = f'Tracks {issue_repo}#{issue_num}'
    else:
        body = f'Closes #{issue_num}' if issue_num else ''
    cmd = ['gh', 'pr', 'create',
           '--repo', repo,
           '--head', branch,
           '--base', args.base_branch,
           '--title', title,
           '--body', body]
    if args.draft:
        cmd.append('--draft')

    result = subprocess.run(cmd, cwd=checkout_path, capture_output=True, text=True)
    if result.returncode != 0:
        # PR may already exist
        stderr = result.stderr or ''
        if 'already exists' in stderr:
            view = subprocess.run(
                ['gh', 'pr', 'view', '--repo', repo, '--json', 'url', '--head', branch],
                cwd=checkout_path,
                capture_output=True,
                text=True,
            )
            pr_url = None
            if view.returncode == 0 and view.stdout.strip():
                try:
                    pr_url = json.loads(view.stdout).get('url')
                except Exception:
                    pr_url = None
            print(json.dumps({'ok': True, 'message': 'PR already exists', 'pr_url': pr_url}))
            sys.exit(0)
        print(json.dumps({'ok': False, 'error': stderr}))
        sys.exit(1)

    pr_url = result.stdout.strip()
    print(json.dumps({'ok': True, 'pr_url': pr_url}))

if __name__ == '__main__':
    main()
