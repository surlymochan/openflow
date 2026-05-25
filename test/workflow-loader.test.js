/**
 * Workflow Loader Tests
 *
 * Validates:
 * 1. Schema validation for yolo.yaml and corps.yaml
 * 2. Atom registry: every atom ID referenced in workflows exists in registry
 * 3. Track constraint: lite workflow atoms are all track=lite
 * 4. Phase catalog constraint: every phase.catalog_ref is 1–27
 * 5. No heavy atom appears in yolo.yaml
 * 6. E6 invariant: every deterministic gate uses E6.gate.local_precheck
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const registry = JSON.parse(readFileSync(resolve(ROOT, 'atoms', 'registry.json'), 'utf8'));
const yoloWorkflow = yaml.load(readFileSync(resolve(ROOT, 'workflows', 'yolo.yaml'), 'utf8'));
const corpsWorkflow = yaml.load(readFileSync(resolve(ROOT, 'workflows', 'corps.yaml'), 'utf8'));

function changeInitStatusFields(workflow) {
  const changeInit = workflow.phases.find((phase) => phase.id === 'change-init');
  const statusWrite = changeInit?.atoms?.find((atom) => atom.id === 'B2b.status.write');
  return statusWrite?.with?.fields || {};
}

describe('Registry integrity', () => {
  test('every registered atom has an implementation file', () => {
    const missing = [];
    for (const [id, def] of Object.entries(registry.atoms)) {
      if (def.type === 'python' || def.type === 'shell') {
        const scriptPath = resolve(ROOT, def.script);
        if (!existsSync(scriptPath)) {
          missing.push(`${id}: ${def.script}`);
        }
      } else if (def.type === 'js' || def.type === 'agent_invoke') {
        const modPath = resolve(ROOT, def.module);
        if (!existsSync(modPath)) {
          missing.push(`${id}: ${def.module}`);
        }
      }
    }
    assert.deepEqual(missing, [], `Missing atom implementations:\n${missing.join('\n')}`);
  });

  test('every atom has required fields: track, type, description or script/module', () => {
    const invalid = [];
    for (const [id, def] of Object.entries(registry.atoms)) {
      if (!def.track) invalid.push(`${id}: missing track`);
      if (!def.type) invalid.push(`${id}: missing type`);
      if (def.type === 'python' && !def.script) invalid.push(`${id}: python atom missing script`);
      if ((def.type === 'js' || def.type === 'agent_invoke') && !def.module) invalid.push(`${id}: ${def.type} atom missing module`);
    }
    assert.deepEqual(invalid, [], `Invalid atom definitions:\n${invalid.join('\n')}`);
  });

  test('no atom is registered as both lite and heavy', () => {
    // Each atom must have exactly one track
    for (const [id, def] of Object.entries(registry.atoms)) {
      assert(['lite', 'heavy'].includes(def.track), `${id}: invalid track "${def.track}"`);
    }
  });
});

describe('Workflow: yolo.yaml', () => {
  test('has required top-level fields', () => {
    assert.equal(yoloWorkflow.name, 'yolo');
    assert.equal(yoloWorkflow.track, 'lite');
    assert.equal(yoloWorkflow.requires.agentos_http, false);
    assert.equal(yoloWorkflow.requires.pencil, false);
    assert.ok(Array.isArray(yoloWorkflow.phases));
    assert.ok(yoloWorkflow.phases.length > 0);
  });

  test('all atom IDs exist in registry', () => {
    const missing = [];
    for (const phase of yoloWorkflow.phases) {
      for (const atomRef of (phase.atoms || [])) {
        if (!registry.atoms[atomRef.id]) {
          missing.push(`phase "${phase.id}": atom "${atomRef.id}"`);
        }
      }
      if (phase.gate?.atom && !registry.atoms[phase.gate.atom]) {
        missing.push(`phase "${phase.id}" gate: atom "${phase.gate.atom}"`);
      }
    }
    assert.deepEqual(missing, [], `Unknown atoms in yolo.yaml:\n${missing.join('\n')}`);
  });

  test('no heavy atoms in lite workflow', () => {
    const violations = [];
    for (const phase of yoloWorkflow.phases) {
      for (const atomRef of (phase.atoms || [])) {
        const def = registry.atoms[atomRef.id];
        if (def?.track === 'heavy') {
          violations.push(`phase "${phase.id}": heavy atom "${atomRef.id}" in lite workflow`);
        }
      }
    }
    assert.deepEqual(violations, [], `Track violations in yolo.yaml:\n${violations.join('\n')}`);
  });

  test('all catalog_refs are in range 1-27', () => {
    for (const phase of yoloWorkflow.phases) {
      if (phase.catalog_ref !== undefined) {
        assert.ok(phase.catalog_ref >= 1 && phase.catalog_ref <= 27,
          `Phase "${phase.id}": catalog_ref ${phase.catalog_ref} out of range 1-27`);
      }
    }
  });

  test('change-init resets stale archive state for fresh runs', () => {
    assert.equal(changeInitStatusFields(yoloWorkflow).archival_status, 'not_ready');
  });

  test('phase-transition deterministic gates use E6.gate.local_precheck (E6 invariant)', () => {
    // E6 invariant: when a gate is checking a yolo_gate.py-style phase transition
    // (pre-openissue, post-openissue, pre-exec, pre-archive), it MUST use E6.
    // Design-quality gates (H1.design.lite_gate) are a separate class of deterministic
    // check and are exempt from the E6 invariant.
    const YOLO_GATE_PHASES = ['pre-openissue', 'post-openissue', 'pre-exec', 'pre-archive'];
    for (const phase of yoloWorkflow.phases) {
      if (phase.gate?.type === 'deterministic' && phase.gate.atom && phase.gate.with?.phase) {
        if (YOLO_GATE_PHASES.includes(phase.gate.with.phase)) {
          assert.equal(phase.gate.atom, 'E6.gate.local_precheck',
            `Phase "${phase.id}": phase-transition gate must use E6.gate.local_precheck, got "${phase.gate.atom}"`);
        }
      }
    }
  });

  test('no llm-judge gates in lite workflow', () => {
    for (const phase of yoloWorkflow.phases) {
      assert.notEqual(phase.gate?.type, 'llm-judge',
        `Phase "${phase.id}": lite workflow cannot have llm-judge gate`);
    }
  });

  test('status machine allows yolo openissue to enter tdd execution', () => {
    const result = spawnSync('python3', [
      '-c',
      [
        'import sys',
        'sys.path.append("xflow/scripts")',
        'from common import assert_stage_transition_allowed',
        'assert_stage_transition_allowed("openissue", "tdd", current_status="active")',
      ].join('\n'),
    ], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  });

  test('verify-consistency phase records verify stage before archive', () => {
    const phase = yoloWorkflow.phases.find((entry) => entry.id === 'verify-consistency');
    assert.ok(phase, 'yolo.yaml missing verify-consistency phase');
    const transition = (phase.atoms || []).find((atomRef) => atomRef.id === 'B3.status.transition');
    const atomIds = (phase.atoms || []).map((atomRef) => atomRef.id);
    assert.ok(atomIds.includes('J4a.spec_consistency.structural'));
    assert.ok(atomIds.includes('J4b.spec_delta.review'));
    assert.equal(transition?.with?.to_stage, 'verify');
  });

  test('archive phase lets A5 own publish side effects before PR creation', () => {
    const phase = yoloWorkflow.phases.find((entry) => entry.id === 'archive');
    assert.ok(phase, 'yolo.yaml missing archive phase');
    const atomIds = (phase.atoms || []).map((atomRef) => atomRef.id);

    assert.equal(atomIds.includes('K2.merge_snippets.apply'), false,
      'K2 merge-snippets-only must not run before A5 because A5 already performs the full archive merge');
    assert.equal(atomIds.includes('K5.archive.publish'), false,
      'K5 must not run after A5 because A5 owns terminal archive status');
    assert.equal(atomIds.includes('B3.status.transition'), false,
      'archive phase must not add a terminal B3 transition after A5');

    const a5Index = atomIds.indexOf('A5.archive.commit_push_close');
    const a6Index = atomIds.indexOf('A6.pr.create');
    assert.notEqual(a5Index, -1, 'archive phase should include A5.archive.commit_push_close');
    assert.notEqual(a6Index, -1, 'archive phase should include A6.pr.create');
    assert.ok(a5Index < a6Index, 'A5 must commit and push before A6 opens the PR');

    const a5Atom = phase.atoms[a5Index];
    assert.equal(a5Atom.with.push, true);
    assert.equal(a5Atom.with.close_issue, true);
  });

  test('tdd red runs before execute and green quality review runs after execute', () => {
    const phaseIds = yoloWorkflow.phases.map((phase) => phase.id);
    assert.ok(
      phaseIds.indexOf('tdd-red') < phaseIds.indexOf('execute'),
      'red proof must run before implementation',
    );
    assert.ok(
      phaseIds.indexOf('execute') < phaseIds.indexOf('tdd-green'),
      'green proof must run after implementation',
    );

    const redPhase = yoloWorkflow.phases.find((phase) => phase.id === 'tdd-red');
    const greenPhase = yoloWorkflow.phases.find((phase) => phase.id === 'tdd-green');
    assert.ok(redPhase, 'tdd-red phase exists');
    assert.ok(greenPhase, 'tdd-green phase exists');

    const redRun = redPhase.atoms.find((atom) => atom.id === 'I6a.tdd.run' && atom.with?.phase === 'red');
    const greenRun = greenPhase.atoms.find((atom) => atom.id === 'I6a.tdd.run' && atom.with?.phase === 'green');

    assert.equal(redRun?.with?.test_command, '${input.tdd_red_command}');
    assert.equal(redRun?.with?.expect, 'fail');
    assert.equal(greenRun?.with?.test_command, '${input.tdd_green_command}');
    assert.equal(greenRun?.with?.expect, 'pass');
    assert.ok(greenPhase.atoms.some((atom) => atom.id === 'I6c.tdd.quality_review'));
  });
});

describe('Workflow: corps.yaml', () => {
  test('has required top-level fields', () => {
    assert.equal(corpsWorkflow.name, 'corps');
    assert.equal(corpsWorkflow.track, 'heavy');
    assert.equal(corpsWorkflow.requires.agentos_http, true);
    assert.equal(corpsWorkflow.requires.pencil, true);
    assert.ok(corpsWorkflow.phases.length > 20, 'corps should have > 20 phases');
  });

  test('all atom IDs exist in registry', () => {
    const missing = [];
    for (const phase of corpsWorkflow.phases) {
      for (const atomRef of (phase.atoms || [])) {
        if (!registry.atoms[atomRef.id]) {
          missing.push(`phase "${phase.id}": atom "${atomRef.id}"`);
        }
      }
    }
    assert.deepEqual(missing, [], `Unknown atoms in corps.yaml:\n${missing.join('\n')}`);
  });

  test('all catalog_refs are in range 1-27', () => {
    for (const phase of corpsWorkflow.phases) {
      if (phase.catalog_ref !== undefined) {
        assert.ok(phase.catalog_ref >= 1 && phase.catalog_ref <= 27,
          `Phase "${phase.id}": catalog_ref ${phase.catalog_ref} out of range 1-27`);
      }
    }
  });

  test('corps includes required milestone phases', () => {
    const ids = new Set(corpsWorkflow.phases.map(p => p.id));
    const required = ['explore', 'proposal', 'design_contract_freeze', 'competitor_reconstruction_review', 'pencil_draft',
                      'design_accept', 'plan', 'execute', 'qa', 'gate_final', 'archive'];
    for (const req of required) {
      assert.ok(ids.has(req), `corps.yaml missing required phase: "${req}"`);
    }
  });

  test('competitor reconstruction review is locked before visual direction work begins', () => {
    const phaseIds = corpsWorkflow.phases.map((phase) => phase.id);
    const reviewIndex = phaseIds.indexOf('competitor_reconstruction_review');
    const directionIndex = phaseIds.indexOf('visual_direction_synthesis');
    assert.notEqual(reviewIndex, -1, 'corps.yaml missing competitor_reconstruction_review');
    assert.notEqual(directionIndex, -1, 'corps.yaml missing visual_direction_synthesis');
    assert.ok(reviewIndex < directionIndex, 'competitor reconstruction review must freeze before visual direction synthesis');

    const phase = corpsWorkflow.phases.find((entry) => entry.id === 'competitor_reconstruction_review');
    assert.ok(phase, 'corps.yaml missing competitor_reconstruction_review phase');
    assert.ok((phase.atoms || []).some((atomRef) => atomRef.id === 'H2b.design.competitor_reconstruction_review'));
    assert.ok((phase.atoms || []).some((atomRef) => atomRef.id === 'H2d.design.reference_surface_lock'));
    assert.ok((phase.atoms || []).some((atomRef) => atomRef.id === 'H2e.design.reconstruction_pack'));
    assert.ok((phase.atoms || []).some((atomRef) => atomRef.id === 'H2f.design.generation_contract'));
    assert.ok((phase.artifacts || []).some((artifact) => artifact.path.includes('competitor_reconstruction_review.json')));
    assert.ok((phase.artifacts || []).some((artifact) => artifact.path.includes('reference_surface_lock.json')));
    assert.ok((phase.artifacts || []).some((artifact) => artifact.path.includes('reconstruction_pack.json')));
    assert.ok((phase.artifacts || []).some((artifact) => artifact.path.includes('generation_contract.json')));
    assert.ok((phase.artifacts || []).some((artifact) => artifact.path.includes('design_system_pack.json')));
    assert.equal(phase.gate?.type, 'deterministic');
    assert.equal(phase.gate?.atom, 'H2c.design.competitor_contract_validate');
  });

  test('corps qa phase keeps tests and spec delta review together', () => {
    const phase = corpsWorkflow.phases.find((entry) => entry.id === 'qa');
    assert.ok(phase, 'corps.yaml missing qa phase');
    const atomIds = (phase.atoms || []).map((atomRef) => atomRef.id);

    assert.ok(atomIds.includes('J1.tests.run'));
    assert.ok(atomIds.includes('J4b.spec_delta.review'));
    assert.ok(atomIds.indexOf('J1.tests.run') < atomIds.indexOf('J4b.spec_delta.review'));
  });

  test('corps execute phase must produce required execution evidence', () => {
    const phase = corpsWorkflow.phases.find((entry) => entry.id === 'execute');
    assert.ok(phase, 'corps.yaml missing execute phase');
    assert.equal(phase.gate?.type, 'artifact-verify');
    const requiredArtifacts = (phase.artifacts || [])
      .filter((artifact) => artifact.optional !== true)
      .map((artifact) => artifact.path);

    assert.deepEqual(requiredArtifacts, ['specs/changes/${change_id}/execute.json']);
  });

  test('B7.change_mission.bind appears in change-init (the only coupling point)', () => {
    const changeInit = corpsWorkflow.phases.find(p => p.id === 'change-init');
    assert.ok(changeInit, 'corps.yaml missing change-init phase');
    const hasB7 = (changeInit.atoms || []).some(a => a.id === 'B7.change_mission.bind');
    assert.ok(hasB7, 'change-init must include B7.change_mission.bind');
  });

  test('corps change-init resets stale archive state for full proof reruns', () => {
    assert.equal(changeInitStatusFields(corpsWorkflow).archival_status, 'not_ready');
  });

  test('corps marks the visual review pair as a parallel group', () => {
    const review = corpsWorkflow.phases.find((phase) => phase.id === 'llm_design_review');
    assert.ok(review, 'corps.yaml missing llm_design_review phase');
    const atoms = review.atoms || [];
    assert.equal(corpsWorkflow.parallel?.policy, 'weighted');
    assert.equal(corpsWorkflow.parallel?.max_agents, 3);
    assert.equal(atoms[0]?.parallel_group, 'visual_review');
    assert.equal(atoms[0]?.parallel_weight, 2);
    assert.equal(atoms[1]?.parallel_group, 'visual_review');
    assert.equal(atoms[1]?.parallel_weight, 1);
    assert.equal(atoms[2]?.id, 'H5b.visual.review.aggregate');
    assert.equal(review.gate?.type, 'deterministic');
    assert.equal(review.gate?.atom, 'H6b.visual.benchmark_validate');
    assert.equal(review.gate?.with?.mode, 'advisory');
  });

  test('corps routes unresolved benchmark evidence into scripted refine + recheck phases', () => {
    const phaseIds = corpsWorkflow.phases.map((phase) => phase.id);
    const reviewIndex = phaseIds.indexOf('llm_design_review');
    const refineIndex = phaseIds.indexOf('pencil_refine');
    const recheckIndex = phaseIds.indexOf('llm_design_recheck');
    const acceptIndex = phaseIds.indexOf('design_accept');
    assert.ok(reviewIndex < refineIndex && refineIndex < recheckIndex && recheckIndex < acceptIndex);

    const refine = corpsWorkflow.phases.find((phase) => phase.id === 'pencil_refine');
    assert.ok(refine, 'corps.yaml missing pencil_refine phase');
    assert.ok((refine.atoms || []).some((atomRef) => atomRef.id === 'H6c.visual.benchmark_repair_plan'));
    assert.ok((refine.artifacts || []).some((artifact) => artifact.path.includes('benchmark_repair_plan.json')));

    const recheck = corpsWorkflow.phases.find((phase) => phase.id === 'llm_design_recheck');
    assert.ok(recheck, 'corps.yaml missing llm_design_recheck phase');
    const recheckAtoms = recheck.atoms || [];
    assert.equal(recheckAtoms[0]?.id, 'H5.visual.review');
    assert.equal(recheckAtoms[1]?.id, 'H6.visual.benchmark');
    assert.equal(recheckAtoms[2]?.id, 'H5b.visual.review.aggregate');
    assert.equal(recheckAtoms[3]?.id, 'H6d.visual.aesthetic_review');
    assert.ok((recheck.artifacts || []).some((artifact) => artifact.path.includes('aesthetic_review.json')));
    assert.equal(recheck.gate?.atom, 'H6b.visual.benchmark_validate');
  });

  test('corps routes structured pre-implementation phases through deterministic team-run synthesis', () => {
    const structuredPhaseIds = ['explore', 'brainstorm', 'risk_review', 'clarify', 'proposal', 'ux_design_brief', 'plan'];
    for (const phaseId of structuredPhaseIds) {
      const phase = corpsWorkflow.phases.find((entry) => entry.id === phaseId);
      assert.ok(phase, `corps.yaml missing ${phaseId} phase`);
      const atomIds = (phase.atoms || []).map((atomRef) => atomRef.id);
      assert.ok(atomIds.includes('I1b.team.run.structured'), `${phaseId} should use I1b.team.run.structured`);
      assert.equal(atomIds.includes('I1.team.run'), false, `${phaseId} should not rely on long-running I1.team.run`);
    }
  });

  test('corps freezes contract locally, then routes Pencil through strict agent_invoke', () => {
    const contractPhase = corpsWorkflow.phases.find((entry) => entry.id === 'design_contract_freeze');
    const directionPhase = corpsWorkflow.phases.find((entry) => entry.id === 'visual_direction_synthesis');
    const layoutPhase = corpsWorkflow.phases.find((entry) => entry.id === 'layout_competition');
    const selectionPhase = corpsWorkflow.phases.find((entry) => entry.id === 'design_selection');

    assert.ok(contractPhase);
    assert.equal((contractPhase.atoms || [])[1]?.id, 'H2.design.contract_freeze');
    assert.equal(registry.atoms['H2.design.contract_freeze']?.type, 'js');

    assert.ok(directionPhase);
    assert.equal((directionPhase.atoms || [])[0]?.id, 'H3a.visual.direction_synthesis');
    assert.equal(registry.atoms['H3a.visual.direction_synthesis']?.type, 'js');
    assert.ok((directionPhase.artifacts || []).some((artifact) => artifact.path.includes('image_reference_set.json')));

    assert.ok(layoutPhase);
    assert.equal(registry.atoms['H3b.visual.layout_competition']?.type, 'js');

    assert.ok(selectionPhase);
    assert.equal(registry.atoms['H3c.visual.design_selection']?.type, 'js');
    assert.equal(registry.atoms['H4a.pencil.draft']?.type, 'agent_invoke');
    assert.equal(registry.atoms['H4a.pencil.draft']?.agent_config?.require_real_runtime, true);
    assert.equal(registry.atoms['H4b.pencil.refine']?.type, 'agent_invoke');
    assert.equal(registry.atoms['H4b.pencil.refine']?.agent_config?.require_real_runtime, true);
    assert.equal(registry.atoms['H4c.pencil.accept']?.type, 'js');
    assert.equal(registry.atoms['H6d.visual.aesthetic_review']?.type, 'js');
  });

  test('archive phase lets A5 own publish side effects before PR creation', () => {
    const phase = corpsWorkflow.phases.find((entry) => entry.id === 'archive');
    assert.ok(phase, 'corps.yaml missing archive phase');
    const atomIds = (phase.atoms || []).map((atomRef) => atomRef.id);

    assert.equal(atomIds.includes('K2.merge_snippets.apply'), false,
      'K2 merge-snippets-only must not run before A5 because A5 already performs the full archive merge');
    assert.equal(atomIds.includes('K5.archive.publish'), false,
      'K5 must not run after A5 because A5 owns terminal archive status');
    assert.equal(atomIds.includes('B3.status.transition'), false,
      'archive phase must not add a terminal B3 transition after A5');
    assert.equal(atomIds.includes('A4.project.set_status'), false,
      'A5 owns linked issue/project close-out for archive publish');

    const a5Index = atomIds.indexOf('A5.archive.commit_push_close');
    const a6Index = atomIds.indexOf('A6.pr.create');
    assert.notEqual(a5Index, -1, 'archive phase should include A5.archive.commit_push_close');
    assert.notEqual(a6Index, -1, 'archive phase should include A6.pr.create');
    assert.ok(a5Index < a6Index, 'A5 must commit and push before A6 opens the PR');

    const a5Atom = phase.atoms[a5Index];
    assert.equal(a5Atom.with.push, true);
    assert.equal(a5Atom.with.close_issue, true);
  });
});

describe('Atom track isolation', () => {
  test('lite atoms do not import heavy modules (script path heuristic)', () => {
    // Verify lite Python atoms do NOT contain imports of engine.js or agent_team
    // (heuristic: check import statements in the Python files)
    const liteAtoms = Object.entries(registry.atoms).filter(([, d]) => d.track === 'lite' && d.type === 'python');
    const violations = [];
    for (const [id, def] of liteAtoms) {
      const scriptPath = resolve(ROOT, def.script);
      if (existsSync(scriptPath)) {
        const content = readFileSync(scriptPath, 'utf8');
        if (content.includes('engine.js') || content.includes('agent_team') || content.includes('runner.js')) {
          violations.push(`${id}: imports heavy module`);
        }
      }
    }
    assert.deepEqual(violations, [], `Track isolation violations:\n${violations.join('\n')}`);
  });
});
