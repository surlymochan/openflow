import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

export const STRICT_CORPS_FORBIDDEN_ADAPTERS = new Set(['stub']);
export const STRICT_CORPS_FORBIDDEN_STATUSES = new Set(['task_queued', 'pencil_stubbed']);

export function stableStringify(value) {
  return JSON.stringify(sortForStableStringify(value));
}

function sortForStableStringify(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => sortForStableStringify(entry));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, sortForStableStringify(entry)]),
    );
  }
  return value;
}

export function hashPayload(value) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

export function buildLogEntryHash(entry) {
  const { entry_hash: _entryHash, ...payload } = entry || {};
  return hashPayload(payload);
}

export function validateExecutionLogChain(entries = [], options = {}) {
  const issues = [];
  let previousHash = options.initialPreviousHash || null;
  const allowExternalPreviousHash = options.allowExternalPreviousHash === true;
  entries.forEach((entry, index) => {
    const expectedPrevious = previousHash || null;
    if (!(index === 0 && allowExternalPreviousHash) && (entry.prev_hash || null) !== expectedPrevious) {
      issues.push(`execution_log_chain_prev_mismatch:${index}`);
    }
    const expectedHash = buildLogEntryHash(entry);
    if (entry.entry_hash !== expectedHash) {
      issues.push(`execution_log_chain_hash_mismatch:${index}`);
    }
    previousHash = entry.entry_hash || expectedHash;
  });
  return {
    ok: issues.length === 0,
    issues,
    entries_checked: entries.length,
  };
}

export function buildWorkflowManifest({ workflowPath = null, workflow = {}, phases = [], registry = {} }) {
  const referencedAtomIds = new Set();
  for (const phase of phases) {
    for (const atomRef of phase.atoms || []) {
      referencedAtomIds.add(atomRef.id);
    }
    if (phase.gate?.atom) {
      referencedAtomIds.add(phase.gate.atom);
    }
  }

  const atomEntries = [...referencedAtomIds].sort().map((atomId) => {
    const def = registry.atoms?.[atomId] || {};
    return {
      id: atomId,
      track: def.track || null,
      type: def.type || null,
      script: def.script || null,
      module: def.module || null,
      export: def.export || null,
      expected_artifact: def.expected_artifact || null,
      prompt_template: def.prompt_template || null,
      agent_adapter: def.agent_config?.adapter || null,
      requires_http: def.requires_http === true,
    };
  });

  const body = {
    version: 1,
    workflow_name: workflow.name || null,
    track: workflow.track || null,
    phase_count: phases.length,
    phase_ids: phases.map((phase) => phase.id),
    phases: phases.map((phase) => ({
      id: phase.id,
      required: phase.required !== false,
      atom_ids: (phase.atoms || []).map((atomRef) => atomRef.id),
      gate: {
        type: phase.gate?.type || 'skip',
        atom: phase.gate?.atom || null,
        on_fail: phase.gate?.on_fail || null,
      },
      artifacts: (phase.artifacts || []).map((artifact) => ({
        path: artifact.path || null,
        optional: artifact.optional === true,
      })),
    })),
    atoms: atomEntries,
  };

  return {
    ...body,
    workflow_path: workflowPath ? resolve(workflowPath) : null,
    digest: hashPayload(body),
  };
}
