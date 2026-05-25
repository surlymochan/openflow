#!/usr/bin/env python3
"""A5.archive.commit_push_close — Commit, push branch, close issue, mark project Done. Delegates to archive_change.py."""
import sys, os, subprocess

def main():
    script = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'archive', 'scripts', 'archive_change.py'))
    result = subprocess.run([sys.executable, script] + sys.argv[1:])
    sys.exit(result.returncode)

if __name__ == '__main__':
    main()
