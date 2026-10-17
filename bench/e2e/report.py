#!/usr/bin/env python3
"""Aggregate a harness jsonl into summary.md, a CSV, and an SVG chart."""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

from harness.metrics import summarise

ARM_ORDER = ["baseline", "superpowers", "openflow", "openswarm", "omo"]
ARM_COLORS = {
    "baseline": "#3d5a80",
    "superpowers": "#ee6c4d",
    "openflow": "#2a9d8f",
    "openswarm": "#e9c46a",
    "omo": "#6d597a",
}


def load_rows(path: Path) -> tuple[dict | None, list[dict]]:
    env = None
    runs = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        row = json.loads(line)
        if row.get("type") == "environment":
            env = row
            continue
        if row.get("skipped"):
            continue
        if row.get("type") not in (None, "run"):
            continue
        if "task" in row and "arm" in row:
            runs.append(row)
    return env, runs


def _num(row: dict, *keys, default=None):
    cur = row
    for key in keys:
        if not isinstance(cur, dict) or key not in cur:
            return default
        cur = cur[key]
    return cur


def series(rows: list[dict]) -> dict:
    wall = [float(row["wall_s"]) for row in rows if row.get("wall_s") is not None]
    success = [row for row in rows if row.get("success") is not None]
    passed = sum(1 for row in success if row.get("success") is True)

    def token_values(key: str) -> list[float]:
        values = []
        for row in rows:
            if row.get("timed_out"):
                continue  # killed at the cap: no usage event, tokens unknown (not zero)
            value = _num(row, "tokens", key)
            if value is None:
                continue
            values.append(float(value))
        return values

    return {
        "n": len(rows),
        "success_n": len(success),
        "success": passed,
        "success_pct": (100.0 * passed / len(success)) if success else None,
        "wall_s": summarise(wall),
        "input": summarise(token_values("inputTokens")),
        "output": summarise(token_values("outputTokens")),
        "cache_read": summarise(token_values("cacheReadTokens")),
        "total": summarise(token_values("total")),
    }


def group(rows: list[dict], keyfn) -> list[tuple[str, dict]]:
    buckets: dict[str, list[dict]] = {}
    for row in rows:
        buckets.setdefault(keyfn(row), []).append(row)

    def sort_key(name: str) -> tuple:
        if name in ARM_ORDER:
            return (0, ARM_ORDER.index(name), name)
        return (1, 0, name)

    return [(name, series(buckets[name])) for name in sorted(buckets, key=sort_key)]


def fmt(value, digits=1) -> str:
    if value is None:
        return "—"
    if isinstance(value, float):
        return f"{value:.{digits}f}"
    return str(value)


def stat_phrase(stat: dict, digits=1) -> str:
    if not stat or stat.get("n", 0) == 0:
        return "n=0"
    return (
        f"median {fmt(stat['median'], digits)}, "
        f"IQR {fmt(stat['iqr'], digits)} "
        f"(q1 {fmt(stat['q1'], digits)}, q3 {fmt(stat['q3'], digits)}), "
        f"min {fmt(stat['min'], digits)}, max {fmt(stat['max'], digits)}"
    )


def write_summary(path: Path, env: dict | None, by_arm, by_task, by_cell) -> None:
    lines = ["# End-to-end task completion", ""]
    if env:
        lines.append("## Environment")
        lines.append("")
        lines.append(f"- Date: {env.get('date')}")
        lines.append(f"- OS: {env.get('os')}")
        lines.append(f"- CPU: {env.get('cpu')} ({env.get('cpu_count')} cores)")
        lines.append(f"- Python: {env.get('python')}")
        lines.append(f"- Node: {env.get('node')}")
        lines.append(f"- cursor-agent: {env.get('cursor_agent')}")
        commits = env.get("commits") or {}
        lines.append(f"- superpowers: {commits.get('superpowers')} ({env.get('superpowers_dir')})")
        lines.append(f"- openflow: {commits.get('openflow')} tarball={env.get('openflow_tgz')}")
        lines.append(f"- openswarm: {commits.get('openswarm')} ({env.get('openswarm_dir')})")
        lines.append(f"- Model flag: {env.get('model')}")
        lines.append(f"- cursor-agent flags: {' '.join(env.get('cursor_flags') or [])}")
        lines.append(f"- Per-run timeout: {env.get('run_timeout_s')}s")
        lines.append(f"- Command: `{' '.join(env.get('command') or [])}`")
        lines.append("")
    lines.append("## Per arm")
    lines.append("")
    lines.append("| arm | success | wall_s | input tokens | output tokens | cache read | total tokens |")
    lines.append("| --- | --- | --- | --- | --- | --- | --- |")
    for name, stat in by_arm:
        pct = "—" if stat["success_pct"] is None else f"{stat['success']}/{stat['success_n']} ({stat['success_pct']:.1f}%)"
        lines.append(
            "| {name} | {pct} | {wall} | {inp} | {out} | {cache} | {total} |".format(
                name=name,
                pct=pct,
                wall=stat_phrase(stat["wall_s"]),
                inp=stat_phrase(stat["input"], 0),
                out=stat_phrase(stat["output"], 0),
                cache=stat_phrase(stat["cache_read"], 0),
                total=stat_phrase(stat["total"], 0),
            )
        )
    lines.append("")
    lines.append("## Per task")
    lines.append("")
    lines.append("| task | success | wall_s | total tokens |")
    lines.append("| --- | --- | --- | --- |")
    for name, stat in by_task:
        pct = "—" if stat["success_pct"] is None else f"{stat['success']}/{stat['success_n']} ({stat['success_pct']:.1f}%)"
        lines.append(f"| {name} | {pct} | {stat_phrase(stat['wall_s'])} | {stat_phrase(stat['total'], 0)} |")
    lines.append("")
    lines.append("## Per task and arm")
    lines.append("")
    lines.append("| task | arm | n | success | median wall_s | median total tokens |")
    lines.append("| --- | --- | --- | --- | --- | --- |")
    for name, stat in by_cell:
        task, arm = name.split("\t", 1)
        pct = "—" if stat["success_pct"] is None else f"{stat['success']}/{stat['success_n']} ({stat['success_pct']:.1f}%)"
        lines.append(
            f"| {task} | {arm} | {stat['n']} | {pct} | {fmt(stat['wall_s']['median'])} | {fmt(stat['total']['median'], 0)} |"
        )
    lines.append("")
    lines.append("Skipped arms (omo) are omitted. n is the number of finished, non-skipped runs in the group.")
    lines.append("Token totals add input, output, cache read and cache write. cursor-agent reports inputTokens with cache tokens already removed.")
    lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def write_csv(path: Path, scope: str, rows: list[tuple[str, dict]]) -> None:
    fieldnames = [
        "scope",
        "id",
        "n",
        "success",
        "success_n",
        "success_pct",
        "wall_median_s",
        "wall_q1",
        "wall_q3",
        "wall_iqr",
        "wall_min",
        "wall_max",
        "input_median",
        "input_q1",
        "input_q3",
        "input_iqr",
        "output_median",
        "output_q1",
        "output_q3",
        "output_iqr",
        "cache_read_median",
        "cache_read_q1",
        "cache_read_q3",
        "cache_read_iqr",
        "total_median",
        "total_q1",
        "total_q3",
        "total_iqr",
    ]
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for name, stat in rows:
            writer.writerow(
                {
                    "scope": scope,
                    "id": name.replace("\t", "/"),
                    "n": stat["n"],
                    "success": stat["success"],
                    "success_n": stat["success_n"],
                    "success_pct": "" if stat["success_pct"] is None else f"{stat['success_pct']:.4f}",
                    "wall_median_s": stat["wall_s"]["median"],
                    "wall_q1": stat["wall_s"]["q1"],
                    "wall_q3": stat["wall_s"]["q3"],
                    "wall_iqr": stat["wall_s"]["iqr"],
                    "wall_min": stat["wall_s"]["min"],
                    "wall_max": stat["wall_s"]["max"],
                    "input_median": stat["input"]["median"],
                    "input_q1": stat["input"]["q1"],
                    "input_q3": stat["input"]["q3"],
                    "input_iqr": stat["input"]["iqr"],
                    "output_median": stat["output"]["median"],
                    "output_q1": stat["output"]["q1"],
                    "output_q3": stat["output"]["q3"],
                    "output_iqr": stat["output"]["iqr"],
                    "cache_read_median": stat["cache_read"]["median"],
                    "cache_read_q1": stat["cache_read"]["q1"],
                    "cache_read_q3": stat["cache_read"]["q3"],
                    "cache_read_iqr": stat["cache_read"]["iqr"],
                    "total_median": stat["total"]["median"],
                    "total_q1": stat["total"]["q1"],
                    "total_q3": stat["total"]["q3"],
                    "total_iqr": stat["total"]["iqr"],
                }
            )


def _xml(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def _bar_panel(title, labels, values, q1s, q3s, colors, x, y, w, h, y_label) -> list[str]:
    parts = [
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="#ffffff" stroke="#d0d0d0"/>',
        f'<text x="{x + 12}" y="{y + 22}" font-family="sans-serif" font-size="14" fill="#1d1d1d">{_xml(title)}</text>',
        f'<text x="{x + 12}" y="{y + h - 8}" font-family="sans-serif" font-size="11" fill="#555">{_xml(y_label)}</text>',
    ]
    if not labels:
        return parts
    finite = [value for value in values + q3s if value is not None]
    top = max(finite) if finite else 1
    if top <= 0:
        top = 1
    top *= 1.15
    plot_x = x + 36
    plot_y = y + 36
    plot_w = w - 52
    plot_h = h - 78
    slot = plot_w / max(len(labels), 1)
    bar_w = min(36, slot * 0.55)
    for index, label in enumerate(labels):
        value = values[index] or 0
        height = plot_h * (value / top)
        bx = plot_x + index * slot + (slot - bar_w) / 2
        by = plot_y + plot_h - height
        color = colors[index]
        parts.append(f'<rect x="{bx:.1f}" y="{by:.1f}" width="{bar_w:.1f}" height="{height:.1f}" fill="{color}"/>')
        q1 = q1s[index]
        q3 = q3s[index]
        if q1 is not None and q3 is not None:
            y1 = plot_y + plot_h - plot_h * (q1 / top)
            y3 = plot_y + plot_h - plot_h * (q3 / top)
            cx = bx + bar_w / 2
            parts.append(f'<line x1="{cx:.1f}" y1="{y1:.1f}" x2="{cx:.1f}" y2="{y3:.1f}" stroke="#1d1d1d" stroke-width="1.4"/>')
            parts.append(f'<line x1="{cx - 5:.1f}" y1="{y1:.1f}" x2="{cx + 5:.1f}" y2="{y1:.1f}" stroke="#1d1d1d" stroke-width="1.4"/>')
            parts.append(f'<line x1="{cx - 5:.1f}" y1="{y3:.1f}" x2="{cx + 5:.1f}" y2="{y3:.1f}" stroke="#1d1d1d" stroke-width="1.4"/>')
        parts.append(
            f'<text x="{bx + bar_w / 2:.1f}" y="{plot_y + plot_h + 16:.1f}" text-anchor="middle" '
            f'font-family="sans-serif" font-size="11" fill="#1d1d1d">{_xml(label)}</text>'
        )
    return parts


def write_svg(path: Path, by_arm: list[tuple[str, dict]]) -> None:
    labels = [name for name, _stat in by_arm]
    colors = [ARM_COLORS.get(name, "#666666") for name in labels]
    success = [0 if stat["success_pct"] is None else stat["success_pct"] for _name, stat in by_arm]
    minutes = [
        None if stat["wall_s"]["median"] is None else stat["wall_s"]["median"] / 60.0
        for _name, stat in by_arm
    ]
    minutes_q1 = [
        None if stat["wall_s"]["q1"] is None else stat["wall_s"]["q1"] / 60.0
        for _name, stat in by_arm
    ]
    minutes_q3 = [
        None if stat["wall_s"]["q3"] is None else stat["wall_s"]["q3"] / 60.0
        for _name, stat in by_arm
    ]
    totals = [stat["total"]["median"] for _name, stat in by_arm]
    totals_q1 = [stat["total"]["q1"] for _name, stat in by_arm]
    totals_q3 = [stat["total"]["q3"] for _name, stat in by_arm]
    width, height = 980, 340
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        f'<rect width="{width}" height="{height}" fill="#ffffff"/>',
        '<text x="16" y="22" font-family="sans-serif" font-size="16" fill="#1d1d1d">Task completion by arm</text>',
    ]
    panel_w, panel_h = 300, 280
    none = [None] * len(labels)
    parts += _bar_panel("Success %", labels, success, none, none, colors, 16, 36, panel_w, panel_h, "percent")
    parts += _bar_panel(
        "Median minutes",
        labels,
        [0 if value is None else value for value in minutes],
        minutes_q1,
        minutes_q3,
        colors,
        336,
        36,
        panel_w,
        panel_h,
        "minutes, whisker = IQR",
    )
    parts += _bar_panel(
        "Median total tokens",
        labels,
        [0 if value is None else value for value in totals],
        totals_q1,
        totals_q3,
        colors,
        656,
        36,
        panel_w,
        panel_h,
        "tokens, whisker = IQR",
    )
    parts.append("</svg>")
    path.write_text("\n".join(parts) + "\n", encoding="utf-8")


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Aggregate harness jsonl")
    parser.add_argument("jsonl", type=Path)
    parser.add_argument("--out-dir", type=Path, default=None, help="defaults to the jsonl directory")
    args = parser.parse_args(argv)
    src = args.jsonl
    if not src.is_file():
        raise SystemExit(f"not a file: {src}")
    out_dir = args.out_dir or src.parent
    out_dir.mkdir(parents=True, exist_ok=True)
    env, runs = load_rows(src)
    by_arm = group(runs, lambda row: row["arm"])
    by_task = group(runs, lambda row: row["task"])
    by_cell = group(runs, lambda row: f"{row['task']}\t{row['arm']}")
    write_summary(out_dir / "summary.md", env, by_arm, by_task, by_cell)
    write_csv_all(out_dir / "scores.csv", [("arm", by_arm), ("task", by_task), ("task_arm", by_cell)])
    write_svg(out_dir / "chart.svg", by_arm)
    print(f"wrote {out_dir / 'summary.md'}")
    print(f"wrote {out_dir / 'scores.csv'}")
    print(f"wrote {out_dir / 'chart.svg'}")
    return 0


def write_csv_all(path: Path, groups: list[tuple[str, list]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = None
        for scope, rows in groups:
            tmp = Path(str(path) + ".part")
            write_csv(tmp, scope, rows)
            text = tmp.read_text(encoding="utf-8").splitlines()
            tmp.unlink()
            if writer is None:
                handle.write(text[0] + "\n")
                writer = True
            for line in text[1:]:
                handle.write(line + "\n")


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
