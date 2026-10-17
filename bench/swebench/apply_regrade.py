#!/usr/bin/env python3
"""Apply regrade results to run records.

CLI:
    python3 apply_regrade.py --runs runs.jsonl \
        --regrade r1.jsonl [--regrade r2.jsonl ...] --out out.jsonl
"""

import argparse
import json
import sys


GRADE_FIELDS = ("f2p", "p2p", "f2p_failed", "p2p_failed", "error")


def _read_jsonl(path):
    """Yield JSON objects from a JSON-lines file, skipping blank lines."""
    with open(path, "r", encoding="utf-8") as fh:
        for line_number, raw in enumerate(fh, 1):
            line = raw.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(
                    "invalid JSON in {} at line {}: {}".format(
                        path, line_number, exc
                    )
                ) from exc


def load_runs(path):
    return list(_read_jsonl(path))


def load_regrades(paths):
    """Load regrade records, with later files overriding earlier ones.

    Regrade lines carrying a truthy ``harness_error`` are ignored and do not
    replace any previously loaded regrade for the same key.
    """
    regrades = {}
    for path in paths:
        for record in _read_jsonl(path):
            if record.get("harness_error"):
                continue
            key = (record.get("instance_id"), record.get("arm"), record.get("rep"))
            regrades[key] = record
    return regrades


def apply_regrades(runs, regrades):
    """Return a new list of run records with matching regrades applied."""
    output = []
    changed = []

    for run in runs:
        key = (run.get("instance_id"), run.get("arm"), run.get("rep"))
        regrade = regrades.get(key)
        if regrade is None:
            output.append(run)
            continue

        old_resolved = run.get("resolved")
        new_resolved = regrade.get("resolved")

        updated = dict(run)
        updated["resolved"] = new_resolved
        updated["original_resolved"] = old_resolved
        updated["grade"] = {field: regrade.get(field) for field in GRADE_FIELDS}
        updated["regrade"] = {
            "label": regrade.get("label"),
            "patch_applied": regrade.get("patch_applied"),
        }
        output.append(updated)

        if old_resolved != new_resolved:
            changed.append((run, old_resolved, new_resolved, regrade))

    return output, changed


def write_jsonl(path, records):
    with open(path, "w", encoding="utf-8") as fh:
        for record in records:
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Apply regrade results to run records."
    )
    parser.add_argument("--runs", required=True, help="input runs JSONL file")
    parser.add_argument(
        "--regrade",
        action="append",
        required=True,
        dest="regrades",
        help="regrade JSONL file; may be supplied more than once",
    )
    parser.add_argument("--out", required=True, help="output runs JSONL file")
    args = parser.parse_args(argv)

    runs = load_runs(args.runs)
    regrades = load_regrades(args.regrades)
    output, changed = apply_regrades(runs, regrades)
    write_jsonl(args.out, output)

    print("records: {}".format(len(runs)))
    print("regraded: {}".format(sum(1 for run in runs
                                   if (run.get("instance_id"), run.get("arm"),
                                       run.get("rep")) in regrades)))
    for run, old_resolved, new_resolved, regrade in changed:
        print(
            "{} {} r{}: {} -> {} ({})".format(
                run.get("arm"),
                run.get("instance_id"),
                run.get("rep"),
                old_resolved,
                new_resolved,
                regrade.get("label"),
            )
        )

    return 0


if __name__ == "__main__":
    sys.exit(main())
