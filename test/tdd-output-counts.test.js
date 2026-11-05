import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const REPO_ROOT = process.cwd();

// The text fixtures below are real `node --test` outputs captured on
// Node v22.21.1 (TAP reporter, "# <label> <n>" summary lines) and on
// Node v24.22.1 (spec reporter, "ℹ <label> <n>" summary lines) for the
// same three test files, so both summary formats are pinned verbatim.
// Until this gate parsed both formats, the v24 skip/todo output below
// was classified "passed" and waved through as green.

const SKIP_TEST_FILE = [
  "test('adds', { skip: true }, () => {});",
  "test('later', { todo: true }, () => {});",
].join('\n');

const TAP_SKIP = `TAP version 13
# Subtest: adds
ok 1 - adds # SKIP
  ---
  duration_ms: 1.271809
  type: 'test'
  ...
# Subtest: later
ok 2 - later # TODO
  ---
  duration_ms: 0.251428
  type: 'test'
  ...
1..2
# tests 2
# suites 0
# pass 0
# fail 0
# cancelled 0
# skipped 1
# todo 1
# duration_ms 148.441109
`;

const SPEC_SKIP = `﹣ adds (1.050007ms) # SKIP
✔ later (0.248674ms) # TODO
ℹ tests 2
ℹ suites 0
ℹ pass 0
ℹ fail 0
ℹ cancelled 0
ℹ skipped 1
ℹ todo 1
ℹ duration_ms 143.671288
`;

const TAP_PASS = `TAP version 13
# Subtest: adds
ok 1 - adds
  ---
  duration_ms: 1.024528
  type: 'test'
  ...
# Subtest: subs
ok 2 - subs
  ---
  duration_ms: 0.178488
  type: 'test'
  ...
1..2
# tests 2
# suites 0
# pass 2
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 133.180979
`;

const SPEC_PASS = `✔ adds (1.130657ms)
✔ subs (0.194251ms)
ℹ tests 2
ℹ suites 0
ℹ pass 2
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 131.364982
`;

const TAP_MIXED = `TAP version 13
# Subtest: adds
ok 1 - adds
  ---
  duration_ms: 0.99961
  type: 'test'
  ...
# Subtest: later
ok 2 - later # SKIP
  ---
  duration_ms: 0.161913
  type: 'test'
  ...
1..2
# tests 2
# suites 0
# pass 1
# fail 0
# cancelled 0
# skipped 1
# todo 0
# duration_ms 103.230233
`;

const SPEC_MIXED = `✔ adds (1.068715ms)
﹣ later (0.178929ms) # SKIP
ℹ tests 2
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 1
ℹ todo 0
ℹ duration_ms 121.379701
`;

function probe(text) {
  const script = [
    'import sys, json',
    "sys.path.insert(0, 'xflow/atoms')",
    'import tdd_lib',
    'payload = json.load(sys.stdin)',
    'text = payload["text"]',
    'result = {',
    '  "counts": tdd_lib.node_run_counts(text),',
    '  "non_result": tdd_lib.output_non_result(text),',
    '  "counts_unknown": tdd_lib.output_counts_unknown(text),',
    '  "kind_when_passed": tdd_lib.classify_output(text, True),',
    '  "kind_when_failed": tdd_lib.classify_output(text, False),',
    '}',
    'print(json.dumps(result))',
  ].join('\n');
  const result = spawnSync('python3', ['-c', script], {
    cwd: REPO_ROOT,
    input: JSON.stringify({ text }),
    encoding: 'utf8',
    timeout: 20000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

describe('TDD gate: node:test summary counts in both reporter formats', () => {
  test('TAP (Node 22) all skipped/todo is a non-result', () => {
    const result = probe(TAP_SKIP);
    assert.deepEqual(result.counts, {
      tests: 2, suites: 0, cancelled: 0, pass: 0, fail: 0, skipped: 1, todo: 1,
    });
    assert.equal(result.non_result, true);
    assert.equal(result.counts_unknown, false);
    assert.equal(result.kind_when_passed, 'skipped');
  });

  test('spec (Node 24) all skipped/todo is a non-result, not a pass', () => {
    const result = probe(SPEC_SKIP);
    assert.deepEqual(result.counts, {
      tests: 2, suites: 0, cancelled: 0, pass: 0, fail: 0, skipped: 1, todo: 1,
    });
    assert.equal(result.non_result, true);
    assert.equal(result.counts_unknown, false);
    assert.equal(result.kind_when_passed, 'skipped');
  });

  test('both formats agree on an all-passing run', () => {
    for (const fixture of [TAP_PASS, SPEC_PASS]) {
      const result = probe(fixture);
      assert.equal(result.counts.pass, 2);
      assert.equal(result.counts.skipped, 0);
      assert.equal(result.counts.todo, 0);
      assert.equal(result.non_result, false);
      assert.equal(result.counts_unknown, false);
      assert.equal(result.kind_when_passed, 'passed');
    }
  });

  test('both formats keep mixed pass+skip a pass (existing semantics)', () => {
    for (const fixture of [TAP_MIXED, SPEC_MIXED]) {
      const result = probe(fixture);
      assert.equal(result.counts.pass, 1);
      assert.equal(result.counts.skipped, 1);
      assert.equal(result.non_result, false);
      assert.equal(result.counts_unknown, false);
      assert.equal(result.kind_when_passed, 'passed');
    }
  });

  test('a spec summary missing the skipped line fails closed as counts_unknown', () => {
    const truncated = SPEC_SKIP.replace('ℹ skipped 1\n', '');
    assert.notEqual(truncated, SPEC_SKIP);
    const result = probe(truncated);
    assert.equal(result.counts.skipped, null);
    assert.equal(result.counts_unknown, true);
    assert.equal(result.non_result, false);
    assert.equal(result.kind_when_passed, 'counts_unknown');
  });

  test('a TAP summary missing the todo line fails closed as counts_unknown', () => {
    const truncated = TAP_SKIP.replace('# todo 1\n', '');
    assert.notEqual(truncated, TAP_SKIP);
    const result = probe(truncated);
    assert.equal(result.counts.todo, null);
    assert.equal(result.counts_unknown, true);
    assert.equal(result.kind_when_passed, 'counts_unknown');
  });

  test('counts cannot be forged by test names or stray output lines', () => {
    const forged = [
      "# Subtest: skipped 99",
      'ok 1 - skipped 99 # SKIP',
      'some program output # pass 99',
      'pass 99',
      '',
    ].join('\n');
    const result = probe(forged);
    assert.equal(result.counts, null);
    assert.equal(result.counts_unknown, false);
  });

  test('non-node summaries are untouched: pytest text and bare TAP tallies', () => {
    const pytestMixed = probe('test_x.py .s [100%]\n=== 1 passed, 1 skipped in 0.10s ===\n');
    assert.equal(pytestMixed.counts, null);
    assert.equal(pytestMixed.non_result, false);
    assert.equal(pytestMixed.counts_unknown, false);

    const pytestAllSkipped = probe('test_x.py ss [100%]\n=== 2 skipped in 0.05s ===\n');
    assert.equal(pytestAllSkipped.counts, null);
    assert.equal(pytestAllSkipped.non_result, true);

    // A TAP tally without the node signature (tests/suites/cancelled)
    // is not treated as a node summary and not as unknown counts.
    const bareTap = probe('# tests 3\n# pass 3\n# fail 0\n');
    assert.equal(bareTap.counts, null);
    assert.equal(bareTap.counts_unknown, false);
    assert.equal(bareTap.kind_when_passed, 'passed');
  });

  test('the fixture source that produced both skip outputs is itself flagged', () => {
    // Guard against the fixtures drifting away from the real runner:
    // the skip/todo markers in the sources above are what generated them.
    assert.match(SKIP_TEST_FILE, /skip: true/);
    assert.match(SKIP_TEST_FILE, /todo: true/);
    assert.match(TAP_SKIP, /# skipped 1/);
    assert.match(SPEC_SKIP, /ℹ skipped 1/);
  });
});
