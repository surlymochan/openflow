#!/usr/bin/env python3
"""B5.aha.append — Append AHA entry. Delegates to append_aha.py."""
import sys, os, subprocess

def main():
    script = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'aha', 'scripts', 'append_aha.py'))
    result = subprocess.run([sys.executable, script] + sys.argv[1:])
    sys.exit(result.returncode)

if __name__ == '__main__':
    main()
