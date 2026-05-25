#!/usr/bin/env python3
"""K2.merge_snippets.apply — Standalone merge-snippets-only helper. Delegates to archive_change.py."""
import sys, os, subprocess

def main():
    script = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'archive', 'scripts', 'archive_change.py'))
    result = subprocess.run([sys.executable, script, '--merge-snippets-only'] + sys.argv[1:])
    sys.exit(result.returncode)

if __name__ == '__main__':
    main()
