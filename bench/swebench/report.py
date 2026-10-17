#!/usr/bin/env python3
"""Summaries from run records only (no model output is trusted). Writes summary.json and tables.md.

  python3 report.py results/runs.jsonl [--out results] [--raw results/raw]
"""
import argparse, json, statistics, sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ARM_ORDER = ["baseline", "superpowers", "openflow", "openswarm"]


def quantiles(xs):
    xs = sorted(xs)
    if not xs:
        return None, None, None
    if len(xs) == 1:
        return xs[0], xs[0], xs[0]
    q = statistics.quantiles(xs, n=4, method="inclusive")
    return q[0], statistics.median(xs), q[2]


def cost(tok, row):
    return (tok["input"] * row["in"] + tok["output"] * row["out"] + tok["cache_read"] * row["cache_read"]
            + tok["cache_write"] * row["cache_write"]) / 1e6


LEAK_MARKERS = ("bench-swe/repos", "bench-swe/data", "verified.parquet", "bench-swe/results", "SWE-bench_Verified",
                "huggingface.co", "github.com/sympy", "github.com/pytest-dev", "github.com/pylint-dev", "pip download",
                "pypi.org", "files.pythonhosted.org", "pip install sympy", "pip install pytest", "pip install pylint",
                "site-packages/sympy", "site-packages/_pytest", "site-packages/pylint", ".cache/pip", ".cache/uv",
                "git clone", "raw.githubusercontent.com", "api.github.com")


def rate_limit_stats(raw_dir, arm, instance_id, rep):
    """Rate-limit (429) retries and last-call stop reason for one run, from its event logs.

    retries: assistant `message_end` events whose message.errorMessage mentions 429 / rate_limit.
    ended_in_error: True if the LAST assistant `message_end` of any events file has stopReason "error".
    """
    d = Path(raw_dir) / arm / instance_id / ("r%d" % rep)
    retries = 0
    ended_in_error = False
    for f in sorted(d.glob("*-events.jsonl")):
        last = None
        with f.open(errors="replace") as fh:
            for line in fh:
                if '"message_end"' not in line:
                    continue
                try:
                    ev = json.loads(line)
                except ValueError:
                    continue
                if not isinstance(ev, dict) or ev.get("type") != "message_end":
                    continue
                msg = ev.get("message")
                if not isinstance(msg, dict) or msg.get("role") != "assistant":
                    continue
                err = msg.get("errorMessage") or ""
                if "429" in err or "rate_limit" in err.lower():
                    retries += 1
                last = msg
        if last is not None and last.get("stopReason") == "error":
            ended_in_error = True
    return {"retries": retries, "ended_in_error": ended_in_error}


def leak_scan(raw_root):
    """Tool calls that touched the upstream mirrors, the dataset or other runs' results."""
    hits = {}
    for f in Path(raw_root).glob("*/*/r*/*-events.jsonl"):
        for line in f.open(errors="replace"):
            if '"tool_execution_start"' not in line:
                continue
            for m in LEAK_MARKERS:
                if m in line:
                    key = "/".join(f.parts[-4:-1])
                    hits.setdefault(key, set()).add(m)
    return {k: sorted(v) for k, v in hits.items()}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path")
    ap.add_argument("--out")
    ap.add_argument("--raw")
    ap.add_argument("--price", default="minimax")
    ap.add_argument("--model-label", default="")
    ap.add_argument("--only-instances", default="")
    ap.add_argument("--exclude")
    args = ap.parse_args()
    path = Path(args.path)
    out = Path(args.out) if args.out else path.parent
    raw = Path(args.raw) if args.raw else ROOT / "results" / "raw"
    out.mkdir(parents=True, exist_ok=True)
    prices = json.loads((ROOT / "prices.json").read_text())["rows"]
    if args.price not in {r["id"] for r in prices}:
        raise SystemExit(f"unknown price row: {args.price}")
    other_rows = [r for r in prices if r.get("computed_not_billed")]
    recs = [json.loads(l) for l in path.open()]
    if args.only_instances:
        keep = {x.strip() for x in args.only_instances.split(",") if x.strip()}
        recs = [r for r in recs if r["instance_id"] in keep]
    excluded_n = 0
    if args.exclude:
        excluded = {}
        for line in Path(args.exclude).open():
            line = line.strip()
            if not line:
                continue
            o = json.loads(line)
            excluded[(o["instance_id"], o["arm"], o.get("rep", 1))] = o.get("status")
        def is_excluded(r):
            key = (r["instance_id"], r["arm"], r.get("rep", 1))
            return key in excluded and excluded[key] != "valid"
        excluded_n = sum(1 for r in recs if is_excluded(r))
        recs = [r for r in recs if not is_excluded(r)]
    good = [r for r in recs if "harness_error" not in r]
    by = defaultdict(list)
    for r in good:
        by[r["arm"]].append(r)
    arms = [a for a in ARM_ORDER if a in by] + sorted(a for a in by if a not in ARM_ORDER)
    summary = {"source": path.name, "harness_errors": len(recs) - len(good), "arms": {}}
    for a in arms:
        rs = by[a]
        n = len(rs)
        res = sum(1 for r in rs if r["resolved"])
        walls = [r["wall_s"] for r in rs]
        io = [r["tokens"]["input"] + r["tokens"]["output"] for r in rs]
        tot = [sum(r["tokens"].values()) for r in rs]
        s = {"n": n, "resolved": res, "resolved_rate": res / n if n else None,
             "instances": len({r["instance_id"] for r in rs}),
             "wall_s_q1_med_q3": quantiles(walls), "timed_out": sum(1 for r in rs if r.get("timed_out")),
             "tokens_in_out_median": statistics.median(io), "tokens_total_incl_cache_median": statistics.median(tot),
             "tokens_total_incl_cache_sum": sum(tot),
             "guard_blocked": sum((c.get("guard_blocked") or 0) for r in rs for c in r.get("calls", [])),
             "runs_with_model_errors": sum(1 for r in rs if r.get("errors")), "cost": {}}
        rl = [rate_limit_stats(raw, a, r["instance_id"], r.get("rep", 1)) for r in rs]
        s["rate_limit_retries_total"] = sum(x["retries"] for x in rl)
        s["runs_with_rate_limit_retries"] = sum(1 for x in rl if x["retries"])
        s["runs_ended_in_error"] = sum(1 for x in rl if x["ended_in_error"])
        for row in prices:
            cs = [cost(r["tokens"], row) for r in rs]
            s["cost"][row["id"]] = {"median_per_run": statistics.median(cs), "total": sum(cs),
                                    "per_resolved": (sum(cs) / res) if res else None}
        summary["arms"][a] = s
    per_inst = defaultdict(dict)
    for r in good:
        d = per_inst[r["instance_id"]].setdefault(r["arm"], [0, 0])
        d[0] += int(r["resolved"]); d[1] += 1
    summary["per_instance"] = per_inst
    summary["leak_scan"] = leak_scan(raw)
    (out / "summary.json").write_text(json.dumps(summary, indent=1))

    L = [f"| Arm | Resolved (official tests) | Median wall-clock (IQR) | Median $ per task ({args.price}) | Total $ all runs ({args.price}) | Median tokens in+out | Median tokens incl. cache | n |",
         "| --- | --- | --- | --- | --- | --- | --- | --- |"]
    for a in arms:
        s = summary["arms"][a]
        q1, md, q3 = s["wall_s_q1_med_q3"]
        c = s["cost"][args.price]
        L.append(f"| {a} | **{s['resolved']}/{s['n']} ({s['resolved_rate']:.0%})** | {md:.0f} s ({q1:.0f}–{q3:.0f}) | "
                 f"${c['median_per_run']:.4f} | ${c['total']:.2f} | {s['tokens_in_out_median']:,.0f} | "
                 f"{s['tokens_total_incl_cache_median']:,.0f} | {s['n']} |")
    L += ["", "Same token counts at other list prices (computed, not billed):", "",
          "| Arm | " + " | ".join(f"{r['label']}: median / total" for r in other_rows) + " |",
          "| --- | " + " | ".join("---" for _ in other_rows) + " |"]
    for a in arms:
        s = summary["arms"][a]
        L.append(f"| {a} | " + " | ".join(f"${s['cost'][r['id']]['median_per_run']:.3f} / ${s['cost'][r['id']]['total']:.2f}" for r in other_rows) + " |")
    L += ["", "Per instance (resolved / runs):", "", "| Instance | " + " | ".join(arms) + " |", "| --- | " + " | ".join("---" for _ in arms) + " |"]
    for iid in sorted(per_inst):
        L.append(f"| `{iid}` | " + " | ".join("{}/{}".format(*per_inst[iid].get(a, [0, 0])) for a in arms) + " |")
    L += ["", f"Timed out (20 min cap): " + ", ".join(f"{a} {summary['arms'][a]['timed_out']}" for a in arms),
          f"Guard blocks: " + ", ".join(f"{a} {summary['arms'][a]['guard_blocked']}" for a in arms),
          "Rate-limit (429) retries inside Pi: " + "; ".join(
              f"{a} {summary['arms'][a]['rate_limit_retries_total']} in "
              f"{summary['arms'][a]['runs_with_rate_limit_retries']} runs" for a in arms),
          "Runs whose last model call ended in an error: " + "; ".join(
              f"{a} {summary['arms'][a]['runs_ended_in_error']}" for a in arms),
          f"Harness errors excluded from n: {summary['harness_errors']}",
          f"Leak scan (tool calls touching upstream mirrors, dataset or other results): {summary['leak_scan'] or 'none'}"]
    if args.model_label:
        L = [f"Model: {args.model_label}", ""] + L
    if args.exclude:
        L.append(f"Excluded as incomplete: {excluded_n} runs")
    (out / "tables.md").write_text("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
