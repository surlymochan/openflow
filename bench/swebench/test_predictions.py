#!/usr/bin/env python3
"""Tests for F3: official SWE-bench predictions emitted by run.py.

Stdlib only, like test_diff_filter.py: the predictions module is part of the
bench harness contract and must be importable without pandas / swebench.
"""
import gzip
import json
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

sys.path.insert(0, str(Path(__file__).resolve().parent / "harness"))

import predictions

PATCH = """\
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
+{}
"""

CLEAN_PATCH = """\
diff --git a/src/fix.py b/src/fix.py
--- a/src/fix.py
+++ b/src/fix.py
@@ -1 +1 @@
-old
+new
"""


class PredictionsTest(unittest.TestCase):
    def test_make_prediction_has_exact_official_fields_and_filters_evidence(self):
        pred = predictions.make_prediction(
            "sympy__sympy-14248",
            "openflow",
            PATCH,
            models=["deepseek/deepseek-flash"],
        )
        self.assertEqual(tuple(pred.keys()), predictions.FIELDS)
        self.assertEqual(pred["instance_id"], "sympy__sympy-14248")
        self.assertEqual(
            pred["model_name_or_path"], "openflow+deepseek-v4.1-flash(pi)"
        )
        self.assertEqual(pred["model_patch"], CLEAN_PATCH)

    def test_model_label_override_and_filename_rules(self):
        pred = predictions.make_prediction(
            "pytest-dev__pytest-5787",
            "baseline",
            CLEAN_PATCH,
            model_label="some-model",
        )
        self.assertEqual(pred["model_name_or_path"], "baseline+some-model")
        self.assertEqual(
            predictions.prediction_filename("baseline", 1),
            "preds-baseline-filtered.jsonl",
        )
        self.assertEqual(
            predictions.prediction_filename("baseline", 3),
            "preds-baseline-r3-filtered.jsonl",
        )

    def test_missing_model_is_an_error_not_a_guess(self):
        with self.assertRaises(ValueError):
            predictions.make_prediction(
                "pytest-dev__pytest-5787", "baseline", CLEAN_PATCH
            )

    def test_append_prediction_writes_parseable_official_jsonl(self):
        with TemporaryDirectory() as td:
            path = Path(td) / "preds-baseline-filtered.jsonl"
            pred = predictions.make_prediction(
                "pytest-dev__pytest-5787",
                "baseline",
                CLEAN_PATCH,
                model_label="some-model",
            )
            predictions.append_prediction(path, pred)
            predictions.append_prediction(path, pred)
            lines = path.read_text().splitlines()
            self.assertEqual(len(lines), 2)
            for line in lines:
                self.assertEqual(json.loads(line), pred)

    def test_upsert_replaces_same_instance_without_duplicating(self):
        with TemporaryDirectory() as td:
            path = Path(td) / "preds-baseline-filtered.jsonl"
            first = predictions.make_prediction(
                "pytest-dev__pytest-5787",
                "baseline",
                CLEAN_PATCH,
                model_label="some-model",
            )
            changed_patch = CLEAN_PATCH.replace("+new", "+newer")
            second = predictions.make_prediction(
                "pytest-dev__pytest-5787",
                "baseline",
                changed_patch,
                model_label="some-model",
            )
            predictions.upsert_prediction(path, first)
            predictions.upsert_prediction(path, second)
            rows = [
                json.loads(line)
                for line in path.read_text().splitlines()
            ]
            self.assertEqual(rows, [second])

    def test_saved_predictions_handle_plain_and_gzip_and_sort_instances(self):
        with TemporaryDirectory() as td:
            root = Path(td)
            raw = root / "raw"
            # Create the lexicographically later instance first; export must
            # still be instance-sorted like the pilot converter.
            later = raw / "baseline" / "sympy__sympy-17630" / "r1"
            later.mkdir(parents=True)
            (later / "solution.diff.gz").write_bytes(
                gzip.compress(PATCH.encode())
            )
            earlier = raw / "baseline" / "pylint-dev__pylint-8898" / "r1"
            earlier.mkdir(parents=True)
            (earlier / "solution.diff").write_text(CLEAN_PATCH)

            outputs = predictions.write_saved_predictions(
                raw, root / "out", ["baseline"], "deepseek-v4.1-flash(pi)"
            )
            rows = [
                json.loads(line)
                for line in outputs["baseline"].read_text().splitlines()
            ]
            self.assertEqual(
                [r["instance_id"] for r in rows],
                ["pylint-dev__pylint-8898", "sympy__sympy-17630"],
            )
            self.assertTrue(
                all(tuple(r.keys()) == predictions.FIELDS for r in rows)
            )
            self.assertTrue(
                all(
                    r["model_name_or_path"]
                    == "baseline+deepseek-v4.1-flash(pi)"
                    for r in rows
                )
            )
            self.assertEqual(rows[1]["model_patch"], CLEAN_PATCH)

    def test_validate_prediction_rejects_extra_fields(self):
        pred = predictions.make_prediction(
            "pytest-dev__pytest-5787",
            "baseline",
            CLEAN_PATCH,
            model_label="some-model",
        )
        with self.assertRaises(ValueError):
            predictions.validate_prediction({**pred, "resolved": True})


if __name__ == "__main__":
    unittest.main()
