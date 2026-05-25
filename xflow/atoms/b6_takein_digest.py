#!/usr/bin/env python3
"""B6.takein.digest — Session rehydration digest. Delegates to takein_digest.py."""
import sys, os, subprocess

def main():
    script = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'takein', 'scripts', 'takein_digest.py'))
    result = subprocess.run([sys.executable, script] + sys.argv[1:])
    sys.exit(result.returncode)

if __name__ == '__main__':
    main()
