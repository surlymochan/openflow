import { resolveBoundMissionId } from '../../bindings.js';
import { getMissionDetail } from '../../mission-state.js';
import { readStore, resolveDataFile } from '../../state-store.js';
import { loadWorkflowState, resolveWorkflowStateFile, saveWorkflowState } from '../../workflow-state.js';

export async function workflowStateLoad(input = {}, context = {}) {
  const projectRoot = context.projectRoot || process.cwd();
  const workflowName = context.workflow?.name || input.workflow || null;
  const changeId = context.changeId || input.change_id || null;
  const phaseOrder = Array.isArray(context.workflow?.phases) ? context.workflow.phases.map((phase) => phase.id) : [];
  const currentPhase = context.phase?.id || input.phase || phaseOrder[0] || null;
  const stateFile = resolveWorkflowStateFile(projectRoot);
  const workflowState = loadWorkflowState(projectRoot, { workflowName, changeId, phaseOrder, currentPhase });
  saveWorkflowState(projectRoot, workflowState);

  const missionId = resolveBoundMissionId({
    projectRoot,
    changeId,
    missionId: input.mission_id || null,
    runtimeMissionId: context.runtime?.missionId || null,
  });

  let missionDetail = null;
  if (missionId) {
    const dataFile = resolveDataFile({ projectRoot, explicitPath: input.data_file || null });
    const store = await readStore(dataFile);
    missionDetail = getMissionDetail(store, missionId);
  }

  return {
    ok: true,
    state_file: stateFile,
    workflow_state: workflowState,
    mission_id: missionId,
    mission_detail: missionDetail,
  };
}
