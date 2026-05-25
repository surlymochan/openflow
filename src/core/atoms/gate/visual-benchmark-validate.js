import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import Ajv from 'ajv';

import { readJsonFile, resolveChangePath } from '../../change-artifacts.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const VISUAL_BENCHMARK_SCHEMA = JSON.parse(readFileSync(
  resolve(__dirname, '../../../../schemas/visual-benchmark.schema.json'),
  'utf8',
));
const ajv = new Ajv({ allErrors: true });
const validateBenchmarkSchema = ajv.compile(VISUAL_BENCHMARK_SCHEMA);

function resolveEvidencePath(projectRoot, filePath) {
  if (!filePath) return null;
  return isAbsolute(filePath) ? filePath : resolve(projectRoot, filePath);
}

function sameResolvedEvidencePath(projectRoot, left, right) {
  const leftPath = resolveEvidencePath(projectRoot, left);
  const rightPath = resolveEvidencePath(projectRoot, right);
  if (!leftPath || !rightPath) return false;
  if (leftPath === rightPath) return true;
  if (!existsSync(leftPath) || !existsSync(rightPath)) return false;
  return hashFile(leftPath) === hashFile(rightPath);
}

function hashFile(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

export async function visualBenchmarkValidate(input = {}, context = {}) {
  const projectRoot = context.projectRoot || process.cwd();
  const changeId = context.changeId || input.change_id || null;
  const advisory = String(input.mode || '').toLowerCase() === 'advisory';
  if (!changeId) {
    throw new Error('change_id is required for H6b.visual.benchmark_validate');
  }

  const artifactPath = resolveChangePath(projectRoot, changeId, 'visual_benchmark.json');
  const artifact = readJsonFile(artifactPath, null);
  const issues = [];

  if (!artifact) {
    issues.push('visual_benchmark_missing');
  } else {
    if (!validateBenchmarkSchema(artifact)) {
      issues.push('visual_benchmark_schema_invalid');
    }
    const scenarios = Array.isArray(artifact.scenarios) ? artifact.scenarios : [];
    const requiredModules = Array.isArray(artifact.required_modules) ? artifact.required_modules : [];
    if (!artifact.competitor_product) issues.push('visual_benchmark_competitor_missing');
    if (requiredModules.length === 0) issues.push('visual_benchmark_required_modules_missing');
    if (artifact.benchmark_mode !== 'reference_backed') issues.push('visual_benchmark_not_reference_backed');
    if (!['reference_scenarios', 'capture_url'].includes(artifact.benchmark_input_mode)) {
      issues.push('visual_benchmark_input_contract_missing');
    }
    if (artifact.report_file) {
      const reportPath = resolveEvidencePath(projectRoot, artifact.report_file);
      if (!reportPath || !existsSync(reportPath)) issues.push('visual_benchmark_report_unresolved');
    }
    if (scenarios.length === 0) issues.push('visual_benchmark_scenarios_missing');
    if (scenarios.some((scenario) => !scenario.viewport)) issues.push('visual_benchmark_viewport_missing');
    if (scenarios.some((scenario) => !scenario.reference_image)) issues.push('visual_benchmark_reference_image_missing');
    if (scenarios.some((scenario) => !scenario.screenshot_image)) issues.push('visual_benchmark_screenshot_image_missing');
    if (scenarios.some((scenario) => sameResolvedEvidencePath(projectRoot, scenario.reference_image, scenario.screenshot_image))) {
      issues.push('visual_benchmark_self_referential_scenario');
    }
    if (scenarios.some((scenario) => {
      const referencePath = resolveEvidencePath(projectRoot, scenario.reference_image);
      return !referencePath || !existsSync(referencePath);
    })) {
      issues.push('visual_benchmark_reference_image_unresolved');
    }
    if (scenarios.some((scenario) => {
      const screenshotPath = resolveEvidencePath(projectRoot, scenario.screenshot_image);
      return !screenshotPath || !existsSync(screenshotPath);
    })) {
      issues.push('visual_benchmark_screenshot_image_unresolved');
    }
    if (scenarios.some((scenario) => !scenario.diff_metrics || typeof scenario.diff_metrics !== 'object')) {
      issues.push('visual_benchmark_diff_metrics_missing');
    }
    if (scenarios.some((scenario) => scenario.diff_metrics?.status !== 'pass')) {
      issues.push('visual_benchmark_diff_metrics_unresolved');
    }
    if (scenarios.some((scenario) => !Array.isArray(scenario.structure_checks) || scenario.structure_checks.length === 0)) {
      issues.push('visual_benchmark_structure_checks_missing');
    }
    if (scenarios.some((scenario) =>
      Array.isArray(scenario.structure_checks) && scenario.structure_checks.some((check) => check?.status !== 'pass')
    )) {
      issues.push('visual_benchmark_structure_checks_unresolved');
    }
    if (scenarios.some((scenario) =>
      scenario.visual_token_contract
      && (!Array.isArray(scenario.token_checks) || scenario.token_checks.length === 0)
    )) {
      issues.push('visual_benchmark_token_checks_missing');
    }
    if (scenarios.some((scenario) =>
      scenario.visual_token_contract
      && Array.isArray(scenario.token_checks)
      && scenario.token_checks.some((check) => check?.status !== 'pass')
    )) {
      issues.push('visual_benchmark_token_checks_unresolved');
    }
    if (scenarios.some((scenario) =>
      Array.isArray(scenario.state_evidence)
      && scenario.state_evidence.length > 0
      && (!Array.isArray(scenario.state_transition_checks) || scenario.state_transition_checks.length === 0)
    )) {
      issues.push('visual_benchmark_state_transition_checks_missing');
    }
    if (scenarios.some((scenario) =>
      Array.isArray(scenario.state_transition_checks)
      && scenario.state_transition_checks.some((check) => check?.status !== 'pass')
    )) {
      issues.push('visual_benchmark_state_transition_checks_unresolved');
    }
    if (scenarios.some((scenario) =>
      Array.isArray(scenario.state_evidence)
      && scenario.state_evidence.some((state) => Array.isArray(state?.frame_screenshot_images) && state.frame_screenshot_images.length > 0)
      && (!Array.isArray(scenario.motion_transition_checks) || scenario.motion_transition_checks.length === 0)
    )) {
      issues.push('visual_benchmark_motion_transition_checks_missing');
    }
    if (scenarios.some((scenario) =>
      Array.isArray(scenario.motion_transition_checks)
      && scenario.motion_transition_checks.some((check) => check?.status !== 'pass')
    )) {
      issues.push('visual_benchmark_motion_transition_checks_unresolved');
    }
    if (scenarios.some((scenario) =>
      scenario.state_contract
      && (!Array.isArray(scenario.state_contract_checks) || scenario.state_contract_checks.length === 0)
    )) {
      issues.push('visual_benchmark_state_contract_checks_missing');
    }
    if (scenarios.some((scenario) =>
      scenario.state_contract
      && Array.isArray(scenario.state_contract_checks)
      && scenario.state_contract_checks.some((check) => check?.status !== 'pass')
    )) {
      issues.push('visual_benchmark_state_contract_checks_unresolved');
    }
    if (scenarios.some((scenario) =>
      scenario.state_family_contract
      && (!Array.isArray(scenario.state_family_checks) || scenario.state_family_checks.length === 0)
    )) {
      issues.push('visual_benchmark_state_family_checks_missing');
    }
    if (scenarios.some((scenario) =>
      scenario.state_family_contract
      && Array.isArray(scenario.state_family_checks)
      && scenario.state_family_checks.some((check) => check?.status !== 'pass')
    )) {
      issues.push('visual_benchmark_state_family_checks_unresolved');
    }
    if (artifact.benchmark_matrix_contract && (!Array.isArray(artifact.matrix_checks) || artifact.matrix_checks.length === 0)) {
      issues.push('visual_benchmark_matrix_checks_missing');
    }
    if (Array.isArray(artifact.matrix_checks) && artifact.matrix_checks.some((check) => check?.status !== 'pass')) {
      issues.push('visual_benchmark_matrix_checks_unresolved');
    }
    if (scenarios.some((scenario) => scenario.status !== 'pass')) issues.push('visual_benchmark_has_unresolved_scenarios');
  }

  return {
    ok: advisory ? true : issues.length === 0,
    status: issues.length === 0 ? 'accepted' : 'needs_human',
    artifact_file: artifactPath,
    issues,
    advisory,
  };
}

export default visualBenchmarkValidate;
