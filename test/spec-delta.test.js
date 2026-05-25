import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = process.cwd();

function makeProjectRoot(prefix = 'as-xflow-spec-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

function writeSpecDeltaFixture(projectRoot, changeId = 'chg-spec') {
  const changeRoot = resolve(projectRoot, 'specs', 'changes', changeId);
  mkdirSync(changeRoot, { recursive: true });
  writeFileSync(resolve(changeRoot, 'proposal.md'), [
    '# Proposal',
    '',
    '## Scope',
    '',
    '- Add deterministic spec delta review.',
    '- MUST produce requirement-level delta evidence.',
    '',
  ].join('\n'), 'utf8');
  writeFileSync(resolve(changeRoot, 'plan.md'), [
    '# Plan',
    '',
    '## Verification',
    '',
    '- REQUIRED: map proposal requirements to verification evidence.',
    '',
    '```bash',
    'npm test',
    'node bin/xflow.js score',
    '```',
    '',
  ].join('\n'), 'utf8');
  writeFileSync(resolve(changeRoot, 'tasks.md'), [
    '# Tasks',
    '',
    '- [x] Wire J4b into workflow verification.',
    '- [ ] Publish migration docs.',
    '',
  ].join('\n'), 'utf8');
  writeFileSync(resolve(changeRoot, 'merge-workflow.md'), [
    '# Workflow Delta',
    '',
    '- Add spec delta review before archive.',
    '',
  ].join('\n'), 'utf8');
  return changeRoot;
}

describe('spec delta review and OpenSpec migration', () => {
  test('J4b generates JSON and markdown review artifacts for a change', () => {
    const projectRoot = makeProjectRoot();
    try {
      const changeRoot = writeSpecDeltaFixture(projectRoot);
      const result = spawnSync('python3', [
        'xflow/atoms/j4b_spec_delta_review.py',
        '--project-root',
        projectRoot,
        '--change-id',
        'chg-spec',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      });

      assert.equal(result.status, 0, result.stderr || result.stdout);
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.ok, true);

      const review = JSON.parse(readFileSync(resolve(changeRoot, 'spec_delta_review.json'), 'utf8'));
      const markdown = readFileSync(resolve(changeRoot, 'spec_delta_review.md'), 'utf8');
      assert.equal(review.gate, 'J4b.spec_delta.review');
      assert.equal(review.ok, true);
      assert.equal(review.tasks.done, 1);
      assert.deepEqual(review.plan.verification_commands, ['npm test', 'node bin/xflow.js score']);
      assert.equal(review.spec_touchpoints.length, 1);
      assert.equal(review.requirements_delta.counts.proposal, 1);
      assert.equal(review.requirements_delta.counts.plan, 1);
      assert.match(markdown, /# Spec Delta Review/);
      assert.match(markdown, /## Requirements Delta/);
      assert.match(markdown, /merge-workflow\.md/);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('CLI spec delta delegates to J4b and prints the generated artifact path', () => {
    const projectRoot = makeProjectRoot();
    try {
      const changeRoot = writeSpecDeltaFixture(projectRoot);
      const result = spawnSync('node', [
        'bin/xflow.js',
        'spec',
        'delta',
        '--project-root',
        projectRoot,
        '--change-id',
        'chg-spec',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      });

      assert.equal(result.status, 0, result.stderr || result.stdout);
      assert.match(result.stdout, /spec_delta_review\.json/);
      assert.match(result.stdout, /spec_delta_review\.md/);
      assert.equal(JSON.parse(readFileSync(resolve(changeRoot, 'spec_delta_review.json'), 'utf8')).ok, true);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('J4c maps OpenSpec specs and changes to xflow migration targets without moving files', () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'openspec', 'specs'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'openspec', 'changes', 'add-login', 'specs'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'openspec', 'specs', 'product.md'), '# Product Spec\n', 'utf8');
      writeFileSync(resolve(projectRoot, 'openspec', 'changes', 'add-login', 'proposal.md'), '# Proposal\n', 'utf8');
      writeFileSync(resolve(projectRoot, 'openspec', 'changes', 'add-login', 'design.md'), '# Design\n', 'utf8');
      writeFileSync(resolve(projectRoot, 'openspec', 'changes', 'add-login', 'tasks.md'), '- [ ] Build login\n', 'utf8');
      writeFileSync(resolve(projectRoot, 'openspec', 'changes', 'add-login', 'specs', 'auth.md'), '# Auth Spec\n', 'utf8');

      const result = spawnSync('python3', [
        'xflow/atoms/j4c_openspec_migration_map.py',
        '--project-root',
        projectRoot,
        '--openspec-root',
        'openspec',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      });

      assert.equal(result.status, 0, result.stderr || result.stdout);
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.ok, true);
      assert.equal(payload.root_specs, 1);
      assert.equal(payload.changes, 1);

      const report = JSON.parse(readFileSync(resolve(projectRoot, '.as-xflow', 'openspec-migration.json'), 'utf8'));
      assert.equal(report.gate, 'J4c.openspec.migration_map');
      assert.equal(report.root_specs[0].recommended_target, 'specs/product.md');
      assert.equal(report.changes[0].xflow_change_id, 'add-login');
      assert.equal(report.changes[0].recommended_xflow_files.spec_delta_review, 'specs/changes/add-login/spec_delta_review.json');
      assert.equal(report.command_mapping['/opsx:apply'], 'xflow workflow run yolo|corps --project-root .');
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('CLI spec openspec-map writes the migration report', () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'openspec', 'specs'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'openspec', 'changes', 'add-api'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'openspec', 'specs', 'workflow.md'), '# Workflow Spec\n', 'utf8');
      writeFileSync(resolve(projectRoot, 'openspec', 'changes', 'add-api', 'proposal.md'), '# Proposal\n', 'utf8');

      const result = spawnSync('node', [
        'bin/xflow.js',
        'spec',
        'openspec-map',
        '--project-root',
        projectRoot,
        '--openspec-root',
        'openspec',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      });

      assert.equal(result.status, 0, result.stderr || result.stdout);
      assert.match(result.stdout, /openspec-migration\.json/);
      const report = JSON.parse(readFileSync(resolve(projectRoot, '.as-xflow', 'openspec-migration.json'), 'utf8'));
      assert.equal(report.ok, true);
      assert.equal(report.changes[0].target_dir, 'specs/changes/add-api');
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
