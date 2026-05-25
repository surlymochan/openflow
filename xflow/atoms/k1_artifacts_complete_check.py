#!/usr/bin/env python3
"""K1.artifacts.complete_check — Verify required change artifacts exist and are non-empty."""
import sys, os, json, argparse

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--project-root', default='.')
    p.add_argument('--change-id', required=True)
    p.add_argument('--change-type', default='backend')
    args = p.parse_args()

    change_dir = os.path.join(args.project_root, 'specs', 'changes', args.change_id)
    required = ['proposal.md', 'plan.md', 'tasks.md', 'status.json']
    if args.change_type in ('frontend', 'full-stack'):
        required.append('design.md')

    missing = []
    empty = []
    for fname in required:
        fpath = os.path.join(change_dir, fname)
        if not os.path.exists(fpath):
            missing.append(fname)
        elif os.path.getsize(fpath) < 20:
            empty.append(fname)

    ok = len(missing) == 0 and len(empty) == 0
    result = {
        'ok': ok,
        'atom': 'K1.artifacts.complete_check',
        'verdict': 'pass' if ok else 'fail',
        'missing': missing,
        'too_short': empty,
        'change_dir': change_dir,
    }
    print(json.dumps(result))
    sys.exit(0 if ok else 1)

if __name__ == '__main__':
    main()
