// Regression coverage for issue #5 P0-2 / P0-3 and v0.4 F3: the SWE-bench
// harness must keep workflow evidence out of solution patches, give every
// agent run a private uv cache, and emit official predictions through the
// same stdlib-only Python modules. This test shells out to their unittest
// files in one Python run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

test('swebench harness isolation (evidence diff filter + per-run uv cache + predictions)', () => {
  const benchDir = resolve(process.cwd(), 'bench/swebench');
  const result = spawnSync('python3', ['-m', 'unittest', 'test_diff_filter', 'test_predictions', 'test_instances', 'test_reps_report', '-v'], {
    cwd: benchDir,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
