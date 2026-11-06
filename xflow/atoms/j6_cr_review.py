#!/usr/bin/env python3
"""
J6.cr.review - Deterministic first-pass code review gate.

Runs before PR creation / archive. This is intentionally not an LLM judge:
an LLM reviewing its own diff tends to wave through exactly the failures
this gate checks with plain code.

Checks (findings are structured JSON, severity fail | warn):
1. Spec alignment - every changed code file must be traceable to the
   change's spec text (status.json title, proposal.md, plan.md, tasks.md,
   merge-*.md delta snippets): the file stem or a symbol it defines must
   be named there, or share a meaningful token with it. Untraceable files
   are warns; if spec text exists and NO changed code file traces back to
   it, the gate fails.
2. Test follow - every changed code file must either have a changed test
   that references one of its symbols (or matches its stem), or an
   existing repo test that references one of its symbols. Paths listed in
   status.json "cr_allow_untested" are exempt and reported as exempt.
3. Assertion balance - across changed test files, assertions removed
   must not outnumber assertions added. A net decrease fails: shrinking
   the tests to make them pass is not a green build.
4. Loop budget - the diff for one change stays small on purpose (few,
   high-quality loops over one giant loop). Changed file count and
   changed line count are compared against configurable thresholds
   (--max-files / --max-lines, or status.json cr_max_files /
   cr_max_lines). Over budget is a warn with a split-the-spec
   recommendation; over 2x budget fails.
5. Seal partition (reporting only, never a verdict input) - the proof
   splits the changed files into those still byte-identical to the
   green TDD seal (file_hashes in tdd/green-0.json) and those that
   drifted or were never sealed. A review pass re-reads only the
   drifted set; the sealed set is exactly what the TDD gate verified.

Self-contained on purpose: this atom does not import tdd_lib so it can
run standalone in a reviewed tree. The file/symbol/assertion semantics
mirror tdd_lib so verdicts agree with I6c. File reads go through a
per-process cache keyed by the P1-3 stat anchor (issue #5, P1-2
follow-up): the same unchanged file is read from disk once per run
and served from memory on later reads; a changed file is re-read.

The proof is written to specs/changes/<change_id>/cr/review-0.json; that
directory is excluded from the reviewed diff.
"""
import argparse
import fnmatch
import hashlib
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
    re.compile(r"(^|/)test_[^/]+\.py$"),
]
SKIP_DIR_NAMES = {".git", "node_modules", "__pycache__", ".pytest_cache"}
ASSERTION_PATTERN = re.compile(
    r"(?:"
    r"\bassert\.(?:ok|equal|strictEqual|deepEqual|deepStrictEqual|notEqual|notStrictEqual|match|doesNotMatch|throws|rejects)\b"
    r"|\bassert\s+(?!from\b)\S"
    r"|\bself\.assert[A-Z]\w*"
    r"|\bpytest\.raises\b"
    r"|\bexpect\s*\("
    r"|\bshould\."
    r"|\.should\b"
    r")"
)
GENERIC_TOKENS = {
    "src", "lib", "bin", "core", "app", "index", "main", "util", "utils",
    "common", "helper", "helpers", "test", "tests", "spec", "the", "and",
    "for", "with", "change", "changes", "update", "updates", "add", "new",
    "file", "files", "code", "this", "that", "from", "into", "when", "then",
}
DEFAULT_MAX_FILES = 10
DEFAULT_MAX_LINES = 400
SPEC_TEXT_FILES = ["proposal.md", "plan.md", "tasks.md", "design.md"]


def is_test_file(path: str) -> bool:
    if path.startswith(("docs/", "specs/", "test/fixtures/", "tests/fixtures/")):
        return False
    if Path(path).suffix not in CODE_EXTENSIONS:
        return False
    return any(pattern.search(path) for pattern in TEST_PATTERNS)


def is_code_file(path: str) -> bool:
    if Path(path).suffix not in CODE_EXTENSIONS:
        return False
    if path.startswith(("docs/", "specs/changes/")):
        return False
    return not is_test_file(path)


def defined_symbols(content: str) -> set:
    names = set()
    names.update(re.findall(r"\b(?:async\s+)?function\s+([A-Za-z_]\w*)", content))
    names.update(re.findall(r"\bclass\s+([A-Za-z_]\w*)", content))
    names.update(re.findall(r"\bdef\s+([A-Za-z_]\w*)", content))
    names.update(re.findall(r"\bexport\s+(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_]\w*)", content))
    names.update(re.findall(r"\bconst\s+([A-Za-z_]\w*)\s*=\s*(?:async\s*)?\(", content))
    return names


def references_symbol(content: str, symbols: set) -> bool:
    return any(re.search(rf"\b{re.escape(name)}\b", content) for name in symbols)


def assertion_count(content: str) -> int:
    return len(ASSERTION_PATTERN.findall(content))


def read_text(path: Path) -> str:
    return _read_cache.read_text(path)


class FileReadCache:
    """Per-process cache of file text, keyed by the stat anchor.

    Local mirror of tdd_lib.FileReadCache (issue #5, P1-2 follow-up to
    #34) — this atom stays self-contained and does not import tdd_lib.
    One gate run reads the same source file several times: spec
    alignment, then test follow (which re-reads every test file once
    per changed code file). The first read stores the text under the
    file's stat anchor (size, mtime_ns, inode, the P1-3 identity); a
    later read whose anchor still matches is served from memory without
    touching the bytes. Any anchor mismatch re-reads from disk, so the
    cache can never serve stale content; a mid-read change is retried
    once, so the stored anchor always describes the stored text.
    Unreadable files are never cached and never counted as disk reads.
    `stats()` reports {"disk_reads": n, "cache_hits": n} for the proof.
    """

    def __init__(self) -> None:
        self._entries: dict[str, tuple[list, str]] = {}
        self.disk_reads = 0
        self.cache_hits = 0

    def get(self, path: Path) -> str | None:
        """Cached text for `path`, or None when it is unreadable."""
        anchor = stat_anchor(path)
        key = str(path)
        entry = self._entries.get(key)
        if anchor is not None and entry is not None and list(entry[0]) == list(anchor):
            self.cache_hits += 1
            return entry[1]
        try:
            data = path.read_bytes()
            after = stat_anchor(path)
            if anchor is not None and after is not None and list(after) != list(anchor):
                data = path.read_bytes()
                after = stat_anchor(path)
        except OSError:
            return None
        self.disk_reads += 1
        text = data.decode("utf-8", errors="replace")
        if after is not None:
            self._entries[key] = (after, text)
        return text

    def read_text(self, path: Path) -> str:
        """Cached text for `path`, or "" when it is unreadable."""
        text = self.get(path)
        return "" if text is None else text

    def stats(self) -> dict:
        return {"disk_reads": self.disk_reads, "cache_hits": self.cache_hits}


# One cache per gate run (reset in main).
_read_cache = FileReadCache()


def read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def run_git(project_root: Path, args: list) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", *args], cwd=project_root, text=True, capture_output=True,
    )


def changed_files(project_root: Path, diff_ref: str) -> list:
    result = run_git(project_root, ["diff", "--name-only", "--diff-filter=ACMR", diff_ref])
    tracked = [] if result.returncode != 0 else [
        line.strip() for line in result.stdout.splitlines() if line.strip()
    ]
    untracked_result = run_git(project_root, ["ls-files", "--others", "--exclude-standard"])
    untracked = [] if untracked_result.returncode != 0 else [
        line.strip() for line in untracked_result.stdout.splitlines() if line.strip()
    ]
    return sorted(set(tracked + untracked))


def deleted_files(project_root: Path, diff_ref: str) -> list:
    result = run_git(project_root, ["diff", "--name-only", "--diff-filter=D", diff_ref])
    if result.returncode != 0:
        return []
    return [line.strip() for line in result.stdout.splitlines() if line.strip()]


def line_counts(project_root: Path, diff_ref: str, files: list) -> dict:
    counts = {}
    result = run_git(project_root, ["diff", "--numstat", diff_ref])
    if result.returncode == 0:
        for line in result.stdout.splitlines():
            parts = line.split("\t")
            if len(parts) != 3:
                continue
            added, removed, path = parts
            counts[path] = (
                int(added) if added.isdigit() else 0,
                int(removed) if removed.isdigit() else 0,
            )
    for relative in files:
        if relative not in counts:
            # Untracked file: every line counts as added.
            content = read_text(project_root / relative)
            counts[relative] = (len(content.splitlines()), 0) if content else (0, 0)
    return counts


def assertion_delta(project_root: Path, diff_ref: str, test_files: list, deleted: list) -> tuple:
    added = 0
    removed = 0
    tracked = set()
    result = run_git(project_root, ["diff", "--name-only", "--diff-filter=ACMR", diff_ref])
    if result.returncode == 0:
        tracked = {line.strip() for line in result.stdout.splitlines() if line.strip()}
    for relative in test_files:
        if relative in tracked:
            diff = run_git(project_root, ["diff", "--unified=0", diff_ref, "--", relative])
            if diff.returncode == 0:
                for line in diff.stdout.splitlines():
                    if line.startswith(("+++", "---")):
                        continue
                    if line.startswith("+"):
                        added += assertion_count(line[1:])
                    elif line.startswith("-"):
                        removed += assertion_count(line[1:])
        else:
            added += assertion_count(read_text(project_root / relative))
    for relative in deleted:
        if is_test_file(relative):
            baseline = run_git(project_root, ["show", f"{diff_ref}:{relative}"])
            if baseline.returncode == 0:
                removed += assertion_count(baseline.stdout)
    return added, removed


def stat_anchor(path: Path):
    """[size, mtime_ns, inode] for a file, or None when it cannot be stat'ed.

    Same anchor the TDD seal records in the green proof's snapshot scope
    (issue #5, P1-3): a matching anchor means the sealed bytes are still
    there without re-reading them. Kept local — this atom stays
    self-contained and does not import tdd_lib.
    """
    try:
        st = path.stat()
    except OSError:
        return None
    if not path.is_file():
        return None
    return [st.st_size, st.st_mtime_ns, st.st_ino]


def seal_partition(project_root: Path, change_dir: Path, files: list):
    """Split changed files by whether they still match the green seal.

    The green TDD proof (tdd/green-0.json) records the sha256 of every
    file I6a sealed when the proof was produced (issue #5, P1-2). A
    changed file whose current bytes still hash to the sealed value is
    byte-for-byte what the TDD gate verified, so a review pass does not
    need to re-read it; anything else — drifted after the seal, or never
    sealed — must be re-read. Returns None when no usable green seal
    exists (the review then re-reads everything).

    When the green proof carries the seal-time stat anchors (snapshot
    scope file_stats, issue #5 P1-3), a file whose anchor still matches
    is accepted without hashing it at all; only anchor mismatches are
    re-read and hashed. `stat_checked` counts the files accepted this
    way; `reread_count` keeps its P1-2 meaning (files the review must
    re-read) and is unchanged by the fast path. Proofs sealed before
    the anchors existed fall back to hashing every file.
    """
    green = read_json(change_dir / "tdd" / "green-0.json")
    hashes = green.get("file_hashes")
    if not isinstance(hashes, dict) or not hashes:
        return None
    scope = green.get("snapshot_scope")
    stats = scope.get("file_stats") if isinstance(scope, dict) else None
    sealed, drifted = [], []
    stat_checked = 0
    for relative in files:
        full = project_root / relative
        anchor = stats.get(relative) if isinstance(stats, dict) else None
        if anchor is not None:
            current = stat_anchor(full)
            if current is not None and list(current) == list(anchor):
                stat_checked += 1
                sealed.append(relative)
                continue
        digest = None
        if full.is_file():
            digest = hashlib.sha256(full.read_bytes()).hexdigest()
        if digest is not None and hashes.get(relative) == digest:
            sealed.append(relative)
        else:
            drifted.append(relative)
    return {
        "sealed_unchanged": sealed,
        "seal_drifted": drifted,
        "reread_count": len(drifted),
        "stat_checked": stat_checked,
    }


def tokenize(text: str) -> set:
    tokens = set()
    for raw in re.findall(r"[A-Za-z_][A-Za-z0-9_]*", text):
        tokens.add(raw.lower())
        for part in re.findall(r"[a-z]+|[A-Z]+(?![a-z])|[A-Z][a-z]+|\d+", raw):
            tokens.add(part.lower())
        for part in raw.split("_"):
            if part:
                tokens.add(part.lower())
    return {token for token in tokens if len(token) >= 3 and token not in GENERIC_TOKENS}


def file_tokens(relative: str, content: str) -> set:
    tokens = set()
    stem = Path(relative).stem
    tokens |= tokenize(stem)
    tokens |= tokenize(relative.replace("/", " ").replace("-", " "))
    for symbol in defined_symbols(content):
        tokens |= tokenize(symbol)
    return tokens


def collect_spec_text(project_root: Path, change_dir: Path, status: dict) -> tuple:
    chunks = []
    if status.get("title"):
        chunks.append(str(status["title"]))
    for name in SPEC_TEXT_FILES:
        chunks.append(read_text(change_dir / name))
    if change_dir.is_dir():
        for merge_file in sorted(change_dir.glob("merge-*.md")):
            chunks.append(read_text(merge_file))
    text = "\n".join(chunk for chunk in chunks if chunk)
    return text, bool(text.strip())


def iter_repo_tests(project_root: Path) -> list:
    found = []
    for dirpath, dirnames, filenames in os.walk(project_root):
        dirnames[:] = [name for name in dirnames if name not in SKIP_DIR_NAMES]
        for name in filenames:
            full = Path(dirpath) / name
            rel = full.relative_to(project_root).as_posix()
            if is_test_file(rel):
                found.append(rel)
    return sorted(found)


def main() -> None:
    global _read_cache
    _read_cache = FileReadCache()
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", default=".")
    parser.add_argument("--change-id", required=True)
    parser.add_argument("--diff-ref", default="HEAD")
    parser.add_argument("--max-files", type=int, default=None,
                        help="Loop budget: max changed files for one change")
    parser.add_argument("--max-lines", type=int, default=None,
                        help="Loop budget: max changed lines (add+del) for one change")
    args = parser.parse_args()

    project_root = Path(args.project_root).resolve()
    change_dir = project_root / "specs" / "changes" / args.change_id
    status = read_json(change_dir / "status.json")

    findings = []

    def emit_and_exit(payload: dict, code: int) -> None:
        print(json.dumps(payload))
        sys.exit(code)

    probe = run_git(project_root, ["rev-parse", "--git-dir"])
    if probe.returncode != 0:
        emit_and_exit({
            "ok": False, "verdict": "failed", "change_id": args.change_id,
            "failures": 1, "warnings": 0, "failed_codes": ["cr_not_a_git_repo"],
            "findings": [{
                "severity": "fail", "code": "cr_not_a_git_repo",
                "message": "CR review needs a git working tree to diff against.",
            }],
        }, 1)

    evidence_prefix = f"specs/changes/{args.change_id}/"
    all_files = [
        path for path in changed_files(project_root, args.diff_ref)
        if not path.startswith(evidence_prefix)
    ]
    deleted = [
        path for path in deleted_files(project_root, args.diff_ref)
        if not path.startswith(evidence_prefix)
    ]
    code_files = [path for path in all_files if is_code_file(path)]
    test_files = [path for path in all_files if is_test_file(path)]
    counts = line_counts(project_root, args.diff_ref, all_files)

    # ---- Check 1: spec alignment -------------------------------------
    spec_text, spec_present = collect_spec_text(project_root, change_dir, status)
    spec_tokens = tokenize(spec_text)
    spec_lower = spec_text.lower()
    aligned_files = []
    if code_files and not spec_present:
        findings.append({
            "severity": "warn", "code": "cr_spec_missing",
            "message": "No spec text found for this change (status title, proposal, plan, tasks, or merge-*.md); spec alignment cannot be verified.",
        })
    elif code_files:
        for relative in code_files:
            content = read_text(project_root / relative)
            stem = Path(relative).stem.lower()
            symbols = defined_symbols(content)
            named = stem in spec_lower or any(
                symbol.lower() in spec_lower for symbol in symbols
            )
            overlap = file_tokens(relative, content) & spec_tokens
            if named or overlap:
                aligned_files.append(relative)
            else:
                findings.append({
                    "severity": "warn", "code": "cr_spec_file_unaligned",
                    "path": relative,
                    "message": "Changed code file is not named or token-traceable to the change spec text; clarify the spec or split this file into its own change.",
                })
        if not aligned_files:
            findings.append({
                "severity": "fail", "code": "cr_spec_alignment_none",
                "message": "Spec text exists but no changed code file traces back to it; the diff and the spec describe different work.",
                "code_files": code_files,
            })

    # ---- Check 2: test follow ----------------------------------------
    allow_untested = status.get("cr_allow_untested") or []
    repo_tests = None
    for relative in code_files:
        if any(fnmatch.fnmatch(relative, pattern) for pattern in allow_untested):
            findings.append({
                "severity": "warn", "code": "cr_test_exempted",
                "path": relative,
                "message": "Code file is exempt from test follow via status.json cr_allow_untested.",
            })
            continue
        content = read_text(project_root / relative)
        symbols = defined_symbols(content)
        stem = Path(relative).stem.lower()
        covered_by = None
        for test_rel in test_files:
            test_stem = Path(test_rel).stem.lower()
            if test_stem == stem or test_stem in (f"test_{stem}", f"{stem}_test"):
                covered_by = test_rel
                break
            if symbols and references_symbol(read_text(project_root / test_rel), symbols):
                covered_by = test_rel
                break
        if covered_by is None and symbols:
            if repo_tests is None:
                repo_tests = iter_repo_tests(project_root)
            for test_rel in repo_tests:
                if test_rel in test_files:
                    continue
                if references_symbol(read_text(project_root / test_rel), symbols):
                    covered_by = test_rel
                    break
        if covered_by is None:
            findings.append({
                "severity": "fail", "code": "cr_code_without_test",
                "path": relative,
                "message": "Changed code file has no changed test and no existing test referencing its symbols; add a test or declare an exemption in status.json cr_allow_untested.",
            })

    # ---- Check 3: assertion balance ----------------------------------
    added_assertions, removed_assertions = assertion_delta(
        project_root, args.diff_ref, test_files, deleted,
    )
    if removed_assertions > added_assertions:
        findings.append({
            "severity": "fail", "code": "cr_assertion_net_decrease",
            "message": "Test changes remove more assertions than they add; shrinking tests to reach green is not a passing change.",
            "assertions_added": added_assertions,
            "assertions_removed": removed_assertions,
        })

    # ---- Check 4: loop budget ----------------------------------------
    max_files = args.max_files
    if max_files is None:
        max_files = status.get("cr_max_files") or DEFAULT_MAX_FILES
    max_lines = args.max_lines
    if max_lines is None:
        max_lines = status.get("cr_max_lines") or DEFAULT_MAX_LINES
    total_lines = sum(add + rem for add, rem in counts.values())
    ratio = max(
        len(all_files) / max_files if max_files else 0,
        total_lines / max_lines if max_lines else 0,
    )
    budget = {
        "files": len(all_files), "lines": total_lines,
        "max_files": max_files, "max_lines": max_lines,
    }
    if ratio > 2:
        findings.append({
            "severity": "fail", "code": "cr_loop_budget_blown",
            "message": "Diff is over 2x the loop budget for one change; split the spec into smaller changes instead of running one large loop.",
            "budget": budget,
        })
    elif ratio > 1:
        findings.append({
            "severity": "warn", "code": "cr_loop_budget_exceeded",
            "message": "Diff exceeds the loop budget for one change; consider splitting the spec into smaller changes.",
            "budget": budget,
        })

    failed = any(finding.get("severity") == "fail" for finding in findings)
    verdict = "failed" if failed else "passed"
    proof = {
        "ok": not failed,
        "verdict": verdict,
        "change_id": args.change_id,
        "diff_ref": args.diff_ref,
        "changed_files": all_files,
        "code_files": code_files,
        "test_files": test_files,
        "read_cache": _read_cache.stats(),
        "seal_partition": seal_partition(project_root, change_dir, all_files),
        "spec_aligned_files": aligned_files,
        "assertions": {"added": added_assertions, "removed": removed_assertions},
        "budget": budget,
        "findings": findings,
        "recorded_at": datetime.now(timezone.utc).isoformat(),
    }

    proof_dir = change_dir / "cr"
    proof_dir.mkdir(parents=True, exist_ok=True)
    proof_file = proof_dir / "review-0.json"
    proof_file.write_text(json.dumps(proof, indent=2) + "\n", encoding="utf-8")

    print(json.dumps({
        "ok": proof["ok"],
        "verdict": verdict,
        "proof_file": str(proof_file),
        "read_cache": _read_cache.stats(),
        "failures": sum(1 for f in findings if f.get("severity") == "fail"),
        "warnings": sum(1 for f in findings if f.get("severity") == "warn"),
        "failed_codes": [f.get("code") for f in findings if f.get("severity") == "fail"],
    }))
    sys.exit(0 if proof["ok"] else 1)


if __name__ == "__main__":
    main()
