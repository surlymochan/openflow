#!/usr/bin/env python3
"""Structural checks for instances.json (issue #5, P2-2).

Dataset-free on purpose: membership against the live dataset and the
gold-patch check (harness/validate.py) need the bench environment. What
CI can pin is the shape of the set itself: 15 unique ids from the three
repos, the compared 6 still present, no round-1 (too easy) id leaking
back in, and the round-3 bookkeeping consistent with the list.
"""
import json
import unittest
from pathlib import Path

DATA = json.loads((Path(__file__).resolve().parent / "instances.json").read_text())
PREFIXES = ("sympy__", "pytest-dev__", "pylint-dev__")
COMPARED_6 = {
    "sympy__sympy-14248", "sympy__sympy-17630",
    "pytest-dev__pytest-10356", "pytest-dev__pytest-5787", "pytest-dev__pytest-6197",
    "pylint-dev__pylint-8898",
}


class InstancesTest(unittest.TestCase):
    def test_fifteen_unique_ids_from_the_three_repos(self):
        ids = DATA["instances"]
        self.assertEqual(len(ids), 15)
        self.assertEqual(len(set(ids)), 15)
        for iid in ids:
            self.assertTrue(iid.startswith(PREFIXES), iid)

    def test_compared_six_kept_and_no_round1_ids(self):
        ids = set(DATA["instances"])
        self.assertTrue(COMPARED_6 <= ids)
        round1 = set(DATA["round1_too_easy"]["instances"])
        self.assertFalse(ids & round1)

    def test_round3_bookkeeping_matches_the_list(self):
        ext = DATA["round3_extension"]
        accounted = (
            set(ext["compared_6"])
            | set(ext["added_from_round2_set"])
            | set(ext["added_round3"])
        )
        self.assertEqual(accounted, set(DATA["instances"]))
        self.assertEqual(sorted(ext["validated"]), sorted(ext["added_round3"]))
        self.assertEqual(ext["pending_validation"], [])


if __name__ == "__main__":
    unittest.main()
