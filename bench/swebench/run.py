#!/usr/bin/env python3
"""Matrix runner: instances x arms x repeats. Resumable: cells already in the jsonl are skipped.

  .venv/bin/python run.py --arms baseline --reps 1 --jobs 4 --out results/runs.jsonl
"""
import argparse, json, os, shutil, sys, threading, time, traceback
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "harness"))
import swe_env as E  # noqa: E402
import arms as A  # noqa: E402

ROOT = Path(__file__).resolve().parent
LOCK = threading.Lock()


def instances():
    return json.loads((ROOT / "instances.json").read_text())["instances"]


def cell(inst, arm, rep, out, stamp, raw_root, label):
    iid = inst["instance_id"]
    short = iid.split("__")[-1]
    rundir = ROOT / "tmp" / "runs" / stamp / arm / iid / f"r{rep}"
    shutil.rmtree(rundir, ignore_errors=True)
    repo, venv, events = rundir / "repo", rundir / "venv", raw_root / arm / iid / f"r{rep}"
    shutil.rmtree(events, ignore_errors=True)
    events.mkdir(parents=True)
    rec = {"instance_id": iid, "arm": arm, "rep": rep, "started": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "model": []}
    try:
        E.checkout(inst, repo)
        E.build_env(inst, repo, venv, events / "env.log")
        base = E.sh(E.GIT + ["rev-parse", "HEAD"], cwd=repo).stdout.strip()
        tid = f"gity-swe-{label + '-' if label else ''}{arm}-{short}-r{rep}"
        t0 = time.time()
        calls = A.ARMS[arm](inst, repo, venv, events, tid)
        rec["wall_s"] = round(time.time() - t0, 1)
        mf = events / "measure-from.txt"
        frm = mf.read_text().strip() if mf.exists() else base
        E.sh(E.GIT + ["add", "-A"], cwd=repo, check=False)
        diff = E.sh(E.GIT + ["diff", "--no-ext-diff", "--cached", frm, "--", ".", ":(exclude).xflow", ":(exclude).as-xflow"], cwd=repo, check=False, errors="replace").stdout
        E.sh(E.GIT + ["diff", "--cached", frm, "--stat"], cwd=repo, check=False)
        (events / "solution.diff").write_text(diff)
        E.sh(E.GIT + ["reset", "-q"], cwd=repo, check=False)
        rec["diff_lines"] = sum(1 for l in diff.splitlines() if l[:1] in "+-" and l[:3] not in ("+++", "---"))
        rec["calls"] = [{k: c.get(k) for k in ("label", "rc", "wall_s", "usage", "note", "merge")} |
                        {"task_id": (c.get("record") or {}).get("task_id"),
                         "guard_blocked": (c.get("record") or {}).get("guard_blocked"),
                         "timed_out": (c.get("record") or {}).get("timed_out")} for c in calls]
        models = set()
        need_executor_records = False
        for c in calls:
            r = c.get("record") or {}
            if r:
                if r.get("model"):
                    models.add(r["model"])
            else:
                need_executor_records = True
        if need_executor_records:
            for f in events.glob("executor-*-record.json"):
                try:
                    rr = json.loads(f.read_text())
                except Exception:
                    continue
                if rr.get("model"):
                    models.add(rr["model"])
        rec["model"] = sorted(models)
        tot = {k: sum((c.get("usage") or {}).get(k, 0) for c in calls) for k in ("input", "output", "cache_read", "cache_write")}
        rec["tokens"] = tot
        rec["timed_out"] = any((c.get("record") or {}).get("timed_out") or c.get("rc") in (124, 137) for c in calls) or rec["wall_s"] >= A.CAP_S
        rec["errors"] = [e for c in calls for e in (c.get("usage") or {}).get("errors", [])][:5]
        g = E.grade(inst, repo, venv, events / "grade")
        rec["resolved"] = bool(g.get("resolved"))
        rec["grade"] = {k: g.get(k) for k in ("f2p", "p2p", "f2p_failed", "p2p_failed", "error")}
    except Exception as e:  # harness failure, not a model failure: recorded and excluded from n
        rec["harness_error"] = (str(e) + "\n" + traceback.format_exc())[-2000:]
    rec["finished"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    with LOCK:
        with open(out, "a") as f:
            f.write(json.dumps(rec) + "\n")
    shutil.rmtree(rundir, ignore_errors=True)
    print(json.dumps({k: rec.get(k) for k in ("instance_id", "arm", "rep", "resolved", "wall_s", "timed_out", "harness_error")})[:400], flush=True)
    return rec


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--arms", default="baseline")
    ap.add_argument("--reps", type=int, default=1)
    ap.add_argument("--rep-start", type=int, default=1)
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--only", default="")
    ap.add_argument("--out", default=str(ROOT / "results" / "runs.jsonl"))
    ap.add_argument("--raw-root", default=str(ROOT / "results" / "raw"))
    ap.add_argument("--label", default="")
    a = ap.parse_args()
    insts = E.load_instances()
    ids = [i for i in instances() if not a.only or i in a.only.split(",")]
    done = set()
    if os.path.exists(a.out):
        for line in open(a.out):
            r = json.loads(line)
            if "harness_error" not in r:
                done.add((r["instance_id"], r["arm"], r["rep"]))
    todo = [(insts[i], arm, rep) for rep in range(a.rep_start, a.rep_start + a.reps)
            for arm in a.arms.split(",") for i in ids if (i, arm, rep) not in done]
    stamp = time.strftime("%m%d%H%M")
    for i in ids:
        E.make_tree(insts[i])
    print(f"{len(todo)} cells", flush=True)
    E.lock_sources(True)
    try:
        with ThreadPoolExecutor(a.jobs) as ex:
            list(ex.map(lambda t: cell(*t, a.out, stamp, Path(a.raw_root), a.label), todo))
    finally:
        E.lock_sources(False)


if __name__ == "__main__":
    main()
