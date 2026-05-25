import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { missionCreate } from '../src/core/atoms/mission/create.js';
import { eventIngest } from '../src/core/atoms/event/ingest.js';
import { interventionCreate } from '../src/core/atoms/intervention/create.js';
import { gateWorkbench } from '../src/core/atoms/gate/workbench.js';
import { readStore } from '../src/core/state-store.js';

function makeProjectRoot() {
  const root = mkdtempSync(join(tmpdir(), 'as-xflow-control-'));
  mkdirSync(resolve(root, '.as-xflow'), { recursive: true });
  mkdirSync(resolve(root, 'specs', 'changes', 'chg-control-1', 'evidence'), { recursive: true });
  return root;
}

function cleanupProjectRoot(root) {
  rmSync(root, { recursive: true, force: true });
}

describe('Control-plane atoms', () => {
  test('D4 ingests gate events and D5 records interventions in sqlite state', async () => {
    const projectRoot = makeProjectRoot();
    try {
      const created = await missionCreate(
        { goal: 'Track gate state', workspace: projectRoot },
        { projectRoot, changeId: 'chg-control-1', runtime: {} },
      );
      const missionId = created.mission_id;

      const gateResult = await eventIngest(
        {
          mission_id: missionId,
          task_id: 'task_review',
          type: 'gate_result',
          payload: {
            gate_type: 'team_run:review:triad',
            result: 'fail',
            rationale: 'Adversarial review found a bug.',
          },
        },
        { projectRoot, changeId: 'chg-control-1', runtime: {} },
      );
      assert.equal(gateResult.gate_decision.result, 'fail');

      const intervention = await interventionCreate(
        {
          mission_id: missionId,
          action: 'rerun',
          note: 'Retry after fix.',
        },
        { projectRoot, changeId: 'chg-control-1', runtime: {} },
      );
      assert.equal(intervention.intervention.action, 'rerun');

      const state = await readStore(resolve(projectRoot, '.as-xflow', 'state.sqlite'));
      assert.equal(state.gate_decisions.length, 1);
      assert.equal(state.interventions.length, 1);
      assert.equal(state.events.some((event) => event.type === 'human_intervened'), true);
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('E3 builds gate_final workbench from gate state, evidence, and qa acceptance', async () => {
    const projectRoot = makeProjectRoot();
    try {
      const created = await missionCreate(
        { goal: 'Assemble final gate workbench', workspace: projectRoot },
        { projectRoot, changeId: 'chg-control-1', runtime: {} },
      );
      const missionId = created.mission_id;

      await eventIngest(
        {
          mission_id: missionId,
          task_id: 'task_qa',
          type: 'gate_result',
          payload: {
            gate_type: 'artifact:qa:playwright',
            result: 'pass',
            rationale: 'QA packet passed.',
          },
        },
        { projectRoot, changeId: 'chg-control-1', runtime: {} },
      );

      writeFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-control-1', 'qa_acceptance.json'), JSON.stringify({
        qa_status: 'accepted',
        primary_journey_covered: true,
      }, null, 2));
      writeFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-control-1', 'evidence', 'gate_final.json'), JSON.stringify({
        evidence_count: 3,
        evidence_refs: ['verify_proof.json', 'qa_acceptance.json', 'review.json'],
      }, null, 2));

      const result = await gateWorkbench(
        {},
        { projectRoot, changeId: 'chg-control-1', runtime: { missionId } },
      );

      assert.equal(result.verdict, 'pass');
      const gateFinal = JSON.parse(readFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-control-1', 'gate_final.json'), 'utf8'));
      assert.equal(gateFinal.recommendation, 'pass');
      assert.equal(gateFinal.gate_summary.pass, 1);
      assert.equal(gateFinal.qa_acceptance.qa_status, 'accepted');
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });
});
