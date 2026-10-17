import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { materialize } from './materialize.mjs';
import { scenarios } from './scenarios.mjs';

const RUNS = 20;

const SUPERPOWERS_CORE = ['skills', 'hooks'];
const SUPERPOWERS_SHIPPED = [
  'skills',
  'hooks',
  'index.js',
  'package.json',
  'gemini-extension.json',
  '.claude-plugin',
  '.cursor-plugin',
  '.codex-plugin',
  '.opencode',
  '.pi',
  '.agents',
  '.antigravity-plugin',
  '.devin-plugin',
  '.hermes-plugin',
  '.kimi-plugin',
  '.muse-plugin',
];

function walkFiles(root, rel = '') {
  const full = rel ? join(root, rel) : root;
  const stat = statSync(full);
  if (stat.isFile()) {
    return [{ path: rel || full, bytes: stat.size }];
  }
  if (!stat.isDirectory()) return [];
  const files = [];
  for (const entry of readdirSync(full, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const child = rel ? `${rel}/${entry.name}` : entry.name;
    files.push(...walkFiles(root, child));
  }
  return files;
}

function sumFiles(files) {
  return {
    fileCount: files.length,
    bytes: files.reduce((sum, file) => sum + file.bytes, 0),
  };
}

export function measureTree(root, relativePaths) {
  const files = [];
  for (const rel of relativePaths) {
    const full = join(root, rel);
    try {
      statSync(full);
    } catch {
      continue;
    }
    const nested = walkFiles(root, rel);
    files.push(...nested);
  }
  return sumFiles(files);
}

function timingSummary(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = sorted.length / 2;
  const median = (sorted[mid - 1] + sorted[mid]) / 2;
  const p95 = sorted[Math.ceil(0.95 * sorted.length) - 1];
  return {
    n: sorted.length,
    medianMs: Number(median.toFixed(3)),
    p95Ms: Number(p95.toFixed(3)),
    minMs: Number(sorted[0].toFixed(3)),
    maxMs: Number(sorted.at(-1).toFixed(3)),
  };
}

function timeCommand(command, args, options, runs = RUNS) {
  const samples = [];
  let lastStatus = null;
  for (let i = 0; i < runs; i += 1) {
    const started = process.hrtime.bigint();
    const result = spawnSync(command, args, {
      encoding: 'utf8',
      timeout: 60000,
      ...options,
    });
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
    samples.push(elapsedMs);
    lastStatus = result.status;
  }
  return {
    command: [command, ...args].join(' '),
    lastExitCode: lastStatus,
    ...timingSummary(samples),
  };
}

function readPackJson(stdout) {
  const trimmed = String(stdout || '').trim();
  const start = trimmed.indexOf('[');
  const objectStart = trimmed.indexOf('{');
  const sliceAt = start >= 0 ? start : objectStart;
  if (sliceAt < 0) throw new Error(`npm pack did not return JSON: ${trimmed.slice(0, 400)}`);
  const parsed = JSON.parse(trimmed.slice(sliceAt));
  return Array.isArray(parsed) ? parsed[0] : parsed;
}

export function measureOpenflowPack(repoRoot) {
  const destination = mkdtempSync(join(tmpdir(), 'of-pack-'));
  try {
    const packed = spawnSync('npm', ['pack', '--json', '--pack-destination', destination], {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: 120000,
    });
    if (packed.status !== 0) {
      throw new Error(packed.stderr || packed.stdout || 'npm pack failed');
    }
    const meta = readPackJson(packed.stdout);
    const tarball = join(destination, meta.filename);
    const tarballBytes = statSync(tarball).size;
    const extractDir = join(destination, 'unpacked');
    mkdirSync(extractDir, { recursive: true });
    const extracted = spawnSync('tar', ['-xzf', tarball, '-C', extractDir], { encoding: 'utf8' });
    if (extracted.status !== 0) throw new Error(extracted.stderr || 'tar extract failed');
    const unpacked = sumFiles(walkFiles(extractDir));
    const names = (meta.files || []).map((file) => file.path || file.name || String(file));
    const benchHits = names.filter((name) => name === 'bench' || name.startsWith('bench/'));
    return {
      command: 'npm pack --json --pack-destination <tmp>',
      filename: meta.filename,
      tarballBytes,
      npmReportedUnpackedBytes: meta.unpackedSize ?? null,
      unpackedBytes: unpacked.bytes,
      fileCount: names.length || unpacked.fileCount,
      benchIncluded: benchHits,
    };
  } finally {
    rmSync(destination, { recursive: true, force: true });
  }
}

function hostNeutralEnv() {
  const env = { ...process.env };
  for (const key of ['CURSOR_PLUGIN_ROOT', 'CLAUDE_PLUGIN_ROOT', 'COPILOT_CLI', 'MUSE_PLUGIN_ROOT']) {
    delete env[key];
  }
  return env;
}

export function measureDryRunExcludesBench(repoRoot) {
  const result = spawnSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 120000,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'npm pack --dry-run failed');
  }
  const meta = readPackJson(result.stdout);
  const names = (meta.files || []).map((file) => file.path || file.name || String(file));
  const benchHits = names.filter((name) => name === 'bench' || name.startsWith('bench/'));
  return {
    command: 'npm pack --dry-run --json',
    fileCount: names.length,
    benchIncluded: benchHits,
  };
}

function skillBytes(file) {
  const bytes = Buffer.byteLength(readFileSync(file));
  return { path: file, bytes, approxTokens: Math.round(bytes / 4) };
}

export function measureSuperpowersContext(superpowersDir) {
  const hook = join(superpowersDir, 'hooks', 'session-start');
  const once = spawnSync('bash', [hook], { encoding: 'buffer', env: hostNeutralEnv(), timeout: 15000 });
  if (once.status !== 0) {
    throw new Error(`session-start exited ${once.status}: ${once.stderr.toString('utf8')}`);
  }
  const stdout = once.stdout.toString('utf8');
  const payload = JSON.parse(stdout);
  const context = payload.additionalContext
    || payload.additional_context
    || payload.hookSpecificOutput?.additionalContext
    || '';
  const contextBytes = Buffer.byteLength(context);
  const tdd = skillBytes(join(superpowersDir, 'skills', 'test-driven-development', 'SKILL.md'));
  const verify = skillBytes(join(superpowersDir, 'skills', 'verification-before-completion', 'SKILL.md'));
  return {
    hook,
    shape: payload.additionalContext ? 'additionalContext' : (payload.additional_context ? 'additional_context' : 'hookSpecificOutput'),
    stdoutBytes: once.stdout.length,
    injectedContextBytes: contextBytes,
    approxTokens: Math.round(contextBytes / 4),
    tokenNote: 'approximate tokens = bytes/4 of the injected context string',
    llmArmSkillBytes: tdd.bytes + verify.bytes,
    llmArmSkillApproxTokens: Math.round((tdd.bytes + verify.bytes) / 4),
    llmArmSkills: [tdd, verify],
  };
}

export function measureOpenflowContext(repoRoot) {
  const skill = skillBytes(join(repoRoot, 'xflow', 'yolo', 'SKILL.md'));
  return {
    sessionStartHook: null,
    skillEntry: 'xflow/yolo/SKILL.md',
    bytes: skill.bytes,
    approxTokens: skill.approxTokens,
    tokenNote: 'approximate tokens = bytes/4; OpenFlow has no session-start hook in this package, so this is the yolo skill entry document',
  };
}

export function measureLatency({ repoRoot, superpowersDir }) {
  const sample = scenarios.find((scenario) => scenario.id === 'honest-add');
  const { projectRoot } = materialize(sample, { repoRoot });
  try {
    const i6b = timeCommand(process.execPath, [
      join(repoRoot, 'bin/xflow.js'),
      'atom', 'run', 'I6b.tdd.proof_validate',
      '--project-root', projectRoot,
      '--change-id', sample.id,
      '--phase', 'red',
    ], { cwd: projectRoot });
    const i6c = timeCommand(process.execPath, [
      join(repoRoot, 'bin/xflow.js'),
      'atom', 'run', 'I6c.tdd.quality_review',
      '--project-root', projectRoot,
      '--change-id', sample.id,
    ], { cwd: projectRoot });
    const validate = timeCommand(process.execPath, [
      join(repoRoot, 'bin/xflow.js'),
      'workflow', 'validate', 'yolo',
      '--project-root', repoRoot,
    ], { cwd: repoRoot });
    const hook = timeCommand('bash', [join(superpowersDir, 'hooks', 'session-start')], {
      cwd: superpowersDir,
      env: hostNeutralEnv(),
    });
    return {
      runs: RUNS,
      i6b,
      i6c,
      workflowValidate: validate,
      sessionStart: hook,
    };
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
}

export function measureOverhead({ repoRoot, superpowersDir }) {
  const pack = measureOpenflowPack(repoRoot);
  const dryRun = measureDryRunExcludesBench(repoRoot);
  const core = measureTree(superpowersDir, SUPERPOWERS_CORE);
  const shipped = measureTree(superpowersDir, SUPERPOWERS_SHIPPED);
  return {
    openflowPack: pack,
    openflowDryRun: dryRun,
    superpowersCore: { paths: SUPERPOWERS_CORE, ...core },
    superpowersShipped: { paths: SUPERPOWERS_SHIPPED, ...shipped },
    context: {
      superpowers: measureSuperpowersContext(superpowersDir),
      openflow: measureOpenflowContext(repoRoot),
    },
    latency: measureLatency({ repoRoot, superpowersDir }),
  };
}

export function resolveSuperpowersDir(explicit) {
  if (explicit) return resolve(explicit);
  return resolve('/workspace/agents/gity/bench-deps/superpowers');
}
