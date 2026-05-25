import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = process.cwd();

describe('J1 tests runner', () => {
  test('falls back to tdd_green_command from change contract when plan has no bash block', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'as-xflow-j1-'));
    try {
      const changeRoot = resolve(projectRoot, 'specs', 'changes', 'chg-j1-contract');
      mkdirSync(changeRoot, { recursive: true });
      writeFileSync(resolve(changeRoot, 'plan.md'), '# Plan\n\nNo command block here.\n', 'utf8');
      writeFileSync(resolve(changeRoot, 'corps-input.json'), JSON.stringify({
        tdd_green_command: 'node -e "process.exit(0)"',
      }, null, 2), 'utf8');

      const result = spawnSync('python3', [
        'xflow/atoms/j1_tests_run.py',
        '--project-root',
        projectRoot,
        '--change-id',
        'chg-j1-contract',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      });

      assert.equal(result.status, 0, result.stderr || result.stdout);
      const proof = JSON.parse(readFileSync(resolve(changeRoot, 'verify_proof.json'), 'utf8'));
      assert.equal(proof.all_passed, true);
      assert.equal(proof.results[0].command, 'node -e "process.exit(0)"');
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('does not leak its orchestration CHANGE_ID into verification commands', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'as-xflow-j1-'));
    try {
      const changeRoot = resolve(projectRoot, 'specs', 'changes', 'chg-j1-env');
      mkdirSync(changeRoot, { recursive: true });
      writeFileSync(resolve(changeRoot, 'plan.md'), [
        '# Plan',
        '',
        '## Verification Commands',
        '',
        '```bash',
        'python3 -c "import os, sys; sys.exit(1 if os.environ.get(\'CHANGE_ID\') else 0)"',
        '```',
        '',
      ].join('\n'), 'utf8');

      const result = spawnSync('python3', [
        'xflow/atoms/j1_tests_run.py',
        '--project-root',
        projectRoot,
        '--change-id',
        'chg-j1-env',
      ], {
        cwd: REPO_ROOT,
        env: { ...process.env, CHANGE_ID: 'outer-orchestration-change' },
        encoding: 'utf8',
      });

      assert.equal(result.status, 0, result.stderr || result.stdout);
      const proof = JSON.parse(readFileSync(resolve(changeRoot, 'verify_proof.json'), 'utf8'));
      assert.equal(proof.all_passed, true);
      assert.equal(proof.results[0].passed, true);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
