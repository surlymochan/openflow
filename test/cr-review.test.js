import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = process.cwd();
const CHANGE_ID = 'chg-cr';

const WIDGET_BASE = `export function parseWidget(input) {\n  return String(input).trim();\n}\n`;
const WIDGET_CHANGED = `export function parseWidget(input) {\n  return String(input).trim().toLowerCase();\n}\n`;
const TEST_BASE = `import assert from 'node:assert/strict';\nimport { parseWidget } from '../src/widget.js';\n\nassert.equal(parseWidget(' a '), 'a');\nassert.equal(parseWidget('b'), 'b');\nassert.ok(parseWidget('c'));\n`;

function git(projectRoot, args) {
  const result = spawnSync('git', args, {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: 5000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result;
}

function makeRepo({ proposal } = {}) {
  const projectRoot = mkdtempSync(join(tmpdir(), 'openflow-cr-'));
  const changeDir = resolve(projectRoot, 'specs', 'changes', CHANGE_ID);
  mkdirSync(resolve(projectRoot, 'src'), { recursive: true });
  mkdirSync(resolve(projectRoot, 'test'), { recursive: true });
  mkdirSync(changeDir, { recursive: true });
  writeFileSync(resolve(projectRoot, 'package.json'), '{"type":"module"}\n');
  writeFileSync(resolve(projectRoot, 'src', 'widget.js'), WIDGET_BASE);
  writeFileSync(resolve(projectRoot, 'test', 'widget.test.js'), TEST_BASE);
  writeFileSync(resolve(changeDir, 'status.json'), JSON.stringify({
    change_id: CHANGE_ID,
    title: 'Widget parsing tune-up',
    status: 'in_progress',
  }, null, 2));
  writeFileSync(
    resolve(changeDir, 'proposal.md'),
    proposal || '# Proposal\n\nImprove parseWidget so widget input is normalized before use.\n',
  );
  git(projectRoot, ['init']);
  git(projectRoot, ['config', 'user.email', 'xflow@example.test']);
  git(projectRoot, ['config', 'user.name', 'xflow test']);
  git(projectRoot, ['add', '.']);
  git(projectRoot, ['commit', '-m', 'baseline']);
  return projectRoot;
}

function runCr(projectRoot, extraArgs = []) {
  const run = spawnSync('python3', [
    resolve(REPO_ROOT, 'xflow/atoms/j6_cr_review.py'),
    '--project-root',
    projectRoot,
    '--change-id',
    CHANGE_ID,
    ...extraArgs,
  ], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 20000,
  });
  const proof = JSON.parse(readFileSync(
    resolve(projectRoot, 'specs', 'changes', CHANGE_ID, 'cr', 'review-0.json'),
    'utf8',
  ));
  return { run, proof };
}

function codes(proof) {
  return proof.findings.map((finding) => finding.code);
}

describe('J6.cr.review gate', () => {
  test('spec-aligned change with a following test passes clean', () => {
    const projectRoot = makeRepo();
    try {
      writeFileSync(resolve(projectRoot, 'src', 'widget.js'), WIDGET_CHANGED);
      writeFileSync(
        resolve(projectRoot, 'test', 'widget.test.js'),
        TEST_BASE + "assert.equal(parseWidget('D'), 'd');\n",
      );
      const { run, proof } = runCr(projectRoot);
      assert.equal(run.status, 0, run.stderr || run.stdout);
      assert.equal(proof.verdict, 'passed');
      assert.deepEqual(proof.findings, []);
      assert.deepEqual(proof.spec_aligned_files, ['src/widget.js']);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('code file that the spec never mentions is flagged, and total misalignment fails', () => {
    const projectRoot = makeRepo();
    try {
      writeFileSync(
        resolve(projectRoot, 'src', 'gadget.js'),
        'export function frobnicateGadget(value) {\n  return value;\n}\n',
      );
      writeFileSync(
        resolve(projectRoot, 'test', 'gadget.test.js'),
        "import assert from 'node:assert/strict';\n"
        + "import { frobnicateGadget } from '../src/gadget.js';\n\n"
        + 'assert.equal(frobnicateGadget(1), 1);\n',
      );
      const { run, proof } = runCr(projectRoot);
      assert.equal(run.status, 1, run.stdout);
      assert.ok(codes(proof).includes('cr_spec_file_unaligned'));
      assert.ok(codes(proof).includes('cr_spec_alignment_none'));
      const unaligned = proof.findings.find((f) => f.code === 'cr_spec_file_unaligned');
      assert.equal(unaligned.path, 'src/gadget.js');
      assert.equal(unaligned.severity, 'warn');
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('existing test referencing the changed symbol satisfies test follow without a test change', () => {
    const projectRoot = makeRepo();
    try {
      writeFileSync(resolve(projectRoot, 'src', 'widget.js'), WIDGET_CHANGED);
      const { run, proof } = runCr(projectRoot);
      assert.equal(run.status, 0, run.stderr || run.stdout);
      assert.ok(!codes(proof).includes('cr_code_without_test'));
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('changed code with no test anywhere fails test follow', () => {
    const projectRoot = makeRepo({
      proposal: '# Proposal\n\nAdd lonelyHelper to double values in the widget pipeline.\n',
    });
    try {
      writeFileSync(
        resolve(projectRoot, 'src', 'lonely.js'),
        'export function lonelyHelper(value) {\n  return value * 2;\n}\n',
      );
      const { run, proof } = runCr(projectRoot);
      assert.equal(run.status, 1, run.stdout);
      assert.ok(codes(proof).includes('cr_code_without_test'));
      const finding = proof.findings.find((f) => f.code === 'cr_code_without_test');
      assert.equal(finding.path, 'src/lonely.js');
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('removing more assertions than are added fails the assertion balance', () => {
    const projectRoot = makeRepo();
    try {
      writeFileSync(resolve(projectRoot, 'src', 'widget.js'), WIDGET_CHANGED);
      writeFileSync(
        resolve(projectRoot, 'test', 'widget.test.js'),
        "import assert from 'node:assert/strict';\n"
        + "import { parseWidget } from '../src/widget.js';\n\n"
        + "assert.equal(parseWidget(' a '), 'a');\n",
      );
      const { run, proof } = runCr(projectRoot);
      assert.equal(run.status, 1, run.stdout);
      assert.ok(codes(proof).includes('cr_assertion_net_decrease'));
      assert.equal(proof.assertions.added, 0);
      assert.equal(proof.assertions.removed, 2);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('adding assertions keeps the assertion balance clean', () => {
    const projectRoot = makeRepo();
    try {
      writeFileSync(resolve(projectRoot, 'src', 'widget.js'), WIDGET_CHANGED);
      writeFileSync(
        resolve(projectRoot, 'test', 'widget.test.js'),
        TEST_BASE
        + "assert.equal(parseWidget('D'), 'd');\n"
        + "assert.equal(parseWidget('E'), 'e');\n",
      );
      const { run, proof } = runCr(projectRoot);
      assert.equal(run.status, 0, run.stderr || run.stdout);
      assert.ok(!codes(proof).includes('cr_assertion_net_decrease'));
      assert.equal(proof.assertions.added, 2);
      assert.equal(proof.assertions.removed, 0);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('diff over the loop budget warns and recommends splitting the spec', () => {
    const projectRoot = makeRepo();
    try {
      writeFileSync(resolve(projectRoot, 'src', 'widget.js'), WIDGET_CHANGED);
      writeFileSync(
        resolve(projectRoot, 'test', 'widget.test.js'),
        TEST_BASE + "assert.equal(parseWidget('D'), 'd');\n",
      );
      writeFileSync(resolve(projectRoot, 'README.md'), '# notes\n');
      const { run, proof } = runCr(projectRoot, ['--max-files', '2', '--max-lines', '1000']);
      assert.equal(run.status, 0, run.stderr || run.stdout);
      assert.ok(codes(proof).includes('cr_loop_budget_exceeded'));
      const finding = proof.findings.find((f) => f.code === 'cr_loop_budget_exceeded');
      assert.equal(finding.severity, 'warn');
      assert.match(finding.message, /splitting the spec/);
      assert.equal(proof.budget.files, 3);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('diff over 2x the loop budget fails', () => {
    const projectRoot = makeRepo();
    try {
      writeFileSync(resolve(projectRoot, 'src', 'widget.js'), WIDGET_CHANGED);
      writeFileSync(
        resolve(projectRoot, 'test', 'widget.test.js'),
        TEST_BASE + "assert.equal(parseWidget('D'), 'd');\n",
      );
      writeFileSync(resolve(projectRoot, 'README.md'), '# notes\n');
      const { run, proof } = runCr(projectRoot, ['--max-files', '1', '--max-lines', '1000']);
      assert.equal(run.status, 1, run.stdout);
      assert.ok(codes(proof).includes('cr_loop_budget_blown'));
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('small diff stays inside the default loop budget', () => {
    const projectRoot = makeRepo();
    try {
      writeFileSync(resolve(projectRoot, 'src', 'widget.js'), WIDGET_CHANGED);
      writeFileSync(
        resolve(projectRoot, 'test', 'widget.test.js'),
        TEST_BASE + "assert.equal(parseWidget('D'), 'd');\n",
      );
      const { run, proof } = runCr(projectRoot);
      assert.equal(run.status, 0, run.stderr || run.stdout);
      assert.ok(!codes(proof).some((code) => code.startsWith('cr_loop_budget')));
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
