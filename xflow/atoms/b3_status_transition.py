#!/usr/bin/env python3
"""B3.status.transition — Assert and record a stage/status transition."""
import sys, os, json, argparse
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'scripts'))
from common import load_status, save_status, record_stage_transition

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--project-root', default='.')
    p.add_argument('--change-id', required=True)
    p.add_argument('--to-stage')
    p.add_argument('--to-status')
    p.add_argument('--reason', default='workflow-advance')
    args = p.parse_args()

    path, status = load_status(args.project_root, args.change_id)

    if args.to_stage:
        record_stage_transition(status, args.to_stage, reason=args.reason)
    if args.to_status:
        status['status'] = args.to_status

    save_status(path, status)
    print(json.dumps({'ok': True, 'stage': status.get('current_stage'), 'status': status.get('status')}))

if __name__ == '__main__':
    main()
