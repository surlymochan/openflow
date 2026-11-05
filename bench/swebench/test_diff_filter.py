#!/usr/bin/env python3
"""Tests for the P0-2 evidence exclusion and the P0-3 per-run uv cache.

Stdlib only: the harness modules under test must not pull in pandas /
swebench, so these tests can run anywhere (CI node suite shells out here).
"""
import gzip
import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "harness"))

import agent_env
import diff_filter

RESULTS = Path(__file__).resolve().parent / "results" / "raw-deepseek" / "openflow"
LIMIT_BYTES = 200 * 1024


def _load_saved_patch(instance: str) -> str | None:
    run = RESULTS / instance / "r1"
    plain, gz = run / "solution.diff", run / "solution.diff.gz"
    if plain.exists():
        return plain.read_text(errors="replace")
    if gz.exists():
        return gzip.open(gz, "rt", errors="replace").read()
    return None


def _evidence_sections(diff_text: str) -> int:
    n = 0
    for line in diff_text.splitlines():
        if line.startswith("diff --git "):
            a, b = diff_filter._section_paths(line)
            if diff_filter._is_excluded(a) or diff_filter._is_excluded(b):
                n += 1
    return n

DIFF = """\
diff --git a/src/fix.py b/src/fix.py
--- a/src/fix.py
+++ b/src/fix.py
@@ -1 +1 @@
-old
+new
diff --git a/specs/changes/abc/status.json b/specs/changes/abc/status.json
--- a/specs/changes/abc/status.json
+++ b/specs/changes/abc/status.json
@@ -0,0 +1 @@
+{}diff --git a/.xflow/GOAL.md b/.xflow/GOAL.md
--- a/.xflow/GOAL.md
+++ b/.xflow/GOAL.md
@@ -0,0 +1 @@
+goal
diff --git a/tests/test_fix.py b/tests/test_fix.py
--- a/tests/test_fix.py
+++ b/tests/test_fix.py
@@ -0,0 +1 @@
+test
"""


class DiffFilterTest(unittest.TestCase):
    def test_pathspec_excludes_evidence_paths(self):
        args = diff_filter.pathspec_args()
        for p in (".xflow", ".as-xflow", "specs"):
            self.assertIn(f":(exclude){p}", args)

    def test_strip_removes_evidence_sections_and_keeps_solution(self):
        out = diff_filter.strip_excluded_sections(DIFF)
        self.assertIn("src/fix.py", out)
        self.assertIn("tests/test_fix.py", out)
        self.assertNotIn("specs/changes", out)
        self.assertNotIn(".xflow/GOAL.md", out)

    def test_strip_is_idempotent_on_clean_diff(self):
        clean = diff_filter.strip_excluded_sections(DIFF)
        self.assertEqual(clean, diff_filter.strip_excluded_sections(clean))


class SavedPatchTest(unittest.TestCase):
    """P0-2 acceptance, pinned against the saved pre-fix OpenFlow patches.

    pytest-10356 / pytest-5787 are the instances named in issue #5: their
    original solution.diff carried ~900-1,200 evidence files (multi-MB).
    After the exclusion (run.py pathspec + this stripper), every saved
    OpenFlow patch must shrink below the 200 KB acceptance limit and keep
    only solution sections.
    """

    # instance -> (min raw bytes, min evidence sections, max stripped bytes)
    CASES = {
        "pytest-dev__pytest-10356": (1_000_000, 1_000, LIMIT_BYTES),
        "pytest-dev__pytest-5787": (1_000_000, 900, LIMIT_BYTES),
        "sympy__sympy-17630": (200_000, 10, LIMIT_BYTES),
    }

    def test_saved_bloated_patches_strip_below_limit(self):
        for instance, (min_raw, min_evidence, max_stripped) in self.CASES.items():
            raw = _load_saved_patch(instance)
            if raw is None:
                self.skipTest(f"saved patch fixture missing: {instance}")
            with self.subTest(instance=instance):
                self.assertGreater(len(raw.encode()), min_raw)
                self.assertGreater(_evidence_sections(raw), min_evidence)
                stripped = diff_filter.strip_excluded_sections(raw)
                self.assertLess(len(stripped.encode()), max_stripped)
                self.assertEqual(_evidence_sections(stripped), 0)
                self.assertIn("diff --git ", stripped)

    def test_every_saved_openflow_patch_strips_below_limit(self):
        if not RESULTS.exists():
            self.skipTest("saved results fixtures missing")
        seen = 0
        for run in sorted(RESULTS.glob("*/r1")):
            raw = _load_saved_patch(run.parent.name)
            if raw is None:
                continue
            seen += 1
            with self.subTest(instance=run.parent.name):
                stripped = diff_filter.strip_excluded_sections(raw)
                self.assertLess(len(stripped.encode()), LIMIT_BYTES)
                self.assertEqual(_evidence_sections(stripped), 0)
        self.assertGreaterEqual(seen, 6)


class AgentEnvTest(unittest.TestCase):
    def test_uv_cache_is_per_run_and_not_the_shared_cache(self):
        a = agent_env.per_run_uv_cache("/runs/r1/venv")
        b = agent_env.per_run_uv_cache("/runs/r2/venv")
        self.assertNotEqual(a, b)
        self.assertNotEqual(a, str(Path(os.path.expanduser("~/.cache/uv"))))
        self.assertTrue(a.startswith("/runs/r1/"))

    def test_with_uv_cache_copies_and_sets(self):
        base = {"PATH": "/bin"}
        out = agent_env.with_uv_cache(base, "/runs/r1/venv")
        self.assertEqual(out["UV_CACHE_DIR"], "/runs/r1/uv-cache")
        self.assertNotIn("UV_CACHE_DIR", base)


if __name__ == "__main__":
    unittest.main()
