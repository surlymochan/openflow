#!/usr/bin/env python3
"""
I6a.tdd.run — Deterministic test runner harness.
Runs a test command, captures exit code + truncated stdout,
writes proof to specs/changes/<id>/tdd/<phase>-<n>.json.
The harness is deterministic and records whether the raw test result met the
phase expectation. Red expects a failing test; green/refactor expect passing tests.
"""
import sys, os, json, argparse, subprocess, time
from datetime import datetime, timezone

def default_expectation(phase: str) -> str:
    return 'fail' if phase == 'red' else 'pass'

def expectation_met(expect: str, passed: bool) -> bool:
    if expect == 'fail':
        return not passed
    return passed

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--project-root', default='.')
    p.add_argument('--change-id', required=True)
    p.add_argument('--test-command', required=True, help='Test command to run')
    p.add_argument('--phase', default='run', help='red | green | refactor | run')
    p.add_argument('--attempt', type=int, default=0)
    p.add_argument('--expect', choices=['pass', 'fail'], help='Expected raw test result')
    args = p.parse_args()
    expect = args.expect or default_expectation(args.phase)

    proof_dir = os.path.join(args.project_root, 'specs', 'changes', args.change_id, 'tdd')
    os.makedirs(proof_dir, exist_ok=True)

    start = time.time()
    try:
        result = subprocess.run(
            args.test_command,
            shell=True,
            capture_output=True,
            text=True,
            cwd=args.project_root,
            timeout=300,
        )
        elapsed = time.time() - start
        proof = {
            'phase': args.phase,
            'attempt': args.attempt,
            'command': args.test_command,
            'exit_code': result.returncode,
            'passed': result.returncode == 0,
            'expected': expect,
            'expectation_met': expectation_met(expect, result.returncode == 0),
            'stdout_tail': result.stdout[-2000:] if result.stdout else '',
            'stderr_tail': result.stderr[-1000:] if result.stderr else '',
            'elapsed_s': round(elapsed, 2),
            'recorded_at': datetime.now(timezone.utc).isoformat(),
        }
    except subprocess.TimeoutExpired:
        proof = {
            'phase': args.phase,
            'attempt': args.attempt,
            'command': args.test_command,
            'exit_code': -1,
            'passed': False,
            'expected': expect,
            'expectation_met': expectation_met(expect, False),
            'stdout_tail': '',
            'stderr_tail': 'TIMEOUT after 300s',
            'elapsed_s': 300,
            'recorded_at': datetime.now(timezone.utc).isoformat(),
        }

    proof_file = os.path.join(proof_dir, f'{args.phase}-{args.attempt}.json')
    with open(proof_file, 'w') as f:
        json.dump(proof, f, indent=2)

    print(json.dumps({
        'ok': proof['expectation_met'],
        'proof_file': proof_file,
        'exit_code': proof['exit_code'],
        'expected': expect,
        'passed': proof['passed'],
    }))
    sys.exit(0 if proof['expectation_met'] else 1)

if __name__ == '__main__':
    main()
