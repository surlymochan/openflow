#!/usr/bin/env python3
"""K3.handoff.refresh — Refresh HANDOFF.md. Delegates to B4 via scaffold_handoff.py."""
import sys, os, subprocess

def main():
    script = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'handoff', 'scripts', 'scaffold_handoff.py'))
    result = subprocess.run([sys.executable, script, '--refresh'] + sys.argv[1:])
    # scaffold_handoff.py may not support --refresh; fallback to re-scaffold
    if result.returncode != 0:
        result = subprocess.run([sys.executable, script] + sys.argv[1:])
    sys.exit(result.returncode)

if __name__ == '__main__':
    main()
