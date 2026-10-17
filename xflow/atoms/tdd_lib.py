#!/usr/bin/env python3
"""Shared TDD proof and quality checks.

Threat model: I6a binds the recorded result to a snapshot of the tree it
actually ran against. I6b recomputes that binding and re-runs the command in
a copy of the snapshot. A hand-edited exit code, stdout tail, or failure class
fails unless the snapshot really exits that way and the binding is rebuilt.
An agent who can write the tree can still record a genuine failing snapshot
and later replace the working tree; the digest is not a trusted third party.
Byte-identical stdout is not required, because runners print timings.
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


def binding_payload(proof: dict) -> dict:
    payload = {}
    for field in BINDING_FIELDS:
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


def write_snapshot(project_root: Path, change_id: str, phase: str, attempt: int) -> dict:
    skip_prefix = (Path("specs") / "changes" / change_id / "tdd").as_posix()
    destination = snapshot_dir(project_root, change_id, phase, attempt)
    if destination.exists():
        shutil.rmtree(destination)
    destination.mkdir(parents=True, exist_ok=True)
    hashes = {}
    for rel, full in iter_project_files(project_root, skip_prefix):
        data = full.read_bytes()
        hashes[rel] = sha256_bytes(data)
        target = destination / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    return hashes


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


def _summary_count(text: str, label: str):
    match = re.search(rf"#\s+{label}\s+(\d+)\b", text)
    if not match:
        return None
    return int(match.group(1))


def output_non_result(text: str) -> bool:
    """True when the runner reported skip/todo/xfail and no passing test."""
    if not text:
        return False
    skipped = _summary_count(text, "skipped") or 0
    todo = _summary_count(text, "todo") or 0
    passed = _summary_count(text, "pass")
    failed = _summary_count(text, "fail")
    if skipped + todo > 0 and (passed or 0) == 0 and (failed or 0) == 0:
        return True
    py_skipped = sum(int(item) for item in re.findall(r"\b(\d+)\s+skipped\b", text))
    py_skipped += sum(int(item) for item in re.findall(r"\b(\d+)\s+xfailed\b", text))
    py_passed = sum(int(item) for item in re.findall(r"\b(\d+)\s+passed\b", text))
    if py_skipped > 0 and py_passed == 0 and (failed or 0) == 0:
        return True
    return False


def classify_output(text: str, passed: bool) -> str:
    if output_non_result(text):
        return "skipped"
    if passed:
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


def analyze_test(content: str) -> list[dict]:
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
    temp = Path(tempfile.mkdtemp(prefix="openflow-proof-"))
    try:
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
