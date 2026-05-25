import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = process.cwd();

function makeChangeRoot() {
  const projectRoot = mkdtempSync(join(tmpdir(), 'as-xflow-tdd-'));
  mkdirSync(resolve(projectRoot, 'specs', 'changes', 'chg-tdd'), { recursive: true });
  return projectRoot;
}

function runAtom(script, projectRoot, args = []) {
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
    timeout: 5000,
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
});
