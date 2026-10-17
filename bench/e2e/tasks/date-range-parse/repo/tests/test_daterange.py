import sys
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from daterange import parse_date_range


class VisibleDateRangeTests(unittest.TestCase):
    def test_start_is_first(self):
        days = parse_date_range("2024-05-01..2024-05-04")
        self.assertEqual(days[0], date(2024, 5, 1))
        self.assertGreaterEqual(len(days), 1)

    def test_rejects_garbage(self):
        with self.assertRaises(ValueError):
            parse_date_range("not-a-range")

    def test_rejects_inverted(self):
        with self.assertRaises(ValueError):
            parse_date_range("2024-05-04..2024-05-01")


if __name__ == "__main__":
    unittest.main()
