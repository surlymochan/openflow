import { resolveEffectivePolicy } from '../../policy-overlay.js';
import { writeWorkflowRecommendation } from '../../intake-recommendation.js';

export async function intakeRecommend(input = {}, context = {}) {
  const projectRoot = context.projectRoot || process.cwd();
  const changeId = context.changeId || input.change_id;
  if (!changeId) throw new Error('change_id is required for G5.intake.recommend');
  const policyResult = resolveEffectivePolicy({
    projectRoot,
    changeId,
    executionMode: input.execution_mode || null,
    writeArtifact: true,
  });
  return writeWorkflowRecommendation({
    projectRoot,
    changeId,
    input: { ...(context.input || {}), ...input },
    effectivePolicy: policyResult.policy || policyResult.profile || {},
  });
}
