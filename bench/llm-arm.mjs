#!/usr/bin/env node
/**
 * Optional LLM judge arm. This file does not pick a model and does not call one.
 * The caller passes --runner; that command reads the prompt on stdin and may
 * run tests in the fixture directory, which is the child process cwd.
 *
 *   node bench/llm-arm.mjs --arm superpowers --superpowers-dir <path> \
 *     --runner "<cmd>" --model <name> --repeats 3
 *   node bench/llm-arm.mjs --arm baseline --runner "<cmd>" --model <name>
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'url';
import { collectEnvironment } from './lib/env.mjs';
import { claimHash, materialize } from './lib/materialize.mjs';
import { selectScenarios } from './lib/load-scenarios.mjs';
import { buildPrompt, parseJudgeOutput } from './lib/prompt.mjs';
import { assertCatalog, scenarios } from './lib/scenarios.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function usage() {
  console.error(`Usage: node bench/llm-arm.mjs --arm superpowers|baseline --runner "<cmd>" --model <name> [--superpowers-dir <path>] [--repeats N] [--timeout-ms N] [--concurrency N] [--set original|heldout|all] [--only id1,id2] [--out bench/results] [--date YYYY-MM-DD]`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = {
    repeats: 1,
    timeoutMs: 120000,
    out: join(repoRoot, 'bench', 'results'),
    date: new Date().toISOString().slice(0, 10),
    concurrency: 1,
    set: 'all',
    only: '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key.startsWith('--')) usage();
    if (value === undefined || value.startsWith('--')) usage();
    i += 1;
    if (key === '--arm') args.arm = value;
    else if (key === '--runner') args.runner = value;
    else if (key === '--model') args.model = value;
    else if (key === '--superpowers-dir') args.superpowersDir = resolve(value);
    else if (key === '--repeats') args.repeats = Number(value);
    else if (key === '--timeout-ms') args.timeoutMs = Number(value);
    else if (key === '--out') args.out = resolve(value);
    else if (key === '--date') args.date = value;
    else if (key === '--concurrency') args.concurrency = Number(value);
    else if (key === '--set') args.set = value;
    else if (key === '--only') args.only = value;
    else usage();
  }
  if (!args.arm || !['superpowers', 'baseline'].includes(args.arm)) usage();
  if (!args.runner || !args.model) usage();
  if (!Number.isInteger(args.repeats) || args.repeats < 1) usage();
  if (!Number.isInteger(args.concurrency) || args.concurrency < 1) usage();
  if (args.arm === 'superpowers' && !args.superpowersDir) usage();
  return args;
}

function fileSha(file) {
  const body = readFileSync(file);
  return { bytes: body.length, sha256: createHash('sha256').update(body).digest('hex') };
}

function loadSkillText(dir) {
  const relativeFiles = [
    'skills/test-driven-development/SKILL.md',
    'skills/verification-before-completion/SKILL.md',
  ];
  const parts = [];
  const files = [];
  for (const rel of relativeFiles) {
    const full = join(dir, rel);
    const body = readFileSync(full, 'utf8');
    parts.push(body.endsWith('\n') ? body : `${body}\n`);
    files.push({ path: rel, ...fileSha(full) });
  }
  return { text: parts.join('\n'), files };
}

function git(cwd, gitArgs) {
  const result = spawnSync('git', gitArgs, { cwd, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : '';
}

function runRunner({ runner, cwd, input, timeoutMs }) {
  return new Promise((resolvePromise) => {
    const child = spawn('sh', ['-c', runner], { cwd });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise({ status: 1, signal: null, stdout, stderr: `${stderr}${error.message}` });
    });
    child.on('close', (status, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise({ status, signal, stdout, stderr });
    });
    child.stdin.end(input);
  });
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
  const workers = Math.min(limit, items.length) || 1;
  await Promise.all(Array.from({ length: items.length ? workers : 0 }, () => run()));
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  assertCatalog(scenarios);
  const skill = args.arm === 'superpowers'
    ? loadSkillText(args.superpowersDir)
    : { text: '', files: [] };
  const environment = args.superpowersDir
    ? collectEnvironment({ repoRoot, superpowersDir: args.superpowersDir })
    : { date: new Date().toISOString(), openflowCommit: git(repoRoot, ['rev-parse', 'HEAD']) };
  if (args.arm === 'superpowers') {
    environment.superpowersCommit = git(args.superpowersDir, ['rev-parse', 'HEAD']);
    environment.superpowersTag = git(args.superpowersDir, ['describe', '--tags', '--exact-match', 'HEAD']);
  }
  mkdirSync(args.out, { recursive: true });
  const safeModel = args.model.replace(/[^a-zA-Z0-9._-]+/g, '-');
  const outFile = join(args.out, `llm-${args.arm}-${safeModel}-${args.date}.jsonl`);
  const meta = {
    type: 'meta',
    arm: args.arm,
    model: args.model,
    repeats: args.repeats,
    date: args.date,
    prompt: 'shared judge prompt; superpowers arm prepends the two skill files verbatim and baseline prepends nothing',
    skillFiles: skill.files,
    skillBytes: Buffer.byteLength(skill.text),
    environment,
    concurrency: args.concurrency,
    scenarioSet: args.set,
  };
  writeFileSync(outFile, `${JSON.stringify(meta)}\n`);
  const selection = selectScenarios({
    originals: scenarios,
    heldoutDir: join(repoRoot, 'bench', 'scenarios-heldout'),
    set: args.set,
    only: args.only,
  });
  const jobs = [];
  for (const scenario of selection.chosen) {
    for (let repeat = 1; repeat <= args.repeats; repeat += 1) jobs.push({ scenario, repeat });
  }
  const records = await mapPool(jobs, args.concurrency, async ({ scenario, repeat }) => {
    const { projectRoot, claimSha256 } = materialize(scenario, { repoRoot });
    try {
      const prompt = buildPrompt({ skillText: skill.text, claim: scenario.claim });
      if (claimHash(scenario.claim) !== claimSha256) {
        throw new Error(`claim hash mismatch for ${scenario.id}`);
      }
      const result = await runRunner({
        runner: args.runner,
        cwd: projectRoot,
        input: prompt,
        timeoutMs: args.timeoutMs,
      });
      const parsed = parseJudgeOutput(result.stdout || '');
      console.log(`${scenario.id} #${repeat} ${parsed.verdict}`);
      return {
        type: 'repeat',
        arm: args.arm,
        model: args.model,
        scenario: scenario.id,
        repeat,
        claimSha256,
        verdict: parsed.verdict,
        reason: parsed.reason,
        exitCode: result.status,
        signal: result.signal,
        raw: result.stdout || '',
        stderr: result.stderr || '',
      };
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
  const body = records.map((record) => JSON.stringify(record)).join('\n');
  writeFileSync(outFile, `${JSON.stringify(meta)}\n${body}${body ? '\n' : ''}`);
  console.log(outFile);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
