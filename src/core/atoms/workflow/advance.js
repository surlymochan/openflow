import { resolveChangePath } from '../../change-artifacts.js';
import { advanceWorkflowState } from '../../workflow-state.js';

export async function workflowAdvance(input = {}, context = {}) {
  const projectRoot = context.projectRoot || process.cwd();
  const workflowName = context.workflow?.name || input.workflow || null;
  const changeId = context.changeId || input.change_id || null;
  const phaseOrder = Array.isArray(context.workflow?.phases) ? context.workflow.phases.map((phase) => phase.id) : [];
  const expectedPhase = input.phase || context.phase?.id || null;
  const artifactPath = input.artifact_path
    || (changeId && expectedPhase ? resolveChangePath(projectRoot, changeId, `${expectedPhase}.json`) : null);

  const workflowState = advanceWorkflowState(projectRoot, {
    expectedPhase,
    artifactPath,
    workflowName,
    changeId,
    phaseOrder,
  });

  return {
    ok: true,
    workflow_state: workflowState,
  };
}
