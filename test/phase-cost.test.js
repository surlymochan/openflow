import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { buildPhaseCostReport, extractTokenUsage } from '../src/core/phase-cost.js';
import { WorkflowExecutor } from '../src/core/workflow-executor.js';

describe('phase cost report (pure accounting)', () => {
  test('sums phase durations and stays within tolerance of the wall clock', () => {
    const report = buildPhaseCostReport({
      phases: [
        { phase_id: 'intake', duration_ms: 100 },
        { phase_id: 'execute', duration_ms: 300 },
      ],
      wallClockMs: 410,
      recordedAt: '2026-11-04T00:00:00.000Z',
    });
    assert.equal(report.total_phase_ms, 400);
    assert.equal(report.wall_clock_ms, 410);
    assert.equal(report.unaccounted_ms, 10);
    assert.equal(report.drift_pct, 2.44);
    assert.equal(report.within_tolerance, true);
    assert.deepEqual(report.phases.map((phase) => phase.duration_share), [25, 75]);
  });

  test('flags accounting that cannot explain the wall clock', () => {
    const report = buildPhaseCostReport({
      phases: [{ phase_id: 'intake', duration_ms: 100 }],
      wallClockMs: 500,
    });
    assert.equal(report.drift_pct, 80);
    assert.equal(report.within_tolerance, false);
  });

  test('aggregates token usage across phases', () => {
    const report = buildPhaseCostReport({
      phases: [
        { phase_id: 'red', duration_ms: 10, tokens: { input: 100, output: 20, total: 120 } },
        { phase_id: 'green', duration_ms: 10, tokens: { input: 50, output: 10, total: 60 } },
      ],
      wallClockMs: 20,
    });
    assert.deepEqual(report.tokens, { input: 150, output: 30, total: 180 });
  });

  test('extractTokenUsage normalizes common usage shapes', () => {
    assert.deepEqual(extractTokenUsage({ usage: { input_tokens: 10, output_tokens: 5 } }), { input: 10, output: 5, total: 15 });
    assert.deepEqual(extractTokenUsage({ total_tokens: 7 }), { input: 0, output: 0, total: 7 });
    assert.equal(extractTokenUsage({ ok: true }), null);
    assert.equal(extractTokenUsage(null), null);
  });
});

describe('phase cost accounting (small workflow integration)', () => {
  // The two within_tolerance tests below use 1500 ms sleeps on purpose. The
  // executor's fixed overhead outside phases (run setup plus the
  // phase_completed log / state writes between phases) is tens of ms, and
  // the 5% tolerance is a share of the phase sum: with 2 x 400 ms sleeps
  // the budget is 40 ms, so a loaded machine trips it (observed 5.7%
  // drift on main, then 7/7 green on a quiet re-run of the same file).
  // At 2 x 1500 ms the same overhead is ~2% of the phase sum, with
  // headroom under load. The production tolerance and the accounting
  // itself are unchanged — the accounting correctly flagged the drift.
  test('a two-phase run writes a cost report whose phases sum to the wall clock', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'openflow-cost-'));
    try {
      mkdirSync(resolve(projectRoot, '.as-xflow'), { recursive: true });
      const modulePath = resolve(projectRoot, 'sleepy.mjs');
      writeFileSync(modulePath, `
        export default async function run() {
          await new Promise((done) => setTimeout(done, 1500));
          return { ok: true, usage: { input_tokens: 100, output_tokens: 50 } };
        }
      `, 'utf8');
      const registry = { atoms: { 'TEST.sleepy': { track: 'heavy', type: 'js', module: modulePath } } };
      const phases = [
        { id: 'red', label: 'Red', atoms: [{ id: 'TEST.sleepy' }], gate: { type: 'skip' } },
        { id: 'green', label: 'Green', atoms: [{ id: 'TEST.sleepy' }], gate: { type: 'skip' } },
      ];
      const executor = new WorkflowExecutor({
        workflow: { name: 'cost-smoke', track: 'heavy' },
        phases,
        registry,
        projectRoot,
        changeId: 'chg-cost-smoke',
        input: {},
      });
      await executor.run();

      const logLines = readFileSync(resolve(projectRoot, '.as-xflow', 'logs', 'execution.ndjson'), 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      const completed = logLines.find((entry) => entry.kind === 'workflow_completed');
      assert.ok(completed, 'workflow_completed event exists');
      const cost = completed.cost;
      assert.ok(cost, 'workflow_completed carries a cost report');
      assert.deepEqual(cost.phases.map((phase) => phase.phase_id), ['red', 'green']);
      for (const phase of cost.phases) {
        assert.ok(phase.duration_ms >= 1350, `phase ${phase.phase_id} duration reflects the sleep, got ${phase.duration_ms}`);
      }
      const summed = cost.phases.reduce((sum, phase) => sum + phase.duration_ms, 0);
      assert.equal(cost.total_phase_ms, summed);
      assert.ok(cost.wall_clock_ms >= cost.total_phase_ms, 'wall clock covers the phase sum');
      assert.equal(cost.within_tolerance, true, `drift ${cost.drift_pct}% must stay within ${cost.tolerance_pct}%`);
      assert.deepEqual(cost.tokens, { input: 200, output: 100, total: 300 });

      const phaseCompleted = logLines.filter((entry) => entry.kind === 'phase_completed');
      assert.equal(phaseCompleted.length, 2);
      assert.ok(phaseCompleted.every((entry) => Number.isFinite(entry.duration_ms)));
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('a completed run persists the cost report as a standalone evidence artifact', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'openflow-cost-'));
    try {
      const modulePath = resolve(projectRoot, 'sleepy.mjs');
      writeFileSync(modulePath, `
        export default async function run() {
          await new Promise((done) => setTimeout(done, 1500));
          return { ok: true, usage: { input_tokens: 40, output_tokens: 10 } };
        }
      `, 'utf8');
      const registry = { atoms: { 'TEST.sleepy': { track: 'heavy', type: 'js', module: modulePath } } };
      const phases = [
        { id: 'red', label: 'Red', atoms: [{ id: 'TEST.sleepy' }], gate: { type: 'skip' } },
        { id: 'green', label: 'Green', atoms: [{ id: 'TEST.sleepy' }], gate: { type: 'skip' } },
      ];
      const executor = new WorkflowExecutor({
        workflow: { name: 'cost-smoke', track: 'heavy' },
        phases,
        registry,
        projectRoot,
        changeId: 'chg-cost-smoke',
        input: {},
      });
      await executor.run();

      const artifact = JSON.parse(readFileSync(resolve(projectRoot, '.as-xflow', 'phase-cost.json'), 'utf8'));
      assert.deepEqual(artifact.phases.map((phase) => phase.phase_id), ['red', 'green']);
      assert.ok(artifact.phases.every((phase) => phase.status === 'completed'));
      assert.equal(artifact.total_phase_ms, artifact.phases.reduce((sum, phase) => sum + phase.duration_ms, 0));
      assert.equal(artifact.within_tolerance, true, `drift ${artifact.drift_pct}% must stay within ${artifact.tolerance_pct}%`);
      assert.deepEqual(artifact.tokens, { input: 80, output: 20, total: 100 });
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('a failed run still records the per-phase breakdown in its evidence', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'openflow-cost-'));
    try {
      const modulePath = resolve(projectRoot, 'sleepy.mjs');
      writeFileSync(modulePath, `
        export default async function run() {
          return { ok: true, usage: { input_tokens: 10, output_tokens: 5 } };
        }
      `, 'utf8');
      const registry = { atoms: { 'TEST.sleepy': { track: 'heavy', type: 'js', module: modulePath } } };
      const phases = [
        { id: 'red', label: 'Red', atoms: [{ id: 'TEST.sleepy' }], gate: { type: 'skip' } },
        {
          id: 'green',
          label: 'Green',
          atoms: [{ id: 'TEST.sleepy' }],
          gate: { type: 'skip' },
          preconditions: [{ phase_artifact: 'definitely-missing.txt', predicate: 'exists' }],
        },
      ];
      const executor = new WorkflowExecutor({
        workflow: { name: 'cost-smoke-fail', track: 'heavy' },
        phases,
        registry,
        projectRoot,
        changeId: 'chg-cost-smoke',
        input: {},
        exitOnFailure: false,
      });
      await assert.rejects(executor.run(), /precondition_failed/);

      const logLines = readFileSync(resolve(projectRoot, '.as-xflow', 'logs', 'execution.ndjson'), 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      const failed = logLines.find((entry) => entry.kind === 'workflow_failed');
      assert.ok(failed, 'workflow_failed event exists');
      assert.ok(failed.cost, 'workflow_failed carries a cost report');
      assert.deepEqual(
        failed.cost.phases.map((phase) => [phase.phase_id, phase.status]),
        [['red', 'completed'], ['green', 'failed']],
      );
      assert.equal(failed.cost.total_phase_ms, failed.cost.phases.reduce((sum, phase) => sum + phase.duration_ms, 0));
      assert.deepEqual(failed.cost.tokens, { input: 10, output: 5, total: 15 });

      const artifact = JSON.parse(readFileSync(resolve(projectRoot, '.as-xflow', 'phase-cost.json'), 'utf8'));
      assert.deepEqual(artifact.phases, failed.cost.phases);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
