import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = process.cwd();

function makeProjectRoot() {
  return mkdtempSync(join(tmpdir(), 'as-xflow-takein-'));
}

describe('takein digest helper', () => {
  test('summarizes handoff artifacts and git state as JSON', () => {
    const projectRoot = makeProjectRoot();
    try {
      writeFileSync(resolve(projectRoot, 'HANDOFF.md'), '# Handoff\n\nCurrent objective.\n', 'utf8');
      writeFileSync(resolve(projectRoot, 'AHA.md'), '# AHA\n\nDurable lesson.\n', 'utf8');
      mkdirSync(resolve(projectRoot, '.git'), { recursive: true });

      const result = spawnSync('python3', [
        'scripts/takein_digest.py',
        '--project-root',
        projectRoot,
        '--excerpt-lines',
        '2',
        '--json',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      });

      assert.equal(result.status, 0, result.stderr || result.stdout);
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.files['HANDOFF.md'].exists, true);
      assert.equal(payload.files['AHA.md'].exists, true);
      assert.equal(payload.files['DESIGN.md'].exists, false);
      assert.match(payload.files['HANDOFF.md'].excerpt, /# Handoff/);
      assert.match(payload.recommended_first_action, /HANDOFF/);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
