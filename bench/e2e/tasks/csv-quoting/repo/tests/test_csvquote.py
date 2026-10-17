import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from csvquote import format_csv, parse_csv


class VisibleCsvTests(unittest.TestCase):
    def test_simple_roundtrip(self):
        rows = [["name", "age"], ["ada", "36"]]
        self.assertEqual(parse_csv(format_csv(rows)), rows)

    def test_empty_input(self):
        self.assertEqual(parse_csv(""), [])

    def test_single_column(self):
        self.assertEqual(parse_csv(format_csv([["only"]])), [["only"]])


if __name__ == "__main__":
    unittest.main()
