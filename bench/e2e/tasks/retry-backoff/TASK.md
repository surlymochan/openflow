# retry never tries again

`retry` in `retry.py` should call `fn` until it returns or the attempt budget is spent.

```python
retry(fn, attempts=3, base_delay=0.0, factor=2.0, sleep=time.sleep)
```

- `attempts` is how many times `fn` may run. It is at least 1.
- When `fn` raises, wait and try again. The wait before the next attempt is `base_delay * (factor ** failures_so_far)`, so the first wait is `base_delay`, then `base_delay * factor`, and so on.
- Pass that delay to `sleep`. Tests inject `sleep` so they do not wait on the wall clock. Keep the default as `time.sleep`.
- When the last attempt raises, propagate that exception. Do not sleep after the final failure.
- A first-try success returns immediately and does not sleep.

Today the function calls `fn` once and returns, so a later success is never reached. Visible tests (`python3 -m unittest tests/test_retry.py`) pass. Please implement the retries.
