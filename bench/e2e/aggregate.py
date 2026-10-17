#!/usr/bin/env python3
"""Headline aggregation for the README tables.

Token statistics only use runs whose cursor-agent calls all returned a result
event with usage. A run killed at the 20-minute cap has no usage event, so its
tokens are unknown (not zero); the count of such runs is reported.
Usage: python3 aggregate.py results/*.jsonl > results/headline.json
"""
import json, statistics, sys

def q(xs, p):
    xs = sorted(xs)
    if not xs:
        return None
    k = (len(xs) - 1) * p
    lo, hi = int(k), min(int(k) + 1, len(xs) - 1)
    return round(xs[lo] + (xs[hi] - xs[lo]) * (k - lo), 1)

runs = []
for path in sys.argv[1:]:
    for line in open(path, encoding="utf-8"):
        r = json.loads(line)
        if r.get("type") == "run" and not r.get("skipped"):
            runs.append(r)

def stats(rows):
    n = len(rows)
    ok = sum(1 for r in rows if r.get("success") is True)
    to = sum(1 for r in rows if r.get("timed_out"))
    wall = [r["wall_s"] for r in rows]
    have = [r for r in rows if not r.get("timed_out") and (r.get("tokens") or {}).get("total")]
    tot = [r["tokens"]["total"] for r in have]
    io = [r["tokens"]["inputTokens"] + r["tokens"]["outputTokens"] for r in have]
    return {"n": n, "success": ok, "success_pct": round(100 * ok / n, 1) if n else None, "timed_out": to,
            "wall_s": {"median": q(wall, .5), "q1": q(wall, .25), "q3": q(wall, .75), "min": min(wall), "max": max(wall)},
            "tokens_n": len(have),
            "total_tokens": {"median": q(tot, .5), "q1": q(tot, .25), "q3": q(tot, .75)},
            "in_out_tokens": {"median": q(io, .5), "q1": q(io, .25), "q3": q(io, .75)}}

arms = sorted({r["arm"] for r in runs})
out = {"all_runs": {a: stats([r for r in runs if r["arm"] == a]) for a in arms},
       "matched_repeat1": {a: stats([r for r in runs if r["arm"] == a and r["repeat"] == 1]) for a in arms}}
print(json.dumps(out, indent=2))
