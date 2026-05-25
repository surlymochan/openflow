#!/usr/bin/env python3
"""K5.archive.publish — Standalone terminal status helper, not the workflow archive publisher."""
import sys, os, json, argparse
from datetime import datetime, timezone
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'scripts'))
from common import load_status, save_status

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--project-root', default='.')
    p.add_argument('--change-id', required=True)
    args = p.parse_args()

    path, status = load_status(args.project_root, args.change_id)
    status['archival_status'] = 'archived'
    status['archived_at'] = datetime.now(timezone.utc).isoformat()
    save_status(path, status)
    print(json.dumps({'ok': True, 'archived_at': status['archived_at']}))

if __name__ == '__main__':
    main()
