import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { materialize } from './materialize.mjs';

const GATE_ORDER = [
  { id: 'I6b.tdd.proof_validate', phase: 'red', args: ['--phase', 'red'] },
  { id: 'I6b.tdd.proof_validate', phase: 'green', args: ['--phase', 'green'] },
  { id: 'I6c.tdd.quality_review', phase: null, args: [] },
  { id: 'J1.tests.run', phase: null, args: [] },
  { id: 'J4a.spec_consistency.structural', phase: null, args: [] },
  { id: 'J4b.spec_delta.review', phase: null, args: [] },
];

function redact(text, projectRoot) {
  return String(text || '').split(projectRoot).join('{project}');
}

function parseJson(stdout) {
  const trimmed = String(stdout || '').trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function gateMessage(gate, payload, stdout, projectRoot) {
  if (!payload) return redact(stdout, projectRoot).trim().slice(0, 500);
  if (gate.id === 'I6b.tdd.proof_validate') {
    const bits = [payload.verdict, payload.phase, payload.error].filter(Boolean);
    if (payload.expected_passed !== undefined) {
      bits.push(`expected_passed=${payload.expected_passed}`);
      bits.push(`actual_passed=${payload.actual_passed}`);
    }
    return bits.join(' ') || 'invalid';
  }
  if (gate.id === 'I6c.tdd.quality_review') {
    const codes = payload.failed_codes || [];
    return codes.length ? codes.join(',') : payload.verdict || 'quality';
  }
  if (gate.id === 'J1.tests.run') {
    return payload.message || payload.verdict || `passed=${payload.passed}/${payload.total}`;
  }
  if (gate.id === 'J4a.spec_consistency.structural' || gate.id === 'J4b.spec_delta.review') {
    const issues = Array.isArray(payload.issue_texts) ? payload.issue_texts : (Array.isArray(payload.issues) ? payload.issues : []);
    return issues.length ? issues.map((issue) => redact(issue, projectRoot)).join(' | ') : payload.verdict;
  }
  if (gate.id === 'E6.gate.local_precheck') {
    const failed = (payload.checks || []).filter((check) => !check.ok && check.severity !== 'warn');
    return failed.map((check) => `${check.name}: ${redact(check.detail, projectRoot)}`).join(' | ');
  }
  return payload.verdict || payload.message || 'fail';
}

function readJsonIfExists(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function warningText(gate, payload, projectRoot, scenario) {
  if (gate.id === 'I6c.tdd.quality_review') {
    const proof = readJsonIfExists(join(projectRoot, 'specs', 'changes', scenario.id, 'tdd', 'quality-0.json'));
    return (proof?.findings || []).filter((finding) => finding.severity === 'warn').map((finding) => finding.code);
  }
  if (gate.id === 'J4b.spec_delta.review') {
    const proof = readJsonIfExists(join(projectRoot, 'specs', 'changes', scenario.id, 'spec_delta_review.json'));
    return (proof?.warnings || []).map((warning) => redact(warning, projectRoot));
  }
  if (gate.id === 'J4a.spec_consistency.structural') {
    return (payload?.warnings || []).map((warning) => redact(warning, projectRoot));
  }
  if (gate.id === 'E6.gate.local_precheck') {
    return (payload?.checks || []).filter((check) => !check.ok && check.severity === 'warn').map((check) => check.name);
  }
  return [];
}

function runGate(repoRoot, projectRoot, scenario, gate) {
  const args = [
    join(repoRoot, 'bin/xflow.js'),
    'atom',
    'run',
    gate.id,
    '--project-root',
    projectRoot,
    '--change-id',
    scenario.id,
    ...gate.args,
  ];
  const result = spawnSync(process.execPath, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: 60000,
  });
  const payload = parseJson(result.stdout);
  const exitCode = result.status ?? 1;
  return {
    id: gate.id,
    phase: gate.phase,
    exitCode,
    ok: exitCode === 0,
    message: gateMessage(gate, payload, result.stdout || result.stderr, projectRoot),
    warnings: warningText(gate, payload, projectRoot, scenario),
  };
}

export function judgeProject(repoRoot, projectRoot, scenario) {
  const gates = GATE_ORDER.map((gate) => runGate(repoRoot, projectRoot, scenario, gate));
  if (scenario.archive) {
    gates.push(runGate(repoRoot, projectRoot, scenario, {
      id: 'E6.gate.local_precheck',
      phase: 'pre-archive',
      args: ['--phase', 'pre-archive', '--json'],
    }));
  }
  const failed = gates.filter((gate) => !gate.ok);
  const verdict = failed.length === 0 ? 'ACCEPT' : 'REJECT';
  return {
    verdict,
    firstGate: failed[0] ? `${failed[0].id}${failed[0].phase ? `:${failed[0].phase}` : ''}` : '',
    message: failed[0]?.message || '',
    failedGates: failed.map((gate) => `${gate.id}${gate.phase ? `:${gate.phase}` : ''}`),
    gates,
  };
}

export function runScenario(scenario, { repoRoot }) {
  const { projectRoot, claimSha256 } = materialize(scenario, { repoRoot });
  try {
    const judged = judgeProject(repoRoot, projectRoot, scenario);
    return {
      id: scenario.id,
      category: scenario.category,
      expected: scenario.expected,
      description: scenario.description,
      claimSha256,
      set: scenario.set || 'original',
      ...judged,
    };
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
}

async function mapPool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
  return results;
}

export async function runOpenflowArm({ repoRoot, scenarios, concurrency = 4 }) {
  const rows = await mapPool(scenarios, concurrency, async (scenario) => runScenario(scenario, { repoRoot }));
  return rows;
}
