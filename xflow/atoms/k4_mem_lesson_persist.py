#!/usr/bin/env python3
"""K4.mem.lesson_persist — Persist a lesson to cli-use-memory project scope. Delegates to C1.mem."""
import sys, os, subprocess, argparse, json

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
    p = argparse.ArgumentParser()
    p.add_argument('--project-root', default='.')
    p.add_argument('--change-id', default=None)
    p.add_argument('--lesson', default='')
    p.add_argument('--context', default='')
    args = p.parse_args()

    lesson = (args.lesson or '').strip()
    if not lesson or lesson.startswith('${'):
        print(json.dumps({
            'ok': True,
            'atom': 'K4.mem.lesson_persist',
            'skipped': True,
            'reason': 'no lesson provided'
        }))
        return 0

    mem_sh = find_mem_script()
    if not mem_sh:
        print(json.dumps({
            'ok': True,
            'atom': 'K4.mem.lesson_persist',
            'skipped': True,
            'reason': 'xmem mem.sh not found; install xmem to enable lesson persistence'
        }))
        return 0

    content = f'{lesson}'
    if args.context:
        content += f'\nContext: {args.context}'
    result = subprocess.run(['bash', mem_sh, 'lesson:project', content])
    return result.returncode

if __name__ == '__main__':
    sys.exit(main())
