#!/usr/bin/env python3
"""
C1.mem — Opaque personal/global memory atom.
Passes all arguments through to mem.sh verbatim.
cli-use-memory directory structure is NOT modified by this atom.
"""
import json
import os
import subprocess
import sys


def candidate_mem_scripts():
    env_script = os.environ.get('XMEM_MEM_SH')
    if env_script:
        yield env_script

    here = os.path.dirname(__file__)
    yield os.path.abspath(os.path.join(here, '..', '..', '..', 'as-xmem', 'mem.sh'))

    home = os.path.expanduser('~')
    for target in (
        '.agents/skills/xmem/mem.sh',
        '.codex/skills/xmem/mem.sh',
        '.claude/skills/xmem/mem.sh',
        '.hermes/skills/xmem/mem.sh',
        '.openclaw/skills/xmem/mem.sh',
        '.config/opencode/skills/xmem/mem.sh',
    ):
        yield os.path.join(home, target)


def find_mem_script():
    for script in candidate_mem_scripts():
        if script and os.path.isfile(script):
            return script
    return None

def main():
    script = find_mem_script()
    if not script:
        print(json.dumps({
            'ok': True,
            'atom': 'C1.mem',
            'skipped': True,
            'reason': 'xmem mem.sh not found; install xmem to enable shared-memory persistence',
        }))
        return 0

    result = subprocess.run(['bash', script] + sys.argv[1:])
    return result.returncode

if __name__ == '__main__':
    sys.exit(main())
