import { readJsonFile, resolveChangePath, writeJsonFile } from '../../../core/change-artifacts.js';

function summarizeHotspot(hotspot = {}) {
  if (!hotspot || typeof hotspot !== 'object') return 'unknown hotspot';
  const row = Number.isFinite(hotspot.row) ? hotspot.row : '?';
  const col = Number.isFinite(hotspot.col) ? hotspot.col : '?';
  const ratio = typeof hotspot.changed_ratio === 'number' ? hotspot.changed_ratio.toFixed(4) : 'n/a';
  return `grid(${row},${col}) changed_ratio=${ratio}`;
}

function unique(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).filter(Boolean))];
}

function componentBlueprintForChange(projectRoot, changeId) {
  const generationArtifact = readJsonFile(resolveChangePath(projectRoot, changeId, 'generation_contract.json'), null);
  return generationArtifact?.generation_contract?.component_constraints?.component_blueprint || [];
}

function stagePlanForChange(projectRoot, changeId) {
  const generationArtifact = readJsonFile(resolveChangePath(projectRoot, changeId, 'generation_contract.json'), null);
  return generationArtifact?.generation_contract?.component_constraints?.staged_generation?.stages || [];
}

function primitiveFeedbackForChange(projectRoot, changeId) {
  const feedbackArtifact = readJsonFile(resolveChangePath(projectRoot, changeId, 'primitive_feedback_history.json'), null);
  const entries = Array.isArray(feedbackArtifact?.primitive_feedback_history?.entries)
    ? feedbackArtifact.primitive_feedback_history.entries
    : [];
  return new Map(entries.map((entry) => [`${entry.module}::${entry.primitive_role}`, entry]));
}

function areaOf(rect = {}) {
  return Math.max(0, Number(rect.width) || 0) * Math.max(0, Number(rect.height) || 0);
}

function overlapArea(a = {}, b = {}) {
  const left = Math.max(Number(a.x ?? a.left) || 0, Number(b.x ?? b.left) || 0);
  const top = Math.max(Number(a.y ?? a.top) || 0, Number(b.y ?? b.top) || 0);
  const right = Math.min(
    (Number(a.x ?? a.left) || 0) + (Number(a.width) || 0),
    (Number(b.x ?? b.left) || 0) + (Number(b.width) || 0),
  );
  const bottom = Math.min(
    (Number(a.y ?? a.top) || 0) + (Number(a.height) || 0),
    (Number(b.y ?? b.top) || 0) + (Number(b.height) || 0),
  );
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function impactedPanelsForScenario(scenario = {}) {
  const hotspots = Array.isArray(scenario.diff_metrics?.hotspots) ? scenario.diff_metrics.hotspots : [];
  const rects = Array.isArray(scenario.layout_observations?.dom_rects) ? scenario.layout_observations.dom_rects : [];
  if (hotspots.length === 0 || rects.length === 0) return [];

  const totals = new Map();
  for (const hotspot of hotspots) {
    for (const rect of rects) {
      const overlap = overlapArea(hotspot, rect);
      if (overlap <= 0) continue;
      const key = rect.panel_id || rect.id || rect.selector;
      totals.set(key, (totals.get(key) || 0) + overlap);
    }
  }
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([panelId]) => panelId)
    .filter(Boolean);
}

function pickBlueprint(blueprint = [], predicate) {
  const matches = blueprint.filter(predicate);
  return matches.length > 0 ? matches : blueprint;
}

function scoreComponentForRepair(component = {}, feedbackMap = new Map()) {
  const feedback = feedbackMap.get(`${component.module}::${component.primitive_role}`) || {};
  return {
    attention_score: Number(feedback.attention_score) || 0,
    current_issue_score: Number(feedback.current_issue_score) || 0,
    improvement_score: Number(feedback.improvement_score) || 0,
    regression_score: Number(feedback.regression_score) || 0,
    stabilization_score: Number(feedback.stabilization_score) || 0,
  };
}

function pickRepairComponents(components = [], feedbackMap = new Map()) {
  const scored = components.map((component) => ({
    component,
    feedback: scoreComponentForRepair(component, feedbackMap),
  }));
  const actionable = scored.filter(({ feedback }) => feedback.attention_score > 0 || feedback.current_issue_score > 0 || feedback.regression_score > 0);
  const candidateSet = actionable.length > 0 ? actionable : scored;
  const filtered = actionable.length > 0
    ? candidateSet.filter(({ feedback }) => !(feedback.current_issue_score === 0 && feedback.stabilization_score > 0))
    : candidateSet;
  const finalSet = filtered.length > 0 ? filtered : candidateSet;
  return finalSet
    .sort((a, b) => {
      const attentionDelta = b.feedback.attention_score - a.feedback.attention_score;
      if (attentionDelta !== 0) return attentionDelta;
      const regressionDelta = b.feedback.regression_score - a.feedback.regression_score;
      if (regressionDelta !== 0) return regressionDelta;
      const improvementDelta = a.feedback.improvement_score - b.feedback.improvement_score;
      if (improvementDelta !== 0) return improvementDelta;
      return a.component.id.localeCompare(b.component.id);
    })
    .map(({ component }) => component);
}

function buildRepairTarget({ id, priority, reason, components, focusDimensions, instruction, hotspots, impactedPanels = [], stagePlan = [], feedbackMap = new Map() }) {
  const repairComponents = pickRepairComponents(components, feedbackMap);
  const targetComponentIds = unique(repairComponents.map((component) => component.id));
  const targetStageIds = stagePlan
    .filter((stage) => (stage.target_component_ids || []).some((componentId) => targetComponentIds.includes(componentId)))
    .map((stage) => stage.id);
  return {
    id,
    priority,
    reason,
    target_component_ids: unique(repairComponents.map((component) => component.id)),
    target_modules: unique(repairComponents.map((component) => component.module)),
    target_primitive_roles: unique(repairComponents.map((component) => component.primitive_role)),
    target_stage_ids: targetStageIds,
    impacted_panels: impactedPanels,
    focus_dimensions: focusDimensions,
    preserve_non_target_components: true,
    evidence_hotspots: hotspots,
    target_feedback_summary: repairComponents.map((component) => {
      const feedback = scoreComponentForRepair(component, feedbackMap);
      return {
        component_id: component.id,
        module: component.module,
        primitive_role: component.primitive_role,
        attention_score: feedback.attention_score,
        current_issue_score: feedback.current_issue_score,
        improvement_score: feedback.improvement_score,
        regression_score: feedback.regression_score,
        stabilization_score: feedback.stabilization_score,
      };
    }),
    instruction,
  };
}

function buildScenarioRepairs(projectRoot, changeId, scenario = {}) {
  const blockers = Array.isArray(scenario.blockers) ? scenario.blockers : [];
  const blueprint = componentBlueprintForChange(projectRoot, changeId);
  const stagePlan = stagePlanForChange(projectRoot, changeId);
  const impactedPanels = impactedPanelsForScenario(scenario);
  const primitiveFeedback = primitiveFeedbackForChange(projectRoot, changeId);
  const panelScopedBlueprint = impactedPanels.length > 0
    ? pickBlueprint(blueprint, (component) => impactedPanels.includes(component.module))
    : blueprint;
  const hotspots = Array.isArray(scenario.diff_metrics?.hotspots)
    ? scenario.diff_metrics.hotspots.slice(0, 5).map((hotspot) => summarizeHotspot(hotspot))
    : [];
  const repairs = [];
  if (blockers.includes('layout_shift_score_above_threshold')) {
    const shellTargets = pickBlueprint(panelScopedBlueprint, (component) => ['toolbar_group', 'grid_header', 'grid_cell', 'list_row'].includes(component.primitive_role));
    repairs.push(buildRepairTarget({
      id: 'layout_ratio_repair',
      priority: 'high',
      reason: 'layout_shift_score_above_threshold',
      components: shellTargets,
      focusDimensions: ['panel_ratio', 'row_rhythm', 'anchor_alignment'],
      instruction: 'Realign the shell and repeated primary primitives to the locked geometry before touching decorative tokens.',
      hotspots,
      impactedPanels,
      stagePlan,
      feedbackMap: primitiveFeedback,
    }));
  }
  if (blockers.includes('structural_similarity_below_threshold')) {
    const structureTargets = pickBlueprint(panelScopedBlueprint, (component) => component.hierarchy_role === 'primary');
    repairs.push(buildRepairTarget({
      id: 'structure_repair',
      priority: 'high',
      reason: 'structural_similarity_below_threshold',
      components: structureTargets,
      focusDimensions: ['primitive_presence', 'component_order', 'visual_hierarchy'],
      instruction: 'Restore the reference primitive hierarchy component by component before widening to secondary polish.',
      hotspots,
      impactedPanels,
      stagePlan,
      feedbackMap: primitiveFeedback,
    }));
  }
  if (blockers.includes('pixel_diff_ratio_above_threshold')) {
    const tokenTargets = pickBlueprint(panelScopedBlueprint, (component) => ['status_chip', 'selection_badge', 'meta_line', 'input_block'].includes(component.primitive_role));
    repairs.push(buildRepairTarget({
      id: 'token_repair',
      priority: 'medium',
      reason: 'pixel_diff_ratio_above_threshold',
      components: tokenTargets,
      focusDimensions: ['spacing', 'typography', 'surface_emphasis', 'color_roles'],
      instruction: 'Tighten token deltas only on the affected primitive families; preserve shell geometry while doing it.',
      hotspots,
      impactedPanels,
      stagePlan,
      feedbackMap: primitiveFeedback,
    }));
  }
  if (!Array.isArray(scenario.structure_checks) || scenario.structure_checks.length === 0) {
    const scaffoldTargets = pickBlueprint(panelScopedBlueprint, (component) => component.stage_bucket === 'shell');
    repairs.push(buildRepairTarget({
      id: 'missing_structure_contract',
      priority: 'high',
      reason: 'structure_checks_missing',
      components: scaffoldTargets,
      focusDimensions: ['layout_contract', 'region_anchors'],
      instruction: 'Backfill structure checks and shell anchors from the generation contract before the next recheck.',
      hotspots,
      impactedPanels,
      stagePlan,
      feedbackMap: primitiveFeedback,
    }));
  }
  return {
    repairs,
    repair_sequence: stagePlan.map((stage) => ({
      stage_id: stage.id,
      target_component_ids: stage.target_component_ids || [],
      reason: repairs.some((repair) => (repair.target_component_ids || []).some((id) => (stage.target_component_ids || []).includes(id)))
        ? 'has_repair_targets'
        : 'preserve_if_unaffected',
    })),
    preserved_component_ids: unique(
      blueprint
        .map((component) => component.id)
        .filter((id) => !repairs.some((repair) => (repair.target_component_ids || []).includes(id))),
    ),
  };
}

export async function benchmarkRepairPlan(input = {}, context = {}) {
  const projectRoot = context.projectRoot || process.cwd();
  const changeId = context.changeId || input.change_id || null;
  if (!changeId) throw new Error('change_id is required for H6c.visual.benchmark_repair_plan');

  const benchmark = readJsonFile(resolveChangePath(projectRoot, changeId, 'visual_benchmark.json'), { scenarios: [] });
  const repairPath = resolveChangePath(projectRoot, changeId, 'benchmark_repair_plan.json');
  const scenarios = Array.isArray(benchmark.scenarios) ? benchmark.scenarios : [];
  const scenarioRepairs = scenarios.map((scenario) => {
    const componentRepairs = buildScenarioRepairs(projectRoot, changeId, scenario);
    return {
      id: scenario.id || null,
      status: scenario.status || 'unknown',
      hotspots: Array.isArray(scenario.diff_metrics?.hotspots)
        ? scenario.diff_metrics.hotspots.slice(0, 5).map((hotspot) => summarizeHotspot(hotspot))
        : [],
      repairs: componentRepairs.repairs,
      repair_sequence: componentRepairs.repair_sequence,
      preserved_component_ids: componentRepairs.preserved_component_ids,
    };
  });
  const unresolved = scenarioRepairs.filter((scenario) => scenario.status !== 'pass');

  const payload = {
    version: 1,
    phase: 'benchmark_repair_plan',
    change_id: changeId,
    generated_at: new Date().toISOString(),
    status: unresolved.length === 0 ? 'not_needed' : 'ready',
    summary: unresolved.length === 0
      ? 'Benchmark already passed; no repair loop is needed.'
      : `Prepared targeted repair actions for ${unresolved.length} unresolved benchmark scenario(s).`,
    benchmark_repair_plan: {
      status: unresolved.length === 0 ? 'not_needed' : 'ready',
      unresolved_scenario_count: unresolved.length,
      scenario_repairs: scenarioRepairs,
      convergence_rules: [
        'Repair only the targeted component primitives before considering wider restyling.',
        'Preserve non-target components unless a repair target explicitly names them.',
        'Repair the reference skeleton first, then tune tokens.',
        'Do not widen scope beyond the unresolved benchmark hotspots.',
        'Preserve the locked primary reference surface during refinement.',
      ],
    },
  };

  writeJsonFile(repairPath, payload);
  return {
    ok: true,
    status: payload.status,
    output_file: repairPath,
    payload,
  };
}

export default benchmarkRepairPlan;
