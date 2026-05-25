import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { missionCreate } from '../src/core/atoms/mission/create.js';
import { phaseRunStart } from '../src/core/atoms/phase-run/start.js';
import { phaseRunPersist } from '../src/core/atoms/phase-run/persist.js';
import { gateEvidenceCollect } from '../src/core/atoms/gate/evidence-collect.js';
import { gatePayloadFromPhaseRun } from '../src/core/atoms/gate/payload-from-phase-run.js';
import { artifactVerify } from '../src/core/atoms/gate/artifact-verify.js';

function makeProjectRoot() {
  const root = mkdtempSync(join(tmpdir(), 'as-xflow-gate-'));
  mkdirSync(resolve(root, '.as-xflow'), { recursive: true });
  mkdirSync(resolve(root, 'specs', 'changes', 'chg-gate-1'), { recursive: true });
  return root;
}

function cleanupProjectRoot(root) {
  rmSync(root, { recursive: true, force: true });
}

describe('Gate atoms', () => {
  test('E4 writes proposal artifacts from the latest phase-run payload', async () => {
    const projectRoot = makeProjectRoot();
    try {
      const created = await missionCreate(
        { goal: 'Freeze proposal', workspace: projectRoot },
        { projectRoot, changeId: 'chg-gate-1', runtime: {} },
      );
      const missionId = created.mission_id;
      const started = await phaseRunStart(
        { mission_id: missionId, phase: 'proposal', summary: 'Shape the proposal' },
        { projectRoot, changeId: 'chg-gate-1', runtime: {} },
      );

      await phaseRunPersist(
        {
          mission_id: missionId,
          session_id: started.session.session_id,
          summary: 'Shape the proposal',
          status: 'completed',
          phases: [{
            phase: 'proposal',
            status: 'completed',
            effective_status: 'completed',
            summary: 'Primary journey and module split frozen.',
            team_run: {
              pattern: 'triad',
              verdict: { status: 'accept', rationale: 'Proposal is coherent.' },
              findings: [{ summary: 'Journey is believable.' }],
            },
          }],
          executed_phases: ['proposal'],
        },
        { projectRoot, changeId: 'chg-gate-1', runtime: { phaseRunSessionId: started.session.session_id } },
      );

      const result = await gatePayloadFromPhaseRun(
        {},
        { projectRoot, changeId: 'chg-gate-1', runtime: { missionId }, phase: { id: 'proposal' } },
      );

      assert.equal(result.ok, true);
      const proposalJson = JSON.parse(readFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-gate-1', 'proposal.json'), 'utf8'));
      const proposalMd = readFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-gate-1', 'proposal.md'), 'utf8');
      assert.equal(proposalJson.phase, 'proposal');
      assert.equal(proposalJson.team_run.verdict.status, 'accept');
      assert.match(proposalMd, /Primary journey and module split frozen/);
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('J5 collects evidence refs and E5 emits qa_acceptance from proof + phase-run qa packet', async () => {
    const projectRoot = makeProjectRoot();
    try {
      const created = await missionCreate(
        { goal: 'Run QA acceptance', workspace: projectRoot },
        { projectRoot, changeId: 'chg-gate-1', runtime: {} },
      );
      const missionId = created.mission_id;
      const started = await phaseRunStart(
        { mission_id: missionId, phase: 'qa', summary: 'Verify acceptance' },
        { projectRoot, changeId: 'chg-gate-1', runtime: {} },
      );

      writeFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-gate-1', 'verify_proof.json'), JSON.stringify({
        all_passed: true,
        results: [{ command: 'npm test', passed: true, exit_code: 0 }],
      }, null, 2));

      await phaseRunPersist(
        {
          mission_id: missionId,
          session_id: started.session.session_id,
          summary: 'Verify acceptance',
          status: 'completed',
          phases: [{
            phase: 'qa',
            status: 'completed',
            effective_status: 'completed',
            team_run: {
              qa_acceptance_packet: {
                status: 'accepted',
                primary_journey_covered: true,
                module_coverage: { covered_module_count: 2, expected_module_count: 2 },
                cross_module_continuity: { status: 'covered' },
              },
              findings: [{ summary: 'Primary journey passed.' }],
            },
          }],
          executed_phases: ['qa'],
        },
        { projectRoot, changeId: 'chg-gate-1', runtime: { phaseRunSessionId: started.session.session_id } },
      );

      const verifyResult = await artifactVerify(
        {},
        { projectRoot, changeId: 'chg-gate-1', runtime: { missionId }, phase: { id: 'qa' } },
      );
      assert.equal(verifyResult.ok, true);
      assert.equal(verifyResult.verdict, 'accepted');

      const evidenceResult = await gateEvidenceCollect(
        {},
        { projectRoot, changeId: 'chg-gate-1', runtime: { missionId }, phase: { id: 'qa' } },
      );
      assert.equal(evidenceResult.ok, true);
      const evidencePacket = JSON.parse(readFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-gate-1', 'evidence', 'qa.json'), 'utf8'));
      assert.equal(evidencePacket.phase, 'qa');
      assert.equal(evidencePacket.evidence_count >= 2, true);

      const qaAcceptance = JSON.parse(readFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-gate-1', 'qa_acceptance.json'), 'utf8'));
      assert.equal(qaAcceptance.qa_status, 'accepted');
      assert.equal(qaAcceptance.primary_journey_covered, true);
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('E5 keeps QA in needs_human when tests pass but competitor-backed acceptance is missing', async () => {
    const projectRoot = makeProjectRoot();
    try {
      const created = await missionCreate(
        { goal: 'Reject soft visual acceptance', workspace: projectRoot },
        { projectRoot, changeId: 'chg-gate-1', runtime: {} },
      );
      const missionId = created.mission_id;
      const started = await phaseRunStart(
        { mission_id: missionId, phase: 'qa', summary: 'Verify acceptance' },
        { projectRoot, changeId: 'chg-gate-1', runtime: {} },
      );

      writeFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-gate-1', 'verify_proof.json'), JSON.stringify({
        all_passed: true,
        results: [{ command: 'npm test', passed: true, exit_code: 0 }],
      }, null, 2));

      await phaseRunPersist(
        {
          mission_id: missionId,
          session_id: started.session.session_id,
          summary: 'Verify acceptance',
          status: 'completed',
          phases: [{
            phase: 'qa',
            status: 'completed',
            effective_status: 'completed',
            team_run: {
              qa_acceptance_packet: {
                status: 'needs_human',
                primary_journey_covered: false,
                manifest_valid: false,
                module_coverage: { covered_module_count: 0, expected_module_count: 3 },
                cross_module_continuity: { status: 'unverified' },
                failed_checks: ['competitor_surface_unmapped'],
              },
              findings: [{ summary: 'Looks close, but competitor-backed proof is missing.' }],
            },
          }],
          executed_phases: ['qa'],
        },
        { projectRoot, changeId: 'chg-gate-1', runtime: { phaseRunSessionId: started.session.session_id } },
      );

      const verifyResult = await artifactVerify(
        {},
        { projectRoot, changeId: 'chg-gate-1', runtime: { missionId }, phase: { id: 'qa' } },
      );
      assert.equal(verifyResult.ok, false);
      assert.equal(verifyResult.verdict, 'needs_human');

      const qaAcceptance = JSON.parse(readFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-gate-1', 'qa_acceptance.json'), 'utf8'));
      assert.equal(qaAcceptance.qa_status, 'needs_human');
      assert.deepEqual(qaAcceptance.failed_checks, ['competitor_surface_unmapped']);
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });
});
