#!/usr/bin/env python3
"""
I6a.tdd.run — Deterministic test runner harness.
Runs a test command, captures exit code + truncated stdout,
writes proof to specs/changes/<id>/tdd/<phase>-<n>.json.

The harness is deterministic and records whether the raw test result met the
phase expectation. Red expects a failing test; green/refactor expect passing tests.
The proof also binds a snapshot of the tree so I6b can recompute the digest
and re-run the command.
"""
import sys, os, json, argparse, subprocess, time
from datetime import datetime, timezone
from pathlib import Path

import tdd_lib


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
    project = Path(args.project_root).resolve()

    proof_dir = os.path.join(args.project_root, 'specs', 'changes', args.change_id, 'tdd')
    os.makedirs(proof_dir, exist_ok=True)

    start = time.time()
    timed_out = False
    try:
        result = subprocess.run(
            args.test_command,
            shell=True,
            capture_output=True,
            text=True,
            cwd=args.project_root,
            timeout=300,
            env=tdd_lib.test_env(),
        )
        elapsed = time.time() - start
        stdout = result.stdout or ''
        stderr = result.stderr or ''
        exit_code = result.returncode
    except subprocess.TimeoutExpired:
        timed_out = True
        elapsed = 300
        stdout = ''
        stderr = 'TIMEOUT after 300s'
        exit_code = -1

    passed = exit_code == 0
    combined = f"{stdout}\n{stderr}"
    file_hashes = tdd_lib.write_snapshot(project, args.change_id, args.phase, args.attempt)
    proof = {
        'phase': args.phase,
        'attempt': args.attempt,
        'command': args.test_command,
        'exit_code': exit_code,
        'passed': passed,
        'expected': expect,
        'expectation_met': expectation_met(expect, False if timed_out else passed),
        'stdout_tail': stdout[-2000:] if stdout else '',
        'stderr_tail': stderr[-1000:] if stderr else '',
        'elapsed_s': round(elapsed, 2),
        'output_sha256': tdd_lib.output_digest(stdout, stderr),
        'git_head': tdd_lib.git_head(project),
        'file_hashes': file_hashes,
        'failure_kind': 'timeout' if timed_out else tdd_lib.classify_output(combined, passed),
        'recorded_at': datetime.now(timezone.utc).isoformat(),
    }
    proof['binding'] = tdd_lib.compute_binding(proof)

    proof_file = os.path.join(proof_dir, f'{args.phase}-{args.attempt}.json')
    with open(proof_file, 'w') as f:
        json.dump(proof, f, indent=2)
        f.write('\n')

    print(json.dumps({
        'ok': proof['expectation_met'],
        'proof_file': proof_file,
        'exit_code': proof['exit_code'],
        'expected': expect,
        'passed': proof['passed'],
        'failure_kind': proof['failure_kind'],
        'binding': proof['binding'],
    }))
    sys.exit(0 if proof['expectation_met'] else 1)

if __name__ == '__main__':
    main()
