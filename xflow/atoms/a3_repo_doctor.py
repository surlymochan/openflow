#!/usr/bin/env python3
"""A3.repo.doctor — Consistency check. Delegates to doctor.py."""
import sys, os, subprocess

def main():
    script = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'scripts', 'doctor.py'))
    result = subprocess.run([sys.executable, script] + sys.argv[1:])
    sys.exit(result.returncode)

if __name__ == '__main__':
    main()
