"""Harness unit tests. No model calls."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import textwrap
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from harness.metrics import parse_agent_stream, quantile, summarise, usage_total  # noqa: E402
from harness.openswarm_finish import executor_calls, extract_result_object  # noqa: E402
from run import existing_keys  # noqa: E402


class MetricsTests(unittest.TestCase):
    def test_stream_json_result_usage_is_one_call(self):
        text = "\n".join(
            [
                json.dumps({"type": "system", "subtype": "init", "session_id": "s1", "model": "Grok"}),
                json.dumps({"type": "assistant", "message": {"role": "assistant"}}),
                json.dumps(
                    {
                        "type": "result",
                        "subtype": "success",
                        "session_id": "s1",
                        "usage": {
                            "inputTokens": 10,
                            "outputTokens": 4,
                            "cacheReadTokens": 3,
                            "cacheWriteTokens": 1,
                        },
                    }
                ),
            ]
        )
        call = parse_agent_stream(text, "agent-1.jsonl")
        self.assertEqual(call["session_id"], "s1")
        self.assertFalse(call["missing_usage"])
        self.assertEqual(usage_total(call["usage"]), 18)

    def test_quantile_and_iqr(self):
        stat = summarise([1, 2, 3, 4, 100])
        self.assertEqual(stat["median"], 3)
        self.assertEqual(stat["min"], 1)
        self.assertEqual(stat["max"], 100)
        self.assertEqual(stat["iqr"], quantile([1, 2, 3, 4, 100], 0.75) - quantile([1, 2, 3, 4, 100], 0.25))

    def test_resume_keys(self):
        path = ROOT / "tmp" / (self.id().replace(".", "_") + ".jsonl")
        path.parent.mkdir(parents=True, exist_ok=True)
        try:
            path.write_text(
                "\n".join(
                    [
                        json.dumps({"type": "environment", "date": "x"}),
                        json.dumps({"type": "run", "task": "pagination-off-by-one", "arm": "baseline", "repeat": 1}),
                    ]
                )
                + "\n",
                encoding="utf-8",
            )
            self.assertIn(("pagination-off-by-one", "baseline", 1), existing_keys(path))
            self.assertNotIn(("pagination-off-by-one", "baseline", 2), existing_keys(path))
        finally:
            path.unlink(missing_ok=True)

    def test_openswarm_usage_is_not_double_counted(self):
        usage = {"inputTokens": 8, "outputTokens": 2, "cacheReadTokens": 1, "cacheWriteTokens": 0}
        result = {
            "id": "abc",
            "usage": usage,
            "attempts": [{"backend": "cursor", "model": "grok-4.7-high", "meta": {"usage": usage}}],
        }
        calls = executor_calls(result)
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0]["usage"]["inputTokens"], 8)
        blob = "noise\n" + json.dumps({"ok": True}) + "\n" + json.dumps(result)
        self.assertEqual(extract_result_object(blob)["id"], "abc")


class PipelineTests(unittest.TestCase):
    def test_fake_agent_records_tokens_and_hidden_tests(self):
        fake = (ROOT / "tmp" / (self.id().replace(".", "_") + "-cursor.py")).resolve()
        fake.parent.mkdir(parents=True, exist_ok=True)
        fake.write_text(
            textwrap.dedent(
                """\
                #!/usr/bin/env python3
                import json, pathlib, sys
                root = pathlib.Path.cwd()
                if (root / "_hidden_acceptance").exists():
                    print("hidden tests were visible to the agent", file=sys.stderr)
                    sys.exit(3)
                target = root / "src" / "paginate.js"
                target.write_text(target.read_text().replace(
                    "const start = page * pageSize;",
                    "const start = (page - 1) * pageSize;",
                ))
                sys.stdout.write(json.dumps({
                    "type": "system", "subtype": "init", "session_id": "sess-fake", "model": "grok-4.7-high"
                }) + "\\n")
                sys.stdout.write(json.dumps({
                    "type": "result", "subtype": "success", "session_id": "sess-fake",
                    "usage": {"inputTokens": 11, "outputTokens": 5, "cacheReadTokens": 7, "cacheWriteTokens": 2}
                }) + "\\n")
                """
            ),
            encoding="utf-8",
        )
        fake.chmod(0o755)
        out = ROOT / "tmp" / "unit-pipeline.jsonl"
        report_dir = ROOT / "tmp" / "unit-report"
        if out.exists():
            out.unlink()
        env = os.environ.copy()
        env["CURSOR_AGENT_BIN"] = str(fake)
        proc = subprocess.run(
            [
                sys.executable,
                str(ROOT / "run.py"),
                "--arms",
                "baseline",
                "--tasks",
                "pagination-off-by-one",
                "--repeats",
                "1",
                "--concurrency",
                "1",
                "--out",
                str(out),
            ],
            cwd=ROOT,
            env=env,
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
        rows = [json.loads(line) for line in out.read_text(encoding="utf-8").splitlines()]
        runs = [row for row in rows if row.get("type") == "run"]
        self.assertEqual(len(runs), 1)
        row = runs[0]
        self.assertTrue(row["success"])
        self.assertTrue(row["visible_tests"]["passed"])
        self.assertTrue(row["hidden_tests"]["passed"])
        self.assertEqual(row["cursor_agent_calls"], 1)
        self.assertEqual(row["tokens"]["total"], 25)
        self.assertEqual(row["session_ids"], ["sess-fake"])
        self.assertEqual(row["model"], "grok-4.7-high")
        self.assertIn("src/paginate.js", row["files_changed"])
        again = subprocess.run(
            [
                sys.executable,
                str(ROOT / "run.py"),
                "--arms",
                "baseline",
                "--tasks",
                "pagination-off-by-one",
                "--repeats",
                "1",
                "--concurrency",
                "1",
                "--out",
                str(out),
            ],
            cwd=ROOT,
            env=env,
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(again.returncode, 0, again.stdout + again.stderr)
        self.assertIn("skip", again.stdout)
        rerows = [json.loads(line) for line in out.read_text(encoding="utf-8").splitlines() if line.strip()]
        self.assertEqual(sum(1 for row in rerows if row.get("type") == "run"), 1)
        report = subprocess.run(
            [sys.executable, str(ROOT / "report.py"), str(out), "--out-dir", str(report_dir)],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(report.returncode, 0, report.stdout + report.stderr)
        svg = (report_dir / "chart.svg").read_text(encoding="utf-8")
        self.assertIn('fill="#ffffff"', svg)
        self.assertEqual(svg.count("<svg"), 1)
        self.assertIn("Success %", svg)
        self.assertIn("Median minutes", svg)
        self.assertIn("Median total tokens", svg)
        summary = (report_dir / "summary.md").read_text(encoding="utf-8")
        self.assertIn("1/1 (100.0%)", summary)
        fake.unlink(missing_ok=True)


if __name__ == "__main__":
    unittest.main()
