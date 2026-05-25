import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { workflowStateLoad } from '../src/core/atoms/workflow/state-load.js';
import { workflowGuard } from '../src/core/atoms/workflow/guard.js';

function makeProjectRoot() {
  const root = mkdtempSync(join(tmpdir(), 'as-xflow-guard-'));
  mkdirSync(resolve(root, '.as-xflow'), { recursive: true });
  mkdirSync(resolve(root, 'specs', 'changes', 'chg-guard-1'), { recursive: true });
  return root;
}

function cleanupProjectRoot(root) {
  rmSync(root, { recursive: true, force: true });
}

describe('Workflow guard atom', () => {
  test('E2 runs a guarded command, validates artifact output, and advances workflow state', async () => {
    const projectRoot = makeProjectRoot();
    try {
      const workflow = {
        name: 'corps',
        phases: [{ id: 'proposal' }, { id: 'plan' }, { id: 'archive' }],
      };
      await workflowStateLoad(
        {},
        { projectRoot, changeId: 'chg-guard-1', workflow, phase: { id: 'proposal' }, runtime: {} },
      );

      const result = await workflowGuard(
        {
          command: [
            'node',
            '-e',
            'const fs=require("fs"); const out=process.env.AS_XFLOW_WORKFLOW_ARTIFACT_PATH; const payload={phase:process.env.AS_XFLOW_WORKFLOW_PHASE, gate_token:process.env.AS_XFLOW_WORKFLOW_GATE_TOKEN, status:"ready", summary:"guarded artifact"}; fs.writeFileSync(out, JSON.stringify(payload, null, 2));',
          ],
        },
        { projectRoot, changeId: 'chg-guard-1', workflow, phase: { id: 'proposal' }, runtime: {} },
      );

      assert.equal(result.ok, true);
      assert.equal(result.workflow_state.current_phase, 'plan');
      assert.equal(result.workflow_state.last_completed_phase, 'proposal');
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });
});
