import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = process.cwd();
const ATOM = 'xflow/atoms/j4d_spec_clarify_gate.py';

const AMBIGUOUS_PROPOSAL = [
  '# Proposal',
  '',
  '## Problem',
  '',
  'The export is slow and the UI should feel fast.',
  '',
  '## Scope',
  '',
  '- The system MUST be fast.',
  '- The API MUST respond quickly and handle errors properly.',
  '- Responses MUST be user-friendly.',
  '- 系统必须快速响应，并且处理要合理。',
  '- Rollout date is TBD.',
  '',
  '## Scenarios',
  '',
  '### Scenario: Export a report',
  '',
  '- GIVEN a signed-in user',
  '- The user clicks Export and a file downloads.',
  '',
].join('\n');

const CLEAR_PROPOSAL = [
  '# Proposal',
  '',
  '## Problem',
  '',
  'Exports time out at the current 30 s limit for reports over 10,000 rows.',
  '',
  '## Scope',
  '',
  '- The API MUST return `202` within 500 ms for export requests with at most 10,000 rows.',
  '- The worker MUST finish exports of 10,000 rows in at most 120 s on a 2 vCPU runner.',
  '- The CLI MUST exit with code 1 when the input file is missing.',
  '- emptyValue([]) MUST return 0.',
  '- The system MUST NOT log access tokens.',
  '- 接口必须在 200 ms 内返回结果。',
  '',
  '## Scenarios',
  '',
  '### Scenario: Export a report',
  '',
  '- WHEN a signed-in user submits an export of 5,000 rows',
  '- THEN the API returns `202` and the download is ready within 60 s',
  '',
].join('\n');

function makeProject(changeId, proposal) {
  const projectRoot = mkdtempSync(join(tmpdir(), 'openflow-clarify-'));
  const changeRoot = resolve(projectRoot, 'specs', 'changes', changeId);
  mkdirSync(changeRoot, { recursive: true });
  writeFileSync(resolve(changeRoot, 'proposal.md'), proposal, 'utf8');
  writeFileSync(resolve(changeRoot, 'status.json'), JSON.stringify({
    change_id: changeId, title: 'clarify fixture', change_type: 'backend',
    status: 'draft', current_stage: 'proposal',
  }), 'utf8');
  return { projectRoot, changeRoot };
}

function runAtom(projectRoot, changeId) {
  return spawnSync('python3', [
    ATOM, '--project-root', projectRoot, '--change-id', changeId,
  ], { cwd: REPO_ROOT, encoding: 'utf8' });
}

describe('J4d spec clarify gate', () => {
  test('ambiguous spec fails with structured findings, each carrying a question', () => {
    const { projectRoot, changeRoot } = makeProject('chg-vague', AMBIGUOUS_PROPOSAL);
    try {
      const result = runAtom(projectRoot, 'chg-vague');
      assert.notEqual(result.status, 0, result.stdout);
      const report = JSON.parse(readFileSync(resolve(changeRoot, 'spec_clarify.json'), 'utf8'));
      assert.equal(report.gate, 'J4d.spec_clarify.gate');
      assert.equal(report.verdict, 'needs_clarification');
      assert.equal(report.ok, false);

      const categories = new Set(report.findings.map((f) => f.category));
      assert.ok(categories.has('unquantified_normative'), [...categories].join(','));
      assert.ok(categories.has('vague_term'), [...categories].join(','));
      assert.ok(categories.has('missing_when_then'), [...categories].join(','));
      assert.ok(categories.has('unresolved_placeholder'), [...categories].join(','));

      for (const finding of report.findings) {
        assert.ok(finding.question && finding.question.length > 10, finding.id);
        assert.match(finding.question, /[？?]/);
        assert.ok(finding.file && finding.line >= 1, finding.id);
      }
      assert.equal(report.clarification_questions.length, report.findings.length);
      assert.equal(report.summary.questions, report.findings.length);

      const markdown = readFileSync(resolve(changeRoot, 'spec_clarify.md'), 'utf8');
      assert.match(markdown, /# Spec Clarification Gate/);
      assert.match(markdown, /- \[ \]/);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('quantified spec passes with zero findings (no false positives)', () => {
    const { projectRoot, changeRoot } = makeProject('chg-clear', CLEAR_PROPOSAL);
    try {
      const result = runAtom(projectRoot, 'chg-clear');
      assert.equal(result.status, 0, result.stderr || result.stdout);
      const report = JSON.parse(readFileSync(resolve(changeRoot, 'spec_clarify.json'), 'utf8'));
      assert.equal(report.ok, true);
      assert.equal(report.verdict, 'pass');
      assert.deepEqual(report.findings, []);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('CLI spec clarify delegates to J4d and propagates the verdict', () => {
    const { projectRoot } = makeProject('chg-cli', AMBIGUOUS_PROPOSAL);
    try {
      const result = spawnSync('node', [
        'bin/xflow.js', 'spec', 'clarify',
        '--project-root', projectRoot, '--change-id', 'chg-cli',
      ], { cwd: REPO_ROOT, encoding: 'utf8' });
      assert.notEqual(result.status, 0, result.stdout);
      assert.match(result.stdout, /J4d\.spec_clarify\.gate/);
      assert.ok(existsSync(resolve(projectRoot, 'specs', 'changes', 'chg-cli', 'spec_clarify.json')));
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('registry and workflows wire J4d into the proposal-consistency stage', () => {
    const registry = JSON.parse(readFileSync(resolve(REPO_ROOT, 'atoms', 'registry.json'), 'utf8'));
    assert.ok(registry.atoms['J4d.spec_clarify.gate'], 'registry entry missing');
    assert.equal(
      registry.atoms['J4d.spec_clarify.gate'].script,
      'xflow/atoms/j4d_spec_clarify_gate.py',
    );
    for (const workflow of ['yolo.yaml', 'corps.yaml']) {
      const text = readFileSync(resolve(REPO_ROOT, 'workflows', workflow), 'utf8');
      const stage = text.split('proposal-consistency-check')[1].split('\n  - id:')[0];
      assert.ok(stage.includes('J4d.spec_clarify.gate'), `${workflow} stage missing J4d`);
    }
  });
});
