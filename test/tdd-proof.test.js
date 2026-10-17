import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = process.cwd();

function makeChangeRoot() {
  const projectRoot = mkdtempSync(join(tmpdir(), 'openflow-tdd-'));
  mkdirSync(resolve(projectRoot, 'specs', 'changes', 'chg-tdd'), { recursive: true });
  return projectRoot;
}

function runAtom(script, projectRoot, args = [], timeout = 20000) {
  return spawnSync('python3', [
    resolve(REPO_ROOT, script),
    '--project-root',
    projectRoot,
    '--change-id',
    'chg-tdd',
    ...args,
  ], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout,
  });
}

function git(projectRoot, args) {
  const result = spawnSync('git', args, {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: 5000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result;
}

function makeGitChangeRoot() {
  const projectRoot = makeChangeRoot();
  git(projectRoot, ['init']);
  git(projectRoot, ['config', 'user.email', 'xflow@example.test']);
  git(projectRoot, ['config', 'user.name', 'xflow test']);
  writeFileSync(resolve(projectRoot, 'package.json'), '{"type":"module"}\n');
  git(projectRoot, ['add', '.']);
  git(projectRoot, ['commit', '-m', 'baseline']);
  return projectRoot;
}

function writeProofs(projectRoot) {
  const tddDir = resolve(projectRoot, 'specs', 'changes', 'chg-tdd', 'tdd');
  mkdirSync(tddDir, { recursive: true });
  writeFileSync(resolve(tddDir, 'red-0.json'), JSON.stringify({
    phase: 'red',
    attempt: 0,
    command: 'npm test -- new behavior',
    exit_code: 1,
    passed: false,
    expected: 'fail',
    expectation_met: true,
    recorded_at: new Date().toISOString(),
  }, null, 2));
  writeFileSync(resolve(tddDir, 'green-0.json'), JSON.stringify({
    phase: 'green',
    attempt: 0,
    command: 'npm test',
    exit_code: 0,
    passed: true,
    expected: 'pass',
    expectation_met: true,
    recorded_at: new Date().toISOString(),
  }, null, 2));
}

describe('TDD proof semantics', () => {
  test('red phase succeeds only when the raw test command fails', () => {
    const projectRoot = makeChangeRoot();
    try {
      const run = runAtom('xflow/atoms/i6a_tdd_run.py', projectRoot, [
        '--phase',
        'red',
        '--test-command',
        'exit 1',
      ]);
      assert.equal(run.status, 0, run.stderr || run.stdout);

      const proof = JSON.parse(readFileSync(
        resolve(projectRoot, 'specs', 'changes', 'chg-tdd', 'tdd', 'red-0.json'),
        'utf8',
      ));
      assert.equal(proof.passed, false);
      assert.equal(proof.expected, 'fail');
      assert.equal(proof.expectation_met, true);

      const validate = runAtom('xflow/atoms/i6b_tdd_proof_validate.py', projectRoot, ['--phase', 'red']);
      assert.equal(validate.status, 0, validate.stderr || validate.stdout);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('red phase rejects a passing raw test command', () => {
    const projectRoot = makeChangeRoot();
    try {
      const run = runAtom('xflow/atoms/i6a_tdd_run.py', projectRoot, [
        '--phase',
        'red',
        '--test-command',
        'true',
      ]);
      assert.notEqual(run.status, 0, run.stdout);

      const validate = runAtom('xflow/atoms/i6b_tdd_proof_validate.py', projectRoot, ['--phase', 'red']);
      assert.notEqual(validate.status, 0, validate.stdout);
      assert.match(validate.stdout, /semantic_error|expectation_not_met/);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('green phase requires a passing raw test command', () => {
    const projectRoot = makeChangeRoot();
    try {
      const run = runAtom('xflow/atoms/i6a_tdd_run.py', projectRoot, [
        '--phase',
        'green',
        '--test-command',
        'true',
      ]);
      assert.equal(run.status, 0, run.stderr || run.stdout);

      const validate = runAtom('xflow/atoms/i6b_tdd_proof_validate.py', projectRoot, ['--phase', 'green']);
      assert.equal(validate.status, 0, validate.stderr || validate.stdout);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('quality review accepts code changes with meaningful changed tests', () => {
    const projectRoot = makeGitChangeRoot();
    try {
      writeProofs(projectRoot);
      mkdirSync(resolve(projectRoot, 'src'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'test'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'src', 'feature.js'), 'export function answer() { return 42; }\n');
      writeFileSync(resolve(projectRoot, 'test', 'feature.test.js'), [
        "import assert from 'node:assert/strict';",
        "import { answer } from '../src/feature.js';",
        "assert.equal(answer(), 42);",
        '',
      ].join('\n'));

      const review = runAtom('xflow/atoms/i6c_tdd_quality_review.py', projectRoot);
      assert.equal(review.status, 0, review.stderr || review.stdout);
      const proof = JSON.parse(readFileSync(
        resolve(projectRoot, 'specs', 'changes', 'chg-tdd', 'tdd', 'quality-0.json'),
        'utf8',
      ));
      assert.equal(proof.ok, true);
      assert.deepEqual(proof.findings.filter((finding) => finding.severity === 'fail'), []);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('quality review ignores specs docs and fixture assets when scanning tests', () => {
    const projectRoot = makeGitChangeRoot();
    try {
      writeProofs(projectRoot);
      mkdirSync(resolve(projectRoot, 'src'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'test'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'test', 'fixtures', 'sample-app'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'specs'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'src', 'feature.js'), 'export function answer() { return 42; }\n');
      writeFileSync(resolve(projectRoot, 'test', 'feature.test.js'), [
        "import assert from 'node:assert/strict';",
        "import { answer } from '../src/feature.js';",
        "assert.equal(answer(), 42);",
        '',
      ].join('\n'));
      writeFileSync(resolve(projectRoot, 'specs', 'workflow.md'), 'mock stub spy fixture words only\n');
      writeFileSync(resolve(projectRoot, 'test', 'fixtures', 'sample-app', 'app.js'), 'export const fixture = true;\n');
      writeFileSync(resolve(projectRoot, 'test', 'fixtures', 'sample-app', 'index.html'), '<main>fixture</main>\n');
      writeFileSync(resolve(projectRoot, 'test', 'fixtures', 'sample-app', 'README.md'), 'fixture docs\n');
      writeFileSync(resolve(projectRoot, 'test', 'fixtures', 'sample-app', 'input.json'), '{"fixture":true}\n');

      const review = runAtom('xflow/atoms/i6c_tdd_quality_review.py', projectRoot);
      assert.equal(review.status, 0, review.stderr || review.stdout);
      const proof = JSON.parse(readFileSync(
        resolve(projectRoot, 'specs', 'changes', 'chg-tdd', 'tdd', 'quality-0.json'),
        'utf8',
      ));
      assert.equal(proof.ok, true);
      assert.deepEqual(proof.test_files, ['test/feature.test.js']);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('quality review rejects code changes without changed tests', () => {
    const projectRoot = makeGitChangeRoot();
    try {
      writeProofs(projectRoot);
      mkdirSync(resolve(projectRoot, 'src'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'src', 'feature.js'), 'export function answer() { return 42; }\n');

      const review = runAtom('xflow/atoms/i6c_tdd_quality_review.py', projectRoot);
      assert.notEqual(review.status, 0, review.stdout);
      assert.match(review.stdout, /code_without_test_change/);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('quality review rejects trivial or snapshot-only tests', () => {
    const projectRoot = makeGitChangeRoot();
    try {
      writeProofs(projectRoot);
      mkdirSync(resolve(projectRoot, 'src'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'test'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'src', 'feature.js'), 'export function answer() { return 42; }\n');
      writeFileSync(resolve(projectRoot, 'test', 'feature.test.js'), [
        'assert.ok(true);',
        '',
      ].join('\n'));
      writeFileSync(resolve(projectRoot, 'test', 'snapshot.test.js'), [
        'expect(view).toMatchSnapshot();',
        '',
      ].join('\n'));

      const review = runAtom('xflow/atoms/i6c_tdd_quality_review.py', projectRoot);
      assert.notEqual(review.status, 0, review.stdout);
      const proof = JSON.parse(readFileSync(
        resolve(projectRoot, 'specs', 'changes', 'chg-tdd', 'tdd', 'quality-0.json'),
        'utf8',
      ));
      const codes = proof.findings.map((finding) => finding.code);
      assert.ok(codes.includes('trivial_assertion'));
      assert.ok(codes.includes('snapshot_only_test'));
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('a hand-edited red proof fails binding validation', () => {
    const projectRoot = makeGitChangeRoot();
    try {
      mkdirSync(resolve(projectRoot, 'src'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'test'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'src', 'add.js'), 'export function add(a, b) { return a + b; }\n');
      writeFileSync(resolve(projectRoot, 'test', 'add.test.js'), [
        "import test from 'node:test';",
        "import assert from 'node:assert/strict';",
        "import { add } from '../src/add.js';",
        "test('adds', () => { assert.equal(add(2, 2), 4); });",
        '',
      ].join('\n'));
      const run = runAtom('xflow/atoms/i6a_tdd_run.py', projectRoot, [
        '--phase', 'red', '--test-command', 'node --test test/add.test.js',
      ]);
      assert.notEqual(run.status, 0, run.stdout);
      const proofPath = resolve(projectRoot, 'specs', 'changes', 'chg-tdd', 'tdd', 'red-0.json');
      const proof = JSON.parse(readFileSync(proofPath, 'utf8'));
      proof.exit_code = 1;
      proof.passed = false;
      proof.expectation_met = true;
      proof.stdout_tail = 'not ok 1 - adds\nAssertionError: forged\n';
      writeFileSync(proofPath, JSON.stringify(proof, null, 2));
      const validate = runAtom('xflow/atoms/i6b_tdd_proof_validate.py', projectRoot, ['--phase', 'red']);
      assert.notEqual(validate.status, 0, validate.stdout);
      assert.match(validate.stdout, /binding_mismatch|reexec_exit_mismatch|proof_inconsistent/);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('green validation rejects a test file that changed after the snapshot', () => {
    const projectRoot = makeChangeRoot();
    try {
      mkdirSync(resolve(projectRoot, 'test'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'test', 'add.test.js'), 'import test from "node:test";\ntest("ok", () => {});\n');
      const run = runAtom('xflow/atoms/i6a_tdd_run.py', projectRoot, [
        '--phase', 'green', '--test-command', 'node --test test/add.test.js',
      ]);
      assert.equal(run.status, 0, run.stderr || run.stdout);
      writeFileSync(resolve(projectRoot, 'test', 'add.test.js'), 'import test from "node:test";\ntest("changed", () => {});\n');
      const validate = runAtom('xflow/atoms/i6b_tdd_proof_validate.py', projectRoot, ['--phase', 'green']);
      assert.notEqual(validate.status, 0, validate.stdout);
      assert.match(validate.stdout, /green_tree_mismatch/);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('skipped and todo tests do not count as green', () => {
    const projectRoot = makeGitChangeRoot();
    try {
      writeProofs(projectRoot);
      mkdirSync(resolve(projectRoot, 'src'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'test'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'src', 'add.js'), 'export function add(a, b) { return a + b; }\n');
      writeFileSync(resolve(projectRoot, 'test', 'add.test.js'), [
        "import test from 'node:test';",
        "test('adds', { skip: true }, () => {});",
        "test('later', { todo: true }, () => {});",
        '',
      ].join('\n'));
      const run = runAtom('xflow/atoms/i6a_tdd_run.py', projectRoot, [
        '--phase', 'green', '--test-command', 'node --test test/add.test.js',
      ]);
      assert.equal(run.status, 0, run.stderr || run.stdout);
      const validate = runAtom('xflow/atoms/i6b_tdd_proof_validate.py', projectRoot, ['--phase', 'green']);
      assert.notEqual(validate.status, 0, validate.stdout);
      assert.match(validate.stdout, /tests_skipped_or_todo/);
      const review = runAtom('xflow/atoms/i6c_tdd_quality_review.py', projectRoot);
      assert.match(review.stdout, /skipped_or_todo_test/);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('red and green commands must target the same test', () => {
    const projectRoot = makeGitChangeRoot();
    try {
      const tddDir = resolve(projectRoot, 'specs', 'changes', 'chg-tdd', 'tdd');
      mkdirSync(tddDir, { recursive: true });
      writeFileSync(resolve(tddDir, 'red-0.json'), JSON.stringify({
        phase: 'red', attempt: 0, command: 'node -e "process.exit(1)"', exit_code: 1, passed: false, recorded_at: 't',
      }));
      writeFileSync(resolve(tddDir, 'green-0.json'), JSON.stringify({
        phase: 'green', attempt: 0, command: 'node --test test/add.test.js', exit_code: 0, passed: true, recorded_at: 't',
      }));
      mkdirSync(resolve(projectRoot, 'src'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'test'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'src', 'add.js'), 'export function add(a, b) { return a + b; }\n');
      writeFileSync(resolve(projectRoot, 'test', 'add.test.js'), [
        "import { add } from '../src/add.js';",
        'import assert from "node:assert/strict";',
        'assert.equal(add(2, 2), 4);',
        '',
      ].join('\n'));
      const review = runAtom('xflow/atoms/i6c_tdd_quality_review.py', projectRoot);
      assert.notEqual(review.status, 0, review.stdout);
      assert.match(review.stdout, /red_command_not_a_test|red_green_command_mismatch/);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('python unittest assertions count, and a sole typeof assertion is weak', () => {
    const projectRoot = makeGitChangeRoot();
    try {
      writeProofs(projectRoot);
      writeFileSync(resolve(projectRoot, 'add.py'), 'def add(a, b):\n    return a + b\n');
      mkdirSync(resolve(projectRoot, 'tests'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'src'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'test'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'tests', 'test_add.py'), [
        'import add',
        'import unittest',
        'class AddTests(unittest.TestCase):',
        '    def test_add(self):',
        '        self.assertEqual(add.add(2, 2), 4)',
        '',
      ].join('\n'));
      const review = runAtom('xflow/atoms/i6c_tdd_quality_review.py', projectRoot);
      assert.equal(review.status, 0, review.stderr || review.stdout);

      writeFileSync(resolve(projectRoot, 'src', 'feature.js'), 'export function answer() { return 0; }\n');
      mkdirSync(resolve(projectRoot, 'test'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'test', 'feature.test.js'), [
        "import { answer } from '../src/feature.js';",
        "import assert from 'node:assert/strict';",
        "assert.equal(typeof answer(), 'number');",
        '',
      ].join('\n'));
      const weak = runAtom('xflow/atoms/i6c_tdd_quality_review.py', projectRoot);
      assert.notEqual(weak.status, 0, weak.stdout);
      assert.match(weak.stdout, /weak_assertion/);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('a normal equality assertion is not treated as weak', () => {
    const projectRoot = makeGitChangeRoot();
    try {
      writeProofs(projectRoot);
      mkdirSync(resolve(projectRoot, 'src'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'test'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'src', 'feature.js'), 'export function answer() { return 0; }\n');
      writeFileSync(resolve(projectRoot, 'test', 'feature.test.js'), [
        "import { answer } from '../src/feature.js';",
        "import assert from 'node:assert/strict';",
        'assert.equal(answer(), 1);',
        '',
      ].join('\n'));
      const review = runAtom('xflow/atoms/i6c_tdd_quality_review.py', projectRoot);
      assert.equal(review.status, 0, review.stderr || review.stdout);
      assert.doesNotMatch(review.stdout, /weak_assertion/);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('refactor mode requires a green before and after, and docs mode rejects code edits', () => {
    const projectRoot = makeGitChangeRoot();
    try {
      mkdirSync(resolve(projectRoot, 'src'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'test'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'src', 'add.js'), 'export function add(a, b) {\n  const sum = a + b;\n  return sum;\n}\n');
      writeFileSync(resolve(projectRoot, 'test', 'add.test.js'), [
        "import test from 'node:test';",
        "import assert from 'node:assert/strict';",
        "import { add } from '../src/add.js';",
        "test('adds', () => { assert.equal(add(2, 2), 4); });",
        '',
      ].join('\n'));
      git(projectRoot, ['add', '.']);
      git(projectRoot, ['commit', '-m', 'behavior']);
      writeFileSync(resolve(projectRoot, 'src', 'add.js'), 'export function add(a, b) {\n  return a + b;\n}\n');
      const changeDir = resolve(projectRoot, 'specs', 'changes', 'chg-tdd');
      writeFileSync(resolve(changeDir, 'status.json'), JSON.stringify({ tdd_mode: 'refactor' }));
      const green = runAtom('xflow/atoms/i6a_tdd_run.py', projectRoot, [
        '--phase', 'green', '--test-command', 'node --test test/add.test.js',
      ]);
      assert.equal(green.status, 0, green.stderr || green.stdout);
      const missingRed = runAtom('xflow/atoms/i6b_tdd_proof_validate.py', projectRoot, ['--phase', 'red']);
      assert.equal(missingRed.status, 0, missingRed.stderr || missingRed.stdout);
      assert.match(missingRed.stdout, /not_required/);
      const review = runAtom('xflow/atoms/i6c_tdd_quality_review.py', projectRoot);
      assert.equal(review.status, 0, review.stderr || review.stdout);

      writeFileSync(resolve(projectRoot, 'test', 'add.test.js'), [
        "import test from 'node:test';",
        "import assert from 'node:assert/strict';",
        "import { add } from '../src/add.js';",
        "test('adds', () => { assert.equal(typeof add(2, 2), 'number'); });",
        '',
      ].join('\n'));
      const weakened = runAtom('xflow/atoms/i6c_tdd_quality_review.py', projectRoot);
      assert.notEqual(weakened.status, 0, weakened.stdout);
      assert.match(weakened.stdout, /assertions_removed/);

      writeFileSync(resolve(changeDir, 'status.json'), JSON.stringify({ tdd_mode: 'docs' }));
      writeFileSync(resolve(projectRoot, 'README.md'), '# Docs only\n');
      const docsMisuse = runAtom('xflow/atoms/i6c_tdd_quality_review.py', projectRoot, ['--tdd-mode', 'docs']);
      assert.notEqual(docsMisuse.status, 0, docsMisuse.stdout);
      assert.match(docsMisuse.stdout, /docs_mode_with_code_change/);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('a missing named export is a test failure, a missing module is not', () => {
    const projectRoot = makeGitChangeRoot();
    try {
      mkdirSync(resolve(projectRoot, 'src'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'test'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'src', 'add.js'), 'export function add(a, b) { return a + b; }\n');
      writeFileSync(resolve(projectRoot, 'test', 'add.test.js'), [
        "import test from 'node:test';",
        "import assert from 'node:assert/strict';",
        "import { add, multiply } from '../src/add.js';",
        "test('multiplies', () => { assert.equal(multiply(3, 4), 12); });",
        '',
      ].join('\n'));
      const missingExport = runAtom('xflow/atoms/i6a_tdd_run.py', projectRoot, [
        '--phase', 'red', '--test-command', 'node --test test/add.test.js',
      ]);
      assert.equal(missingExport.status, 0, missingExport.stderr || missingExport.stdout);
      const proof = JSON.parse(readFileSync(
        resolve(projectRoot, 'specs', 'changes', 'chg-tdd', 'tdd', 'red-0.json'),
        'utf8',
      ));
      assert.equal(proof.failure_kind, 'test_error');

      writeFileSync(resolve(projectRoot, 'test', 'add.test.js'), "import './missing.js';\n");
      const missingModule = runAtom('xflow/atoms/i6a_tdd_run.py', projectRoot, [
        '--phase', 'red', '--test-command', 'node --test test/add.test.js',
      ]);
      assert.equal(missingModule.status, 0, missingModule.stderr || missingModule.stdout);
      const imported = JSON.parse(readFileSync(
        resolve(projectRoot, 'specs', 'changes', 'chg-tdd', 'tdd', 'red-0.json'),
        'utf8',
      ));
      assert.equal(imported.failure_kind, 'import_or_syntax');
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('docs mode accepts a documentation-only diff without a red proof', () => {
    const projectRoot = makeGitChangeRoot();
    try {
      mkdirSync(resolve(projectRoot, 'src'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'test'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'src', 'add.js'), 'export function add(a, b) { return a + b; }\n');
      writeFileSync(resolve(projectRoot, 'test', 'add.test.js'), [
        "import test from 'node:test';",
        "import assert from 'node:assert/strict';",
        "import { add } from '../src/add.js';",
        "test('adds', () => { assert.equal(add(2, 2), 4); });",
        '',
      ].join('\n'));
      writeFileSync(resolve(projectRoot, 'README.md'), '# Before\n');
      git(projectRoot, ['add', '.']);
      git(projectRoot, ['commit', '-m', 'baseline product']);
      writeFileSync(resolve(projectRoot, 'README.md'), '# After\n\nadd returns a sum.\n');
      writeFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-tdd', 'status.json'), JSON.stringify({ tdd_mode: 'docs' }));
      const missingRed = runAtom('xflow/atoms/i6b_tdd_proof_validate.py', projectRoot, ['--phase', 'red']);
      assert.equal(missingRed.status, 0, missingRed.stdout);
      assert.match(missingRed.stdout, /not_required/);
      const review = runAtom('xflow/atoms/i6c_tdd_quality_review.py', projectRoot);
      assert.equal(review.status, 0, review.stderr || review.stdout);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
