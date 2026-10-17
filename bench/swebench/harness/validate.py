"""Gold check, no model: an instance qualifies when the empty patch is NOT resolved and the
gold patch IS resolved in this Docker-free environment."""
import json, random, shutil, sys, time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import swe_env as E

ROOT = E.ROOT
OUT = ROOT / "results" / "validate.jsonl"

def check(iid, insts):
    inst = insts[iid]
    work = ROOT / "tmp" / "validate" / iid
    shutil.rmtree(work, ignore_errors=True)
    rec = {"instance_id": iid, "repo": inst["repo"], "version": inst["version"], "difficulty": inst["difficulty"]}
    t0 = time.time()
    try:
        for mode in ("empty", "gold"):
            d = work / mode
            E.checkout(inst, d / "repo")
            E.build_env(inst, d / "repo", d / "venv", d / "env.log")
            if mode == "gold":
                (d / "gold.patch").write_text(inst["patch"])
                E.sh(E.GIT + ["apply", str(d / "gold.patch")], cwd=d / "repo")
            rec[mode] = E.grade(inst, d / "repo", d / "venv", d / "grade")
        rec["ok"] = (not rec["empty"]["resolved"]) and rec["gold"]["resolved"]
    except Exception as e:
        rec["ok"] = False
        rec["error"] = str(e)[-800:]
    rec["secs"] = round(time.time() - t0, 1)
    if rec["ok"]:
        shutil.rmtree(work, ignore_errors=True)
    return rec

if __name__ == "__main__":
    insts = E.load_instances()
    ids = sys.argv[1:]
    with ThreadPoolExecutor(4) as ex:
        for rec in ex.map(lambda i: check(i, insts), ids):
            print(json.dumps({k: rec.get(k) for k in ("instance_id", "ok", "secs", "error")}), flush=True)
            with open(OUT, "a") as f:
                f.write(json.dumps(rec) + "\n")
