import {
  makeArtifactEnvelope,
  renderMarkdownArtifact,
  resolveChangePath,
  writeJsonFile,
  writeTextFile,
} from '../../change-artifacts.js';
import { resolveBoundMissionId } from '../../bindings.js';
import { getLatestPhaseEntry, getLatestPhaseRun } from '../../phase-run-read.js';
import { readStore, resolveDataFile } from '../../state-store.js';

function titleForPhase(phase) {
  if (phase === 'proposal') return 'Proposal';
  if (phase === 'plan') return 'Plan';
  return phase ? phase.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()) : 'Phase';
}

export async function gatePayloadFromPhaseRun(input = {}, context = {}) {
  const projectRoot = context.projectRoot || process.cwd();
  const changeId = context.changeId || input.change_id || null;
  if (!changeId) {
    throw new Error('change_id is required for E4.gate.payload_from_phase_run');
  }

  const phase = input.phase || context.phase?.id || null;
  if (!phase) {
    throw new Error('phase is required for E4.gate.payload_from_phase_run');
  }

  const dataFile = resolveDataFile({ projectRoot, explicitPath: input.data_file || null });
  const missionId = resolveBoundMissionId({
    projectRoot,
    changeId,
    missionId: input.mission_id || null,
    runtimeMissionId: context.runtime?.missionId || null,
  });

  if (!missionId) {
    throw new Error('mission_id is required for E4.gate.payload_from_phase_run');
  }

  const state = await readStore(dataFile);
  const phaseRun = getLatestPhaseRun(state, missionId);
  if (!phaseRun) {
    throw new Error(`No phase run found for mission ${missionId}`);
  }

  const phaseEntry = getLatestPhaseEntry(phaseRun, phase);
  const envelope = makeArtifactEnvelope({
    phase,
    changeId,
    missionId,
    phaseRun,
    phaseEntry,
    extra: {
      qa_acceptance_packet: phaseEntry?.team_run?.qa_acceptance_packet || null,
      workspace_evidence: phaseEntry?.team_run?.workspace_evidence || phaseRun.workspace_evidence || null,
    },
  });

  const jsonPath = resolveChangePath(projectRoot, changeId, `${phase}.json`);
  writeJsonFile(jsonPath, envelope);

  let mdPath = null;
  if (phase === 'proposal' || phase === 'plan') {
    mdPath = resolveChangePath(projectRoot, changeId, `${phase}.md`);
    writeTextFile(mdPath, renderMarkdownArtifact({ title: titleForPhase(phase), phase, envelope }));
  }

  return {
    ok: true,
    mission_id: missionId,
    phase_run_id: phaseRun.phase_run_id,
    json_file: jsonPath,
    markdown_file: mdPath,
    payload: envelope,
  };
}
