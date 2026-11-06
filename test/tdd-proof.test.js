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

  test('scoped snapshot seals only the change and replays the rest from HEAD (P1-4)', () => {
    const projectRoot = makeGitChangeRoot();
    try {
      mkdirSync(resolve(projectRoot, 'src'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'test'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'src', 'add.js'), 'export function add(a, b) { return a + b; }\n');
      writeFileSync(resolve(projectRoot, 'src', 'untouched.js'), 'export const MARKER = "sealed-by-head";\n');
      writeFileSync(resolve(projectRoot, 'test', 'add.test.js'), [
        "import test from 'node:test';",
        "import assert from 'node:assert/strict';",
        "import { add } from '../src/add.js';",
        "import { MARKER } from '../src/untouched.js';",
        "test('adds', () => { assert.equal(add(2, 2), 4); });",
        "test('untouched file is materialized from HEAD at replay', () => { assert.equal(MARKER, 'sealed-by-head'); });",
        '',
      ].join('\n'));
      git(projectRoot, ['add', '.']);
      git(projectRoot, ['commit', '-m', 'baseline product']);
      // The change: one source file touched, nothing else.
      writeFileSync(resolve(projectRoot, 'src', 'add.js'), 'export function add(a, b) { return a + b; } // touched\n');

      const run = runAtom('xflow/atoms/i6a_tdd_run.py', projectRoot, [
        '--phase', 'green', '--test-command', 'node --test test/add.test.js',
      ]);
      assert.equal(run.status, 0, run.stderr || run.stdout);
      const proof = JSON.parse(readFileSync(
        resolve(projectRoot, 'specs', 'changes', 'chg-tdd', 'tdd', 'green-0.json'),
        'utf8',
      ));
      assert.ok(proof.snapshot_scope, 'git-backed runs record a snapshot scope');
      assert.deepEqual(Object.keys(proof.file_hashes).sort(), ['src/add.js', 'test/add.test.js']);
      assert.ok(!('src/untouched.js' in proof.file_hashes), 'untouched files stay out of the manifest');
      const validate = runAtom('xflow/atoms/i6b_tdd_proof_validate.py', projectRoot, ['--phase', 'green']);
      assert.equal(validate.status, 0, validate.stderr || validate.stdout);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('scoped snapshot keeps deletions deleted at replay and catches unsealed test drift', () => {
    const projectRoot = makeGitChangeRoot();
    try {
      mkdirSync(resolve(projectRoot, 'src'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'test'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'src', 'keep.js'), 'export const keep = 1;\n');
      writeFileSync(resolve(projectRoot, 'src', 'gone.js'), 'export const gone = 1;\n');
      writeFileSync(resolve(projectRoot, 'test', 'keep.test.js'), [
        "import test from 'node:test';",
        "import assert from 'node:assert/strict';",
        "import { existsSync } from 'node:fs';",
        "test('deleted file stays deleted', () => { assert.equal(existsSync(new URL('../src/gone.js', import.meta.url)), false); });",
        '',
      ].join('\n'));
      writeFileSync(resolve(projectRoot, 'test', 'other.test.js'), [
        "import test from 'node:test';",
        "import assert from 'node:assert/strict';",
        "test('other', () => { assert.ok(true); });",
        '',
      ].join('\n'));
      git(projectRoot, ['add', '.']);
      git(projectRoot, ['commit', '-m', 'baseline product']);
      rmSync(resolve(projectRoot, 'src', 'gone.js'));

      const run = runAtom('xflow/atoms/i6a_tdd_run.py', projectRoot, [
        '--phase', 'green', '--test-command', 'node --test test/keep.test.js',
      ]);
      assert.equal(run.status, 0, run.stderr || run.stdout);
      const proof = JSON.parse(readFileSync(
        resolve(projectRoot, 'specs', 'changes', 'chg-tdd', 'tdd', 'green-0.json'),
        'utf8',
      ));
      assert.deepEqual(proof.snapshot_scope.deleted, ['src/gone.js']);
      const validate = runAtom('xflow/atoms/i6b_tdd_proof_validate.py', projectRoot, ['--phase', 'green']);
      assert.equal(validate.status, 0, validate.stderr || validate.stdout);

      // A test file outside the sealed scope drifts after the proof: the
      // green check must refuse it even though it was never in file_hashes.
      writeFileSync(resolve(projectRoot, 'test', 'other.test.js'), [
        "import test from 'node:test';",
        "import assert from 'node:assert/strict';",
        "test('other', () => { assert.ok(false); });",
        '',
      ].join('\n'));
      const drifted = runAtom('xflow/atoms/i6b_tdd_proof_validate.py', projectRoot, ['--phase', 'green']);
      assert.notEqual(drifted.status, 0);
      assert.match(drifted.stdout, /green_tree_mismatch/);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  // P1-3 (issue #5): stat-anchored verification re-reads only files whose
  // seal-time stat anchor moved; unchanged sealed files are accepted by
  // stat alone, and proofs sealed before the anchors existed fall back to
  // the full re-read.
  function sealGreen(projectRoot) {
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
    git(projectRoot, ['add', '.']);
    git(projectRoot, ['commit', '-m', 'baseline product']);
    writeFileSync(resolve(projectRoot, 'src', 'add.js'), 'export function add(a, b) { return a + b; } // touched\n');
    const run = runAtom('xflow/atoms/i6a_tdd_run.py', projectRoot, [
      '--phase', 'green', '--test-command', 'node --test test/add.test.js',
    ]);
    assert.equal(run.status, 0, run.stderr || run.stdout);
    return JSON.parse(readFileSync(
      resolve(projectRoot, 'specs', 'changes', 'chg-tdd', 'tdd', 'green-0.json'),
      'utf8',
    ));
  }

  function stripSealStats(projectRoot, proofPath) {
    const strip = spawnSync('python3', ['-c', [
      'import sys, json',
      'sys.path.insert(0, "xflow/atoms")',
      'import tdd_lib',
      'path = sys.argv[1]',
      'proof = json.load(open(path))',
      'scope = proof.get("snapshot_scope") or {}',
      'scope.pop("file_stats", None)',
      'scope.pop("copy_stats", None)',
      'proof["snapshot_scope"] = scope',
      'proof["binding"] = tdd_lib.compute_binding(proof)',
      'json.dump(proof, open(path, "w"), indent=2)',
    ].join('\n'), proofPath], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 10000 });
    assert.equal(strip.status, 0, strip.stderr || strip.stdout);
  }

  test('stat-anchored validation re-reads nothing when the tree is unchanged (P1-3)', () => {
    const projectRoot = makeGitChangeRoot();
    try {
      const proof = sealGreen(projectRoot);
      assert.deepEqual(Object.keys(proof.file_hashes).sort(), ['src/add.js', 'test/add.test.js']);
      assert.ok(proof.snapshot_scope.file_stats, 'seal records tree stat anchors');
      assert.ok(proof.snapshot_scope.copy_stats, 'seal records snapshot-copy stat anchors');
      const validate = runAtom('xflow/atoms/i6b_tdd_proof_validate.py', projectRoot, ['--phase', 'green']);
      assert.equal(validate.status, 0, validate.stderr || validate.stdout);
      const result = JSON.parse(validate.stdout);
      assert.equal(result.verdict, 'valid');
      assert.deepEqual(result.reread_files, []);
      assert.equal(result.reread_count, 0);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('a test file edited after the seal is caught and named (P1-3)', () => {
    const projectRoot = makeGitChangeRoot();
    try {
      sealGreen(projectRoot);
      writeFileSync(resolve(projectRoot, 'test', 'add.test.js'), [
        "import test from 'node:test';",
        "import assert from 'node:assert/strict';",
        "import { add } from '../src/add.js';",
        "test('adds', () => { assert.equal(add(2, 2), 5); });",
        '',
      ].join('\n'));
      const validate = runAtom('xflow/atoms/i6b_tdd_proof_validate.py', projectRoot, ['--phase', 'green']);
      assert.notEqual(validate.status, 0, validate.stdout);
      assert.match(validate.stdout, /green_tree_mismatch/);
      assert.match(validate.stdout, /test\/add\.test\.js/);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('a tampered snapshot copy is caught by the seal check (P1-3)', () => {
    const projectRoot = makeGitChangeRoot();
    try {
      sealGreen(projectRoot);
      const copy = resolve(projectRoot, 'specs', 'changes', 'chg-tdd', 'tdd', 'snapshots', 'green-0', 'src', 'add.js');
      writeFileSync(copy, 'export function add(a, b) { return a - b; }\n');
      const validate = runAtom('xflow/atoms/i6b_tdd_proof_validate.py', projectRoot, ['--phase', 'green']);
      assert.notEqual(validate.status, 0, validate.stdout);
      assert.match(validate.stdout, /snapshot_mismatch/);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('proofs sealed without stat anchors still verify by full re-read (P1-3)', () => {
    const projectRoot = makeGitChangeRoot();
    try {
      sealGreen(projectRoot);
      const proofPath = resolve(projectRoot, 'specs', 'changes', 'chg-tdd', 'tdd', 'green-0.json');
      stripSealStats(projectRoot, proofPath);
      const validate = runAtom('xflow/atoms/i6b_tdd_proof_validate.py', projectRoot, ['--phase', 'green']);
      assert.equal(validate.status, 0, validate.stderr || validate.stdout);
      const result = JSON.parse(validate.stdout);
      assert.equal(result.verdict, 'valid');
      assert.deepEqual(result.reread_files, ['src/add.js', 'test/add.test.js']);
      assert.equal(result.reread_count, 2);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  // P1-2 follow-up (issue #5): the in-process re-reads inside one gate
  // run — I6c/J6 reading the same source file several times for symbols,
  // assertions and references — are served by a per-process cache keyed
  // by the P1-3 stat anchor, so each unchanged file is read from disk
  // once per run and a changed file is re-read instead of served stale.
  test('read cache serves repeated reads from one disk read (P1-2 follow-up)', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'openflow-cache-'));
    try {
      const target = resolve(projectRoot, 'note.txt');
      writeFileSync(target, 'first\n');
      const check = spawnSync('python3', ['-c', [
        'import sys',
        'sys.path.insert(0, "xflow/atoms")',
        'import tdd_lib',
        'from pathlib import Path',
        'cache = tdd_lib.FileReadCache()',
        'p = Path(sys.argv[1])',
        'assert cache.read_text(p) == "first\\n"',
        'assert cache.read_text(p) == "first\\n"',
        'assert cache.read_text(p) == "first\\n"',
        'assert cache.stats() == {"disk_reads": 1, "cache_hits": 2}, cache.stats()',
        'p.write_text("second, longer\\n")',
        'assert cache.read_text(p) == "second, longer\\n"',
        'assert cache.stats() == {"disk_reads": 2, "cache_hits": 2}, cache.stats()',
        'assert cache.get(Path(sys.argv[1] + ".missing")) is None',
        'assert cache.read_text(Path(sys.argv[1] + ".missing")) == ""',
        'assert cache.stats() == {"disk_reads": 2, "cache_hits": 2}, cache.stats()',
      ].join('\n'), target], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 10000 });
      assert.equal(check.status, 0, check.stderr || check.stdout);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('quality review reports its per-process read cache (P1-2 follow-up)', () => {
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
      // src/feature.js from disk once (symbols), then a cache hit
      // (implementation sources); test/feature.test.js from disk once
      // (symbol reference check), then a cache hit (test review).
      assert.deepEqual(proof.read_cache, { disk_reads: 2, cache_hits: 2 });
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
