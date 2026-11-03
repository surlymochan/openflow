/**
 * J6.cr.review orchestration wiring (v0.4 F1)
 *
 * Until v0.3.x the CR gate was registered and unit-tested but no workflow
 * phase ever invoked it. This suite proves the wiring at the orchestration
 * level, not just the YAML level:
 *   - yolo `verify-consistency` and corps `qa` both mount J6.cr.review and
 *     declare its verdict record (cr/review-0.json) as a required artifact.
 *   - The REAL yolo verify-consistency phase, loaded from workflows/yolo.yaml
 *     and driven through WorkflowExecutor against a git fixture project,
 *     actually calls J6: an aligned change with a following test passes and
 *     leaves a J6 verdict record plus an atom_run log entry; a change whose
 *     code has no test anywhere is stopped at the phase by J6.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { WorkflowExecutor } from '../src/core/workflow-executor.js';
import { load } from '../src/core/workflow-loader.js';

const REPO_ROOT = process.cwd();
const CHANGE_ID = 'chg-cr-wire';

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

function makeProject({ proposal }) {
  const projectRoot = mkdtempSync(join(tmpdir(), 'openflow-cr-wire-'));
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
    change_type: 'backend',
    status: 'active',
    current_stage: 'execute',
  }, null, 2));
  writeFileSync(resolve(changeDir, 'proposal.md'), proposal);
  writeFileSync(resolve(changeDir, 'plan.md'), [
    '# Plan',
    '',
    '## Steps',
    '1. Tune parseWidget in src/widget.js',
    '2. Extend the widget test so the new behaviour is covered',
    '',
    '## Verification',
    '',
    '```bash',
    'node test/widget.test.js',
    '```',
    '',
  ].join('\n'));
  writeFileSync(resolve(changeDir, 'tasks.md'), [
    '# Tasks',
    '',
    '- [ ] tune parseWidget',
    '- [ ] extend widget test',
  ].join('\n'));
  git(projectRoot, ['init']);
  git(projectRoot, ['config', 'user.email', 'xflow@example.test']);
  git(projectRoot, ['config', 'user.name', 'xflow test']);
  git(projectRoot, ['add', '.']);
  git(projectRoot, ['commit', '-m', 'baseline']);
  return projectRoot;
}

function loadVerifyPhase() {
  const { workflow, phases, registry } = load('workflows/yolo.yaml', { skipRuntimeChecks: true });
  const phase = phases.find((entry) => entry.id === 'verify-consistency');
  assert.ok(phase, 'yolo.yaml should include verify-consistency phase');
  return {
    workflow: { ...workflow, requires: { agentos_http: false, gh: false, pencil: false } },
    phase,
    registry,
  };
}

function runVerifyPhase(projectRoot) {
  const { workflow, phase, registry } = loadVerifyPhase();
  const executor = new WorkflowExecutor({
    workflow,
    phases: [phase],
    registry,
    projectRoot,
    changeId: CHANGE_ID,
    input: {},
    exitOnFailure: false,
  });
  return executor.run();
}

function readCrProof(projectRoot) {
  return JSON.parse(readFileSync(
    resolve(projectRoot, 'specs', 'changes', CHANGE_ID, 'cr', 'review-0.json'),
    'utf8',
  ));
}

function readExecutionLog(projectRoot) {
  return readFileSync(resolve(projectRoot, '.as-xflow', 'logs', 'execution.ndjson'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
}

describe('J6.cr.review workflow wiring', () => {
  test('registry carries J6 as a lite python atom', () => {
    const registry = JSON.parse(readFileSync(resolve(REPO_ROOT, 'atoms', 'registry.json'), 'utf8'));
    const def = registry.atoms['J6.cr.review'];
    assert.ok(def, 'registry entry missing for J6.cr.review');
    assert.equal(def.track, 'lite');
    assert.equal(def.type, 'python');
    assert.equal(def.script, 'xflow/atoms/j6_cr_review.py');
  });

  test('yolo verify-consistency mounts J6 before the verify stage transition', () => {
    const { phases } = load('workflows/yolo.yaml', { skipRuntimeChecks: true });
    const phase = phases.find((entry) => entry.id === 'verify-consistency');
    assert.ok(phase, 'yolo.yaml missing verify-consistency phase');
    const atomIds = (phase.atoms || []).map((atomRef) => atomRef.id);
    assert.ok(atomIds.includes('J6.cr.review'), 'verify-consistency should run J6.cr.review');
    assert.ok(
      atomIds.indexOf('J4b.spec_delta.review') < atomIds.indexOf('J6.cr.review'),
      'J6 should run after the spec-delta review',
    );
    assert.ok(
      atomIds.indexOf('J6.cr.review') < atomIds.indexOf('B3.status.transition'),
      'J6 verdict must land before the stage flips to verify',
    );
    const artifact = (phase.artifacts || []).find(
      (entry) => entry.path.endsWith('cr/review-0.json'),
    );
    assert.ok(artifact, 'verify-consistency should declare the J6 verdict record');
    assert.equal(artifact.optional, false);
  });

  test('corps qa mounts J6 and declares its verdict record', () => {
    const { phases } = load('workflows/corps.yaml', { skipRuntimeChecks: true });
    const phase = phases.find((entry) => entry.id === 'qa');
    assert.ok(phase, 'corps.yaml missing qa phase');
    const atomIds = (phase.atoms || []).map((atomRef) => atomRef.id);
    assert.ok(atomIds.includes('J6.cr.review'), 'corps qa should run J6.cr.review');
    assert.ok(
      atomIds.indexOf('J4b.spec_delta.review') < atomIds.indexOf('J6.cr.review'),
      'J6 should run after the spec-delta review in corps qa',
    );
    const artifact = (phase.artifacts || []).find(
      (entry) => entry.path.endsWith('cr/review-0.json'),
    );
    assert.ok(artifact, 'corps qa should declare the J6 verdict record');
    assert.equal(artifact.optional, false);
  });

  test('executor runs J6 in the verify phase: aligned, tested change passes with a verdict record', async () => {
    const projectRoot = makeProject({
      proposal: [
        '# Proposal',
        '',
        '## Problem',
        'Widget input arrives with inconsistent casing.',
        '',
        '## Scope',
        'Improve parseWidget so widget input is normalized before use.',
        '',
      ].join('\n'),
    });
    try {
      writeFileSync(resolve(projectRoot, 'src', 'widget.js'), WIDGET_CHANGED);
      writeFileSync(
        resolve(projectRoot, 'test', 'widget.test.js'),
        TEST_BASE + "assert.equal(parseWidget('D'), 'd');\n",
      );

      await runVerifyPhase(projectRoot);

      // The J6 verdict record exists in the change evidence directory and
      // carries the four checks' outputs (alignment, assertions, budget).
      const proof = readCrProof(projectRoot);
      assert.equal(proof.verdict, 'passed');
      assert.deepEqual(proof.findings, []);
      assert.deepEqual(proof.spec_aligned_files, ['src/widget.js']);
      assert.ok(proof.test_files.includes('test/widget.test.js'));
      assert.equal(proof.assertions.added, 1);
      assert.equal(proof.assertions.removed, 0);
      assert.equal(proof.budget.max_files, 10);
      assert.equal(proof.budget.max_lines, 400);

      // The orchestration log shows J6 actually ran inside the phase.
      const atomRuns = readExecutionLog(projectRoot).filter((entry) => entry.kind === 'atom_run');
      const j6Run = atomRuns.find((entry) => entry.atom_id === 'J6.cr.review');
      assert.ok(j6Run, 'execution log should contain a J6.cr.review atom_run');
      assert.equal(j6Run.phase_id, 'verify-consistency');
      assert.equal(j6Run.ok, true);

      // The phase completed its stage transition after the verdict.
      const status = JSON.parse(readFileSync(
        resolve(projectRoot, 'specs', 'changes', CHANGE_ID, 'status.json'),
        'utf8',
      ));
      assert.equal(status.current_stage, 'verify');
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('executor stops at the verify phase when J6 finds changed code with no test', async () => {
    const projectRoot = makeProject({
      proposal: [
        '# Proposal',
        '',
        '## Problem',
        'Widget values need doubling in the pipeline.',
        '',
        '## Scope',
        'Add lonelyHelper to double values in the widget pipeline.',
        '',
      ].join('\n'),
    });
    try {
      writeFileSync(
        resolve(projectRoot, 'src', 'lonely.js'),
        'export function lonelyHelper(value) {\n  return value * 2;\n}\n',
      );

      await assert.rejects(
        runVerifyPhase(projectRoot),
        /atom_failed.*J6\.cr\.review|J6\.cr\.review/,
        'workflow should stop on the J6 atom failure',
      );

      const proof = readCrProof(projectRoot);
      assert.equal(proof.verdict, 'failed');
      const finding = proof.findings.find((entry) => entry.code === 'cr_code_without_test');
      assert.ok(finding, 'expected cr_code_without_test finding');
      assert.equal(finding.path, 'src/lonely.js');

      const atomRuns = readExecutionLog(projectRoot).filter((entry) => entry.kind === 'atom_run');
      const j6Run = atomRuns.find((entry) => entry.atom_id === 'J6.cr.review');
      assert.ok(j6Run, 'execution log should contain a J6.cr.review atom_run');
      assert.equal(j6Run.phase_id, 'verify-consistency');
      assert.equal(j6Run.ok, false);

      // The stage must not advance past a failed CR verdict.
      const status = JSON.parse(readFileSync(
        resolve(projectRoot, 'specs', 'changes', CHANGE_ID, 'status.json'),
        'utf8',
      ));
      assert.equal(status.current_stage, 'execute');
      assert.ok(existsSync(resolve(projectRoot, 'specs', 'changes', CHANGE_ID, 'cr', 'review-0.json')));
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
