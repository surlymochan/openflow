import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from deepmerge import deep_merge


class VisibleDeepMergeTests(unittest.TestCase):
    def test_top_level_override_and_addition(self):
        base = {"a": 1, "b": 2}
        merged = deep_merge(base, {"b": 9, "c": 3})
        self.assertEqual(merged, {"a": 1, "b": 9, "c": 3})

    def test_inputs_are_left_unchanged_for_a_flat_merge(self):
        base = {"a": 1}
        override = {"b": 2}
        deep_merge(base, override)
        self.assertEqual(base, {"a": 1})
        self.assertEqual(override, {"b": 2})

    def test_rejects_non_dicts(self):
        with self.assertRaises(TypeError):
            deep_merge(["a"], {"a": 1})


if __name__ == "__main__":
    unittest.main()
