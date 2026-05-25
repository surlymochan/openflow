import { resolveBoundMissionId } from './bindings.js';

function nowIso() {
  return new Date().toISOString();
}

function ensureArray(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function makeId() {
  return `mem_${Math.random().toString(36).slice(2, 14)}`;
}

export function createMemoryItem(state, input = {}) {
  state.memories = ensureArray(state.memories);
  const timestamp = nowIso();
  const item = {
    memory_id: makeId(),
    mission_id: input.mission_id || null,
    scope: input.scope || (input.mission_id ? 'mission' : 'project'),
    scope_ref: input.scope_ref || input.mission_id || input.workspace_id || 'default-workspace',
    kind: input.kind || 'fact',
    category: input.category || 'workflow',
    status: input.status || 'active',
    canonical_text: input.canonical_text || input.text || '',
    structured_payload: input.structured_payload || {},
    source_events: ensureArray(input.source_events),
    evidence_refs: ensureArray(input.evidence_refs),
    created_at: timestamp,
    updated_at: timestamp,
  };
  state.memories.unshift(item);
  return item;
}

export function listMemoryItems(state, filter = {}) {
  return ensureArray(state.memories).filter((item) => {
    if (filter.mission_id && item.mission_id !== filter.mission_id) return false;
    if (filter.scope && item.scope !== filter.scope) return false;
    if (filter.status && item.status !== filter.status) return false;
    return true;
  });
}

export function buildMemoryMount(state, input = {}) {
  const items = listMemoryItems(state, input).slice(0, Number(input.limit || 20));
  return {
    mission_id: input.mission_id || null,
    total: items.length,
    items,
  };
}

export function resolveMemoryMissionId(input = {}, context = {}) {
  return resolveBoundMissionId({
    projectRoot: context.projectRoot || process.cwd(),
    changeId: context.changeId || input.change_id || null,
    missionId: input.mission_id || null,
    runtimeMissionId: context.runtime?.missionId || null,
  });
}
