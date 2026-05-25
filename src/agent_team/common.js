import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  makeArtifactEnvelope,
  readJsonFile,
  resolveChangePath,
  summarizeFinding,
  writeJsonFile,
  writeTextFile,
} from '../core/change-artifacts.js';
import { resolveBoundMissionId } from '../core/bindings.js';
import { findPhaseRunSession, persistPhaseRun } from '../core/mission-state.js';
import { mutateStore, readStore, resolveDataFile } from '../core/state-store.js';
import { getLatestPhaseRun } from '../core/phase-run-read.js';

function nowIso() {
  return new Date().toISOString();
}

function ensureArray(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

export function defaultVerdictForPhase(phase, mode = null) {
  if (mode === 'qa' || phase === 'qa') {
    return {
      status: 'accept',
      confidence: 0.88,
      rationale: 'QA checks and recorded evidence meet the current acceptance bar.',
    };
  }
  if (phase === 'review') {
    return {
      status: 'accept',
      confidence: 0.82,
      rationale: 'Review did not surface a blocking regression in the current evidence set.',
    };
  }
  return {
    status: 'accept',
    confidence: 0.76,
    rationale: `${phase || 'phase'} completed with a coherent synthetic result packet.`,
  };
}

export function defaultFindingsForPhase(phase) {
  const title = String(phase || 'phase').replace(/_/g, ' ');
  return [
    { summary: `${title} output is internally consistent.` },
    { summary: `${title} output is ready for the next workflow transition.` },
  ];
}

export function defaultQaAcceptancePacket() {
  return {
    status: 'needs_human',
    primary_journey_covered: false,
    manifest_valid: false,
    cross_module_continuity: { status: 'covered' },
    module_coverage: {
      covered_module_count: 0,
      expected_module_count: 1,
    },
    failed_checks: [
      'visual_qa_packet_missing',
      'competitor_backed_acceptance_missing',
    ],
  };
}

export async function resolveMissionContext(input = {}, context = {}) {
  const projectRoot = context.projectRoot || process.cwd();
  const changeId = context.changeId || input.change_id || null;
  const missionId = resolveBoundMissionId({
    projectRoot,
    changeId,
    missionId: input.mission_id || null,
    runtimeMissionId: context.runtime?.missionId || null,
  });
  const dataFile = resolveDataFile({ projectRoot, explicitPath: input.data_file || null });
  const state = missionId ? await readStore(dataFile) : null;
  const phaseRun = missionId ? getLatestPhaseRun(state, missionId) : null;
  const session = missionId ? findPhaseRunSession(state, missionId, context.runtime?.phaseRunSessionId || input.session_id || null) : null;
  return { projectRoot, changeId, missionId, dataFile, state, phaseRun, session };
}

function artifactPathForPhase(projectRoot, changeId, phase, mode = null) {
  switch (phase) {
    case 'explore':
    case 'brainstorm':
    case 'risk_review':
    case 'clarify':
    case 'ux_design_brief':
      return resolveChangePath(projectRoot, changeId, `${phase}.json`);
    case 'review':
      return resolveChangePath(projectRoot, changeId, 'review.json');
    case 'llm_design_review':
      return resolveChangePath(projectRoot, changeId, 'llm_design_review.json');
    case 'design_contract_freeze':
      return resolveChangePath(projectRoot, changeId, 'design_contract.json');
    case 'visual_direction_synthesis':
      return resolveChangePath(projectRoot, changeId, 'visual_direction_synthesis.json');
    case 'layout_competition':
      return resolveChangePath(projectRoot, changeId, 'layout_competition.json');
    case 'design_selection':
      return resolveChangePath(projectRoot, changeId, 'design_selection.json');
    case 'design_accept':
      return resolveChangePath(projectRoot, changeId, 'design_accept.json');
    case 'qa':
      return resolveChangePath(projectRoot, changeId, 'llm_design_review.json');
    default:
      if (mode === 'qa') {
        return resolveChangePath(projectRoot, changeId, 'qa_visual_review.json');
      }
      return resolveChangePath(projectRoot, changeId, `${phase || 'artifact'}.json`);
  }
}

function penPath(projectRoot, changeId) {
  return resolveChangePath(projectRoot, changeId, 'pencil_output.pen');
}

function attestationPath(projectRoot, changeId) {
  return resolveChangePath(projectRoot, changeId, 'pencil_output.attestation.json');
}

export async function persistSyntheticPhaseRun({
  projectRoot,
  changeId,
  missionId,
  dataFile,
  phase,
  sessionId = null,
  summary = '',
  findings = [],
  verdict = null,
  extraTeamRun = {},
  extraPhaseEntry = {},
  executedPhases = null,
}) {
  if (!missionId) {
    return { phaseRun: null, phaseEntry: null };
  }

  const result = await mutateStore((state) => {
    const existingPhaseRun = getLatestPhaseRun(state, missionId);
    const existingEntries = Array.isArray(existingPhaseRun?.phases) ? [...existingPhaseRun.phases] : [];
    const existingIndex = existingEntries.findIndex((entry) => entry.phase === phase);
    const nextPhaseEntry = {
      phase,
      status: extraPhaseEntry.status || 'completed',
      effective_status: extraPhaseEntry.effective_status || extraPhaseEntry.status || 'completed',
      summary: summary || existingPhaseRun?.summary || `${phase} complete`,
      updated_at: nowIso(),
      team_run: {
        team_run_id: extraTeamRun.team_run_id || `team_run_${phase}_${Date.now()}`,
        pattern: extraTeamRun.pattern || 'solo',
        verdict: verdict || defaultVerdictForPhase(phase),
        findings: findings.length > 0 ? findings : defaultFindingsForPhase(phase),
        evidence_bundle: extraTeamRun.evidence_bundle || {
          evidence_count: findings.length > 0 ? findings.length : 2,
        },
        workspace_evidence: extraTeamRun.workspace_evidence || {
          summary: `${phase} evidence captured from the local workspace state.`,
        },
        qa_acceptance_packet: extraTeamRun.qa_acceptance_packet || (phase === 'qa' ? defaultQaAcceptancePacket() : null),
        ...extraTeamRun,
      },
      ...extraPhaseEntry,
    };

    if (existingIndex >= 0) {
      existingEntries[existingIndex] = {
        ...existingEntries[existingIndex],
        ...nextPhaseEntry,
        team_run: {
          ...(existingEntries[existingIndex].team_run || {}),
          ...(nextPhaseEntry.team_run || {}),
        },
      };
    } else {
      existingEntries.push(nextPhaseEntry);
    }

    const previousExecuted = Array.isArray(existingPhaseRun?.executed_phases) ? existingPhaseRun.executed_phases : [];
    const nextExecuted = executedPhases || [...new Set([...previousExecuted, phase])];
    const phaseRun = persistPhaseRun(state, missionId, {
      session_id: sessionId,
      phase_run_id: existingPhaseRun?.phase_run_id || undefined,
      summary: summary || existingPhaseRun?.summary || `${phase} complete`,
      status: 'completed',
      phases: existingEntries,
      executed_phases: nextExecuted,
      phase_count: existingEntries.length,
      phase_run_file: existingPhaseRun?.phase_run_file || null,
      workspace_evidence: extraTeamRun.workspace_evidence || existingPhaseRun?.workspace_evidence || null,
      qa_acceptance_packet: extraTeamRun.qa_acceptance_packet || null,
    });
    const phaseEntry = phaseRun.phases.find((entry) => entry.phase === phase) || null;
    return { phaseRun, phaseEntry };
  }, dataFile);

  return result;
}

export async function synthesizePhaseArtifact(input = {}, context = {}, options = {}) {
  const phase = options.phase || input.phase || context.phase?.id || null;
  const mode = input.mode || options.mode || null;
  const missionContext = await resolveMissionContext(input, context);
  const { projectRoot, changeId, missionId, dataFile, session } = missionContext;
  if (!changeId) {
    throw new Error('change_id is required');
  }

  const verdict = options.verdict || defaultVerdictForPhase(phase, mode);
  const findings = options.findings || defaultFindingsForPhase(phase);
  const summary = options.summary || `${phase || 'phase'} completed with synthetic heavy-track output.`;
  const persistResult = await persistSyntheticPhaseRun({
    projectRoot,
    changeId,
    missionId,
    dataFile,
    phase,
    sessionId: session?.session_id || context.runtime?.phaseRunSessionId || null,
    summary,
    findings,
    verdict,
    extraTeamRun: options.extraTeamRun || {},
    extraPhaseEntry: options.extraPhaseEntry || {},
    executedPhases: options.executedPhases || null,
  });

  const envelope = makeArtifactEnvelope({
    phase,
    changeId,
    missionId,
    phaseRun: persistResult.phaseRun,
    phaseEntry: persistResult.phaseEntry,
    extra: options.extraEnvelope || {},
  });

  const artifactPath = options.outputPath || artifactPathForPhase(projectRoot, changeId, phase, mode);
  writeJsonFile(artifactPath, envelope);

  if (options.writeMarkdown) {
    const mdPath = resolveChangePath(projectRoot, changeId, `${phase}.md`);
    writeTextFile(mdPath, `# ${phase}\n\n${summary}\n`);
  }

  if (options.writePen) {
    writeTextFile(penPath(projectRoot, changeId), options.penContent || `PENCIL ${phase}\n${summary}\n`);
  }

  if (options.writeAttestation) {
    writeJsonFile(attestationPath(projectRoot, changeId), {
      phase,
      change_id: changeId,
      mission_id: missionId,
      accepted: true,
      recorded_at: nowIso(),
    });
  }

  return {
    ok: true,
    mission_id: missionId,
    phase_run_id: persistResult.phaseRun?.phase_run_id || null,
    artifact_file: artifactPath,
    payload: envelope,
  };
}

export function buildPlanCommands(projectRoot) {
  const packageJsonPath = resolve(projectRoot, 'package.json');
  const packageJson = readJsonFile(packageJsonPath, null);
  if (packageJson?.scripts?.test) {
    return ['npm test'];
  }
  return ['echo "no test script configured"'];
}

export function writePlanMarkdown(projectRoot, changeId, phase = 'plan') {
  const commands = buildPlanCommands(projectRoot);
  const mdPath = resolveChangePath(projectRoot, changeId, `${phase}.md`);
  const lines = [
    '# Plan',
    '',
    '## Verification',
    '',
    '```bash',
    ...commands,
    '```',
    '',
  ];
  writeTextFile(mdPath, lines.join('\n'));
  return mdPath;
}

export function writeReviewArtifact(projectRoot, changeId, summary, findings = []) {
  const outputPath = resolveChangePath(projectRoot, changeId, 'review.json');
  writeJsonFile(outputPath, {
    version: 1,
    summary,
    findings: findings.map((finding) => ({
      summary: summarizeFinding(finding),
    })),
    recorded_at: nowIso(),
  });
  return outputPath;
}
