#!/usr/bin/env python3
"""
I6c.tdd.quality_review - deterministic review for TDD test quality.

This gate checks the parts that red/green proof cannot prove by itself:
- code changes should be accompanied by test changes
- changed tests must not rely on empty assertions or snapshot-only coverage
- mock-heavy tests are rejected when they lack enough real assertions
"""
import argparse
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


CODE_EXTENSIONS = {
    ".js", ".jsx", ".mjs", ".cjs",
    ".ts", ".tsx",
    ".py", ".go", ".rs", ".java", ".kt", ".rb", ".php",
}

TEST_PATTERNS = [
    re.compile(r"(^|/)(test|tests|spec|__tests__)/"),
    re.compile(r"(^|/)[^/]+(\.test|\.spec|_test)\.[^/]+$"),
]

TRIVIAL_ASSERTIONS = [
    re.compile(r"assert\.(ok|equal|strictEqual)\(\s*(true|1)\s*(,\s*(true|1))?\s*\)"),
    re.compile(r"expect\(\s*(true|1)\s*\)\.(toBe|toEqual)\(\s*(true|1)\s*\)"),
    re.compile(r"expect\(\s*1\s*\)\.(toBe|toEqual)\(\s*1\s*\)"),
]

ASSERTION_PATTERN = re.compile(r"\b(assert\.|expect\(|should\.|\.should\b)")
SNAPSHOT_PATTERN = re.compile(r"\b(toMatchSnapshot|toMatchInlineSnapshot)\b")
MOCK_PATTERN = re.compile(r"\b(mock|stub|spy|jest\.fn|vi\.fn|sinon)\b", re.IGNORECASE)


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


def is_test_file(path: str) -> bool:
    if path.startswith(("docs/", "specs/", "test/fixtures/", "tests/fixtures/")):
        return False
    if Path(path).suffix not in CODE_EXTENSIONS:
        return False
    return any(pattern.search(path) for pattern in TEST_PATTERNS)


def is_code_file(path: str) -> bool:
    suffix = Path(path).suffix
    if suffix not in CODE_EXTENSIONS:
        return False
    if path.startswith(("docs/", "specs/changes/")):
        return False
    return not is_test_file(path)


def read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def strip_quoted_strings(content: str) -> str:
    chars = list(content)
    quote = None
    escaped = False
    for index, char in enumerate(chars):
        if quote:
            if escaped:
                chars[index] = " "
                escaped = False
                continue
            if char == "\\":
                chars[index] = " "
                escaped = True
                continue
            if char == quote:
                quote = None
                continue
            if char != "\n":
                chars[index] = " "
            continue
        if char in ("'", '"', "`"):
            quote = char
    return "".join(chars)


def review_test_file(project_root: Path, relative_path: str) -> list[dict]:
    path = project_root / relative_path
    try:
        content = path.read_text(encoding="utf-8")
    except OSError:
        return [{"severity": "fail", "code": "test_unreadable", "path": relative_path}]

    findings = []
    code_content = strip_quoted_strings(content)
    assertion_count = len(ASSERTION_PATTERN.findall(code_content))
    snapshot_count = len(SNAPSHOT_PATTERN.findall(code_content))
    mock_count = len(MOCK_PATTERN.findall(code_content))

    for pattern in TRIVIAL_ASSERTIONS:
        if pattern.search(code_content):
            findings.append({
                "severity": "fail",
                "code": "trivial_assertion",
                "path": relative_path,
            })
            break

    if snapshot_count > 0 and assertion_count == snapshot_count:
        findings.append({
            "severity": "fail",
            "code": "snapshot_only_test",
            "path": relative_path,
        })

    if mock_count >= 4 and assertion_count < 2:
        findings.append({
            "severity": "fail",
            "code": "mock_heavy_without_real_assertions",
            "path": relative_path,
            "mock_count": mock_count,
            "assertion_count": assertion_count,
        })

    if assertion_count == 0:
        findings.append({
            "severity": "fail",
            "code": "no_assertions",
            "path": relative_path,
        })

    return findings


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", default=".")
    parser.add_argument("--change-id", required=True)
    parser.add_argument("--diff-ref", default="HEAD")
    args = parser.parse_args()

    project_root = Path(args.project_root).resolve()
    change_dir = project_root / "specs" / "changes" / args.change_id
    proof_dir = change_dir / "tdd"
    red_proof = read_json(proof_dir / "red-0.json")
    green_proof = read_json(proof_dir / "green-0.json")

    files = changed_files(project_root, args.diff_ref)
    test_files = [path for path in files if is_test_file(path)]
    code_files = [path for path in files if is_code_file(path)]

    findings = []
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
    if red_proof and green_proof and red_proof.get("command") == green_proof.get("command"):
        findings.append({
            "severity": "warn",
            "code": "same_red_green_command",
            "message": "Same command is acceptable only if implementation happened between red and green.",
        })

    for test_file in test_files:
        findings.extend(review_test_file(project_root, test_file))

    failed = any(finding.get("severity") == "fail" for finding in findings)
    verdict = "failed" if failed else "passed"
    proof = {
        "ok": not failed,
        "verdict": verdict,
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
