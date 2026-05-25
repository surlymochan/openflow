const DEFAULT_MAX_AGENTS = 3;

function normalizePositiveInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.floor(parsed);
}

export function createConcurrencyPolicy({ workflow = {}, maxParallelAgentsOverride = null } = {}) {
  const workflowParallel = workflow.parallel || {};
  const configuredMaxAgents = normalizePositiveInteger(workflowParallel.max_agents, DEFAULT_MAX_AGENTS);
  const hasOverride = maxParallelAgentsOverride !== null && maxParallelAgentsOverride !== undefined;
  const maxAgents = hasOverride
    ? normalizePositiveInteger(maxParallelAgentsOverride, configuredMaxAgents)
    : configuredMaxAgents;
  const mode = workflowParallel.policy || 'weighted';

  return {
    mode,
    maxAgents,
    source: hasOverride ? 'mission_override' : 'workflow',
    weightFor(atomRef = {}, registry = {}) {
      const atomDef = registry.atoms?.[atomRef.id] || {};
      return normalizePositiveInteger(atomRef.parallel_weight ?? atomDef.parallel_weight, 1);
    },
    chargeFor(atomRef = {}, registry = {}) {
      if (mode === 'fixed') {
        return 1;
      }
      return Math.min(this.weightFor(atomRef, registry), maxAgents);
    },
  };
}
