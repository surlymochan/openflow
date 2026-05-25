#!/usr/bin/env python3
"""B2b.status.write — Merge fields into status.json."""
import sys, os, json, argparse
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'scripts'))
from common import load_status, save_status

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--project-root', default='.')
    p.add_argument('--change-id', required=True)
    p.add_argument('--fields', required=True, help='JSON object of fields to merge')
    args = p.parse_args()
    fields = json.loads(args.fields)
    path, status = load_status(args.project_root, args.change_id)
    status.update(fields)
    save_status(path, status)
    print(json.dumps({'ok': True, 'updated': list(fields.keys())}))

if __name__ == '__main__':
    main()
