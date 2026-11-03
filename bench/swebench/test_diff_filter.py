#!/usr/bin/env python3
"""Tests for the P0-2 evidence exclusion and the P0-3 per-run uv cache.

Stdlib only: the harness modules under test must not pull in pandas /
swebench, so these tests can run anywhere (CI node suite shells out here).
"""
import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "harness"))

import agent_env
import diff_filter

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
