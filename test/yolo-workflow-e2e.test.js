/**
 * Yolo workflow e2e test
 *
 * Tests the lite-track workflow mechanics without GitHub CLI dependency:
 *   - change-init scaffold + status.json creation
 *   - human gate pause/resume (brainstorm, execute)
 *   - artifact-verify gates (proposal.md, plan.md, tasks.md)
 *   - TDD proof artifact creation (I6a/I6b round-trip)
 *   - J4a structural consistency check
 *   - J1 test runner reading commands from plan.md
 *   - Status transitions via B3
 *
 * GitHub atoms (A1-A5, A6) are excluded from the test workflow to keep it offline.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { WorkflowExecutor } from '../src/core/workflow-executor.js';
import { load } from '../src/core/workflow-loader.js';

const REPO_ROOT = process.cwd();
const CHANGE_ID = 'chg-yolo-e2e-1';

function makeProjectRoot() {
  const root = mkdtempSync(join(tmpdir(), 'as-xflow-yolo-e2e-'));
  mkdirSync(resolve(root, '.as-xflow'), { recursive: true });
  return root;
}

function cleanupProjectRoot(root) {
  rmSync(root, { recursive: true, force: true });
}

function runWorkflow(projectRoot, workflowPath) {
  return spawnSync('node', ['bin/xflow.js', 'workflow', 'run', workflowPath], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      CHANGE_ID,
      XFLOW_PROJECT_ROOT: projectRoot,
    },
    encoding: 'utf8',
  });
}

function ackGate(projectRoot, phase) {
  return spawnSync('node', ['bin/xflow.js', 'gate', 'ack', phase], {
    cwd: REPO_ROOT,
    env: { ...process.env, XFLOW_PROJECT_ROOT: projectRoot },
    encoding: 'utf8',
  });
}

/**
 * Pre-populate fixture artifacts that the workflow expects to find via artifact-verify gates.
 * In real usage these are written by the LLM during each phase.
 */
function populateFixtureArtifacts(projectRoot) {
  const changeDir = resolve(projectRoot, 'specs', 'changes', CHANGE_ID);
  mkdirSync(changeDir, { recursive: true });

  writeFileSync(resolve(changeDir, 'proposal.md'), [
    '# Proposal: Yolo E2E Test Change',
    '',
    '## Problem',
    'Validate the yolo workflow e2e traversal.',
    '',
    '## Solution',
    'Run a focused lightweight workflow fixture.',
    '',
    '## Acceptance',
    '- [ ] Workflow traverses all phases',
    '- [ ] Human gates pause and resume correctly',
  ].join('\n'));

  writeFileSync(resolve(changeDir, 'plan.md'), [
    '# Plan',
    '',
    '## Steps',
    '1. Scaffold change',
    '2. Write proposal',
    '3. Write plan',
    '4. Execute',
    '',
    '## Verification',
    '',
    '```bash',
    'echo "yolo-e2e verify ok"',
    '```',
  ].join('\n'));

  writeFileSync(resolve(changeDir, 'tasks.md'), [
    '# Tasks',
    '',
    '- [ ] scaffold change dir',
    '- [ ] write proposal.md',
    '- [ ] write plan.md',
    '- [ ] write tasks.md',
  ].join('\n'));
}

/**
 * Build a custom yolo-style workflow YAML that exercises lite-track mechanics
 * without requiring GitHub CLI (A1-A5 are omitted).
 */
function buildTestWorkflow(projectRoot) {
  return `
name: yolo-e2e-test
version: 1
track: lite
requires:
  agentos_http: false
  gh: false
  pencil: false

phases:
  - id: change-init
    label: "01 · Change init"
    catalog_ref: 1
    required: true
    atoms:
      - id: B1.change.scaffold
        with: { change_type: "backend", title: "Yolo E2E Test" }
      - id: B2b.status.write
        with:
          fields:
            current_stage: "change-init"
            status: "draft"
      - id: B7.change_mission.bind
        with: { direction: "change_to_mission" }
    artifacts:
      - { path: "specs/changes/\${change_id}/status.json", optional: false }
    gate:
      type: skip

  - id: brainstorm
    label: "03 · Brainstorm"
    catalog_ref: 3
    required: true
    atoms:
      - id: B3.status.transition
        with: { to_stage: "brainstorm" }
    gate:
      type: human
      on_fail: stop

  - id: proposal
    label: "06 · Proposal freeze"
    catalog_ref: 6
    required: true
    atoms:
      - id: B3.status.transition
        with: { to_stage: "proposal-freeze" }
    artifacts:
      - { path: "specs/changes/\${change_id}/proposal.md", optional: false }
    gate:
      type: artifact-verify
      on_fail: stop

  - id: proposal-consistency-check
    label: "07 · Proposal consistency check"
    catalog_ref: 7
    required: true
    atoms:
      - id: J4a.spec_consistency.structural
      - id: B3.status.transition
        with: { to_stage: "proposal-consistency-check" }
    gate:
      type: skip

  - id: plan
    label: "18 · Plan"
    catalog_ref: 18
    required: true
    atoms:
      - id: B3.status.transition
        with: { to_stage: "plan" }
    artifacts:
      - { path: "specs/changes/\${change_id}/plan.md", optional: false }
      - { path: "specs/changes/\${change_id}/tasks.md", optional: false }
    gate:
      type: artifact-verify
      on_fail: stop

  - id: tdd-red
    label: "21a · TDD red"
    catalog_ref: 21
    required: true
    atoms:
      - id: I6a.tdd.run
        with: { phase: "red", test_command: "exit 1" }
      - id: I6b.tdd.proof_validate
        with: { phase: "red" }
      - id: B3.status.transition
        with: { to_stage: "tdd" }
    artifacts:
      - { path: "specs/changes/\${change_id}/tdd/red-0.json", optional: false }
    gate:
      type: artifact-verify
      on_fail: advance-with-warning

  - id: execute
    label: "22 · Execute"
    catalog_ref: 22
    required: true
    atoms:
      - id: B3.status.transition
        with: { to_stage: "execute" }
    gate:
      type: human
      on_fail: stop

  - id: tdd-green
    label: "21b · TDD green"
    catalog_ref: 21
    required: true
    atoms:
      - id: I6a.tdd.run
        with: { phase: "green", test_command: "true" }
      - id: I6b.tdd.proof_validate
        with: { phase: "green" }
      - id: I6c.tdd.quality_review
    artifacts:
      - { path: "specs/changes/\${change_id}/tdd/green-0.json", optional: false }
      - { path: "specs/changes/\${change_id}/tdd/quality-0.json", optional: false }
    gate:
      type: artifact-verify
      on_fail: stop

  - id: verify-consistency
    label: "23 · Verify consistency"
    catalog_ref: 23
    required: true
    atoms:
      - id: J1.tests.run
      - id: J4a.spec_consistency.structural
      - id: B2b.status.write
        with:
          fields:
            verification_status: "complete"
    gate:
      type: skip

  - id: done
    label: "27 · Done"
    catalog_ref: 27
    required: true
    atoms:
      - id: K1.artifacts.complete_check
      - id: B3.status.transition
        with: { to_stage: "archive", to_status: "done" }
    gate:
      type: skip
`;
}

function writeArchivePublishMockFixture(projectRoot) {
  const { workflow, phases, registry } = load('workflows/yolo.yaml', { skipRuntimeChecks: true });
  const archivePhase = phases.find((phase) => phase.id === 'archive');
  assert.ok(archivePhase, 'yolo.yaml should include archive phase');

  const mockDir = resolve(projectRoot, 'mock-atoms');
  mkdirSync(mockDir, { recursive: true });
  writeFileSync(resolve(mockDir, 'mock-common.mjs'), `
    import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
    import { dirname, resolve } from 'node:path';

    export function appendEvent(context, atom, input = {}) {
      const eventPath = resolve(context.projectRoot, '.as-xflow', 'mock-events.json');
      mkdirSync(dirname(eventPath), { recursive: true });
      const events = existsSync(eventPath) ? JSON.parse(readFileSync(eventPath, 'utf8')) : [];
      events.push({ atom, input, change_id: context.changeId, index: events.length });
      writeFileSync(eventPath, JSON.stringify(events, null, 2));
      return { ok: true, status: 'completed', event_index: events.length - 1 };
    }
  `, 'utf8');

  const passthroughAtoms = [
    'K1.artifacts.complete_check',
    'K6.aha.merge',
    'K3.handoff.refresh',
    'K4.mem.lesson_persist',
  ];
  for (const atomId of passthroughAtoms) {
    const filename = `${atomId.replaceAll('.', '-')}.mjs`;
    writeFileSync(resolve(mockDir, filename), `
      import { appendEvent } from './mock-common.mjs';
      export default async function run(input = {}, context = {}) {
        return appendEvent(context, '${atomId}', input);
      }
    `, 'utf8');
  }

  writeFileSync(resolve(mockDir, 'A5-archive-commit-push-close.mjs'), `
    import { mkdirSync, writeFileSync } from 'node:fs';
    import { dirname, resolve } from 'node:path';
    import { appendEvent } from './mock-common.mjs';

    export default async function run(input = {}, context = {}) {
      const event = appendEvent(context, 'A5.archive.commit_push_close', input);
      const archiveCommitId = 'mock-archive-' + context.changeId;
      const outputPath = resolve(context.projectRoot, '.as-xflow', 'mock-archive-publish.json');
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, JSON.stringify({
        published: true,
        pushed: input.push === true,
        closed_issue: input.close_issue === true,
        archive_commit_id: archiveCommitId,
        event_index: event.event_index
      }, null, 2));
      return { ok: true, status: 'published', archive_commit_id: archiveCommitId };
    }
  `, 'utf8');

  writeFileSync(resolve(mockDir, 'A6-pr-create.mjs'), `
    import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
    import { dirname, resolve } from 'node:path';
    import { appendEvent } from './mock-common.mjs';

    export default async function run(input = {}, context = {}) {
      const publishPath = resolve(context.projectRoot, '.as-xflow', 'mock-archive-publish.json');
      const event = appendEvent(context, 'A6.pr.create', input);
      if (!existsSync(publishPath)) {
        return { ok: false, status: 'missing_archive_publish' };
      }
      const archivePublish = JSON.parse(readFileSync(publishPath, 'utf8'));
      const outputPath = resolve(context.projectRoot, '.as-xflow', 'mock-pr-create.json');
      mkdirSync(dirname(outputPath), { recursive: true });
      const payload = {
        pr_url: 'mock://pull/yolo-archive-e2e',
        saw_archive_publish: archivePublish.published === true,
        archive_commit_id: archivePublish.archive_commit_id,
        event_index: event.event_index
      };
      writeFileSync(outputPath, JSON.stringify(payload, null, 2));
      return { ok: payload.saw_archive_publish, status: 'pr_created', pr_url: payload.pr_url };
    }
  `, 'utf8');

  const mockModules = {
    'K1.artifacts.complete_check': resolve(mockDir, 'K1-artifacts-complete_check.mjs'),
    'K6.aha.merge': resolve(mockDir, 'K6-aha-merge.mjs'),
    'K3.handoff.refresh': resolve(mockDir, 'K3-handoff-refresh.mjs'),
    'K4.mem.lesson_persist': resolve(mockDir, 'K4-mem-lesson_persist.mjs'),
    'A5.archive.commit_push_close': resolve(mockDir, 'A5-archive-commit-push-close.mjs'),
    'A6.pr.create': resolve(mockDir, 'A6-pr-create.mjs'),
  };

  const fixtureRegistry = JSON.parse(JSON.stringify(registry));
  for (const atomRef of archivePhase.atoms) {
    const modulePath = mockModules[atomRef.id];
    assert.ok(modulePath, `archive fixture missing mock for ${atomRef.id}`);
    fixtureRegistry.atoms[atomRef.id] = { track: 'lite', type: 'js', module: modulePath };
  }

  return {
    workflow: { ...workflow, name: 'yolo-archive-e2e-mock', requires: { agentos_http: false, gh: false, pencil: false } },
    phases: [{ ...archivePhase, atoms: archivePhase.atoms.map((atomRef) => ({ ...atomRef })), gate: { type: 'skip', on_fail: 'stop' } }],
    registry: fixtureRegistry,
  };
}

describe('Yolo workflow e2e', () => {
  test('traverses change-init → brainstorm (human) → proposal → plan → tdd → execute (human) → done', () => {
    const projectRoot = makeProjectRoot();
    const workflowPath = resolve(REPO_ROOT, '.tmp-yolo-e2e.yaml');

    try {
      populateFixtureArtifacts(projectRoot);
      writeFileSync(workflowPath, buildTestWorkflow(projectRoot));

      // ── Run 1: expect stop at brainstorm human gate ────────────────────────
      let result = runWorkflow(projectRoot, workflowPath);
      assert.notEqual(result.status, 0, `run 1 should stop at human gate\n${result.stderr}${result.stdout}`);
      assert.match(result.stderr + result.stdout, /Human gate: phase "brainstorm"/,
        `expected brainstorm gate\n${result.stderr}${result.stdout}`);

      // status.json should exist after change-init
      const statusPath = resolve(projectRoot, 'specs', 'changes', CHANGE_ID, 'status.json');
      const status = JSON.parse(readFileSync(statusPath, 'utf8'));
      assert.ok(status.current_stage, 'status.json should have current_stage');

      // ── Ack brainstorm, run 2: expect stop at execute human gate ──────────
      assert.equal(ackGate(projectRoot, 'brainstorm').status, 0, 'ackGate brainstorm should succeed');
      result = runWorkflow(projectRoot, workflowPath);
      assert.notEqual(result.status, 0, `run 2 should stop at execute gate\n${result.stderr}${result.stdout}`);
      assert.match(result.stderr + result.stdout, /Human gate: phase "execute"/,
        `expected execute gate\n${result.stderr}${result.stdout}`);

      // Red proof exists before the execute implementation gate.
      const redProof = JSON.parse(readFileSync(
        resolve(projectRoot, 'specs', 'changes', CHANGE_ID, 'tdd', 'red-0.json'), 'utf8'));
      assert.equal(redProof.phase, 'red', 'red proof phase field');
      assert.equal(redProof.passed, false, 'red proof should be a failing test');

      // ── Ack execute, run 3: expect full completion ────────────────────────
      assert.equal(ackGate(projectRoot, 'execute').status, 0, 'ackGate execute should succeed');
      result = runWorkflow(projectRoot, workflowPath);
      assert.equal(result.status, 0,
        `run 3 should complete successfully\n${result.stderr}${result.stdout}`);
      assert.match(result.stderr + result.stdout, /Workflow "yolo-e2e-test" completed/,
        `expected completion message\n${result.stderr}${result.stdout}`);

      const greenProof = JSON.parse(readFileSync(
        resolve(projectRoot, 'specs', 'changes', CHANGE_ID, 'tdd', 'green-0.json'), 'utf8'));
      assert.equal(greenProof.phase, 'green', 'green proof phase field');
      assert.equal(greenProof.passed, true, 'green proof should be a passing test');

      const qualityProof = JSON.parse(readFileSync(
        resolve(projectRoot, 'specs', 'changes', CHANGE_ID, 'tdd', 'quality-0.json'), 'utf8'));
      assert.equal(qualityProof.ok, true, 'quality proof should pass for no code changes');

      // Final status should reflect done
      const finalStatus = JSON.parse(readFileSync(statusPath, 'utf8'));
      assert.equal(finalStatus.status, 'done', 'final status should be done');

    } finally {
      rmSync(workflowPath, { force: true });
      cleanupProjectRoot(projectRoot);
    }
  });

  test('archive phase publishes before PR creation with mock atoms', async () => {
    const projectRoot = makeProjectRoot();
    try {
      const fixture = writeArchivePublishMockFixture(projectRoot);
      const executor = new WorkflowExecutor({
        workflow: fixture.workflow,
        phases: fixture.phases,
        registry: fixture.registry,
        projectRoot,
        changeId: 'chg-yolo-archive-e2e',
        input: { lesson_summary: 'archive e2e lesson' },
      });

      await executor.run();

      const archivePublish = JSON.parse(readFileSync(resolve(projectRoot, '.as-xflow', 'mock-archive-publish.json'), 'utf8'));
      const prCreate = JSON.parse(readFileSync(resolve(projectRoot, '.as-xflow', 'mock-pr-create.json'), 'utf8'));
      const mockEvents = JSON.parse(readFileSync(resolve(projectRoot, '.as-xflow', 'mock-events.json'), 'utf8'));
      const eventAtomIds = mockEvents.map((event) => event.atom);
      assert.ok(
        eventAtomIds.indexOf('A5.archive.commit_push_close') < eventAtomIds.indexOf('A6.pr.create'),
        `mock events should run A5 before A6, got ${eventAtomIds.join(' -> ')}`,
      );

      const logLines = readFileSync(resolve(projectRoot, '.as-xflow', 'logs', 'execution.ndjson'), 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      const atomRunIds = logLines.filter((entry) => entry.kind === 'atom_run').map((entry) => entry.atom_id);
      assert.ok(
        atomRunIds.indexOf('A5.archive.commit_push_close') < atomRunIds.indexOf('A6.pr.create'),
        `execution log should run A5 before A6, got ${atomRunIds.join(' -> ')}`,
      );
      assert.equal(archivePublish.published, true);
      assert.equal(prCreate.saw_archive_publish, true);
      assert.equal(prCreate.archive_commit_id, archivePublish.archive_commit_id);
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });
});
