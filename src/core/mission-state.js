import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

function ensureArray(value) {
  if (Array.isArray(value)) {
    return value.filter((item) => item !== undefined && item !== null && item !== '');
  }
  if (value === undefined || value === null || value === '') {
    return [];
  }
  return [value];
}

function unique(values) {
  return [...new Set(ensureArray(values))];
}

function cleanObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(Object.entries(value).filter(([, entryValue]) => entryValue !== undefined));
}

function normalizeParallelBudget(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`Invalid parallel budget override: ${String(value)}`);
  }
  return Math.floor(parsed);
}

function normalizeMissionType(value) {
  const allowed = [
    'primary_execution',
    'cleanup_followup',
    'hygiene_followup',
    'gate_rerun',
    'verification',
  ];
  return allowed.includes(value) ? value : 'primary_execution';
}

function resolveWorkspaceRoot(repoRef) {
  const trimmed = String(repoRef || '').trim();
  if (!trimmed) {
    return null;
  }

  const absolute = resolve(trimmed);
  return existsSync(absolute) ? absolute : null;
}

function listCurrentGateDecisions(state, missionId = null) {
  return ensureArray(state.gate_decisions).filter((decision) => {
    if (decision.is_current === false) {
      return false;
    }
    return missionId ? decision.mission_id === missionId || decision.target_id === missionId : true;
  });
}

export function computeMissionStatus(state, missionId, fallback = 'running') {
  const tasks = ensureArray(state.tasks).filter((task) => task.mission_id === missionId);
  const gates = listCurrentGateDecisions(state, missionId);
  const reruns = ensureArray(state.reruns).filter((rerun) => rerun.mission_id === missionId);

  if (tasks.some((task) => task.status === 'waiting_human')) return 'needs_human';
  if (gates.some((gate) => gate.result === 'needs_human')) return 'needs_human';
  if (reruns.some((rerun) => ['requested', 'running', 'cancel_requested'].includes(rerun.status))) return 'running';
  if (tasks.some((task) => task.status === 'waiting_gate')) return 'gated';
  if (gates.some((gate) => gate.result === 'fail' || gate.decision_status === 'rerun_requested')) return 'gated';
  if (reruns.some((rerun) => rerun.status === 'failed')) return 'blocked';
  if (reruns.some((rerun) => rerun.status === 'canceled')) return 'recovering';
  if (tasks.some((task) => task.status === 'failed')) return 'blocked';
  if (tasks.some((task) => task.status === 'retrying')) return 'recovering';
  if (tasks.some((task) => ['running', 'ready', 'queued', 'waiting_dependency'].includes(task.status))) return 'running';
  if (tasks.length > 0 && tasks.every((task) => ['passed', 'canceled'].includes(task.status))) {
    return fallback === 'archived' ? 'archived' : 'completed';
  }
  return fallback;
}

function requireMission(state, missionId) {
  const mission = ensureArray(state.missions).find((entry) => entry.mission_id === missionId);
  if (!mission) {
    throw new Error(`Mission not found: ${missionId}`);
  }
  return mission;
}

function ensureStateCollection(state, key) {
  state[key] = ensureArray(state[key]);
  return state[key];
}

function listMissionScoped(state, key, missionId) {
  return ensureArray(state[key]).filter((entry) => entry.mission_id === missionId);
}

function derivePhaseRunSessionStatus(session, timestamp = nowIso()) {
  if (!session || typeof session !== 'object') {
    return 'unknown';
  }
  if (session.status !== 'running') {
    return session.status || 'unknown';
  }
  if (!session.timeout_at) {
    return 'running';
  }
  return String(session.timeout_at).localeCompare(timestamp) < 0 ? 'orphaned' : 'running';
}

function enrichPhaseRunSession(session, timestamp = nowIso()) {
  return {
    ...session,
    derived_status: derivePhaseRunSessionStatus(session, timestamp),
  };
}

function upsertPhaseRunSession(state, nextSession) {
  state.phase_run_sessions = ensureArray(state.phase_run_sessions);
  const existingIndex = state.phase_run_sessions.findIndex((entry) => entry.session_id === nextSession.session_id);
  if (existingIndex >= 0) {
    state.phase_run_sessions[existingIndex] = nextSession;
  } else {
    state.phase_run_sessions.unshift(nextSession);
  }
  return nextSession;
}

export function listPhaseRunSessions(state, missionId = null) {
  const timestamp = nowIso();
  const sessions = missionId
    ? ensureArray(state.phase_run_sessions).filter((entry) => entry.mission_id === missionId)
    : ensureArray(state.phase_run_sessions);

  return sessions
    .map((session) => enrichPhaseRunSession(session, timestamp))
    .sort((left, right) => String(right.updated_at || right.started_at).localeCompare(String(left.updated_at || left.started_at)));
}

export function findPhaseRunSession(state, missionId, sessionId = null) {
  if (sessionId) {
    return ensureArray(state.phase_run_sessions).find(
      (entry) => entry.mission_id === missionId && entry.session_id === sessionId,
    ) || null;
  }

  const sessions = ensureArray(state.phase_run_sessions)
    .filter((entry) => entry.mission_id === missionId)
    .sort((left, right) => String(right.updated_at || right.started_at).localeCompare(String(left.updated_at || left.started_at)));

  return sessions.find((entry) => entry.status === 'running')
    || sessions[0]
    || null;
}

function buildCurrentPhase(phaseRuns = []) {
  const latestPhaseRun = phaseRuns[0] || null;
  if (!latestPhaseRun) {
    return null;
  }
  return ensureArray(latestPhaseRun.executed_phases).slice(-1)[0]
    || ensureArray(latestPhaseRun.phases).slice(-1)[0]?.phase
    || null;
}

function buildPhaseOverview(phaseRuns = []) {
  const grouped = new Map();

  for (const phaseRun of phaseRuns) {
    for (const phase of ensureArray(phaseRun.phases)) {
      const current = grouped.get(phase.phase) || [];
      current.push({
        phase_run_id: phaseRun.phase_run_id,
        phase,
        status: phase.status,
        effective_status: phase.effective_status || phase.status,
        updated_at: phase.updated_at || phaseRun.completed_at || phaseRun.updated_at || phaseRun.started_at,
      });
      grouped.set(phase.phase, current);
    }
  }

  return [...grouped.entries()].map(([phase, entries]) => {
    const latest = [...entries].sort((left, right) => String(right.updated_at).localeCompare(String(left.updated_at)))[0];
    return {
      phase,
      latest_result: latest.effective_status,
      latest_status: latest.status,
      latest_phase_run_id: latest.phase_run_id,
      updated_at: latest.updated_at,
    };
  });
}

export function createMission(state, request = {}) {
  const timestamp = nowIso();
  const goal = String(request.goal ?? '').trim();
  if (!goal) {
    throw new Error('Mission goal is required');
  }

  const missionType = normalizeMissionType(request.mission_type);
  const epicId = String(request.epic_id || makeId('epc'));
  const epicGoal = String(request.epic_goal || goal).trim() || goal;
  const repoRef = String(request.repo_ref || request.repoRef || request.workspace || '').trim() || null;

  const mission = {
    mission_id: makeId('mis'),
    goal,
    epic_id: epicId,
    epic_goal: epicGoal,
    mission_type: missionType,
    workspace_id: request.workspace_id || request.workspaceId || 'default-workspace',
    repo_ref: repoRef,
    workspace_root: resolveWorkspaceRoot(repoRef),
    intake_snapshot: request.intake_snapshot ?? null,
    constraints: cleanObject(request.constraints ?? {}),
    runtime_context: cleanObject(request.runtime_context ?? {}),
    requested_gates: unique(request.requested_gates ?? []),
    priority: request.priority || 'normal',
    status: 'running',
    success_criteria: ensureArray(request.success_criteria),
    human_owner: request.human_owner || null,
    created_at: timestamp,
    updated_at: timestamp,
  };

  state.missions.unshift(mission);

  const startEvent = {
    event_id: makeId('evt'),
    mission_id: mission.mission_id,
    task_id: null,
    type: 'mission_started',
    timestamp,
    payload: {
      goal: mission.goal,
      requested_gates: mission.requested_gates,
    },
    runtime_context: mission.runtime_context,
  };

  state.events.push(startEvent);

  return {
    mission,
    replay_event: startEvent,
  };
}

export function ingestEvent(state, input = {}) {
  const mission = requireMission(state, input.mission_id);
  const timestamp = nowIso();
  const payload = cleanObject(input.payload ?? {});
  const event = {
    event_id: makeId('evt'),
    mission_id: mission.mission_id,
    task_id: input.task_id || payload.task?.task_id || null,
    type: String(input.type || '').trim() || 'event',
    timestamp,
    payload,
    runtime_context: cleanObject(input.runtime_context ?? mission.runtime_context),
  };

  state.events.push(event);

  if (event.type === 'task_started' && payload.task?.task_id) {
    state.tasks = ensureArray(state.tasks);
    const existingIndex = state.tasks.findIndex((task) => task.task_id === payload.task.task_id);
    const nextTask = {
      task_id: payload.task.task_id,
      mission_id: mission.mission_id,
      type: payload.task.type || 'task',
      status: 'running',
      input: cleanObject(payload.task.input),
      expected_output: payload.task.expected_output || null,
      owner_agent_id: payload.task.owner_agent_id || null,
      checkpoint_ref: payload.task.checkpoint_ref || null,
      artifacts: ensureArray(payload.task.artifacts),
      created_at: existingIndex >= 0 ? state.tasks[existingIndex].created_at : timestamp,
      updated_at: timestamp,
    };
    if (existingIndex >= 0) {
      state.tasks[existingIndex] = { ...state.tasks[existingIndex], ...nextTask };
    } else {
      state.tasks.unshift(nextTask);
    }
  }

  if (event.task_id && ['critical_path_succeeded', 'command_failed', 'gate_result'].includes(event.type)) {
    const task = ensureArray(state.tasks).find((entry) => entry.task_id === event.task_id);
    if (task) {
      task.status = event.type === 'command_failed'
        ? 'failed'
        : event.type === 'gate_result' && payload.result !== 'pass'
          ? 'waiting_gate'
          : 'passed';
      task.updated_at = timestamp;
    }
  }

  let gateDecision = null;
  if (event.type === 'gate_result') {
    state.gate_decisions = ensureArray(state.gate_decisions);
    gateDecision = {
      gate_id: makeId('gate'),
      mission_id: mission.mission_id,
      target_id: mission.mission_id,
      task_id: event.task_id,
      gate_type: payload.gate_type || 'gate',
      result: payload.result || 'needs_human',
      original_result: payload.result || 'needs_human',
      rationale: payload.rationale || '',
      evidence_refs: ensureArray(payload.evidence_refs),
      generated_actions: ensureArray(payload.generated_actions),
      structured_payload: cleanObject(payload.structured_payload),
      decision_status: 'active',
      override_count: 0,
      rerun_requests: 0,
      is_current: true,
      history: [],
      created_at: timestamp,
      updated_at: timestamp,
    };
    state.gate_decisions.push(gateDecision);
  }

  mission.updated_at = timestamp;
  mission.status = computeMissionStatus(state, mission.mission_id, mission.status);

  return {
    event,
    mission,
    task: event.task_id ? ensureArray(state.tasks).find((entry) => entry.task_id === event.task_id) || null : null,
    gate_decision: gateDecision,
  };
}

export function createIntervention(state, missionId, input = {}) {
  const mission = requireMission(state, missionId);
  const timestamp = nowIso();
  const intervention = {
    intervention_id: makeId('int'),
    mission_id: mission.mission_id,
    action: input.action || 'note',
    note: input.note || '',
    requested_by: input.requested_by || 'human:control-plane',
    memory_ids: unique(input.memory_ids ?? []),
    metadata: cleanObject(input.metadata),
    status: 'applied',
    created_at: timestamp,
    updated_at: timestamp,
  };

  state.interventions = ensureArray(state.interventions);
  state.interventions.push(intervention);

  const event = {
    event_id: makeId('evt'),
    mission_id: mission.mission_id,
    task_id: null,
    type: 'human_intervened',
    timestamp,
    payload: {
      action: intervention.action,
      note: intervention.note,
      requested_by: intervention.requested_by,
    },
    runtime_context: mission.runtime_context,
  };

  state.events.push(event);
  mission.updated_at = timestamp;

  return {
    intervention,
    event,
    mission,
  };
}

export function listOperatorActions(state, missionId = null) {
  const entries = missionId ? listMissionScoped(state, 'operator_actions', missionId) : ensureArray(state.operator_actions);
  return [...entries].sort((left, right) => String(right.updated_at || right.created_at || '').localeCompare(String(left.updated_at || left.created_at || '')));
}

export function createOperatorAction(state, missionId, input = {}) {
  const mission = requireMission(state, missionId);
  const timestamp = nowIso();
  const action = {
    action_id: makeId('act'),
    mission_id: missionId,
    kind: input.kind || input.action || 'operator_action',
    target_type: input.target_type || 'mission',
    target_id: input.target_id || missionId,
    payload: cleanObject(input.payload),
    note: input.note || '',
    requested_by: input.requested_by || 'human:control-plane',
    status: input.status || 'applied',
    created_at: timestamp,
    updated_at: timestamp,
  };

  ensureStateCollection(state, 'operator_actions').push(action);
  state.events.push({
    event_id: makeId('evt'),
    mission_id: missionId,
    task_id: null,
    type: 'operator_action_applied',
    timestamp,
    payload: {
      kind: action.kind,
      target_type: action.target_type,
      target_id: action.target_id,
      status: action.status,
    },
    runtime_context: mission.runtime_context,
  });
  mission.updated_at = timestamp;
  return action;
}

export function getMissionControl(state, missionId) {
  requireMission(state, missionId);
  return ensureArray(state.mission_controls).find((entry) => entry.mission_id === missionId) || null;
}

export function setMissionControl(state, missionId, input = {}) {
  const mission = requireMission(state, missionId);
  const timestamp = nowIso();
  const next = {
    mission_id: missionId,
    parallel_budget_override: normalizeParallelBudget(input.parallel_budget_override),
    note: input.note || '',
    updated_by: input.updated_by || input.requested_by || 'human:control-plane',
    updated_at: timestamp,
  };
  ensureStateCollection(state, 'mission_controls');
  const existingIndex = state.mission_controls.findIndex((entry) => entry.mission_id === missionId);
  if (existingIndex >= 0) {
    state.mission_controls[existingIndex] = { ...state.mission_controls[existingIndex], ...next };
  } else {
    state.mission_controls.unshift(next);
  }
  mission.updated_at = timestamp;
  return state.mission_controls[existingIndex >= 0 ? existingIndex : 0];
}

export function listReruns(state, missionId = null) {
  const entries = missionId ? listMissionScoped(state, 'reruns', missionId) : ensureArray(state.reruns);
  return [...entries].sort((left, right) => String(right.updated_at || right.requested_at || '').localeCompare(String(left.updated_at || left.requested_at || '')));
}

export function getRerun(state, missionId, rerunId) {
  requireMission(state, missionId);
  return ensureArray(state.reruns).find((entry) => entry.mission_id === missionId && entry.rerun_id === rerunId) || null;
}

export function createRerun(state, missionId, input = {}) {
  const mission = requireMission(state, missionId);
  const timestamp = nowIso();
  const rerun = {
    rerun_id: makeId('rrn'),
    mission_id: missionId,
    source_rerun_id: input.source_rerun_id || null,
    workflow_path: input.workflow_path || null,
    project_root: input.project_root || mission.workspace_root || mission.repo_ref || null,
    change_id: input.change_id || null,
    phase_id: input.phase_id || null,
    atom_id: input.atom_id || null,
    mode: input.atom_id ? 'atom' : 'phase',
    continue_strategy: input.continue_strategy || 'phase_forward',
    requested_by: input.requested_by || 'human:control-plane',
    request_note: input.request_note || input.note || '',
    status: input.status || 'requested',
    validation: cleanObject(input.validation),
    budget_override: normalizeParallelBudget(input.budget_override),
    action_id: input.action_id || null,
    run_key: input.run_key || null,
    workflow_run: cleanObject(input.workflow_run),
    error: input.error || null,
    requested_at: timestamp,
    started_at: input.started_at || null,
    finished_at: input.finished_at || null,
    updated_at: timestamp,
  };
  ensureStateCollection(state, 'reruns').unshift(rerun);
  mission.updated_at = timestamp;
  return rerun;
}

export function updateRerun(state, missionId, rerunId, patch = {}) {
  const mission = requireMission(state, missionId);
  ensureStateCollection(state, 'reruns');
  const index = state.reruns.findIndex((entry) => entry.mission_id === missionId && entry.rerun_id === rerunId);
  if (index < 0) {
    throw new Error(`Rerun not found: ${rerunId}`);
  }
  const current = state.reruns[index];
  const next = {
    ...current,
    ...cleanObject(patch),
    budget_override: patch.budget_override === undefined ? current.budget_override : normalizeParallelBudget(patch.budget_override),
    workflow_run: patch.workflow_run === undefined ? current.workflow_run : cleanObject(patch.workflow_run),
    validation: patch.validation === undefined ? current.validation : cleanObject(patch.validation),
    updated_at: nowIso(),
  };
  state.reruns[index] = next;
  mission.updated_at = next.updated_at;
  return next;
}

function buildMissionTimeline({ replay = [], interventions = [], operatorActions = [], reruns = [], phaseRuns = [], phaseRunSessions = [] }) {
  const entries = [];

  for (const event of replay) {
    entries.push({ kind: 'event', timestamp: event.timestamp || null, data: event });
  }
  for (const intervention of interventions) {
    entries.push({ kind: 'intervention', timestamp: intervention.updated_at || intervention.created_at || null, data: intervention });
  }
  for (const action of operatorActions) {
    entries.push({ kind: 'operator_action', timestamp: action.updated_at || action.created_at || null, data: action });
  }
  for (const rerun of reruns) {
    entries.push({ kind: 'rerun', timestamp: rerun.updated_at || rerun.requested_at || null, data: rerun });
  }
  for (const phaseRun of phaseRuns) {
    entries.push({ kind: 'phase_run', timestamp: phaseRun.updated_at || phaseRun.completed_at || phaseRun.started_at || null, data: phaseRun });
  }
  for (const session of phaseRunSessions) {
    entries.push({ kind: 'phase_run_session', timestamp: session.updated_at || session.completed_at || session.started_at || null, data: session });
  }

  return entries.sort((left, right) => String(right.timestamp || '').localeCompare(String(left.timestamp || '')));
}

export function listMissions(state) {
  return ensureArray(state.missions)
    .map((mission) => ({
      ...mission,
      status: computeMissionStatus(state, mission.mission_id, mission.status),
    }))
    .sort((left, right) => String(right.updated_at || right.created_at).localeCompare(String(left.updated_at || left.created_at)));
}

export function getMissionDetail(state, missionId) {
  const mission = requireMission(state, missionId);
  const gateDecisions = ensureArray(state.gate_decisions)
    .filter((decision) => decision.mission_id === missionId || decision.target_id === missionId)
    .sort((left, right) => String(right.updated_at || right.created_at || '').localeCompare(String(left.updated_at || left.created_at || '')));
  const phaseRuns = ensureArray(state.phase_runs)
    .filter((phaseRun) => phaseRun.mission_id === missionId)
    .sort((left, right) => String(right.completed_at || right.started_at).localeCompare(String(left.completed_at || left.started_at)));
  const phaseRunSessions = listPhaseRunSessions(state, missionId);
  const replay = ensureArray(state.events)
    .filter((event) => event.mission_id === missionId)
    .sort((left, right) => String(left.timestamp || '').localeCompare(String(right.timestamp || '')));
  const interventions = ensureArray(state.interventions)
    .filter((intervention) => intervention.mission_id === missionId)
    .sort((left, right) => String(right.updated_at || right.created_at || '').localeCompare(String(left.updated_at || left.created_at || '')));
  const operatorActions = listOperatorActions(state, missionId);
  const reruns = listReruns(state, missionId);
  const missionControl = getMissionControl(state, missionId);
  const phaseOverview = buildPhaseOverview(phaseRuns);
  const timeline = buildMissionTimeline({
    replay,
    interventions,
    operatorActions,
    reruns,
    phaseRuns,
    phaseRunSessions,
  });

  return {
    mission: {
      ...mission,
      status: computeMissionStatus(state, missionId, mission.status),
    },
    tasks: ensureArray(state.tasks).filter((task) => task.mission_id === missionId),
    replay,
    gate_decisions: gateDecisions,
    phase_runs: phaseRuns,
    phase_run_sessions: phaseRunSessions,
    phase_overview: phaseOverview,
    reruns,
    operator_actions: operatorActions,
    controls: missionControl,
    timeline,
    execution_overview: {
      total_phase_runs: phaseRuns.length,
      latest_phase_run_id: phaseRuns[0]?.phase_run_id || null,
      latest_phase_run_status: phaseRuns[0]?.status || phaseRunSessions[0]?.derived_status || null,
      latest_phase_run_summary: phaseRuns[0]?.summary || phaseRunSessions[0]?.summary || null,
      latest_phase_run_session_id: phaseRunSessions[0]?.session_id || null,
      current_phase: buildCurrentPhase(phaseRuns),
    },
    interventions,
  };
}

export function startPhaseRunSession(state, missionId, input = {}) {
  const mission = requireMission(state, missionId);
  const timestamp = nowIso();
  const requestedSessionId = String(input.session_id || '').trim();
  const existing = ensureArray(state.phase_run_sessions).find(
    (entry) => entry.mission_id === missionId && entry.session_id === requestedSessionId,
  );
  const timeoutSeconds = Math.max(1, Number(input.timeout_seconds || 900));
  const startedAt = existing?.started_at || timestamp;
  const timeoutAt = new Date(Date.parse(startedAt) + (timeoutSeconds * 1000)).toISOString();
  const session = {
    ...existing,
    session_id: requestedSessionId || existing?.session_id || makeId('prs'),
    mission_id: missionId,
    task_id: input.task_id || existing?.task_id || null,
    phase_run_id: input.phase_run_id || existing?.phase_run_id || null,
    summary: input.summary || mission.goal,
    task_type: input.task_type || 'auto',
    requested_phases: ensureArray(input.phases).length ? ensureArray(input.phases) : ensureArray(existing?.requested_phases),
    requested_cost_mode: input.requested_cost_mode || input.cost_mode || existing?.requested_cost_mode || 'single-agent',
    effective_cost_mode: input.effective_cost_mode || input.cost_mode || existing?.effective_cost_mode || 'single-agent',
    phase_policy: input.phase_policy || existing?.phase_policy || 'adaptive',
    workflow_mode: input.workflow_mode || existing?.workflow_mode || 'queued',
    workflow_reason: input.workflow_reason || existing?.workflow_reason || null,
    timeout_seconds: timeoutSeconds,
    timeout_at: timeoutAt,
    dry_run: Boolean(input.dry_run),
    status: 'running',
    failure: null,
    stop_reason: existing?.stop_reason || null,
    started_at: startedAt,
    completed_at: null,
    updated_at: timestamp,
  };

  mission.updated_at = timestamp;
  return upsertPhaseRunSession(state, session);
}

export function persistPhaseRun(state, missionId, phaseRunInput = {}) {
  const mission = requireMission(state, missionId);
  const timestamp = nowIso();
  const phaseRunId = String(phaseRunInput.phase_run_id || makeId('phr'));
  const phaseRun = {
    mission_id: missionId,
    phase_run_id: phaseRunId,
    phase_run_file: phaseRunInput.phase_run_file || null,
    summary: phaseRunInput.summary || mission.goal,
    task_type: phaseRunInput.task_type || 'auto',
    cost_mode: phaseRunInput.cost_mode || 'single-agent',
    requested_cost_mode: phaseRunInput.requested_cost_mode || phaseRunInput.cost_mode || 'single-agent',
    status: phaseRunInput.status || 'needs_human',
    stop_reason: phaseRunInput.stop_reason || '',
    phase_policy: phaseRunInput.phase_policy || 'adaptive',
    max_phase_visits: Number(phaseRunInput.max_phase_visits || 2),
    intake_snapshot: phaseRunInput.intake_snapshot ?? null,
    context_map: phaseRunInput.context_map ?? null,
    execution_provenance: phaseRunInput.execution_provenance ?? null,
    acceptance_trust: phaseRunInput.acceptance_trust ?? null,
    deployed_artifact: phaseRunInput.deployed_artifact ?? null,
    deployed_url: phaseRunInput.deployed_url ?? null,
    workspace_evidence: phaseRunInput.workspace_evidence ?? null,
    workflow_mode: phaseRunInput.workflow_mode || 'standard',
    workflow_reason: phaseRunInput.workflow_reason || null,
    workflow_selection_mode: phaseRunInput.workflow_selection_mode || null,
    workflow_selection_score: phaseRunInput.workflow_selection_score ?? null,
    workflow_selection_reasons: ensureArray(phaseRunInput.workflow_selection_reasons),
    workflow_selection_category: phaseRunInput.workflow_selection_category || null,
    workflow_selection_reason: phaseRunInput.workflow_selection_reason || null,
    fast_lane_eligible: Boolean(phaseRunInput.fast_lane_eligible),
    fast_lane_taken: Boolean(phaseRunInput.fast_lane_taken),
    fast_lane_escalated: Boolean(phaseRunInput.fast_lane_escalated),
    fast_lane_escalation_reason: phaseRunInput.fast_lane_escalation_reason || null,
    phases: ensureArray(phaseRunInput.phases),
    phase_health_checks: ensureArray(phaseRunInput.phase_health_checks),
    phase_count: Number(phaseRunInput.phase_count || ensureArray(phaseRunInput.phases).length),
    executed_phases: ensureArray(phaseRunInput.executed_phases),
    dry_run: Boolean(phaseRunInput.dry_run),
    started_at: phaseRunInput.started_at || timestamp,
    completed_at: phaseRunInput.completed_at ?? (phaseRunInput.status === 'running' ? null : timestamp),
    updated_at: timestamp,
  };

  state.phase_runs = ensureArray(state.phase_runs);
  const existingIndex = state.phase_runs.findIndex(
    (entry) => entry.phase_run_id === phaseRun.phase_run_id && entry.mission_id === missionId,
  );
  if (existingIndex >= 0) {
    state.phase_runs[existingIndex] = phaseRun;
  } else {
    state.phase_runs.unshift(phaseRun);
  }

  const candidateSession = findPhaseRunSession(state, missionId, phaseRunInput.session_id || null);
  if (candidateSession) {
    upsertPhaseRunSession(state, {
      ...candidateSession,
      phase_run_id: phaseRun.phase_run_id,
      updated_at: timestamp,
    });
  }

  if (existingIndex < 0) {
    state.events.push({
      event_id: makeId('evt'),
      mission_id: missionId,
      task_id: null,
      type: 'workflow_selection_determined',
      timestamp,
      payload: {
        phase_run_id: phaseRun.phase_run_id,
        summary: phaseRun.summary,
        task_type: phaseRun.task_type,
        phase_policy: phaseRun.phase_policy,
        cost_mode: phaseRun.cost_mode,
      },
      runtime_context: mission.runtime_context,
    });
  }

  mission.updated_at = timestamp;
  return phaseRun;
}

export function completePhaseRunSession(state, missionId, sessionId, phaseRun = {}) {
  requireMission(state, missionId);
  const existing = ensureArray(state.phase_run_sessions).find(
    (entry) => entry.mission_id === missionId && entry.session_id === sessionId,
  );
  if (!existing) {
    return null;
  }

  const timestamp = nowIso();
  return upsertPhaseRunSession(state, {
    ...existing,
    phase_run_id: phaseRun.phase_run_id || existing.phase_run_id || null,
    status: phaseRun.status || 'completed',
    stop_reason: phaseRun.stop_reason || null,
    failure: null,
    completed_at: phaseRun.completed_at || timestamp,
    updated_at: timestamp,
  });
}

export function failPhaseRunSession(state, missionId, sessionId, failure = {}) {
  requireMission(state, missionId);
  const existing = ensureArray(state.phase_run_sessions).find(
    (entry) => entry.mission_id === missionId && entry.session_id === sessionId,
  );
  if (!existing) {
    return null;
  }

  const timestamp = nowIso();
  return upsertPhaseRunSession(state, {
    ...existing,
    status: 'failed',
    stop_reason: failure.summary || existing.stop_reason || 'phase_run_failed',
    failure: cleanObject(failure),
    completed_at: timestamp,
    updated_at: timestamp,
  });
}
