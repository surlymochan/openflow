import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

function nowIso() {
  return new Date().toISOString();
}

export function resolveChangeDir(projectRoot, changeId) {
  if (!changeId) {
    throw new Error('change_id is required');
  }
  return resolve(projectRoot, 'specs', 'changes', changeId);
}

export function resolveChangePath(projectRoot, changeId, relativePath) {
  return resolve(resolveChangeDir(projectRoot, changeId), relativePath);
}

export function ensureParentDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

export function writeJsonFile(filePath, payload) {
  ensureParentDir(filePath);
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return filePath;
}

export function writeTextFile(filePath, content) {
  ensureParentDir(filePath);
  writeFileSync(filePath, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
  return filePath;
}

export function readJsonFile(filePath, fallback = null) {
  if (!existsSync(filePath)) {
    return fallback;
  }
  try {
    const raw = readFileSync(filePath, 'utf8');
    return raw.trim() ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function collectExistingFiles(paths) {
  return paths.filter((filePath) => existsSync(filePath));
}

export function summarizeFinding(finding = {}) {
  if (typeof finding === 'string') {
    return finding.trim();
  }
  return String(finding.summary || finding.title || finding.rationale || '').trim();
}

export function summarizeTeamRun(teamRun = {}) {
  const findings = Array.isArray(teamRun.findings)
    ? teamRun.findings.map((finding) => summarizeFinding(finding)).filter(Boolean)
    : [];
  return {
    pattern: teamRun.pattern || null,
    verdict: teamRun.verdict || null,
    evidence_bundle: teamRun.evidence_bundle || null,
    findings,
    qa_acceptance_packet: teamRun.qa_acceptance_packet || null,
    workspace_evidence: teamRun.workspace_evidence || null,
  };
}

export function makeArtifactEnvelope({ phase, changeId, missionId = null, phaseRun = null, phaseEntry = null, extra = {} }) {
  const teamRun = phaseEntry?.team_run || {};
  return {
    version: 1,
    phase,
    change_id: changeId,
    mission_id: missionId,
    phase_run_id: phaseRun?.phase_run_id || null,
    generated_at: nowIso(),
    summary: phaseEntry?.summary || phaseRun?.summary || '',
    status: phaseEntry?.effective_status || phaseEntry?.status || phaseRun?.status || 'needs_human',
    team_run: summarizeTeamRun(teamRun),
    phase_health: phaseEntry?.health_check || null,
    source: {
      phase_run_file: phaseRun?.phase_run_file || null,
      deployed_url: phaseRun?.deployed_url || null,
    },
    ...extra,
  };
}

export function renderMarkdownArtifact({ title, phase, envelope }) {
  const lines = [
    `# ${title}`,
    '',
    `- phase: ${phase}`,
    `- change_id: ${envelope.change_id}`,
    `- mission_id: ${envelope.mission_id || ''}`,
    `- phase_run_id: ${envelope.phase_run_id || ''}`,
    `- status: ${envelope.status || ''}`,
    '',
  ];

  if (envelope.summary) {
    lines.push('## Summary', '', envelope.summary, '');
  }

  const verdictStatus = envelope.team_run?.verdict?.status;
  const verdictRationale = envelope.team_run?.verdict?.rationale;
  if (verdictStatus || verdictRationale) {
    lines.push('## Verdict', '');
    if (verdictStatus) lines.push(`- status: ${verdictStatus}`);
    if (verdictRationale) lines.push(`- rationale: ${verdictRationale}`);
    lines.push('');
  }

  if (Array.isArray(envelope.team_run?.findings) && envelope.team_run.findings.length > 0) {
    lines.push('## Findings', '');
    for (const finding of envelope.team_run.findings) {
      lines.push(`- ${finding}`);
    }
    lines.push('');
  }

  if (envelope.qa_acceptance_packet) {
    lines.push('## QA Acceptance', '');
    lines.push('```json');
    lines.push(JSON.stringify(envelope.qa_acceptance_packet, null, 2));
    lines.push('```', '');
  }

  return lines.join('\n');
}
