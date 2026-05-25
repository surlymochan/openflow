import { readJsonFile, resolveChangePath, writeJsonFile } from '../../../core/change-artifacts.js';
import { synthesizePhaseArtifact } from '../../common.js';

function buildQaAcceptancePacket(projectRoot, changeId) {
  const verifyProof = readJsonFile(resolveChangePath(projectRoot, changeId, 'verify_proof.json'), null);
  const benchmark = readJsonFile(resolveChangePath(projectRoot, changeId, 'visual_benchmark.json'), null);
  const aestheticReview = readJsonFile(resolveChangePath(projectRoot, changeId, 'aesthetic_review.json'), null);
  const contractArtifact = readJsonFile(resolveChangePath(projectRoot, changeId, 'competitor_reconstruction_review.json'), null);
  const contract = contractArtifact?.competitor_reconstruction_contract || {};
  const requiredModules = Array.isArray(contract.required_modules) ? contract.required_modules : [];
  const primaryJourneys = Array.isArray(contract.primary_journeys) ? contract.primary_journeys : [];
  const benchmarkScenarios = Array.isArray(benchmark?.scenarios) ? benchmark.scenarios : [];
  const testsPassed = verifyProof?.all_passed === true;
  const benchmarkPassed = benchmark?.benchmark_mode === 'reference_backed'
    && benchmarkScenarios.length > 0
    && benchmarkScenarios.every((scenario) => scenario.status === 'pass')
    && benchmark?.matrix_status !== 'needs_follow_up';
  const aestheticAccepted = aestheticReview?.status === 'accept'
    && Number(aestheticReview?.score || 0) >= Number(aestheticReview?.min_accept_score || 0.88)
    && (!Array.isArray(aestheticReview?.blockers) || aestheticReview.blockers.length === 0);

  const failedChecks = [];
  if (!testsPassed) failedChecks.push('planned_verification_failed');
  if (!benchmarkPassed) failedChecks.push('visual_benchmark_not_accepted');
  if (!aestheticAccepted) failedChecks.push('aesthetic_review_not_accepted');
  if (requiredModules.length === 0) failedChecks.push('module_contract_missing');
  if (primaryJourneys.length === 0) failedChecks.push('primary_journey_contract_missing');

  const accepted = failedChecks.length === 0;
  return {
    status: accepted ? 'accepted' : 'needs_human',
    primary_journey_covered: accepted,
    manifest_valid: Boolean(verifyProof),
    cross_module_continuity: {
      status: accepted ? 'covered' : 'unverified',
      benchmark_scenarios: benchmarkScenarios.length,
    },
    module_coverage: {
      covered_module_count: accepted ? requiredModules.length : 0,
      expected_module_count: Math.max(requiredModules.length, 1),
      modules: requiredModules,
    },
    failed_checks: failedChecks,
  };
}

export async function visualReview(input = {}, context = {}) {
  const mode = input.mode || context.phase?.id || 'review';
  const projectRoot = context.projectRoot || process.cwd();
  const changeId = context.changeId || input.change_id;
  const qaAcceptancePacket = mode === 'qa' ? buildQaAcceptancePacket(projectRoot, changeId) : null;
  const result = await synthesizePhaseArtifact(input, context, {
    phase: context.phase?.id === 'llm_design_review' ? 'llm_design_review' : mode === 'qa' ? 'qa' : 'review',
    summary: mode === 'qa'
      ? 'Visual QA review evaluated planned verification, benchmark, aesthetic, module, and journey evidence.'
      : 'Visual review completed with style and continuity findings.',
    extraTeamRun: mode === 'qa' ? {
      qa_acceptance_packet: qaAcceptancePacket,
    } : {},
  });

  if (mode === 'qa') {
    const packetPath = resolveChangePath(projectRoot, changeId, 'qa_visual_review.json');
    writeJsonFile(packetPath, {
      version: 1,
      summary: 'Visual QA packet',
      qa_acceptance_packet: qaAcceptancePacket,
      retry_brief: {
        status: qaAcceptancePacket.status === 'accepted' ? 'not_needed' : 'needs_follow_up',
        target_phase: null,
        evidence_screenshot_ids: ['first_fold'],
      },
    });
  }

  return result;
}
