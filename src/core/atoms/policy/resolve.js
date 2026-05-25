import { resolveEffectivePolicy } from '../../policy-overlay.js';

export async function policyResolve(input = {}, context = {}) {
  const projectRoot = context.projectRoot || process.cwd();
  const changeId = context.changeId || input.change_id || null;
  return resolveEffectivePolicy({
    projectRoot,
    changeId,
    executionMode: input.execution_mode || null,
  });
}
