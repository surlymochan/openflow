import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = process.cwd();

describe('change scaffold helper', () => {
  test('frontend/full-stack scaffold includes findings, progress, and workflow merge stubs', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'as-xflow-scaffold-'));
    try {
      const result = spawnSync('python3', [
        'xflow/yolo/scripts/scaffold_specs_change.py',
        '--project-root',
        projectRoot,
        '--change-id',
        'chg-scaffold',
        '--change-type',
        'full-stack',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      });

      assert.equal(result.status, 0, result.stderr || result.stdout);

      const changeRoot = resolve(projectRoot, 'specs', 'changes', 'chg-scaffold');
      for (const filename of ['proposal.md', 'plan.md', 'tasks.md', 'findings.md', 'progress.md', 'merge-workflow.md', 'status.json']) {
        assert.equal(existsSync(resolve(changeRoot, filename)), true, `${filename} should be scaffolded`);
      }

      const findings = readFileSync(resolve(changeRoot, 'findings.md'), 'utf8');
      const progress = readFileSync(resolve(changeRoot, 'progress.md'), 'utf8');
      const mergeWorkflow = readFileSync(resolve(changeRoot, 'merge-workflow.md'), 'utf8');
      assert.match(findings, /Questions Investigated/);
      assert.match(progress, /Current Focus/);
      assert.match(mergeWorkflow, /Capability Delta/);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
