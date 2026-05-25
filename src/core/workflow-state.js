import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

export function resolveWorkflowStateFile(projectRoot = process.cwd()) {
  return resolve(projectRoot, '.as-xflow', 'workflow-state.json');
}

function normalizePhaseOrder(phaseOrder = [], fallbackPhase = null) {
  const order = Array.isArray(phaseOrder) ? phaseOrder.filter(Boolean) : [];
  if (order.length > 0) {
    return order;
  }
  return fallbackPhase ? [fallbackPhase] : [];
}

function ensureStateDefaults(state = {}, { workflowName = null, changeId = null, phaseOrder = [], currentPhase = null } = {}) {
  const now = nowIso();
  const order = normalizePhaseOrder(phaseOrder, currentPhase || state.current_phase || state.last_completed_phase || null);
  const phase = currentPhase || state.current_phase || state.last_completed_phase || order[0] || null;
  const phaseIndex = phase ? order.indexOf(phase) : null;
  return {
    version: state.version || 1,
    workflow_id: state.workflow_id || makeId('wf'),
    workflow: state.workflow || workflowName || null,
    change_id: state.change_id || changeId || null,
    status: state.status || 'active',
    started_at: state.started_at || now,
    updated_at: now,
    current_phase: phase,
    current_phase_index: phaseIndex >= 0 ? phaseIndex : null,
    completed_phases: Array.isArray(state.completed_phases) ? state.completed_phases : [],
    phase_order: order,
    current_artifact_path: state.current_artifact_path || null,
    last_transition: state.last_transition || null,
    last_completed_phase: state.last_completed_phase || null,
    pending_gate_token: state.pending_gate_token || null,
    pending_gate_phase: state.pending_gate_phase || null,
    pending_gate_issued_at: state.pending_gate_issued_at || null,
  };
}

export function loadWorkflowState(projectRoot = process.cwd(), options = {}) {
  const file = resolveWorkflowStateFile(projectRoot);
  if (!existsSync(file)) {
    return ensureStateDefaults({}, options);
  }

  try {
    const raw = readFileSync(file, 'utf8');
    const parsed = raw.trim() ? JSON.parse(raw) : {};
    return ensureStateDefaults(parsed, options);
  } catch {
    return ensureStateDefaults({}, options);
  }
}

export function saveWorkflowState(projectRoot = process.cwd(), state = {}) {
  const file = resolveWorkflowStateFile(projectRoot);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  return file;
}

export function advanceWorkflowState(projectRoot = process.cwd(), { expectedPhase = null, artifactPath = null, workflowName = null, changeId = null, phaseOrder = [] } = {}) {
  const state = loadWorkflowState(projectRoot, { workflowName, changeId, phaseOrder, currentPhase: expectedPhase });
  const currentPhase = expectedPhase || state.current_phase;
  const order = normalizePhaseOrder(state.phase_order, currentPhase);
  const currentIndex = currentPhase ? order.indexOf(currentPhase) : -1;

  if (!currentPhase || currentIndex < 0) {
    throw new Error(`Cannot advance workflow state from unknown phase: ${String(currentPhase || '')}`);
  }

  const nextPhase = order[currentIndex + 1] || null;
  const timestamp = nowIso();
  const completedEntry = {
    phase: currentPhase,
    artifact_path: artifactPath || state.current_artifact_path || null,
    completed_at: timestamp,
  };

  const completedPhases = Array.isArray(state.completed_phases) ? [...state.completed_phases] : [];
  completedPhases.push(completedEntry);

  const nextState = {
    ...state,
    workflow: state.workflow || workflowName || null,
    change_id: state.change_id || changeId || null,
    phase_order: order,
    completed_phases: completedPhases,
    current_phase: nextPhase,
    current_phase_index: nextPhase ? order.indexOf(nextPhase) : null,
    current_artifact_path: null,
    last_transition: {
      from: currentPhase,
      to: nextPhase,
      artifact_path: artifactPath || null,
      transitioned_at: timestamp,
    },
    last_completed_phase: currentPhase,
    updated_at: timestamp,
    status: nextPhase ? 'active' : 'complete',
    pending_gate_token: null,
    pending_gate_phase: null,
    pending_gate_issued_at: null,
  };

  saveWorkflowState(projectRoot, nextState);
  return nextState;
}
