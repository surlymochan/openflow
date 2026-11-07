#!/usr/bin/env python3
"""Tests for the openswarm PLANNER prompt in harness/arms.py.

The planner must converge to writing the task file inside its 600s budget
instead of exploring: the MiniMax 600s validation cell (pylint-8898) showed
the planner spending 13 turns / 23 tools on exploration (openswarm lane
serve/assign probes, a full-disk `find / -name "pylint-*.whl"`) and getting
killed (rc 143) before writing the task file.

Stdlib only, like test_diff_filter.py: arms.py itself imports swe_env, which
pulls in pandas / swebench, so this test reads the PLANNER constant out of
the source with ast instead of importing the module. That keeps it runnable
by the CI node suite, which shells out here with plain python3.
"""
import ast
import re
import unittest
from pathlib import Path

ARMS = Path(__file__).resolve().parent / "harness" / "arms.py"


def _planner_prompt() -> str:
    tree = ast.parse(ARMS.read_text())
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == "PLANNER":
                    value = ast.literal_eval(node.value)
                    assert isinstance(value, str)
                    return value
    raise AssertionError("PLANNER constant not found in harness/arms.py")


def _arm_openswarm_source() -> str:
    tree = ast.parse(ARMS.read_text())
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name == "arm_openswarm":
            return ast.get_source_segment(ARMS.read_text(), node)
    raise AssertionError("arm_openswarm not found in harness/arms.py")


PLANNER = _planner_prompt()


class PlannerPromptTests(unittest.TestCase):
    def test_forbids_running_shell_commands(self):
        self.assertIn("Do not run any shell command", PLANNER)

    def test_forbids_reproduction_and_exploration(self):
        for ban in (
            "do not reproduce",
            "do not explore the repository",
            "do not list files",
            "do not search the filesystem",
            "do not\nlaunch openswarm",
        ):
            self.assertIn(ban, PLANNER, f"missing ban: {ban!r}")

    def test_reads_only_skill_and_task(self):
        self.assertIn("Read only the skill text and the engineering task", PLANNER)

    def test_writes_only_the_two_files_then_stops(self):
        self.assertIn("{task_file}", PLANNER)
        self.assertIn("{verify_file}", PLANNER)
        self.assertIn("only that file", PLANNER)
        self.assertIn("Write both files, then stop", PLANNER)

    def test_still_requires_task_file_contents(self):
        for required in ("the goal", "the files or areas to change", "constraints",
                         "acceptance criteria"):
            self.assertIn(required, PLANNER, f"missing requirement: {required!r}")

    def test_still_forbids_touching_the_repo(self):
        self.assertIn("Do not modify any file inside the repository", PLANNER)
        self.assertIn("Do not commit", PLANNER)

    def test_planner_timeout_stays_600s(self):
        source = _arm_openswarm_source()
        match = re.search(r"run_pi\(\s*tid\s*\+\s*\"-plan\".*?,\s*(\d+)\s*,", source, re.DOTALL)
        self.assertIsNotNone(match, "planner run_pi call not found in arm_openswarm")
        self.assertEqual(match.group(1), "600",
                         "planner timeout must stay 600s (PR #41); only the prompt changes")


if __name__ == "__main__":
    unittest.main()
