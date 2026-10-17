#!/usr/bin/env python3
"""Check every task without a model.

The original repo passes its visible tests and fails the hidden tests.
solution.patch, applied outside the repo the agent sees, passes both.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TASKS = ROOT / "tasks"


def run(command: str, cwd: Path) -> subprocess.CompletedProcess:
    return subprocess.run(
        command,
        cwd=cwd,
        shell=True,
        text=True,
        capture_output=True,
        check=False,
    )


def prepare(repo_src: Path, dest: Path) -> None:
    if dest.exists():
        shutil.rmtree(dest)
    shutil.copytree(repo_src, dest, ignore=shutil.ignore_patterns(".git", "__pycache__", "*.pyc"))


def apply_patch(repo: Path, patch: Path) -> None:
    proc = subprocess.run(
        ["patch", "-p1", "--forward", "--batch", "-i", str(patch)],
        cwd=repo,
        text=True,
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0:
        raise AssertionError(f"patch failed in {repo}:\n{proc.stdout}\n{proc.stderr}")


def assert_count(path: Path) -> int:
    text = path.read_text(encoding="utf-8")
    return text.count("assert")


def check_task(task_dir: Path) -> None:
    meta = json.loads((task_dir / "meta.json").read_text(encoding="utf-8"))
    repo_src = task_dir / "repo"
    hidden = task_dir / "hidden"
    patch = task_dir / "solution.patch"
    task_md = (task_dir / "TASK.md").read_text(encoding="utf-8")
    if meta["id"] != task_dir.name:
        raise AssertionError(f"{task_dir.name}: meta id is {meta['id']}")
    if not repo_src.is_dir() or not hidden.is_dir() or not patch.is_file():
        raise AssertionError(f"{meta['id']}: missing repo, hidden, or solution.patch")
    if (repo_src / "hidden").exists() or (repo_src / "_hidden_acceptance").exists():
        raise AssertionError(f"{meta['id']}: hidden tests are inside repo/")
    if "hidden/" in task_md.lower() or "_hidden" in task_md:
        raise AssertionError(f"{meta['id']}: TASK.md mentions the hidden suite")
    hidden_files = [path for path in hidden.rglob("*") if path.is_file()]
    if sum(assert_count(path) for path in hidden_files) < 4:
        raise AssertionError(f"{meta['id']}: hidden tests need at least 4 assertions")
    if not any("regression" in path.read_text(encoding="utf-8").lower() for path in hidden_files):
        raise AssertionError(f"{meta['id']}: hidden tests need a regression assertion")

    with tempfile.TemporaryDirectory(prefix=f"validate-{meta['id']}-") as tmp:
        base = Path(tmp)
        original = base / "original"
        prepare(repo_src, original)
        visible = run(meta["visible_command"], original)
        if visible.returncode != 0:
            raise AssertionError(
                f"{meta['id']}: visible tests failed on the original repo\n{visible.stdout}\n{visible.stderr}"
            )
        shutil.copytree(hidden, original / meta["hidden_dest"])
        hidden_run = run(meta["hidden_command"], original)
        if hidden_run.returncode == 0:
            raise AssertionError(f"{meta['id']}: hidden tests passed on the original repo")

        fixed = base / "fixed"
        prepare(repo_src, fixed)
        apply_patch(fixed, patch)
        visible_fixed = run(meta["visible_command"], fixed)
        if visible_fixed.returncode != 0:
            raise AssertionError(
                f"{meta['id']}: visible tests failed after solution.patch\n{visible_fixed.stdout}\n{visible_fixed.stderr}"
            )
        shutil.copytree(hidden, fixed / meta["hidden_dest"])
        hidden_fixed = run(meta["hidden_command"], fixed)
        if hidden_fixed.returncode != 0:
            raise AssertionError(
                f"{meta['id']}: hidden tests failed after solution.patch\n{hidden_fixed.stdout}\n{hidden_fixed.stderr}"
            )
    print(f"ok {meta['id']}")


def main() -> int:
    failures = 0
    for task_dir in sorted(path for path in TASKS.iterdir() if (path / "meta.json").is_file()):
        try:
            check_task(task_dir)
        except AssertionError as exc:
            failures += 1
            print(exc, file=sys.stderr)
    if failures:
        print(f"{failures} task(s) failed validation", file=sys.stderr)
        return 1
    print("all tasks validated")
    return 0


if __name__ == "__main__":
    sys.exit(main())
