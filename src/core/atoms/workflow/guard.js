import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { resolveChangePath } from '../../change-artifacts.js';
import { advanceWorkflowState, loadWorkflowState, resolveWorkflowStateFile, saveWorkflowState } from '../../workflow-state.js';

const VALID_ARTIFACT_STATUSES = new Set(['draft', 'ready', 'blocked', 'pass', 'fail', 'done', 'completed', 'accepted', 'needs_human']);

function makeId(prefix) {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

function resolveCommand(input = {}) {
  if (Array.isArray(input.command) && input.command.length > 0) {
    return input.command.map((part) => String(part));
  }
  if (typeof input.command === 'string' && input.command.trim()) {
    return ['sh', '-c', input.command];
  }
  if (Array.isArray(input.commands) && input.commands.length > 0) {
    return input.commands.map((part) => String(part));
  }
  throw new Error('E2.workflow.guard requires a command');
}

function validateArtifact(artifactPath, expectedPhase, gateToken) {
  const raw = readFileSync(artifactPath, 'utf8');
  const artifact = JSON.parse(raw);
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) {
    throw new Error('Workflow artifact must be a JSON object');
  }
  if (artifact.phase !== expectedPhase) {
    throw new Error(`Workflow artifact phase mismatch: expected ${expectedPhase}, got ${String(artifact.phase || '')}`);
  }
  if (!VALID_ARTIFACT_STATUSES.has(String(artifact.status || ''))) {
    throw new Error(`Workflow artifact status must be one of: ${[...VALID_ARTIFACT_STATUSES].join(', ')}`);
  }
  if (typeof artifact.summary !== 'string' || artifact.summary.trim().length === 0) {
    throw new Error('Workflow artifact summary is required');
  }
  if (artifact.gate_token !== gateToken) {
    throw new Error('Workflow artifact gate token mismatch');
  }
  return artifact;
}

export async function workflowGuard(input = {}, context = {}) {
  const projectRoot = context.projectRoot || process.cwd();
  const workflowName = context.workflow?.name || input.workflow || null;
  const changeId = context.changeId || input.change_id || null;
  const phaseOrder = Array.isArray(context.workflow?.phases) ? context.workflow.phases.map((phase) => phase.id) : [];
  const expectedPhase = input.phase || context.phase?.id || null;
  if (!expectedPhase) {
    throw new Error('phase is required for E2.workflow.guard');
  }

  const artifactPath = input.artifact_path
    || (changeId ? resolveChangePath(projectRoot, changeId, `${expectedPhase}.json`) : null);
  if (!artifactPath) {
    throw new Error('artifact_path is required for E2.workflow.guard');
  }

  const command = resolveCommand(input);
  const gateToken = makeId('gt');
  const state = loadWorkflowState(projectRoot, { workflowName, changeId, phaseOrder, currentPhase: expectedPhase });
  if (state.current_phase && state.current_phase !== expectedPhase) {
    throw new Error(`Workflow guard blocked: current phase is ${state.current_phase}, requested ${expectedPhase}`);
  }

  const nextState = {
    ...state,
    workflow: state.workflow || workflowName || null,
    change_id: state.change_id || changeId || null,
    current_phase: state.current_phase || expectedPhase,
    current_artifact_path: artifactPath,
    pending_gate_token: gateToken,
    pending_gate_phase: expectedPhase,
    pending_gate_issued_at: new Date().toISOString(),
  };
  saveWorkflowState(projectRoot, nextState);

  const env = {
    ...process.env,
    AS_XFLOW_WORKFLOW_ID: String(nextState.workflow_id || ''),
    AS_XFLOW_WORKFLOW_PHASE: expectedPhase,
    AS_XFLOW_WORKFLOW_STATE_FILE: resolveWorkflowStateFile(projectRoot),
    AS_XFLOW_WORKFLOW_ARTIFACT_PATH: artifactPath,
    AS_XFLOW_WORKFLOW_GATE_TOKEN: gateToken,
  };

  const result = spawnSync(command[0], command.slice(1), {
    cwd: projectRoot,
    env,
    encoding: 'utf8',
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    return {
      ok: false,
      status: result.status,
      signal: result.signal || null,
      workflow_state: nextState,
    };
  }

  validateArtifact(artifactPath, expectedPhase, gateToken);
  const advanced = advanceWorkflowState(projectRoot, {
    expectedPhase,
    artifactPath,
    workflowName,
    changeId,
    phaseOrder,
  });

  return {
    ok: true,
    status: result.status,
    signal: result.signal || null,
    workflow_state: advanced,
    artifact_path: artifactPath,
  };
}
