import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { WorkflowExecutor } from '../src/core/workflow-executor.js';

describe('plan hydration', () => {
  test('creates a reusable plan when none exists and leaves tasks absent', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'as-xflow-plan-hydration-'));
    try {
      const changeId = 'chg-plan-hydration';
      const changeRoot = resolve(projectRoot, 'specs', 'changes', changeId);
      mkdirSync(changeRoot, { recursive: true });

      writeFileSync(resolve(changeRoot, 'proposal.md'), [
        '# Proposal',
        '',
        '## Objective',
        '',
        'Build a reusable implementation plan.',
        '',
        '## Chosen Path',
        '',
        'Use the existing workflow and avoid duplicate planning.',
        '',
        '## In Scope',
        '',
        '- Create plan.md once.',
        '',
        '## Out of Scope',
        '',
        '- Do not create tasks.md.',
        '',
        '## Main Risk',
        '',
        'Plan drift causes duplicate execution notes.',
        '',
      ].join('\n'), 'utf8');

      const executor = new WorkflowExecutor({
        workflow: { name: 'plan-hydration', track: 'lite' },
        phases: [{ id: 'plan', label: 'Plan', atoms: [], gate: { type: 'skip' } }],
        registry: { atoms: {} },
        projectRoot,
        changeId,
        input: { title: 'Plan hydration' },
      });

      await executor.run();

      const planPath = resolve(changeRoot, 'plan.md');
      assert.equal(existsSync(planPath), true, 'plan.md should be created');
      assert.equal(existsSync(resolve(changeRoot, 'tasks.md')), false, 'tasks.md should remain absent');

      const plan = readFileSync(planPath, 'utf8');
      assert.match(plan, /# Plan/);
      assert.match(plan, /Build a reusable implementation plan\./);
      assert.match(plan, /Use the existing workflow and avoid duplicate planning\./);
      assert.match(plan, /Create plan\.md once\./);
      assert.match(plan, /Do not create tasks\.md\./);
      assert.match(plan, /Plan drift causes duplicate execution notes\./);
      assert.match(plan, /```bash[\s\S]*npm test[\s\S]*```/);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('workflow executor resets stale global resume state when change status is absent and mirrors saves into status.json', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'as-xflow-plan-hydration-'));
    try {
      const changeId = 'chg-status-reset';
      mkdirSync(resolve(projectRoot, '.as-xflow'), { recursive: true });
      writeFileSync(resolve(projectRoot, '.as-xflow', 'workflow-state.json'), JSON.stringify({
        workflow: 'corps',
        change_id: changeId,
        started_at: '2026-04-28T00:00:00.000Z',
        completed_phases: ['pencil_refine'],
        last_completed_phase: 'pencil_refine',
      }, null, 2));

      const executor = new WorkflowExecutor({
        workflow: { name: 'corps', track: 'heavy' },
        phases: [{ id: 'change-init', label: 'Change Init', atoms: [], gate: { type: 'skip' } }],
        registry: { atoms: {} },
        projectRoot,
        changeId,
        input: {},
      });

      const loaded = executor.loadState();
      assert.equal(loaded.last_completed_phase, null);
      assert.deepEqual(loaded.completed_phases, []);

      const statusPath = resolve(projectRoot, 'specs', 'changes', changeId, 'status.json');
      mkdirSync(resolve(projectRoot, 'specs', 'changes', changeId), { recursive: true });
      writeFileSync(statusPath, JSON.stringify({
        title: 'Preserve me',
        change_type: 'frontend',
        current_stage: 'change-init',
        status: 'draft',
      }, null, 2));

      executor.saveState({
        workflow: 'corps',
        change_id: changeId,
        started_at: '2026-04-28T00:00:00.000Z',
        completed_phases: ['change-init'],
        last_completed_phase: 'change-init',
      });

      const mirrored = JSON.parse(readFileSync(statusPath, 'utf8'));
      assert.equal(mirrored.title, 'Preserve me');
      assert.equal(mirrored.change_type, 'frontend');
      assert.equal(mirrored.current_stage, 'change-init');
      assert.equal(mirrored.status, 'draft');
      assert.equal(mirrored.last_completed_phase, 'change-init');
      assert.deepEqual(mirrored.completed_phases, ['change-init']);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
