import { readJsonFile, resolveChangePath, writeJsonFile } from '../../change-artifacts.js';
import { resolveEffectivePolicy } from '../../policy-overlay.js';

export async function policyGate(input = {}, context = {}) {
  const projectRoot = context.projectRoot || process.cwd();
  const changeId = context.changeId || input.change_id;
  if (!changeId) throw new Error('change_id is required for P2.policy.gate');

  const policyResult = resolveEffectivePolicy({
    projectRoot,
    changeId,
    executionMode: input.execution_mode || null,
    writeArtifact: true,
  });
  if (!policyResult.ok) {
    const packet = {
      version: 1,
      ok: false,
      generated_at: new Date().toISOString(),
      failed_checks: [{ code: policyResult.error.code, message: policyResult.error.message }],
      policy_error: policyResult.error,
    };
    const outputPath = resolveChangePath(projectRoot, changeId, 'policy_gate.json');
    writeJsonFile(outputPath, packet);
    return { ...packet, policy_gate_file: outputPath };
  }

  const policy = policyResult.policy;
  const failedChecks = [
    ...checkCoverage(projectRoot, changeId, policy),
    ...checkReviewers(projectRoot, changeId, policy),
    ...checkSmoke(projectRoot, changeId, policy),
  ];
  const packet = {
    version: 1,
    ok: failedChecks.length === 0,
    generated_at: new Date().toISOString(),
    execution_mode: policy.execution_mode || 'personal',
    failed_checks: failedChecks,
    advisory: policy.execution_mode !== 'team',
  };
  const outputPath = resolveChangePath(projectRoot, changeId, 'policy_gate.json');
  writeJsonFile(outputPath, packet);
  return { ...packet, policy_gate_file: outputPath };
}

function checkCoverage(projectRoot, changeId, policy) {
  const threshold = policy?.coding?.min_changed_line_coverage;
  if (threshold === undefined) return [];
  const quality = readJsonFile(resolveChangePath(projectRoot, changeId, 'tdd/quality-0.json'), {});
  const actual = Number(
    quality.changed_line_coverage
    ?? quality.incremental_line_coverage
    ?? quality.coverage
    ?? quality.gate_value,
  );
  if (!Number.isFinite(actual)) {
    return [{ code: 'coverage_evidence_missing', message: 'changed-line coverage evidence is missing', expected: Number(threshold), actual: null }];
  }
  return actual >= Number(threshold)
    ? []
    : [{ code: 'coverage_below_policy', message: 'changed-line coverage is below team policy', expected: Number(threshold), actual }];
}

function checkReviewers(projectRoot, changeId, policy) {
  const threshold = policy?.review?.min_reviewers;
  if (threshold === undefined) return [];
  const review = readJsonFile(resolveChangePath(projectRoot, changeId, 'review.json'), {});
  const reviewers = Array.isArray(review.reviewers)
    ? review.reviewers
    : Array.isArray(review.approved_by)
      ? review.approved_by
      : [];
  return reviewers.length >= Number(threshold)
    ? []
    : [{ code: 'reviewers_below_policy', message: 'reviewer count is below team policy', expected: Number(threshold), actual: reviewers.length }];
}

function checkSmoke(projectRoot, changeId, policy) {
  const threshold = policy?.deploy?.required_smoke_pass_rate;
  if (threshold === undefined) return [];
  const smoke = readJsonFile(resolveChangePath(projectRoot, changeId, 'smoke.json'), {});
  const actual = Number(smoke.pass_rate ?? smoke.required_smoke_pass_rate ?? smoke.smoke_pass_rate);
  if (!Number.isFinite(actual)) {
    return [{ code: 'smoke_evidence_missing', message: 'smoke pass-rate evidence is missing', expected: Number(threshold), actual: null }];
  }
  return actual >= Number(threshold)
    ? []
    : [{ code: 'smoke_pass_rate_below_policy', message: 'smoke pass rate is below team policy', expected: Number(threshold), actual }];
}
