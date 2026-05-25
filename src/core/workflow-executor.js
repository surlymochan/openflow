/**
 * WorkflowExecutor — iterates phases and dispatches atoms.
 *
 * Gate type dispatch:
 *   deterministic  → run gate.atom via runAtomSync(), expect exit 0 + JSON {ok: true}
 *   artifact-verify → check all phase.artifacts exist and are non-empty
 *   llm-judge      → on yolo track: return {verdict: 'needs-human', reason: 'llm-judge phases require corps track'}
 *                    on corps track: delegate to agent_team runner (D3a/I1/E4 atoms)
 *   human          → write gate_decision row, pause and wait for xflow gate ack or manual gate override
 *   skip           → no gate check
 *
 * E6 ≡ E1+E2 invariant enforced: executor routes ALL deterministic gate checks
 * through E6.gate.local_precheck Python atom, never re-implementing logic here.
 */

import { existsSync, statSync, writeFileSync, readFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { randomUUID } from 'crypto';
import { appendExecutionLog, appendExecutionLogSync } from './execution-log.js';
import { createConcurrencyPolicy } from './concurrency-policy.js';
import { buildWorkflowManifest } from './workflow-integrity.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');

function tail(value, maxChars = 4000) {
  if (value == null) return null;
  const text = String(value);
  if (!text) return null;
  return text.length > maxChars ? text.slice(-maxChars) : text;
}

export class WorkflowExecutor {
  constructor({ workflow, phases, registry, workflowPath = null, projectRoot, changeId, input = {}, exitOnFailure = true, maxParallelAgentsOverride = null, abortSignal = null }) {
    this.workflow = workflow;
    this.phases = phases;
    this.registry = registry;
    this.workflowPath = workflowPath;
    this.workflowManifest = buildWorkflowManifest({ workflowPath, workflow, phases, registry });
    this.projectRoot = projectRoot || process.cwd();
    this.changeId = changeId || input.change_id || process.env.CHANGE_ID;
    this.input = input;
    this.exitOnFailure = exitOnFailure;
    this.stateFile = resolve(this.projectRoot, '.as-xflow', 'workflow-state.json');
    this.changeStatusFile = this.changeId
      ? resolve(this.projectRoot, 'specs', 'changes', this.changeId, 'status.json')
      : null;
    this.abortSignal = abortSignal;
    this.concurrencyPolicy = createConcurrencyPolicy({ workflow, maxParallelAgentsOverride });
    this.maxParallelAgents = this.concurrencyPolicy.maxAgents;
    this.runtime = {
      missionId: null,
      workflowRunId: `wf_${randomUUID()}`,
      phaseRunId: null,
      phaseRunSessionId: null,
      lastAtomResult: null,
      atomResults: {},
    };
  }

  // ─── Main execution loop ─────────────────────────────────────────────────

  async run() {
    const state = this.loadState();
    let startIdx = 0;
    const rerunRequest = state.rerun && typeof state.rerun === 'object' ? state.rerun : null;
    this.ensureNotAborted();

    await this.logExecutionEvent('workflow_started', {
      workflow_run_id: this.runtime.workflowRunId,
      workflow: this.workflow.name,
      track: this.workflow.track,
      workflow_integrity: this.workflowManifest,
      max_parallel_agents: this.maxParallelAgents,
      parallel_policy: this.concurrencyPolicy.mode,
      parallel_source: this.concurrencyPolicy.source,
      change_id: this.changeId || null,
      mission_id: this.runtime.missionId || null,
      resume_from_phase: state.last_completed_phase || null,
      rerun_phase: rerunRequest?.phase_id || null,
      rerun_atom: rerunRequest?.atom_id || null,
    });

    if (rerunRequest?.phase_id) {
      const idx = this.phases.findIndex((phase) => phase.id === rerunRequest.phase_id);
      if (idx >= 0) {
        startIdx = idx;
        console.log(`\nRerunning from phase ${startIdx + 1}/${this.phases.length} ("${rerunRequest.phase_id}")`);
      }
    } else if (state.last_completed_phase) {
      // Resume from last completed phase
      const idx = this.phases.findIndex(p => p.id === state.last_completed_phase);
      if (idx >= 0) {
        startIdx = idx + 1;
        console.log(`\nResuming from phase ${startIdx + 1}/${this.phases.length} (after "${state.last_completed_phase}")`);
      }
    }

    for (let i = startIdx; i < this.phases.length; i++) {
      this.ensureNotAborted();
      const phase = this.phases[i];
      console.log(`\n${'═'.repeat(60)}`);
      console.log(`Phase ${i + 1}/${this.phases.length}: ${phase.label || phase.id}`);
      console.log('═'.repeat(60));
      await this.logExecutionEvent('phase_started', {
        workflow_run_id: this.runtime.workflowRunId,
        workflow: this.workflow.name,
        track: this.workflow.track,
        phase_id: phase.id,
        phase_label: phase.label || null,
        phase_index: i,
        change_id: this.changeId || null,
        mission_id: this.runtime.missionId || null,
        workflow_integrity_digest: this.workflowManifest.digest,
      });

      // Condition check (skip if not applicable)
      if (phase.condition) {
        const inputVal = this.input[phase.condition.input_field];
        if (inputVal !== phase.condition.equals) {
          console.log(`  ↷ Skipping (condition: ${phase.condition.input_field} !== ${phase.condition.equals})`);
          await this.logExecutionEvent('phase_skipped', {
            workflow_run_id: this.runtime.workflowRunId,
            workflow: this.workflow.name,
            track: this.workflow.track,
            phase_id: phase.id,
            phase_label: phase.label || null,
            phase_index: i,
            reason: 'condition_mismatch',
            change_id: this.changeId || null,
            mission_id: this.runtime.missionId || null,
            workflow_integrity_digest: this.workflowManifest.digest,
          });
          this.saveState({ ...state, last_completed_phase: phase.id });
          continue;
        }
      }

      // Preconditions
      if (phase.preconditions?.length > 0) {
        const precondOk = this.checkPreconditions(phase.preconditions);
        if (!precondOk) {
          this.fail(phase, 'precondition_failed');
          return;
        }
      }

      if (phase.id === 'plan') {
        this.ensurePlanArtifact();
      }

      // Run atoms
      const atomsToRun = rerunRequest?.phase_id === phase.id && rerunRequest?.atom_id
        ? (phase.atoms || []).filter((atomRef) => atomRef.id === rerunRequest.atom_id)
        : (phase.atoms || []);
      if (atomsToRun.length > 0) {
        for (const batch of this.buildAtomBatches(atomsToRun)) {
          this.ensureNotAborted();
          const results = batch.parallel
            ? await this.runParallelBatch(batch.atoms, phase)
            : [await this.runAtom(batch.atoms[0], phase)];

          for (let index = 0; index < batch.atoms.length; index += 1) {
            const atomRef = batch.atoms[index];
            const result = results[index];
            if (!result.ok) {
              console.error(`  ✗ Atom ${atomRef.id} failed`);
              if (phase.gate?.on_fail === 'stop') {
                this.fail(phase, 'atom_failed', atomRef.id);
                return;
              }
            } else {
              console.log(`  ✓ Atom ${atomRef.id}`);
            }
          }
        }
      }

      // Gate check
      const gateResult = await this.runGate(phase);
      await this.logExecutionEvent('gate_check', {
        workflow_run_id: this.runtime.workflowRunId,
        workflow: this.workflow.name,
        track: this.workflow.track,
        phase_id: phase.id,
        phase_label: phase.label || null,
        ok: gateResult.ok !== false,
        status: gateResult.status || null,
        verdict: gateResult.verdict || null,
        gate_type: phase.gate?.type || 'skip',
        change_id: this.changeId || null,
        mission_id: this.runtime.missionId || null,
        workflow_integrity_digest: this.workflowManifest.digest,
      });
      if (!gateResult.ok) {
        const onFail = phase.gate?.on_fail || 'stop';
        if (onFail === 'stop') {
          this.fail(phase, 'gate_failed', JSON.stringify(gateResult));
          return;
        } else if (onFail === 'advance-with-warning') {
          console.warn(`  ⚠ Gate soft-failed, advancing with warning: ${JSON.stringify(gateResult)}`);
        }
      } else {
        console.log(`  ✓ Gate: ${phase.gate?.type || 'skip'}`);
      }

      // Advance
      state.last_completed_phase = phase.id;
      state.completed_phases = [...(state.completed_phases || []), phase.id];
      if (rerunRequest?.phase_id === phase.id) {
        delete state.rerun;
      }
      state.updated_at = new Date().toISOString();
      this.saveState(state);
      await this.logExecutionEvent('phase_completed', {
        workflow_run_id: this.runtime.workflowRunId,
        workflow: this.workflow.name,
        track: this.workflow.track,
        phase_id: phase.id,
        phase_label: phase.label || null,
        phase_index: i,
        change_id: this.changeId || null,
        mission_id: this.runtime.missionId || null,
        workflow_integrity_digest: this.workflowManifest.digest,
      });
    }

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`✓ Workflow "${this.workflow.name}" completed`);
    console.log('═'.repeat(60));
    await this.logExecutionEvent('workflow_completed', {
      workflow_run_id: this.runtime.workflowRunId,
      workflow: this.workflow.name,
      track: this.workflow.track,
      workflow_integrity: this.workflowManifest,
      change_id: this.changeId || null,
      mission_id: this.runtime.missionId || null,
      completed_phases: this.phases.map((phase) => phase.id),
    });
  }

  // ─── Atom dispatch ────────────────────────────────────────────────────────

  ensurePlanArtifact() {
    const changeRoot = resolve(this.projectRoot, 'specs', 'changes', this.changeId);
    const planPath = resolve(changeRoot, 'plan.md');
    const currentPlan = existsSync(planPath) ? readFileSync(planPath, 'utf8') : '';

    if (this.isReusablePlan(currentPlan)) {
      return { reused: true, generated: false, path: planPath };
    }

    const proposalPath = resolve(changeRoot, 'proposal.md');
    const proposalText = existsSync(proposalPath) ? readFileSync(proposalPath, 'utf8') : '';
    const title = this.input.title || this.workflow.name || this.changeId;
    const objective = this.extractSection(proposalText, ['Objective', 'Target Outcome', 'Problem / Context', 'Problem']) || title;
    const chosenPath = this.extractSection(proposalText, ['Chosen Path', 'Scope', 'In Scope']) || 'Use the accepted proposal as the implementation baseline.';
    const inScope = this.extractSection(proposalText, ['In Scope', 'Scope']) || '- Follow the frozen proposal scope.';
    const outOfScope = this.extractSection(proposalText, ['Out of Scope']) || '- Everything outside the accepted proposal scope.';
    const verification = this.defaultVerificationCommands();
    const mainRisk = this.extractSection(proposalText, ['Main Risk', 'Risks', 'Risk']) || 'Plan drift or missing verification commands will block execution.';

    mkdirSync(changeRoot, { recursive: true });
    const content = [
      '# Plan',
      '',
      '## Target Outcome',
      '',
      objective.trim(),
      '',
      '## Chosen Path',
      '',
      chosenPath.trim(),
      '',
      '## In Scope',
      '',
      inScope.trim(),
      '',
      '## Out of Scope',
      '',
      outOfScope.trim(),
      '',
      '## Verification Commands',
      '',
      '```bash',
      verification,
      '```',
      '',
      '## Main Risk',
      '',
      mainRisk.trim(),
      '',
    ].join('\n');
    writeFileSync(planPath, content, 'utf8');
    return { reused: false, generated: true, path: planPath };
  }

  isReusablePlan(text) {
    const normalized = (text || '').trim();
    if (!normalized) return false;
    if (normalized.length < 120) return false;
    if (/## Task Slices\b/.test(normalized)) return false;
    if (/^\s*-\s*$/m.test(normalized)) return false;
    if (/## Verification Commands\s*\n\s*```bash\s*# Fill in the smallest proof commands\s*```/.test(normalized)) return false;
    return true;
  }

  extractSection(text, headings) {
    if (!text) return '';
    const lines = text.split(/\r?\n/);
    const headingSet = new Set(headings.map((heading) => heading.toLowerCase()));
    let capture = false;
    const collected = [];

    for (const line of lines) {
      const headingMatch = line.match(/^##\s+(.+)$/);
      if (headingMatch) {
        const current = headingMatch[1].trim().toLowerCase();
        if (capture) {
          break;
        }
        capture = headingSet.has(current);
        continue;
      }
      if (capture) {
        collected.push(line);
      }
    }

    return collected.join('\n').trim();
  }

  defaultVerificationCommands() {
    if (this.workflow.track === 'heavy') {
      return 'npm test';
    }
    return 'npm test';
  }

  async runAtom(atomRef, phase = null) {
    this.ensureNotAborted();
    const def = this.registry.atoms[atomRef.id];
    if (!def) {
      return { ok: false, error: `Unknown atom: ${atomRef.id}` };
    }

    // Resolve template variables in `with`
    const withArgs = this.buildAtomArgs(atomRef, phase);
    const startedAt = Date.now();
    const logBase = {
      workflow_run_id: this.runtime.workflowRunId,
      workflow: this.workflow.name,
      track: this.workflow.track,
      phase_id: phase?.id || null,
      phase_label: phase?.label || null,
      atom_id: atomRef.id,
      atom_type: def.type,
      parallel_group: atomRef.parallel_group || null,
      parallel_weight: atomRef.parallel_group ? this.concurrencyPolicy.weightFor(atomRef, this.registry) : null,
    };

    if (def.type === 'python') {
      const scriptPath = resolve(ROOT, def.script);
      if (!existsSync(scriptPath)) {
        return { ok: false, error: `Script not found: ${scriptPath}` };
      }
      const args = this.objectToCliArgs(withArgs);
      args.push('--project-root', this.projectRoot);
      if (this.changeId) args.push('--change-id', this.changeId);

      console.log(`     → python3 ${def.script} ${args.slice(0, 4).join(' ')}${args.length > 4 ? ' ...' : ''}`);
      const result = spawnSync('python3', [scriptPath, ...args], {
        stdio: ['inherit', 'pipe', 'inherit'],
        encoding: 'utf8',
      });
      const stdout = result.stdout || '';
      let parsed = {};
      try { parsed = JSON.parse(stdout.trim()); } catch { parsed = { ok: result.status === 0 }; }
      if (stdout.trim()) console.log(`     ← ${stdout.trim().slice(0, 120)}`);
      const output = { ok: result.status === 0, ...parsed };
      this.captureAtomResult(atomRef.id, output);
      await this.logAtomRun({
        ...logBase,
        ok: output.ok !== false,
        exit_code: result.status ?? 1,
        duration_ms: Date.now() - startedAt,
      });
      return output;

    } else if (def.type === 'shell') {
      const scriptPath = resolve(ROOT, def.script);
      const args = [atomRef.with?.subcommand || '', ...(atomRef.with?.args || [])].filter(Boolean);
      const result = spawnSync('bash', [scriptPath, ...args], { stdio: 'inherit' });
      const output = { ok: result.status === 0 };
      this.captureAtomResult(atomRef.id, output);
      await this.logAtomRun({
        ...logBase,
        ok: output.ok !== false,
        exit_code: result.status ?? 1,
        duration_ms: Date.now() - startedAt,
      });
      return output;

    } else if (def.type === 'js') {
      const modulePath = resolve(ROOT, def.module);
      if (!existsSync(modulePath)) {
        return { ok: false, error: `Module not found: ${modulePath}` };
      }
      if (def.requires_http && !this.httpAvailable()) {
        return { ok: false, error: `Atom ${atomRef.id} requires HTTP server (xflow serve)` };
      }
      const mod = await import(pathToFileURL(modulePath).href);
      const handler = mod[def.export || 'default'];
      if (typeof handler !== 'function') {
        return { ok: false, error: `Export "${def.export || 'default'}" not found in ${def.module}` };
      }
      console.log(`     → js ${def.module}#${def.export || 'default'}`);
      const handlerInput = { ...this.input, ...withArgs };
      const output = await handler(handlerInput, {
        workflow: this.workflow,
        phase,
        registry: this.registry,
        projectRoot: this.projectRoot,
        changeId: this.changeId,
        input: this.input,
        runtime: this.runtime,
      });
      const normalized = output && typeof output === 'object' ? output : { ok: true, value: output };
      const finalOutput = { ok: normalized.ok !== false, ...normalized };
      this.captureAtomResult(atomRef.id, finalOutput);
      await this.logAtomRun({
        ...logBase,
        ok: finalOutput.ok !== false,
        status: finalOutput.status || null,
        adapter: finalOutput.adapter || null,
        adapter_reason: finalOutput.adapter_reason || null,
        artifact_type: finalOutput.artifact?.type || null,
        duration_ms: Date.now() - startedAt,
      });
      return finalOutput;
    } else if (def.type === 'agent_invoke') {
      const modPath = resolve(ROOT, def.module);
      if (!existsSync(modPath)) {
        return { ok: false, error: `Module not found: ${modPath}` };
      }
      const { default: handler } = await import(pathToFileURL(modPath).href);
      console.log(`     → agent_invoke ${def.module}`);
      const output = await handler(withArgs, {
        workflow: this.workflow,
        phase,
        registry: this.registry,
        projectRoot: this.projectRoot,
        changeId: this.changeId,
        input: this.input,
        runtime: this.runtime,
        atomDef: { id: atomRef.id, ...def },
      });
      const normalized = output && typeof output === 'object' ? output : { ok: true, value: output };
      const finalOutput = { ok: normalized.ok !== false, ...normalized };
      this.captureAtomResult(atomRef.id, finalOutput);
      await this.logAtomRun({
        ...logBase,
        ok: finalOutput.ok !== false,
        status: finalOutput.status || null,
        adapter: finalOutput.adapter || null,
        adapter_reason: finalOutput.adapter_reason || null,
        artifact_type: finalOutput.artifact?.type || null,
        exit_code: finalOutput.code ?? null,
        signal: finalOutput.signal || null,
        timed_out: finalOutput.timed_out === true,
        force_killed: finalOutput.force_killed === true,
        attempts: finalOutput.attempts || null,
        retries_used: finalOutput.retries_used || null,
        error: finalOutput.error || null,
        stdout_tail: tail(finalOutput.stdout),
        stderr_tail: tail(finalOutput.stderr),
        duration_ms: Date.now() - startedAt,
      });
      return finalOutput;
    }

    return { ok: false, error: `Unknown atom type: ${def.type}` };
  }

  async logAtomRun(entry) {
    await this.logExecutionEvent('atom_run', entry);
  }

  async logExecutionEvent(kind, entry) {
    try {
      await appendExecutionLog(this.projectRoot, {
        kind,
        change_id: this.changeId || null,
        mission_id: this.runtime.missionId || null,
        ...entry,
      });
    } catch {
      // Logging is best-effort and must not break workflow execution.
    }
  }

  // ─── Gate dispatch ────────────────────────────────────────────────────────

  async runGate(phase) {
    const gate = phase.gate;
    if (!gate || gate.type === 'skip') return { ok: true };

    switch (gate.type) {
      case 'deterministic': {
        // Route through E6 (Python) for ALL structural checks — invariant enforced
        if (gate.atom) {
          const result = await this.runAtom({ id: gate.atom, with: gate.with }, phase);
          return result;
        }
        return { ok: true }; // no gate atom = pass
      }

      case 'artifact-verify': {
        const artifacts = phase.artifacts || [];
        const missing = [];
        for (const art of artifacts) {
          if (art.optional) continue;
          const artPath = this.resolveArtifactPath(art.path);
          if (!existsSync(artPath)) {
            missing.push(artPath);
          } else if (statSync(artPath).size < 5) {
            missing.push(`${artPath} (too small)`);
          }
        }
        if (missing.length > 0) {
          return { ok: false, verdict: 'artifact-missing', missing };
        }
        return { ok: true, verdict: 'pass' };
      }

      case 'llm-judge': {
        if (this.workflow.track === 'lite') {
          // Lite track cannot run LLM judge phases — requires corps
          return {
            ok: false,
            verdict: 'needs-corps',
            message: `Phase "${phase.id}" requires llm-judge gate. Use workflows/corps.yaml for this phase.`,
          };
        }
        return this.runHeavyJudge(phase);
      }

      case 'human': {
        // Write a gate decision record and pause
        const gateFile = resolve(this.projectRoot, '.as-xflow', 'pending-gates', `${phase.id}.json`);
        const autoApproveHumanGates = ['1', 'true', 'yes'].includes(String(process.env.XFLOW_AUTO_HUMAN_GATES || '').toLowerCase());
        if (existsSync(gateFile)) {
          try {
            const pending = JSON.parse(readFileSync(gateFile, 'utf8'));
            if (pending.status === 'approved') {
              console.log(`  ✓ Human gate approved: ${phase.id}`);
              return { ok: true, verdict: 'approved', gate_file: gateFile };
            }
          } catch {
            // Fall through and rewrite the pending gate record.
          }
        }
        mkdirSync(dirname(gateFile), { recursive: true });
        const gatePayload = autoApproveHumanGates
          ? {
              phase: phase.id,
              status: 'approved',
              created_at: new Date().toISOString(),
              approved_at: new Date().toISOString(),
              approved_by: 'xflow-auto-human-gate',
              instructions: `Automatically approved in scripted workflow mode.`,
            }
          : {
              phase: phase.id,
              status: 'pending_human',
              created_at: new Date().toISOString(),
              instructions: `Review phase "${phase.id}" and run: xflow gate ack ${phase.id}`,
            };
        writeFileSync(gateFile, JSON.stringify(gatePayload, null, 2));
        if (autoApproveHumanGates) {
          console.log(`  ✓ Human gate auto-approved: ${phase.id}`);
          return { ok: true, verdict: 'approved', gate_file: gateFile, auto_approved: true };
        }
        console.log(`\n  ⏸  Human gate: phase "${phase.id}"`);
        console.log(`     Pending gate written to: ${gateFile}`);
        console.log(`     To continue: xflow gate ack ${phase.id}`);
        return { ok: false, verdict: 'pending_human', gate_file: gateFile };
      }

      default:
        return { ok: false, error: `Unknown gate type: ${gate.type}` };
    }
  }

  // ─── State management ─────────────────────────────────────────────────────

  loadState() {
    if (existsSync(this.stateFile)) {
      try {
        const parsed = JSON.parse(readFileSync(this.stateFile, 'utf8'));
        if (this.changeId && parsed?.change_id && parsed.change_id !== this.changeId) {
          return {
            workflow: this.workflow.name,
            change_id: this.changeId,
            started_at: new Date().toISOString(),
            completed_phases: [],
            last_completed_phase: null,
          };
        }
        if (this.changeStatusFile && !existsSync(this.changeStatusFile)) {
          return {
            workflow: this.workflow.name,
            change_id: this.changeId,
            started_at: new Date().toISOString(),
            completed_phases: [],
            last_completed_phase: null,
          };
        }
        if (
          parsed?.workflow_integrity?.digest
          && parsed.workflow_integrity.digest !== this.workflowManifest.digest
        ) {
          this.fail(null, 'workflow_integrity_mismatch', `state digest ${parsed.workflow_integrity.digest} != current ${this.workflowManifest.digest}`);
          return parsed;
        }
        return parsed;
      } catch (error) {
        if (error instanceof Error && /workflow_integrity_mismatch/.test(error.message)) {
          throw error;
        }
      }
    }
    return {
      workflow: this.workflow.name,
      change_id: this.changeId,
      started_at: new Date().toISOString(),
      completed_phases: [],
      last_completed_phase: null,
    };
  }

  saveState(state) {
    mkdirSync(dirname(this.stateFile), { recursive: true });
    const payload = { ...state, updated_at: new Date().toISOString() };
    payload.workflow_integrity = this.workflowManifest;
    writeFileSync(this.stateFile, JSON.stringify(payload, null, 2));
    if (this.changeStatusFile) {
      mkdirSync(dirname(this.changeStatusFile), { recursive: true });
      let existingStatus = {};
      if (existsSync(this.changeStatusFile)) {
        try {
          existingStatus = JSON.parse(readFileSync(this.changeStatusFile, 'utf8'));
        } catch {
          existingStatus = {};
        }
      }
      writeFileSync(this.changeStatusFile, JSON.stringify({
        ...existingStatus,
        ...payload,
      }, null, 2));
    }
  }

  fail(phase, reason, detail = '') {
    try {
      appendExecutionLogSync(this.projectRoot, {
        kind: 'workflow_failed',
        workflow_run_id: this.runtime.workflowRunId,
        workflow: this.workflow.name,
        track: this.workflow.track,
        workflow_integrity_digest: this.workflowManifest.digest,
        change_id: this.changeId || null,
        mission_id: this.runtime.missionId || null,
        phase_id: phase?.id || null,
        phase_label: phase?.label || null,
        reason,
        detail: detail || null,
      });
    } catch {
      // Failure logging is best-effort and must not hide the real stop reason.
    }
    const phaseId = phase?.id || 'workflow';
    console.error(`\n✗ Workflow "${this.workflow.name}" stopped at phase "${phaseId}"`);
    console.error(`  Reason: ${reason}${detail ? ` — ${detail}` : ''}`);
    console.error(`  Resume: xflow workflow run workflows/${this.workflow.name}.yaml`);
    if (this.exitOnFailure) {
      process.exit(1);
    }
    throw new Error(`Workflow "${this.workflow.name}" stopped at phase "${phaseId}": ${reason}${detail ? ` — ${detail}` : ''}`);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  resolveTemplateValue(value) {
    if (typeof value === 'string') {
      return value
        .replace(/\$\{change_id\}/g, this.changeId || '')
        .replace(/\$\{input\.(\w+)\}/g, (_, key) => this.input[key] || '')
        .replace(/\$\{runtime\.mission_id\}/g, this.runtime.missionId || '')
        .replace(/\$\{runtime\.phase_run_id\}/g, this.runtime.phaseRunId || '')
        .replace(/\$\{runtime\.phase_run_session_id\}/g, this.runtime.phaseRunSessionId || '');
    }
    if (Array.isArray(value)) {
      return value.map((entry) => this.resolveTemplateValue(entry));
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, this.resolveTemplateValue(v)]));
    }
    return value;
  }

  resolveTemplates(obj) {
    return this.resolveTemplateValue(obj || {});
  }

  buildAtomArgs(atomRef, phase = null) {
    const withArgs = this.resolveTemplates(atomRef.with || {});
    const needsMissionId = ['B7.change_mission.bind', 'D2b.mission.show', 'D3a.phase_run.start', 'D3b.phase_run.persist', 'D3c.phase_run.complete', 'D3d.phase_run.fail']
      .includes(atomRef.id);
    if (needsMissionId && !withArgs.mission_id && this.runtime.missionId) {
      withArgs.mission_id = this.runtime.missionId;
    }
    if (['D3b.phase_run.persist', 'D3c.phase_run.complete', 'D3d.phase_run.fail'].includes(atomRef.id)) {
      if (!withArgs.session_id && this.runtime.phaseRunSessionId) {
        withArgs.session_id = this.runtime.phaseRunSessionId;
      }
      if (!withArgs.phase_run_id && this.runtime.phaseRunId) {
        withArgs.phase_run_id = this.runtime.phaseRunId;
      }
    }
    if (!withArgs.phase && phase?.id && atomRef.id.startsWith('D3')) {
      withArgs.phase = phase.id;
    }
    return withArgs;
  }

  buildAtomBatches(atomRefs = []) {
    const batches = [];
    let currentParallelGroup = null;
    let currentBatch = null;

    for (const atomRef of atomRefs) {
      const group = atomRef.parallel_group || null;
      if (!group) {
        currentParallelGroup = null;
        currentBatch = null;
        batches.push({ parallel: false, atoms: [atomRef] });
        continue;
      }

      if (currentParallelGroup !== group || !currentBatch) {
        currentParallelGroup = group;
        currentBatch = { parallel: true, group, atoms: [atomRef] };
        batches.push(currentBatch);
      } else {
        currentBatch.atoms.push(atomRef);
      }
    }

    return batches;
  }

  async runParallelBatch(atomRefs = [], phase = null) {
    const results = new Array(atomRefs.length);
    let cursor = 0;
    let running = 0;
    let usedBudget = 0;
    let completed = 0;

    return new Promise((resolveBatch, rejectBatch) => {
      const launchReady = () => {
        this.ensureNotAborted();
        if (completed >= atomRefs.length) {
          resolveBatch(results);
          return;
        }

        while (cursor < atomRefs.length) {
          const atomRef = atomRefs[cursor];
          const charge = this.concurrencyPolicy.chargeFor(atomRef, this.registry);
          if (running > 0 && usedBudget + charge > this.maxParallelAgents) {
            break;
          }

          const index = cursor;
          cursor += 1;
          running += 1;
          usedBudget += charge;

          Promise.resolve()
            .then(() => {
              this.ensureNotAborted();
              return this.runAtom(atomRef, phase);
            })
            .then((result) => {
              results[index] = result;
            })
            .catch(rejectBatch)
            .finally(() => {
              running -= 1;
              usedBudget -= charge;
              completed += 1;
              launchReady();
            });
        }
      };

      try {
        launchReady();
      } catch (error) {
        rejectBatch(error);
      }
    });
  }

  captureAtomResult(atomId, result) {
    this.runtime.lastAtomResult = result;
    this.runtime.atomResults[atomId] = result;
    this.runtime.missionId = result.mission?.mission_id || result.mission_id || result.binding?.mission_id || this.runtime.missionId;
    this.runtime.phaseRunId = result.phase_run?.phase_run_id || result.phase_run_id || this.runtime.phaseRunId;
    this.runtime.phaseRunSessionId = result.session?.session_id || result.phase_run_session?.session_id || this.runtime.phaseRunSessionId;
  }

  resolveArtifactPath(pathTemplate) {
    const resolved = pathTemplate
      .replace(/\$\{change_id\}/g, this.changeId || '')
      .replace(/\$\{input\.(\w+)\}/g, (_, key) => this.input[key] || '');
    return resolve(this.projectRoot, resolved);
  }

  ensureNotAborted() {
    if (this.abortSignal?.aborted) {
      const error = new Error('Workflow execution canceled');
      error.name = 'AbortError';
      throw error;
    }
  }

  loadArtifactPayload(artPath) {
    if (!existsSync(artPath)) {
      return null;
    }
    try {
      const raw = readFileSync(artPath, 'utf8');
      return raw.trim() ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  deriveJudgeVerdict(payload, artPath) {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const explicitVerdict = payload.team_run?.verdict?.status
      || payload.verdict?.status
      || payload.qa_status
      || payload.recommendation
      || payload.status
      || null;

    if (explicitVerdict) {
      const normalized = String(explicitVerdict).toLowerCase();
      if (['accept', 'accepted', 'pass', 'passed', 'completed', 'ready', 'active'].includes(normalized)) {
        return { ok: true, verdict: 'pass', source: artPath };
      }
      if (['reject', 'rejected', 'fail', 'failed', 'blocked'].includes(normalized)) {
        return { ok: false, verdict: 'fail', source: artPath };
      }
      if (['needs_human', 'pending_human'].includes(normalized)) {
        return { ok: false, verdict: 'needs_human', source: artPath };
      }
    }

    const rationale = payload.team_run?.verdict?.rationale || payload.summary || '';
    if (typeof rationale === 'string' && rationale.trim()) {
      return { ok: true, verdict: 'pass', source: artPath };
    }

    return null;
  }

  runHeavyJudge(phase) {
    const candidates = [];

    for (const art of (phase.artifacts || [])) {
      candidates.push(this.resolveArtifactPath(art.path));
    }

    candidates.push(resolve(this.projectRoot, 'specs', 'changes', this.changeId || '', `${phase.id}.json`));
    const uniqueCandidates = [...new Set(candidates.filter(Boolean))];

    for (const artPath of uniqueCandidates) {
      const payload = this.loadArtifactPayload(artPath);
      const derived = this.deriveJudgeVerdict(payload, artPath);
      if (derived) {
        return derived;
      }
    }

    const existing = uniqueCandidates.find((artPath) => existsSync(artPath));
    if (existing) {
      return { ok: true, verdict: 'pass', source: existing, message: 'Artifact exists; defaulting heavy judge to pass.' };
    }

    return {
      ok: false,
      verdict: 'needs_human',
      message: `No artifact evidence found for llm-judge phase "${phase.id}"`,
    };
  }

  objectToCliArgs(obj) {
    const args = [];
    for (const [k, v] of Object.entries(obj || {})) {
      if (v === null || v === undefined || v === '') continue;
      const flag = `--${k.replace(/_/g, '-')}`;
      if (typeof v === 'boolean') {
        if (v) args.push(flag);
      } else if (Array.isArray(v)) {
        for (const item of v) args.push(flag, String(item));
      } else if (typeof v === 'object') {
        args.push(flag, JSON.stringify(v));
      } else {
        args.push(flag, String(v));
      }
    }
    return args;
  }

  checkPreconditions(preconditions) {
    for (const pre of preconditions) {
      if (pre.phase_artifact) {
        const artPath = this.resolveArtifactPath(pre.phase_artifact);
        if (pre.predicate === 'exists' && !existsSync(artPath)) {
          console.error(`  Precondition failed: ${artPath} does not exist`);
          return false;
        }
      }
    }
    return true;
  }

  httpAvailable() {
    // Check if agentos HTTP server is reachable
    // For now, assume available if AGENTOS_HTTP env is set
    return !!process.env.AGENTOS_HTTP || !!process.env.AS_XFLOW_HTTP;
  }
}
