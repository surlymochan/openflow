import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

function makeProjectRoot() {
  const root = mkdtempSync(join(tmpdir(), 'openflow-heavy-e2e-'));
  mkdirSync(resolve(root, '.as-xflow'), { recursive: true });
  return root;
}

function cleanupProjectRoot(root) {
  rmSync(root, { recursive: true, force: true });
}

function installFakePencil(projectRoot) {
  const fakeBin = resolve(projectRoot, 'bin');
  mkdirSync(fakeBin, { recursive: true });
  const fakePencil = resolve(fakeBin, 'pencil');
  writeFileSync(fakePencil, [
    '#!/bin/sh',
    'if [ "$1" = "status" ]; then',
    '  exit 0',
    'fi',
    'OUT=""',
    'PREVIEW=""',
    'IN=""',
    'while [ "$#" -gt 0 ]; do',
    '  case "$1" in',
    '    --out) OUT="$2"; shift 2 ;;',
    '    --in) IN="$2"; shift 2 ;;',
    '    --export) PREVIEW="$2"; shift 2 ;;',
    '    *) shift ;;',
    '  esac',
    'done',
    'mkdir -p "$(dirname "$OUT")"',
    'if [ -n "$IN" ] && [ -f "$IN" ]; then',
    '  cp "$IN" "$OUT"',
    'else',
    '  printf "PENCIL e2e\\n" > "$OUT"',
    'fi',
    'if [ -n "$PREVIEW" ]; then',
    '  mkdir -p "$(dirname "$PREVIEW")"',
    '  printf "PNG" > "$PREVIEW"',
    'fi',
  ].join('\n'));
  chmodSync(fakePencil, 0o755);
  return fakeBin;
}

function runWorkflow(repoRoot, projectRoot, workflowPath, changeId, extraEnv = {}) {
  return spawnSync('node', ['bin/xflow.js', 'workflow', 'run', workflowPath], {
    cwd: repoRoot,
    env: { ...process.env, ...extraEnv, CHANGE_ID: changeId, XFLOW_PROJECT_ROOT: projectRoot },
    encoding: 'utf8',
  });
}

function ackGate(repoRoot, projectRoot, phase, extraEnv = {}) {
  return spawnSync('node', ['bin/xflow.js', 'gate', 'ack', phase], {
    cwd: repoRoot,
    env: { ...process.env, ...extraEnv, XFLOW_PROJECT_ROOT: projectRoot },
    encoding: 'utf8',
  });
}

describe('Heavy workflow e2e', () => {
  test('custom heavy workflow can traverse llm-judge and human gates end-to-end', () => {
    const repoRoot = process.cwd();
    const projectRoot = makeProjectRoot(); // isolated temp dir for all state
    const changeId = 'chg-heavy-e2e-1';
    const workflowPath = resolve(repoRoot, '.tmp-heavy-e2e.yaml');
    const fakeBin = installFakePencil(projectRoot);
    const env = { PATH: `${fakeBin}:${process.env.PATH || ''}` };

    const workflow = `
name: heavy-e2e
version: 1
track: heavy
requires:
  agentos_http: false
  pencil: false
phases:
  - id: change-init
    label: "Change init"
    catalog_ref: 1
    required: true
    atoms:
      - id: B1.change.scaffold
        with: { change_type: "backend", title: "Heavy E2E" }
      - id: D1.mission.create
        with: { goal: "Heavy E2E", workspace: "${repoRoot}" }
      - id: B7.change_mission.bind
    gate:
      type: skip
  - id: explore
    label: "Explore"
    catalog_ref: 2
    required: true
    atoms:
      - id: G3.research.same_category
      - id: G2.intake.classify
      - id: D3a.phase_run.start
        with: { phase: "explore" }
      - id: I1b.team.run.structured
        with: { phase: "explore" }
      - id: D3c.phase_run.complete
    artifacts:
      - { path: "specs/changes/\${change_id}/explore.json", optional: false }
    gate:
      type: llm-judge
      on_fail: stop
  - id: clarify
    label: "Clarify"
    catalog_ref: 5
    required: true
    atoms:
      - id: D3a.phase_run.start
        with: { phase: "clarify" }
      - id: I1b.team.run.structured
        with: { phase: "clarify" }
      - id: D3c.phase_run.complete
    artifacts:
      - { path: "specs/changes/\${change_id}/clarify.json", optional: false }
    gate:
      type: human
      on_fail: stop
  - id: proposal
    label: "Proposal"
    catalog_ref: 6
    required: true
    atoms:
      - id: D3a.phase_run.start
        with: { phase: "proposal" }
      - id: I1b.team.run.structured
        with: { phase: "proposal" }
      - id: E4.gate.payload_from_phase_run
      - id: D3c.phase_run.complete
    artifacts:
      - { path: "specs/changes/\${change_id}/proposal.md", optional: false }
      - { path: "specs/changes/\${change_id}/proposal.json", optional: false }
    gate:
      type: artifact-verify
      on_fail: stop
  - id: design_contract_freeze
    label: "Design contract"
    catalog_ref: 8
    required: true
    atoms:
      - id: G4.design_skill.select
      - id: H2.design.contract_freeze
    artifacts:
      - { path: "specs/changes/\${change_id}/design_contract.json", optional: false }
    gate:
      type: artifact-verify
      on_fail: stop
  - id: visual_direction_synthesis
    label: "Direction"
    catalog_ref: 10
    required: true
    atoms:
      - id: H3a.visual.direction_synthesis
    artifacts:
      - { path: "specs/changes/\${change_id}/visual_direction_synthesis.json", optional: false }
    gate:
      type: llm-judge
      on_fail: stop
  - id: design_selection
    label: "Selection"
    catalog_ref: 12
    required: true
    atoms:
      - id: H3c.visual.design_selection
    artifacts:
      - { path: "specs/changes/\${change_id}/design_selection.json", optional: false }
    gate:
      type: human
      on_fail: stop
  - id: pencil_draft
    label: "Pencil draft"
    catalog_ref: 14
    required: true
    atoms:
      - id: H4a.pencil.draft
    artifacts:
      - { path: "specs/changes/\${change_id}/pencil_output.pen", optional: false }
    gate:
      type: artifact-verify
      on_fail: stop
  - id: design_accept
    label: "Design accept"
    catalog_ref: 17
    required: true
    atoms:
      - id: H4c.pencil.accept
    artifacts:
      - { path: "specs/changes/\${change_id}/design_accept.json", optional: false }
      - { path: "specs/changes/\${change_id}/pencil_output.attestation.json", optional: false }
    gate:
      type: human
      on_fail: stop
  - id: plan
    label: "Plan"
    catalog_ref: 18
    required: true
    atoms:
      - id: D3a.phase_run.start
        with: { phase: "plan" }
      - id: I1b.team.run.structured
        with: { phase: "plan" }
      - id: E4.gate.payload_from_phase_run
      - id: D3c.phase_run.complete
    artifacts:
      - { path: "specs/changes/\${change_id}/plan.json", optional: false }
      - { path: "specs/changes/\${change_id}/plan.md", optional: false }
    gate:
      type: artifact-verify
      on_fail: stop
  - id: review
    label: "Review"
    catalog_ref: 24
    required: true
    atoms:
      - id: I4.patch.challenge
        with: { mode: "review" }
      - id: J5.gate.evidence_collect
    artifacts:
      - { path: "specs/changes/\${change_id}/review.json", optional: false }
    gate:
      type: llm-judge
      on_fail: stop
  - id: gate_final
    label: "Gate final"
    catalog_ref: 26
    required: true
    atoms:
      - id: J5.gate.evidence_collect
      - id: E3.gate.workbench
      - id: K1.artifacts.complete_check
    artifacts:
      - { path: "specs/changes/\${change_id}/gate_final.json", optional: false }
    gate:
      type: human
      on_fail: stop
`;
    writeFileSync(workflowPath, workflow);

    try {
      let result = runWorkflow(repoRoot, projectRoot, workflowPath, changeId, env);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr + result.stdout, /Human gate: phase "clarify"/);

      assert.equal(ackGate(repoRoot, projectRoot, 'clarify', env).status, 0);
      result = runWorkflow(repoRoot, projectRoot, workflowPath, changeId, env);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr + result.stdout, /Human gate: phase "design_selection"/);

      assert.equal(ackGate(repoRoot, projectRoot, 'design_selection', env).status, 0);
      result = runWorkflow(repoRoot, projectRoot, workflowPath, changeId, env);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr + result.stdout, /Human gate: phase "design_accept"/);

      assert.equal(ackGate(repoRoot, projectRoot, 'design_accept', env).status, 0);
      result = runWorkflow(repoRoot, projectRoot, workflowPath, changeId, env);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr + result.stdout, /Human gate: phase "gate_final"/);

      assert.equal(ackGate(repoRoot, projectRoot, 'gate_final', env).status, 0);
      result = runWorkflow(repoRoot, projectRoot, workflowPath, changeId, env);
      assert.equal(result.status, 0);

      const gateFinal = JSON.parse(readFileSync(resolve(projectRoot, 'specs', 'changes', changeId, 'gate_final.json'), 'utf8'));
      assert.ok(gateFinal.recommendation);
      assert.equal(gateFinal.review_queue instanceof Array, true);
    } finally {
      rmSync(workflowPath, { force: true });
      cleanupProjectRoot(projectRoot);
    }
  });
});
