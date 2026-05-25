#!/usr/bin/env python3
"""
I6b.tdd.proof_validate — Validate TDD proof structure and semantics.
Required fields: phase, attempt, command, exit_code, passed, recorded_at.
Red must prove a failing test. Green/refactor must prove passing tests.
"""
import sys, os, json, argparse

REQUIRED_FIELDS = ['phase', 'attempt', 'command', 'exit_code', 'passed', 'recorded_at']

def expected_result(phase: str):
    if phase == 'red':
        return False
    if phase in {'green', 'refactor', 'run'}:
        return True
    return None

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--project-root', default='.')
    p.add_argument('--change-id', required=True)
    p.add_argument('--phase', default='run')
    p.add_argument('--attempt', type=int, default=0)
    args = p.parse_args()

    proof_file = os.path.join(
        args.project_root, 'specs', 'changes', args.change_id, 'tdd',
        f'{args.phase}-{args.attempt}.json'
    )

    if not os.path.exists(proof_file):
        print(json.dumps({'ok': False, 'verdict': 'missing', 'file': proof_file}))
        sys.exit(1)

    try:
        proof = json.loads(open(proof_file).read())
    except json.JSONDecodeError as e:
        print(json.dumps({'ok': False, 'verdict': 'invalid_json', 'error': str(e)}))
        sys.exit(1)

    missing = [f for f in REQUIRED_FIELDS if f not in proof]
    if missing:
        print(json.dumps({'ok': False, 'verdict': 'schema_error', 'missing_fields': missing}))
        sys.exit(1)

    if proof.get('phase') != args.phase:
        print(json.dumps({
            'ok': False,
            'verdict': 'phase_mismatch',
            'expected_phase': args.phase,
            'actual_phase': proof.get('phase'),
        }))
        sys.exit(1)

    expected_passed = expected_result(args.phase)
    if expected_passed is not None and proof.get('passed') is not expected_passed:
        print(json.dumps({
            'ok': False,
            'verdict': 'semantic_error',
            'phase': args.phase,
            'expected_passed': expected_passed,
            'actual_passed': proof.get('passed'),
        }))
        sys.exit(1)

    if proof.get('expectation_met') is False:
        print(json.dumps({'ok': False, 'verdict': 'expectation_not_met', 'phase': args.phase}))
        sys.exit(1)

    print(json.dumps({'ok': True, 'verdict': 'valid', 'proof_file': proof_file,
                      'passed': proof['passed'], 'exit_code': proof['exit_code']}))

if __name__ == '__main__':
    main()
