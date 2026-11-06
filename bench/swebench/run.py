#!/usr/bin/env python3
"""Matrix runner: instances x arms x repeats. Resumable: cells already in the jsonl are skipped.

  .venv/bin/python run.py --arms baseline --reps 1 --jobs 4 --out results/runs.jsonl

Every generated patch is also written, at generation time, as an official
SWE-bench prediction (one JSONL per arm, filtered patch, exactly the fields
``instance_id`` / ``model_name_or_path`` / ``model_patch``). Saved patches can
be rebuilt through the same path without running any models:

  .venv/bin/python run.py --export-predictions --arms baseline,openflow \
      --raw-root results/raw-deepseek --prediction-model '<model label>'
"""
import argparse, json, os, shutil, sys, threading, time, traceback
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "harness"))
import diff_filter as D  # noqa: E402
import predictions as P  # noqa: E402

# swe_env and arms are imported inside main(), after the predictions-export
# branch: exporting saved patches is stdlib-only and must not require the
# pandas/swebench/model-runner environment.

ROOT = Path(__file__).resolve().parent
LOCK = threading.Lock()
PREDICTION_LOCK = threading.Lock()


def instances():
    return json.loads((ROOT / "instances.json").read_text())["instances"]


def default_predictions_dir(raw_root):
    """Predictions directory paired with a raw tree (raw-deepseek -> predictions-deepseek)."""
    suffix = raw_root.name[3:] if raw_root.name.startswith("raw-") else ""
    return raw_root.parent / f"predictions{suffix}"


def cell(inst, arm, rep, out, stamp, raw_root, label, predictions_dir, prediction_model):
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
        # P0-2 (issue #5): evidence paths (specs/, .xflow/, .as-xflow/) are
        # excluded at diff time and stripped again as a second guard, so a
        # solution patch never carries workflow evidence.
        diff = D.strip_excluded_sections(E.sh(E.GIT + ["diff", "--no-ext-diff", "--cached", frm, "--"] + D.pathspec_args(), cwd=repo, check=False, errors="replace").stdout)
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
        # F3: emit the official SWE-bench prediction in the same run that
        # generated the patch, once the cell has completed. make_prediction
        # re-applies the evidence filter to the already-filtered diff, so
        # this path and the saved-patch export path produce the same record
        # for the same patch. Upserting by instance keeps resumable reruns
        # from duplicating a line.
        prediction = P.make_prediction(
            iid, arm, diff, models=rec["model"], model_label=prediction_model
        )
        prediction_path = predictions_dir / P.prediction_filename(arm, rep)
        with PREDICTION_LOCK:
            P.upsert_prediction(prediction_path, prediction)
        rec["prediction_file"] = prediction_path.name
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
    ap.add_argument("--predictions-dir", default="",
                    help="official predictions output directory (default: paired with --raw-root)")
    ap.add_argument("--prediction-model", default="",
                    help="public model label used after '<arm>+' in model_name_or_path; "
                         "default: derive from the models recorded for each cell")
    ap.add_argument("--export-predictions", action="store_true",
                    help="rebuild predictions from saved solution.diff files under --raw-root "
                         "and exit; requires --prediction-model")
    a = ap.parse_args()
    # Grade dirs are consumed from inside each cell's repo (git apply runs with
    # cwd=repo), so every path handed to cells must be absolute: a relative
    # --raw-root otherwise makes every grade fail with "test_patch did not
    # apply" (the patch path does not resolve from the repo cwd) and cells are
    # silently recorded as unresolved.
    a.out = str(Path(a.out).resolve())
    raw_root = Path(a.raw_root).resolve()
    predictions_dir = Path(a.predictions_dir).resolve() if a.predictions_dir else default_predictions_dir(raw_root)
    if a.export_predictions:
        if not a.prediction_model:
            ap.error("--export-predictions requires --prediction-model")
        outputs = P.write_saved_predictions(
            raw_root, predictions_dir, a.arms.split(","), a.prediction_model,
            rep=a.rep_start,
        )
        print(json.dumps({arm: str(path) for arm, path in outputs.items()}))
        return
    global A, E
    import arms as A  # noqa: E402
    import swe_env as E  # noqa: E402

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
            list(ex.map(lambda t: cell(
                *t, a.out, stamp, raw_root, a.label, predictions_dir,
                a.prediction_model or None,
            ), todo))
    finally:
        E.lock_sources(False)


if __name__ == "__main__":
    main()
