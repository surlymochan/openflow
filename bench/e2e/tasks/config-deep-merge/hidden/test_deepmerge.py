import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from deepmerge import deep_merge


class HiddenDeepMergeTests(unittest.TestCase):
    def test_nested_dicts_merge_key_by_key(self):
        base = {"server": {"host": "localhost", "port": 80}, "debug": False}
        override = {"server": {"port": 443}}
        merged = deep_merge(base, override)
        self.assertEqual(merged, {"server": {"host": "localhost", "port": 443}, "debug": False})

    def test_lists_are_replaced_rather_than_concatenated(self):
        base = {"flags": ["a", "b"], "name": "old"}
        merged = deep_merge(base, {"flags": ["c"]})
        self.assertEqual(merged["flags"], ["c"])
        self.assertEqual(merged["name"], "old")

    def test_inputs_are_not_mutated_when_nested(self):
        base = {"server": {"port": 80}}
        override = {"server": {"port": 443, "tls": True}}
        deep_merge(base, override)
        self.assertEqual(base, {"server": {"port": 80}})
        self.assertEqual(override, {"server": {"port": 443, "tls": True}})

    def test_none_in_the_override_replaces_the_value(self):
        merged = deep_merge({"a": 1, "b": {"c": 2}}, {"a": None})
        self.assertIsNone(merged["a"])
        self.assertEqual(merged["b"], {"c": 2})

    def test_regression_flat_override_still_wins(self):
        merged = deep_merge({"a": 1, "b": 2}, {"b": 9, "c": 3})
        self.assertEqual(merged, {"a": 1, "b": 9, "c": 3})


if __name__ == "__main__":
    unittest.main()
