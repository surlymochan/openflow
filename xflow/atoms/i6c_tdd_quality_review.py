#!/usr/bin/env python3
"""
I6c.tdd.quality_review - deterministic review for TDD test quality.

This gate checks the parts that red/green proof cannot prove by itself:
code changes should be accompanied by test changes, changed tests must not
rely on empty assertions or snapshot-only coverage, and mock-heavy tests are
rejected when they lack enough real assertions.

tdd_mode red-green (default) requires a failing red proof and a passing
green proof. tdd_mode refactor instead requires the existing tests that
touch the changed code to pass on the pre-change tree and the current tree,
with no assertion lines removed. tdd_mode docs requires the diff to stay on
non-code paths. A semantically wrong but plausible expected value is not
decidable from the diff; only type-only or existence-only assertions are
flagged, and only when they are the sole assertions.
"""
import argparse
import json
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import tdd_lib


def run_git(project_root: Path, args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=project_root,
        text=True,
        capture_output=True,
    )


def changed_files(project_root: Path, diff_ref: str) -> list[str]:
    result = run_git(project_root, ["diff", "--name-only", "--diff-filter=ACMR", diff_ref])
    tracked = [] if result.returncode != 0 else [
        line.strip() for line in result.stdout.splitlines() if line.strip()
    ]
    untracked_result = run_git(project_root, ["ls-files", "--others", "--exclude-standard"])
    untracked = [] if untracked_result.returncode != 0 else [
        line.strip() for line in untracked_result.stdout.splitlines() if line.strip()
    ]
    return sorted(set(tracked + untracked))


def deleted_files(project_root: Path, diff_ref: str) -> list[str]:
    result = run_git(project_root, ["diff", "--name-only", "--diff-filter=D", diff_ref])
    if result.returncode != 0:
        return []
    return [line.strip() for line in result.stdout.splitlines() if line.strip()]


def read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return ""


def review_test_file(project_root: Path, relative_path: str) -> list[dict]:
    path = project_root / relative_path
    try:
        content = path.read_text(encoding="utf-8")
    except OSError:
        return [{"severity": "fail", "code": "test_unreadable", "path": relative_path}]
    findings = []
    for finding in tdd_lib.analyze_test(content):
        item = dict(finding)
        item["path"] = relative_path
        findings.append(item)
    return findings


def proof_skipped(proof: dict) -> bool:
    if not proof:
        return False
    if proof.get("failure_kind") == "skipped":
        return True
    blob = f"{proof.get('stdout_tail') or ''}\n{proof.get('stderr_tail') or ''}"
    return tdd_lib.output_non_result(blob)


def symbols_in(project_root: Path, code_files: list[str]) -> set[str]:
    symbols = set()
    for relative in code_files:
        symbols |= tdd_lib.defined_symbols(read_text(project_root / relative))
    return symbols


def iter_repo_tests(project_root: Path) -> list[str]:
    found = []
    skip = tdd_lib.SKIP_DIR_NAMES
    for dirpath, dirnames, filenames in os_walk(project_root):
        dirnames[:] = [name for name in dirnames if name not in skip]
        for name in filenames:
            full = Path(dirpath) / name
            rel = full.relative_to(project_root).as_posix()
            if tdd_lib.is_test_file(rel):
                found.append(rel)
    return found


def os_walk(project_root: Path):
    import os
    return os.walk(project_root)


def refactor_findings(project_root: Path, diff_ref: str, code_files: list[str], test_files: list[str], green_proof: dict) -> list[dict]:
    findings = []
    command = green_proof.get("command") or ""
    if not command:
        return findings

    for relative in code_files:
        if tdd_lib.file_at_ref(project_root, diff_ref, relative) is None:
            findings.append({
                "severity": "fail",
                "code": "refactor_new_code",
                "path": relative,
                "message": "Refactor mode cannot introduce a code file that is not in the baseline.",
            })

    for relative in deleted_files(project_root, diff_ref):
        if tdd_lib.is_test_file(relative):
            findings.append({
                "severity": "fail",
                "code": "assertions_removed",
                "path": relative,
                "message": "A test file was deleted during a declared refactor.",
            })

    for relative in test_files:
        previous = tdd_lib.file_at_ref(project_root, diff_ref, relative)
        if previous is None:
            continue
        old_lines = tdd_lib.assertion_lines(previous.decode("utf-8", errors="replace"))
        new_lines = tdd_lib.assertion_lines(read_text(project_root / relative))
        leftover = list(old_lines)
        for line in new_lines:
            if line in leftover:
                leftover.remove(line)
        if leftover:
            findings.append({
                "severity": "fail",
                "code": "assertions_removed",
                "path": relative,
                "message": "Refactor mode removed or rewrote an existing assertion.",
            })

    symbols = symbols_in(project_root, code_files)
    covering = []
    if symbols:
        for relative in iter_repo_tests(project_root):
            if tdd_lib.references_symbol(read_text(project_root / relative), symbols):
                covering.append(relative)
        if not covering:
            findings.append({
                "severity": "fail",
                "code": "refactor_missing_covering_test",
                "message": "No existing test references a symbol defined in the changed code.",
            })
    if findings:
        return findings

    temp_root = Path(tempfile.mkdtemp(prefix="openflow-refactor-"))
    try:
        before = temp_root / "before"
        after = temp_root / "after"
        before.mkdir()
        after.mkdir()
        tdd_lib.copy_project(project_root, before)
        tdd_lib.copy_project(project_root, after)
        for relative in code_files:
            baseline = tdd_lib.file_at_ref(project_root, diff_ref, relative)
            if baseline is None:
                continue
            target = before / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(baseline)
        try:
            before_run = tdd_lib.run_shell(command, before, timeout=120)
            after_run = tdd_lib.run_shell(command, after, timeout=120)
        except subprocess.TimeoutExpired:
            findings.append({"severity": "fail", "code": "refactor_command_timeout"})
            return findings
        if before_run.returncode != 0:
            findings.append({
                "severity": "fail",
                "code": "refactor_tests_failed_before",
                "message": "Existing tests must pass on the pre-change tree.",
            })
        if after_run.returncode != 0:
            findings.append({
                "severity": "fail",
                "code": "refactor_tests_failed_after",
                "message": "Existing tests must pass after the refactor.",
            })
    finally:
        import shutil
        shutil.rmtree(temp_root, ignore_errors=True)
    return findings


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", default=".")
    parser.add_argument("--change-id", required=True)
    parser.add_argument("--diff-ref", default="HEAD")
    parser.add_argument("--tdd-mode", default="", help="red-green | refactor | docs; empty reads status.json")
    args = parser.parse_args()

    project_root = Path(args.project_root).resolve()
    mode = tdd_lib.resolve_tdd_mode(project_root, args.change_id, args.tdd_mode)
    change_dir = project_root / "specs" / "changes" / args.change_id
    proof_dir = change_dir / "tdd"
    red_proof = read_json(proof_dir / "red-0.json")
    green_proof = read_json(proof_dir / "green-0.json")
    status = tdd_lib.read_status(project_root, args.change_id)

    files = changed_files(project_root, args.diff_ref)
    test_files = [path for path in files if tdd_lib.is_test_file(path)]
    code_files = [path for path in files if tdd_lib.is_code_file(path)]

    findings = []
    if mode not in tdd_lib.MODES:
        findings.append({"severity": "fail", "code": "invalid_tdd_mode", "tdd_mode": mode})

    if mode == "docs":
        if code_files or test_files:
            findings.append({
                "severity": "fail",
                "code": "docs_mode_with_code_change",
                "message": "Docs mode was declared, but the diff changes code or tests.",
                "code_files": code_files,
                "test_files": test_files,
            })
        if green_proof and green_proof.get("passed") is not True:
            findings.append({"severity": "fail", "code": "green_proof_not_passing"})
    elif mode == "refactor":
        if status.get("behavior_change") is True:
            findings.append({
                "severity": "fail",
                "code": "refactor_declares_behavior_change",
                "message": "Refactor mode cannot declare a public behavior change.",
            })
        if green_proof.get("passed") is not True:
            findings.append({"severity": "fail", "code": "green_proof_not_passing"})
        else:
            findings.extend(refactor_findings(project_root, args.diff_ref, code_files, test_files, green_proof))
    else:
        if code_files and not test_files:
            findings.append({
                "severity": "fail",
                "code": "code_without_test_change",
                "message": "Code changed without a matching changed test file.",
                "code_files": code_files,
            })
        if red_proof.get("passed") is not False:
            findings.append({"severity": "fail", "code": "red_proof_not_failing"})
        if green_proof.get("passed") is not True:
            findings.append({"severity": "fail", "code": "green_proof_not_passing"})
        if code_files or test_files:
            problem = tdd_lib.command_problem(red_proof.get("command") or "", green_proof.get("command") or "")
            if problem:
                findings.append({
                    "severity": "fail",
                    "code": problem,
                    "message": "Red and green must run the same test, or green must be a superset of the red test.",
                    "red_command": red_proof.get("command"),
                    "green_command": green_proof.get("command"),
                })
            kind = red_proof.get("failure_kind")
            if kind in {"import_or_syntax", "no_test_evidence", "timeout"}:
                findings.append({
                    "severity": "fail",
                    "code": "red_failure_not_assertion",
                    "message": "The red failure is not an assertion or test error in the changed test.",
                    "failure_kind": kind,
                })
        if proof_skipped(red_proof) or proof_skipped(green_proof):
            findings.append({
                "severity": "fail",
                "code": "tests_skipped_or_todo",
                "message": "A recorded run skipped or marked todo the tests it claims to have executed.",
            })
        symbols = symbols_in(project_root, code_files)
        if symbols and test_files:
            for relative in test_files:
                if not tdd_lib.references_symbol(read_text(project_root / relative), symbols):
                    findings.append({
                        "severity": "fail",
                        "code": "test_misses_changed_symbol",
                        "path": relative,
                        "message": "A changed test does not reference a symbol defined in the changed code.",
                    })

    reviewed = set(test_files)
    if mode == "refactor":
        symbols = symbols_in(project_root, code_files)
        for relative in iter_repo_tests(project_root):
            if symbols and tdd_lib.references_symbol(read_text(project_root / relative), symbols):
                reviewed.add(relative)
    for test_file in sorted(reviewed):
        findings.extend(review_test_file(project_root, test_file))

    failed = any(finding.get("severity") == "fail" for finding in findings)
    verdict = "failed" if failed else "passed"
    proof = {
        "ok": not failed,
        "verdict": verdict,
        "tdd_mode": mode,
        "diff_ref": args.diff_ref,
        "changed_files": files,
        "code_files": code_files,
        "test_files": test_files,
        "findings": findings,
        "recorded_at": datetime.now(timezone.utc).isoformat(),
    }

    proof_dir.mkdir(parents=True, exist_ok=True)
    proof_file = proof_dir / "quality-0.json"
    proof_file.write_text(json.dumps(proof, indent=2) + "\n", encoding="utf-8")

    print(json.dumps({
        "ok": proof["ok"],
        "verdict": verdict,
        "tdd_mode": mode,
        "proof_file": str(proof_file),
        "failures": sum(1 for finding in findings if finding.get("severity") == "fail"),
        "warnings": sum(1 for finding in findings if finding.get("severity") == "warn"),
        "failed_codes": [
            finding.get("code")
            for finding in findings
            if finding.get("severity") == "fail"
        ],
    }))
    sys.exit(0 if proof["ok"] else 1)


if __name__ == "__main__":
    main()
