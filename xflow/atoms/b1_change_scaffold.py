#!/usr/bin/env python3
"""B1.change.scaffold — Initialize specs/changes/<change_id>/. Delegates to scaffold_specs_change.py."""
import sys, os, subprocess

def main():
    script = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'yolo', 'scripts', 'scaffold_specs_change.py'))
    result = subprocess.run([sys.executable, script] + sys.argv[1:])
    sys.exit(result.returncode)

if __name__ == '__main__':
    main()
