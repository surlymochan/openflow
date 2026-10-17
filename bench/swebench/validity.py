#!/usr/bin/env python3
"""Check benchmark-run validity and print a per-instance/arm completeness matrix."""

import argparse
import glob
import json
import os
import sys
from collections import defaultdict


MINIMAX_MARKER = "MiniMax-M3.1-Flash-Preview"
USAGE_CAP_MARKER = "用量上限"


def load_pi_models(path):
    """Return task_id -> set of model names from the pi invocation log."""
    models_by_task = defaultdict(set)
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            entry = json.loads(line)
            task_id = entry.get("task_id")
            model = entry.get("model")
            if task_id is not None and model is not None:
                models_by_task[task_id].add(model)
    return models_by_task


def events_files(raw, arm, instance_id, rep):
    """Return the event JSONL files for one run, in deterministic order."""
    run_dir = os.path.join(raw, arm, instance_id, "r%s" % rep)
    return sorted(glob.glob(os.path.join(run_dir, "*-events.jsonl")))


def inspect_events(path):
    """Stream one event file and return (usage_cap_seen, last_assistant_stop_reason)."""
    usage_cap_seen = False
    last_assistant_stop_reason = None

    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            if event.get("type") != "message_end":
                continue
            message = event.get("message")
            if not isinstance(message, dict) or message.get("role") != "assistant":
                continue

            error_message = message.get("errorMessage")
            if isinstance(error_message, str) and USAGE_CAP_MARKER in error_message:
                usage_cap_seen = True
            last_assistant_stop_reason = message.get("stopReason")

    return usage_cap_seen, last_assistant_stop_reason


def evaluate_run(run, models_by_task, raw):
    """Evaluate one run record and return its output record."""
    instance_id = run.get("instance_id")
    arm = run.get("arm")
    rep = run.get("rep")

    if "harness_error" in run:
        error = run.get("harness_error")
        if not isinstance(error, str):
            error = "" if error is None else str(error)
        return {
            "instance_id": instance_id,
            "arm": arm,
            "rep": rep,
            "status": "harness_error",
            "reasons": [error[:120]],
        }

    reasons = []

    models = set()
    for call in run.get("calls") or []:
        if not isinstance(call, dict):
            continue
        task_id = call.get("task_id")
        if task_id is not None:
            models.update(models_by_task.get(task_id, set()))

    if not models:
        reasons.append("no model call recorded")
    else:
        non_minimax = sorted(model for model in models if MINIMAX_MARKER not in model)
        if non_minimax:
            reasons.append("non-MiniMax model: %s" % non_minimax)

    usage_cap_seen = False
    last_error_seen = False
    for path in events_files(raw, arm, instance_id, rep):
        file_usage_cap, last_stop_reason = inspect_events(path)
        usage_cap_seen = usage_cap_seen or file_usage_cap
        if last_stop_reason == "error":
            last_error_seen = True

    if usage_cap_seen:
        reasons.append("usage cap hit during run")
    if last_error_seen:
        reasons.append("last model call ended in error")

    return {
        "instance_id": instance_id,
        "arm": arm,
        "rep": rep,
        "status": "valid" if not reasons else "incomplete",
        "reasons": reasons,
    }


def split_csv(value):
    return [part.strip() for part in value.split(",") if part.strip()]


def print_matrix(runs, expected_instances, expected_arms):
    total = defaultdict(int)
    valid = defaultdict(int)

    for run in runs:
        if run.get("status") == "harness_error":
            continue
        key = (run.get("instance_id"), run.get("arm"))
        total[key] += 1
        if run.get("status") == "valid":
            valid[key] += 1

    instance_width = max([len("instance")] + [len(i) for i in expected_instances])
    arm_widths = {
        arm: max(len(arm), len("valid/records")) for arm in expected_arms
    }

    header = "instance".ljust(instance_width)
    for arm in expected_arms:
        header += "  " + arm.ljust(arm_widths[arm])
    print("Completeness matrix (valid/records, harness_error excluded):")
    print(header)

    for instance_id in expected_instances:
        row = instance_id.ljust(instance_width)
        for arm in expected_arms:
            cell = "%d/%d" % (valid[(instance_id, arm)], total[(instance_id, arm)])
            row += "  " + cell.ljust(arm_widths[arm])
        print(row)

    print("Valid runs by arm:")
    for arm in expected_arms:
        arm_valid = sum(valid[(instance_id, arm)] for instance_id in expected_instances)
        print("%s: %d" % (arm, arm_valid))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runs", required=True)
    parser.add_argument("--pi-log", required=True)
    parser.add_argument("--raw", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--expected-arms", required=True)
    parser.add_argument("--expected-instances", required=True)
    args = parser.parse_args(argv)

    expected_arms = split_csv(args.expected_arms)
    expected_instances = split_csv(args.expected_instances)
    models_by_task = load_pi_models(args.pi_log)

    runs = []
    with open(args.runs, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            run = json.loads(line)
            record = evaluate_run(run, models_by_task, args.raw)
            runs.append(record)

    with open(args.out, "w", encoding="utf-8") as fh:
        for record in runs:
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")

    print_matrix(runs, expected_instances, expected_arms)
    return 0


if __name__ == "__main__":
    sys.exit(main())
