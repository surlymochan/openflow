#!/usr/bin/env python3
"""Regrade saved solution patches with the official SWE-bench harness."""
from __future__ import annotations

import argparse
import json
import shutil
import sys
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "harness"))

import swe_env as E


def read_runs(path: Path) -> list[dict]:
    rows = []
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def fmt_pair(value) -> str:
    if isinstance(value, (list, tuple)) and len(value) == 2:
        return f"{value[0]}/{value[1]}"
    return "-"


def regrade_cell(row: dict, inst: dict | None, label: str, raw_root: Path, emit) -> dict:
    iid = row["instance_id"]
    arm = row["arm"]
    rep = row["rep"]
    if inst is None:
        raise RuntimeError(f"instance not found: {iid}")

    workdir = ROOT / "tmp" / "regrade" / label / str(arm) / iid / f"r{rep}"
    if workdir.exists():
        shutil.rmtree(workdir)
    workdir.mkdir(parents=True, exist_ok=True)
    repo = workdir / "repo"
    venv = workdir / "venv"

    E.checkout(inst, repo)
    E.build_env(inst, repo, venv, workdir / "env.log")

    diff = raw_root / str(arm) / iid / f"r{rep}" / "solution.diff"
    patch_applied = False
    if diff.is_file() and diff.stat().st_size > 0:
        ap = E.sh(E.GIT + ["apply", "--whitespace=nowarn", str(diff)], cwd=repo, check=False)
        patch_applied = ap.returncode == 0

    res = E.grade(inst, repo, venv, workdir / "grade")

    dest = diff.parent / "regrade"
    dest.mkdir(parents=True, exist_ok=True)
    for name in ("grade.json", "test_output.txt"):
        src = workdir / "grade" / name
        if src.exists():
            shutil.copy2(src, dest / name)

    line = {
        "instance_id": iid,
        "arm": arm,
        "rep": rep,
        "label": label,
        "original_resolved": row.get("resolved"),
        "resolved": res.get("resolved"),
        "f2p": res.get("f2p"),
        "p2p": res.get("p2p"),
        "f2p_failed": res.get("f2p_failed"),
        "p2p_failed": res.get("p2p_failed"),
        "patch_applied": patch_applied,
        "error": res.get("error"),
    }
    emit(line)

    shutil.rmtree(repo, ignore_errors=True)
    shutil.rmtree(venv, ignore_errors=True)
    return line


def main(argv=None) -> None:
    parser = argparse.ArgumentParser(description="Regrade saved solution patches")
    parser.add_argument("--runs", required=True, help="runs.jsonl from the original run")
    parser.add_argument("--raw", required=True, help="raw results root")
    parser.add_argument("--out", required=True, help="output JSONL file")
    parser.add_argument("--label", required=True, help="model label")
    parser.add_argument("--only-repos", default=None, help="comma-separated repo list")
    parser.add_argument("--jobs", type=int, default=2, help="parallel cells")
    args = parser.parse_args(argv)

    instances = E.load_instances()
    only = None
    if args.only_repos:
        only = {r.strip() for r in args.only_repos.split(",") if r.strip()}

    tasks = []
    for row in read_runs(Path(args.runs)):
        if row.get("harness_error"):
            continue
        inst = instances.get(row.get("instance_id"))
        if only is not None and (inst is None or inst.get("repo") not in only):
            continue
        tasks.append((row, inst))

    results = [None] * len(tasks)
    with open(args.out, "w", encoding="utf-8") as fh:
        lock = threading.Lock()

        def emit(line: dict) -> None:
            with lock:
                fh.write(json.dumps(line) + "\n")
                fh.flush()

        with ThreadPoolExecutor(max_workers=args.jobs) as pool:
            futures = {
                pool.submit(regrade_cell, row, inst, args.label, Path(args.raw), emit): i
                for i, (row, inst) in enumerate(tasks)
            }
            for future in as_completed(futures):
                i = futures[future]
                row = tasks[i][0]
                try:
                    line = future.result()
                except Exception as exc:
                    line = {
                        "instance_id": row.get("instance_id"),
                        "arm": row.get("arm"),
                        "rep": row.get("rep"),
                        "label": args.label,
                        "harness_error": str(exc)[:300],
                    }
                    emit(line)
                results[i] = line

    print()
    print(f"{'arm':<16} {'instance':<42} {'original_resolved -> resolved':<30} {'f2p':>9} {'p2p':>9}")
    for line in results:
        if line is None:
            continue
        arm = str(line.get("arm", ""))
        iid = str(line.get("instance_id", ""))
        if "harness_error" in line:
            print(f"{arm:<16} {iid:<42} ERROR: {line['harness_error']}")
            continue
        transition = f"{line.get('original_resolved')} -> {line.get('resolved')}"
        print(
            f"{arm:<16} {iid:<42} {transition:<30} "
            f"{fmt_pair(line.get('f2p')):>9} {fmt_pair(line.get('p2p')):>9}"
        )


if __name__ == "__main__":
    main()
