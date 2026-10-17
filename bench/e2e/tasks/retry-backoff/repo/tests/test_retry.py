import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from retry import retry


class VisibleRetryTests(unittest.TestCase):
    def test_returns_the_value(self):
        self.assertEqual(retry(lambda: 7), 7)

    def test_successful_call_runs_once(self):
        calls = []

        def fn():
            calls.append(1)
            return "ok"

        self.assertEqual(retry(fn), "ok")
        self.assertEqual(calls, [1])


if __name__ == "__main__":
    unittest.main()
