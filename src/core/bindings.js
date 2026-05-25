import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function bindingsFile(projectRoot) {
  return resolve(projectRoot, '.as-xflow', 'bindings.json');
}

export function readBindings(projectRoot) {
  const file = bindingsFile(projectRoot);
  if (!existsSync(file)) {
    return {};
  }

  try {
    const raw = readFileSync(file, 'utf8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function readBinding(projectRoot, changeId) {
  return readBindings(projectRoot)[changeId] || null;
}

export function resolveBoundMissionId({ projectRoot, changeId, missionId = null, runtimeMissionId = null } = {}) {
  if (missionId) {
    return missionId;
  }
  if (runtimeMissionId) {
    return runtimeMissionId;
  }
  if (!changeId) {
    return null;
  }
  return readBinding(projectRoot, changeId)?.mission_id || null;
}
