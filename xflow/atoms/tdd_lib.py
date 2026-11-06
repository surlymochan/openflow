#!/usr/bin/env python3
"""Shared TDD proof and quality checks.

Threat model: I6a binds the recorded result to a snapshot of the tree it
actually ran against. I6b recomputes that binding and re-runs the command in
a copy of the snapshot. A hand-edited exit code, stdout tail, or failure class
fails unless the snapshot really exits that way and the binding is rebuilt.
An agent who can write the tree can still record a genuine failing snapshot
and later replace the working tree; the digest is not a trusted third party.
Byte-identical stdout is not required, because runners print timings.

Scoped sealing (issue #5 P1-4): inside a git work tree the snapshot copies
only the files that differ from HEAD plus the files the test command names.
Every other file is pinned to the recorded HEAD: I6b materializes it from
`git archive` at replay time, so the replayed tree is byte-identical to the
sealed one while the stored manifest stays proportional to the change.
Outside a git work tree the legacy full-tree copy is used unchanged.
"""
import hashlib
import json
import os
import re
import shlex
import shutil
import subprocess
import tempfile
from pathlib import Path


MODES = ("red-green", "refactor", "docs")
CODE_EXTENSIONS = {
    ".js", ".jsx", ".mjs", ".cjs",
    ".ts", ".tsx",
    ".py", ".go", ".rs", ".java", ".kt", ".rb", ".php",
}
TEST_PATTERNS = [
    re.compile(r"(^|/)(test|tests|spec|__tests__)/"),
    re.compile(r"(^|/)[^/]+(\.test|\.spec|_test)\.[^/]+$"),
]
SKIP_DIR_NAMES = {".git", "node_modules", "__pycache__", ".pytest_cache"}
BINDING_FIELDS = (
    "phase",
    "attempt",
    "command",
    "exit_code",
    "passed",
    "expected",
    "expectation_met",
    "output_sha256",
    "stdout_tail",
    "stderr_tail",
    "git_head",
    "file_hashes",
    "snapshot_scope",
    "failure_kind",
    "recorded_at",
)
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
TRIVIAL_ASSERTIONS = [
    re.compile(r"assert\.(ok|equal|strictEqual)\(\s*(true|1)\s*(,\s*(true|1))?\s*\)"),
    re.compile(r"expect\(\s*(true|1)\s*\)\.(toBe|toEqual)\(\s*(true|1)\s*\)"),
    re.compile(r"expect\(\s*1\s*\)\.(toBe|toEqual)\(\s*1\s*\)"),
]
SNAPSHOT_PATTERN = re.compile(r"\b(toMatchSnapshot|toMatchInlineSnapshot)\b")
MOCK_PATTERN = re.compile(r"\b(mock|stub|spy|jest\.fn|vi\.fn|sinon)\b", re.IGNORECASE)
WEAK_LINE = [
    re.compile(r"\btypeof\b"),
    re.compile(r"(?:!==?|!=)\s*(?:undefined|null)\b"),
    re.compile(r"\.(?:toBeDefined|toBeUndefined)\s*\("),
]
SKIP_SOURCE = [
    re.compile(r"\b(?:test|it|describe|t)\.skip\b"),
    re.compile(r"\b(?:test|it|describe|t)\.todo\b"),
    re.compile(r"\b(?:test|it|describe|t)\.only\b"),
    re.compile(r"\bxit\s*\("),
    re.compile(r"\b(?:fit|fdescribe|fcontext)\s*\("),
    re.compile(r"\b(?:skip|todo)\s*:\s*true\b"),
    re.compile(r"@pytest\.mark\.(?:skip|skipif|xfail)\b"),
    re.compile(r"@unittest\.skip(?:If|Unless)?\b"),
]
FULL_SUITE = [
    re.compile(r"^(?:npm|pnpm|yarn)\s+test\b"),
    re.compile(r"^(?:python3?|py)\s+-m\s+(?:pytest|unittest)\b"),
    re.compile(r"^pytest\b"),
    re.compile(r"^node\s+--test\b"),
]
SELECTOR_FLAGS = {"--test-name-pattern", "--testNamePattern", "--grep", "-g", "-k"}
NORMATIVE_CLAUSE = re.compile(
    r"^(?P<subject>.+?)\s+\b(?P<modal>MUST|SHALL)\b\s+"
    r"(?P<neg>NOT\s+)?"
    r"(?:(?:still|always|only|also)\s+)*"
    r"(?P<verb>return|be|equal|equals|yield)\s+"
    r"(?P<value>`[^`]+`|'[^']+'|\"[^\"]+\"|null|none|nil|true|false|-?\d+(?:\.\d+)?|[A-Za-z_][\w.]*)"
    r"\s*\.?\s*$",
    re.IGNORECASE,
)


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


def read_status(project_root: Path, change_id: str) -> dict:
    path = project_root / "specs" / "changes" / change_id / "status.json"
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def resolve_tdd_mode(project_root: Path, change_id: str, explicit: str | None) -> str:
    raw = (explicit or "").strip()
    if not raw:
        raw = str(read_status(project_root, change_id).get("tdd_mode") or "").strip()
    return raw or "red-green"


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def stat_anchor(path: Path) -> list | None:
    """[size, mtime_ns, inode] for a file, or None when it cannot be stat'ed.

    The anchor is the cheap identity a later gate stats first: when the
    anchor still matches the one recorded at seal time, the bytes the seal
    hashed cannot have changed without a same-size same-nanosecond rewrite
    (the same heuristic git uses for its index). Any anchor mismatch falls
    back to a full re-read and re-hash, so the check never weakens.
    """
    try:
        st = path.stat()
    except OSError:
        return None
    if not path.is_file():
        return None
    return [st.st_size, st.st_mtime_ns, st.st_ino]


def read_with_anchor(path: Path) -> tuple[bytes, list | None]:
    """Read a file and return the bytes plus the stat anchor they were read under.

    Stats before and after the read; when the file changed mid-read the
    read is retried once, so the returned anchor always describes the
    returned bytes.
    """
    before = stat_anchor(path)
    data = path.read_bytes()
    after = stat_anchor(path)
    if before is not None and after is not None and before != after:
        data = path.read_bytes()
        after = stat_anchor(path)
    return data, after


class FileReadCache:
    """Per-process cache of file text, keyed by the stat anchor.

    One gate run reads the same source file several times — symbols,
    assertions, references (issue #5, P1-2 follow-up to #34). The first
    read stores the text under the file's stat anchor (size, mtime_ns,
    inode, the P1-3 identity); a later read whose anchor still matches
    is served from memory without touching the bytes. Any anchor
    mismatch — the file changed, or it was never read — re-reads from
    disk, so the cache can never serve stale content; a mid-read change
    is retried once, like read_with_anchor, so the stored anchor always
    describes the stored text. Unreadable files are never cached and
    never counted as disk reads.

    `stats()` reports {"disk_reads": n, "cache_hits": n} so a proof can
    show the skipped re-reads; the counts are per cache instance, and a
    gate creates one instance per run.
    """

    def __init__(self) -> None:
        self._entries: dict[str, tuple[list, str]] = {}
        self.disk_reads = 0
        self.cache_hits = 0

    def get(self, path) -> str | None:
        """Cached text for `path`, or None when it is unreadable."""
        path = Path(path)
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

    def read_text(self, path) -> str:
        """Cached text for `path`, or "" when it is unreadable."""
        text = self.get(path)
        return "" if text is None else text

    def stats(self) -> dict:
        return {"disk_reads": self.disk_reads, "cache_hits": self.cache_hits}


def verify_hashes_by_stat(root: Path, hashes: dict, stats: dict | None) -> dict:
    """Check recorded sha256 hashes, re-reading only files whose stat moved.

    `stats` maps rel -> [size, mtime_ns, ino] recorded when the hash was
    computed (issue #5, P1-3). A file whose current anchor matches is
    accepted without reading its bytes; anything else — missing anchor,
    stat mismatch, missing file — is re-read and hashed. Returns
    {"mismatched": [...], "reread": [...], "stat_checked": n}.
    """
    mismatched: list[str] = []
    reread: list[str] = []
    stat_checked = 0
    anchors = stats if isinstance(stats, dict) else {}
    for rel, digest in hashes.items():
        full = root / rel
        anchor = anchors.get(rel)
        if anchor is not None:
            current = stat_anchor(full)
            if current is not None and list(current) == list(anchor):
                stat_checked += 1
                continue
        reread.append(rel)
        if not full.is_file():
            mismatched.append(rel)
            continue
        if sha256_bytes(full.read_bytes()) != digest:
            mismatched.append(rel)
    return {"mismatched": sorted(mismatched), "reread": sorted(reread), "stat_checked": stat_checked}


# Optional binding fields join the payload only when present, so proofs
# sealed before the field existed keep verifying byte-for-byte.
OPTIONAL_BINDING_FIELDS = {"snapshot_scope"}


def binding_payload(proof: dict) -> dict:
    payload = {}
    for field in BINDING_FIELDS:
        if field in OPTIONAL_BINDING_FIELDS and proof.get(field) is None:
            continue
        payload[field] = proof.get(field)
    return payload


def compute_binding(proof: dict) -> str:
    raw = json.dumps(binding_payload(proof), sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def git_head(project_root: Path):
    result = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=project_root,
        text=True,
        capture_output=True,
    )
    if result.returncode != 0:
        return None
    return result.stdout.strip() or None


def tdd_dir(project_root: Path, change_id: str) -> Path:
    return project_root / "specs" / "changes" / change_id / "tdd"


def snapshot_dir(project_root: Path, change_id: str, phase: str, attempt: int) -> Path:
    return tdd_dir(project_root, change_id) / "snapshots" / f"{phase}-{attempt}"


def _skipped_walk(rel_dir: str, skip_prefix: str) -> bool:
    if not rel_dir or rel_dir == ".":
        return False
    return rel_dir == skip_prefix or rel_dir.startswith(skip_prefix + "/")


def iter_project_files(project_root: Path, skip_prefix: str):
    for dirpath, dirnames, filenames in os.walk(project_root):
        dirnames[:] = [name for name in dirnames if name not in SKIP_DIR_NAMES]
        rel_dir = Path(dirpath).relative_to(project_root).as_posix()
        if _skipped_walk(rel_dir, skip_prefix):
            dirnames[:] = []
            continue
        for name in filenames:
            rel = name if rel_dir in ("", ".") else f"{rel_dir}/{name}"
            full = Path(dirpath) / name
            if full.is_symlink() or not full.is_file():
                continue
            yield rel, full


def _git_status_paths(project_root: Path):
    """(changed, deleted) path sets from `git status --porcelain -z`.

    Returns None when the project is not a git work tree. Renames report the
    new path as changed and the old path as deleted.
    """
    result = subprocess.run(
        ["git", "status", "--porcelain=v1", "-z", "--untracked-files=all"],
        cwd=project_root,
        capture_output=True,
    )
    if result.returncode != 0:
        return None
    entries = result.stdout.decode("utf-8", errors="replace").split("\0")
    changed: set[str] = set()
    deleted: set[str] = set()
    index = 0
    while index < len(entries):
        entry = entries[index]
        index += 1
        if len(entry) < 4:
            continue
        code, rel = entry[:2], entry[3:]
        if "R" in code or "C" in code:
            old = entries[index] if index < len(entries) else ""
            index += 1
            if old:
                deleted.add(old)
        if "D" in code:
            deleted.add(rel)
        elif rel:
            changed.add(rel)
    return changed, deleted


def changed_since(project_root: Path, ref: str) -> set[str]:
    """Paths whose working-tree content differs from `ref`, plus untracked."""
    paths: set[str] = set()
    diff = subprocess.run(
        ["git", "diff", "--name-only", "-z", ref],
        cwd=project_root,
        capture_output=True,
    )
    if diff.returncode == 0:
        paths.update(p for p in diff.stdout.decode("utf-8", errors="replace").split("\0") if p)
    others = subprocess.run(
        ["git", "ls-files", "--others", "--exclude-standard", "-z"],
        cwd=project_root,
        capture_output=True,
    )
    if others.returncode == 0:
        paths.update(p for p in others.stdout.decode("utf-8", errors="replace").split("\0") if p)
    return paths


def snapshot_scope(project_root: Path, change_id: str, command: str | None) -> dict | None:
    """Files the proof actually depends on (issue #5 P1-4).

    Scoped sealing only applies inside a git work tree: every file that
    differs from HEAD is sealed by copy, and every other file is pinned to
    the recorded HEAD and materialized from git at replay time. Returns None
    when no HEAD exists to pin the rest of the tree to (legacy full copy).
    """
    if git_head(project_root) is None:
        return None
    status = _git_status_paths(project_root)
    if status is None:
        return None
    changed, deleted = status
    evidence_prefix = (Path("specs") / "changes" / change_id).as_posix() + "/"

    def excluded(rel: str) -> bool:
        return rel.startswith(evidence_prefix)

    def noise(rel: str) -> bool:
        return any(part in SKIP_DIR_NAMES for part in rel.split("/"))

    files = {rel for rel in changed if not excluded(rel) and not noise(rel)}
    for rel in test_paths(command or ""):
        if not excluded(rel) and (project_root / rel).is_file():
            files.add(rel)
    return {
        "version": 1,
        "files": sorted(files),
        "deleted": sorted(rel for rel in deleted if not excluded(rel) and not noise(rel)),
    }


def write_snapshot(project_root: Path, change_id: str, phase: str, attempt: int,
                   command: str | None = None) -> tuple[dict, dict | None]:
    """Seal the tree state a proof ran against.

    With a scope (git work tree), only the scoped files are copied and
    hashed; the manifest stays proportional to the change, not the tree.
    Without one, the legacy full-tree copy is used.
    """
    skip_prefix = (Path("specs") / "changes" / change_id / "tdd").as_posix()
    destination = snapshot_dir(project_root, change_id, phase, attempt)
    if destination.exists():
        shutil.rmtree(destination)
    destination.mkdir(parents=True, exist_ok=True)
    scope = snapshot_scope(project_root, change_id, command)
    hashes = {}
    if scope is None:
        for rel, full in iter_project_files(project_root, skip_prefix):
            data = full.read_bytes()
            hashes[rel] = sha256_bytes(data)
            target = destination / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        return hashes, None
    file_stats: dict[str, list] = {}
    copy_stats: dict[str, list] = {}
    for rel in scope["files"]:
        full = project_root / rel
        if full.is_symlink() or not full.is_file():
            continue
        data, anchor = read_with_anchor(full)
        if anchor is not None:
            file_stats[rel] = anchor
        hashes[rel] = sha256_bytes(data)
        target = destination / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        copy_anchor = stat_anchor(target)
        if copy_anchor is not None:
            copy_stats[rel] = copy_anchor
    scope = {**scope, "files": sorted(hashes), "file_stats": file_stats, "copy_stats": copy_stats}
    return hashes, scope


def snapshot_tree_hashes(destination: Path):
    if not destination.is_dir():
        return None
    hashes = {}
    for dirpath, dirnames, filenames in os.walk(destination):
        dirnames[:] = [name for name in dirnames if name not in SKIP_DIR_NAMES]
        for name in filenames:
            full = Path(dirpath) / name
            rel = full.relative_to(destination).as_posix()
            hashes[rel] = sha256_bytes(full.read_bytes())
    return hashes


def output_digest(stdout: str, stderr: str) -> str:
    return hashlib.sha256(f"{stdout}\0{stderr}".encode("utf-8")).hexdigest()


# Node's built-in test runner ends a run with a summary block of
# "<marker> <label> <count>" lines — the runner's own structured tally.
# The marker depends on the reporter: "#" for the TAP reporter (the piped
# default up to Node 22) and "ℹ" for the spec reporter (the piped default
# from Node 24, and selectable on any version). The gate reads only these
# line-anchored summary lines, never free-floating text, so test names or
# program output cannot forge a count.
_NODE_GATE_LABELS = ("pass", "fail", "skipped", "todo")
# Lines every node:test summary block carries and other TAP emitters do
# not; their joint presence is what marks a block as a node summary.
_NODE_SIGNATURE_LABELS = ("tests", "suites", "cancelled")


def _summary_count(text: str, label: str):
    match = re.search(rf"^[#\u2139]\s*{label}\s+(\d+)\b", text, re.MULTILINE)
    if not match:
        return None
    return int(match.group(1))


def node_run_counts(text: str):
    """Summary counts from a node:test run, or None when there is no summary.

    A dict is returned once a block carries the full node signature
    (tests/suites/cancelled). A gate label the block does not carry maps
    to None — unknown, never silently zero: a truncated or reshaped
    block must not read as "zero skipped".
    """
    if not text:
        return None
    if any(_summary_count(text, label) is None for label in _NODE_SIGNATURE_LABELS):
        return None
    labels = _NODE_SIGNATURE_LABELS + _NODE_GATE_LABELS
    return {label: _summary_count(text, label) for label in labels}


def output_counts_unknown(text: str) -> bool:
    """True when a node:test summary is present but a gate count is unreadable."""
    counts = node_run_counts(text)
    if counts is None:
        return False
    return any(counts[label] is None for label in _NODE_GATE_LABELS)


def output_non_result(text: str) -> bool:
    """True when the runner reported skip/todo/xfail and no passing test."""
    if not text:
        return False
    counts = node_run_counts(text)
    node_failed = None
    if counts is not None:
        skipped = counts["skipped"]
        todo = counts["todo"]
        passed = counts["pass"]
        node_failed = counts["fail"]
        if None not in (skipped, todo, passed, node_failed):
            if skipped + todo > 0 and passed == 0 and node_failed == 0:
                return True
    py_skipped = sum(int(item) for item in re.findall(r"\b(\d+)\s+skipped\b", text))
    py_skipped += sum(int(item) for item in re.findall(r"\b(\d+)\s+xfailed\b", text))
    py_passed = sum(int(item) for item in re.findall(r"\b(\d+)\s+passed\b", text))
    if py_skipped > 0 and py_passed == 0 and (node_failed or 0) == 0:
        return True
    return False


def classify_output(text: str, passed: bool) -> str:
    if output_non_result(text):
        return "skipped"
    if passed:
        # Fail closed: a node:test summary that cannot be fully read does
        # not prove a clean pass — the skip/todo counts may sit in the
        # part that failed to parse, so the run is unverifiable, not green.
        if output_counts_unknown(text):
            return "counts_unknown"
        return "passed"
    if re.search(r"does not provide an export named|cannot import name\b", text, re.IGNORECASE):
        return "test_error"
    if re.search(r"\b(MODULE_NOT_FOUND|Cannot find module|SyntaxError|ModuleNotFoundError|ImportError|No module named)\b", text) and not re.search(
        r"\b(AssertionError|ERR_ASSERTION)\b", text
    ):
        return "import_or_syntax"
    if re.search(r"\b(AssertionError|ERR_ASSERTION)\b", text):
        return "assertion"
    if re.search(r"\bnot ok\b", text) or re.search(r"\bERROR:", text) or re.search(r"\bFAILED\b", text) or re.search(r"\bFAIL\b", text):
        return "test_error"
    return "no_test_evidence"


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


def strip_comments(content: str) -> str:
    content = re.sub(r"/\*.*?\*/", " ", content, flags=re.S)
    content = re.sub(r"//.*?$", " ", content, flags=re.M)
    content = re.sub(r"#.*?$", " ", content, flags=re.M)
    return content


def prepare_source(content: str) -> str:
    return strip_comments(strip_quoted_strings(content))


def _tokens(command: str) -> list[str]:
    try:
        return shlex.split(command)
    except ValueError:
        return command.split()


def _is_test_token(token: str) -> bool:
    if token.startswith("-"):
        return False
    normalized = token.replace("\\", "/")
    name = normalized.split("/")[-1]
    if re.search(r"\.(test|spec)\.[cm]?[jt]sx?$", name):
        return True
    if re.search(r"(^|/)(test|tests|__tests__)/.+\.(py|js|mjs|cjs|ts|tsx)$", normalized):
        return True
    if name.startswith("test_") and name.endswith(".py"):
        return True
    if name.endswith("_test.py"):
        return True
    return False


def test_paths(command: str) -> list[str]:
    return [token.replace("\\", "/") for token in _tokens(command) if _is_test_token(token)]


def is_full_suite(command: str) -> bool:
    if test_paths(command):
        return False
    collapsed = " ".join(command.split())
    return any(pattern.search(collapsed) for pattern in FULL_SUITE)


def selectors(command: str) -> tuple:
    tokens = _tokens(command)
    found = []
    index = 0
    while index < len(tokens):
        token = tokens[index]
        if token in SELECTOR_FLAGS and index + 1 < len(tokens):
            found.append((token, tokens[index + 1]))
            index += 2
            continue
        index += 1
    return tuple(found)


def command_problem(red: str, green: str):
    """None when green runs the red test or a superset of it."""
    if not red or not green:
        return None
    if " ".join(red.split()) == " ".join(green.split()):
        return None
    red_sel = selectors(red)
    green_sel = selectors(green)
    if red_sel != green_sel and not (red_sel and not green_sel):
        return "red_green_selector_mismatch"
    red_paths = test_paths(red)
    green_paths = test_paths(green)
    if not red_paths and not is_full_suite(red):
        return "red_command_not_a_test"
    if is_full_suite(green) and not green_paths:
        return None
    if red_paths and set(red_paths) <= set(green_paths):
        return None
    if is_full_suite(red) and is_full_suite(green) and not green_paths:
        return None
    return "red_green_command_mismatch"


def defined_symbols(content: str) -> set[str]:
    names = set()
    names.update(re.findall(r"\b(?:async\s+)?function\s+([A-Za-z_]\w*)", content))
    names.update(re.findall(r"\bclass\s+([A-Za-z_]\w*)", content))
    names.update(re.findall(r"\bdef\s+([A-Za-z_]\w*)", content))
    names.update(re.findall(r"\bexport\s+(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_]\w*)", content))
    return names


def references_symbol(content: str, symbols: set[str]) -> bool:
    return any(re.search(rf"\b{re.escape(name)}\b", content) for name in symbols)


def assertion_lines(content: str) -> list[str]:
    prepared = prepare_source(content)
    lines = []
    for line in prepared.splitlines():
        if ASSERTION_PATTERN.search(line):
            lines.append(re.sub(r"\s+", " ", line).strip())
    return lines


def analyze_test(content: str, implementation_sources: list[str] | None = None) -> list[dict]:
    prepared = prepare_source(content)
    findings = []
    assertion_count = len(ASSERTION_PATTERN.findall(prepared))
    snapshot_count = len(SNAPSHOT_PATTERN.findall(prepared))
    mock_count = len(MOCK_PATTERN.findall(prepared))
    assertion_line_list = [line for line in prepared.splitlines() if ASSERTION_PATTERN.search(line)]

    for pattern in SKIP_SOURCE:
        if pattern.search(prepared):
            findings.append({"severity": "fail", "code": "skipped_or_todo_test"})
            break

    for pattern in TRIVIAL_ASSERTIONS:
        if pattern.search(prepared):
            findings.append({"severity": "fail", "code": "trivial_assertion"})
            break

    if snapshot_count > 0 and assertion_count == snapshot_count:
        findings.append({"severity": "fail", "code": "snapshot_only_test"})

    if mock_count >= 4 and assertion_count < 2:
        findings.append({
            "severity": "fail",
            "code": "mock_heavy_without_real_assertions",
            "mock_count": mock_count,
            "assertion_count": assertion_count,
        })

    if assertion_line_list and all(any(pattern.search(line) for pattern in WEAK_LINE) for line in assertion_line_list):
        findings.append({"severity": "fail", "code": "weak_assertion"})

    if assertion_count == 0:
        findings.append({"severity": "fail", "code": "no_assertions"})

    # Gate v2: plausible-but-wrong checks. Each check is deliberately narrow:
    # it only fires on a shape that cannot be a meaningful test, and every
    # check ships with passing counter-examples in the test suite.
    for pattern in SELF_COMPARISON_PATTERNS:
        match = pattern.search(prepared)
        if match:
            findings.append({
                "severity": "fail",
                "code": "self_comparison_assertion",
                "expression": match.group(1),
            })
            break

    findings.extend(dead_callback_findings(prepared))

    if implementation_sources:
        findings.extend(same_source_expected_findings(prepared, implementation_sources))

    return findings


# --- Gate v2 helpers --------------------------------------------------------

_LITERAL_RHS = r"(?:[-+]?\d|['\"]|\[|\{|true\b|false\b|True\b|False\b|None\b)"

IMPL_CONSTANT_PATTERNS = [
    # JS/TS: [export] const|let|var NAME = <literal>
    re.compile(rf"(?:\bexport\s+)?\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*{_LITERAL_RHS}"),
    # Python module-level: NAME = <literal>
    re.compile(rf"^([A-Za-z_][\w]*)\s*=\s*{_LITERAL_RHS}", re.M),
]

TEST_LOCAL_DEF_PATTERNS = [
    re.compile(r"\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*="),
    re.compile(r"^([A-Za-z_][\w]*)\s*=", re.M),
    re.compile(r"\bfunction\s+([A-Za-z_$][\w$]*)\s*\("),
    re.compile(r"\bdef\s+([A-Za-z_]\w*)\s*\("),
    re.compile(r"\bclass\s+([A-Za-z_$][\w$]*)"),
]

SELF_COMPARISON_PATTERNS = [
    re.compile(r"\bassert\.(?:equal|strictEqual|deepEqual|deepStrictEqual)\(\s*([A-Za-z_$][\w$.[\]]*)\s*,\s*\1\s*\)"),
    re.compile(r"\bexpect\(\s*([A-Za-z_$][\w$.[\]]*)\s*\)\.(?:toBe|toEqual|toStrictEqual|toDeepEqual)\(\s*\1\s*\)"),
    re.compile(r"\bassertEqual\(\s*([A-Za-z_$][\w$.[\]]*)\s*,\s*\1\s*\)"),
    re.compile(r"\bassert\s+([A-Za-z_$][\w$.[\]]*)\s*==\s*\1(?![\w$.[\]])"),
]

_CALLBACK_DEF_PATTERNS = [
    # JS/TS: function NAME(...) { ... }
    ("js", re.compile(r"(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(")),
    # JS/TS: const NAME = (...) => / const NAME = function
    ("js", re.compile(r"\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>")),
    ("js", re.compile(r"\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?function\b")),
    # Python: def NAME(...)
    ("py", re.compile(r"^def\s+([A-Za-z_]\w*)\s*\(", re.M)),
]


def _constant_like(name: str, exported: bool) -> bool:
    if exported:
        return len(name) >= 2
    # Unexported implementation constants are only trusted when they use the
    # screaming-snake convention; anything else collides too easily.
    return bool(re.fullmatch(r"[A-Z][A-Z0-9_]{2,}", name))


def implementation_constants(sources: list[str]) -> set[str]:
    names: set[str] = set()
    for source in sources:
        cleaned = strip_comments(source)
        for pattern in IMPL_CONSTANT_PATTERNS:
            for match in pattern.finditer(cleaned):
                prefix = cleaned[max(0, match.start() - 8):match.start()]
                exported = "export" in prefix
                name = match.group(1)
                if _constant_like(name, exported):
                    names.add(name)
    return names


def test_local_names(prepared: str) -> set[str]:
    names: set[str] = set()
    for pattern in TEST_LOCAL_DEF_PATTERNS:
        names.update(match.group(1) for match in pattern.finditer(prepared))
    return names


def same_source_expected_findings(prepared: str, implementation_sources: list[str]) -> list[dict]:
    """Flag assertions whose expected value is an implementation constant.

    When a test asserts against a constant taken from the implementation,
    editing that constant moves the expectation with it, so the test can
    never fail on the value it claims to pin down. Independent literals in
    the test are fine: they do not move. Names the test defines itself
    shadow the implementation and are also fine.
    """
    constants = implementation_constants(implementation_sources)
    if not constants:
        return []
    candidates = constants - test_local_names(prepared)
    if not candidates:
        return []
    findings = []
    seen: set[str] = set()
    for line in prepared.splitlines():
        if not ASSERTION_PATTERN.search(line):
            continue
        for name in sorted(candidates):
            if name in seen:
                continue
            # The constant must be used as a value in the assertion, not
            # called as a function.
            if re.search(rf"\b{re.escape(name)}\b(?!\s*\()", line):
                seen.add(name)
                findings.append({
                    "severity": "fail",
                    "code": "expected_value_from_implementation",
                    "symbol": name,
                })
    return findings


def _js_body_span(prepared: str, search_from: int) -> tuple[int, int] | None:
    opening = prepared.find("{", search_from)
    if opening < 0:
        return None
    depth = 0
    for index in range(opening, len(prepared)):
        char = prepared[index]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return (opening, index + 1)
    return None


def _py_body_span(prepared: str, def_start: int) -> tuple[int, int] | None:
    # Skip the (possibly multi-line) def header: it ends at the first line
    # whose stripped form ends with ':'.
    position = def_start
    body_start = None
    for line in prepared[def_start:].splitlines(keepends=True):
        position += len(line)
        if line.strip().endswith(":"):
            body_start = position
            break
    if body_start is None:
        return None
    end = body_start
    position = body_start
    for line in prepared[body_start:].splitlines(keepends=True):
        if line.strip() == "" or line[0] in (" ", "\t"):
            end = position + len(line)
            position += len(line)
        else:
            break
    return (body_start, end)


def dead_callback_findings(prepared: str) -> list[dict]:
    """Flag named callbacks/functions whose assertions can never run.

    A named function defined in a test file that contains assertions but is
    never referenced again (never called, passed, or exported) is dead: its
    assertions look like coverage but execute zero times. Framework entry
    points are excluded: exported functions, Python ``test_*`` functions and
    decorated functions.
    """
    findings = []
    reported: set[str] = set()
    for kind, pattern in _CALLBACK_DEF_PATTERNS:
        for match in pattern.finditer(prepared):
            name = match.group(1)
            if name in reported:
                continue
            prefix = prepared[max(0, match.start() - 8):match.start()]
            if "export" in prefix or match.group(0).startswith("export"):
                continue
            if kind == "py":
                if name.startswith("test"):
                    continue
                line_start = prepared.rfind("\n", 0, match.start()) + 1
                previous = prepared[:line_start].rstrip("\n").splitlines()
                if previous and previous[-1].lstrip().startswith("@"):
                    continue
                span = _py_body_span(prepared, match.start())
            else:
                span = _js_body_span(prepared, match.end())
            if span is None:
                continue
            body = prepared[span[0]:span[1]]
            if not ASSERTION_PATTERN.search(body):
                continue
            outside = prepared[:match.start()] + prepared[span[1]:]
            if re.search(rf"\b{re.escape(name)}\b", outside):
                continue
            reported.add(name)
            findings.append({
                "severity": "fail",
                "code": "assertion_in_dead_callback",
                "symbol": name,
            })
    return findings


def file_at_ref(project_root: Path, ref: str, relative: str):
    result = subprocess.run(
        ["git", "show", f"{ref}:{relative}"],
        cwd=project_root,
        capture_output=True,
    )
    if result.returncode != 0:
        return None
    return result.stdout


def test_env():
    env = os.environ.copy()
    for key in ("NODE_TEST_CONTEXT", "NODE_CHANNEL_FD"):
        env.pop(key, None)
    return env


def run_shell(command: str, cwd: Path, timeout: int = 120) -> subprocess.CompletedProcess:
    return subprocess.run(
        command,
        shell=True,
        cwd=cwd,
        text=True,
        capture_output=True,
        timeout=timeout,
        env=test_env(),
    )


def reexec_snapshot(destination: Path, command: str, timeout: int = 120):
    temp = Path(tempfile.mkdtemp(prefix="evalid-proof-"))
    try:
        if any(destination.iterdir()):
            shutil.copytree(destination, temp, dirs_exist_ok=True)
        result = run_shell(command, temp, timeout=timeout)
        text = f"{result.stdout or ''}\n{result.stderr or ''}"
        return result.returncode, text
    finally:
        shutil.rmtree(temp, ignore_errors=True)


def reexec_scoped_snapshot(project_root: Path, destination: Path, command: str,
                           git_head_ref: str, scope: dict, timeout: int = 120):
    """Replay a scoped proof: rebuild the sealed tree, then re-run.

    Unchanged files come from `git archive` at the recorded HEAD (their
    seal-time content is HEAD content by construction of the scope), deleted
    paths stay deleted, and the sealed scoped files are overlaid last so
    they win over the archive.
    """
    temp = Path(tempfile.mkdtemp(prefix="evalid-proof-"))
    try:
        archive = subprocess.run(
            ["git", "archive", git_head_ref],
            cwd=project_root,
            capture_output=True,
        )
        if archive.returncode != 0:
            raise RuntimeError(f"git archive {git_head_ref} failed: {archive.stderr.decode('utf-8', errors='replace')[:300]}")
        extract = subprocess.run(
            ["tar", "-x", "-C", str(temp)],
            input=archive.stdout,
            capture_output=True,
        )
        if extract.returncode != 0:
            raise RuntimeError(f"replay tree extraction failed: {extract.stderr.decode('utf-8', errors='replace')[:300]}")
        for rel in list(scope.get("deleted", [])) + list(scope.get("files", [])):
            target = temp / rel
            if target.is_dir() and not target.is_symlink():
                shutil.rmtree(target)
            elif target.exists() or target.is_symlink():
                target.unlink()
        if any(destination.iterdir()):
            shutil.copytree(destination, temp, dirs_exist_ok=True)
        result = run_shell(command, temp, timeout=timeout)
        text = f"{result.stdout or ''}\n{result.stderr or ''}"
        return result.returncode, text
    finally:
        shutil.rmtree(temp, ignore_errors=True)


def copy_project(project_root: Path, destination: Path) -> None:
    def ignore(_directory, names):
        return [name for name in names if name in SKIP_DIR_NAMES]

    shutil.copytree(project_root, destination, ignore=ignore, dirs_exist_ok=True)


def norm_clause_token(value: str) -> str:
    text = value.strip().strip("`").strip().strip("'").strip('"').strip()
    text = text.rstrip(".").strip()
    text = re.sub(r"\s+", " ", text)
    return text.lower()


def normative_clauses(text: str, source: str) -> list[dict]:
    clauses = []
    for line_number, raw in enumerate(text.splitlines(), start=1):
        line = raw.strip()
        if not line:
            continue
        normalized = re.sub(r"^\s*(?:[-*]|\d+\.)\s+", "", line)
        normalized = re.sub(r"^\[[ xX]\]\s+", "", normalized).strip()
        match = NORMATIVE_CLAUSE.match(normalized)
        if not match:
            continue
        subject = norm_clause_token(match.group("subject"))
        verb = match.group("verb").lower()
        if verb == "equals":
            verb = "equal"
        clauses.append({
            "source": source,
            "line": line_number,
            "subject": subject,
            "verb": verb,
            "neg": bool(match.group("neg")),
            "value": norm_clause_token(match.group("value")),
            "text": normalized,
        })
    return clauses


def contradictory_requirements(groups: list[tuple[str, str]]) -> list[str]:
    """groups are (source name, text). Same subject+verb with conflicting values fails."""
    clauses = []
    for source, text in groups:
        clauses.extend(normative_clauses(text, source))
    buckets = {}
    for clause in clauses:
        buckets.setdefault((clause["subject"], clause["verb"]), []).append(clause)
    issues = []
    for (subject, verb), items in buckets.items():
        positives = {}
        negatives = {}
        for item in items:
            target = negatives if item["neg"] else positives
            target.setdefault(item["value"], set()).add(item["source"])
        if len(positives) > 1:
            rendered = ", ".join(
                f"MUST {verb} {value} ({', '.join(sorted(sources))})"
                for value, sources in sorted(positives.items())
            )
            issues.append(f'contradictory requirement for "{subject}" {verb}: {rendered}')
        for value in sorted(set(positives) & set(negatives)):
            yes = ", ".join(sorted(positives[value]))
            no = ", ".join(sorted(negatives[value]))
            issues.append(
                f'contradictory requirement for "{subject}" {verb}: MUST {verb} {value} ({yes}) vs MUST NOT {verb} {value} ({no})'
            )
    return issues
