import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const XFLOW_REL = 'bin/xflow.js';

export function claimHash(claim) {
  return createHash('sha256').update(String(claim).trim()).digest('hex');
}

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return result;
}

function writeFiles(root, files) {
  for (const [relative, contents] of Object.entries(files)) {
    const target = join(root, relative);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents);
  }
}

function proposalFor(scenario) {
  if (scenario.proposal) return scenario.proposal.endsWith('\n') ? scenario.proposal : `${scenario.proposal}\n`;
  return `# Proposal

## Problem

${scenario.problem}

## Scope

${scenario.scope}

## Requirements

- ${scenario.requirement}
`;
}

function planFor(scenario) {
  if (scenario.plan) return scenario.plan.endsWith('\n') ? scenario.plan : `${scenario.plan}\n`;
  return `# Plan

## Approach

${scenario.approach}

The change stays inside this fixture. Verification is the fenced command below and nothing else.

## Verification

\`\`\`bash
${scenario.verifyCommand}
\`\`\`
`;
}

function writeChangeSpecs(root, scenario) {
  const changeDir = join(root, 'specs', 'changes', scenario.id);
  mkdirSync(changeDir, { recursive: true });
  writeFileSync(join(changeDir, 'proposal.md'), proposalFor(scenario));
  writeFileSync(join(changeDir, 'plan.md'), planFor(scenario));
  writeFileSync(join(changeDir, 'tasks.md'), `# Tasks

- [x] ${scenario.task}
`);
  writeFileSync(join(changeDir, 'issue.md'), `# ${scenario.title}

Tracked fixture for ${scenario.id}. The body is long enough for artifact checks.
`);
  const status = {
    change_id: scenario.id,
    title: scenario.title,
    change_type: 'backend',
    status: scenario.status.status,
    current_stage: scenario.status.current_stage,
    verification_status: scenario.status.verification_status,
  };
  if (scenario.tddMode) status.tdd_mode = scenario.tddMode;
  writeFileSync(join(changeDir, 'status.json'), `${JSON.stringify(status, null, 2)}\n`);
}

function runAtom(repoRoot, projectRoot, scenario, step) {
  const args = [
    join(repoRoot, XFLOW_REL),
    'atom',
    'run',
    'I6a.tdd.run',
    '--project-root',
    projectRoot,
    '--change-id',
    scenario.id,
    '--phase',
    step.phase,
    '--attempt',
    '0',
    '--test-command',
    step.command,
  ];
  const result = spawnSync(process.execPath, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: 60000,
  });
  const exitCode = result.status ?? 1;
  if (exitCode !== step.expectExit) {
    throw new Error(
      `${scenario.id} I6a ${step.phase} exited ${exitCode}, expected ${step.expectExit}\n${result.stdout}\n${result.stderr}`,
    );
  }
  return { phase: step.phase, command: step.command, exitCode };
}

function tamperProof(projectRoot, scenario, step) {
  const file = join(projectRoot, 'specs', 'changes', scenario.id, 'tdd', `${step.phase}-0.json`);
  const proof = JSON.parse(readFileSync(file, 'utf8'));
  Object.assign(proof, step.set);
  writeFileSync(file, `${JSON.stringify(proof, null, 2)}\n`);
}

function presentedLog(projectRoot, scenario) {
  const lines = ['# Presented command log', ''];
  for (const phase of ['red', 'green']) {
    const file = join(projectRoot, 'specs', 'changes', scenario.id, 'tdd', `${phase}-0.json`);
    lines.push(`## ${phase}`);
    try {
      const proof = JSON.parse(readFileSync(file, 'utf8'));
      lines.push(`command: ${proof.command}`);
      lines.push(`exit_code: ${proof.exit_code}`);
      lines.push(`passed: ${proof.passed}`);
      lines.push('stdout:');
      lines.push(proof.stdout_tail || '(empty)');
    } catch {
      lines.push('not recorded');
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

export function materialize(scenario, { repoRoot, keepEvidence = true } = {}) {
  const projectRoot = mkdtempSync(join(tmpdir(), `of-bench-${scenario.id}-`));
  git(projectRoot, ['init', '-q']);
  git(projectRoot, ['config', 'user.email', 'bench@example.test']);
  git(projectRoot, ['config', 'user.name', 'bench']);
  writeFiles(projectRoot, scenario.baseline);
  git(projectRoot, ['add', '-A']);
  git(projectRoot, ['commit', '-q', '-m', 'baseline']);
  writeChangeSpecs(projectRoot, scenario);
  for (const step of scenario.steps) {
    if (step.type === 'write') writeFiles(projectRoot, step.files);
    else if (step.type === 'atom') runAtom(repoRoot, projectRoot, scenario, step);
    else if (step.type === 'tamper') tamperProof(projectRoot, scenario, step);
    else throw new Error(`${scenario.id} unknown step ${step.type}`);
  }
  writeFileSync(join(projectRoot, 'CLAIM.md'), `${scenario.claim.trim()}\n`);
  if (keepEvidence) {
    const diff = spawnSync('git', ['diff', 'HEAD'], { cwd: projectRoot, encoding: 'utf8' });
    const status = spawnSync('git', ['status', '--short'], { cwd: projectRoot, encoding: 'utf8' });
    mkdirSync(join(projectRoot, 'evidence'), { recursive: true });
    writeFileSync(join(projectRoot, 'evidence', 'git-diff.txt'), diff.stdout || '');
    writeFileSync(join(projectRoot, 'evidence', 'git-status.txt'), status.stdout || '');
    writeFileSync(join(projectRoot, 'evidence', 'presented-log.md'), presentedLog(projectRoot, scenario));
  }
  return { projectRoot: resolve(projectRoot), claimSha256: claimHash(scenario.claim) };
}
