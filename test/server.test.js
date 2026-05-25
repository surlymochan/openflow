import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

import startServer from '../src/server.js';
import {
  createMission,
  createOperatorAction,
  createRerun,
  persistPhaseRun,
  startPhaseRunSession,
  updateRerun,
} from '../src/core/mission-state.js';
import { mutateStore, resolveDataFile } from '../src/core/state-store.js';

async function waitFor(check, { timeoutMs = 5000, intervalMs = 50 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) {
      return result;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, intervalMs));
  }
  throw new Error(`Timed out after ${timeoutMs}ms`);
}

describe('Server', () => {
  test('serve exposes a health endpoint', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'openflow-server-'));
    const server = await startServer({ projectRoot, port: 0 });
    try {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 8787;
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      const payload = await response.json();
      assert.equal(payload.ok, true);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('serve exposes write routes for missions, interventions, and phase runs', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'openflow-server-write-'));
    const server = await startServer({ projectRoot, port: 0 });
    try {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 8787;
      const base = `http://127.0.0.1:${port}`;

      const missionResponse = await fetch(`${base}/api/missions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ goal: 'Server write route smoke', workspace: projectRoot }),
      });
      assert.equal(missionResponse.status, 201);
      const missionPayload = await missionResponse.json();
      assert.equal(missionPayload.ok, true);
      assert.ok(missionPayload.mission.mission_id);

      const missionId = missionPayload.mission.mission_id;

      const interventionResponse = await fetch(`${base}/api/missions/${missionId}/interventions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'note', note: 'Human review requested' }),
      });
      assert.equal(interventionResponse.status, 201);
      const interventionPayload = await interventionResponse.json();
      assert.equal(interventionPayload.ok, true);
      assert.equal(interventionPayload.intervention.note, 'Human review requested');

      const phaseStartResponse = await fetch(`${base}/api/missions/${missionId}/phase-runs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phase: 'explore', summary: 'Explore via server', timeout_seconds: 60 }),
      });
      assert.equal(phaseStartResponse.status, 201);
      const phaseStartPayload = await phaseStartResponse.json();
      assert.equal(phaseStartPayload.ok, true);
      assert.equal(phaseStartPayload.session.status, 'running');

      const phasePersistResponse = await fetch(`${base}/api/missions/${missionId}/phase-runs-persist`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          session_id: phaseStartPayload.session.session_id,
          summary: 'Persisted phase run',
          status: 'completed',
          phases: [{ phase: 'explore', status: 'completed', effective_status: 'completed' }],
          executed_phases: ['explore'],
        }),
      });
      assert.equal(phasePersistResponse.status, 200);
      const phasePersistPayload = await phasePersistResponse.json();
      assert.equal(phasePersistPayload.ok, true);
      assert.ok(phasePersistPayload.phase_run.phase_run_id);

      const phaseCompleteResponse = await fetch(`${base}/api/missions/${missionId}/phase-runs-complete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          session_id: phaseStartPayload.session.session_id,
          phase_run_id: phasePersistPayload.phase_run.phase_run_id,
          status: 'completed',
        }),
      });
      assert.equal(phaseCompleteResponse.status, 200);
      const phaseCompletePayload = await phaseCompleteResponse.json();
      assert.equal(phaseCompletePayload.ok, true);
      assert.equal(phaseCompletePayload.session.status, 'completed');

      const missionDetailResponse = await fetch(`${base}/api/missions/${missionId}`);
      const missionDetail = await missionDetailResponse.json();
      assert.equal(missionDetail.mission.mission_id, missionId);
      assert.equal(missionDetail.interventions.length, 1);
      assert.equal(missionDetail.phase_runs.length, 1);

      const logResponse = await fetch(`${base}/api/logs/execution`);
      const logPayload = await logResponse.json();
      assert.equal(logResponse.status, 200);
      assert.equal(logPayload.log_file, resolve(projectRoot, '.as-xflow', 'logs', 'execution.ndjson'));
      assert.deepEqual(logPayload.entries, []);
      assert.equal(existsSync(resolve(projectRoot, '.as-xflow', 'state.sqlite')), true);
    } finally {
      await new Promise((resolveClose) => server.close(resolveClose));
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('serve exposes summary api and dashboard html', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'openflow-server-dashboard-'));
    mkdirSync(resolve(projectRoot, '.as-xflow', 'logs'), { recursive: true });
    writeFileSync(
      resolve(projectRoot, '.as-xflow', 'logs', 'execution.ndjson'),
      [
        JSON.stringify({ kind: 'workflow_started', workflow: 'corps', change_id: 'chg-dashboard-1', max_parallel_agents: 3, parallel_policy: 'weighted', parallel_source: 'workflow', timestamp: '2026-04-15T00:00:00.000Z' }),
        JSON.stringify({ kind: 'atom_run', atom_id: 'H5.visual.review', ok: true, adapter: 'codex_cli', duration_ms: 1200, timestamp: '2026-04-15T00:00:01.000Z' }),
        JSON.stringify({ kind: 'atom_run', atom_id: 'H6.visual.benchmark', ok: false, exit_code: 1, adapter: 'codex_cli', duration_ms: 800, timestamp: '2026-04-15T00:00:02.000Z' }),
      ].join('\n') + '\n',
      'utf8',
    );
    const server = await startServer({ projectRoot, port: 0 });
    try {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 8787;
      const base = `http://127.0.0.1:${port}`;

      await fetch(`${base}/api/missions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ goal: 'Dashboard smoke', workspace: projectRoot }),
      });

      const summaryResponse = await fetch(`${base}/api/summary`);
      assert.equal(summaryResponse.status, 200);
      const summary = await summaryResponse.json();
      assert.equal(summary.totals.missions, 1);
      assert.equal(summary.recent_missions.length, 1);
      assert.equal(summary.parallel.max_parallel_agents, 3);
      assert.equal(summary.parallel.policy, 'weighted');
      assert.equal(summary.parallel.source, 'workflow');
      assert.equal(summary.parallel.source_workflow, 'corps');
      assert.equal(summary.metrics.atom_runs, 2);
      assert.equal(summary.metrics.failed_atom_runs, 1);
      assert.equal(summary.metrics.avg_atom_duration_ms, 1000);
      assert.equal(summary.metrics.adapter_counts.codex_cli, 2);
      assert.equal(summary.execution.workflow, 'corps');
      assert.equal(summary.execution.change_id, 'chg-dashboard-1');

      const dashboardResponse = await fetch(`${base}/`);
      const dashboardHtml = await dashboardResponse.text();
      assert.equal(dashboardResponse.status, 200);
      assert.match(dashboardHtml, /xflow Control Plane/);
      assert.match(dashboardHtml, /Recent Missions/);
      assert.match(dashboardHtml, /Pending Gates/);
      assert.match(dashboardHtml, /Recent Activity/);
      assert.match(dashboardHtml, /Rerun Control/);
      assert.match(dashboardHtml, /max parallel/);
      assert.match(dashboardHtml, /parallel policy/);
      assert.match(dashboardHtml, /atom runs/);
    } finally {
      await new Promise((resolveClose) => server.close(resolveClose));
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('serve exposes timeline analytics for mission timelines', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'openflow-server-timeline-analytics-'));
    const dataFile = resolveDataFile({ projectRoot });
    const missionId = await mutateStore((mutableState) => {
      const { mission } = createMission(mutableState, { goal: 'Timeline analytics smoke', workspace: projectRoot });
      createOperatorAction(mutableState, mission.mission_id, {
        kind: 'budget_override',
        target_type: 'mission',
        target_id: mission.mission_id,
        payload: { max_parallel_agents: 2 },
        requested_by: 'test-suite',
      });
      createRerun(mutableState, mission.mission_id, {
        workflow_path: resolve(projectRoot, 'analytics-smoke.yaml'),
        project_root: projectRoot,
        change_id: 'chg-analytics-1',
        phase_id: 'verify',
        status: 'failed',
        error: 'Synthetic failure',
        requested_by: 'test-suite',
      });
      startPhaseRunSession(mutableState, mission.mission_id, {
        phase_run_id: 'phr_analytics',
        summary: 'Running analytics session',
        phases: ['verify'],
        timeout_seconds: 60,
      });
      persistPhaseRun(mutableState, mission.mission_id, {
        phase_run_id: 'phr_analytics_done',
        summary: 'Completed analytics run',
        status: 'completed',
        phases: [{ phase: 'verify', status: 'completed', effective_status: 'completed' }],
        executed_phases: ['verify'],
      });
      return mission.mission_id;
    }, dataFile);

    const server = await startServer({ projectRoot, port: 0, dataFile });
    try {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 8787;
      const base = `http://127.0.0.1:${port}`;

      const analyticsResponse = await fetch(`${base}/api/missions/${missionId}/timeline/analytics`);
      assert.equal(analyticsResponse.status, 200);
      const analyticsPayload = await analyticsResponse.json();
      assert.equal(analyticsPayload.mission_id, missionId);
      assert.equal(analyticsPayload.analytics.total_events >= 5, true);
      assert.equal(analyticsPayload.analytics.by_kind.operator_action, 1);
      assert.equal(analyticsPayload.analytics.by_kind.rerun, 1);
      assert.equal(analyticsPayload.analytics.reruns.total, 1);
      assert.equal(analyticsPayload.analytics.reruns.status_counts.failed, 1);
      assert.equal(analyticsPayload.analytics.operator_actions.by_kind.budget_override, 1);
      assert.equal(analyticsPayload.analytics.phase_runs.total, 1);
      assert.equal(analyticsPayload.analytics.phase_runs.status_counts.completed, 1);
      assert.equal(analyticsPayload.analytics.phase_run_sessions.total, 1);
      assert.equal(analyticsPayload.analytics.phase_run_sessions.derived_status_counts.running, 1);
      assert.ok(analyticsPayload.analytics.time_range.first_seen_at);
      assert.ok(analyticsPayload.analytics.time_range.last_seen_at);
    } finally {
      await new Promise((resolveClose) => server.close(resolveClose));
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('serve exposes pending gate routes and event stream snapshots', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'openflow-server-gates-'));
    mkdirSync(resolve(projectRoot, '.as-xflow', 'pending-gates'), { recursive: true });
    mkdirSync(resolve(projectRoot, '.as-xflow', 'logs'), { recursive: true });
    writeFileSync(
      resolve(projectRoot, '.as-xflow', 'pending-gates', 'clarify.json'),
      `${JSON.stringify({
        phase: 'clarify',
        status: 'pending_human',
        created_at: '2026-04-14T00:00:00.000Z',
        instructions: 'Review and approve',
      }, null, 2)}\n`,
      'utf8',
    );
    writeFileSync(
      resolve(projectRoot, '.as-xflow', 'logs', 'execution.ndjson'),
      `${JSON.stringify({ kind: 'atom_run', atom_id: 'H4a.pencil.draft', phase_id: 'pencil_draft', status: 'pencil_completed', adapter: 'pencil_cli', artifact_type: 'pencil_pen', parallel_weight: 2, timestamp: '2026-04-14T00:00:01.000Z' })}\n`,
      'utf8',
    );

    const server = await startServer({ projectRoot, port: 0 });
    try {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 8787;
      const base = `http://127.0.0.1:${port}`;

      const gatesResponse = await fetch(`${base}/api/gates/pending`);
      assert.equal(gatesResponse.status, 200);
      const gatesPayload = await gatesResponse.json();
      assert.equal(gatesPayload.pending_gates.length, 1);
      assert.equal(gatesPayload.pending_gates[0].phase, 'clarify');

      const ackResponse = await fetch(`${base}/api/gates/clarify/ack`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ approved_by: 'test-suite' }),
      });
      assert.equal(ackResponse.status, 200);
      const ackPayload = await ackResponse.json();
      assert.equal(ackPayload.ok, true);
      assert.equal(ackPayload.gate.status, 'approved');
      assert.equal(JSON.parse(readFileSync(resolve(projectRoot, '.as-xflow', 'pending-gates', 'clarify.json'), 'utf8')).approved_by, 'test-suite');

      const streamResponse = await fetch(`${base}/api/events`);
      assert.equal(streamResponse.status, 200);
      const reader = streamResponse.body.getReader();
      let chunk = '';
      while (!chunk.includes('event: snapshot')) {
        const { value, done } = await reader.read();
        if (done) break;
        chunk += Buffer.from(value).toString('utf8');
      }
      await reader.cancel();
      assert.match(chunk, /event: snapshot/);
      assert.match(chunk, /H4a\.pencil\.draft/);
      assert.match(chunk, /pencil_cli/);
      assert.match(chunk, /pencil_pen/);
      assert.match(chunk, /parallel_weight/);
      assert.match(chunk, /"pending_gates":\[\]/);
    } finally {
      await new Promise((resolveClose) => server.close(resolveClose));
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('serve marks persisted in-flight workflow runs as orphaned on startup', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'openflow-server-orphan-'));
    const workflowPath = resolve(projectRoot, 'orphan-smoke.yaml');
    const changeId = 'chg-orphan-1';
    const runKey = `${projectRoot}::${workflowPath}::${changeId}`;
    mkdirSync(resolve(projectRoot, '.as-xflow'), { recursive: true });
    writeFileSync(workflowPath, `
name: orphan-smoke
version: 1
track: lite
requires:
  gh: false
phases:
  - id: setup
    label: "Setup"
    catalog_ref: 1
    required: true
    gate:
      type: skip
`, 'utf8');

    const dataFile = resolveDataFile({ projectRoot });
    const { missionId, rerunId } = await mutateStore((mutableState) => {
      const { mission } = createMission(mutableState, { goal: 'Orphan smoke', workspace: projectRoot });
      const rerun = createRerun(mutableState, mission.mission_id, {
        workflow_path: workflowPath,
        project_root: projectRoot,
        change_id: changeId,
        phase_id: 'setup',
        requested_by: 'test-suite',
      });
      updateRerun(mutableState, mission.mission_id, rerun.rerun_id, {
        status: 'running',
        run_key: runKey,
      });
      return { missionId: mission.mission_id, rerunId: rerun.rerun_id };
    }, dataFile);

    writeFileSync(resolve(projectRoot, '.as-xflow', 'active-runs.json'), JSON.stringify({
      version: 1,
      runs: [
        {
          pid: 999999,
          workflow_path: workflowPath,
          project_root: projectRoot,
          change_id: changeId,
          mission_id: missionId,
          rerun_id: rerunId,
          max_parallel_agents: 2,
          launched_at: '2026-04-16T00:00:00.000Z',
          exit_code: null,
          error: null,
          cancel_requested: false,
        },
      ],
    }, null, 2), 'utf8');

    const server = await startServer({ projectRoot, port: 0, dataFile });
    try {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 8787;
      const base = `http://127.0.0.1:${port}`;

      const summaryResponse = await fetch(`${base}/api/summary`);
      assert.equal(summaryResponse.status, 200);
      const summary = await summaryResponse.json();
      assert.equal(summary.active_runs.length, 1);
      assert.equal(summary.active_runs[0].status, 'orphaned');
      assert.equal(summary.active_runs[0].rerun_id, rerunId);
      assert.ok(summary.active_runs[0].recovered_at);

      const detailResponse = await fetch(`${base}/api/missions/${missionId}`);
      const detail = await detailResponse.json();
      assert.equal(detail.reruns[0].status, 'orphaned');
      assert.match(detail.reruns[0].error, /server restarted/);

      const persisted = JSON.parse(readFileSync(resolve(projectRoot, '.as-xflow', 'active-runs.json'), 'utf8'));
      assert.equal(persisted.runs[0].orphaned, true);
      assert.ok(persisted.runs[0].recovered_at);

      const acknowledgeResponse = await fetch(`${base}/api/missions/${missionId}/reruns/${rerunId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'acknowledge-orphan', note: 'Confirmed stale test run' }),
      });
      assert.equal(acknowledgeResponse.status, 202);
      const acknowledgePayload = await acknowledgeResponse.json();
      assert.equal(acknowledgePayload.rerun.status, 'canceled');
      assert.match(acknowledgePayload.rerun.error, /acknowledged/);
      assert.equal(acknowledgePayload.operator_action.kind, 'rerun_orphan_acknowledge');

      const clearedSummaryResponse = await fetch(`${base}/api/summary`);
      const clearedSummary = await clearedSummaryResponse.json();
      assert.equal(clearedSummary.active_runs.length, 0);

      const acknowledgedDetailResponse = await fetch(`${base}/api/missions/${missionId}`);
      const acknowledgedDetail = await acknowledgedDetailResponse.json();
      assert.equal(acknowledgedDetail.reruns[0].status, 'canceled');
      assert.equal(acknowledgedDetail.operator_actions.some((entry) => entry.kind === 'rerun_orphan_acknowledge'), true);

      const clearedPersisted = JSON.parse(readFileSync(resolve(projectRoot, '.as-xflow', 'active-runs.json'), 'utf8'));
      assert.deepEqual(clearedPersisted.runs, []);
    } finally {
      await new Promise((resolveClose) => server.close(resolveClose));
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('serve can trigger mission reruns for a phase or a specific atom', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'openflow-server-rerun-'));
    const workflowPath = resolve(projectRoot, 'rerun-smoke.yaml');
    writeFileSync(workflowPath, `
name: rerun-smoke
version: 1
track: lite
requires:
  gh: false
phases:
  - id: setup
    label: "Setup"
    catalog_ref: 1
    required: true
    atoms:
      - id: B1.change.scaffold
        with:
          title: "Rerun Smoke"
          change_type: "backend"
    gate:
      type: skip
  - id: mutate
    label: "Mutate"
    catalog_ref: 2
    required: true
    atoms:
      - id: B3.status.transition
        with:
          to_stage: "plan"
          reason: "enter-plan"
      - id: B2b.status.write
        with:
          fields:
            marker: "mutated"
    gate:
      type: skip
  - id: finish
    label: "Finish"
    catalog_ref: 3
    required: true
    atoms:
      - id: B2b.status.write
        with:
          fields:
            marker: "done"
    gate:
      type: skip
`, 'utf8');

    const firstRun = spawnSync('node', ['bin/xflow.js', 'workflow', 'run', workflowPath, '--project-root', projectRoot, '--change-id', 'chg-rerun-1'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    assert.equal(firstRun.status, 0, firstRun.stderr);

    const stateFile = resolve(projectRoot, '.as-xflow', 'workflow-state.json');
    const dataFile = resolve(projectRoot, '.as-xflow', 'state.sqlite');
    const statusFile = resolve(projectRoot, 'specs', 'changes', 'chg-rerun-1', 'status.json');

    const server = await startServer({ projectRoot, port: 0 });
    try {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 8787;
      const base = `http://127.0.0.1:${port}`;

      const missionResponse = await fetch(`${base}/api/missions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ goal: 'Rerun smoke mission', workspace: projectRoot }),
      });
      const missionPayload = await missionResponse.json();
      const missionId = missionPayload.mission.mission_id;

      const budgetResponse = await fetch(`${base}/api/missions/${missionId}/budget-override`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ max_parallel_agents: 2, note: 'Throttle reruns' }),
      });
      assert.equal(budgetResponse.status, 200);
      const budgetPayload = await budgetResponse.json();
      assert.equal(budgetPayload.control.parallel_budget_override, 2);

      writeFileSync(resolve(projectRoot, '.as-xflow', 'logs', 'execution.ndjson'), '', 'utf8');

      const phaseRerunResponse = await fetch(`${base}/api/missions/${missionId}/rerun`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          workflow_path: workflowPath,
          change_id: 'chg-rerun-1',
          phase_id: 'mutate',
          note: 'Retry mutate onwards',
        }),
      });
      assert.equal(phaseRerunResponse.status, 202);
      const phaseRerunPayload = await phaseRerunResponse.json();
      assert.equal(phaseRerunPayload.ok, true);
      assert.equal(phaseRerunPayload.rerun.phase_id, 'mutate');
      assert.equal(phaseRerunPayload.rerun.atom_id, null);

      await waitFor(async () => {
        const contents = readFileSync(stateFile, 'utf8');
        const state = JSON.parse(contents);
        return state.last_completed_phase === 'finish' && !state.rerun ? state : null;
      });

      const phaseLog = await waitFor(async () => {
        const response = await fetch(`${base}/api/logs/execution?limit=20`);
        const payload = await response.json();
        const started = payload.entries.find((entry) => entry.kind === 'workflow_started');
        const completed = payload.entries.find((entry) => entry.kind === 'workflow_completed');
        if (started && completed) {
          return payload.entries;
        }
        return null;
      });
      const phaseStart = phaseLog.find((entry) => entry.kind === 'workflow_started');
      assert.equal(phaseStart.rerun_phase, 'mutate');
      assert.equal(phaseStart.rerun_atom, null);
      assert.equal(phaseStart.resume_from_phase, 'setup');
      assert.equal(phaseStart.max_parallel_agents, 2);

      const rerunsResponse = await fetch(`${base}/api/missions/${missionId}/reruns`);
      assert.equal(rerunsResponse.status, 200);
      const rerunsPayload = await rerunsResponse.json();
      assert.equal(rerunsPayload.reruns.length >= 1, true);
      assert.equal(rerunsPayload.reruns[0].status, 'completed');

      writeFileSync(resolve(projectRoot, '.as-xflow', 'logs', 'execution.ndjson'), '', 'utf8');

      const atomRerunResponse = await fetch(`${base}/api/missions/${missionId}/rerun`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          workflow_path: workflowPath,
          change_id: 'chg-rerun-1',
          phase_id: 'mutate',
          atom_id: 'B2b.status.write',
          note: 'Retry only the writer atom',
        }),
      });
      assert.equal(atomRerunResponse.status, 202);
      const atomRerunPayload = await atomRerunResponse.json();
      assert.equal(atomRerunPayload.rerun.atom_id, 'B2b.status.write');

      await waitFor(async () => {
        const state = JSON.parse(readFileSync(stateFile, 'utf8'));
        return state.last_completed_phase === 'finish' && !state.rerun ? state : null;
      });

      const atomLog = await waitFor(async () => {
        const response = await fetch(`${base}/api/logs/execution?limit=20`);
        const payload = await response.json();
        const started = payload.entries.find((entry) => entry.kind === 'workflow_started');
        const completed = payload.entries.find((entry) => entry.kind === 'workflow_completed');
        if (started && completed) {
          return payload.entries;
        }
        return null;
      });
      const atomStart = atomLog.find((entry) => entry.kind === 'workflow_started');
      assert.equal(atomStart.rerun_phase, 'mutate');
      assert.equal(atomStart.rerun_atom, 'B2b.status.write');
      const rerunMutateAtoms = atomLog.filter((entry) => entry.kind === 'atom_run' && entry.phase_id === 'mutate').map((entry) => entry.atom_id);
      assert.deepEqual(rerunMutateAtoms, ['B2b.status.write']);

      const missionDetailResponse = await fetch(`${base}/api/missions/${missionId}`);
      const missionDetail = await missionDetailResponse.json();
      assert.equal(missionDetail.interventions.filter((entry) => entry.action === 'rerun').length, 2);
      assert.equal(missionDetail.controls.parallel_budget_override, 2);
      assert.equal(missionDetail.reruns.length, 2);
      assert.equal(missionDetail.operator_actions.some((entry) => entry.kind === 'budget_override'), true);
      assert.equal(missionDetail.operator_actions.some((entry) => entry.kind === 'rerun_request'), true);
      assert.equal(missionDetail.timeline.some((entry) => entry.kind === 'rerun'), true);
      const timelineResponse = await fetch(`${base}/api/missions/${missionId}/timeline`);
      const timelinePayload = await timelineResponse.json();
      assert.equal(Array.isArray(timelinePayload.timeline), true);
      assert.equal(timelinePayload.timeline.some((entry) => entry.kind === 'operator_action'), true);
      assert.equal(existsSync(dataFile), true);
      assert.equal(JSON.parse(readFileSync(statusFile, 'utf8')).marker, 'done');
    } finally {
      await new Promise((resolveClose) => server.close(resolveClose));
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
