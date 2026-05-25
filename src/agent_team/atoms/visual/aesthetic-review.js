import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { readJsonFile, resolveChangePath, writeJsonFile } from '../../../core/change-artifacts.js';

function nowIso() {
  return new Date().toISOString();
}

function addCheck(checks, id, pass, weight, summary, blocking = true) {
  checks.push({ id, status: pass ? 'pass' : 'fail', weight, summary, blocking });
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function resolveProjectPath(projectRoot, filePath) {
  if (!filePath || typeof filePath !== 'string') return null;
  return filePath.startsWith('/') ? filePath : resolve(projectRoot, filePath);
}

function imageReferenceEvidence(projectRoot, changeId, imageReference = {}) {
  if (imageReference.enabled === false) {
    return {
      required: false,
      status: 'skipped',
      missing_outputs: [],
      missing_files: [],
      references: [],
    };
  }

  const requiredIds = asArray(imageReference.required_outputs).map((output) => output.id).filter(Boolean);
  const artifact = readJsonFile(resolveChangePath(projectRoot, changeId, 'image_reference_set.json'), null);
  const references = asArray(artifact?.references);
  const readyReferences = references.filter((reference) => reference?.status === 'ready');
  const readyIds = new Set(readyReferences.map((reference) => reference.id).filter(Boolean));
  const missingOutputs = requiredIds.filter((id) => !readyIds.has(id));
  const missingFiles = readyReferences
    .map((reference) => ({
      id: reference.id,
      artifact_path: reference.artifact_path || reference.reference_path || null,
    }))
    .filter((reference) => !reference.artifact_path || !existsSync(resolveProjectPath(projectRoot, reference.artifact_path)))
    .map((reference) => reference.id || reference.artifact_path || 'unknown_reference');

  return {
    required: true,
    status: artifact?.status || 'missing',
    model_capability: artifact?.model_capability || null,
    missing_outputs: missingOutputs,
    missing_files: missingFiles,
    references: readyReferences.map((reference) => ({
      id: reference.id,
      artifact_path: reference.artifact_path || reference.reference_path || null,
    })),
    ready: artifact?.status === 'ready' && requiredIds.length >= 3 && missingOutputs.length === 0 && missingFiles.length === 0,
  };
}

function designSystemEvidence(projectRoot, changeId) {
  const artifact = readJsonFile(resolveChangePath(projectRoot, changeId, 'design_system_pack.json'), null);
  const practiceSources = asArray(artifact?.practice_sources).map((source) => source?.id).filter(Boolean);
  const requiredSourceIds = ['lovable', 'open_design', 'open_codesign', 'openui'];
  const missingPracticeSources = requiredSourceIds.filter((sourceId) => !practiceSources.includes(sourceId));
  const requiredStates = asArray(artifact?.component_policy?.required_states);
  const requiredStateIds = ['default', 'hover', 'focus', 'selected', 'loading', 'empty', 'error'];
  const missingStates = requiredStateIds.filter((stateId) => !requiredStates.includes(stateId));
  const allowedPrimitives = asArray(artifact?.component_policy?.allowed_primitives);
  const previewArtifacts = asArray(artifact?.preview_loop?.required_artifacts);
  const requiredPreviewArtifacts = ['image_reference_set.json', 'visual_benchmark.json', 'aesthetic_review.json'];
  const missingPreviewArtifacts = requiredPreviewArtifacts.filter((artifactName) => !previewArtifacts.includes(artifactName));

  return {
    required: true,
    status: artifact?.status || 'missing',
    profile: artifact?.profile || null,
    practice_sources: practiceSources,
    missing_practice_sources: missingPracticeSources,
    missing_required_states: missingStates,
    allowed_primitive_count: allowedPrimitives.length,
    missing_preview_artifacts: missingPreviewArtifacts,
    ready: artifact?.status === 'ready'
      && missingPracticeSources.length === 0
      && missingStates.length === 0
      && allowedPrimitives.length >= 6
      && missingPreviewArtifacts.length === 0,
  };
}

function hasCapturedProductSurfaceEvidence(scenario = {}) {
  if (typeof scenario.capture_url === 'string' && scenario.capture_url.trim()) return true;
  if (scenario.screenshot_evidence_mode === 'captured_page') return true;
  const domRects = scenario.layout_observations?.dom_rects;
  const tokenEvidence = scenario.observed_visual_tokens;
  return Array.isArray(domRects) && domRects.length > 0 && Boolean(tokenEvidence);
}

export async function visualAestheticReview(input = {}, context = {}) {
  const projectRoot = context.projectRoot || process.cwd();
  const changeId = context.changeId || input.change_id || null;
  if (!changeId) {
    throw new Error('change_id is required for H6d.visual.aesthetic_review');
  }

  const generationArtifact = readJsonFile(resolveChangePath(projectRoot, changeId, 'generation_contract.json'), {}) || {};
  const benchmark = readJsonFile(resolveChangePath(projectRoot, changeId, 'visual_benchmark.json'), {}) || {};
  const aggregate = readJsonFile(resolveChangePath(projectRoot, changeId, 'llm_design_review.json'), {}) || {};
  const contract = generationArtifact.generation_contract || {};
  const visualConstraints = contract.visual_constraints || {};
  const standard = visualConstraints.aesthetic_standard || {};
  const imageReference = visualConstraints.image_reference_generation || {};
  const pencilBoundary = visualConstraints.pencil_role_boundary || {};
  const scenarios = asArray(benchmark.scenarios);
  const capturedSurfaceScenarioCount = scenarios.filter(hasCapturedProductSurfaceEvidence).length;
  const dimensions = asArray(standard.dimensions);
  const imageOutputs = asArray(imageReference.required_outputs);
  const imageEvidence = imageReferenceEvidence(projectRoot, changeId, imageReference);
  const systemEvidence = designSystemEvidence(projectRoot, changeId);
  const checks = [];

  addCheck(
    checks,
    'high_aesthetic_standard_declared',
    standard.level === 'high' && Number(standard.min_accept_score || 0) >= 0.85,
    20,
    'Generation contract declares a high aesthetic standard with a meaningful acceptance score.',
  );
  addCheck(
    checks,
    'aesthetic_dimensions_complete',
    ['composition_balance', 'information_hierarchy', 'typography_rhythm', 'color_material_control', 'density_and_spacing', 'interaction_state_polish']
      .every((dimension) => dimensions.includes(dimension)),
    20,
    'Aesthetic standard covers composition, hierarchy, type, color/material, density, and interaction-state polish.',
  );
  addCheck(
    checks,
    'image_reference_generation_ready',
    imageReference.enabled !== false && Boolean(imageReference.model_capability) && imageOutputs.length >= 3,
    15,
    'Image-generation reference path is explicit enough to produce high-aesthetic frames and component/state sheets.',
  );
  addCheck(
    checks,
    'image_reference_outputs_materialized',
    imageReference.enabled === false || imageEvidence.ready === true,
    15,
    'Required image-reference outputs are materialized as checked artifacts before Pencil is treated as high-aesthetic.',
  );
  addCheck(
    checks,
    'pencil_boundary_explicit',
    pencilBoundary.sufficient_alone_for_high_aesthetic === false && Boolean(pencilBoundary.role),
    10,
    'Pencil is framed as editable assembly/refinement, not the sole source of taste.',
  );
  addCheck(
    checks,
    'design_system_practices_absorbed',
    systemEvidence.ready === true,
    15,
    'Commercial/open design-system practices are materialized as a generic design_system_pack with component, state, preview, and source coverage.',
  );
  addCheck(
    checks,
    'benchmark_scenarios_pass',
    scenarios.length > 0 && scenarios.every((scenario) => scenario.status === 'pass'),
    20,
    'Reference-backed benchmark scenarios are present and passing.',
  );
  addCheck(
    checks,
    'final_product_surface_captured',
    capturedSurfaceScenarioCount > 0,
    25,
    'At least one benchmark scenario is backed by a captured final product DOM surface, not only static reference images.',
  );
  addCheck(
    checks,
    'aggregate_has_no_followup',
    (aggregate.benchmark_summary?.needs_follow_up_count || 0) === 0,
    10,
    'Aggregated visual review has no unresolved benchmark follow-up.',
    false,
  );

  const totalWeight = checks.reduce((sum, check) => sum + check.weight, 0);
  const passedWeight = checks.filter((check) => check.status === 'pass').reduce((sum, check) => sum + check.weight, 0);
  const score = totalWeight > 0 ? Number((passedWeight / totalWeight).toFixed(3)) : 0;
  const minAcceptScore = Number(standard.min_accept_score || 0.88);
  const blockers = checks.filter((check) => check.status !== 'pass' && check.blocking).map((check) => check.id);
  const status = blockers.length === 0 && score >= minAcceptScore ? 'accept' : 'needs_refine';
  const payload = {
    version: 1,
    phase: 'aesthetic_review',
    change_id: changeId,
    generated_at: nowIso(),
    status,
    score,
    min_accept_score: minAcceptScore,
    blockers,
    checks,
    capability_positioning: {
      pencil: 'editable assembly and targeted refinement',
      image_generation: imageReference.model_capability || null,
      rule: 'Use image-model output to raise taste targets, then require editable implementation and benchmark proof.',
    },
    image_reference_evidence: imageEvidence,
    design_system_evidence: systemEvidence,
    final_product_surface_evidence: {
      required: true,
      captured_scenario_count: capturedSurfaceScenarioCount,
      ready: capturedSurfaceScenarioCount > 0,
    },
  };

  const outputPath = resolveChangePath(projectRoot, changeId, 'aesthetic_review.json');
  writeJsonFile(outputPath, payload);
  return {
    ok: status === 'accept',
    status,
    score,
    blockers,
    artifact_file: outputPath,
    payload,
  };
}

export default visualAestheticReview;
