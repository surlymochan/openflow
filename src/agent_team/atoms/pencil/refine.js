import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { readJsonFile, resolveChangePath, writeJsonFile } from '../../../core/change-artifacts.js';
import { synthesizePhaseArtifact } from '../../common.js';
import { capturePageEvidence } from '../visual/page-evidence-capture.js';

async function capturePreview(projectRoot, changeId) {
  const contract = readJsonFile(resolveChangePath(projectRoot, changeId, 'corps-input.json'), {}) || {};
  const workspaceIndex = contract.workspace ? resolve(projectRoot, contract.workspace, 'index.html') : null;
  const captureUrl = typeof contract.capture_url === 'string' && contract.capture_url.trim()
    ? contract.capture_url.trim()
    : (workspaceIndex && existsSync(workspaceIndex) ? pathToFileURL(workspaceIndex).href : null);
  if (!captureUrl) return null;

  const primaryScenario = Array.isArray(contract.reference_scenarios_json) ? contract.reference_scenarios_json[0] : null;
  const viewport = primaryScenario?.viewport || {};
  return capturePageEvidence({
    url: captureUrl,
    screenshotPath: resolveChangePath(projectRoot, changeId, 'pencil_preview.png'),
    snapshotPath: resolveChangePath(projectRoot, changeId, 'pencil_snapshot.json'),
    width: viewport.width || 1440,
    height: viewport.height || 900,
    waitMs: 150,
  });
}

function flattenRepairTargets(benchmarkRepairPlan = {}) {
  const scenarios = Array.isArray(benchmarkRepairPlan?.scenario_repairs) ? benchmarkRepairPlan.scenario_repairs : [];
  return scenarios.flatMap((scenario) => (scenario.repairs || []).map((repair) => ({
    scenario_id: scenario.id || null,
    ...repair,
  })));
}

function unique(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).filter(Boolean))];
}

function primitiveFeedbackForChange(projectRoot, changeId) {
  const feedbackArtifact = readJsonFile(resolveChangePath(projectRoot, changeId, 'primitive_feedback_history.json'), null);
  const entries = Array.isArray(feedbackArtifact?.primitive_feedback_history?.entries)
    ? feedbackArtifact.primitive_feedback_history.entries
    : [];
  return new Map(entries.map((entry) => [`${entry.module}::${entry.primitive_role}`, entry]));
}

function summarizeScopeDecision(feedback = {}) {
  const current = Number(feedback.current_issue_score) || 0;
  const regression = Number(feedback.regression_score) || 0;
  const improvement = Number(feedback.improvement_score) || 0;
  const stabilization = Number(feedback.stabilization_score) || 0;
  if (current === 0 && stabilization > 0) return 'freeze';
  if (regression > 0 || current >= 4) return 'allow_big_change';
  if (improvement > 0 || current > 0) return 'micro_tune_only';
  return 'freeze';
}

function buildRefineScopes(repairTargets = [], blueprint = [], feedbackMap = new Map()) {
  const targetedIds = new Set(repairTargets.flatMap((repair) => repair.target_component_ids || []));
  const scopes = {
    allow_big_change: [],
    micro_tune_only: [],
    freeze: [],
  };
  const seen = new Set();

  for (const repair of repairTargets) {
    for (const componentId of repair.target_component_ids || []) {
      const component = blueprint.find((entry) => entry.id === componentId);
      if (!component) continue;
      const feedback = feedbackMap.get(`${component.module}::${component.primitive_role}`) || {};
      const decision = summarizeScopeDecision(feedback);
      if (seen.has(component.id)) continue;
      scopes[decision].push({
        component_id: component.id,
        module: component.module,
        primitive_role: component.primitive_role,
        decision,
        current_issue_score: Number(feedback.current_issue_score) || 0,
        improvement_score: Number(feedback.improvement_score) || 0,
        regression_score: Number(feedback.regression_score) || 0,
        stabilization_score: Number(feedback.stabilization_score) || 0,
      });
      seen.add(component.id);
    }
  }

  for (const component of blueprint) {
    if (targetedIds.has(component.id) || seen.has(component.id)) continue;
    const feedback = feedbackMap.get(`${component.module}::${component.primitive_role}`) || {};
    scopes.freeze.push({
      component_id: component.id,
      module: component.module,
      primitive_role: component.primitive_role,
      decision: 'freeze',
      current_issue_score: Number(feedback.current_issue_score) || 0,
      improvement_score: Number(feedback.improvement_score) || 0,
      regression_score: Number(feedback.regression_score) || 0,
      stabilization_score: Number(feedback.stabilization_score) || 0,
    });
    seen.add(component.id);
  }

  return scopes;
}

function buildRefinePenContent(changeId, existingPen, benchmarkRepairPlan = {}, generationContract = {}, refineScopes = null, designSystemPack = {}) {
  const repairTargets = flattenRepairTargets(benchmarkRepairPlan);
  const preserveIds = Array.isArray(generationContract?.component_constraints?.component_blueprint)
    ? generationContract.component_constraints.component_blueprint
      .map((component) => component.id)
      .filter((id) => !repairTargets.some((repair) => (repair.target_component_ids || []).includes(id)))
    : [];

  const repairLines = repairTargets.map((repair, index) => [
    `- ${index + 1}. ${repair.id}`,
    `  - scenario: ${repair.scenario_id || 'unknown'}`,
    `  - reason: ${repair.reason || 'unknown'}`,
    `  - priority: ${repair.priority || 'medium'}`,
    `  - target_component_ids: ${(repair.target_component_ids || []).join(', ') || '(none)'}`,
    `  - primitive_roles: ${(repair.target_primitive_roles || []).join(', ') || '(none)'}`,
    `  - focus_dimensions: ${(repair.focus_dimensions || []).join(', ') || '(none)'}`,
    `  - evidence_hotspots: ${(repair.evidence_hotspots || []).join(' | ') || '(none)'}`,
    `  - target_feedback_summary: ${(repair.target_feedback_summary || []).map((entry) => `${entry.component_id}:${entry.attention_score}/${entry.current_issue_score}`).join(' | ') || '(none)'}`,
    `  - instruction: ${repair.instruction || '(none)'}`,
  ].join('\n')).join('\n');

  const scopeLines = refineScopes
    ? Object.entries(refineScopes).map(([scope, entries]) => [
      `- ${scope}`,
      ...(entries.length > 0
        ? entries.map((entry) => `  - ${entry.component_id} (${entry.module}/${entry.primitive_role}) current=${entry.current_issue_score} improvement=${entry.improvement_score} regression=${entry.regression_score} stabilization=${entry.stabilization_score}`)
        : ['  - (none)']),
    ].join('\n')).join('\n')
    : '(none)';
  const designSystemSources = unique((designSystemPack.practice_sources || []).map((source) => source.id));
  const requiredStates = unique(designSystemPack.component_policy?.required_states || []);
  const allowedPrimitives = unique(designSystemPack.component_policy?.allowed_primitives || []);

  return [
    'PENCIL pencil_refine',
    `change_id: ${changeId}`,
    'execution_mode: targeted_component_refine',
    '',
    '[preserve_existing_draft]',
    existingPen?.trim() || '(no prior draft content found)',
    '',
    '[repair_targets]',
    repairLines || '(none)',
    '',
    '[refine_scopes]',
    scopeLines,
    '',
    '[preserve_non_targets]',
    preserveIds.join(', ') || '(none)',
    '',
    '[design_system_pack]',
    `profile: ${designSystemPack.profile || 'unspecified'}`,
    `practice_sources: ${designSystemSources.join(', ') || '(none)'}`,
    `allowed_primitives: ${allowedPrimitives.join(', ') || '(none)'}`,
    `required_states: ${requiredStates.join(', ') || '(none)'}`,
    '',
    '[guardrails]',
    '- Apply only the listed repair targets.',
    '- Preserve non-target components unless a repair target explicitly includes them.',
    '- Do not replace the entire shell when only local component families are failing benchmark.',
    '- allow_big_change targets may receive geometry and hierarchy rewrites inside their local bounds.',
    '- micro_tune_only targets may receive token, spacing, and copy-level adjustments only.',
    '- freeze targets must remain visually and structurally unchanged in this refine pass.',
    '- Keep refinements inside design_system_pack primitives, token policy, and required states.',
    '',
  ].join('\n');
}

export async function pencilRefine(input = {}, context = {}) {
  const projectRoot = context.projectRoot || process.cwd();
  const changeId = context.changeId || input.change_id || null;
  const existingPenText = changeId
    ? (() => {
      try {
        return readFileSync(resolveChangePath(projectRoot, changeId, 'pencil_output.pen'), 'utf8');
      } catch {
        return '';
      }
    })()
    : '';
  const benchmarkRepairArtifact = changeId
    ? readJsonFile(resolveChangePath(projectRoot, changeId, 'benchmark_repair_plan.json'), null)
    : null;
  const generationArtifact = changeId
    ? readJsonFile(resolveChangePath(projectRoot, changeId, 'generation_contract.json'), null)
    : null;
  const designSystemPack = changeId
    ? readJsonFile(resolveChangePath(projectRoot, changeId, 'design_system_pack.json'), {}) || {}
    : {};
  const benchmarkRepairPlan = benchmarkRepairArtifact?.benchmark_repair_plan || {};
  const generationContract = generationArtifact?.generation_contract || {};
  const repairTargets = flattenRepairTargets(benchmarkRepairPlan);
  const blueprint = Array.isArray(generationContract?.component_constraints?.component_blueprint)
    ? generationContract.component_constraints.component_blueprint
    : [];
  const feedbackMap = changeId ? primitiveFeedbackForChange(projectRoot, changeId) : new Map();
  const refineScopes = buildRefineScopes(repairTargets, blueprint, feedbackMap);
  const preserveNonTargets = refineScopes.freeze.map((entry) => entry.component_id);
  const penContent = buildRefinePenContent(changeId, existingPenText, benchmarkRepairPlan, generationContract, refineScopes, designSystemPack);
  const result = await synthesizePhaseArtifact(input, context, {
    phase: 'pencil_refine',
    summary: 'Pencil artifact refined using component-local repair targets only.',
    writePen: true,
    penContent,
  });
  if (changeId) {
    writeJsonFile(resolveChangePath(projectRoot, changeId, 'pencil_refine_targets.json'), {
      change_id: changeId,
      generated_at: new Date().toISOString(),
      repair_targets: repairTargets,
      refine_scopes: refineScopes,
      preserve_non_targets: preserveNonTargets,
      design_system_pack: {
        profile: designSystemPack.profile || null,
        practice_sources: unique((designSystemPack.practice_sources || []).map((source) => source.id)),
      },
    });
    await capturePreview(projectRoot, changeId).catch(() => null);
  }
  return result;
}
