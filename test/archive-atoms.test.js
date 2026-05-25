import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = process.cwd();

describe('archive atoms', () => {
  test('K2 merge-snippets-only mode merges snippets without requiring publish state', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'as-xflow-archive-'));
    try {
      const changeRoot = resolve(projectRoot, 'specs', 'changes', 'chg-archive');
      mkdirSync(changeRoot, { recursive: true });
      writeFileSync(resolve(projectRoot, 'specs', 'architecture.md'), '# Architecture\n', 'utf8');
      writeFileSync(resolve(changeRoot, 'proposal.md'), '# Proposal\n\nBody\n', 'utf8');
      writeFileSync(resolve(changeRoot, 'plan.md'), '# Plan\n\nBody\n', 'utf8');
      writeFileSync(resolve(changeRoot, 'tasks.md'), '# Tasks\n\n- [x] Done\n', 'utf8');
      writeFileSync(resolve(changeRoot, 'status.json'), JSON.stringify({
        change_id: 'chg-archive',
        title: 'Archive smoke',
        change_type: 'backend',
        status: 'active',
        current_stage: 'plan',
        archival_status: 'not_ready',
      }, null, 2), 'utf8');
      writeFileSync(resolve(changeRoot, 'merge-architecture.md'), 'Durable architecture note.\n', 'utf8');

      const result = spawnSync('node', [
        'bin/xflow.js',
        'atom',
        'run',
        'K2.merge_snippets.apply',
        '--project-root',
        projectRoot,
        '--change-id',
        'chg-archive',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      });

      assert.equal(result.status, 0, result.stderr || result.stdout);
      assert.match(result.stdout, /Mode: merge-snippets-only/);

      const second = spawnSync('node', [
        'bin/xflow.js',
        'atom',
        'run',
        'K2.merge_snippets.apply',
        '--project-root',
        projectRoot,
        '--change-id',
        'chg-archive',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      });

      assert.equal(second.status, 0, second.stderr || second.stdout);
      assert.match(second.stdout, /No root specs updated/);
      const architecture = readFileSync(resolve(projectRoot, 'specs', 'architecture.md'), 'utf8');
      assert.match(architecture, /## Change: chg-archive/);
      assert.match(architecture, /Durable architecture note/);
      assert.equal((architecture.match(/## Change: chg-archive/g) || []).length, 1);
      const status = JSON.parse(readFileSync(resolve(changeRoot, 'status.json'), 'utf8'));
      assert.equal(status.status, 'active');
      assert.equal(status.current_stage, 'plan');
      assert.equal(status.archival_status, 'not_ready');
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('archive publish skips ignored change workspace when staging', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'as-xflow-archive-publish-'));
    try {
      spawnSync('git', ['init'], { cwd: projectRoot, encoding: 'utf8' });
      spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: projectRoot, encoding: 'utf8' });
      spawnSync('git', ['config', 'user.name', 'Test Suite'], { cwd: projectRoot, encoding: 'utf8' });
      spawnSync('git', ['remote', 'add', 'origin', 'git@example.com:test/archive.git'], { cwd: projectRoot, encoding: 'utf8' });
      mkdirSync(resolve(projectRoot, 'specs', 'changes', 'chg-publish'), { recursive: true });
      writeFileSync(resolve(projectRoot, '.gitignore'), 'specs/changes/\n', 'utf8');
      writeFileSync(resolve(projectRoot, 'AHA.md'), '# AHA\n', 'utf8');
      writeFileSync(resolve(projectRoot, 'HANDOFF.md'), '# Handoff\n', 'utf8');
      writeFileSync(resolve(projectRoot, 'specs', 'product.md'), '# Product\n', 'utf8');
      writeFileSync(resolve(projectRoot, 'specs', 'architecture.md'), '# Architecture\n', 'utf8');
      writeFileSync(resolve(projectRoot, 'specs', 'workflow.md'), '# Workflow\n', 'utf8');
      writeFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-publish', 'proposal.md'), '# Proposal\n\nBody\n', 'utf8');
      writeFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-publish', 'plan.md'), '# Plan\n\nBody\n', 'utf8');
      writeFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-publish', 'tasks.md'), '# Tasks\n\n- [x] Done\n', 'utf8');
      writeFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-publish', 'status.json'), JSON.stringify({
        change_id: 'chg-publish',
        title: 'Archive publish smoke',
        change_type: 'backend',
        status: 'active',
        current_stage: 'verify',
        verification_status: 'passed',
        archival_status: 'not_ready',
      }, null, 2), 'utf8');

      const result = spawnSync('node', [
        'bin/xflow.js',
        'atom',
        'run',
        'A5.archive.commit_push_close',
        '--project-root',
        projectRoot,
        '--change-id',
        'chg-publish',
        '--commit-message',
        'archive smoke',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      });

      assert.equal(result.status, 0, result.stderr || result.stdout);
      assert.match(result.stdout, /Mode: full-publish/);
      assert.match(result.stdout, /Archived change: chg-publish/);
      const status = JSON.parse(readFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-publish', 'status.json'), 'utf8'));
      assert.equal(status.status, 'done');
      assert.equal(status.current_stage, 'archive');
      assert.equal(status.archival_status, 'archived');
      const handoff = readFileSync(resolve(projectRoot, 'HANDOFF.md'), 'utf8');
      assert.match(handoff, /<!-- xflow:handoff-current:start -->/);
      assert.match(handoff, /Change: `chg-publish`/);
      assert.match(handoff, /Stage \/ status: `archive` \/ `done`/);
      assert.match(handoff, /Archive: `archived`/);
      const tracked = spawnSync('git', ['ls-files'], { cwd: projectRoot, encoding: 'utf8' });
      assert.equal(tracked.status, 0, tracked.stderr);
      assert.equal(tracked.stdout.includes('specs/changes/chg-publish'), false);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('archive publish refuses unstaged tracked implementation changes', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'as-xflow-archive-dirty-'));
    try {
      spawnSync('git', ['init'], { cwd: projectRoot, encoding: 'utf8' });
      spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: projectRoot, encoding: 'utf8' });
      spawnSync('git', ['config', 'user.name', 'Test Suite'], { cwd: projectRoot, encoding: 'utf8' });
      spawnSync('git', ['remote', 'add', 'origin', 'git@example.com:test/archive.git'], { cwd: projectRoot, encoding: 'utf8' });
      mkdirSync(resolve(projectRoot, 'specs', 'changes', 'chg-dirty'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'src'), { recursive: true });
      writeFileSync(resolve(projectRoot, '.gitignore'), 'specs/changes/\n', 'utf8');
      writeFileSync(resolve(projectRoot, 'AHA.md'), '# AHA\n', 'utf8');
      writeFileSync(resolve(projectRoot, 'HANDOFF.md'), '# Handoff\n', 'utf8');
      writeFileSync(resolve(projectRoot, 'specs', 'product.md'), '# Product\n', 'utf8');
      writeFileSync(resolve(projectRoot, 'specs', 'architecture.md'), '# Architecture\n', 'utf8');
      writeFileSync(resolve(projectRoot, 'specs', 'workflow.md'), '# Workflow\n', 'utf8');
      writeFileSync(resolve(projectRoot, 'src', 'worker.js'), 'export const value = 1;\n', 'utf8');
      spawnSync('git', ['add', '.'], { cwd: projectRoot, encoding: 'utf8' });
      spawnSync('git', ['commit', '-m', 'initial'], { cwd: projectRoot, encoding: 'utf8' });

      writeFileSync(resolve(projectRoot, 'src', 'worker.js'), 'export const value = 2;\n', 'utf8');
      writeFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-dirty', 'proposal.md'), '# Proposal\n\nBody\n', 'utf8');
      writeFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-dirty', 'plan.md'), '# Plan\n\nBody\n', 'utf8');
      writeFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-dirty', 'tasks.md'), '# Tasks\n\n- [x] Done\n', 'utf8');
      writeFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-dirty', 'status.json'), JSON.stringify({
        change_id: 'chg-dirty',
        title: 'Archive dirty guard',
        change_type: 'backend',
        status: 'active',
        current_stage: 'verify',
        verification_status: 'passed',
        archival_status: 'not_ready',
      }, null, 2), 'utf8');

      const result = spawnSync('node', [
        'bin/xflow.js',
        'atom',
        'run',
        'A5.archive.commit_push_close',
        '--project-root',
        projectRoot,
        '--change-id',
        'chg-dirty',
        '--commit-message',
        'archive dirty guard',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      });

      assert.notEqual(result.status, 0, result.stdout);
      const output = `${result.stdout}\n${result.stderr}`;
      assert.match(output, /Refusing archive: unstaged tracked changes remain/);
      assert.match(output, /src\/worker\.js/);
      const commits = spawnSync('git', ['rev-list', '--count', 'HEAD'], { cwd: projectRoot, encoding: 'utf8' });
      assert.equal(commits.status, 0, commits.stderr);
      assert.equal(commits.stdout.trim(), '1');
      const status = JSON.parse(readFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-dirty', 'status.json'), 'utf8'));
      assert.equal(status.current_stage, 'verify');
      assert.equal(status.status, 'active');
      assert.equal(status.archival_status, 'not_ready');
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
