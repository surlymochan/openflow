#!/usr/bin/env python3
"""Tests for validity.py using synthetic, temporary fixtures."""

import io
import json
import os
import tempfile
import unittest
from contextlib import redirect_stdout

import validity


class ValidityTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(dir=os.getcwd())
        self.root = self.tmp.name
        self.raw = os.path.join(self.root, "raw")
        os.makedirs(self.raw)
        self.runs_path = os.path.join(self.root, "runs.jsonl")
        self.pi_log_path = os.path.join(self.root, "pi-log.jsonl")
        self.out_path = os.path.join(self.root, "out.jsonl")
        self.runs = []
        self.pi_log = []

    def tearDown(self):
        self.tmp.cleanup()

    def add_run(self, instance_id, arm, rep, task_ids=(), harness_error=None):
        run = {
            "instance_id": instance_id,
            "arm": arm,
            "rep": rep,
        }
        if harness_error is not None:
            run["harness_error"] = harness_error
        else:
            run["calls"] = [{"task_id": task_id} for task_id in task_ids]
        self.runs.append(run)

    def add_pi(self, task_id, model):
        self.pi_log.append({"task_id": task_id, "model": model})

    def add_events(self, instance_id, arm, rep, assistants, filename="agent-events.jsonl"):
        run_dir = os.path.join(self.raw, arm, instance_id, "r%s" % rep)
        os.makedirs(run_dir, exist_ok=True)
        path = os.path.join(run_dir, filename)
        with open(path, "w", encoding="utf-8") as fh:
            for assistant in assistants:
                message = {"role": "assistant"}
                message.update(assistant)
                fh.write(json.dumps({
                    "type": "message_end",
                    "message": message,
                }, ensure_ascii=False) + "\n")

    def run_validity(self, expected_arms, expected_instances):
        with open(self.runs_path, "w", encoding="utf-8") as fh:
            for run in self.runs:
                fh.write(json.dumps(run, ensure_ascii=False) + "\n")
        with open(self.pi_log_path, "w", encoding="utf-8") as fh:
            for entry in self.pi_log:
                fh.write(json.dumps(entry, ensure_ascii=False) + "\n")

        stdout = io.StringIO()
        with redirect_stdout(stdout):
            validity.main([
                "--runs", self.runs_path,
                "--pi-log", self.pi_log_path,
                "--raw", self.raw,
                "--out", self.out_path,
                "--expected-arms", ",".join(expected_arms),
                "--expected-instances", ",".join(expected_instances),
            ])

        with open(self.out_path, "r", encoding="utf-8") as fh:
            records = [json.loads(line) for line in fh if line.strip()]
        return records, stdout.getvalue()

    def test_valid_run(self):
        self.add_run("inst-1", "baseline", 1, ["task-1", "task-2"])
        self.add_pi("task-1", "minimaxi/MiniMax-M3.1-Flash-Preview")
        self.add_pi("task-1", "minimaxi/MiniMax-M3.1-Flash-Preview")
        self.add_pi("task-2", "minimaxi/MiniMax-M3.1-Flash-Preview")
        self.add_events("inst-1", "baseline", 1, [{"stopReason": "stop"}])

        records, _ = self.run_validity(["baseline"], ["inst-1"])

        self.assertEqual(records[0]["status"], "valid")
        self.assertEqual(records[0]["reasons"], [])

    def test_empty_models(self):
        self.add_run("inst-1", "baseline", 1, ["not-logged"])
        self.add_events("inst-1", "baseline", 1, [{"stopReason": "stop"}])

        records, _ = self.run_validity(["baseline"], ["inst-1"])

        self.assertEqual(records[0]["status"], "incomplete")
        self.assertEqual(records[0]["reasons"], ["no model call recorded"])

    def test_deepseek_model(self):
        self.add_run("inst-1", "baseline", 1, ["task-1"])
        self.add_pi("task-1", "deepseek/deepseek-flash")
        self.add_events("inst-1", "baseline", 1, [{"stopReason": "stop"}])

        records, _ = self.run_validity(["baseline"], ["inst-1"])

        self.assertEqual(records[0]["status"], "incomplete")
        self.assertEqual(
            records[0]["reasons"],
            ["non-MiniMax model: ['deepseek/deepseek-flash']"],
        )

    def test_usage_cap_any_assistant_message(self):
        self.add_run("inst-1", "baseline", 1, ["task-1"])
        self.add_pi("task-1", "minimaxi/MiniMax-M3.1-Flash-Preview")
        self.add_events("inst-1", "baseline", 1, [
            {"stopReason": "error", "errorMessage": "429 已达到 Token Plan 用量上限：请升级"},
            {"stopReason": "stop"},
        ])

        records, _ = self.run_validity(["baseline"], ["inst-1"])

        self.assertEqual(records[0]["status"], "incomplete")
        self.assertEqual(records[0]["reasons"], ["usage cap hit during run"])

    def test_last_assistant_stop_reason_error(self):
        self.add_run("inst-1", "baseline", 1, ["task-1"])
        self.add_pi("task-1", "minimaxi/MiniMax-M3.1-Flash-Preview")
        self.add_events("inst-1", "baseline", 1, [
            {"stopReason": "stop"},
            {"stopReason": "error", "errorMessage": "Connection error."},
        ])

        records, _ = self.run_validity(["baseline"], ["inst-1"])

        self.assertEqual(records[0]["status"], "incomplete")
        self.assertEqual(records[0]["reasons"], ["last model call ended in error"])

    def test_harness_error_reason_is_truncated(self):
        self.add_run("inst-1", "baseline", 1, harness_error="H" * 150)

        records, _ = self.run_validity(["baseline"], ["inst-1"])

        self.assertEqual(records[0]["status"], "harness_error")
        self.assertEqual(records[0]["reasons"], ["H" * 120])

    def test_all_applicable_reasons_are_collected(self):
        self.add_run("inst-1", "baseline", 1, ["task-1"])
        self.add_pi("task-1", "deepseek/deepseek-flash")
        self.add_events("inst-1", "baseline", 1, [
            {"stopReason": "error", "errorMessage": "已达到 Token Plan 用量上限"},
            {"stopReason": "error", "errorMessage": "Connection error."},
        ])

        records, _ = self.run_validity(["baseline"], ["inst-1"])

        self.assertEqual(records[0]["status"], "incomplete")
        self.assertEqual(records[0]["reasons"], [
            "non-MiniMax model: ['deepseek/deepseek-flash']",
            "usage cap hit during run",
            "last model call ended in error",
        ])

    def test_completeness_matrix(self):
        self.add_run("inst-1", "armA", 1, ["valid-task"])
        self.add_pi("valid-task", "minimaxi/MiniMax-M3.1-Flash-Preview")
        self.add_events("inst-1", "armA", 1, [{"stopReason": "stop"}])

        self.add_run("inst-1", "armA", 2, ["missing-task"])
        self.add_events("inst-1", "armA", 2, [{"stopReason": "stop"}])

        self.add_run("inst-1", "armB", 1, ["cap-task"])
        self.add_pi("cap-task", "minimaxi/MiniMax-M3.1-Flash-Preview")
        self.add_events("inst-1", "armB", 1, [
            {"stopReason": "error", "errorMessage": "用量上限"},
        ])

        self.add_run("inst-2", "armA", 1, ["error-task"])
        self.add_pi("error-task", "minimaxi/MiniMax-M3.1-Flash-Preview")
        self.add_events("inst-2", "armA", 1, [{"stopReason": "error"}])

        self.add_run("inst-2", "armB", 1, ["deepseek-task"])
        self.add_pi("deepseek-task", "deepseek/deepseek-flash")
        self.add_events("inst-2", "armB", 1, [{"stopReason": "stop"}])

        self.add_run("inst-2", "armB", 2, harness_error="archive failed")

        records, output = self.run_validity(["armA", "armB"], ["inst-1", "inst-2"])

        self.assertEqual([record["status"] for record in records], [
            "valid", "incomplete", "incomplete", "incomplete", "incomplete",
            "harness_error",
        ])

        lines = output.splitlines()
        inst1_row = next(line for line in lines if line.startswith("inst-1"))
        inst2_row = next(line for line in lines if line.startswith("inst-2"))

        self.assertIn("1/2", inst1_row)
        self.assertIn("0/1", inst1_row)
        self.assertIn("0/1", inst2_row)
        self.assertIn("0/1", inst2_row)  # harness_error is excluded from denominator
        self.assertNotIn("0/2", inst2_row)
        self.assertIn("armA: 1", output)
        self.assertIn("armB: 0", output)


if __name__ == "__main__":
    unittest.main()
