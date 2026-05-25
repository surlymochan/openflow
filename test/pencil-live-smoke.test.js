import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

import agentInvoke from '../src/core/atoms/agent-invoke.js';
import registry from '../atoms/registry.json' with { type: 'json' };

function makeProjectRoot() {
  const root = mkdtempSync(join(tmpdir(), 'openflow-pencil-live-'));
  mkdirSync(resolve(root, '.as-xflow'), { recursive: true });
  return root;
}

function pencilReady() {
  const status = spawnSync('pencil', ['status'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return status.status === 0;
}

describe('Pencil live smoke', () => {
  test('agent_invoke can drive a real authenticated Pencil draft', { skip: process.env.XFLOW_RUN_LIVE_PENCIL !== '1' || !pencilReady() }, async () => {
    const projectRoot = makeProjectRoot();
    try {
      const result = await agentInvoke({}, {
        workflow: { track: 'heavy' },
        phase: {
          id: 'pencil_draft',
          label: 'Pencil draft',
          artifacts: [{ path: 'specs/changes/${change_id}/pencil_output.pen', optional: false }],
        },
        projectRoot,
        changeId: 'chg-pencil-live-smoke',
        atomDef: registry.atoms['H4a.pencil.draft'],
        runtime: {},
      });

      const penPath = resolve(projectRoot, 'specs', 'changes', 'chg-pencil-live-smoke', 'pencil_output.pen');
      assert.equal(result.ok, true);
      assert.equal(result.status, 'pencil_completed');
      assert.equal(result.adapter, 'pencil_cli');
      assert.equal(existsSync(penPath), true);
      assert.equal(statSync(penPath).size > 0, true);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
