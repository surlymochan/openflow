#!/usr/bin/env python3
"""B6b.lookback.digest — Lookback sources list. Delegates to lookback_digest.py."""
import sys, os, subprocess

def main():
    script = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'lookback', 'scripts', 'lookback_digest.py'))
    result = subprocess.run([sys.executable, script] + sys.argv[1:])
    sys.exit(result.returncode)

if __name__ == '__main__':
    main()
