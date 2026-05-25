#!/usr/bin/env python3
"""B4.handoff.scaffold_or_refresh — Create/refresh HANDOFF.md. Delegates to scaffold_handoff.py."""
import sys, os, subprocess

def main():
    script = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'handoff', 'scripts', 'scaffold_handoff.py'))
    result = subprocess.run([sys.executable, script] + sys.argv[1:])
    sys.exit(result.returncode)

if __name__ == '__main__':
    main()
