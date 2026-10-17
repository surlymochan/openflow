"""Token parsing and aggregate statistics. Standard library only."""

from __future__ import annotations

import json
from typing import Iterable, Iterator


USAGE_KEYS = (
    "inputTokens",
    "outputTokens",
    "cacheReadTokens",
    "cacheWriteTokens",
)

_ALIASES = {
    "inputTokens": ("inputTokens", "input_tokens", "input"),
    "outputTokens": ("outputTokens", "output_tokens", "output"),
    "cacheReadTokens": ("cacheReadTokens", "cache_read_tokens", "cache_read"),
    "cacheWriteTokens": ("cacheWriteTokens", "cache_write_tokens", "cache_write"),
}


def empty_usage() -> dict:
    return {key: 0 for key in USAGE_KEYS}


def looks_like_usage(obj: object) -> bool:
    if not isinstance(obj, dict):
        return False
    for names in _ALIASES.values():
        if any(name in obj for name in names):
            return True
    return False


def normalize_usage(obj: dict) -> dict:
    usage = empty_usage()
    for key, names in _ALIASES.items():
        for name in names:
            if name in obj and obj[name] is not None:
                usage[key] = int(obj[name])
                break
    return usage


def usage_total(usage: dict) -> int:
    """Full context: cursor-agent already subtracts cache tokens from inputTokens."""
    return sum(int(usage.get(key) or 0) for key in USAGE_KEYS)


def add_usage(left: dict, right: dict) -> dict:
    out = empty_usage()
    for key in USAGE_KEYS:
        out[key] = int(left.get(key) or 0) + int(right.get(key) or 0)
    return out


def iter_json_events(text: str) -> Iterator[dict]:
    stripped = text.strip()
    if not stripped:
        return
    try:
        obj = json.loads(stripped)
    except json.JSONDecodeError:
        obj = None
    if isinstance(obj, dict):
        yield obj
        return
    if isinstance(obj, list):
        for item in obj:
            if isinstance(item, dict):
                yield item
        return
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            item = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(item, dict):
            yield item


def parse_agent_stream(text: str, source: str) -> dict:
    """One cursor-agent invocation. Usage comes from the result event."""
    session_id = None
    model = None
    usage = None
    saw_result = False
    for event in iter_json_events(text):
        if event.get("type") == "system" and event.get("subtype") == "init":
            session_id = event.get("session_id") or session_id
            model = event.get("model") or model
        if event.get("type") == "result":
            saw_result = True
            session_id = event.get("session_id") or session_id
            if looks_like_usage(event.get("usage")):
                usage = normalize_usage(event["usage"])
    return {
        "source": source,
        "session_id": session_id,
        "model": model,
        "usage": usage if usage is not None else empty_usage(),
        "missing_usage": usage is None,
        "saw_result": saw_result,
    }


def sum_calls(calls: Iterable[dict]) -> dict:
    total = empty_usage()
    for call in calls:
        total = add_usage(total, call.get("usage") or empty_usage())
    total["total"] = usage_total(total)
    return total


def quantile(values: list[float], p: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    if len(ordered) == 1:
        return float(ordered[0])
    index = (len(ordered) - 1) * p
    low = int(index)
    high = min(low + 1, len(ordered) - 1)
    frac = index - low
    return float(ordered[low] * (1 - frac) + ordered[high] * frac)


def summarise(values: list[float]) -> dict:
    if not values:
        return {
            "n": 0,
            "median": None,
            "q1": None,
            "q3": None,
            "iqr": None,
            "min": None,
            "max": None,
        }
    q1 = quantile(values, 0.25)
    q3 = quantile(values, 0.75)
    median = quantile(values, 0.5)
    return {
        "n": len(values),
        "median": median,
        "q1": q1,
        "q3": q3,
        "iqr": None if q1 is None or q3 is None else q3 - q1,
        "min": min(values),
        "max": max(values),
    }
