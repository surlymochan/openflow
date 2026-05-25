import { resolveBoundMissionId } from '../../bindings.js';
import { collectExistingFiles, makeArtifactEnvelope, resolveChangePath, writeJsonFile } from '../../change-artifacts.js';
import { getLatestPhaseEntry, getLatestPhaseRun } from '../../phase-run-read.js';
import { readStore, resolveDataFile } from '../../state-store.js';

export async function gateEvidenceCollect(input = {}, context = {}) {
  const projectRoot = context.projectRoot || process.cwd();
  const changeId = context.changeId || input.change_id || null;
  if (!changeId) {
    throw new Error('change_id is required for J5.gate.evidence_collect');
  }

  const phase = input.phase || context.phase?.id || null;
  const dataFile = resolveDataFile({ projectRoot, explicitPath: input.data_file || null });
  const missionId = resolveBoundMissionId({
    projectRoot,
    changeId,
    missionId: input.mission_id || null,
    runtimeMissionId: context.runtime?.missionId || null,
  });

  const state = missionId ? await readStore(dataFile) : null;
  const phaseRun = missionId ? getLatestPhaseRun(state, missionId) : null;
  const phaseEntry = phase ? getLatestPhaseEntry(phaseRun, phase) : null;
  const baseFiles = collectExistingFiles([
    resolveChangePath(projectRoot, changeId, 'proposal.json'),
    resolveChangePath(projectRoot, changeId, 'proposal.md'),
    resolveChangePath(projectRoot, changeId, 'plan.json'),
    resolveChangePath(projectRoot, changeId, 'plan.md'),
    resolveChangePath(projectRoot, changeId, 'verify_proof.json'),
    resolveChangePath(projectRoot, changeId, 'qa_acceptance.json'),
    resolveChangePath(projectRoot, changeId, 'review.json'),
    resolveChangePath(projectRoot, changeId, 'gate_final.json'),
  ]);

  if (phaseRun?.phase_run_file) {
    baseFiles.push(phaseRun.phase_run_file);
  }

  const packet = makeArtifactEnvelope({
    phase,
    changeId,
    missionId,
    phaseRun,
    phaseEntry,
    extra: {
      evidence_refs: [...new Set(baseFiles)],
      evidence_count: baseFiles.length,
      phase_run_session_id: context.runtime?.phaseRunSessionId || null,
    },
  });

  const outputPath = resolveChangePath(projectRoot, changeId, `evidence/${phase || 'latest'}.json`);
  writeJsonFile(outputPath, packet);

  return {
    ok: true,
    mission_id: missionId,
    phase_run_id: phaseRun?.phase_run_id || null,
    evidence_file: outputPath,
    evidence_count: packet.evidence_count,
    packet,
  };
}
