#!/usr/bin/env python3
"""A4.project.set_status — Move GitHub project item to target status. Delegates to set_issue_in_progress.py."""
import sys, os, subprocess

def main():
    script = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'exec', 'scripts', 'set_issue_in_progress.py'))
    result = subprocess.run([sys.executable, script] + sys.argv[1:])
    sys.exit(result.returncode)

if __name__ == '__main__':
    main()
