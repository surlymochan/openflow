# deep_merge replaces nested objects instead of merging them

`deep_merge(base, override)` in `deepmerge.py` returns a new configuration dict.

When the same key holds a dict on both sides, merge those dicts key by key, all the way down. Every other value from the override replaces the base value, including lists and `None`. Keys that exist only on the base stay in place. Do not mutate `base` or `override`. A non-dict argument raises `TypeError`.

A flat override already works, and the visible tests (`python3 -m unittest tests/test_deepmerge.py`) pass. Nested server settings are replaced as a whole, so unspecified keys inside them disappear. Please merge nested dicts.
