import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { workflowStateLoad } from '../src/core/atoms/workflow/state-load.js';
import { workflowAdvance } from '../src/core/atoms/workflow/advance.js';

function makeProjectRoot() {
  const root = mkdtempSync(join(tmpdir(), 'openflow-workflow-'));
  mkdirSync(resolve(root, '.as-xflow'), { recursive: true });
  return root;
}

function cleanupProjectRoot(root) {
  rmSync(root, { recursive: true, force: true });
}

describe('Workflow state atoms', () => {
  test('E1 initializes and returns workflow state compatible with executor state file', async () => {
    const projectRoot = makeProjectRoot();
    try {
      const workflow = {
        name: 'corps',
        phases: [{ id: 'change-init' }, { id: 'proposal' }, { id: 'archive' }],
      };
      const result = await workflowStateLoad(
        {},
        { projectRoot, changeId: 'chg-wf-1', workflow, phase: { id: 'change-init' }, runtime: {} },
      );

      assert.equal(result.ok, true);
      assert.equal(result.workflow_state.workflow, 'corps');
      assert.equal(result.workflow_state.current_phase, 'change-init');
      assert.deepEqual(result.workflow_state.phase_order, ['change-init', 'proposal', 'archive']);
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('E7 advances workflow cursor to the next phase and records the transition', async () => {
    const projectRoot = makeProjectRoot();
    try {
      const workflow = {
        name: 'corps',
        phases: [{ id: 'change-init' }, { id: 'proposal' }, { id: 'archive' }],
      };
      await workflowStateLoad(
        {},
        { projectRoot, changeId: 'chg-wf-1', workflow, phase: { id: 'change-init' }, runtime: {} },
      );

      const result = await workflowAdvance(
        { artifact_path: resolve(projectRoot, 'specs', 'changes', 'chg-wf-1', 'change-init.json') },
        { projectRoot, changeId: 'chg-wf-1', workflow, phase: { id: 'change-init' }, runtime: {} },
      );

      assert.equal(result.ok, true);
      assert.equal(result.workflow_state.current_phase, 'proposal');
      assert.equal(result.workflow_state.last_completed_phase, 'change-init');
      assert.equal(result.workflow_state.last_transition.from, 'change-init');
      assert.equal(result.workflow_state.last_transition.to, 'proposal');
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });
});
