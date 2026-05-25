import { listPhaseRunSessions } from './mission-state.js';

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

export function getMissionPhaseRuns(state, missionId) {
  return ensureArray(state.phase_runs)
    .filter((phaseRun) => phaseRun.mission_id === missionId)
    .sort((left, right) => String(right.completed_at || right.started_at || '').localeCompare(String(left.completed_at || left.started_at || '')));
}

export function getLatestPhaseRun(state, missionId) {
  return getMissionPhaseRuns(state, missionId)[0] || null;
}

export function getLatestPhaseEntry(phaseRun, phase) {
  if (!phaseRun || !phase) {
    return null;
  }
  const entries = ensureArray(phaseRun.phases).filter((entry) => entry.phase === phase);
  return entries.sort((left, right) => String(right.updated_at || '').localeCompare(String(left.updated_at || '')))[0] || null;
}

export function getLatestMissionSession(state, missionId) {
  return listPhaseRunSessions(state, missionId)[0] || null;
}
