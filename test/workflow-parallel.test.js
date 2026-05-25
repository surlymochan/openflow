import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { WorkflowExecutor } from '../src/core/workflow-executor.js';

function makeProjectRoot() {
  const root = mkdtempSync(join(tmpdir(), 'openflow-parallel-'));
  mkdirSync(resolve(root, '.as-xflow'), { recursive: true });
  return root;
}

function writeTrackingModules(projectRoot, count, delayMs) {
  const trackerPath = resolve(projectRoot, 'parallel-tracker.mjs');
  writeFileSync(trackerPath, `
    export let current = 0;
    export let maxSeen = 0;
    export async function enter(delayMs) {
      current += 1;
      maxSeen = Math.max(maxSeen, current);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs));
      current -= 1;
      return { current, maxSeen };
    }
  `, 'utf8');

  const registry = { atoms: {} };
  const atoms = [];
  for (let index = 0; index < count; index += 1) {
    const name = `parallel-${index + 1}`;
    const modulePath = resolve(projectRoot, `${name}.mjs`);
    writeFileSync(modulePath, `
      import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
      import { resolve, dirname } from 'node:path';
      import { enter, maxSeen } from './parallel-tracker.mjs';

      export default async function run(_input = {}, context = {}) {
        const snapshot = await enter(${delayMs});
        const outputPath = resolve(context.projectRoot, '.as-xflow', '${name}.json');
        mkdirSync(dirname(outputPath), { recursive: true });
        writeFileSync(outputPath, JSON.stringify({ atom: '${name}', done: true, max_seen: snapshot.maxSeen }));
        return { ok: true, status: 'completed', output_path: outputPath, max_seen: snapshot.maxSeen };
      }
    `, 'utf8');
    const atomId = `TEST.parallel.${index + 1}`;
    registry.atoms[atomId] = { track: 'heavy', type: 'js', module: modulePath };
    atoms.push({ id: atomId, parallel_group: 'workers' });
  }

  return { registry, atoms };
}

describe('Workflow parallel execution', () => {
  test('executor caps parallel group concurrency at the default max of 3 agents', async () => {
    const projectRoot = makeProjectRoot();
    try {
      const { registry, atoms } = writeTrackingModules(projectRoot, 5, 180);
      const workflow = { name: 'parallel-smoke', track: 'heavy' };
      const phases = [
        {
          id: 'fanout',
          label: 'Fanout',
          atoms,
          gate: { type: 'skip' },
        },
      ];

      const executor = new WorkflowExecutor({
        workflow,
        phases,
        registry,
        projectRoot,
        changeId: 'chg-parallel-smoke',
        input: {},
      });

      const startedAt = Date.now();
      await executor.run();
      const elapsedMs = Date.now() - startedAt;

      assert.equal(elapsedMs >= 320, true, `5 workers should not all run at once under cap=3, got ${elapsedMs}ms`);
      assert.equal(elapsedMs < 620, true, `execution should still be bounded, got ${elapsedMs}ms`);

      const logLines = readFileSync(resolve(projectRoot, '.as-xflow', 'logs', 'execution.ndjson'), 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      const atomRuns = logLines.filter((entry) => entry.kind === 'atom_run');
      assert.equal(atomRuns.length, 5);
      for (const atomRun of atomRuns) {
        assert.equal(atomRun.parallel_group, 'workers');
      }

      const maxSeenValues = atoms.map((_, index) => {
        const payload = JSON.parse(readFileSync(resolve(projectRoot, '.as-xflow', `parallel-${index + 1}.json`), 'utf8'));
        return payload.max_seen;
      });
      assert.equal(Math.max(...maxSeenValues) <= 3, true, `max concurrent workers should stay <= 3, got ${Math.max(...maxSeenValues)}`);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('executor schedules weighted parallel atoms within the effective budget', async () => {
    const projectRoot = makeProjectRoot();
    try {
      const { registry, atoms } = writeTrackingModules(projectRoot, 3, 160);
      atoms[0].parallel_weight = 2;
      atoms[1].parallel_weight = 2;
      atoms[2].parallel_weight = 1;
      const workflow = { name: 'weighted-parallel-smoke', track: 'heavy', parallel: { max_agents: 3 } };
      const phases = [
        {
          id: 'fanout',
          label: 'Fanout',
          atoms,
          gate: { type: 'skip' },
        },
      ];

      const executor = new WorkflowExecutor({
        workflow,
        phases,
        registry,
        projectRoot,
        changeId: 'chg-weighted-parallel-smoke',
        input: {},
      });

      await executor.run();

      const maxSeenValues = atoms.map((_, index) => {
        const payload = JSON.parse(readFileSync(resolve(projectRoot, '.as-xflow', `parallel-${index + 1}.json`), 'utf8'));
        return payload.max_seen;
      });
      assert.equal(Math.max(...maxSeenValues) <= 2, true, `weighted budget should keep two weight=2 atoms from running together, got ${Math.max(...maxSeenValues)}`);

      const logLines = readFileSync(resolve(projectRoot, '.as-xflow', 'logs', 'execution.ndjson'), 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      const atomRuns = logLines.filter((entry) => entry.kind === 'atom_run');
      const weightsByAtom = Object.fromEntries(atomRuns.map((entry) => [entry.atom_id, entry.parallel_weight]));
      assert.equal(weightsByAtom['TEST.parallel.1'], 2);
      assert.equal(weightsByAtom['TEST.parallel.2'], 2);
      assert.equal(weightsByAtom['TEST.parallel.3'], 1);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('fixed policy ignores parallel weights and uses the agent count cap', async () => {
    const projectRoot = makeProjectRoot();
    try {
      const { registry, atoms } = writeTrackingModules(projectRoot, 3, 160);
      for (const atom of atoms) {
        atom.parallel_weight = 2;
      }
      const workflow = { name: 'fixed-parallel-smoke', track: 'heavy', parallel: { max_agents: 3, policy: 'fixed' } };
      const phases = [
        {
          id: 'fanout',
          label: 'Fanout',
          atoms,
          gate: { type: 'skip' },
        },
      ];

      const executor = new WorkflowExecutor({
        workflow,
        phases,
        registry,
        projectRoot,
        changeId: 'chg-fixed-parallel-smoke',
        input: {},
      });

      await executor.run();

      const maxSeenValues = atoms.map((_, index) => {
        const payload = JSON.parse(readFileSync(resolve(projectRoot, '.as-xflow', `parallel-${index + 1}.json`), 'utf8'));
        return payload.max_seen;
      });
      assert.equal(Math.max(...maxSeenValues), 3);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
