#!/usr/bin/env python3
"""
I6b.tdd.proof_validate — Validate TDD proof structure, binding, and re-execution.

Required fields: phase, attempt, command, exit_code, passed, recorded_at.
Red must prove a failing test. Green/refactor must prove passing tests.
The binding covers the recorded command, exit code, output hash, failure
class, and snapshot file hashes. This gate recomputes it and re-runs the
command in a copy of that snapshot. Green also requires snapshotted test
files to still match the working tree.

tdd_mode refactor does not require a red proof. tdd_mode docs does not
require a red or green proof. A proof that is present is still checked.
An agent who rebuilds a self-consistent failing snapshot can still produce
a binding that verifies; the check raises the bar from "edit the JSON" to
"possess a tree on which this command really exits as claimed".
"""
import sys, os, json, argparse, subprocess
from pathlib import Path

import tdd_lib

REQUIRED_FIELDS = ['phase', 'attempt', 'command', 'exit_code', 'passed', 'recorded_at']

def expected_result(phase: str):
    if phase == 'red':
        return False
    if phase in {'green', 'refactor', 'run'}:
        return True
    return None

def emit(payload, code):
    print(json.dumps(payload))
    sys.exit(code)

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--project-root', default='.')
    p.add_argument('--change-id', required=True)
    p.add_argument('--phase', default='run')
    p.add_argument('--attempt', type=int, default=0)
    p.add_argument('--tdd-mode', default='', help='red-green | refactor | docs; empty reads status.json')
    args = p.parse_args()

    project = Path(args.project_root).resolve()
    mode = tdd_lib.resolve_tdd_mode(project, args.change_id, args.tdd_mode)
    if mode not in tdd_lib.MODES:
        emit({'ok': False, 'verdict': 'invalid_tdd_mode', 'tdd_mode': mode, 'phase': args.phase}, 1)

    proof_file = os.path.join(
        args.project_root, 'specs', 'changes', args.change_id, 'tdd',
        f'{args.phase}-{args.attempt}.json'
    )

    if not os.path.exists(proof_file):
        if mode == 'docs' or (mode == 'refactor' and args.phase == 'red'):
            emit({
                'ok': True,
                'verdict': 'not_required',
                'phase': args.phase,
                'tdd_mode': mode,
                'file': proof_file,
            }, 0)
        emit({'ok': False, 'verdict': 'missing', 'file': proof_file, 'phase': args.phase, 'tdd_mode': mode}, 1)

    try:
        proof = json.loads(open(proof_file).read())
    except json.JSONDecodeError as e:
        emit({'ok': False, 'verdict': 'invalid_json', 'error': str(e), 'phase': args.phase}, 1)

    missing = [f for f in REQUIRED_FIELDS if f not in proof]
    if missing:
        emit({'ok': False, 'verdict': 'schema_error', 'missing_fields': missing, 'phase': args.phase}, 1)

    if proof.get('phase') != args.phase:
        emit({
            'ok': False,
            'verdict': 'phase_mismatch',
            'expected_phase': args.phase,
            'actual_phase': proof.get('phase'),
            'phase': args.phase,
        }, 1)

    if not proof.get('binding') or not proof.get('failure_kind') or not isinstance(proof.get('file_hashes'), dict):
        emit({'ok': False, 'verdict': 'binding_missing', 'phase': args.phase}, 1)

    if tdd_lib.compute_binding(proof) != proof.get('binding'):
        emit({'ok': False, 'verdict': 'binding_mismatch', 'phase': args.phase}, 1)

    if bool(proof.get('passed')) != (proof.get('exit_code') == 0):
        emit({'ok': False, 'verdict': 'proof_inconsistent', 'phase': args.phase}, 1)

    destination = tdd_lib.snapshot_dir(project, args.change_id, args.phase, args.attempt)
    scope = proof.get('snapshot_scope')
    copy_stats = scope.get('copy_stats') if isinstance(scope, dict) else None
    reread_files: set[str] = set()
    if isinstance(copy_stats, dict) and copy_stats:
        # Stat-anchored check (issue #5, P1-3): the seal already hashed
        # these bytes, so only copies whose stat moved are re-read.
        checked = tdd_lib.verify_hashes_by_stat(destination, proof.get('file_hashes'), copy_stats)
        reread_files.update(checked['reread'])
        if checked['mismatched']:
            emit({'ok': False, 'verdict': 'snapshot_mismatch', 'phase': args.phase, 'files': checked['mismatched']}, 1)
    else:
        found = tdd_lib.snapshot_tree_hashes(destination)
        if found is None or found != proof.get('file_hashes'):
            emit({'ok': False, 'verdict': 'snapshot_mismatch', 'phase': args.phase}, 1)
        reread_files.update(proof.get('file_hashes', {}).keys())

    scoped = isinstance(scope, dict) and bool(proof.get('git_head'))
    try:
        if scoped:
            actual_exit, actual_text = tdd_lib.reexec_scoped_snapshot(
                project, destination, proof.get('command') or '', proof['git_head'], scope, timeout=120
            )
        else:
            actual_exit, actual_text = tdd_lib.reexec_snapshot(destination, proof.get('command') or '', timeout=120)
    except RuntimeError as exc:
        emit({'ok': False, 'verdict': 'replay_source_missing', 'phase': args.phase, 'error': str(exc)[:300]}, 1)
    except subprocess.TimeoutExpired:
        emit({'ok': False, 'verdict': 'reexec_timeout', 'phase': args.phase}, 1)

    if actual_exit != proof.get('exit_code'):
        emit({
            'ok': False,
            'verdict': 'reexec_exit_mismatch',
            'phase': args.phase,
            'expected_exit': proof.get('exit_code'),
            'actual_exit': actual_exit,
        }, 1)

    actual_kind = 'timeout' if proof.get('failure_kind') == 'timeout' else tdd_lib.classify_output(actual_text, actual_exit == 0)
    if proof.get('failure_kind') != actual_kind:
        emit({
            'ok': False,
            'verdict': 'reexec_result_mismatch',
            'phase': args.phase,
            'expected_failure_kind': proof.get('failure_kind'),
            'actual_failure_kind': actual_kind,
        }, 1)

    if args.phase in {'green', 'refactor', 'run'}:
        mismatched = []
        test_hashes = {rel: digest for rel, digest in proof.get('file_hashes', {}).items()
                       if tdd_lib.is_test_file(rel)}
        file_stats = scope.get('file_stats') if isinstance(scope, dict) else None
        if isinstance(file_stats, dict) and file_stats:
            # Stat-anchored check (issue #5, P1-3): sealed test files whose
            # anchor still matches are accepted without re-reading them.
            checked = tdd_lib.verify_hashes_by_stat(project, test_hashes, file_stats)
            reread_files.update(checked['reread'])
            mismatched = checked['mismatched']
        else:
            for rel, digest in test_hashes.items():
                path = project / rel
                if not path.is_file() or tdd_lib.sha256_bytes(path.read_bytes()) != digest:
                    mismatched.append(rel)
            reread_files.update(test_hashes.keys())
        if scoped:
            # Test files outside the sealed scope were pinned to the recorded
            # HEAD at seal time; any that have drifted since are unsealed edits.
            sealed = set(proof.get('file_hashes', {}))
            for rel in tdd_lib.changed_since(project, proof['git_head']):
                if rel not in sealed and tdd_lib.is_test_file(rel):
                    mismatched.append(rel)
        if mismatched:
            emit({
                'ok': False,
                'verdict': 'green_tree_mismatch',
                'phase': args.phase,
                'files': mismatched,
            }, 1)

    if proof.get('failure_kind') == 'skipped' or tdd_lib.output_non_result(actual_text):
        emit({'ok': False, 'verdict': 'tests_skipped_or_todo', 'phase': args.phase}, 1)

    if proof.get('failure_kind') == 'counts_unknown' or tdd_lib.output_counts_unknown(actual_text):
        emit({'ok': False, 'verdict': 'tests_counts_unknown', 'phase': args.phase}, 1)

    expected_passed = expected_result(args.phase)
    if expected_passed is not None and proof.get('passed') is not expected_passed:
        emit({
            'ok': False,
            'verdict': 'semantic_error',
            'phase': args.phase,
            'expected_passed': expected_passed,
            'actual_passed': proof.get('passed'),
        }, 1)

    if proof.get('expectation_met') is False:
        emit({'ok': False, 'verdict': 'expectation_not_met', 'phase': args.phase}, 1)

    emit({
        'ok': True,
        'verdict': 'valid',
        'proof_file': proof_file,
        'passed': proof['passed'],
        'exit_code': proof['exit_code'],
        'phase': args.phase,
        'tdd_mode': mode,
        'reread_files': sorted(reread_files),
        'reread_count': len(reread_files),
    }, 0)

if __name__ == '__main__':
    main()
