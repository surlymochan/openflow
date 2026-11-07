// Regression coverage for the openswarm PLANNER prompt: the planner must
// converge to writing the task file inside its 600s budget instead of
// exploring (MiniMax 600s validation cell pylint-8898: 13 turns / 23 tools
// on lane probes and a full-disk find, killed rc 143 with no task file).
// This test shells out to the stdlib-only Python test in one Python run,
// like bench-harness-isolation.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

test('swebench openswarm planner prompt (read-only planner, 600s budget kept)', () => {
  const benchDir = resolve(process.cwd(), 'bench/swebench');
  const result = spawnSync('python3', ['-m', 'unittest', 'test_planner_prompt', '-v'], {
    cwd: benchDir,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
