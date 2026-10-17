#!/usr/bin/env python3
"""Run the end-to-end task-completion matrix.

Each cell is one (task, arm, repeat). Hidden tests are copied into a fresh
temp checkout only after the arm exits. Rows already present in the output
jsonl are skipped, so a killed run can be resumed with the same --out path.
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import shutil
import signal
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

from harness.metrics import parse_agent_stream, sum_calls

ROOT = Path(__file__).resolve().parent
TASKS_DIR = ROOT / "tasks"
TMP_DIR = ROOT / "tmp"
ARMS_DIR = ROOT / "arms"
MODEL = "grok-4.7-high"
RUN_TIMEOUT_S = 20 * 60
TEST_TIMEOUT_S = 120


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_tasks(selection: str) -> list[dict]:
    found = []
    for meta_path in sorted(TASKS_DIR.glob("*/meta.json")):
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        task_dir = meta_path.parent
        meta["dir"] = str(task_dir)
        meta["task_md"] = str(task_dir / "TASK.md")
        meta["repo"] = str(task_dir / "repo")
        meta["hidden"] = str(task_dir / "hidden")
        meta.setdefault("id", task_dir.name)
        found.append(meta)
    if selection == "all":
        return found
    wanted = [part.strip() for part in selection.split(",") if part.strip()]
    by_id = {task["id"]: task for task in found}
    missing = [task_id for task_id in wanted if task_id not in by_id]
    if missing:
        raise SystemExit(f"unknown task(s): {', '.join(missing)}")
    return [by_id[task_id] for task_id in wanted]


def existing_keys(path: Path) -> set[tuple]:
    keys = set()
    if not path.is_file():
        return keys
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        if row.get("type") not in (None, "run"):
            continue
        if "task" in row and "arm" in row and "repeat" in row:
            keys.add((row["task"], row["arm"], int(row["repeat"])))
    return keys


def git_cmd(repo: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", "-c", "user.email=bench-e2e@local", "-c", "user.name=bench-e2e", *args],
        cwd=repo,
        text=True,
        capture_output=True,
        check=False,
    )


def init_repo(repo: Path) -> str:
    init = git_cmd(repo, "init", "-b", "main")
    if init.returncode != 0:
        git_cmd(repo, "init")
        git_cmd(repo, "checkout", "-B", "main")
    git_cmd(repo, "add", "-A")
    commit = git_cmd(repo, "commit", "-m", "baseline")
    if commit.returncode != 0:
        raise RuntimeError(commit.stderr.strip() or "git commit failed")
    rev = git_cmd(repo, "rev-parse", "HEAD")
    if rev.returncode != 0:
        raise RuntimeError(rev.stderr.strip() or "git rev-parse failed")
    return rev.stdout.strip()


def copy_repo(src: Path, dest: Path) -> None:
    if dest.exists():
        shutil.rmtree(dest)
    shutil.copytree(
        src,
        dest,
        ignore=shutil.ignore_patterns(".git", "__pycache__", "*.pyc", "*.fixed.js", "*.fixed.py"),
    )


def run_shell(command: str, cwd: Path, timeout: int) -> dict:
    started = time.monotonic()
    try:
        proc = subprocess.run(
            command,
            cwd=cwd,
            shell=True,
            text=True,
            capture_output=True,
            timeout=timeout,
            stdin=subprocess.DEVNULL,
        )
        timed_out = False
        code = proc.returncode
        stdout = proc.stdout
        stderr = proc.stderr
    except subprocess.TimeoutExpired as exc:
        timed_out = True
        code = 124
        stdout = exc.stdout or ""
        stderr = exc.stderr or ""
        if isinstance(stdout, bytes):
            stdout = stdout.decode("utf-8", "replace")
        if isinstance(stderr, bytes):
            stderr = stderr.decode("utf-8", "replace")
    return {
        "command": command,
        "exit_code": code,
        "passed": code == 0 and not timed_out,
        "timed_out": timed_out,
        "wall_s": round(time.monotonic() - started, 3),
        "stdout_tail": (stdout or "")[-2000:],
        "stderr_tail": (stderr or "")[-2000:],
    }


def diff_against(repo: Path, baseline: str) -> tuple[list[str], str]:
    names = git_cmd(repo, "diff", "--name-only", baseline)
    stat = git_cmd(repo, "diff", "--stat", baseline)
    status = git_cmd(repo, "status", "--porcelain")
    files = [line for line in (names.stdout or "").splitlines() if line]
    for line in (status.stdout or "").splitlines():
        if line.startswith("??"):
            path = line[3:].strip()
            if path and path not in files:
                files.append(path)
    stat_text = stat.stdout or ""
    if len(stat_text) > 8000:
        stat_text = stat_text[:8000] + "\n…\n"
    return files, stat_text


def collect_calls(events: Path) -> tuple[list[dict], list[str], str | None]:
    calls = []
    for path in sorted(events.glob("agent-*.jsonl")) + sorted(events.glob("agent-*.json")):
        text = path.read_text(encoding="utf-8", errors="replace")
        calls.append(parse_agent_stream(text, str(path)))
    usage_path = events / "executor-usage.json"
    if usage_path.is_file():
        try:
            payload = json.loads(usage_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            payload = {}
        for call in payload.get("calls") or []:
            if "usage" in call:
                calls.append(call)
    session_ids = []
    reported = None
    for call in calls:
        if call.get("session_id") and call["session_id"] not in session_ids:
            session_ids.append(call["session_id"])
        if call.get("model") and reported is None:
            reported = call["model"]
    return calls, session_ids, reported


def tool_version(events: Path) -> dict:
    path = events / "tool-version.json"
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def kill_process_group(pid: int) -> None:
    try:
        os.killpg(pid, signal.SIGKILL)
    except ProcessLookupError:
        return
    except PermissionError:
        try:
            os.kill(pid, signal.SIGKILL)
        except ProcessLookupError:
            return


def run_arm(arm: str, workdir: Path, task_md: Path, events: Path, env: dict) -> dict:
    script = ARMS_DIR / f"{arm}.sh"
    if not script.is_file():
        raise FileNotFoundError(f"missing arm script {script}")
    events.mkdir(parents=True, exist_ok=True)
    proc = subprocess.Popen(
        ["bash", str(script), str(workdir), str(task_md), str(events)],
        cwd=workdir,
        env=env,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        start_new_session=True,
        text=True,
    )
    timed_out = False
    try:
        stdout, stderr = proc.communicate(timeout=RUN_TIMEOUT_S)
        code = proc.returncode
    except subprocess.TimeoutExpired:
        timed_out = True
        kill_process_group(proc.pid)
        stdout, stderr = proc.communicate()
        code = 124
    (events / "arm-stdout.txt").write_text(stdout or "", encoding="utf-8")
    (events / "arm-stderr.txt").write_text(stderr or "", encoding="utf-8")
    return {"exit_code": code, "timed_out": timed_out}


def prepare_env(meta: dict, base_env: dict) -> dict:
    env = dict(base_env)
    env["BENCH_VISIBLE_CMD"] = meta["visible_command"]
    env["BENCH_TASK_ID"] = meta["id"]
    env["BENCH_MODEL"] = MODEL
    for key in list(env):
        if "HIDDEN" in key.upper():
            del env[key]
    return env


def one_run(meta: dict, arm: str, repeat: int, events_root: Path, base_env: dict) -> dict:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    run_name = f"{stamp}-{meta['id']}-{arm}-r{repeat}"
    run_dir = TMP_DIR / run_name
    workdir = run_dir / "repo"
    events = events_root / run_name
    if run_dir.exists():
        shutil.rmtree(run_dir)
    run_dir.mkdir(parents=True)
    copy_repo(Path(meta["repo"]), workdir)
    task_md = run_dir / "TASK.md"
    shutil.copyfile(meta["task_md"], task_md)
    baseline = init_repo(workdir)
    start = utc_now()
    t0 = time.monotonic()
    arm_result = run_arm(arm, workdir, task_md, events, prepare_env(meta, base_env))
    measure = baseline
    marker = events / "measure-from.txt"
    if marker.is_file():
        marked = marker.read_text(encoding="utf-8").strip()
        if marked:
            measure = marked
    files, stat = diff_against(workdir, measure)
    visible = run_shell(meta["visible_command"], workdir, TEST_TIMEOUT_S)
    hidden_dest = workdir / meta.get("hidden_dest", "_hidden_acceptance")
    if hidden_dest.exists():
        shutil.rmtree(hidden_dest)
    shutil.copytree(meta["hidden"], hidden_dest)
    hidden = run_shell(meta["hidden_command"], workdir, TEST_TIMEOUT_S)
    wall_s = round(time.monotonic() - t0, 3)
    calls, session_ids, reported = collect_calls(events)
    tokens = sum_calls(calls)
    raw_paths = sorted(str(path.relative_to(ROOT)) for path in events.rglob("*") if path.is_file())
    return {
        "type": "run",
        "task": meta["id"],
        "arm": arm,
        "repeat": repeat,
        "start": start,
        "end": utc_now(),
        "wall_s": wall_s,
        "exit_code": arm_result["exit_code"],
        "timed_out": arm_result["timed_out"],
        "skipped": False,
        "tokens": {"calls": calls, **tokens},
        "cursor_agent_calls": len(calls),
        "success": bool(hidden["passed"]),
        "visible_tests": visible,
        "hidden_tests": hidden,
        "files_changed": files,
        "diff_stat": stat,
        "session_ids": session_ids,
        "model": MODEL,
        "model_reported": reported,
        "versions": {"arm": tool_version(events)},
        "raw_events": raw_paths,
        "workdir": str(workdir),
        "baseline": baseline,
        "measure_from": measure,
    }


def skipped_run(meta: dict, arm: str, repeat: int, reason: str) -> dict:
    now = utc_now()
    return {
        "type": "run",
        "task": meta["id"],
        "arm": arm,
        "repeat": repeat,
        "start": now,
        "end": now,
        "wall_s": 0,
        "exit_code": None,
        "timed_out": False,
        "skipped": True,
        "skip_reason": reason,
        "tokens": {"calls": [], **sum_calls([])},
        "cursor_agent_calls": 0,
        "success": None,
        "visible_tests": None,
        "hidden_tests": None,
        "files_changed": [],
        "diff_stat": "",
        "session_ids": [],
        "model": MODEL,
        "model_reported": None,
        "versions": {"arm": {"name": arm}},
        "raw_events": [],
    }


def git_rev(path: Path) -> str | None:
    if not path.is_dir():
        return None
    proc = subprocess.run(
        ["git", "-C", str(path), "rev-parse", "HEAD"],
        text=True,
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0:
        return None
    return proc.stdout.strip()


def cpu_model() -> str:
    try:
        for line in Path("/proc/cpuinfo").read_text(encoding="utf-8", errors="replace").splitlines():
            if line.lower().startswith("model name"):
                return line.split(":", 1)[1].strip()
    except OSError:
        pass
    return platform.processor() or "unknown"


def command_version(cmd: list[str]) -> str | None:
    proc = subprocess.run(cmd, text=True, capture_output=True, check=False)
    if proc.returncode != 0 and not (proc.stdout or proc.stderr):
        return None
    text = (proc.stdout or proc.stderr).strip().splitlines()
    return text[0] if text else None


def environment_record(args: argparse.Namespace) -> dict:
    return {
        "type": "environment",
        "date": utc_now(),
        "cpu": cpu_model(),
        "cpu_count": os.cpu_count(),
        "os": platform.platform(),
        "python": platform.python_version(),
        "node": command_version(["node", "--version"]),
        "cursor_agent": command_version(["cursor-agent", "--version"]),
        "git": command_version(["git", "--version"]),
        "commits": {
            "superpowers": git_rev(Path(os.environ.get("SUPERPOWERS_DIR", "<superpowers-dir>"))),
            "openflow": git_rev(Path("<openflow-dir>")),
            "openswarm": git_rev(Path(os.environ["OPENSWARM_DIR"])) if os.environ.get("OPENSWARM_DIR") else None,
        },
        "openflow_tgz": os.environ.get("OPENFLOW_TGZ"),
        "openswarm_dir": os.environ.get("OPENSWARM_DIR"),
        "superpowers_dir": os.environ.get("SUPERPOWERS_DIR", "<superpowers-dir>"),
        "model": MODEL,
        "cursor_flags": ["-p", "--trust", "--force", "--model", MODEL, "--output-format", "stream-json"],
        "run_timeout_s": RUN_TIMEOUT_S,
        "command": [sys.executable, *sys.argv],
        "arms": args.arms,
        "tasks": args.tasks,
        "repeats": args.repeats,
        "concurrency": args.concurrency,
        "out": args.out,
    }


def append_jsonl(path: Path, row: dict, lock: threading.Lock) -> None:
    line = json.dumps(row, ensure_ascii=False) + "\n"
    with lock:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as handle:
            handle.write(line)
            handle.flush()


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="End-to-end task-completion harness")
    parser.add_argument("--arms", required=True, help="comma-separated arm names, or a single name")
    parser.add_argument("--tasks", default="all", help="all, or comma-separated task ids")
    parser.add_argument("--repeats", type=int, default=3)
    parser.add_argument("--concurrency", type=int, default=4)
    parser.add_argument("--out", required=True, help="jsonl path, for example results/e2e-<date>.jsonl")
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    if args.repeats < 1:
        raise SystemExit("--repeats must be >= 1")
    if args.concurrency < 1:
        raise SystemExit("--concurrency must be >= 1")
    arms = [part.strip() for part in args.arms.split(",") if part.strip()]
    for arm in arms:
        if arm != "omo" and not (ARMS_DIR / f"{arm}.sh").is_file():
            raise SystemExit(f"unknown arm: {arm}")
    tasks = load_tasks(args.tasks)
    out = Path(args.out)
    if not out.is_absolute():
        out = ROOT / out
    events_root = out.parent / "raw"
    events_root.mkdir(parents=True, exist_ok=True)
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    done = existing_keys(out)
    lock = threading.Lock()
    if not any(line.strip().startswith('{"type": "environment"') or '"type": "environment"' in line
               for line in (out.read_text(encoding="utf-8") if out.is_file() else "").splitlines()):
        append_jsonl(out, environment_record(args), lock)

    jobs = []
    for task in tasks:
        for arm in arms:
            for repeat in range(1, args.repeats + 1):
                if (task["id"], arm, repeat) in done:
                    print(f"skip {task['id']} {arm} r{repeat}", flush=True)
                    continue
                jobs.append((task, arm, repeat))
    if not jobs:
        print(f"nothing to run; {out}")
        return 0

    def work(job):
        task, arm, repeat = job
        print(f"start {task['id']} {arm} r{repeat}", flush=True)
        if arm == "omo":
            row = skipped_run(
                task,
                arm,
                repeat,
                "skipped: needs an OpenCode-compatible provider subscription or paid API key",
            )
        else:
            row = one_run(task, arm, repeat, events_root, os.environ.copy())
        append_jsonl(out, row, lock)
        print(
            f"done {task['id']} {arm} r{repeat} success={row['success']} wall_s={row['wall_s']}",
            flush=True,
        )
        return row

    failures = 0
    with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        futures = [pool.submit(work, job) for job in jobs]
        for future in as_completed(futures):
            try:
                future.result()
            except Exception as exc:  # noqa: BLE001 — one cell must not drop the matrix
                failures += 1
                print(f"cell failed: {exc}", file=sys.stderr, flush=True)
    print(f"wrote {out}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
