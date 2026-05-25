import { existsSync } from 'node:fs';
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

function unique(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).filter(Boolean))];
}

function designSystemSourcesFromPack(designSystemPack = {}) {
  return unique((designSystemPack.practice_sources || []).map((source) => source.id));
}

function deriveHistorySignals(benchmarkRepairPlan = {}, blueprint = []) {
  const scenarioRepairs = Array.isArray(benchmarkRepairPlan?.scenario_repairs) ? benchmarkRepairPlan.scenario_repairs : [];
  const componentToPrimitive = new Map(blueprint.map((component) => [component.id, component.primitive_role]));
  const panelScores = new Map();
  const panelReasons = new Map();
  const primitiveScores = new Map();
  const primitiveReasons = new Map();
  for (const scenario of scenarioRepairs) {
    for (const repair of scenario.repairs || []) {
      const boost = repair.priority === 'high' ? 3 : repair.priority === 'medium' ? 2 : 1;
      for (const panel of repair.impacted_panels || repair.target_modules || []) {
        panelScores.set(panel, (panelScores.get(panel) || 0) + boost);
        panelReasons.set(panel, unique([...(panelReasons.get(panel) || []), repair.id, repair.reason].filter(Boolean)));
      }
      const primitiveRoles = (repair.target_primitive_roles && repair.target_primitive_roles.length > 0)
        ? repair.target_primitive_roles
        : unique((repair.target_component_ids || []).map((id) => componentToPrimitive.get(id)).filter(Boolean));
      for (const primitive of primitiveRoles) {
        primitiveScores.set(primitive, (primitiveScores.get(primitive) || 0) + boost);
        primitiveReasons.set(primitive, unique([...(primitiveReasons.get(primitive) || []), repair.id, repair.reason].filter(Boolean)));
      }
    }
  }
  return { panelScores, panelReasons, primitiveScores, primitiveReasons };
}

function readPreviousPrimitiveFeedback(projectRoot, changeId) {
  const artifact = readJsonFile(resolveChangePath(projectRoot, changeId, 'primitive_feedback_history.json'), null);
  const entries = Array.isArray(artifact?.primitive_feedback_history?.entries)
    ? artifact.primitive_feedback_history.entries
    : [];
  return new Map(entries.map((entry) => [`${entry.module}::${entry.primitive_role}`, entry]));
}

function buildPrimitiveFeedbackHistory(blueprint = [], benchmarkRepairPlan = {}, previousHistory = new Map()) {
  const { primitiveScores, primitiveReasons } = deriveHistorySignals(benchmarkRepairPlan, blueprint);
  const grouped = new Map();
  for (const component of blueprint) {
    const key = `${component.module}::${component.primitive_role}`;
    const existing = grouped.get(key) || {
      module: component.module,
      primitive_role: component.primitive_role,
      target_component_ids: [],
    };
    existing.target_component_ids.push(component.id);
    grouped.set(key, existing);
  }

  return [...grouped.values()].map((entry) => {
    const key = `${entry.module}::${entry.primitive_role}`;
    const previous = previousHistory.get(key) || {};
    const currentIssueScore = primitiveScores.get(entry.primitive_role) || 0;
    const previousIssueScore = previous.current_issue_score || 0;
    const improvementScore = Math.max(0, previousIssueScore - currentIssueScore);
    const regressionScore = Math.max(0, currentIssueScore - previousIssueScore);
    const stabilizationScore = currentIssueScore === 0 && previousIssueScore > 0 ? previousIssueScore : 0;
    const attentionScore = Math.max(0, (currentIssueScore * 10) + (regressionScore * 5) - (improvementScore * 3) - stabilizationScore);
    return {
      module: entry.module,
      primitive_role: entry.primitive_role,
      target_component_ids: entry.target_component_ids,
      current_issue_score: currentIssueScore,
      previous_issue_score: previousIssueScore,
      improvement_score: improvementScore,
      regression_score: regressionScore,
      stabilization_score: stabilizationScore,
      attention_score: attentionScore,
      history_repair_reasons: primitiveReasons.get(entry.primitive_role) || [],
    };
  });
}

function applyHistoryToPanelFocus(panelFocusSequence = [], benchmarkRepairPlan = {}) {
  const { panelScores, panelReasons } = deriveHistorySignals(benchmarkRepairPlan);
  return [...panelFocusSequence]
    .map((panel) => ({
      ...panel,
      history_boost_score: panelScores.get(panel.module) || 0,
      history_repair_reasons: panelReasons.get(panel.module) || [],
    }))
    .sort((a, b) => {
      const historyDelta = (b.history_boost_score || 0) - (a.history_boost_score || 0);
      if (historyDelta !== 0) return historyDelta;
      return (a.priority_order || 0) - (b.priority_order || 0);
    })
    .map((panel, index) => ({
      ...panel,
      priority_order: index + 1,
    }));
}

function buildPrimitiveFocusSequence(panelFocusSequence = [], blueprint = [], benchmarkRepairPlan = {}, primitiveFeedbackEntries = []) {
  const feedbackMap = new Map(
    primitiveFeedbackEntries.map((entry) => [`${entry.module}::${entry.primitive_role}`, entry]),
  );
  return panelFocusSequence.flatMap((panel) => {
    const panelComponents = blueprint.filter((component) => component.module === panel.module);
    const grouped = new Map();
    for (const component of panelComponents) {
      const key = component.primitive_role;
      const feedback = feedbackMap.get(`${panel.module}::${key}`) || {};
      const entry = grouped.get(key) || {
        primitive_role: key,
        module: panel.module,
        target_component_ids: [],
        history_boost_score: feedback.current_issue_score || 0,
        history_repair_reasons: feedback.history_repair_reasons || [],
        improvement_score: feedback.improvement_score || 0,
        regression_score: feedback.regression_score || 0,
        stabilization_score: feedback.stabilization_score || 0,
        attention_score: feedback.attention_score || 0,
      };
      entry.target_component_ids.push(component.id);
      grouped.set(key, entry);
    }
    return [...grouped.values()]
      .sort((a, b) => {
        const attentionDelta = (b.attention_score || 0) - (a.attention_score || 0);
        if (attentionDelta !== 0) return attentionDelta;
        const historyDelta = (b.history_boost_score || 0) - (a.history_boost_score || 0);
        if (historyDelta !== 0) return historyDelta;
        return a.primitive_role.localeCompare(b.primitive_role);
      })
      .map((entry, index) => ({
        ...entry,
        priority_order_within_panel: index + 1,
      }));
  });
}

function buildDraftPenContent(changeId, generationContract = {}, reconstructionPack = {}, benchmarkRepairPlan = {}, primitiveFeedbackEntries = [], designSystemPack = {}) {
  const stages = generationContract?.component_constraints?.staged_generation?.stages || [];
  const panelFocusSequence = applyHistoryToPanelFocus(
    generationContract?.component_constraints?.panel_focus_sequence || [],
    benchmarkRepairPlan,
  );
  const blueprint = generationContract?.component_constraints?.component_blueprint
    || reconstructionPack?.component_blueprint
    || [];
  const primitiveFocusSequence = buildPrimitiveFocusSequence(panelFocusSequence, blueprint, benchmarkRepairPlan, primitiveFeedbackEntries);
  const geometryHints = generationContract?.visual_constraints?.geometry_hints || {};
  const tokenHints = generationContract?.visual_constraints?.token_hints || {};
  const aestheticStandard = generationContract?.visual_constraints?.aesthetic_standard || {};
  const imageReferenceGeneration = generationContract?.visual_constraints?.image_reference_generation || {};
  const designSystemSources = unique((designSystemPack.practice_sources || []).map((source) => source.id));
  const designSystemStates = unique(designSystemPack.component_policy?.required_states || []);
  const designSystemPrimitives = unique(designSystemPack.component_policy?.allowed_primitives || []);
  const pencilRoleBoundary = generationContract?.visual_constraints?.pencil_role_boundary || {};
  const primarySurface = generationContract?.primary_reference_surface || reconstructionPack?.primary_reference_surface || 'unknown_surface';

  const stageLines = stages.map((stage) => {
    const stageComponents = blueprint.filter((component) => (stage.target_component_ids || []).includes(component.id));
    const roles = unique(stageComponents.map((component) => component.primitive_role)).join(', ') || 'none';
    return [
      `- ${stage.order}. ${stage.id}`,
      `  - target_component_ids: ${(stage.target_component_ids || []).join(', ') || '(none)'}`,
      `  - primitive_roles: ${roles}`,
      `  - geometry_profiles: ${(stage.primary_geometry_profiles || []).join(', ') || '(none)'}`,
      `  - token_profiles: ${(stage.primary_token_profiles || []).join(', ') || '(none)'}`,
    ].join('\n');
  }).join('\n');

  const blueprintLines = blueprint.map((component) => [
    `- ${component.id}`,
    `  - module: ${component.module}`,
    `  - primitive_role: ${component.primitive_role}`,
    `  - hierarchy_role: ${component.hierarchy_role}`,
    `  - stage_bucket: ${component.stage_bucket}`,
    `  - geometry_profile: ${component.geometry_profile}`,
    `  - token_profile: ${component.token_profile}`,
  ].join('\n')).join('\n');

  const panelLines = panelFocusSequence.map((panel) => [
    `- ${panel.priority_order}. ${panel.module}`,
    `  - score: ${panel.score}`,
    `  - history_boost_score: ${panel.history_boost_score || 0}`,
    `  - history_repair_reasons: ${(panel.history_repair_reasons || []).join(', ') || '(none)'}`,
    `  - target_component_ids: ${(panel.target_component_ids || []).join(', ') || '(none)'}`,
    `  - dominant_primitive_roles: ${(panel.dominant_primitive_roles || []).join(', ') || '(none)'}`,
    `  - stage_ids: ${(panel.stage_ids || []).join(', ') || '(none)'}`,
    `  - local_generation_rule: ${panel.local_generation_rule || '(none)'}`,
  ].join('\n')).join('\n');

  const primitiveLines = primitiveFocusSequence.map((entry) => [
    `- ${entry.module} / ${entry.priority_order_within_panel}. ${entry.primitive_role}`,
    `  - history_boost_score: ${entry.history_boost_score || 0}`,
    `  - improvement_score: ${entry.improvement_score || 0}`,
    `  - regression_score: ${entry.regression_score || 0}`,
    `  - stabilization_score: ${entry.stabilization_score || 0}`,
    `  - attention_score: ${entry.attention_score || 0}`,
    `  - history_repair_reasons: ${(entry.history_repair_reasons || []).join(', ') || '(none)'}`,
    `  - target_component_ids: ${(entry.target_component_ids || []).join(', ') || '(none)'}`,
  ].join('\n')).join('\n');

  return [
    'PENCIL pencil_draft',
    `change_id: ${changeId}`,
    `primary_reference_surface: ${primarySurface}`,
    'execution_mode: staged_component_generation',
    '',
    '[staged_generation]',
    stageLines || '(none)',
    '',
    '[panel_focus_sequence]',
    panelLines || '(none)',
    '',
    '[primitive_focus_sequence]',
    primitiveLines || '(none)',
    '',
    '[component_blueprint]',
    blueprintLines || '(none)',
    '',
    '[geometry_hints]',
    `alignment_rules: ${(geometryHints.alignment_rules || []).join(' | ') || '(none)'}`,
    `primitive_profiles: ${(geometryHints.primitive_profiles || []).map((profile) => profile.id).join(', ') || '(none)'}`,
    '',
    '[token_hints]',
    `primitive_token_profiles: ${(tokenHints.primitive_token_profiles || []).map((profile) => profile.id).join(', ') || '(none)'}`,
    `typography_roles: ${(tokenHints.typography_roles || []).join(', ') || '(none)'}`,
    `spacing_roles: ${(tokenHints.spacing_roles || []).join(', ') || '(none)'}`,
    `emphasis_roles: ${(tokenHints.emphasis_roles || []).join(', ') || '(none)'}`,
    '',
    '[aesthetic_standard]',
    `level: ${aestheticStandard.level || 'unspecified'}`,
    `min_accept_score: ${aestheticStandard.min_accept_score ?? 'unspecified'}`,
    `dimensions: ${(aestheticStandard.dimensions || []).join(', ') || '(none)'}`,
    `anti_patterns: ${(aestheticStandard.anti_patterns || []).join(', ') || '(none)'}`,
    '',
    '[image_reference_generation]',
    `enabled: ${imageReferenceGeneration.enabled === false ? 'false' : 'true'}`,
    `model_capability: ${imageReferenceGeneration.model_capability || '(none)'}`,
    `role: ${imageReferenceGeneration.role || '(none)'}`,
    `required_outputs: ${(imageReferenceGeneration.required_outputs || []).map((output) => output.id).join(', ') || '(none)'}`,
    '',
    '[design_system_pack]',
    `profile: ${designSystemPack.profile || 'unspecified'}`,
    `practice_sources: ${designSystemSources.join(', ') || '(none)'}`,
    `allowed_primitives: ${designSystemPrimitives.join(', ') || '(none)'}`,
    `required_states: ${designSystemStates.join(', ') || '(none)'}`,
    `preview_artifacts: ${(designSystemPack.preview_loop?.required_artifacts || []).join(', ') || '(none)'}`,
    '',
    '[pencil_role_boundary]',
    `role: ${pencilRoleBoundary.role || 'editable_surface_assembly_and_targeted_refinement'}`,
    `sufficient_alone_for_high_aesthetic: ${pencilRoleBoundary.sufficient_alone_for_high_aesthetic === true ? 'true' : 'false'}`,
    '',
    '[guardrails]',
    '- Build shell first, then high-priority primitives, then supporting primitives, then local polish.',
    '- Complete the first focus panel to stable density and hierarchy before widening to the next panel.',
    '- Do not redraw the full page when a stage only targets a subset of components.',
    '- Preserve the locked primary reference surface and region order through all stages.',
    '- Treat image-model reference frames as aesthetic targets, not as a substitute for editable Pencil/DOM implementation.',
    '- Treat design_system_pack.json as a hard component/state/style contract, not optional inspiration.',
    '',
  ].join('\n');
}

export async function pencilDraft(input = {}, context = {}) {
  const projectRoot = context.projectRoot || process.cwd();
  const changeId = context.changeId || input.change_id || null;
  const generationArtifact = changeId
    ? readJsonFile(resolveChangePath(projectRoot, changeId, 'generation_contract.json'), null)
    : null;
  const reconstructionArtifact = changeId
    ? readJsonFile(resolveChangePath(projectRoot, changeId, 'reconstruction_pack.json'), null)
    : null;
  const benchmarkRepairArtifact = changeId
    ? readJsonFile(resolveChangePath(projectRoot, changeId, 'benchmark_repair_plan.json'), null)
    : null;
  const designSystemPack = changeId
    ? readJsonFile(resolveChangePath(projectRoot, changeId, 'design_system_pack.json'), {}) || {}
    : {};
  const generationContract = generationArtifact?.generation_contract || {};
  const reconstructionPack = reconstructionArtifact?.reconstruction_pack || {};
  const benchmarkRepairPlan = benchmarkRepairArtifact?.benchmark_repair_plan || {};
  const previousPrimitiveFeedback = changeId ? readPreviousPrimitiveFeedback(projectRoot, changeId) : new Map();
  const panelFocusSequence = applyHistoryToPanelFocus(
    generationContract?.component_constraints?.panel_focus_sequence || [],
    benchmarkRepairPlan,
  );
  const primitiveFeedbackEntries = buildPrimitiveFeedbackHistory(
    generationContract?.component_constraints?.component_blueprint || reconstructionPack.component_blueprint || [],
    benchmarkRepairPlan,
    previousPrimitiveFeedback,
  );
  const primitiveFocusSequence = buildPrimitiveFocusSequence(
    panelFocusSequence,
    generationContract?.component_constraints?.component_blueprint || reconstructionPack.component_blueprint || [],
    benchmarkRepairPlan,
    primitiveFeedbackEntries,
  );
  const penContent = buildDraftPenContent(
    changeId,
    generationContract,
    reconstructionPack,
    benchmarkRepairPlan,
    primitiveFeedbackEntries,
    designSystemPack,
  );
  const result = await synthesizePhaseArtifact(input, context, {
    phase: 'pencil_draft',
    summary: 'Initial Pencil draft generated from staged component-local generation instructions.',
    writePen: true,
    penContent,
  });
  if (changeId) {
    writeJsonFile(resolveChangePath(projectRoot, changeId, 'pencil_generation_plan.json'), {
      change_id: changeId,
      generated_at: new Date().toISOString(),
      primary_reference_surface: generationContract.primary_reference_surface || reconstructionPack.primary_reference_surface || null,
      staged_generation: generationContract?.component_constraints?.staged_generation || { stages: [] },
      panel_focus_sequence: panelFocusSequence,
      primitive_focus_sequence: primitiveFocusSequence,
      component_blueprint: generationContract?.component_constraints?.component_blueprint || reconstructionPack.component_blueprint || [],
      design_system_pack: {
        profile: designSystemPack.profile || null,
        practice_sources: designSystemSourcesFromPack(designSystemPack),
      },
    });
    writeJsonFile(resolveChangePath(projectRoot, changeId, 'primitive_feedback_history.json'), {
      change_id: changeId,
      generated_at: new Date().toISOString(),
      primitive_feedback_history: {
        entries: primitiveFeedbackEntries,
      },
    });
    await capturePreview(projectRoot, changeId).catch(() => null);
  }
  return result;
}
