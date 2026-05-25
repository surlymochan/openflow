#!/usr/bin/env python3
"""
J1.tests.run — Run planned verification commands, capture pass/fail proof.
Reads commands from plan.md (lines starting with ` ``` bash` blocks or --commands arg).
"""
import sys, os, json, argparse, subprocess, re
from datetime import datetime, timezone

def extract_commands_from_plan(plan_path):
    """Extract bash commands from plan.md code blocks."""
    if not os.path.exists(plan_path):
        return []
    content = open(plan_path).read()
    # Find ```bash ... ``` blocks
    blocks = re.findall(r'```bash\n(.*?)```', content, re.DOTALL)
    commands = []
    for block in blocks:
        for line in block.strip().splitlines():
            line = line.strip()
            if line and not line.startswith('#'):
                commands.append(line)
    return commands

def normalize_commands(value):
    if isinstance(value, str):
        command = value.strip()
        return [command] if command else []
    if isinstance(value, list):
        commands = []
        for item in value:
            if isinstance(item, str) and item.strip():
                commands.append(item.strip())
            elif isinstance(item, dict) and isinstance(item.get('command'), str) and item.get('command').strip():
                commands.append(item['command'].strip())
        return commands
    return []

def extract_commands_from_change_contract(project_root, change_id):
    change_dir = os.path.join(project_root, 'specs', 'changes', change_id)
    candidates = [
        'plan.json',
        'corps-input.json',
        'yolo-input.json',
        'input.json',
        'intake.json',
    ]
    command_keys = [
        'verification_commands',
        'test_commands',
        'qa_commands',
        'commands',
    ]
    fallback_keys = [
        'tdd_green_command',
    ]
    for filename in candidates:
        path = os.path.join(change_dir, filename)
        if not os.path.exists(path):
            continue
        try:
            data = json.load(open(path))
        except (OSError, json.JSONDecodeError):
            continue
        for key in command_keys:
            commands = normalize_commands(data.get(key))
            if commands:
                return commands
        for key in fallback_keys:
            commands = normalize_commands(data.get(key))
            if commands:
                return commands
    return []

def verification_command_env():
    env = os.environ.copy()
    # J1's own orchestration change id should not alter the behavior of the
    # verification commands it runs. Commands that need a CHANGE_ID must set it.
    env.pop('CHANGE_ID', None)
    return env

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--project-root', default='.')
    p.add_argument('--change-id', required=True)
    p.add_argument('--commands', nargs='*', help='Explicit commands to run')
    args = p.parse_args()

    commands = args.commands
    if not commands:
        plan_md = os.path.join(args.project_root, 'specs', 'changes', args.change_id, 'plan.md')
        commands = extract_commands_from_plan(plan_md)
    if not commands:
        commands = extract_commands_from_change_contract(args.project_root, args.change_id)

    if not commands:
        print(json.dumps({'ok': False, 'verdict': 'no_commands', 'message': 'No test commands found in plan.md or change contract'}))
        sys.exit(1)

    results = []
    all_passed = True
    command_env = verification_command_env()
    for cmd in commands:
        r = subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=args.project_root, timeout=120, env=command_env)
        passed = r.returncode == 0
        all_passed = all_passed and passed
        results.append({
            'command': cmd,
            'exit_code': r.returncode,
            'passed': passed,
            'stdout_tail': r.stdout[-1000:] if r.stdout else '',
        })

    proof = {
        'all_passed': all_passed,
        'results': results,
        'recorded_at': datetime.now(timezone.utc).isoformat(),
    }

    proof_dir = os.path.join(args.project_root, 'specs', 'changes', args.change_id)
    os.makedirs(proof_dir, exist_ok=True)
    proof_file = os.path.join(proof_dir, 'verify_proof.json')
    with open(proof_file, 'w') as f:
        json.dump(proof, f, indent=2)

    print(json.dumps({'ok': all_passed, 'proof_file': proof_file, 'total': len(results), 'passed': sum(1 for r in results if r['passed'])}))
    sys.exit(0 if all_passed else 1)

if __name__ == '__main__':
    main()
