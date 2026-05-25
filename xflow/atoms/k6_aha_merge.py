#!/usr/bin/env python3
"""
K6.aha.merge — Merge durable insights from change workspace into root AHA.md.
Reads specs/changes/<id>/merge-aha.md if present and appends unique entries.
Idempotent: uses date+title as dedup key.
"""
import sys, os, json, argparse, re
from datetime import datetime, timezone

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--project-root', default='.')
    p.add_argument('--change-id', required=True)
    args = p.parse_args()

    aha_path = os.path.join(args.project_root, 'AHA.md')
    merge_source = os.path.join(args.project_root, 'specs', 'changes', args.change_id, 'merge-aha.md')

    if not os.path.exists(merge_source):
        print(json.dumps({'ok': True, 'merged': 0, 'message': 'No merge-aha.md found, skipping'}))
        sys.exit(0)

    merge_content = open(merge_source).read().strip()
    if not merge_content:
        print(json.dumps({'ok': True, 'merged': 0, 'message': 'merge-aha.md is empty'}))
        sys.exit(0)

    existing = open(aha_path).read() if os.path.exists(aha_path) else ''

    # Simple dedup: check if the first line of merge_content already appears in AHA.md
    first_line = merge_content.splitlines()[0]
    if first_line in existing:
        print(json.dumps({'ok': True, 'merged': 0, 'message': 'Entry already present (dedup by first line)'}))
        sys.exit(0)

    with open(aha_path, 'a') as f:
        f.write(f'\n\n{merge_content}\n')

    print(json.dumps({'ok': True, 'merged': 1, 'aha_path': aha_path}))

if __name__ == '__main__':
    main()
