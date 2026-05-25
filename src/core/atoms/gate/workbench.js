import { readJsonFile, resolveChangePath, writeJsonFile } from '../../change-artifacts.js';
import { resolveBoundMissionId } from '../../bindings.js';
import { getMissionDetail } from '../../mission-state.js';
import { readStore, resolveDataFile } from '../../state-store.js';

function summarizeGateDecisions(detail) {
  const gates = Array.isArray(detail.gate_decisions) ? detail.gate_decisions : [];
  return {
    total: gates.length,
    pass: gates.filter((gate) => gate.result === 'pass').length,
    fail: gates.filter((gate) => gate.result === 'fail').length,
    needs_human: gates.filter((gate) => gate.result === 'needs_human').length,
  };
}

function deriveRecommendation(detail, qaAcceptance, evidencePacket) {
  if (qaAcceptance?.qa_status === 'accepted' && (evidencePacket?.evidence_count || 0) > 0) {
    return 'pass';
  }
  if (qaAcceptance?.qa_status === 'rejected') {
    return 'fail';
  }
  if ((detail.gate_decisions || []).some((gate) => gate.result === 'fail')) {
    return 'fail';
  }
  return 'needs_human';
}

export async function gateWorkbench(input = {}, context = {}) {
  const projectRoot = context.projectRoot || process.cwd();
  const changeId = context.changeId || input.change_id || null;
  if (!changeId) {
    throw new Error('change_id is required for E3.gate.workbench');
  }

  const dataFile = resolveDataFile({ projectRoot, explicitPath: input.data_file || null });
  const missionId = resolveBoundMissionId({
    projectRoot,
    changeId,
    missionId: input.mission_id || null,
    runtimeMissionId: context.runtime?.missionId || null,
  });

  if (!missionId) {
    throw new Error('mission_id is required for E3.gate.workbench');
  }

  const state = await readStore(dataFile);
  const detail = getMissionDetail(state, missionId);
  const qaAcceptance = readJsonFile(resolveChangePath(projectRoot, changeId, 'qa_acceptance.json'), null);
  const evidencePacket = readJsonFile(resolveChangePath(projectRoot, changeId, 'evidence/gate_final.json'), null)
    || readJsonFile(resolveChangePath(projectRoot, changeId, 'evidence/qa.json'), null);
  const recommendation = deriveRecommendation(detail, qaAcceptance, evidencePacket);

  const workbench = {
    version: 1,
    change_id: changeId,
    mission_id: missionId,
    generated_at: new Date().toISOString(),
    mission_status: detail.mission.status,
    execution_overview: detail.execution_overview,
    gate_summary: summarizeGateDecisions(detail),
    qa_acceptance: qaAcceptance,
    evidence: evidencePacket,
    recommendation,
    review_queue: (detail.gate_decisions || []).filter((gate) => gate.result !== 'pass'),
    recent_gates: detail.gate_decisions || [],
  };

  const outputPath = resolveChangePath(projectRoot, changeId, 'gate_final.json');
  writeJsonFile(outputPath, workbench);

  return {
    ok: true,
    verdict: recommendation,
    gate_final_file: outputPath,
    workbench,
  };
}
