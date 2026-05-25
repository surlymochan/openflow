#!/usr/bin/env python3
"""
E6.gate.local_precheck — Atom entry point.
Single source of truth for all deterministic phase gate checks.
Wraps yolo_gate.py verbatim. Both yolo driver and agentos heavy workflow
route through this script for structural checks.

E6 ≡ E1+E2 invariant: agentos's local-workflow.js must NOT re-implement
these checks; it must shell out here.
"""
import sys
import os
import subprocess

def main():
    # Forward all args to the real implementation
    script = os.path.join(os.path.dirname(__file__), '..', 'yolo', 'scripts', 'yolo_gate.py')
    script = os.path.abspath(script)
    result = subprocess.run([sys.executable, script] + sys.argv[1:])
    sys.exit(result.returncode)

if __name__ == '__main__':
    main()
