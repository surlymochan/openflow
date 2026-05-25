import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { WorkflowExecutor } from '../src/core/workflow-executor.js';
import { readExecutionLog } from '../src/core/execution-log.js';
import registry from '../atoms/registry.json' with { type: 'json' };

function makeProjectRoot() {
  const root = mkdtempSync(join(tmpdir(), 'openflow-log-'));
  mkdirSync(resolve(root, '.as-xflow'), { recursive: true });
  return root;
}

describe('Execution log', () => {
  test('workflow executor appends lifecycle and atom NDJSON records', async () => {
    const projectRoot = makeProjectRoot();
    try {
      const workflow = { name: 'log-smoke', track: 'lite' };
      const phases = [
        {
          id: 'change-init',
          label: 'Change init',
          atoms: [
            { id: 'B1.change.scaffold', with: { change_type: 'backend', title: 'Log smoke' } },
            { id: 'B2b.status.write', with: { fields: { current_stage: 'change-init', status: 'draft' } } },
          ],
          gate: { type: 'skip' },
        },
      ];

      const executor = new WorkflowExecutor({
        workflow,
        phases,
        registry,
        projectRoot,
        changeId: 'chg-log-smoke',
        input: {},
      });

      await executor.run();

      const logFile = resolve(projectRoot, '.as-xflow', 'logs', 'execution.ndjson');
      const lines = readFileSync(logFile, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
      assert.equal(lines.length, 7);
      assert.equal(lines[0].kind, 'workflow_started');
      assert.equal(lines[0].change_id, 'chg-log-smoke');
      assert.equal(lines[0].max_parallel_agents, 3);
      assert.ok(lines[0].workflow_integrity.digest);
      assert.ok(lines[0].entry_hash);
      assert.equal(lines[1].kind, 'phase_started');
      assert.equal(lines[2].kind, 'atom_run');
      assert.equal(lines[2].phase_id, 'change-init');
      assert.equal(lines[2].atom_id, 'B1.change.scaffold');
      assert.equal(lines[3].atom_id, 'B2b.status.write');
      assert.equal(lines[4].kind, 'gate_check');
      assert.equal(lines[4].gate_type, 'skip');
      assert.equal(lines[5].kind, 'phase_completed');
      assert.equal(lines[6].kind, 'workflow_completed');
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('execution log captures adapter metadata from atom outputs', async () => {
    const projectRoot = makeProjectRoot();
    try {
      const atomModule = resolve(projectRoot, 'adapter-metadata-atom.mjs');
      writeFileSync(atomModule, [
        "import { mkdirSync, writeFileSync } from 'node:fs';",
        "import { dirname, resolve } from 'node:path';",
        'export default async function adapterMetadataAtom(input, context) {',
        "  const artifact = resolve(context.projectRoot, 'specs', 'changes', context.changeId, 'pencil_output.pen');",
        '  mkdirSync(dirname(artifact), { recursive: true });',
        "  writeFileSync(artifact, 'PENCIL synthetic\\n');",
        "  return { ok: true, adapter: 'pencil_cli', adapter_reason: 'pencil_authenticated', artifact: { type: 'pencil_pen' } };",
        '}',
      ].join('\n'));

      const workflow = { name: 'pencil-log-smoke', track: 'heavy' };
      const localRegistry = JSON.parse(JSON.stringify(registry));
      localRegistry.atoms['TEST.adapter.metadata'] = {
        track: 'heavy',
        type: 'js',
        module: atomModule,
        export: 'default',
      };
      const phases = [
        {
          id: 'pencil_draft',
          label: 'Pencil draft',
          atoms: [{ id: 'TEST.adapter.metadata' }],
          artifacts: [{ path: 'specs/changes/${change_id}/pencil_output.pen', optional: false }],
          gate: { type: 'artifact-verify' },
        },
      ];
      const executor = new WorkflowExecutor({
        workflow,
        phases,
        registry: localRegistry,
        projectRoot,
        changeId: 'chg-pencil-log',
        input: {},
      });

      await executor.run();

      const logFile = resolve(projectRoot, '.as-xflow', 'logs', 'execution.ndjson');
      const lines = readFileSync(logFile, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
      const atomRun = lines.find((entry) => entry.kind === 'atom_run' && entry.atom_id === 'TEST.adapter.metadata');
      assert.equal(atomRun.adapter, 'pencil_cli');
      assert.equal(atomRun.adapter_reason, 'pencil_authenticated');
      assert.equal(atomRun.artifact_type, 'pencil_pen');
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('execution log remains hash-linked when parallel atoms finish together', async () => {
    const projectRoot = makeProjectRoot();
    try {
      const atomModule = resolve(projectRoot, 'parallel-atom.mjs');
      writeFileSync(atomModule, [
        'export async function one() { await new Promise((r) => setTimeout(r, 5)); return { ok: true }; }',
        'export async function two() { await new Promise((r) => setTimeout(r, 5)); return { ok: true }; }',
      ].join('\n'));

      const workflow = { name: 'parallel-log-smoke', track: 'heavy', parallel: { max_agents: 2, policy: 'weighted' } };
      const localRegistry = JSON.parse(JSON.stringify(registry));
      localRegistry.atoms['TEST.parallel.one'] = {
        track: 'heavy',
        type: 'js',
        module: atomModule,
        export: 'one',
      };
      localRegistry.atoms['TEST.parallel.two'] = {
        track: 'heavy',
        type: 'js',
        module: atomModule,
        export: 'two',
      };
      const phases = [
        {
          id: 'parallel-review',
          label: 'Parallel review',
          atoms: [
            { id: 'TEST.parallel.one', parallel_group: 'review', parallel_weight: 1 },
            { id: 'TEST.parallel.two', parallel_group: 'review', parallel_weight: 1 },
          ],
          gate: { type: 'skip' },
        },
      ];
      const executor = new WorkflowExecutor({
        workflow,
        phases,
        registry: localRegistry,
        projectRoot,
        changeId: 'chg-parallel-log',
        input: {},
      });

      await executor.run();

      const log = await readExecutionLog(projectRoot, { limit: 100 });
      assert.equal(log.chain.ok, true, log.chain.issues.join('\n'));
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
