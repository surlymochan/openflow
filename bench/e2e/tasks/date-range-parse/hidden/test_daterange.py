import sys
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from daterange import parse_date_range


class HiddenDateRangeTests(unittest.TestCase):
    def test_end_date_is_included(self):
        days = parse_date_range("2024-05-01..2024-05-04")
        self.assertEqual(days[-1], date(2024, 5, 4))
        self.assertEqual(len(days), 4)

    def test_same_day_range_has_one_date(self):
        days = parse_date_range("2024-07-15..2024-07-15")
        self.assertEqual(days, [date(2024, 7, 15)])

    def test_leap_day_is_a_real_endpoint(self):
        days = parse_date_range("2024-02-29..2024-02-29")
        self.assertEqual(days, [date(2024, 2, 29)])

    def test_month_boundary_includes_both_ends(self):
        days = parse_date_range("2024-01-31..2024-02-01")
        self.assertEqual(days, [date(2024, 1, 31), date(2024, 2, 1)])

    def test_regression_start_still_first_and_ordered(self):
        days = parse_date_range("2024-06-01..2024-06-03")
        self.assertEqual(days[0], date(2024, 6, 1))
        self.assertEqual(days, sorted(days))


if __name__ == "__main__":
    unittest.main()
