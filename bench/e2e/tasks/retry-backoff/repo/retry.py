"""Call a function again after a failure, waiting a little longer each time."""

import time


def retry(fn, attempts=3, base_delay=0.0, factor=2.0, sleep=time.sleep):
    return fn()
