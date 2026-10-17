import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from csvquote import format_csv, parse_csv


class HiddenCsvTests(unittest.TestCase):
    def test_comma_inside_a_field_roundtrips(self):
        rows = [["city", "note"], ["Paris", "left, right"]]
        self.assertEqual(parse_csv(format_csv(rows)), rows)

    def test_quotes_inside_a_field_are_doubled(self):
        rows = [["title"], ['say "hello"']]
        text = format_csv(rows)
        self.assertIn('""', text)
        self.assertEqual(parse_csv(text), rows)

    def test_newline_inside_a_field_stays_one_row(self):
        rows = [["line1\nline2", "tail"]]
        parsed = parse_csv(format_csv(rows))
        self.assertEqual(parsed, rows)
        self.assertEqual(len(parsed), 1)
        self.assertIn("\n", parsed[0][0])

    def test_empty_field_is_preserved(self):
        rows = [["a", "", "c"]]
        self.assertEqual(parse_csv(format_csv(rows)), rows)

    def test_regression_plain_row_still_roundtrips(self):
        rows = [["name", "age"], ["ada", "36"]]
        self.assertEqual(parse_csv(format_csv(rows)), rows)


if __name__ == "__main__":
    unittest.main()
