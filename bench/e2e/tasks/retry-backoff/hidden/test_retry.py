import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from retry import retry


class HiddenRetryTests(unittest.TestCase):
    def test_retries_until_the_third_attempt_succeeds(self):
        state = {"n": 0}

        def fn():
            state["n"] += 1
            if state["n"] < 3:
                raise RuntimeError("not yet")
            return "ok"

        delays = []
        result = retry(fn, attempts=3, base_delay=1, factor=2, sleep=delays.append)
        self.assertEqual(result, "ok")
        self.assertEqual(state["n"], 3)
        self.assertEqual(delays, [1, 2])

    def test_gives_up_with_the_last_exception(self):
        delays = []

        def fn():
            raise ValueError("boom")

        with self.assertRaises(ValueError):
            retry(fn, attempts=2, base_delay=5, factor=3, sleep=delays.append)
        self.assertEqual(delays, [5])

    def test_a_single_attempt_does_not_sleep(self):
        delays = []

        def fn():
            raise RuntimeError("nope")

        with self.assertRaises(RuntimeError):
            retry(fn, attempts=1, base_delay=4, factor=2, sleep=delays.append)
        self.assertEqual(delays, [])

    def test_delay_uses_the_factor(self):
        state = {"n": 0}

        def fn():
            state["n"] += 1
            if state["n"] < 3:
                raise RuntimeError("wait")
            return 1

        delays = []
        retry(fn, attempts=4, base_delay=3, factor=4, sleep=delays.append)
        self.assertEqual(delays, [3, 12])

    def test_regression_first_try_success_does_not_sleep(self):
        delays = []
        calls = []

        def fn():
            calls.append(1)
            return "ready"

        self.assertEqual(retry(fn, attempts=5, base_delay=9, sleep=delays.append), "ready")
        self.assertEqual(calls, [1])
        self.assertEqual(delays, [])


if __name__ == "__main__":
    unittest.main()
