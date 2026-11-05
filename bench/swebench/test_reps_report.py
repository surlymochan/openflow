#!/usr/bin/env python3
"""Repeats support (issue #5, P2-1): rep isolation and report aggregation.

run.py has generated per-rep cells since the pilot (--reps N, resumable
by (instance, arm, rep)); what was missing is proof. A fake arm + fake
env drive cell() for reps 1..3 and assert the reps land in disjoint
directories with per-rep prediction files, and report.py is checked for
the median + IQR aggregation the reps round is reported with.

Stdlib only, like the rest of the bench unit tests.
"""
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

BENCH = Path(__file__).resolve().parent
sys.path.insert(0, str(BENCH / "harness"))

import report  # noqa: E402


def _load_run_module():
    spec = importlib.util.spec_from_file_location("swe_run", BENCH / "run.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


FAKE_DIFF = """\
diff --git a/src/fix.py b/src/fix.py
--- a/src/fix.py
+++ b/src/fix.py
@@ -1 +1 @@
-old
+new
"""


class _FakeSh:
    def __call__(self, cmd, cwd=None, check=True, errors=None):
        joined = " ".join(str(c) for c in cmd)
        if "rev-parse" in joined:
            return SimpleNamespace(stdout="base123\n", returncode=0)
        if "--no-ext-diff" in joined:
            return SimpleNamespace(stdout=FAKE_DIFF, returncode=0)
        return SimpleNamespace(stdout="", returncode=0)


class _FakeEnv:
    GIT = ["git"]

    def __init__(self):
        self.sh = _FakeSh()

    def checkout(self, inst, repo):
        Path(repo).mkdir(parents=True, exist_ok=True)

    def build_env(self, inst, repo, venv, log):
        Path(venv).mkdir(parents=True, exist_ok=True)

    def grade(self, inst, repo, venv, grade_dir):
        return {"resolved": True, "f2p": 1, "p2p": 1, "f2p_failed": 0, "p2p_failed": 0, "error": None}


def _fake_arm(inst, repo, venv, events, tid):
    (Path(events) / "marker.txt").write_text(tid)
    return [{
        "label": "fake", "rc": 0, "wall_s": 1.0,
        "usage": {"input": 10, "output": 5, "cache_read": 0, "cache_write": 0},
        "record": {"task_id": tid, "model": "fake-model", "guard_blocked": 0, "timed_out": False},
    }]


class RepIsolationTest(unittest.TestCase):
    def test_reps_land_in_disjoint_dirs_with_per_rep_predictions(self):
        run = _load_run_module()
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            run.ROOT = root
            run.E = _FakeEnv()
            run.A = SimpleNamespace(CAP_S=1200, ARMS={"fake": _fake_arm})
            out = root / "runs.jsonl"
            raw_root = root / "raw"
            preds = root / "preds"
            inst = {"instance_id": "sympy__sympy-0000"}
            for rep in (1, 2, 3):
                rec = run.cell(inst, "fake", rep, out, "stamp", raw_root, "", preds, None)
                self.assertNotIn("harness_error", rec, rec.get("harness_error"))
            recs = [json.loads(l) for l in out.read_text().splitlines()]
            self.assertEqual([r["rep"] for r in recs], [1, 2, 3])
            for rep in (1, 2, 3):
                events = raw_root / "fake" / inst["instance_id"] / f"r{rep}"
                self.assertTrue((events / "solution.diff").exists(), events)
                self.assertEqual((events / "marker.txt").read_text(), f"gity-swe-fake-sympy-0000-r{rep}")
            names = sorted(p.name for p in preds.iterdir())
            self.assertEqual(names, [
                "preds-fake-filtered.jsonl",
                "preds-fake-r2-filtered.jsonl",
                "preds-fake-r3-filtered.jsonl",
            ])


class QuantilesTest(unittest.TestCase):
    def test_quantiles_math(self):
        self.assertEqual(report.quantiles([]), (None, None, None))
        self.assertEqual(report.quantiles([5]), (5, 5, 5))
        self.assertEqual(report.quantiles([10, 20, 30]), (15.0, 20, 25.0))
        self.assertEqual(report.quantiles([300, 100, 200, 100, 300, 200]), (125.0, 200, 275.0))


def _rec(iid, rep, wall, resolved, tokens):
    return {
        "instance_id": iid, "arm": "baseline", "rep": rep, "resolved": resolved,
        "wall_s": wall, "tokens": tokens, "timed_out": False, "errors": [], "calls": [],
    }


class ReportAggregationTest(unittest.TestCase):
    def test_median_iqr_aggregation_over_reps(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            runs = root / "runs.jsonl"
            tok = {"input": 100, "output": 50, "cache_read": 1000, "cache_write": 0}
            recs = []
            for rep, wall in ((1, 100), (2, 200), (3, 300)):
                recs.append(_rec("sympy__sympy-1", rep, wall, rep != 3, tok))
                recs.append(_rec("sympy__sympy-2", rep, wall, True, tok))
            runs.write_text("\n".join(json.dumps(r) for r in recs) + "\n")
            outdir = root / "out"
            proc = subprocess.run(
                [sys.executable, str(BENCH / "report.py"), str(runs),
                 "--out", str(outdir), "--raw", str(root / "raw")],
                capture_output=True, text=True)
            self.assertEqual(proc.returncode, 0, proc.stderr)
            summary = json.loads((outdir / "summary.json").read_text())
            arm = summary["arms"]["baseline"]
            self.assertEqual(arm["n"], 6)
            self.assertEqual(arm["instances"], 2)
            self.assertEqual(arm["resolved"], 5)
            self.assertEqual(tuple(arm["wall_s_q1_med_q3"]), (125.0, 200.0, 275.0))
            self.assertEqual(tuple(arm["tokens_total_incl_cache_q1_med_q3"]), (1150.0, 1150.0, 1150.0))
            for row in arm["cost"].values():
                self.assertEqual(len(row["q1_med_q3"]), 3)
            self.assertEqual(summary["per_instance"]["sympy__sympy-1"]["baseline"], [2, 3])
            tables = (outdir / "tables.md").read_text()
            self.assertIn("Median tokens incl. cache (IQR)", tables)


if __name__ == "__main__":
    unittest.main()
