import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = process.cwd();

describe('handoff refresh helper', () => {
  test('refresh preserves existing context while updating the managed current-state block', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'as-xflow-handoff-'));
    try {
      const handoffPath = resolve(projectRoot, 'HANDOFF.md');
      const changeRoot = resolve(projectRoot, 'specs', 'changes', 'chg-handoff-refresh');
      const existing = '# Existing Handoff\n\n## Current State\n\nStale current state.\n\n## Context Pack\n\nDurable current context.\n';
      mkdirSync(changeRoot, { recursive: true });
      writeFileSync(resolve(changeRoot, 'status.json'), JSON.stringify({
        change_id: 'chg-handoff-refresh',
        title: 'Refresh handoff smoke',
        status: 'active',
        current_stage: 'verify',
        verification_status: 'passed',
        archival_status: 'not_ready',
        issue_url: 'https://github.com/example/repo/issues/1',
        branch_name: 'codex/handoff-refresh',
        next_action: 'Archive after verification.',
      }, null, 2), 'utf8');
      writeFileSync(resolve(changeRoot, 'verify_proof.json'), JSON.stringify({
        all_passed: true,
        recorded_at: '2026-04-16T12:00:00Z',
        results: [
          {
            command: 'node --test test/handoff-refresh.test.js',
            exit_code: 0,
            passed: true,
          },
          {
            command: 'node --test test/*.test.js',
            exit_code: 0,
            passed: true,
          },
        ],
      }, null, 2), 'utf8');
      writeFileSync(handoffPath, existing, 'utf8');

      const result = spawnSync('python3', [
        'xflow/handoff/scripts/scaffold_handoff.py',
        '--project-root',
        projectRoot,
        '--refresh',
        '--change-id',
        'chg-handoff-refresh',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      });

      assert.equal(result.status, 0, result.stderr || result.stdout);
      const refreshed = readFileSync(handoffPath, 'utf8');
      assert.match(refreshed, /<!-- xflow:handoff-current:start -->/);
      assert.match(refreshed, /Change: `chg-handoff-refresh`/);
      assert.match(refreshed, /Stage \/ status: `verify` \/ `active`/);
      assert.match(refreshed, /Verification: `passed`/);
      assert.match(refreshed, /Issue: https:\/\/github\.com\/example\/repo\/issues\/1/);
      assert.match(refreshed, /<!-- xflow:handoff-verified:start -->/);
      assert.match(refreshed, /Summary: `2\/2 passed`/);
      assert.match(refreshed, /PASS `node --test test\/handoff-refresh\.test\.js` \(exit `0`\)/);
      assert.match(refreshed, /PASS `node --test test\/\*\.test\.js` \(exit `0`\)/);
      assert.match(refreshed, /Durable current context/);
      assert.doesNotMatch(refreshed, /Stale current state/);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('refresh replaces an existing managed current-state block idempotently', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'as-xflow-handoff-replace-'));
    try {
      const handoffPath = resolve(projectRoot, 'HANDOFF.md');
      const changeRoot = resolve(projectRoot, 'specs', 'changes', 'chg-handoff-replace');
      mkdirSync(changeRoot, { recursive: true });
      writeFileSync(resolve(changeRoot, 'status.json'), JSON.stringify({
        change_id: 'chg-handoff-replace',
        status: 'active',
        current_stage: 'execute',
        verification_status: 'running',
        archival_status: 'not_ready',
      }, null, 2), 'utf8');
      writeFileSync(handoffPath, [
        '# Existing Handoff',
        '',
        '<!-- xflow:handoff-current:start -->',
        '- Change: `old`',
        '<!-- xflow:handoff-current:end -->',
        '',
        'Persistent context.',
        '',
      ].join('\n'), 'utf8');

      const first = spawnSync('python3', [
        'xflow/handoff/scripts/scaffold_handoff.py',
        '--project-root',
        projectRoot,
        '--refresh',
        '--change-id',
        'chg-handoff-replace',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      });
      assert.equal(first.status, 0, first.stderr || first.stdout);

      writeFileSync(resolve(changeRoot, 'status.json'), JSON.stringify({
        change_id: 'chg-handoff-replace',
        status: 'done',
        current_stage: 'archive',
        verification_status: 'passed',
        archival_status: 'archived',
      }, null, 2), 'utf8');

      const second = spawnSync('python3', [
        'xflow/handoff/scripts/scaffold_handoff.py',
        '--project-root',
        projectRoot,
        '--refresh',
        '--change-id',
        'chg-handoff-replace',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      });
      assert.equal(second.status, 0, second.stderr || second.stdout);
      const refreshed = readFileSync(handoffPath, 'utf8');
      assert.equal((refreshed.match(/xflow:handoff-current:start/g) || []).length, 1);
      assert.doesNotMatch(refreshed, /Change: `old`/);
      assert.match(refreshed, /Stage \/ status: `archive` \/ `done`/);
      assert.match(refreshed, /Archive: `archived`/);
      assert.match(refreshed, /Persistent context/);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('refresh replaces stale latest verified commands with a managed block', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'as-xflow-handoff-verified-'));
    try {
      const handoffPath = resolve(projectRoot, 'HANDOFF.md');
      const changeRoot = resolve(projectRoot, 'specs', 'changes', 'chg-handoff-verified');
      mkdirSync(changeRoot, { recursive: true });
      writeFileSync(resolve(changeRoot, 'status.json'), JSON.stringify({
        change_id: 'chg-handoff-verified',
        status: 'done',
        current_stage: 'verify',
        verification_status: 'passed',
        archival_status: 'not_ready',
      }, null, 2), 'utf8');
      writeFileSync(resolve(changeRoot, 'verify_proof.json'), JSON.stringify({
        all_passed: false,
        recorded_at: '2026-04-16T13:00:00Z',
        results: [
          {
            command: 'node --test stale.test.js',
            exit_code: 1,
            passed: false,
          },
        ],
      }, null, 2), 'utf8');
      writeFileSync(handoffPath, [
        '# Existing Handoff',
        '',
        '## Latest Verified Commands',
        '',
        'Old command claims.',
        '',
        '## Context Pack',
        '',
        'Keep this context.',
        '',
      ].join('\n'), 'utf8');

      const result = spawnSync('python3', [
        'xflow/handoff/scripts/scaffold_handoff.py',
        '--project-root',
        projectRoot,
        '--refresh',
        '--change-id',
        'chg-handoff-verified',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      });

      assert.equal(result.status, 0, result.stderr || result.stdout);
      const refreshed = readFileSync(handoffPath, 'utf8');
      assert.match(refreshed, /<!-- xflow:handoff-verified:start -->/);
      assert.match(refreshed, /Change: `chg-handoff-verified`/);
      assert.match(refreshed, /Summary: `0\/1 passed`/);
      assert.match(refreshed, /FAIL `node --test stale\.test\.js` \(exit `1`\)/);
      assert.doesNotMatch(refreshed, /Old command claims/);
      assert.match(refreshed, /Keep this context/);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
