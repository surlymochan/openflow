import { createServer } from 'node:http';
import { URL } from 'node:url';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createIntervention,
  createOperatorAction,
  createRerun,
  createMission,
  getMissionControl,
  getMissionDetail,
  getRerun,
  listMissions,
  startPhaseRunSession,
  persistPhaseRun,
  completePhaseRunSession,
  findPhaseRunSession,
  listReruns,
  setMissionControl,
  updateRerun,
} from './core/mission-state.js';
import { mutateStore, readStore, resolveDataFile } from './core/state-store.js';
import { readExecutionLog, resolveExecutionLogPath } from './core/execution-log.js';
import { ackPendingGate, listPendingGates } from './core/pending-gates.js';
import { prepareWorkflowRerun } from './core/workflow-rerun.js';
import { readBinding } from './core/bindings.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const activeWorkflowRuns = new Map();

function resolveActiveRunsPath(projectRoot) {
  return resolve(projectRoot, '.as-xflow', 'active-runs.json');
}

function serializeWorkflowRun(entry = {}) {
  return {
    pid: entry.pid || null,
    workflow_path: entry.workflow_path,
    project_root: entry.project_root,
    change_id: entry.change_id || null,
    mission_id: entry.mission_id || null,
    rerun_id: entry.rerun_id || null,
    max_parallel_agents: entry.max_parallel_agents || null,
    launched_at: entry.launched_at || null,
    finished_at: entry.finished_at || null,
    exit_code: entry.exit_code ?? null,
    error: entry.error || null,
    cancel_requested: Boolean(entry.cancel_requested),
    orphaned: Boolean(entry.orphaned),
    recovered_at: entry.recovered_at || null,
  };
}

function persistActiveWorkflowRuns(projectRoot) {
  const file = resolveActiveRunsPath(projectRoot);
  mkdirSync(dirname(file), { recursive: true });
  const runs = [...activeWorkflowRuns.values()]
    .filter((entry) => entry.project_root === projectRoot)
    .map((entry) => serializeWorkflowRun(entry));
  writeFileSync(file, `${JSON.stringify({ version: 1, runs }, null, 2)}\n`, 'utf8');
  return file;
}

function findActiveWorkflowRunsForRerun(missionId, rerunId) {
  return [...activeWorkflowRuns.entries()]
    .filter(([, entry]) => entry.mission_id === missionId && entry.rerun_id === rerunId)
    .map(([key, entry]) => ({ key, entry }));
}

function clearActiveWorkflowRunsForRerun({ projectRoot, missionId, rerunId }) {
  const matches = findActiveWorkflowRunsForRerun(missionId, rerunId);
  const touchedRoots = new Set([projectRoot]);
  for (const { key, entry } of matches) {
    if (entry.project_root) {
      touchedRoots.add(entry.project_root);
    }
    activeWorkflowRuns.delete(key);
  }
  for (const root of touchedRoots) {
    persistActiveWorkflowRuns(root);
  }
  return matches.map(({ entry }) => serializeWorkflowRun(entry));
}

function loadPersistedActiveWorkflowRuns(projectRoot) {
  const file = resolveActiveRunsPath(projectRoot);
  if (!existsSync(file)) {
    return [];
  }
  try {
    const payload = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(payload.runs) ? payload.runs : [];
  } catch {
    return [];
  }
}

async function hydrateActiveWorkflowRuns(projectRoot, dataFile) {
  const recoveredAt = new Date().toISOString();
  const persistedRuns = loadPersistedActiveWorkflowRuns(projectRoot);
  const orphaned = [];
  for (const persistedRun of persistedRuns) {
    const record = {
      ...serializeWorkflowRun(persistedRun),
      orphaned: persistedRun.exit_code === null ? true : Boolean(persistedRun.orphaned),
      recovered_at: persistedRun.exit_code === null ? recoveredAt : persistedRun.recovered_at || null,
      abort_controller: undefined,
    };
    const runKey = buildWorkflowRunKey(record);
    activeWorkflowRuns.set(runKey, record);
    if (record.orphaned && record.mission_id && record.rerun_id) {
      orphaned.push(record);
    }
  }
  if (orphaned.length > 0) {
    await mutateStore((mutableState) => {
      for (const record of orphaned) {
        updateRerun(mutableState, record.mission_id, record.rerun_id, {
          status: 'orphaned',
          error: 'Workflow run was active when the control-plane server restarted; retry or resume is required.',
          workflow_run: serializeWorkflowRun(record),
        });
      }
    }, dataFile);
    persistActiveWorkflowRuns(projectRoot);
  }
  return orphaned;
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function sendHtml(response, statusCode, html) {
  response.writeHead(statusCode, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(html);
}

function sendEvent(response, event, payload) {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw ? JSON.parse(raw) : {};
}

function deriveParallelSummary(entries = []) {
  const latestWorkflowStart = entries.find((entry) => entry.kind === 'workflow_started') || null;
  return {
    max_parallel_agents: latestWorkflowStart?.max_parallel_agents || 3,
    policy: latestWorkflowStart?.parallel_policy || 'fixed',
    source: latestWorkflowStart?.parallel_source || 'default',
    source_workflow: latestWorkflowStart?.workflow || null,
  };
}

function deriveExecutionSummary(entries = []) {
  const latestWorkflowStart = entries.find((entry) => entry.kind === 'workflow_started') || null;
  const latestWorkflowEnd = entries.find((entry) => ['workflow_completed', 'workflow_failed'].includes(entry.kind)) || null;
  return {
    workflow: latestWorkflowStart?.workflow || null,
    change_id: latestWorkflowStart?.change_id || null,
    rerun_phase: latestWorkflowStart?.rerun_phase || null,
    rerun_atom: latestWorkflowStart?.rerun_atom || null,
    status: latestWorkflowEnd?.kind === 'workflow_failed' ? 'failed' : latestWorkflowEnd ? 'completed' : latestWorkflowStart ? 'running' : 'idle',
  };
}

function deriveMetricsSummary(entries = []) {
  const atomRuns = entries.filter((entry) => entry.kind === 'atom_run');
  const durations = atomRuns
    .map((entry) => Number(entry.duration_ms))
    .filter((duration) => Number.isFinite(duration) && duration >= 0);
  const adapterCounts = atomRuns.reduce((acc, entry) => {
    const adapter = entry.adapter || 'unknown';
    acc[adapter] = (acc[adapter] || 0) + 1;
    return acc;
  }, {});
  const failedAtomRuns = atomRuns.filter((entry) => entry.ok === false || entry.exit_code > 0).length;

  return {
    atom_runs: atomRuns.length,
    failed_atom_runs: failedAtomRuns,
    avg_atom_duration_ms: durations.length > 0
      ? Math.round(durations.reduce((sum, duration) => sum + duration, 0) / durations.length)
      : null,
    adapter_counts: adapterCounts,
  };
}

function incrementCounter(counter, key) {
  const normalizedKey = key || 'unknown';
  counter[normalizedKey] = (counter[normalizedKey] || 0) + 1;
}

function deriveTimelineAnalytics(timeline = []) {
  const analytics = {
    total_events: timeline.length,
    by_kind: {},
    time_range: {
      first_seen_at: null,
      last_seen_at: null,
    },
    events: {
      total: 0,
      by_type: {},
    },
    interventions: {
      total: 0,
      by_action: {},
      status_counts: {},
    },
    operator_actions: {
      total: 0,
      by_kind: {},
      status_counts: {},
    },
    reruns: {
      total: 0,
      status_counts: {},
      mode_counts: {},
    },
    phase_runs: {
      total: 0,
      status_counts: {},
      effective_status_counts: {},
      phase_counts: {},
    },
    phase_run_sessions: {
      total: 0,
      status_counts: {},
      derived_status_counts: {},
      workflow_mode_counts: {},
    },
  };
  const timestamps = [];

  for (const entry of timeline) {
    const kind = entry?.kind || 'unknown';
    const data = entry?.data || {};
    incrementCounter(analytics.by_kind, kind);
    if (entry?.timestamp) {
      timestamps.push(entry.timestamp);
    }

    if (kind === 'event') {
      analytics.events.total += 1;
      incrementCounter(analytics.events.by_type, data.type);
    } else if (kind === 'intervention') {
      analytics.interventions.total += 1;
      incrementCounter(analytics.interventions.by_action, data.action);
      incrementCounter(analytics.interventions.status_counts, data.status);
    } else if (kind === 'operator_action') {
      analytics.operator_actions.total += 1;
      incrementCounter(analytics.operator_actions.by_kind, data.kind);
      incrementCounter(analytics.operator_actions.status_counts, data.status);
    } else if (kind === 'rerun') {
      analytics.reruns.total += 1;
      incrementCounter(analytics.reruns.status_counts, data.status);
      incrementCounter(analytics.reruns.mode_counts, data.mode);
    } else if (kind === 'phase_run') {
      analytics.phase_runs.total += 1;
      incrementCounter(analytics.phase_runs.status_counts, data.status);
      for (const phase of Array.isArray(data.phases) ? data.phases : []) {
        incrementCounter(analytics.phase_runs.phase_counts, phase.phase);
        incrementCounter(analytics.phase_runs.effective_status_counts, phase.effective_status || phase.status);
      }
    } else if (kind === 'phase_run_session') {
      analytics.phase_run_sessions.total += 1;
      incrementCounter(analytics.phase_run_sessions.status_counts, data.status);
      incrementCounter(analytics.phase_run_sessions.derived_status_counts, data.derived_status);
      incrementCounter(analytics.phase_run_sessions.workflow_mode_counts, data.workflow_mode);
    }
  }

  timestamps.sort();
  analytics.time_range.first_seen_at = timestamps[0] || null;
  analytics.time_range.last_seen_at = timestamps[timestamps.length - 1] || null;
  return analytics;
}

function listActiveWorkflowRuns(projectRoot = null) {
  const values = [...activeWorkflowRuns.values()]
    .filter((entry) => (projectRoot ? entry.project_root === projectRoot : true))
    .map((entry) => ({
      mission_id: entry.mission_id || null,
      rerun_id: entry.rerun_id || null,
      workflow_path: entry.workflow_path,
      change_id: entry.change_id || null,
      max_parallel_agents: entry.max_parallel_agents || null,
      status: entry.orphaned ? 'orphaned' : entry.exit_code === null ? (entry.cancel_requested ? 'cancel_requested' : 'running') : entry.exit_code === 0 ? 'completed' : entry.error === 'Workflow execution canceled' ? 'canceled' : 'failed',
      launched_at: entry.launched_at,
      finished_at: entry.finished_at || null,
      error: entry.error || null,
      recovered_at: entry.recovered_at || null,
    }))
    .sort((left, right) => String(right.launched_at || '').localeCompare(String(left.launched_at || '')));
  return values;
}

function buildSummary(state, executionEntries = []) {
  const missions = listMissions(state);
  const statusCounts = missions.reduce((acc, mission) => {
    const key = mission.status || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return {
    totals: {
      missions: missions.length,
      tasks: Array.isArray(state.tasks) ? state.tasks.length : 0,
      events: Array.isArray(state.events) ? state.events.length : 0,
      gate_decisions: Array.isArray(state.gate_decisions) ? state.gate_decisions.length : 0,
      phase_runs: Array.isArray(state.phase_runs) ? state.phase_runs.length : 0,
      phase_run_sessions: Array.isArray(state.phase_run_sessions) ? state.phase_run_sessions.length : 0,
    },
    status_counts: statusCounts,
    parallel: deriveParallelSummary(executionEntries),
    execution: deriveExecutionSummary(executionEntries),
    metrics: deriveMetricsSummary(executionEntries),
    active_runs: listActiveWorkflowRuns(),
    recent_missions: missions.slice(0, 8).map((mission) => ({
      mission_id: mission.mission_id,
      goal: mission.goal,
      status: mission.status,
      updated_at: mission.updated_at,
    })),
  };
}

function renderDashboardHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>xflow control plane</title>
    <style>
      :root {
        --bg: #f5f1e8;
        --panel: #fffaf0;
        --ink: #1f1a14;
        --muted: #6f665c;
        --accent: #0f766e;
        --line: #d8cdbd;
      }
      body { margin: 0; font-family: "Iowan Old Style", "Palatino Linotype", serif; background: linear-gradient(180deg, #f8f4ec 0%, var(--bg) 100%); color: var(--ink); }
      main { max-width: 1080px; margin: 0 auto; padding: 32px 20px 60px; }
      h1 { font-size: 40px; margin: 0 0 8px; }
      p { color: var(--muted); margin-top: 0; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin: 24px 0; }
      .card { background: var(--panel); border: 1px solid var(--line); border-radius: 16px; padding: 16px; box-shadow: 0 8px 24px rgba(31,26,20,0.06); }
      .metric { font-size: 30px; margin: 0; }
      .label { font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
      table { width: 100%; border-collapse: collapse; background: var(--panel); border: 1px solid var(--line); border-radius: 16px; overflow: hidden; }
      th, td { text-align: left; padding: 12px 14px; border-bottom: 1px solid var(--line); font-size: 14px; }
      th { color: var(--muted); font-weight: 600; }
      tr:last-child td { border-bottom: none; }
      .status { color: var(--accent); font-weight: 700; }
      .pill { display: inline-block; padding: 4px 8px; border-radius: 999px; background: #e6fffb; color: #115e59; margin: 4px 6px 0 0; font-size: 12px; }
      .stack { display: grid; gap: 16px; margin-top: 16px; }
      .gate { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 0; border-bottom: 1px solid var(--line); }
      .gate:last-child { border-bottom: none; }
      .meta { font-size: 12px; color: var(--muted); }
      button { border: none; border-radius: 999px; background: var(--accent); color: white; padding: 10px 14px; font: inherit; cursor: pointer; }
      button:disabled { opacity: .6; cursor: wait; }
      button.secondary { background: #e6ded0; color: var(--ink); }
      ul { list-style: none; margin: 0; padding: 0; }
      li { padding: 10px 0; border-bottom: 1px solid var(--line); }
      li:last-child { border-bottom: none; }
      code { font-size: 12px; }
      .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-top: 12px; }
      label { display: grid; gap: 6px; font-size: 13px; color: var(--muted); }
      input, select { width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--line); background: #fffdf8; font: inherit; color: var(--ink); }
      .actions { display: flex; gap: 10px; margin-top: 14px; flex-wrap: wrap; }
      .inline-code { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 12px; }
    </style>
  </head>
  <body>
    <main>
      <h1>xflow Control Plane</h1>
      <p>Live summary of missions, gates, phase runs, and the latest execution state.</p>
      <section id="metrics" class="grid"></section>
      <section class="card">
        <div class="label">Mission Status Mix</div>
        <div id="statuses"></div>
      </section>
      <section class="card" style="margin-top: 16px;">
        <div class="label">Rerun Control</div>
        <div id="rerun-meta" class="meta" style="margin-top: 8px;"></div>
        <form id="rerun-form">
          <div class="form-grid">
            <label>Mission
              <input id="rerun-mission-id" name="mission_id" placeholder="mis_..." />
            </label>
            <label>Workflow path
              <input id="rerun-workflow-path" name="workflow_path" placeholder="workflows/corps.yaml" />
            </label>
            <label>Change ID
              <input id="rerun-change-id" name="change_id" placeholder="2026-04-15-example" />
            </label>
            <label>Phase
              <select id="rerun-phase-id" name="phase_id">
                <option value="">Select phase</option>
              </select>
            </label>
            <label>Atom (optional)
              <input id="rerun-atom-id" name="atom_id" placeholder="B2b.status.write" />
            </label>
          </div>
          <div class="actions">
            <button type="submit" id="rerun-submit">Start rerun</button>
            <button type="button" class="secondary" id="rerun-reset">Clear</button>
          </div>
          <div id="rerun-status" class="meta" style="margin-top: 10px;"></div>
        </form>
      </section>
      <section style="margin-top: 16px;">
        <div class="label" style="margin-bottom: 10px;">Recent Missions</div>
        <table>
          <thead><tr><th>Mission</th><th>Goal</th><th>Status</th><th>Updated</th><th>Action</th></tr></thead>
          <tbody id="missions"></tbody>
        </table>
      </section>
      <section class="stack">
        <section class="card">
          <div class="label">Pending Gates</div>
          <div id="gates"></div>
        </section>
        <section class="card">
          <div class="label">Recent Activity</div>
          <ul id="activity"></ul>
        </section>
      </section>
    </main>
    <script>
      const rerunState = {
        mission: null,
        summary: null,
      };
      function defaultWorkflowPath(summary) {
        if (!summary?.execution?.workflow) return '';
        const workflow = summary.execution.workflow;
        if (workflow === 'yolo' || workflow === 'corps') {
          return 'workflows/' + workflow + '.yaml';
        }
        return '';
      }
      function setRerunStatus(message, isError = false) {
        const node = document.getElementById('rerun-status');
        node.textContent = message || '';
        node.style.color = isError ? '#9f1239' : '';
      }
      function populateMissionDetail(detail) {
        rerunState.mission = detail;
        const phaseSelect = document.getElementById('rerun-phase-id');
        const phases = (detail.phase_overview || []).map((entry) => entry.phase);
        const currentPhase = detail.execution_overview?.current_phase || '';
        phaseSelect.innerHTML = '<option value="">Select phase</option>' + phases.map((phase) => (
          '<option value="' + phase + '"' + (phase === currentPhase ? ' selected' : '') + '>' + phase + '</option>'
        )).join('');
        document.getElementById('rerun-meta').innerHTML = [
          detail.mission?.goal ? 'mission: ' + detail.mission.goal : '',
          currentPhase ? 'current phase: <span class="inline-code">' + currentPhase + '</span>' : '',
          detail.execution_overview?.latest_phase_run_status ? 'latest run: ' + detail.execution_overview.latest_phase_run_status : '',
        ].filter(Boolean).join(' · ');
      }
      async function openRerunForMission(missionId) {
        const response = await fetch('/api/missions/' + missionId);
        const detail = await response.json();
        populateMissionDetail(detail);
        document.getElementById('rerun-mission-id').value = missionId;
        document.getElementById('rerun-workflow-path').value = document.getElementById('rerun-workflow-path').value || defaultWorkflowPath(rerunState.summary);
        document.getElementById('rerun-change-id').value = document.getElementById('rerun-change-id').value || rerunState.summary?.execution?.change_id || '';
        setRerunStatus('Ready to rerun ' + missionId);
      }
      function renderSummary(data) {
        rerunState.summary = data;
        const metrics = [
          ['missions', data.totals.missions],
          ['tasks', data.totals.tasks],
          ['events', data.totals.events],
          ['gates', data.totals.gate_decisions],
          ['phase runs', data.totals.phase_runs],
          ['sessions', data.totals.phase_run_sessions],
          ['max parallel', data.parallel.max_parallel_agents],
          ['parallel policy', data.parallel.policy],
          ['parallel source', data.parallel.source],
          ['atom runs', data.metrics.atom_runs],
          ['failed atoms', data.metrics.failed_atom_runs],
          ['avg atom ms', data.metrics.avg_atom_duration_ms ?? '-'],
        ];
        document.getElementById('metrics').innerHTML = metrics.map(([label, value]) => (
          '<div class="card"><div class="label">' + label + '</div><p class="metric">' + value + '</p></div>'
        )).join('');
        document.getElementById('statuses').innerHTML = Object.entries(data.status_counts).map(([key, value]) => (
          '<span class="pill">' + key + ': ' + value + '</span>'
        )).join('') || '<span class="pill">no missions</span>';
        if (!document.getElementById('rerun-workflow-path').value) {
          document.getElementById('rerun-workflow-path').value = defaultWorkflowPath(data);
        }
        if (!document.getElementById('rerun-change-id').value && data.execution?.change_id) {
          document.getElementById('rerun-change-id').value = data.execution.change_id;
        }
        document.getElementById('missions').innerHTML = data.recent_missions.map((mission) => (
          '<tr><td><code>' + mission.mission_id + '</code></td><td>' + mission.goal + '</td><td class="status">' + mission.status + '</td><td>' + (mission.updated_at || '') + '</td><td><button class="secondary" data-mission="' + mission.mission_id + '">Rerun</button></td></tr>'
        )).join('') || '<tr><td colspan="5">No missions yet</td></tr>';
      }
      function renderGates(gates) {
        document.getElementById('gates').innerHTML = gates.map((gate) => (
          '<div class="gate">' +
            '<div><div><strong>' + gate.phase + '</strong></div>' +
            '<div class="meta">' + (gate.instructions || 'Pending human review') + '</div></div>' +
            '<button data-phase="' + gate.phase + '">Approve</button>' +
          '</div>'
        )).join('') || '<div class="meta">No pending gates</div>';
      }
      function renderActivity(entries) {
        document.getElementById('activity').innerHTML = entries.map((entry) => (
          '<li><div><strong>' + (entry.atom_id || entry.kind || 'event') + '</strong></div>' +
          '<div class="meta">' + [
            entry.phase_id,
            entry.status,
            entry.adapter,
            entry.adapter_reason,
            entry.artifact_type,
            entry.parallel_weight ? 'weight ' + entry.parallel_weight : '',
            entry.timestamp,
          ].filter(Boolean).join(' · ') + '</div></li>'
        )).join('') || '<li class="meta">No execution activity yet</li>';
      }
      async function refreshFallback() {
        const [summaryRes, gatesRes, logsRes] = await Promise.all([
          fetch('/api/summary'),
          fetch('/api/gates/pending'),
          fetch('/api/logs/execution?limit=12'),
        ]);
        renderSummary(await summaryRes.json());
        renderGates((await gatesRes.json()).pending_gates || []);
        renderActivity((await logsRes.json()).entries || []);
      }
      document.addEventListener('click', async (event) => {
        const button = event.target.closest('button[data-phase]');
        if (button) {
          button.disabled = true;
          await fetch('/api/gates/' + button.dataset.phase + '/ack', { method: 'POST' });
          await refreshFallback();
          return;
        }
        const missionButton = event.target.closest('button[data-mission]');
        if (missionButton) {
          missionButton.disabled = true;
          try {
            await openRerunForMission(missionButton.dataset.mission);
          } finally {
            missionButton.disabled = false;
          }
        }
      });
      document.getElementById('rerun-reset').addEventListener('click', () => {
        rerunState.mission = null;
        document.getElementById('rerun-form').reset();
        document.getElementById('rerun-phase-id').innerHTML = '<option value="">Select phase</option>';
        document.getElementById('rerun-meta').textContent = '';
        setRerunStatus('');
      });
      document.getElementById('rerun-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const missionId = document.getElementById('rerun-mission-id').value.trim();
        const workflowPath = document.getElementById('rerun-workflow-path').value.trim();
        const changeId = document.getElementById('rerun-change-id').value.trim();
        const phaseId = document.getElementById('rerun-phase-id').value.trim();
        const atomId = document.getElementById('rerun-atom-id').value.trim();
        if (!missionId || !workflowPath || !phaseId) {
          setRerunStatus('Mission, workflow path, and phase are required.', true);
          return;
        }
        const submit = document.getElementById('rerun-submit');
        submit.disabled = true;
        try {
          const response = await fetch('/api/missions/' + missionId + '/rerun', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              workflow_path: workflowPath,
              change_id: changeId || undefined,
              phase_id: phaseId,
              atom_id: atomId || undefined,
            }),
          });
          const payload = await response.json();
          if (!response.ok) {
            throw new Error(payload.error || 'Rerun failed');
          }
          setRerunStatus('Rerun started for ' + payload.rerun.phase_id + (payload.rerun.atom_id ? '/' + payload.rerun.atom_id : ''));
          await refreshFallback();
        } catch (error) {
          setRerunStatus(error.message || String(error), true);
        } finally {
          submit.disabled = false;
        }
      });
      if (window.EventSource) {
        const events = new EventSource('/api/events');
        events.addEventListener('snapshot', (event) => {
          const payload = JSON.parse(event.data);
          renderSummary(payload.summary);
          renderGates(payload.pending_gates || []);
          renderActivity(payload.execution_log?.entries || []);
        });
        events.onerror = () => {
          events.close();
          refreshFallback();
          setInterval(refreshFallback, 3000);
        };
      } else {
        refreshFallback();
        setInterval(refreshFallback, 3000);
      }
    </script>
  </body>
</html>`;
}

async function buildSnapshot(projectRoot, state) {
  const executionLog = await readExecutionLog(projectRoot, { limit: 12 });
  return {
    summary: buildSummary(state, executionLog.entries),
    pending_gates: listPendingGates(projectRoot),
    execution_log: executionLog,
  };
}

function buildWorkflowRunKey({ projectRoot, workflowPath, changeId }) {
  return `${projectRoot}::${workflowPath}::${changeId || ''}`;
}

function validateRerunRequest({ state, missionId, projectRoot, workflowPath, changeId, phaseId, atomId, workflow, phases }) {
  const detail = getMissionDetail(state, missionId);
  const mission = detail.mission;
  if (mission.workspace_root && resolve(mission.workspace_root) !== resolve(projectRoot)) {
    throw new Error(`Mission ${missionId} is bound to a different workspace root`);
  }

  const binding = changeId ? readBinding(projectRoot, changeId) : null;
  if (binding?.mission_id && binding.mission_id !== missionId) {
    throw new Error(`change_id ${changeId} is already bound to mission ${binding.mission_id}`);
  }

  const targetPhase = phases.find((phase) => phase.id === phaseId);
  if (!targetPhase) {
    throw new Error(`Unknown rerun phase: ${phaseId}`);
  }
  if (atomId && !(targetPhase.atoms || []).some((atomRef) => atomRef.id === atomId)) {
    throw new Error(`Atom "${atomId}" is not present in phase "${phaseId}"`);
  }

  const activeMissionRun = listActiveWorkflowRuns(projectRoot).find((entry) => entry.mission_id === missionId && entry.status === 'running');
  if (activeMissionRun) {
    throw new Error(`Mission ${missionId} already has an active workflow run`);
  }

  return {
    mission_status: mission.status,
    workflow_name: workflow.name,
    phase_id: phaseId,
    atom_id: atomId || null,
    change_id: changeId || null,
    workspace_root: projectRoot,
  };
}

function resolveMissionBudgetOverride(state, missionId, explicitBudget = null) {
  if (explicitBudget !== undefined && explicitBudget !== null && explicitBudget !== '') {
    const parsed = Number(explicitBudget);
    if (!Number.isFinite(parsed) || parsed < 1) {
      throw new Error(`Invalid parallel budget override: ${String(explicitBudget)}`);
    }
    return Math.floor(parsed);
  }
  return getMissionControl(state, missionId)?.parallel_budget_override || null;
}

function launchWorkflowRun({ projectRoot, workflowPath, changeId = null, missionId = null, rerunId = null, maxParallelAgentsOverride = null, dataFile = null }) {
  const runKey = buildWorkflowRunKey({ projectRoot, workflowPath, changeId });
  const existing = activeWorkflowRuns.get(runKey);
  if (existing && existing.exit_code === null) {
    throw new Error(`Workflow run already active for ${workflowPath}`);
  }

  const launchedAt = new Date().toISOString();
  const abortController = new AbortController();
  const record = {
    pid: process.pid,
    workflow_path: workflowPath,
    project_root: projectRoot,
    change_id: changeId,
    mission_id: missionId,
    rerun_id: rerunId,
    max_parallel_agents: maxParallelAgentsOverride || null,
    launched_at: launchedAt,
    exit_code: null,
    error: null,
    abort_controller: abortController,
    cancel_requested: false,
  };
  activeWorkflowRuns.set(runKey, record);
  persistActiveWorkflowRuns(projectRoot);

  queueMicrotask(async () => {
    try {
      const { load } = await import('./core/workflow-loader.js');
      const { WorkflowExecutor } = await import('./core/workflow-executor.js');
      const { workflow, phases, registry } = load(workflowPath, { skipRuntimeChecks: true });
      const executor = new WorkflowExecutor({
        workflow,
        phases,
        registry,
        projectRoot,
        changeId,
        exitOnFailure: false,
        maxParallelAgentsOverride,
        abortSignal: abortController.signal,
      });
      await executor.run();
      activeWorkflowRuns.set(runKey, {
        ...record,
        exit_code: 0,
        finished_at: new Date().toISOString(),
        abort_controller: undefined,
      });
      persistActiveWorkflowRuns(projectRoot);
      if (dataFile && missionId && rerunId) {
        await mutateStore((mutableState) => updateRerun(mutableState, missionId, rerunId, {
          status: 'completed',
          finished_at: new Date().toISOString(),
          error: null,
        }), dataFile);
      }
    } catch (error) {
      const canceled = error?.name === 'AbortError';
      activeWorkflowRuns.set(runKey, {
        ...record,
        exit_code: canceled ? 130 : 1,
        finished_at: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
        abort_controller: undefined,
      });
      persistActiveWorkflowRuns(projectRoot);
      if (dataFile && missionId && rerunId) {
        await mutateStore((mutableState) => updateRerun(mutableState, missionId, rerunId, {
          status: canceled ? 'canceled' : 'failed',
          finished_at: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error),
        }), dataFile);
      }
    }
  });

  return record;
}

export default async function startServer(options = {}) {
  const projectRoot = options.projectRoot || process.cwd();
  const dataFile = resolveDataFile({ projectRoot, explicitPath: options.dataFile || null });
  const host = options.host || '127.0.0.1';
  const requestedPort = options.port ?? process.env.PORT ?? 8787;
  const port = Number(requestedPort);
  await hydrateActiveWorkflowRuns(projectRoot, dataFile);

  const server = createServer(async (request, response) => {
    const url = new URL(request.url || '/', `http://${host}:${port}`);
    if (request.method === 'GET' && url.pathname === '/') {
      sendHtml(response, 200, renderDashboardHtml());
      return;
    }
    if (request.method === 'GET' && url.pathname === '/api/health') {
      sendJson(response, 200, { ok: true });
      return;
    }

    const state = await readStore(dataFile);

    if (request.method === 'GET' && url.pathname === '/api/state') {
      sendJson(response, 200, state);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/summary') {
      const executionLog = await readExecutionLog(projectRoot, { limit: 40 });
      sendJson(response, 200, buildSummary(state, executionLog.entries));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/gates/pending') {
      sendJson(response, 200, { pending_gates: listPendingGates(projectRoot) });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/events') {
      response.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      });
      response.write('\n');

      const sendSnapshot = async () => {
        const nextState = await readStore(dataFile);
        sendEvent(response, 'snapshot', await buildSnapshot(projectRoot, nextState));
      };

      const heartbeat = setInterval(() => {
        response.write(': ping\n\n');
      }, 15000);
      const timer = setInterval(() => {
        sendSnapshot().catch(() => {});
      }, 3000);

      await sendSnapshot();
      request.on('close', () => {
        clearInterval(timer);
        clearInterval(heartbeat);
      });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/logs/execution') {
      const limit = Number(url.searchParams.get('limit') || 20);
      const payload = await readExecutionLog(projectRoot, { limit });
      sendJson(response, 200, { log_file: resolveExecutionLogPath(projectRoot), entries: payload.entries });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/missions') {
      sendJson(response, 200, listMissions(state));
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/missions') {
      try {
        const payload = await readJsonBody(request);
        const result = await mutateStore((mutableState) => createMission(mutableState, payload), dataFile);
        sendJson(response, 201, { ok: true, ...result });
      } catch (error) {
        sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
      }
      return;
    }

    if (url.pathname.startsWith('/api/missions/')) {
      const [, , , missionId, tail, subtail] = url.pathname.split('/');
      if (request.method === 'GET' && missionId && !tail) {
        try {
          sendJson(response, 200, getMissionDetail(state, missionId));
        } catch (error) {
          sendJson(response, 404, { error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }

      if (request.method === 'POST' && missionId && tail === 'interventions') {
        try {
          const payload = await readJsonBody(request);
          const result = await mutateStore(
            (mutableState) => createIntervention(mutableState, missionId, payload),
            dataFile,
          );
          sendJson(response, 201, { ok: true, ...result });
        } catch (error) {
          sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }

      if (request.method === 'POST' && missionId && tail === 'phase-runs') {
        try {
          const payload = await readJsonBody(request);
          const session = await mutateStore(
            (mutableState) => startPhaseRunSession(mutableState, missionId, payload),
            dataFile,
          );
          sendJson(response, 201, { ok: true, mission_id: missionId, session });
        } catch (error) {
          sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }

      if (request.method === 'POST' && missionId && tail === 'phase-runs-persist') {
        try {
          const payload = await readJsonBody(request);
          const result = await mutateStore((mutableState) => {
            const phaseRun = persistPhaseRun(mutableState, missionId, payload);
            const session = findPhaseRunSession(mutableState, missionId, payload.session_id || null);
            return { phaseRun, session };
          }, dataFile);
          sendJson(response, 200, { ok: true, mission_id: missionId, phase_run: result.phaseRun, session: result.session });
        } catch (error) {
          sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }

      if (request.method === 'POST' && missionId && tail === 'phase-runs-complete') {
        try {
          const payload = await readJsonBody(request);
          const session = await mutateStore((mutableState) => {
            const currentSession = payload.session_id
              ? findPhaseRunSession(mutableState, missionId, payload.session_id)
              : findPhaseRunSession(mutableState, missionId);
            if (!currentSession) {
              throw new Error(`No phase run session found for mission ${missionId}`);
            }
            return completePhaseRunSession(mutableState, missionId, currentSession.session_id, payload);
          }, dataFile);
          sendJson(response, 200, { ok: true, mission_id: missionId, session });
        } catch (error) {
          sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }

      if (request.method === 'GET' && missionId && tail === 'timeline' && subtail === 'analytics') {
        try {
          const detail = getMissionDetail(state, missionId);
          sendJson(response, 200, { mission_id: missionId, analytics: deriveTimelineAnalytics(detail.timeline) });
        } catch (error) {
          sendJson(response, 404, { error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }

      if (request.method === 'GET' && missionId && tail === 'timeline' && !subtail) {
        try {
          sendJson(response, 200, { mission_id: missionId, timeline: getMissionDetail(state, missionId).timeline });
        } catch (error) {
          sendJson(response, 404, { error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }

      if (request.method === 'GET' && missionId && tail === 'reruns') {
        try {
          sendJson(response, 200, { mission_id: missionId, reruns: listReruns(state, missionId) });
        } catch (error) {
          sendJson(response, 404, { error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }

      if (request.method === 'POST' && missionId && tail === 'budget-override') {
        try {
          const payload = await readJsonBody(request);
          const result = await mutateStore((mutableState) => {
            const control = setMissionControl(mutableState, missionId, {
              parallel_budget_override: payload.max_parallel_agents,
              note: payload.note || '',
              requested_by: payload.requested_by || 'human:control-plane',
            });
            const action = createOperatorAction(mutableState, missionId, {
              kind: 'budget_override',
              target_type: 'mission',
              target_id: missionId,
              payload: { max_parallel_agents: control.parallel_budget_override },
              note: payload.note || '',
              requested_by: payload.requested_by || 'human:control-plane',
            });
            return { control, action };
          }, dataFile);
          sendJson(response, 200, { ok: true, mission_id: missionId, control: result.control, operator_action: result.action });
        } catch (error) {
          sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }

      if (request.method === 'POST' && missionId && tail === 'rerun') {
        try {
          const payload = await readJsonBody(request);
          const workflowPath = String(payload.workflow_path || '').trim();
          const phaseId = String(payload.phase_id || payload.phase || '').trim();
          const atomId = String(payload.atom_id || payload.atom || '').trim() || null;
          const projectRootForRun = payload.project_root || projectRoot;
          const changeId = payload.change_id || null;

          if (!workflowPath) {
            throw new Error('workflow_path is required');
          }
          if (!phaseId) {
            throw new Error('phase_id is required');
          }

          const resolvedWorkflowPath = resolve(projectRootForRun, workflowPath);
          const { load } = await import('./core/workflow-loader.js');
          const { workflow, phases } = load(resolvedWorkflowPath, { skipRuntimeChecks: true });
          const validation = validateRerunRequest({
            state,
            missionId,
            projectRoot: projectRootForRun,
            workflowPath: resolvedWorkflowPath,
            changeId,
            phaseId,
            atomId,
            workflow,
            phases,
          });
          const budgetOverride = resolveMissionBudgetOverride(state, missionId, payload.max_parallel_agents);
          const rerunState = prepareWorkflowRerun({
            workflow,
            phases,
            projectRoot: projectRootForRun,
            changeId,
            phaseId,
            atomId,
          });

          const result = await mutateStore((mutableState) => {
            const operatorAction = createOperatorAction(mutableState, missionId, {
              kind: 'rerun_request',
              target_type: 'mission',
              target_id: missionId,
              payload: {
                workflow_path: resolvedWorkflowPath,
                change_id: changeId,
                phase_id: phaseId,
                atom_id: atomId,
                max_parallel_agents: budgetOverride,
              },
              note: payload.note || '',
              requested_by: payload.requested_by || 'human:control-plane',
            });
            const rerun = createRerun(mutableState, missionId, {
              workflow_path: resolvedWorkflowPath,
              project_root: projectRootForRun,
              change_id: changeId,
              phase_id: phaseId,
              atom_id: atomId,
              requested_by: payload.requested_by || 'human:control-plane',
              request_note: payload.note || '',
              validation,
              budget_override: budgetOverride,
              action_id: operatorAction.action_id,
            });
            const interventionResult = createIntervention(mutableState, missionId, {
              action: 'rerun',
              note: payload.note || `Rerun requested for ${phaseId}${atomId ? `/${atomId}` : ''}`,
              requested_by: payload.requested_by || 'human:control-plane',
              metadata: {
                workflow_path: resolvedWorkflowPath,
                change_id: changeId,
                phase_id: phaseId,
                atom_id: atomId,
                state_file: rerunState.state_file,
              },
            });
            const run = launchWorkflowRun({
              projectRoot: projectRootForRun,
              workflowPath: resolvedWorkflowPath,
              changeId,
              missionId,
              rerunId: rerun.rerun_id,
              maxParallelAgentsOverride: budgetOverride,
              dataFile,
            });
            const nextRerun = updateRerun(mutableState, missionId, rerun.rerun_id, {
              status: 'running',
              started_at: new Date().toISOString(),
              run_key: buildWorkflowRunKey({ projectRoot: projectRootForRun, workflowPath: resolvedWorkflowPath, changeId }),
              workflow_run: run,
            });
            return { intervention: interventionResult.intervention, event: interventionResult.event, mission: interventionResult.mission, run, rerun: nextRerun, operatorAction };
          }, dataFile);

          sendJson(response, 202, {
            ok: true,
            mission_id: missionId,
            rerun: result.rerun,
            workflow_run: result.run,
            intervention: result.intervention,
            operator_action: result.operatorAction,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const statusCode = message.includes('already active') ? 409 : 400;
          sendJson(response, statusCode, { error: message });
        }
        return;
      }

      if (request.method === 'POST' && missionId && tail === 'reruns' && subtail) {
        try {
          const payload = await readJsonBody(request);
          const rerunId = subtail;
          const action = url.pathname.split('/')[6] || payload.action || '';
          if (!action) {
            throw new Error('rerun action is required');
          }

          if (action === 'cancel') {
            const run = [...activeWorkflowRuns.values()].find((entry) => entry.mission_id === missionId && entry.rerun_id === rerunId && entry.exit_code === null);
            if (!run) {
              throw new Error(`No active rerun found for ${rerunId}`);
            }
            run.cancel_requested = true;
            persistActiveWorkflowRuns(run.project_root);
            run.abort_controller?.abort();
            const result = await mutateStore((mutableState) => {
              const operatorAction = createOperatorAction(mutableState, missionId, {
                kind: 'rerun_cancel',
                target_type: 'rerun',
                target_id: rerunId,
                payload: {},
                note: payload.note || '',
                requested_by: payload.requested_by || 'human:control-plane',
              });
              const rerun = updateRerun(mutableState, missionId, rerunId, {
                status: 'cancel_requested',
                error: null,
              });
              return { operatorAction, rerun };
            }, dataFile);
            sendJson(response, 202, { ok: true, mission_id: missionId, rerun: result.rerun, operator_action: result.operatorAction });
            return;
          }

          if (action === 'acknowledge-orphan') {
            const currentRerun = getRerun(state, missionId, rerunId);
            if (!currentRerun) {
              throw new Error(`Rerun not found: ${rerunId}`);
            }
            if (currentRerun.status !== 'orphaned') {
              throw new Error(`Rerun ${rerunId} is not orphaned`);
            }
            const acknowledgedAt = new Date().toISOString();
            const matchingRuns = findActiveWorkflowRunsForRerun(missionId, rerunId);
            const workflowRun = matchingRuns[0]
              ? serializeWorkflowRun(matchingRuns[0].entry)
              : currentRerun.workflow_run || {};
            const result = await mutateStore((mutableState) => {
              const operatorAction = createOperatorAction(mutableState, missionId, {
                kind: 'rerun_orphan_acknowledge',
                target_type: 'rerun',
                target_id: rerunId,
                payload: {
                  cleared_active_runs: matchingRuns.length,
                  acknowledged_at: acknowledgedAt,
                },
                note: payload.note || '',
                requested_by: payload.requested_by || 'human:control-plane',
              });
              const rerun = updateRerun(mutableState, missionId, rerunId, {
                status: 'canceled',
                finished_at: acknowledgedAt,
                error: `Orphaned workflow run acknowledged by operator.${payload.note ? ` ${payload.note}` : ''}`,
                workflow_run: {
                  ...workflowRun,
                  orphaned: true,
                  acknowledged_at: acknowledgedAt,
                  cleared_active_runs: matchingRuns.length,
                },
              });
              return { operatorAction, rerun };
            }, dataFile);
            const clearedRuns = clearActiveWorkflowRunsForRerun({
              projectRoot: currentRerun.project_root || projectRoot,
              missionId,
              rerunId,
            });
            sendJson(response, 202, {
              ok: true,
              mission_id: missionId,
              rerun: result.rerun,
              operator_action: result.operatorAction,
              cleared_active_runs: clearedRuns.length,
            });
            return;
          }

          if (['retry', 'resume'].includes(action)) {
            const currentRerun = getRerun(state, missionId, rerunId);
            if (!currentRerun) {
              throw new Error(`Rerun not found: ${rerunId}`);
            }
            if (!['failed', 'canceled', 'orphaned'].includes(currentRerun.status)) {
              throw new Error(`Rerun ${rerunId} is not eligible for ${action}`);
            }

            const { load } = await import('./core/workflow-loader.js');
            const { workflow, phases } = load(currentRerun.workflow_path, { skipRuntimeChecks: true });
            const validation = validateRerunRequest({
              state,
              missionId,
              projectRoot: currentRerun.project_root || projectRoot,
              workflowPath: currentRerun.workflow_path,
              changeId: currentRerun.change_id,
              phaseId: currentRerun.phase_id,
              atomId: currentRerun.atom_id,
              workflow,
              phases,
            });
            const budgetOverride = resolveMissionBudgetOverride(state, missionId, currentRerun.budget_override);
            prepareWorkflowRerun({
              workflow,
              phases,
              projectRoot: currentRerun.project_root || projectRoot,
              changeId: currentRerun.change_id,
              phaseId: currentRerun.phase_id,
              atomId: currentRerun.atom_id,
            });
            const result = await mutateStore((mutableState) => {
              const operatorAction = createOperatorAction(mutableState, missionId, {
                kind: action === 'retry' ? 'rerun_retry' : 'rerun_resume',
                target_type: 'rerun',
                target_id: rerunId,
                payload: { source_rerun_id: rerunId },
                note: payload.note || '',
                requested_by: payload.requested_by || 'human:control-plane',
              });
              const rerun = createRerun(mutableState, missionId, {
                source_rerun_id: rerunId,
                workflow_path: currentRerun.workflow_path,
                project_root: currentRerun.project_root,
                change_id: currentRerun.change_id,
                phase_id: currentRerun.phase_id,
                atom_id: currentRerun.atom_id,
                requested_by: payload.requested_by || 'human:control-plane',
                request_note: payload.note || currentRerun.request_note || '',
                validation,
                budget_override: budgetOverride,
                action_id: operatorAction.action_id,
              });
              const run = launchWorkflowRun({
                projectRoot: currentRerun.project_root || projectRoot,
                workflowPath: currentRerun.workflow_path,
                changeId: currentRerun.change_id,
                missionId,
                rerunId: rerun.rerun_id,
                maxParallelAgentsOverride: budgetOverride,
                dataFile,
              });
              const nextRerun = updateRerun(mutableState, missionId, rerun.rerun_id, {
                status: 'running',
                started_at: new Date().toISOString(),
                run_key: buildWorkflowRunKey({ projectRoot: currentRerun.project_root || projectRoot, workflowPath: currentRerun.workflow_path, changeId: currentRerun.change_id }),
                workflow_run: run,
              });
              return { operatorAction, rerun: nextRerun, workflow_run: run };
            }, dataFile);
            sendJson(response, 202, { ok: true, mission_id: missionId, rerun: result.rerun, operator_action: result.operatorAction, workflow_run: result.workflow_run });
            return;
          }

          throw new Error(`Unknown rerun action: ${action}`);
        } catch (error) {
          sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }

      if (request.method === 'GET' && missionId) {
        try {
          sendJson(response, 200, getMissionDetail(state, missionId));
        } catch (error) {
          sendJson(response, 404, { error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }
    }

    if (url.pathname.startsWith('/api/gates/')) {
      const phase = decodeURIComponent(url.pathname.split('/')[3] || '');
      const tail = url.pathname.split('/')[4] || '';
      if (request.method === 'POST' && phase && tail === 'ack') {
        try {
          const payload = await readJsonBody(request);
          const gate = ackPendingGate(projectRoot, phase, {
            approved_by: payload.approved_by || 'http:control-plane',
          });
          sendJson(response, 200, { ok: true, gate });
        } catch (error) {
          sendJson(response, 404, { error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }
    }

    sendJson(response, 404, { error: 'Not found' });
  });

  await new Promise((resolve) => server.listen(port, host, resolve));
  const address = server.address();
  const boundPort = typeof address === 'object' && address ? address.port : port;
  console.log(`openflow server listening on http://${host}:${boundPort}`);
  return server;
}
