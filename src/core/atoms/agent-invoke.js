/**
 * agent_invoke — Heavy track dispatcher for LLM agent execution.
 *
 * Creates task packages for LLM agents to pick up.
 * In a future iteration, will spawn Codex/Claude CLI subprocesses directly.
 *
 * Returns { ok, status, task_file } for workflow state tracking.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { persistSyntheticPhaseRun, defaultVerdictForPhase } from '../../agent_team/common.js';
import { resolveChangePath, writeJsonFile, writeTextFile } from '../change-artifacts.js';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const DEFAULT_CODEX_MODEL = 'gpt-5.4';
const DEFAULT_AGENT_TIMEOUT_MS = 300_000;
const DEFAULT_HEAVY_CLI_TIMEOUT_MS = 1_800_000;

export default async function agentInvoke(args, context) {
  const { workflow, phase, projectRoot, changeId, atomDef } = context;
  const track = workflow.track || atomDef.track || 'heavy';
  const changeDir = resolve(projectRoot, 'specs', 'changes', changeId);
  const agentCfg = atomDef.agent_config || {};
  const expectedArtifact = resolveExpectedArtifact(atomDef, phase, changeId);
  const stubCfg = resolveStubConfig(atomDef.stub_config || {}, args.mode || null);
  const atomId = atomDef.id || context._atomId || args.atom_id || 'agent_invoke';
  const adapterResolution = resolveAdapter(atomDef, phase, projectRoot, expectedArtifact, stubCfg);

  const promptText = resolvePrompt(atomDef, phase, changeId, changeDir, expectedArtifact, renderAuxiliaryOutputs(stubCfg, changeId, projectRoot));

  const taskPackage = {
    phase_id: phase?.id,
    phase_label: phase?.label,
    prompt: promptText,
    expected_artifact: expectedArtifact,
    track,
    agent_config: agentCfg,
    resolved_adapter: adapterResolution.adapter,
    adapter_reason: adapterResolution.reason || null,
    atom_id: atomId,
    created_at: new Date().toISOString(),
  };

  const taskDir = resolve(projectRoot, '.as-xflow', 'pending-tasks');
  mkdirSync(taskDir, { recursive: true });
  const taskId = `${phase.id}.${taskPackage.atom_id}`;
  const taskFile = resolve(taskDir, `${taskId}.json`);
  const promptFile = resolve(taskDir, `${taskId}.prompt.md`);
  writeFileSync(taskFile, JSON.stringify(taskPackage, null, 2));
  writeFileSync(promptFile, promptText);

  const artifactPath = resolve(projectRoot, expectedArtifact);
  const timeoutMs = resolveAgentTimeoutMs(agentCfg, adapterResolution.adapter);
  const killAfterMs = agentCfg.kill_after_ms || 2_000;
  const retries = agentCfg.retries || 0;
  const retryDelayMs = agentCfg.retry_delay_ms || 0;
  if (adapterResolution.adapter === 'codex_cli') {
    const result = await runWithRetry('codex', runCodexExec, promptText, {
      cwd: projectRoot,
      timeoutMs,
      killAfterMs,
      retries,
      retryDelayMs,
      changeDir,
      expectedArtifact: artifactPath,
      model: agentCfg.model || process.env.XFLOW_CODEX_MODEL || DEFAULT_CODEX_MODEL,
    });
    return {
      ...result,
      adapter: 'codex_cli',
      adapter_reason: adapterResolution.reason || null,
      task_file: `.as-xflow/pending-tasks/${taskId}.json`,
    };
  }
  if (adapterResolution.adapter === 'claude_cli') {
    const result = await runWithRetry('claude', runClaudeCli, promptText, {
      cwd: projectRoot,
      timeoutMs,
      killAfterMs,
      retries,
      retryDelayMs,
      changeDir,
      expectedArtifact: artifactPath,
    });
    return {
      ...result,
      adapter: 'claude_cli',
      adapter_reason: adapterResolution.reason || null,
      task_file: `.as-xflow/pending-tasks/${taskId}.json`,
    };
  }
  if (adapterResolution.adapter === 'pencil_cli') {
    const result = await runWithRetry('pencil', runPencilCli, promptText, {
      cwd: projectRoot,
      timeoutMs,
      killAfterMs,
      retries,
      retryDelayMs,
      changeDir,
      expectedArtifact: artifactPath,
      phaseId: phase?.id || '',
      previewArtifact: resolveChangePath(projectRoot, changeId, 'pencil_preview.png'),
      exportPreview: stubCfg.write_pen === true,
      model: agentCfg.model || null,
    });
    return {
      ...result,
      adapter: 'pencil_cli',
      task_file: `.as-xflow/pending-tasks/${taskId}.json`,
      adapter_reason: adapterResolution.reason || null,
    };
  }

  if (realAgentRuntimeRequired(atomDef)) {
    const reason = adapterResolution.reason || 'real_agent_runtime_unavailable';
    return {
      ok: false,
      status: 'real_agent_runtime_missing',
      adapter: 'stub',
      adapter_reason: reason,
      task_file: `.as-xflow/pending-tasks/${taskId}.json`,
      expected_artifact: artifactPath,
      agent_config: agentCfg,
      error: `Strict corps runtime forbids stub fallback (${reason}). Install/authenticate the required agent runtime and rerun.`,
    };
  }

  const missionId = context.runtime?.missionId || args.mission_id || null;
  const sessionId = context.runtime?.phaseRunSessionId || args.session_id || null;
  const dataFile = args.data_file || resolve(projectRoot, '.as-xflow', 'state.sqlite');
  const syntheticPhase = stubCfg.phase || phase.id;
  const fallbackStatus = adapterResolution.adapter === 'stub' && adapterResolution.reason?.startsWith('pencil_')
    ? 'pencil_stubbed'
    : 'task_queued';
  const summary = adapterResolution.adapter === 'stub' && adapterResolution.reason
    ? `${stubCfg.summary || `Phase ${phase.id} queued for agent execution`} (${adapterResolution.reason})`
    : (stubCfg.summary || `Phase ${phase.id} queued for agent execution`);
  if (missionId) {
    await persistSyntheticPhaseRun({
      projectRoot,
      changeId,
      missionId,
      dataFile,
      phase: syntheticPhase,
      sessionId,
      summary,
      findings: [],
      verdict: stubCfg.verdict || defaultVerdictForPhase(syntheticPhase, args.mode || null),
      extraTeamRun: materializeValue(stubCfg.extra_team_run || {}, { changeId, phaseId: phase.id, phaseLabel: phase.label || '', projectRoot }),
      extraPhaseEntry: { status: 'completed', ...materializeValue(stubCfg.extra_phase_entry || {}, { changeId, phaseId: phase.id, phaseLabel: phase.label || '', projectRoot }) },
    });
  }

  writeJsonFile(artifactPath, {
    phase_id: phase.id,
    phase: syntheticPhase,
    status: 'task_queued',
    summary,
    ...(materializeValue(stubCfg.primary_artifact_json || {}, { changeId, phaseId: phase.id, phaseLabel: phase.label || '', projectRoot })),
  });
  writeAuxiliaryStubArtifacts(stubCfg, { projectRoot, changeId, phase });

  console.log(`     [AGENT_TASK] ${taskId} → .as-xflow/pending-tasks/${taskId}.json`);
  return {
    ok: true,
    status: fallbackStatus,
    adapter: 'stub',
    task_file: `.as-xflow/pending-tasks/${taskId}.json`,
    expected_artifact: artifactPath,
    agent_config: agentCfg,
    adapter_reason: adapterResolution.reason || null,
  };
}

function resolvePrompt(atomDef, phase, changeId, changeDir, expectedArtifact, auxiliaryOutputs) {
  if (atomDef.prompt_template) {
    const tmplPath = resolve(ROOT, atomDef.prompt_template);
    if (existsSync(tmplPath)) {
      let text = readFileSync(tmplPath, 'utf8');
      text = text
        .replace(/\{\{change_id\}\}/g, changeId || '')
        .replace(/\{\{phase_id\}\}/g, phase?.id || '')
        .replace(/\{\{phase_label\}\}/g, phase?.label || '')
        .replace(/\{\{artifact_dir\}\}/g, changeDir)
        .replace(/\{\{expected_artifact\}\}/g, expectedArtifact || '')
        .replace(/\{\{auxiliary_outputs\}\}/g, auxiliaryOutputs || '(none)')
        .replace(/\{\{phase_guidance\}\}/g, phaseSpecificGuidance(phase?.id || '', expectedArtifact))
        .replace(/\{\{intake\}\}/g, loadIntake(changeDir));
      return text;
    }
  }
  return atomDef.prompt || `Execute phase "${phase?.id}" (${phase?.label}). Primary artifact should be written to ${expectedArtifact || changeDir}.`;
}

function phaseSpecificGuidance(phaseId, expectedArtifact) {
  const artifactNote = expectedArtifact ? `Primary artifact: \`${expectedArtifact}\`` : 'Primary artifact: use the expected phase artifact path.';
  const guidance = {
    explore: [
      artifactNote,
      '- Summarize same-category evidence, IA takeaways, and non-negotiable product invariants.',
      '- Refresh `findings.md` when it helps later phases move faster.',
      '- Do not start freeform implementation in this phase.',
    ],
    brainstorm: [
      artifactNote,
      '- Generate multiple concrete solution directions, then recommend one with explicit tradeoffs.',
      '- Keep the artifact structured and decision-oriented, not essay-like.',
      '- Do not build product UI in brainstorm; freeze directional options for downstream selection.',
    ],
    risk_review: [
      artifactNote,
      '- Identify execution, product, design, and workflow risks with mitigation ideas.',
      '- Prefer concise structured risk entries with severity and action.',
    ],
    clarify: [
      artifactNote,
      '- Resolve or explicitly list ambiguity, assumptions, and questions that affect execution.',
      '- If assumptions are necessary, make them concrete and scoped.',
    ],
    proposal: [
      artifactNote,
      '- Update both `proposal.md` and `proposal.json` in the change directory.',
      '- Convert the chosen direction into clear scope, out-of-scope, acceptance intent, and design direction.',
    ],
    ux_design_brief: [
      artifactNote,
      '- Produce a concrete UX brief: IA, primary flows, key states, visual direction, and interaction constraints.',
      '- This is still pre-implementation; focus on design and product shape, not code volume.',
    ],
    plan: [
      artifactNote,
      '- Update both `plan.md` and `plan.json` with a real execution plan.',
      '- The plan must be implementation-ready and aligned with the frozen competitor contract.',
    ],
  };
  return (guidance[phaseId] || [
    artifactNote,
    '- Produce the concrete downstream artifact required for this phase.',
    '- Keep the output structured, phase-appropriate, and ready for the next gate.',
  ]).join('\n');
}

function loadIntake(changeDir) {
  const intakeFile = resolve(changeDir, 'intake.json');
  if (existsSync(intakeFile)) {
    try { return JSON.stringify(JSON.parse(readFileSync(intakeFile, 'utf8')), null, 2); } catch { /* */ }
  }
  return '(no intake context available)';
}

function resolveArtifactPath(artifacts, changeId, projectRoot) {
  const firstRequired = artifacts?.find(a => !a.optional);
  if (firstRequired?.path) {
    const resolved = firstRequired.path.replace(/\$\{change_id\}/g, changeId);
    return resolve(projectRoot, resolved);
  }
  return resolve(projectRoot, 'specs', 'changes', changeId, 'artifact.json');
}

async function runProc(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: opts.cwd,
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    let forceKilled = false;
    let earlyArtifactExit = false;
    let resolvedArtifact = null;
    let timeoutHandle = null;
    let killHandle = null;
    let artifactPollHandle = null;
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', (error) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (killHandle) clearTimeout(killHandle);
      if (artifactPollHandle) clearInterval(artifactPollHandle);
      reject(error);
    });
    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (killHandle) clearTimeout(killHandle);
      if (artifactPollHandle) clearInterval(artifactPollHandle);
      resolve({ code, signal, stdout, stderr, timedOut, forceKilled, earlyArtifactExit, artifact: resolvedArtifact });
    });
    if (opts.expectedArtifact && opts.earlyArtifactExit !== false) {
      const artifactPollMs = opts.artifactPollMs || 100;
      artifactPollHandle = setInterval(() => {
        if (settled || resolvedArtifact) return;
        if (!existsSync(opts.expectedArtifact)) return;
        try {
          resolvedArtifact = JSON.parse(readFileSync(opts.expectedArtifact, 'utf8'));
        } catch {
          return;
        }
        earlyArtifactExit = true;
        stderr += '\n[agent_invoke] valid artifact detected before process exit; stopping agent process early';
        child.kill('SIGTERM');
        const killAfterMs = opts.killAfterMs || 2_000;
        if (killHandle) clearTimeout(killHandle);
        killHandle = setTimeout(() => {
          if (settled) return;
          forceKilled = true;
          stderr += `\n[agent_invoke] force killed after ${killAfterMs}ms grace period`;
          child.kill('SIGKILL');
        }, killAfterMs);
      }, artifactPollMs);
    }
    if (opts.timeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        if (settled) return;
        timedOut = true;
        stderr += `\n[agent_invoke] timed out after ${opts.timeoutMs}ms`;
        child.kill('SIGTERM');
        const killAfterMs = opts.killAfterMs || 2_000;
        killHandle = setTimeout(() => {
          if (settled) return;
          forceKilled = true;
          stderr += `\n[agent_invoke] force killed after ${killAfterMs}ms grace period`;
          child.kill('SIGKILL');
        }, killAfterMs);
      }, opts.timeoutMs);
    }
    child.stdin.write(opts.input || '');
    child.stdin.end();
  });
}

async function resolveOutputJson(expectedPath, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (existsSync(expectedPath)) {
      try { return JSON.parse(readFileSync(expectedPath, 'utf8')); } catch { }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

async function runCodexExec(prompt, opts) {
  const args = ['exec', '--full-auto', '--json', '--skip-git-repo-check', '-C', opts.cwd];
  if (opts.model) {
    args.push('--model', opts.model);
  }
  args.push(prompt);
  let { code, signal, stdout, stderr, timedOut, forceKilled, earlyArtifactExit, artifact } = await runProc('codex', args, { cwd: opts.cwd, timeoutMs: opts.timeoutMs, killAfterMs: opts.killAfterMs, input: '', expectedArtifact: opts.expectedArtifact });
  const output = artifact || await resolveOutputJson(opts.expectedArtifact, 10_000);
  let timedOutRecovered = false;
  if (output && timedOut) {
    timedOutRecovered = true;
    code = 0;
    signal = null;
    timedOut = false;
    stderr += '\n[agent_invoke] valid artifact detected after timeout; accepting artifact output';
  }
  if (output && earlyArtifactExit) {
    code = 0;
    signal = null;
  }
  return { code, signal, stdout, stderr, artifact: output, timedOut, forceKilled, timedOutRecovered, earlyArtifactExit };
}

async function runClaudeCli(prompt, opts) {
  let { code, signal, stdout, stderr, timedOut, forceKilled, earlyArtifactExit, artifact } = await runProc('claude', [
    '-p', '--dangerously-skip-permissions', '--no-session-persistence', prompt,
  ], { cwd: opts.cwd, timeoutMs: opts.timeoutMs, killAfterMs: opts.killAfterMs, input: '', expectedArtifact: opts.expectedArtifact });
  const output = artifact || await resolveOutputJson(opts.expectedArtifact, 10_000);
  let timedOutRecovered = false;
  if (output && timedOut) {
    timedOutRecovered = true;
    code = 0;
    signal = null;
    timedOut = false;
    stderr += '\n[agent_invoke] valid artifact detected after timeout; accepting artifact output';
  }
  if (output && earlyArtifactExit) {
    code = 0;
    signal = null;
  }
  return { code, signal, stdout, stderr, artifact: output, timedOut, forceKilled, timedOutRecovered, earlyArtifactExit };
}

async function runPencilCli(prompt, opts) {
  const outputPath = opts.expectedArtifact;
  mkdirSync(dirname(outputPath), { recursive: true });
  const existingInput = existsSync(outputPath) ? outputPath : null;
  const args = ['--out', outputPath, '--prompt', prompt, '--workspace', opts.cwd];
  if (existingInput && opts.phaseId === 'pencil_refine') {
    args.unshift('--in', existingInput);
  }
  if (opts.model) {
    args.push('--model', opts.model);
  }
  if (opts.exportPreview) {
    args.push('--export', opts.previewArtifact, '--export-type', 'png');
  }
  let { code, signal, stdout, stderr, timedOut, forceKilled } = await runProc('pencil', args, {
    cwd: opts.cwd,
    timeoutMs: opts.timeoutMs,
    killAfterMs: opts.killAfterMs,
    input: '',
  });
  const artifact = resolvePencilArtifact(outputPath, opts, { requirePreview: code !== 0 || timedOut });
  let artifactRecovered = false;
  if (artifact && (code !== 0 || timedOut)) {
    artifactRecovered = true;
    code = 0;
    signal = null;
    timedOut = false;
    stderr += '\n[agent_invoke] valid pencil artifact detected despite CLI failure; accepting artifact output';
  }
  return { code, signal, stdout, stderr, artifact, timedOut, forceKilled, artifactRecovered };
}

function resolvePencilArtifact(outputPath, opts, { requirePreview = false } = {}) {
  if (!fileReady(outputPath)) return null;
  if (requirePreview && opts.exportPreview && !fileReady(opts.previewArtifact)) return null;
  return {
    type: 'pencil_pen',
    path: outputPath,
    preview_path: fileReady(opts.previewArtifact) ? opts.previewArtifact : null,
  };
}

function fileReady(path) {
  if (!path || !existsSync(path)) return false;
  try {
    return statSync(path).size > 0;
  } catch {
    return false;
  }
}

async function runWithRetry(label, runner, prompt, opts) {
  const retries = opts.retries || 0;
  const retryDelayMs = opts.retryDelayMs || 0;
  const attempts = [];
  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    const result = await runner(prompt, opts);
    const normalized = { attempt, ...result };
    attempts.push(normalized);
    if (!shouldRetry(normalized) || attempt > retries) {
      return finalizeAttemptSeries(label, attempts);
    }
    if (retryDelayMs > 0) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, retryDelayMs));
    }
  }
  return finalizeAttemptSeries(label, attempts);
}

function shouldRetry(result) {
  if (result.timedOut) return true;
  return result.code !== 0;
}

function finalizeAttemptSeries(label, attempts) {
  const last = attempts[attempts.length - 1] || {};
  const succeeded = last.code === 0 && !last.timedOut;
  const retriesUsed = Math.max(0, attempts.length - 1);
  return {
    ok: succeeded,
    status: succeeded ? `${label}_completed` : (last.timedOut ? `${label}_timed_out` : `${label}_failed`),
    code: last.code,
    signal: last.signal || null,
    stdout: last.stdout || '',
    stderr: last.stderr || '',
    artifact: last.artifact || null,
    timed_out: last.timedOut === true,
    force_killed: last.forceKilled === true,
    attempts: attempts.length,
    retries_used: retriesUsed,
    attempt_results: attempts.map(({ attempt, code, signal, timedOut, forceKilled, timedOutRecovered, earlyArtifactExit, artifactRecovered }) => ({
      attempt,
      code,
      signal: signal || null,
      timed_out: timedOut === true,
      force_killed: forceKilled === true,
      timed_out_recovered: timedOutRecovered === true,
      early_artifact_exit: earlyArtifactExit === true,
      artifact_recovered: artifactRecovered === true,
    })),
    timed_out_recovered: last.timedOutRecovered === true,
    early_artifact_exit: last.earlyArtifactExit === true,
    artifact_recovered: last.artifactRecovered === true,
  };
}

function commandExists(command, projectRoot) {
  const result = spawnSync('which', [command], {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return result.status === 0 && Boolean(result.stdout.trim());
}

function pencilAuthenticated(projectRoot) {
  const result = spawnSync('pencil', ['status'], {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return result.status === 0;
}

export function resolveAgentTimeoutMs(agentCfg = {}, adapter = 'stub') {
  const configured = positiveInteger(agentCfg.timeout_ms);
  if (configured !== null) return configured;

  const adapterEnv = {
    codex_cli: 'XFLOW_CODEX_TIMEOUT_MS',
    claude_cli: 'XFLOW_CLAUDE_TIMEOUT_MS',
    pencil_cli: 'XFLOW_PENCIL_TIMEOUT_MS',
  }[adapter];
  const adapterTimeout = adapterEnv ? readPositiveIntegerEnv(adapterEnv) : null;
  if (adapterTimeout !== null) return adapterTimeout;

  const genericTimeout = readPositiveIntegerEnv('XFLOW_AGENT_TIMEOUT_MS');
  if (genericTimeout !== null) return genericTimeout;

  if (adapter === 'codex_cli' || adapter === 'claude_cli') {
    return DEFAULT_HEAVY_CLI_TIMEOUT_MS;
  }
  return DEFAULT_AGENT_TIMEOUT_MS;
}

function readPositiveIntegerEnv(name) {
  return positiveInteger(process.env[name]);
}

function positiveInteger(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

function autoCliRuntimeEnabled(atomDef) {
  if (atomDef?.agent_config?.auto_cli === true) return true;
  const flag = String(process.env.XFLOW_AUTO_AGENT_RUNTIME || '').trim().toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes';
}

function realAgentRuntimeRequired(atomDef) {
  if (atomDef?.agent_config?.require_real_runtime === true) return true;
  const flag = String(process.env.XFLOW_REQUIRE_REAL_AGENT_RUNTIME || '').trim().toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes';
}

function resolveAdapter(atomDef, phase, projectRoot, expectedArtifact, stubCfg) {
  const configured = atomDef.agent_config?.adapter || 'auto';
  if (configured !== 'auto') {
    return { adapter: configured, reason: 'explicit_adapter' };
  }
  if (isPencilPhase(atomDef, phase, expectedArtifact, stubCfg)) {
    if (!commandExists('pencil', projectRoot)) {
      return { adapter: 'stub', reason: 'pencil_missing' };
    }
    if (!pencilAuthenticated(projectRoot)) {
      return { adapter: 'stub', reason: 'pencil_unauthenticated' };
    }
    return { adapter: 'pencil_cli', reason: 'pencil_authenticated' };
  }
  if (autoCliRuntimeEnabled(atomDef) && commandExists('codex', projectRoot)) {
    return { adapter: 'codex_cli', reason: 'codex_available' };
  }
  if (autoCliRuntimeEnabled(atomDef) && commandExists('claude', projectRoot)) {
    return { adapter: 'claude_cli', reason: 'claude_available' };
  }
  return { adapter: 'stub', reason: 'auto_stub_default' };
}

function isPencilPhase(atomDef, phase, expectedArtifact, stubCfg) {
  if (stubCfg.write_pen === true) return true;
  if ((phase?.id || '').startsWith('pencil_')) return true;
  if ((atomDef.id || '').startsWith('H4')) return true;
  return String(expectedArtifact || '').endsWith('.pen');
}

function resolveExpectedArtifact(atomDef, phase, changeId) {
  const preferPhaseArtifact = atomDef.stub_config?.use_phase_artifact !== false;
  const configured = atomDef.expected_artifact;
  if (configured) {
    return configured.replace(/\$\{change_id\}/g, changeId);
  }
  const firstRequired = phase?.artifacts?.find((artifact) => !artifact.optional)?.path;
  if (preferPhaseArtifact && firstRequired) {
    return firstRequired.replace(/\$\{change_id\}/g, changeId);
  }
  if (firstRequired) {
    return firstRequired.replace(/\$\{change_id\}/g, changeId);
  }
  return `specs/changes/${changeId}/artifact.json`;
}

function resolveStubConfig(baseConfig, mode) {
  if (!mode || !baseConfig?.mode_overrides?.[mode]) {
    return baseConfig;
  }
  const { mode_overrides: _ignored, ...base } = baseConfig;
  const override = baseConfig.mode_overrides[mode];
  return {
    ...base,
    ...override,
    extra_team_run: { ...(base.extra_team_run || {}), ...(override.extra_team_run || {}) },
    extra_phase_entry: { ...(base.extra_phase_entry || {}), ...(override.extra_phase_entry || {}) },
    primary_artifact_json: { ...(base.primary_artifact_json || {}), ...(override.primary_artifact_json || {}) },
    extra_json_files: [...(base.extra_json_files || []), ...(override.extra_json_files || [])],
  };
}

function materializeValue(value, vars) {
  if (typeof value === 'string') {
    return value
      .replace(/\$\{change_id\}/g, vars.changeId || '')
      .replace(/\$\{phase_id\}/g, vars.phaseId || '')
      .replace(/\$\{phase_label\}/g, vars.phaseLabel || '')
      .replace(/\$\{project_root\}/g, vars.projectRoot || '');
  }
  if (Array.isArray(value)) {
    return value.map((item) => materializeValue(item, vars));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, materializeValue(val, vars)]));
  }
  return value;
}

function renderAuxiliaryOutputs(stubCfg, changeId, projectRoot) {
  const lines = [];
  if (stubCfg.write_pen) {
    lines.push(`- \`${resolveChangePath(projectRoot, changeId, 'pencil_output.pen')}\``);
  }
  if (stubCfg.write_attestation) {
    lines.push(`- \`${resolveChangePath(projectRoot, changeId, 'pencil_output.attestation.json')}\``);
  }
  for (const file of stubCfg.extra_json_files || []) {
    const renderedPath = materializeValue(file.path || '', { changeId, projectRoot, phaseId: '', phaseLabel: '' });
    if (renderedPath) {
      lines.push(`- \`${resolve(projectRoot, renderedPath)}\``);
    }
  }
  return lines.length > 0 ? lines.join('\n') : '(none)';
}

function writeAuxiliaryStubArtifacts(stubCfg, { projectRoot, changeId, phase }) {
  if (stubCfg.write_pen) {
    writeTextFile(
      resolveChangePath(projectRoot, changeId, 'pencil_output.pen'),
      stubCfg.pen_content || `PENCIL ${phase.id}\n${stubCfg.summary || `Phase ${phase.id} queued for agent execution`}\n`,
    );
  }
  if (stubCfg.write_attestation) {
    writeJsonFile(resolveChangePath(projectRoot, changeId, 'pencil_output.attestation.json'), {
      phase: phase.id,
      change_id: changeId,
      accepted: true,
      recorded_at: new Date().toISOString(),
    });
  }
  for (const file of stubCfg.extra_json_files || []) {
    const path = materializeValue(file.path || '', { changeId, projectRoot, phaseId: phase.id, phaseLabel: phase.label || '' });
    if (!path) continue;
    writeJsonFile(resolve(projectRoot, path), materializeValue(file.payload || {}, {
      changeId,
      projectRoot,
      phaseId: phase.id,
      phaseLabel: phase.label || '',
    }));
  }
}
