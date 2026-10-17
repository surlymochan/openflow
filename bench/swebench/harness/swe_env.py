"""SWE-bench Verified instances without Docker: checkout, venv, official-test grading.

Uses the swebench package (pinned 3.0.17) only for its per-repo install specs,
test directives and log parsers. Grading follows the SWE-bench rule: an
instance is resolved when every FAIL_TO_PASS and every PASS_TO_PASS test passes
after the official test_patch is applied on top of the agent's tree.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

import pandas as pd
from swebench.harness.constants import MAP_REPO_VERSION_TO_SPECS
from swebench.harness.log_parsers import MAP_REPO_TO_PARSER
from swebench.harness.test_spec.python import get_test_directives

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "verified.parquet"
MIRRORS = ROOT / "repos"
TREES = ROOT / "tmp" / "trees"
DATASET = "princeton-nlp/SWE-bench_Verified"
DATASET_REVISION = "c104f840cc67f8b6eec6f759ebc8b2693d585d4a"
GIT = ["git", "-c", "user.email=bench-swe@local", "-c", "user.name=bench-swe", "-c", "commit.gpgsign=false"]


def load_instances() -> dict[str, dict]:
    locked = not os.access(DATA.parent, os.R_OK | os.X_OK)
    if locked:
        os.chmod(DATA.parent, 0o755)
    try:
        df = pd.read_parquet(DATA)
    finally:
        if locked:
            os.chmod(DATA.parent, 0o000)
    out = {}
    for row in df.to_dict("records"):
        for k in ("FAIL_TO_PASS", "PASS_TO_PASS"):
            if isinstance(row[k], str):
                row[k] = json.loads(row[k])
        out[row["instance_id"]] = row
    return out


def sh(cmd, cwd=None, env=None, timeout=1800, check=True, capture=True, errors="strict"):
    p = subprocess.run(cmd, cwd=cwd, env=env, timeout=timeout, text=True, errors=errors,
                       stdout=subprocess.PIPE if capture else None,
                       stderr=subprocess.STDOUT if capture else None,
                       shell=isinstance(cmd, str), executable="/bin/bash" if isinstance(cmd, str) else None)
    if check and p.returncode != 0:
        raise RuntimeError(f"command failed ({p.returncode}): {cmd}\n{(p.stdout or '')[-3000:]}")
    return p


def mirror(repo: str) -> Path:
    return MIRRORS / (repo.replace("/", "__") + ".git")


def make_tree(inst: dict) -> None:
    TREES.mkdir(parents=True, exist_ok=True)
    tree = TREES / f"{inst['instance_id']}.tar"
    if not tree.exists():
        sh(["git", f"--git-dir={mirror(inst['repo'])}", "archive", "-o", str(tree), inst["base_commit"]])


def lock_sources(locked: bool) -> None:
    """While agents run, the upstream mirrors (which contain the real fixes) and the dataset file
    (gold patches, hidden tests) are made unreadable. The runner keeps the rows in memory."""
    import fcntl
    counter = ROOT / "tmp" / ".lock-count"
    counter.parent.mkdir(parents=True, exist_ok=True)
    with open(counter, "a+") as fh:
        fcntl.flock(fh, fcntl.LOCK_EX)
        fh.seek(0)
        n = int(fh.read().strip() or 0) + (1 if locked else -1)
        n = max(n, 0)
        fh.seek(0); fh.truncate(); fh.write(str(n))
        for d in (MIRRORS, DATA.parent):
            if d.exists():
                os.chmod(d, 0o000 if n > 0 else 0o755)


def checkout(inst: dict, dest: Path) -> None:
    """Tree at base_commit, re-committed as a single 'baseline' commit with no history,
    so the agent cannot read the upstream fix from git objects."""
    dest.mkdir(parents=True, exist_ok=True)
    tree = TREES / f"{inst['instance_id']}.tar"
    if tree.exists():
        sh(["tar", "-xf", str(tree), "-C", str(dest)])
    else:
        sh(f"git --git-dir={mirror(inst['repo'])} archive {inst['base_commit']} | tar -x -C {dest}")
    sh(GIT + ["init", "-q", "-b", "main"], cwd=dest)
    sh(GIT + ["add", "-A"], cwd=dest)
    sh(GIT + ["commit", "-q", "-m", "baseline", "--no-verify"], cwd=dest)


def specs(inst: dict) -> dict:
    return MAP_REPO_VERSION_TO_SPECS[inst["repo"]][inst["version"]]


def build_env(inst: dict, repo_dir: Path, venv: Path, log: Path) -> None:
    s = specs(inst)
    env = dict(os.environ)
    env.pop("VIRTUAL_ENV", None)
    env["SETUPTOOLS_SCM_PRETEND_VERSION"] = inst["version"] + ".0"
    lines = []

    def run(cmd, cwd=repo_dir):
        p = sh(cmd, cwd=cwd, env=env, check=False)
        lines.append(f"$ {cmd}\n{p.stdout}")
        if p.returncode != 0:
            log.write_text("\n".join(lines))
            raise RuntimeError(f"env build failed: {cmd}")

    for c in s.get("pre_install") or []:
        if "apt-get" in c:
            continue
        run(c)
    if (repo_dir / ".git").exists():  # pre_install edits must not show up as agent changes
        sh(GIT + ["add", "-A"], cwd=repo_dir)
        sh(GIT + ["commit", "-q", "--allow-empty", "-m", "env pre_install", "--no-verify"], cwd=repo_dir)
    run(f"uv venv -q --seed -p {s['python']} {venv}")
    py = f"{venv}/bin/python"
    pkgs = s.get("packages")
    if pkgs == "requirements.txt":
        for req in ("requirements_test_min.txt", "requirements_test.txt", "requirements.txt"):
            if (repo_dir / req).exists():
                run(f"uv pip install -q --python {py} -r {req}")
                break
    elif pkgs and pkgs != "environment.yml":
        run(f"uv pip install -q --python {py} {pkgs}")
    pins = s.get("pip_packages") or []
    if pins:
        run(f"uv pip install -q --python {py} " + " ".join(f"'{p}'" for p in pins))
    install = s["install"].replace("python -m pip install", f"uv pip install -q --python {py}")
    run(install)
    if inst["repo"] != "pytest-dev/pytest":
        run(f"uv pip install -q --python {py} pytest 2>/dev/null || true")
    log.write_text("\n".join(lines))


def test_command(inst: dict, venv: Path) -> str:
    s = specs(inst)
    directives = " ".join(get_test_directives(inst))
    cmd = s["test_cmd"]
    py = f"{venv}/bin/python"
    if cmd.endswith("bin/test -C --verbose"):
        cmd = cmd.replace("bin/test", f"{py} bin/test")
    elif cmd.startswith("pytest"):
        cmd = f"{py} -m " + cmd
    return f"{cmd} {directives}"


def visible_command(inst: dict, venv: Path) -> str:
    """What the agent is told to use for its own checks: the runner, no test ids."""
    s = specs(inst)
    py = f"{venv}/bin/python"
    if "bin/test" in s["test_cmd"]:
        return f"{py} bin/test -C <test file>   (or {py} -m pytest <test file>)"
    return f"{py} -m pytest -rA <test file>"


def test_files(inst: dict) -> list[str]:
    files = []
    for line in inst["test_patch"].splitlines():
        if line.startswith("diff --git a/"):
            files.append(line.split(" b/")[-1])
    return files


def grade(inst: dict, repo_dir: Path, venv: Path, out_dir: Path, timeout: int = 1800) -> dict:
    """Restore test files the agent may have touched, apply the official test_patch, run the
    official directives, parse with the official log parser, and grade F2P/P2P."""
    out_dir.mkdir(parents=True, exist_ok=True)
    tf = test_files(inst)
    base = sh(GIT + ["rev-list", "--max-parents=0", "HEAD"], cwd=repo_dir).stdout.split()[0]
    for f in tf:
        exists = sh(GIT + ["cat-file", "-e", f"{base}:{f}"], cwd=repo_dir, check=False).returncode == 0
        if exists:
            sh(GIT + ["checkout", base, "--", f], cwd=repo_dir, check=False)
        elif (repo_dir / f).exists():
            (repo_dir / f).unlink()
    (out_dir / "test.patch").write_text(inst["test_patch"])
    ap = sh(GIT + ["apply", "-v", str(out_dir / "test.patch")], cwd=repo_dir, check=False)
    if ap.returncode != 0:
        return {"resolved": False, "error": "test_patch did not apply", "apply_log": ap.stdout[-2000:]}
    cmd = test_command(inst, venv)
    env = dict(os.environ)
    env.pop("VIRTUAL_ENV", None)
    env["PATH"] = f"{venv}/bin:" + env["PATH"]
    try:
        p = sh(cmd, cwd=repo_dir, env=env, timeout=timeout, check=False)
        log = p.stdout
        rc = p.returncode
    except subprocess.TimeoutExpired as e:
        log = (e.output or "") if isinstance(e.output, str) else ""
        rc = 124
    (out_dir / "test_output.txt").write_text(log)
    status = MAP_REPO_TO_PARSER[inst["repo"]](log, None)
    ok = {k for k, v in status.items() if v in ("PASSED", "XFAIL")}
    f2p = inst["FAIL_TO_PASS"]
    p2p = inst["PASS_TO_PASS"]
    f2p_pass = [t for t in f2p if t in ok]
    p2p_pass = [t for t in p2p if t in ok]
    res = {
        "resolved": len(f2p_pass) == len(f2p) and len(p2p_pass) == len(p2p),
        "f2p": [len(f2p_pass), len(f2p)],
        "p2p": [len(p2p_pass), len(p2p)],
        "f2p_failed": [t for t in f2p if t not in ok][:20],
        "p2p_failed": [t for t in p2p if t not in ok][:20],
        "test_rc": rc,
        "test_cmd": cmd,
    }
    (out_dir / "grade.json").write_text(json.dumps(res, indent=1))
    return res
