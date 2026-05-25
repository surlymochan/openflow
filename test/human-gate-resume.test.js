import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

function makeProjectRoot() {
  const root = mkdtempSync(join(tmpdir(), 'as-xflow-human-'));
  mkdirSync(resolve(root, '.as-xflow'), { recursive: true });
  return root;
}

function cleanupProjectRoot(root) {
  rmSync(root, { recursive: true, force: true });
}

describe('Human gate resume', () => {
  test('workflow stops on human gate, gate ack approves it, and rerun advances past the gate', () => {
    const projectRoot = makeProjectRoot();
    try {
      rmSync(resolve(process.cwd(), '.as-xflow', 'pending-gates'), { recursive: true, force: true });
      rmSync(resolve(process.cwd(), '.as-xflow', 'workflow-state.json'), { force: true });
      const workflowPath = resolve(projectRoot, 'human-gate.yaml');
      const workflow = `
name: human-smoke
version: 1
track: heavy
requires:
  agentos_http: false
  pencil: false
phases:
  - id: clarify
    label: "Clarify"
    catalog_ref: 5
    required: true
    atoms:
      - id: D1.mission.create
        with: { goal: "Human gate smoke", workspace: "${projectRoot}" }
    gate:
      type: human
      on_fail: stop
  - id: review
    label: "Review"
    catalog_ref: 24
    required: true
    gate:
      type: skip
`;
      writeFileSync(workflowPath, workflow);

      const firstRun = spawnSync('node', ['bin/xflow.js', 'workflow', 'run', workflowPath], {
        cwd: process.cwd(),
        env: { ...process.env, CHANGE_ID: 'chg-human-1' },
        encoding: 'utf8',
      });
      assert.notEqual(firstRun.status, 0);

      const gateFile = resolve(process.cwd(), '.as-xflow', 'pending-gates', 'clarify.json');
      const pending = JSON.parse(readFileSync(gateFile, 'utf8'));
      assert.equal(pending.status, 'pending_human');

      const ack = spawnSync('node', ['bin/xflow.js', 'gate', 'ack', 'clarify'], {
        cwd: process.cwd(),
        encoding: 'utf8',
      });
      assert.equal(ack.status, 0);

      const secondRun = spawnSync('node', ['bin/xflow.js', 'workflow', 'run', workflowPath], {
        cwd: process.cwd(),
        env: { ...process.env, CHANGE_ID: 'chg-human-1' },
        encoding: 'utf8',
      });
      assert.equal(secondRun.status, 0);
      assert.match(secondRun.stdout, /Workflow "human-smoke" completed/);
    } finally {
      cleanupProjectRoot(projectRoot);
      rmSync(resolve(process.cwd(), '.as-xflow', 'pending-gates'), { recursive: true, force: true });
      rmSync(resolve(process.cwd(), '.as-xflow', 'workflow-state.json'), { force: true });
      rmSync(resolve(process.cwd(), '.as-xflow', 'state.sqlite'), { force: true });
      rmSync(resolve(process.cwd(), '.as-xflow', 'state.sqlite-shm'), { force: true });
      rmSync(resolve(process.cwd(), '.as-xflow', 'state.sqlite-wal'), { force: true });
    }
  });

  test('workflow can auto-approve human gates in scripted mode', () => {
    const projectRoot = makeProjectRoot();
    try {
      rmSync(resolve(process.cwd(), '.as-xflow', 'pending-gates'), { recursive: true, force: true });
      rmSync(resolve(process.cwd(), '.as-xflow', 'workflow-state.json'), { force: true });
      const workflowPath = resolve(projectRoot, 'human-gate-auto.yaml');
      const workflow = `
name: human-auto-smoke
version: 1
track: heavy
requires:
  agentos_http: false
  pencil: false
phases:
  - id: clarify
    label: "Clarify"
    catalog_ref: 5
    required: true
    atoms:
      - id: D1.mission.create
        with: { goal: "Human gate auto smoke", workspace: "${projectRoot}" }
    gate:
      type: human
      on_fail: stop
  - id: review
    label: "Review"
    catalog_ref: 24
    required: true
    gate:
      type: skip
`;
      writeFileSync(workflowPath, workflow);

      const run = spawnSync('node', ['bin/xflow.js', 'workflow', 'run', workflowPath], {
        cwd: process.cwd(),
        env: { ...process.env, CHANGE_ID: 'chg-human-auto-1', XFLOW_AUTO_HUMAN_GATES: '1' },
        encoding: 'utf8',
      });
      assert.equal(run.status, 0, run.stderr || run.stdout);
      assert.match(run.stdout, /Human gate auto-approved: clarify/);
      assert.match(run.stdout, /Workflow "human-auto-smoke" completed/);

      const gateFile = resolve(process.cwd(), '.as-xflow', 'pending-gates', 'clarify.json');
      const approved = JSON.parse(readFileSync(gateFile, 'utf8'));
      assert.equal(approved.status, 'approved');
      assert.equal(approved.approved_by, 'xflow-auto-human-gate');
    } finally {
      cleanupProjectRoot(projectRoot);
      rmSync(resolve(process.cwd(), '.as-xflow', 'pending-gates'), { recursive: true, force: true });
      rmSync(resolve(process.cwd(), '.as-xflow', 'workflow-state.json'), { force: true });
      rmSync(resolve(process.cwd(), '.as-xflow', 'state.sqlite'), { force: true });
      rmSync(resolve(process.cwd(), '.as-xflow', 'state.sqlite-shm'), { force: true });
      rmSync(resolve(process.cwd(), '.as-xflow', 'state.sqlite-wal'), { force: true });
    }
  });
});
