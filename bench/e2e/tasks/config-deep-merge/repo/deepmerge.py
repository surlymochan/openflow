"""Merge two configuration dictionaries."""

def deep_merge(base, override):
    """Return a new dict with override applied on top of base."""
    if not isinstance(base, dict) or not isinstance(override, dict):
        raise TypeError("both arguments must be dicts")
    merged = dict(base)
    merged.update(override)
    return merged
