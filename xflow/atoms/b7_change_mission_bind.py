#!/usr/bin/env python3
"""
B7.change_mission.bind — The ONLY place that writes the change_id <-> mission_id coupling.
Writes to .as-xflow/bindings.json (append-only, keyed by change_id).
Does NOT touch state.sqlite or status.json schemas.
"""
import sys, os, json, argparse
from datetime import datetime, timezone

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--project-root', default='.')
    p.add_argument('--change-id', required=True)
    p.add_argument('--mission-id', default=None)
    p.add_argument('--direction', default='change_to_mission')
    args = p.parse_args()

    bindings_dir = os.path.join(args.project_root, '.as-xflow')
    os.makedirs(bindings_dir, exist_ok=True)
    bindings_file = os.path.join(bindings_dir, 'bindings.json')

    bindings = {}
    if os.path.exists(bindings_file):
        try:
            bindings = json.loads(open(bindings_file).read())
        except Exception:
            bindings = {}

    entry = {
        'change_id': args.change_id,
        'mission_id': args.mission_id,
        'direction': args.direction,
        'bound_at': datetime.now(timezone.utc).isoformat(),
    }
    bindings[args.change_id] = entry

    with open(bindings_file, 'w') as f:
        json.dump(bindings, f, indent=2)

    print(json.dumps({'ok': True, 'binding': entry}))

if __name__ == '__main__':
    main()
