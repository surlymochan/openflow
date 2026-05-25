import { existsSync } from 'node:fs';

import { makeArtifactEnvelope, readJsonFile, resolveChangePath, writeJsonFile } from '../../change-artifacts.js';
import { resolveBoundMissionId } from '../../bindings.js';
import { getLatestPhaseEntry, getLatestPhaseRun } from '../../phase-run-read.js';
import { readStore, resolveDataFile } from '../../state-store.js';

function deriveQaStatus({ verifyProof, qaPacket, phaseEntry }) {
  const testsPassed = verifyProof?.all_passed === true;
  const packetStatus = qaPacket?.status || null;
  const phaseStatus = phaseEntry?.effective_status || phaseEntry?.status || null;
  const failedChecks = Array.isArray(qaPacket?.failed_checks) ? qaPacket.failed_checks : [];
  const journeyCovered = qaPacket?.primary_journey_covered === true;
  const moduleCoverage = qaPacket?.module_coverage || null;
  const modulesCovered = Number(moduleCoverage?.covered_module_count || 0);
  const modulesExpected = Number(moduleCoverage?.expected_module_count || 0);
  const modulesSatisfied = modulesExpected > 0 && modulesCovered >= modulesExpected;

  if (packetStatus === 'accepted' && testsPassed && journeyCovered && modulesSatisfied && failedChecks.length === 0) return 'accepted';
  if (packetStatus === 'needs_human') return 'needs_human';
  if (packetStatus === 'rejected') return 'rejected';
  if (phaseStatus === 'completed' && testsPassed && qaPacket) return 'needs_human';
  if (testsPassed) return 'needs_human';
  return 'needs_human';
}

export async function artifactVerify(input = {}, context = {}) {
  const projectRoot = context.projectRoot || process.cwd();
  const changeId = context.changeId || input.change_id || null;
  if (!changeId) {
    throw new Error('change_id is required for E5.artifact.verify');
  }

  const phase = input.phase || context.phase?.id || 'qa';
  const dataFile = resolveDataFile({ projectRoot, explicitPath: input.data_file || null });
  const missionId = resolveBoundMissionId({
    projectRoot,
    changeId,
    missionId: input.mission_id || null,
    runtimeMissionId: context.runtime?.missionId || null,
  });

  if (!missionId) {
    throw new Error('mission_id is required for E5.artifact.verify');
  }

  const state = await readStore(dataFile);
  const phaseRun = getLatestPhaseRun(state, missionId);
  const phaseEntry = getLatestPhaseEntry(phaseRun, phase);
  const verifyProofPath = resolveChangePath(projectRoot, changeId, 'verify_proof.json');
  const verifyProof = readJsonFile(verifyProofPath, null);
  const qaPacket = phaseEntry?.team_run?.qa_acceptance_packet || null;
  const status = deriveQaStatus({ verifyProof, qaPacket, phaseEntry });
  const packet = makeArtifactEnvelope({
    phase,
    changeId,
    missionId,
    phaseRun,
    phaseEntry,
    extra: {
      verify_proof: verifyProof,
      qa_acceptance_packet: qaPacket,
      manifest_valid: existsSync(verifyProofPath),
      qa_status: status,
      primary_journey_covered: qaPacket?.primary_journey_covered ?? (verifyProof?.all_passed === true),
      module_coverage: qaPacket?.module_coverage || null,
      cross_module_continuity: qaPacket?.cross_module_continuity || null,
      failed_checks: qaPacket?.failed_checks || [],
    },
  });

  const outputPath = resolveChangePath(projectRoot, changeId, 'qa_acceptance.json');
  writeJsonFile(outputPath, packet);

  return {
    ok: status === 'accepted',
    verdict: status,
    mission_id: missionId,
    phase_run_id: phaseRun?.phase_run_id || null,
    qa_acceptance_file: outputPath,
    packet,
  };
}
