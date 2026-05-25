import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import Ajv from 'ajv';

import { missionCreate } from '../src/core/atoms/mission/create.js';
import { missionList } from '../src/core/atoms/mission/list.js';
import { missionShow } from '../src/core/atoms/mission/show.js';
import { phaseRunStart } from '../src/core/atoms/phase-run/start.js';
import { phaseRunPersist } from '../src/core/atoms/phase-run/persist.js';
import { phaseRunComplete } from '../src/core/atoms/phase-run/complete.js';
import agentInvoke, { resolveAgentTimeoutMs } from '../src/core/atoms/agent-invoke.js';
import { teamRun } from '../src/agent_team/atoms/team-run.js';
import { pencilDraft } from '../src/agent_team/atoms/pencil/draft.js';
import { pencilRefine } from '../src/agent_team/atoms/pencil/refine.js';
import { pencilAccept } from '../src/agent_team/atoms/pencil/accept.js';
import { visualReview } from '../src/agent_team/atoms/visual/review.js';
import visualReviewAggregate from '../src/agent_team/atoms/visual/review-aggregate.js';
import { visualDirectionSynthesis } from '../src/agent_team/atoms/visual/direction-synthesis.js';
import { visualBenchmark } from '../src/agent_team/atoms/visual/benchmark.js';
import { benchmarkRepairPlan } from '../src/agent_team/atoms/visual/benchmark-repair-plan.js';
import { visualAestheticReview } from '../src/agent_team/atoms/visual/aesthetic-review.js';
import { generationContract } from '../src/agent_team/atoms/design/generation-contract.js';
import { artifactVerify } from '../src/core/atoms/gate/artifact-verify.js';
import { readStore } from '../src/core/state-store.js';
import { WorkflowExecutor } from '../src/core/workflow-executor.js';
import registry from '../atoms/registry.json' with { type: 'json' };

const REPO_ROOT = process.cwd();

function makeProjectRoot() {
  const root = mkdtempSync(join(tmpdir(), 'openflow-'));
  mkdirSync(resolve(root, '.as-xflow'), { recursive: true });
  return root;
}

function cleanupProjectRoot(root) {
  rmSync(root, { recursive: true, force: true });
}

describe('Heavy atoms', { concurrency: false }, () => {
  test('agent_invoke uses long default timeout for real CLI agents', () => {
    const originalAgentTimeout = process.env.XFLOW_AGENT_TIMEOUT_MS;
    const originalCodexTimeout = process.env.XFLOW_CODEX_TIMEOUT_MS;
    try {
      delete process.env.XFLOW_AGENT_TIMEOUT_MS;
      delete process.env.XFLOW_CODEX_TIMEOUT_MS;

      assert.equal(resolveAgentTimeoutMs({}, 'codex_cli'), 1_800_000);
      assert.equal(resolveAgentTimeoutMs({}, 'claude_cli'), 1_800_000);
      assert.equal(resolveAgentTimeoutMs({}, 'pencil_cli'), 300_000);
      assert.equal(resolveAgentTimeoutMs({}, 'stub'), 300_000);

      process.env.XFLOW_AGENT_TIMEOUT_MS = '600000';
      assert.equal(resolveAgentTimeoutMs({}, 'codex_cli'), 600_000);

      process.env.XFLOW_CODEX_TIMEOUT_MS = '900000';
      assert.equal(resolveAgentTimeoutMs({}, 'codex_cli'), 900_000);
      assert.equal(resolveAgentTimeoutMs({ timeout_ms: 1234 }, 'codex_cli'), 1234);
    } finally {
      if (originalAgentTimeout === undefined) delete process.env.XFLOW_AGENT_TIMEOUT_MS;
      else process.env.XFLOW_AGENT_TIMEOUT_MS = originalAgentTimeout;
      if (originalCodexTimeout === undefined) delete process.env.XFLOW_CODEX_TIMEOUT_MS;
      else process.env.XFLOW_CODEX_TIMEOUT_MS = originalCodexTimeout;
    }
  });

  test('D1/D2/D2b create, list, and show missions via sqlite state', async () => {
    const projectRoot = makeProjectRoot();
    try {
      const created = await missionCreate(
        { goal: 'Build heavy atom layer', workspace: projectRoot },
        { projectRoot, changeId: 'chg-heavy-1', runtime: {} },
      );

      assert.equal(created.ok, true);
      assert.ok(created.mission_id);
      assert.equal(existsSync(resolve(projectRoot, '.as-xflow', 'state.sqlite')), true);

      const listed = await missionList({}, { projectRoot, runtime: {} });
      assert.equal(listed.missions.length, 1);
      assert.equal(listed.missions[0].mission_id, created.mission_id);

      const shown = await missionShow(
        { mission_id: created.mission_id },
        { projectRoot, runtime: {} },
      );
      assert.equal(shown.detail.mission.goal, 'Build heavy atom layer');
      assert.equal(shown.detail.replay.length, 1);
      assert.equal(shown.detail.phase_runs.length, 0);
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('D3 phase-run lifecycle persists run state and completes the session', async () => {
    const projectRoot = makeProjectRoot();
    try {
      const created = await missionCreate(
        { goal: 'Run explore phase', workspace: projectRoot },
        { projectRoot, changeId: 'chg-heavy-2', runtime: {} },
      );
      const missionId = created.mission_id;

      const started = await phaseRunStart(
        { mission_id: missionId, phase: 'explore', summary: 'Explore the space' },
        { projectRoot, runtime: {} },
      );
      assert.equal(started.session.status, 'running');

      const persisted = await phaseRunPersist(
        {
          mission_id: missionId,
          session_id: started.session.session_id,
          summary: 'Explore the space',
          status: 'completed',
          phases: [{ phase: 'explore', status: 'completed', effective_status: 'completed' }],
          executed_phases: ['explore'],
        },
        { projectRoot, runtime: { phaseRunSessionId: started.session.session_id } },
      );
      assert.ok(persisted.phase_run.phase_run_id);
      assert.equal(persisted.session.phase_run_id, persisted.phase_run.phase_run_id);

      const completed = await phaseRunComplete(
        {
          mission_id: missionId,
          session_id: started.session.session_id,
          phase_run_id: persisted.phase_run.phase_run_id,
        },
        { projectRoot, runtime: { phaseRunSessionId: started.session.session_id, phaseRunId: persisted.phase_run.phase_run_id } },
      );
      assert.equal(completed.session.status, 'completed');

      const state = await readStore(resolve(projectRoot, '.as-xflow', 'state.sqlite'));
      assert.equal(state.phase_runs.length, 1);
      assert.equal(state.phase_runs[0].executed_phases[0], 'explore');
      assert.equal(state.phase_run_sessions[0].status, 'completed');
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('WorkflowExecutor runs JS atoms and injects mission_id into B7 binding writes', async () => {
    const projectRoot = makeProjectRoot();
    try {
      const workflow = { name: 'corps-smoke', track: 'heavy' };
      const phases = [
        {
          id: 'change-init',
          label: 'Change init',
          atoms: [
            { id: 'D1.mission.create', with: { goal: '${input.title}', workspace: '${input.workspace}' } },
            { id: 'B7.change_mission.bind', with: { direction: 'change_to_mission' } },
          ],
          gate: { type: 'skip' },
        },
      ];
      const executor = new WorkflowExecutor({
        workflow,
        phases,
        registry,
        projectRoot,
        changeId: 'chg-bind-1',
        input: { title: 'Bind mission automatically', workspace: projectRoot },
      });

      await executor.run();

      const bindings = JSON.parse(readFileSync(resolve(projectRoot, '.as-xflow', 'bindings.json'), 'utf8'));
      assert.ok(bindings['chg-bind-1']?.mission_id);

      const state = await readStore(resolve(projectRoot, '.as-xflow', 'state.sqlite'));
      assert.equal(state.missions.length, 1);
      assert.equal(state.missions[0].mission_id, bindings['chg-bind-1'].mission_id);
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('WorkflowExecutor passes workflow input through to JS atoms alongside phase-local with args', async () => {
    const projectRoot = makeProjectRoot();
    try {
      const modulePath = resolve(projectRoot, 'workflow-input-smoke.mjs');
      writeFileSync(modulePath, `
        import { mkdirSync, writeFileSync } from 'node:fs';
        import { dirname, resolve } from 'node:path';

        export default async function run(input = {}, context = {}) {
          const outputPath = resolve(context.projectRoot, 'specs', 'changes', context.changeId, 'competitor_reconstruction_review.json');
          mkdirSync(dirname(outputPath), { recursive: true });
          const payload = {
            competitor_product: input.competitor_product || null,
            required_modules: Array.isArray(input.required_modules) ? input.required_modules : [],
            phase_override: input.phase_override || null,
          };
          writeFileSync(outputPath, JSON.stringify(payload, null, 2));
          return { ok: true, payload };
        }
      `, 'utf8');

      const localRegistry = {
        atoms: {
          'TEST.workflow.input.pass_through': {
            track: 'heavy',
            type: 'js',
            module: modulePath,
          },
        },
      };

      const workflow = { name: 'workflow-input-smoke', track: 'heavy' };
      const phases = [
        {
          id: 'competitor_reconstruction_review',
          label: 'Competitor reconstruction review',
          atoms: [
            {
              id: 'TEST.workflow.input.pass_through',
              with: { phase_override: 'phase-local-value' },
            },
          ],
          artifacts: [{ path: 'specs/changes/${change_id}/competitor_reconstruction_review.json', optional: false }],
          gate: { type: 'artifact-verify' },
        },
      ];

      const executor = new WorkflowExecutor({
        workflow,
        phases,
        registry: localRegistry,
        projectRoot,
        changeId: 'chg-workflow-input-smoke',
        input: {
          competitor_product: 'TickTick Desktop',
          required_modules: ['task_list_workbench', 'task_detail_panel'],
        },
      });

      await executor.run();

      const artifact = JSON.parse(readFileSync(
        resolve(projectRoot, 'specs', 'changes', 'chg-workflow-input-smoke', 'competitor_reconstruction_review.json'),
        'utf8',
      ));
      assert.equal(artifact.competitor_product, 'TickTick Desktop');
      assert.deepEqual(artifact.required_modules, ['task_list_workbench', 'task_detail_panel']);
      assert.equal(artifact.phase_override, 'phase-local-value');
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('agent_invoke resolves expected artifact before codex_cli execution', async () => {
    const projectRoot = makeProjectRoot();
    const originalPath = process.env.PATH || '';
    try {
      const fakeBin = resolve(projectRoot, 'bin');
      mkdirSync(fakeBin, { recursive: true });
      const fakeCodex = resolve(fakeBin, 'codex');
      writeFileSync(fakeCodex, [
        '#!/bin/sh',
        'printf "%s\\n" "$@" > "$PWD/codex-args.txt"',
        'mkdir -p "$PWD/specs/changes/chg-agent-invoke"',
        `cat <<'EOF' > "$PWD/specs/changes/chg-agent-invoke/explore.json"`,
        '{"ok":true,"source":"fake-codex"}',
        'EOF',
      ].join('\n'));
      chmodSync(fakeCodex, 0o755);
      process.env.PATH = `${fakeBin}:${originalPath}`;

      const result = await agentInvoke({}, {
        workflow: { track: 'heavy' },
        phase: {
          id: 'explore',
          label: 'Explore',
          artifacts: [{ path: 'specs/changes/${change_id}/explore.json', optional: false }],
        },
        projectRoot,
        changeId: 'chg-agent-invoke',
        atomDef: {
          id: 'I1.team.run',
          track: 'heavy',
          agent_config: { adapter: 'codex_cli', timeout_ms: 2000 },
          prompt: 'Run fake codex task',
          expected_artifact: 'specs/changes/${change_id}/explore.json',
        },
        runtime: {},
      });

      assert.equal(result.ok, true);
      assert.equal(result.status, 'codex_completed');
      assert.equal(result.code, 0);
      assert.equal(result.artifact.source, 'fake-codex');
      assert.match(readFileSync(resolve(projectRoot, 'codex-args.txt'), 'utf8'), /--model\ngpt-5\.4/);
    } finally {
      process.env.PATH = originalPath;
      cleanupProjectRoot(projectRoot);
    }
  });

  test('pencil draft/refine/accept JS atoms materialize the expected heavy-track artifacts', async () => {
    const projectRoot = makeProjectRoot();
    try {
      const changeId = 'chg-pencil-js';
      mkdirSync(resolve(projectRoot, 'specs', 'changes', changeId), { recursive: true });
      writeFileSync(resolve(projectRoot, 'specs', 'changes', changeId, 'reconstruction_pack.json'), JSON.stringify({
        reconstruction_pack: {
          primary_reference_surface: 'primary_workspace',
          component_blueprint: [
            { id: 'workspace_toolbar_group_1', module: 'workspace', primitive_role: 'toolbar_group', hierarchy_role: 'supporting', stage_bucket: 'shell', geometry_profile: 'horizontal_controls', token_profile: 'toolbar_controls' },
            { id: 'workspace_list_row_1', module: 'workspace', primitive_role: 'list_row', hierarchy_role: 'primary', stage_bucket: 'primary_focus', geometry_profile: 'row_compact', token_profile: 'list_row_surface' },
            { id: 'workspace_meta_line_1', module: 'workspace', primitive_role: 'meta_line', hierarchy_role: 'supporting', stage_bucket: 'polish', geometry_profile: 'meta_inline', token_profile: 'meta_tokens' },
          ],
        },
      }, null, 2));
      writeFileSync(resolve(projectRoot, 'specs', 'changes', changeId, 'generation_contract.json'), JSON.stringify({
        generation_contract: {
          primary_reference_surface: 'primary_workspace',
          component_constraints: {
            component_blueprint: [
              { id: 'workspace_toolbar_group_1', module: 'workspace', primitive_role: 'toolbar_group', hierarchy_role: 'supporting', stage_bucket: 'shell', geometry_profile: 'horizontal_controls', token_profile: 'toolbar_controls' },
              { id: 'workspace_list_row_1', module: 'workspace', primitive_role: 'list_row', hierarchy_role: 'primary', stage_bucket: 'primary_focus', geometry_profile: 'row_compact', token_profile: 'list_row_surface' },
              { id: 'workspace_meta_line_1', module: 'workspace', primitive_role: 'meta_line', hierarchy_role: 'supporting', stage_bucket: 'polish', geometry_profile: 'meta_inline', token_profile: 'meta_tokens' },
            ],
            staged_generation: {
              stages: [
                { id: 'shell', order: 1, target_component_ids: ['workspace_toolbar_group_1'], primary_geometry_profiles: ['horizontal_controls'], primary_token_profiles: ['toolbar_controls'] },
                { id: 'primary_focus', order: 2, target_component_ids: ['workspace_list_row_1'], primary_geometry_profiles: ['row_compact'], primary_token_profiles: ['list_row_surface'] },
                { id: 'polish', order: 3, target_component_ids: ['workspace_meta_line_1'], primary_geometry_profiles: ['meta_inline'], primary_token_profiles: ['meta_tokens'] },
              ],
            },
            panel_focus_sequence: [
              { module: 'workspace', priority_order: 1, score: 6, target_component_ids: ['workspace_toolbar_group_1', 'workspace_list_row_1', 'workspace_meta_line_1'], dominant_primitive_roles: ['list_row'], stage_ids: ['shell', 'primary_focus', 'polish'] },
            ],
          },
          visual_constraints: {
            geometry_hints: { alignment_rules: ['align repeated primitives'], primitive_profiles: [{ id: 'row_compact' }] },
            token_hints: { primitive_token_profiles: [{ id: 'list_row_surface' }], typography_roles: ['list_body'], spacing_roles: ['component_gap'], emphasis_roles: ['primary'] },
          },
        },
      }, null, 2));
      writeFileSync(resolve(projectRoot, 'specs', 'changes', changeId, 'benchmark_repair_plan.json'), JSON.stringify({
        benchmark_repair_plan: {
          scenario_repairs: [
            {
              id: 'desktop-main',
              repairs: [
                {
                  id: 'token_repair',
                  reason: 'pixel_diff_ratio_above_threshold',
                  priority: 'medium',
                  target_component_ids: ['workspace_list_row_1', 'workspace_meta_line_1'],
                  target_primitive_roles: ['list_row', 'meta_line'],
                  focus_dimensions: ['spacing', 'typography'],
                  evidence_hotspots: ['grid(0,1) changed_ratio=0.2500'],
                  instruction: 'Tighten the task row tokens.',
                },
              ],
            },
          ],
        },
      }, null, 2));
      writeFileSync(resolve(projectRoot, 'specs', 'changes', changeId, 'primitive_feedback_history.json'), JSON.stringify({
        primitive_feedback_history: {
          entries: [
            {
              module: 'workspace',
              primitive_role: 'list_row',
              current_issue_score: 5,
              previous_issue_score: 2,
              improvement_score: 0,
              regression_score: 3,
              stabilization_score: 0,
              attention_score: 65,
            },
            {
              module: 'workspace',
              primitive_role: 'toolbar_group',
              current_issue_score: 0,
              previous_issue_score: 3,
              improvement_score: 3,
              regression_score: 0,
              stabilization_score: 3,
              attention_score: 0,
            },
            {
              module: 'workspace',
              primitive_role: 'meta_line',
              current_issue_score: 1,
              previous_issue_score: 3,
              improvement_score: 2,
              regression_score: 0,
              stabilization_score: 0,
              attention_score: 4,
            },
          ],
        },
      }, null, 2));

      const draft = await pencilDraft({}, { projectRoot, changeId, runtime: {} });
      const refine = await pencilRefine({}, { projectRoot, changeId, runtime: {} });
      const accept = await pencilAccept({}, { projectRoot, changeId, runtime: {} });

      assert.equal(draft.ok, true);
      assert.equal(refine.ok, true);
      assert.equal(accept.ok, true);
      assert.equal(existsSync(resolve(projectRoot, 'specs', 'changes', changeId, 'pencil_output.pen')), true);
      assert.equal(existsSync(resolve(projectRoot, 'specs', 'changes', changeId, 'pencil_generation_plan.json')), true);
      assert.equal(existsSync(resolve(projectRoot, 'specs', 'changes', changeId, 'pencil_refine_targets.json')), true);
      assert.equal(existsSync(resolve(projectRoot, 'specs', 'changes', changeId, 'design_accept.json')), true);
      assert.equal(existsSync(resolve(projectRoot, 'specs', 'changes', changeId, 'pencil_output.attestation.json')), true);
      const draftPlan = JSON.parse(readFileSync(resolve(projectRoot, 'specs', 'changes', changeId, 'pencil_generation_plan.json'), 'utf8'));
      assert.equal(draftPlan.staged_generation.stages.length, 3);
      assert.equal(draftPlan.panel_focus_sequence.length, 1);
      assert.equal(draftPlan.panel_focus_sequence[0].module, 'workspace');
      assert.ok(Array.isArray(draftPlan.primitive_focus_sequence));
      const refineTargets = JSON.parse(readFileSync(resolve(projectRoot, 'specs', 'changes', changeId, 'pencil_refine_targets.json'), 'utf8'));
      assert.equal(refineTargets.refine_scopes.allow_big_change[0].component_id, 'workspace_meta_line_1');
      assert.equal(refineTargets.refine_scopes.micro_tune_only[0].component_id, 'workspace_list_row_1');
      assert.equal(refineTargets.refine_scopes.freeze[0].component_id, 'workspace_toolbar_group_1');
      const refinedPen = readFileSync(resolve(projectRoot, 'specs', 'changes', changeId, 'pencil_output.pen'), 'utf8');
      assert.match(refinedPen, /execution_mode: targeted_component_refine/);
      assert.match(refinedPen, /target_component_ids: workspace_list_row_1, workspace_meta_line_1/);
      assert.match(refinedPen, /\[refine_scopes\]/);
      assert.match(refinedPen, /allow_big_change/);
      assert.match(refinedPen, /micro_tune_only/);
      assert.match(refinedPen, /freeze/);
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('pencil draft reorders panel focus sequence when prior repair history points at a specific panel', async () => {
    const projectRoot = makeProjectRoot();
    try {
      const changeId = 'chg-pencil-history-priority';
      mkdirSync(resolve(projectRoot, 'specs', 'changes', changeId), { recursive: true });
      writeFileSync(resolve(projectRoot, 'specs', 'changes', changeId, 'reconstruction_pack.json'), JSON.stringify({
        reconstruction_pack: {
          primary_reference_surface: 'primary_workspace',
          component_blueprint: [
            { id: 'calendar_grid_cell_1', module: 'calendar', primitive_role: 'grid_cell', hierarchy_role: 'primary', stage_bucket: 'primary_focus', geometry_profile: 'calendar_cell', token_profile: 'calendar_surface' },
            { id: 'list_list_row_1', module: 'list', primitive_role: 'list_row', hierarchy_role: 'primary', stage_bucket: 'secondary_focus', geometry_profile: 'row_compact', token_profile: 'list_row_surface' },
          ],
        },
      }, null, 2));
      writeFileSync(resolve(projectRoot, 'specs', 'changes', changeId, 'generation_contract.json'), JSON.stringify({
        generation_contract: {
          primary_reference_surface: 'primary_workspace',
          component_constraints: {
            component_blueprint: [
              { id: 'calendar_grid_cell_1', module: 'calendar', primitive_role: 'grid_cell', hierarchy_role: 'primary', stage_bucket: 'primary_focus', geometry_profile: 'calendar_cell', token_profile: 'calendar_surface' },
              { id: 'list_list_row_1', module: 'list', primitive_role: 'list_row', hierarchy_role: 'primary', stage_bucket: 'secondary_focus', geometry_profile: 'row_compact', token_profile: 'list_row_surface' },
            ],
            staged_generation: {
              stages: [
                { id: 'primary_focus', order: 1, target_component_ids: ['calendar_grid_cell_1'], primary_geometry_profiles: ['calendar_cell'], primary_token_profiles: ['calendar_surface'] },
                { id: 'secondary_focus', order: 2, target_component_ids: ['list_list_row_1'], primary_geometry_profiles: ['row_compact'], primary_token_profiles: ['list_row_surface'] },
              ],
            },
            panel_focus_sequence: [
              { module: 'calendar', priority_order: 1, score: 6, target_component_ids: ['calendar_grid_cell_1'], dominant_primitive_roles: ['grid_cell'], stage_ids: ['primary_focus'] },
              { module: 'list', priority_order: 2, score: 4, target_component_ids: ['list_list_row_1'], dominant_primitive_roles: ['list_row'], stage_ids: ['secondary_focus'] },
            ],
          },
          visual_constraints: {
            geometry_hints: { alignment_rules: ['align repeated primitives'], primitive_profiles: [{ id: 'row_compact' }] },
            token_hints: { primitive_token_profiles: [{ id: 'list_row_surface' }], typography_roles: ['list_body'], spacing_roles: ['component_gap'], emphasis_roles: ['primary'] },
          },
        },
      }, null, 2));
      writeFileSync(resolve(projectRoot, 'specs', 'changes', changeId, 'benchmark_repair_plan.json'), JSON.stringify({
        benchmark_repair_plan: {
          scenario_repairs: [
            {
              id: 'desktop-main',
              repairs: [
                {
                  id: 'structure_repair',
                  reason: 'structural_similarity_below_threshold',
                  priority: 'high',
                  impacted_panels: ['list'],
                  target_modules: ['list'],
                  target_component_ids: ['list_list_row_1'],
                },
              ],
            },
          ],
        },
      }, null, 2));

      const draft = await pencilDraft({}, { projectRoot, changeId, runtime: {} });
      assert.equal(draft.ok, true);
      const draftPlan = JSON.parse(readFileSync(resolve(projectRoot, 'specs', 'changes', changeId, 'pencil_generation_plan.json'), 'utf8'));
      assert.equal(draftPlan.panel_focus_sequence[0].module, 'list');
      assert.ok((draftPlan.panel_focus_sequence[0].history_repair_reasons || []).includes('structure_repair'));
      const listPrimitive = draftPlan.primitive_focus_sequence.find((entry) => entry.module === 'list');
      assert.equal(listPrimitive.primitive_role, 'list_row');
      assert.ok((listPrimitive.history_repair_reasons || []).includes('structure_repair'));
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('pencil draft writes primitive improvement history when current issues shrink', async () => {
    const projectRoot = makeProjectRoot();
    try {
      const changeId = 'chg-pencil-improvement-history';
      mkdirSync(resolve(projectRoot, 'specs', 'changes', changeId), { recursive: true });
      writeFileSync(resolve(projectRoot, 'specs', 'changes', changeId, 'reconstruction_pack.json'), JSON.stringify({
        reconstruction_pack: {
          primary_reference_surface: 'primary_workspace',
          component_blueprint: [
            { id: 'calendar_grid_cell_1', module: 'calendar', primitive_role: 'grid_cell', hierarchy_role: 'primary', stage_bucket: 'primary_focus', geometry_profile: 'calendar_cell', token_profile: 'calendar_surface' },
            { id: 'calendar_status_chip_1', module: 'calendar', primitive_role: 'status_chip', hierarchy_role: 'primary', stage_bucket: 'primary_focus', geometry_profile: 'chip_inline', token_profile: 'event_chip' },
          ],
        },
      }, null, 2));
      writeFileSync(resolve(projectRoot, 'specs', 'changes', changeId, 'generation_contract.json'), JSON.stringify({
        generation_contract: {
          primary_reference_surface: 'primary_workspace',
          component_constraints: {
            component_blueprint: [
              { id: 'calendar_grid_cell_1', module: 'calendar', primitive_role: 'grid_cell', hierarchy_role: 'primary', stage_bucket: 'primary_focus', geometry_profile: 'calendar_cell', token_profile: 'calendar_surface' },
              { id: 'calendar_status_chip_1', module: 'calendar', primitive_role: 'status_chip', hierarchy_role: 'primary', stage_bucket: 'primary_focus', geometry_profile: 'chip_inline', token_profile: 'event_chip' },
            ],
            staged_generation: {
              stages: [
                { id: 'primary_focus', order: 1, target_component_ids: ['calendar_grid_cell_1', 'calendar_status_chip_1'], primary_geometry_profiles: ['calendar_cell', 'chip_inline'], primary_token_profiles: ['calendar_surface', 'event_chip'] },
              ],
            },
            panel_focus_sequence: [
              { module: 'calendar', priority_order: 1, score: 6, target_component_ids: ['calendar_grid_cell_1', 'calendar_status_chip_1'], dominant_primitive_roles: ['grid_cell', 'status_chip'], stage_ids: ['primary_focus'] },
            ],
          },
          visual_constraints: {
            geometry_hints: { alignment_rules: ['align repeated primitives'], primitive_profiles: [{ id: 'calendar_cell' }] },
            token_hints: { primitive_token_profiles: [{ id: 'calendar_surface' }], typography_roles: ['list_body'], spacing_roles: ['component_gap'], emphasis_roles: ['primary'] },
          },
        },
      }, null, 2));
      writeFileSync(resolve(projectRoot, 'specs', 'changes', changeId, 'primitive_feedback_history.json'), JSON.stringify({
        primitive_feedback_history: {
          entries: [
            {
              module: 'calendar',
              primitive_role: 'grid_cell',
              current_issue_score: 6,
            },
            {
              module: 'calendar',
              primitive_role: 'status_chip',
              current_issue_score: 5,
            },
          ],
        },
      }, null, 2));
      writeFileSync(resolve(projectRoot, 'specs', 'changes', changeId, 'benchmark_repair_plan.json'), JSON.stringify({
        benchmark_repair_plan: {
          scenario_repairs: [
            {
              id: 'desktop-main',
              repairs: [
                {
                  id: 'token_repair',
                  reason: 'pixel_diff_ratio_above_threshold',
                  priority: 'medium',
                  target_component_ids: ['calendar_status_chip_1'],
                  target_primitive_roles: ['status_chip'],
                  impacted_panels: ['calendar'],
                  target_modules: ['calendar'],
                },
              ],
            },
          ],
        },
      }, null, 2));

      const draft = await pencilDraft({}, { projectRoot, changeId, runtime: {} });
      assert.equal(draft.ok, true);
      const history = JSON.parse(readFileSync(resolve(projectRoot, 'specs', 'changes', changeId, 'primitive_feedback_history.json'), 'utf8'));
      const gridCell = history.primitive_feedback_history.entries.find((entry) => entry.primitive_role === 'grid_cell');
      const statusChip = history.primitive_feedback_history.entries.find((entry) => entry.primitive_role === 'status_chip');
      assert.equal(gridCell.improvement_score, 6);
      assert.equal(gridCell.current_issue_score, 0);
      assert.equal(statusChip.current_issue_score, 2);
      assert.equal(statusChip.improvement_score, 3);
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('agent_invoke phase execution prompt uses the resolved expected artifact path', async () => {
    const projectRoot = makeProjectRoot();
    try {
      const result = await agentInvoke({}, {
        workflow: { track: 'heavy' },
        phase: {
          id: 'explore',
          label: '02 · Explore',
          artifacts: [{ path: 'specs/changes/${change_id}/explore.json', optional: false }],
        },
        projectRoot,
        changeId: 'chg-phase-prompt',
        atomDef: {
          id: 'I1.team.run',
          ...registry.atoms['I1.team.run'],
          agent_config: { adapter: 'stub' },
        },
        runtime: {},
      });

      assert.equal(result.ok, true);
      const pendingTaskDir = resolve(projectRoot, '.as-xflow', 'pending-tasks');
      const promptPath = resolve(
        pendingTaskDir,
        readdirSync(pendingTaskDir).find((entry) => entry.endsWith('.prompt.md')),
      );
      const prompt = readFileSync(promptPath, 'utf8');
      assert.match(prompt, /Write the primary artifact to: `specs\/changes\/chg-phase-prompt\/execution\.json`/);
      assert.match(prompt, /Summarize same-category evidence, IA takeaways, and non-negotiable product invariants/);
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('visualReview preserves QA review side effects for H5.visual.review', async () => {
    const projectRoot = makeProjectRoot();
    try {
      const created = await missionCreate(
        { goal: 'Run QA review', workspace: projectRoot },
        { projectRoot, changeId: 'chg-qa-review', runtime: {} },
      );

      mkdirSync(resolve(projectRoot, 'specs', 'changes', 'chg-qa-review'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-qa-review', 'verify_proof.json'), JSON.stringify({
        all_passed: true,
        command_results: [{ command: 'npm test', exit_code: 0 }],
      }, null, 2));

      const result = await visualReview({ mode: 'qa' }, {
        projectRoot,
        changeId: 'chg-qa-review',
        phase: {
          id: 'qa',
          label: 'QA',
        },
        runtime: { missionId: created.mission_id },
      });

      assert.equal(result.ok, true);
      assert.equal(existsSync(resolve(projectRoot, 'specs', 'changes', 'chg-qa-review', 'qa_visual_review.json')), true);
      assert.equal(existsSync(resolve(projectRoot, 'specs', 'changes', 'chg-qa-review', 'llm_design_review.json')), true);

      const verify = await artifactVerify({}, {
        projectRoot,
        changeId: 'chg-qa-review',
        phase: { id: 'qa' },
        runtime: { missionId: created.mission_id },
      });

      assert.equal(verify.ok, false);
      assert.equal(verify.packet.qa_status, 'needs_human');
      assert.equal(verify.packet.qa_acceptance_packet.status, 'needs_human');
      assert.deepEqual(verify.packet.failed_checks, [
        'visual_benchmark_not_accepted',
        'aesthetic_review_not_accepted',
        'module_contract_missing',
        'primary_journey_contract_missing',
      ]);
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('structured team-run writes proposal, ux brief, and plan artifacts without long-running agent dispatch', async () => {
    const projectRoot = makeProjectRoot();
    try {
      const changeId = 'chg-structured-team-run';
      mkdirSync(resolve(projectRoot, 'specs', 'changes', changeId), { recursive: true });
      writeFileSync(resolve(projectRoot, 'specs', 'changes', changeId, 'corps-input.json'), JSON.stringify({
        competitor_product: 'TickTick desktop',
        primary_reference_surface: 'desktop_list_detail_workspace',
        target_surfaces: ['desktop_list_detail_workspace', 'desktop_week_schedule'],
        required_modules: ['sidebar_navigation', 'task_list_workspace', 'task_detail_panel'],
        primary_journeys: ['capture_to_inbox', 'task_to_schedule'],
        business_logic_invariants: ['Inbox items stay unscheduled until explicit planning.'],
        tdd_red_command: 'node --test test/ticktick-pixel-h5.test.js',
        tdd_green_command: 'node --test test/ticktick-pixel-h5.test.js',
      }, null, 2));

      await teamRun({ phase: 'proposal' }, {
        projectRoot,
        changeId,
        phase: { id: 'proposal', label: 'Proposal' },
        runtime: {},
      });
      await teamRun({ phase: 'ux_design_brief' }, {
        projectRoot,
        changeId,
        phase: { id: 'ux_design_brief', label: 'UX design brief' },
        runtime: {},
      });
      await teamRun({ phase: 'plan' }, {
        projectRoot,
        changeId,
        phase: { id: 'plan', label: 'Plan' },
        runtime: {},
      });

      const proposal = JSON.parse(readFileSync(resolve(projectRoot, 'specs', 'changes', changeId, 'proposal.json'), 'utf8'));
      const uxBrief = JSON.parse(readFileSync(resolve(projectRoot, 'specs', 'changes', changeId, 'ux_design_brief.json'), 'utf8'));
      const plan = JSON.parse(readFileSync(resolve(projectRoot, 'specs', 'changes', changeId, 'plan.json'), 'utf8'));
      const planMd = readFileSync(resolve(projectRoot, 'specs', 'changes', changeId, 'plan.md'), 'utf8');

      assert.equal(proposal.proposal.competitor_product, 'TickTick desktop');
      assert.deepEqual(uxBrief.ux_design_brief.flows, ['capture_to_inbox', 'task_to_schedule']);
      assert.ok(plan.execution_plan.length >= 3);
      assert.match(planMd, /## Verification/);
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('agent_invoke retries codex_cli after a non-zero exit and eventually succeeds', async () => {
    const projectRoot = makeProjectRoot();
    const originalPath = process.env.PATH || '';
    try {
      const fakeBin = resolve(projectRoot, 'bin');
      mkdirSync(fakeBin, { recursive: true });
      const fakeCodex = resolve(fakeBin, 'codex');
      writeFileSync(fakeCodex, [
        '#!/bin/sh',
        'COUNT_FILE="$PWD/.codex-attempt-count"',
        'COUNT=0',
        '[ -f "$COUNT_FILE" ] && COUNT=$(cat "$COUNT_FILE")',
        'COUNT=$((COUNT + 1))',
        'echo "$COUNT" > "$COUNT_FILE"',
        'if [ "$COUNT" -eq 1 ]; then',
        '  echo "first attempt fails" >&2',
        '  exit 9',
        'fi',
        'mkdir -p "$PWD/specs/changes/chg-agent-retry"',
        `cat <<'EOF' > "$PWD/specs/changes/chg-agent-retry/explore.json"`,
        '{"ok":true,"source":"retry-success"}',
        'EOF',
      ].join('\n'));
      chmodSync(fakeCodex, 0o755);
      process.env.PATH = `${fakeBin}:${originalPath}`;

      const result = await agentInvoke({}, {
        workflow: { track: 'heavy' },
        phase: {
          id: 'explore',
          label: 'Explore',
          artifacts: [{ path: 'specs/changes/${change_id}/explore.json', optional: false }],
        },
        projectRoot,
        changeId: 'chg-agent-retry',
        atomDef: {
          id: 'I1.team.run',
          track: 'heavy',
          agent_config: { adapter: 'codex_cli', timeout_ms: 2000, retries: 1 },
          prompt: 'Retry fake codex task',
          expected_artifact: 'specs/changes/${change_id}/explore.json',
        },
        runtime: {},
      });

      assert.equal(result.ok, true);
      assert.equal(result.status, 'codex_completed');
      assert.equal(result.attempts, 2);
      assert.equal(result.retries_used, 1);
      assert.equal(result.artifact.source, 'retry-success');
    } finally {
      process.env.PATH = originalPath;
      cleanupProjectRoot(projectRoot);
    }
  });

  test('agent_invoke times out and force kills codex_cli when retries are exhausted', async () => {
    const projectRoot = makeProjectRoot();
    const originalPath = process.env.PATH || '';
    try {
      const fakeBin = resolve(projectRoot, 'bin');
      mkdirSync(fakeBin, { recursive: true });
      const fakeCodex = resolve(fakeBin, 'codex');
      writeFileSync(fakeCodex, [
        '#!/bin/sh',
        'trap "" TERM',
        'sleep 5',
      ].join('\n'));
      chmodSync(fakeCodex, 0o755);
      process.env.PATH = `${fakeBin}:${originalPath}`;

      const result = await agentInvoke({}, {
        workflow: { track: 'heavy' },
        phase: {
          id: 'explore',
          label: 'Explore',
          artifacts: [{ path: 'specs/changes/${change_id}/explore.json', optional: false }],
        },
        projectRoot,
        changeId: 'chg-agent-timeout',
        atomDef: {
          id: 'I1.team.run',
          track: 'heavy',
          agent_config: {
            adapter: 'codex_cli',
            timeout_ms: 50,
            kill_after_ms: 50,
            retries: 1,
            retry_delay_ms: 10,
          },
          prompt: 'Timeout fake codex task',
          expected_artifact: 'specs/changes/${change_id}/explore.json',
        },
        runtime: {},
      });

      assert.equal(result.ok, false);
      assert.equal(result.status, 'codex_timed_out');
      assert.equal(result.attempts, 2);
      assert.equal(result.timed_out, true);
      assert.equal(result.force_killed, true);
    } finally {
      process.env.PATH = originalPath;
      cleanupProjectRoot(projectRoot);
    }
  });

  test('agent_invoke accepts a timed-out codex_cli run when the expected artifact was written', async () => {
    const projectRoot = makeProjectRoot();
    const originalPath = process.env.PATH || '';
    try {
      const fakeBin = resolve(projectRoot, 'bin');
      mkdirSync(fakeBin, { recursive: true });
      const fakeCodex = resolve(fakeBin, 'codex');
      writeFileSync(fakeCodex, [
        '#!/bin/sh',
        'mkdir -p "$PWD/specs/changes/chg-agent-timeout-artifact"',
        `cat <<'EOF' > "$PWD/specs/changes/chg-agent-timeout-artifact/explore.json"`,
        '{"ok":true,"source":"timeout-artifact"}',
        'EOF',
        'trap "" TERM',
        'sleep 6',
      ].join('\n'));
      chmodSync(fakeCodex, 0o755);
      process.env.PATH = `${fakeBin}:${originalPath}`;

      const result = await agentInvoke({}, {
        workflow: { track: 'heavy' },
        phase: {
          id: 'explore',
          label: 'Explore',
          artifacts: [{ path: 'specs/changes/${change_id}/explore.json', optional: false }],
        },
        projectRoot,
        changeId: 'chg-agent-timeout-artifact',
        atomDef: {
          id: 'I1.team.run',
          track: 'heavy',
          agent_config: {
            adapter: 'codex_cli',
            timeout_ms: 5000,
            kill_after_ms: 50,
          },
          prompt: 'Timeout fake codex task with artifact',
          expected_artifact: 'specs/changes/${change_id}/explore.json',
        },
        runtime: {},
      });

      assert.equal(result.ok, true);
      assert.equal(result.status, 'codex_completed');
      assert.equal(result.timed_out, false);
      assert.equal(Boolean(result.artifact), true);
      assert.equal(result.artifact.source, 'timeout-artifact');
    } finally {
      process.env.PATH = originalPath;
      cleanupProjectRoot(projectRoot);
    }
  });

  test('agent_invoke auto-selects pencil_cli for authenticated pencil phases', async () => {
    const projectRoot = makeProjectRoot();
    const originalPath = process.env.PATH || '';
    try {
      const fakeBin = resolve(projectRoot, 'bin');
      mkdirSync(fakeBin, { recursive: true });
      const fakeWhich = resolve(fakeBin, 'which');
      writeFileSync(fakeWhich, [
        '#!/bin/sh',
        'if [ "$1" = "pencil" ]; then',
        '  echo "$PWD/bin/pencil"',
        '  exit 0',
        'fi',
        'exit 1',
      ].join('\n'));
      chmodSync(fakeWhich, 0o755);

      const fakePencil = resolve(fakeBin, 'pencil');
      writeFileSync(fakePencil, [
        '#!/bin/sh',
        'if [ "$1" = "status" ]; then',
        '  exit 0',
        'fi',
        'OUT=""',
        'PREVIEW=""',
        'IN=""',
        'while [ "$#" -gt 0 ]; do',
        '  case "$1" in',
        '    --out) OUT="$2"; shift 2 ;;',
        '    --in) IN="$2"; shift 2 ;;',
        '    --export) PREVIEW="$2"; shift 2 ;;',
        '    *) shift ;;',
        '  esac',
        'done',
        'mkdir -p "$(dirname "$OUT")"',
        'if [ -n "$IN" ] && [ -f "$IN" ]; then',
        '  cp "$IN" "$OUT"',
        'else',
        '  printf "PENCIL draft\\n" > "$OUT"',
        'fi',
        'printf "rendered-by=fake-pencil\\n" >> "$OUT"',
        'if [ -n "$PREVIEW" ]; then',
        '  mkdir -p "$(dirname "$PREVIEW")"',
        '  printf "PNG" > "$PREVIEW"',
        'fi',
      ].join('\n'));
      chmodSync(fakePencil, 0o755);
      process.env.PATH = `${fakeBin}:${originalPath}`;

      const result = await agentInvoke({}, {
        workflow: { track: 'heavy' },
        phase: {
          id: 'pencil_draft',
          label: 'Pencil draft',
          artifacts: [{ path: 'specs/changes/${change_id}/pencil_output.pen', optional: false }],
        },
        projectRoot,
        changeId: 'chg-pencil-real',
        atomDef: {
          id: 'H4a.pencil.draft',
          agent_config: { adapter: 'auto' },
          expected_artifact: 'specs/changes/${change_id}/pencil_output.pen',
          stub_config: { write_pen: true },
        },
        runtime: {},
      });

      assert.equal(result.ok, true);
      assert.equal(result.status, 'pencil_completed');
      assert.equal(result.adapter_reason, 'pencil_authenticated');
      assert.equal(result.artifact.type, 'pencil_pen');
      assert.equal(existsSync(resolve(projectRoot, 'specs', 'changes', 'chg-pencil-real', 'pencil_output.pen')), true);
      assert.equal(existsSync(resolve(projectRoot, 'specs', 'changes', 'chg-pencil-real', 'pencil_preview.png')), true);
      assert.match(readFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-pencil-real', 'pencil_output.pen'), 'utf8'), /fake-pencil/);
    } finally {
      process.env.PATH = originalPath;
      cleanupProjectRoot(projectRoot);
    }
  });

  test('agent_invoke accepts pencil_cli output when artifact exists despite CLI failure', async () => {
    const projectRoot = makeProjectRoot();
    const originalPath = process.env.PATH || '';
    try {
      const fakeBin = resolve(projectRoot, 'bin');
      mkdirSync(fakeBin, { recursive: true });
      const fakeWhich = resolve(fakeBin, 'which');
      writeFileSync(fakeWhich, [
        '#!/bin/sh',
        'if [ "$1" = "pencil" ]; then',
        '  echo "$PWD/bin/pencil"',
        '  exit 0',
        'fi',
        'exit 1',
      ].join('\n'));
      chmodSync(fakeWhich, 0o755);

      const fakePencil = resolve(fakeBin, 'pencil');
      writeFileSync(fakePencil, [
        '#!/bin/sh',
        'if [ "$1" = "status" ]; then',
        '  exit 0',
        'fi',
        'OUT=""',
        'PREVIEW=""',
        'while [ "$#" -gt 0 ]; do',
        '  case "$1" in',
        '    --out) OUT="$2"; shift 2 ;;',
        '    --export) PREVIEW="$2"; shift 2 ;;',
        '    *) shift ;;',
        '  esac',
        'done',
        'mkdir -p "$(dirname "$OUT")"',
        'printf "PENCIL recovered\\n" > "$OUT"',
        'if [ -n "$PREVIEW" ]; then',
        '  mkdir -p "$(dirname "$PREVIEW")"',
        '  printf "PNG" > "$PREVIEW"',
        'fi',
        'echo "rate_limit after artifact" >&2',
        'exit 1',
      ].join('\n'));
      chmodSync(fakePencil, 0o755);
      process.env.PATH = `${fakeBin}:${originalPath}`;

      const result = await agentInvoke({}, {
        workflow: { track: 'heavy' },
        phase: {
          id: 'pencil_draft',
          label: 'Pencil draft',
          artifacts: [{ path: 'specs/changes/${change_id}/pencil_output.pen', optional: false }],
        },
        projectRoot,
        changeId: 'chg-pencil-recovered',
        atomDef: {
          id: 'H4a.pencil.draft',
          agent_config: { adapter: 'auto' },
          expected_artifact: 'specs/changes/${change_id}/pencil_output.pen',
          stub_config: { write_pen: true },
        },
        runtime: {},
      });

      assert.equal(result.ok, true);
      assert.equal(result.status, 'pencil_completed');
      assert.equal(result.artifact_recovered, true);
      assert.equal(result.attempt_results[0].artifact_recovered, true);
      assert.match(result.stderr, /valid pencil artifact detected/);
      assert.match(readFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-pencil-recovered', 'pencil_output.pen'), 'utf8'), /recovered/);
    } finally {
      process.env.PATH = originalPath;
      cleanupProjectRoot(projectRoot);
    }
  });

  test('agent_invoke honors atom expected_artifact when a phase has multiple required artifacts', async () => {
    const projectRoot = makeProjectRoot();
    const originalPath = process.env.PATH || '';
    try {
      const fakeBin = resolve(projectRoot, 'bin');
      mkdirSync(fakeBin, { recursive: true });
      const fakeWhich = resolve(fakeBin, 'which');
      writeFileSync(fakeWhich, [
        '#!/bin/sh',
        'if [ "$1" = "pencil" ]; then',
        '  echo "$PWD/bin/pencil"',
        '  exit 0',
        'fi',
        'exit 1',
      ].join('\n'));
      chmodSync(fakeWhich, 0o755);

      const fakePencil = resolve(fakeBin, 'pencil');
      writeFileSync(fakePencil, [
        '#!/bin/sh',
        'if [ "$1" = "status" ]; then',
        '  exit 0',
        'fi',
        'OUT=""',
        'while [ "$#" -gt 0 ]; do',
        '  case "$1" in',
        '    --out) OUT="$2"; shift 2 ;;',
        '    *) shift ;;',
        '  esac',
        'done',
        'mkdir -p "$(dirname "$OUT")"',
        'printf "refined-by=fake-pencil\\n" > "$OUT"',
      ].join('\n'));
      chmodSync(fakePencil, 0o755);
      process.env.PATH = `${fakeBin}:${originalPath}`;

      mkdirSync(resolve(projectRoot, 'specs', 'changes', 'chg-pencil-refine'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-pencil-refine', 'benchmark_repair_plan.json'), '{"status":"ready"}\n');
      writeFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-pencil-refine', 'pencil_output.pen'), 'draft\n');

      const result = await agentInvoke({}, {
        workflow: { track: 'heavy' },
        phase: {
          id: 'pencil_refine',
          label: 'Pencil refine',
          artifacts: [
            { path: 'specs/changes/${change_id}/benchmark_repair_plan.json', optional: false },
            { path: 'specs/changes/${change_id}/pencil_output.pen', optional: false },
          ],
        },
        projectRoot,
        changeId: 'chg-pencil-refine',
        atomDef: {
          id: 'H4b.pencil.refine',
          agent_config: { adapter: 'auto' },
          expected_artifact: 'specs/changes/${change_id}/pencil_output.pen',
          stub_config: { write_pen: true },
        },
        runtime: {},
      });

      assert.equal(result.ok, true);
      assert.equal(result.artifact.path, resolve(projectRoot, 'specs', 'changes', 'chg-pencil-refine', 'pencil_output.pen'));
      assert.match(readFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-pencil-refine', 'pencil_output.pen'), 'utf8'), /refined-by=fake-pencil/);
      assert.match(readFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-pencil-refine', 'benchmark_repair_plan.json'), 'utf8'), /ready/);
    } finally {
      process.env.PATH = originalPath;
      cleanupProjectRoot(projectRoot);
    }
  });

  test('agent_invoke marks pencil fallback explicitly when pencil is unauthenticated', async () => {
    const projectRoot = makeProjectRoot();
    const originalPath = process.env.PATH || '';
    try {
      const fakeBin = resolve(projectRoot, 'bin');
      mkdirSync(fakeBin, { recursive: true });
      const fakeWhich = resolve(fakeBin, 'which');
      writeFileSync(fakeWhich, [
        '#!/bin/sh',
        'if [ "$1" = "pencil" ]; then',
        '  echo "$PWD/bin/pencil"',
        '  exit 0',
        'fi',
        'exit 1',
      ].join('\n'));
      chmodSync(fakeWhich, 0o755);

      const fakePencil = resolve(fakeBin, 'pencil');
      writeFileSync(fakePencil, [
        '#!/bin/sh',
        'if [ "$1" = "status" ]; then',
        '  echo "Not authenticated" >&2',
        '  exit 1',
        'fi',
        'exit 9',
      ].join('\n'));
      chmodSync(fakePencil, 0o755);
      process.env.PATH = `${fakeBin}:${originalPath}`;

      const result = await agentInvoke({}, {
        workflow: { track: 'heavy' },
        phase: {
          id: 'pencil_draft',
          label: 'Pencil draft',
          artifacts: [{ path: 'specs/changes/${change_id}/pencil_output.pen', optional: false }],
        },
        projectRoot,
        changeId: 'chg-pencil-fallback',
        atomDef: {
          id: 'H4a.pencil.draft',
          agent_config: { adapter: 'auto' },
          expected_artifact: 'specs/changes/${change_id}/pencil_output.pen',
          stub_config: { write_pen: true },
        },
        runtime: {},
      });

      assert.equal(result.ok, true);
      assert.equal(result.status, 'pencil_stubbed');
      assert.equal(result.adapter_reason, 'pencil_unauthenticated');
      assert.equal(existsSync(resolve(projectRoot, 'specs', 'changes', 'chg-pencil-fallback', 'pencil_output.pen')), true);
      assert.match(readFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-pencil-fallback', 'pencil_output.pen'), 'utf8'), /PENCIL pencil_draft/);
    } finally {
      process.env.PATH = originalPath;
      cleanupProjectRoot(projectRoot);
    }
  });

  test('agent_invoke refuses stub fallback when strict real runtime is required', async () => {
    const projectRoot = makeProjectRoot();
    const originalPath = process.env.PATH || '';
    const originalRequireRealRuntime = process.env.XFLOW_REQUIRE_REAL_AGENT_RUNTIME;
    try {
      const fakeBin = resolve(projectRoot, 'bin');
      mkdirSync(fakeBin, { recursive: true });
      const fakeWhich = resolve(fakeBin, 'which');
      writeFileSync(fakeWhich, [
        '#!/bin/sh',
        'exit 1',
      ].join('\n'));
      chmodSync(fakeWhich, 0o755);
      process.env.PATH = `${fakeBin}:${originalPath}`;
      process.env.XFLOW_REQUIRE_REAL_AGENT_RUNTIME = '1';

      const result = await agentInvoke({}, {
        workflow: { track: 'heavy' },
        phase: {
          id: 'execute',
          label: 'Execute',
          artifacts: [{ path: 'specs/changes/${change_id}/execute.json', optional: false }],
        },
        projectRoot,
        changeId: 'chg-strict-no-stub',
        atomDef: {
          id: 'I2.phase_run.dispatch',
          agent_config: { adapter: 'auto' },
          stub_config: {},
        },
        runtime: {},
      });

      assert.equal(result.ok, false);
      assert.equal(result.status, 'real_agent_runtime_missing');
      assert.equal(result.adapter, 'stub');
      assert.equal(existsSync(resolve(projectRoot, 'specs', 'changes', 'chg-strict-no-stub', 'execute.json')), false);
    } finally {
      process.env.PATH = originalPath;
      if (originalRequireRealRuntime === undefined) delete process.env.XFLOW_REQUIRE_REAL_AGENT_RUNTIME;
      else process.env.XFLOW_REQUIRE_REAL_AGENT_RUNTIME = originalRequireRealRuntime;
      cleanupProjectRoot(projectRoot);
    }
  });

  test('agent_invoke auto-selects codex_cli for non-pencil heavy phases when codex is available', async () => {
    const projectRoot = makeProjectRoot();
    const originalPath = process.env.PATH || '';
    const originalAutoRuntime = process.env.XFLOW_AUTO_AGENT_RUNTIME;
    try {
      const fakeBin = resolve(projectRoot, 'bin');
      mkdirSync(fakeBin, { recursive: true });
      const fakeWhich = resolve(fakeBin, 'which');
      writeFileSync(fakeWhich, [
        '#!/bin/sh',
        'if [ "$1" = "codex" ]; then',
        '  echo "$PWD/bin/codex"',
        '  exit 0',
        'fi',
        'exit 1',
      ].join('\n'));
      chmodSync(fakeWhich, 0o755);

      const fakeCodex = resolve(fakeBin, 'codex');
      writeFileSync(fakeCodex, [
        '#!/bin/sh',
        'printf "{\\"ok\\":true}\\n"',
      ].join('\n'));
      chmodSync(fakeCodex, 0o755);
      process.env.PATH = `${fakeBin}:${originalPath}`;
      process.env.XFLOW_AUTO_AGENT_RUNTIME = '1';

      const result = await agentInvoke({}, {
        workflow: { track: 'heavy' },
        phase: {
          id: 'clarify',
          label: 'Clarify',
          artifacts: [{ path: 'specs/changes/${change_id}/clarify.json', optional: false }],
        },
        projectRoot,
        changeId: 'chg-auto-codex',
        atomDef: {
          id: 'I1.team.run',
          agent_config: { adapter: 'auto' },
          stub_config: {},
        },
        runtime: {},
      });

      assert.equal(result.adapter, 'codex_cli');
      assert.equal(result.adapter_reason, 'codex_available');
    } finally {
      process.env.PATH = originalPath;
      if (originalAutoRuntime === undefined) delete process.env.XFLOW_AUTO_AGENT_RUNTIME;
      else process.env.XFLOW_AUTO_AGENT_RUNTIME = originalAutoRuntime;
      cleanupProjectRoot(projectRoot);
    }
  });

  test('agent_invoke auto-selects claude_cli when codex is absent and claude is available', async () => {
    const projectRoot = makeProjectRoot();
    const originalPath = process.env.PATH || '';
    const originalAutoRuntime = process.env.XFLOW_AUTO_AGENT_RUNTIME;
    try {
      const fakeBin = resolve(projectRoot, 'bin');
      mkdirSync(fakeBin, { recursive: true });
      const fakeWhich = resolve(fakeBin, 'which');
      writeFileSync(fakeWhich, [
        '#!/bin/sh',
        'if [ "$1" = "claude" ]; then',
        '  echo "$PWD/bin/claude"',
        '  exit 0',
        'fi',
        'exit 1',
      ].join('\n'));
      chmodSync(fakeWhich, 0o755);

      const fakeClaude = resolve(fakeBin, 'claude');
      writeFileSync(fakeClaude, [
        '#!/bin/sh',
        'printf "ok\\n"',
      ].join('\n'));
      chmodSync(fakeClaude, 0o755);
      process.env.PATH = `${fakeBin}:${originalPath}`;
      process.env.XFLOW_AUTO_AGENT_RUNTIME = '1';

      const result = await agentInvoke({}, {
        workflow: { track: 'heavy' },
        phase: {
          id: 'clarify',
          label: 'Clarify',
          artifacts: [{ path: 'specs/changes/${change_id}/clarify.json', optional: false }],
        },
        projectRoot,
        changeId: 'chg-auto-claude',
        atomDef: {
          id: 'I1.team.run',
          agent_config: { adapter: 'auto' },
          stub_config: {},
        },
        runtime: {},
      });

      assert.equal(result.adapter, 'claude_cli');
      assert.equal(result.adapter_reason, 'claude_available');
    } finally {
      process.env.PATH = originalPath;
      if (originalAutoRuntime === undefined) delete process.env.XFLOW_AUTO_AGENT_RUNTIME;
      else process.env.XFLOW_AUTO_AGENT_RUNTIME = originalAutoRuntime;
      cleanupProjectRoot(projectRoot);
    }
  });

  test('visual review aggregate merges parallel worker artifacts into llm_design_review', async () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'specs', 'changes', 'chg-review-aggregate'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-review-aggregate', 'llm_design_review.json'), JSON.stringify({
        version: 1,
        summary: 'Visual review completed with style findings.',
        team_run: {
          findings: ['Spacing issue found.'],
        },
      }, null, 2));
      writeFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-review-aggregate', 'visual_benchmark.json'), JSON.stringify({
        version: 1,
        scenarios: [
          { id: 'desktop', status: 'pass' },
          { id: 'mobile', status: 'needs_follow_up' },
        ],
      }, null, 2));

      const result = await visualReviewAggregate({}, {
        projectRoot,
        changeId: 'chg-review-aggregate',
      });

      assert.equal(result.ok, true);
      assert.equal(result.status, 'aggregated');
      const merged = JSON.parse(readFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-review-aggregate', 'llm_design_review.json'), 'utf8'));
      const aggregateSchema = JSON.parse(readFileSync(resolve(REPO_ROOT, 'schemas', 'llm-design-review-aggregate.schema.json'), 'utf8'));
      const validateAggregate = new Ajv({ allErrors: true }).compile(aggregateSchema);
      assert.equal(validateAggregate(merged), true, JSON.stringify(validateAggregate.errors));
      assert.equal(merged.benchmark_summary.scenario_count, 2);
      assert.equal(merged.benchmark_summary.passed_count, 1);
      assert.equal(merged.benchmark_summary.needs_follow_up_count, 1);
      assert.equal(merged.worker_runs.visual_benchmark.artifact_file.endsWith('visual_benchmark.json'), true);
      assert.match(merged.summary, /Benchmarked 2 scenario/);
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('generation contract and aesthetic review encode high-aesthetic image-reference capability', async () => {
    const projectRoot = makeProjectRoot();
    const changeId = 'chg-aesthetic-contract';
    try {
      mkdirSync(resolve(projectRoot, 'specs', 'changes', changeId), { recursive: true });
      mkdirSync(resolve(projectRoot, 'refs'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'output'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'refs', 'competitor-main.png'), 'ref');
      writeFileSync(resolve(projectRoot, 'output', 'candidate-main.png'), 'shot');
      writeFileSync(resolve(projectRoot, 'specs', 'changes', changeId, 'reference_surface_lock.json'), JSON.stringify({
        reference_surface_lock: {
          status: 'locked',
          primary_reference_surface: 'primary_workspace',
        },
      }, null, 2));
      writeFileSync(resolve(projectRoot, 'specs', 'changes', changeId, 'reconstruction_pack.json'), JSON.stringify({
        reconstruction_pack: {
          status: 'ready',
          primary_reference_surface: 'primary_workspace',
          surface_map: [{ surface_id: 'primary_workspace' }],
          layout_map: {
            regions: [{ id: 'main' }, { id: 'detail' }],
            anchors: [{ id: 'main_to_detail' }],
          },
          component_inventory: [
            { id: 'main_list', family: 'list', role: 'main', required_states: ['default', 'selected'] },
            { id: 'detail_panel', family: 'detail', role: 'detail', required_states: ['open'] },
          ],
          component_blueprint: [
            { id: 'main_list_row', module: 'main', primitive_role: 'list_row', hierarchy_role: 'primary', density_tier: 'dense', geometry_profile: 'row_compact', token_profile: 'list_tokens', stage_bucket: 'primary_focus', token_hints: { typography_role: 'body', spacing_role: 'row_gap', emphasis_role: 'selected' } },
            { id: 'detail_header', module: 'detail', primitive_role: 'section_header', hierarchy_role: 'supporting', density_tier: 'compact', geometry_profile: 'detail_stack', token_profile: 'detail_tokens', stage_bucket: 'secondary_focus', token_hints: { typography_role: 'heading', spacing_role: 'section_gap', emphasis_role: 'secondary' } },
          ],
          state_inventory: [{ id: 'selected', semantic_state: 'selected_item', target_components: ['main_list_row'] }],
          visual_token_map: { anti_drift_rules: ['avoid generic dashboard spacing'] },
        },
      }, null, 2));

      const generated = await generationContract({
        visual_generation_model: 'gpt-image-v2',
      }, { projectRoot, changeId });
      assert.equal(generated.ok, true);
      const generatedContract = JSON.parse(readFileSync(resolve(projectRoot, 'specs', 'changes', changeId, 'generation_contract.json'), 'utf8')).generation_contract;
      assert.equal(generatedContract.visual_constraints.aesthetic_standard.level, 'high');
      assert.equal(generatedContract.visual_constraints.image_reference_generation.model_capability, 'gpt-image-v2');
      assert.equal(generatedContract.visual_constraints.pencil_role_boundary.sufficient_alone_for_high_aesthetic, false);
      assert.equal(generatedContract.visual_constraints.design_system_pack.required_artifact, 'design_system_pack.json');
      const designSystemPack = JSON.parse(readFileSync(resolve(projectRoot, 'specs', 'changes', changeId, 'design_system_pack.json'), 'utf8'));
      assert.equal(designSystemPack.status, 'ready');
      assert.deepEqual(
        designSystemPack.practice_sources.map((source) => source.id).sort(),
        ['lovable', 'open_codesign', 'open_design', 'openui'],
      );
      assert.ok(designSystemPack.component_policy.required_states.includes('loading'));

      writeFileSync(resolve(projectRoot, 'specs', 'changes', changeId, 'visual_benchmark.json'), JSON.stringify({
        benchmark_mode: 'reference_backed',
        benchmark_input_mode: 'reference_scenarios',
        scenarios: [
          {
            id: 'desktop-main',
            capture_url: 'http://127.0.0.1:4173/',
            reference_image: 'refs/competitor-main.png',
            screenshot_image: 'output/candidate-main.png',
            status: 'pass',
            screenshot_evidence_mode: 'captured_page',
            layout_observations: {
              dom_rects: [
                { panel_id: 'main', selector: '[data-panel=main]', left: 0, top: 0, width: 1200, height: 800 },
              ],
            },
            observed_visual_tokens: {
              panel_count: 1,
            },
          },
        ],
      }, null, 2));
      writeFileSync(resolve(projectRoot, 'specs', 'changes', changeId, 'llm_design_review.json'), JSON.stringify({
        benchmark_summary: {
          needs_follow_up_count: 0,
        },
      }, null, 2));

      const missingReferenceReview = await visualAestheticReview({}, { projectRoot, changeId });
      assert.equal(missingReferenceReview.ok, false);
      assert.equal(missingReferenceReview.status, 'needs_refine');
      assert.ok(missingReferenceReview.blockers.includes('image_reference_outputs_materialized'));

      const direction = await visualDirectionSynthesis({}, { projectRoot, changeId });
      assert.equal(direction.ok, true);
      const imageReferenceSet = JSON.parse(readFileSync(resolve(projectRoot, 'specs', 'changes', changeId, 'image_reference_set.json'), 'utf8'));
      assert.equal(imageReferenceSet.status, 'ready');
      assert.deepEqual(
        imageReferenceSet.references.map((reference) => reference.id).sort(),
        ['component_density_sheet', 'primary_surface_reference_frame', 'state_polish_sheet'],
      );
      for (const reference of imageReferenceSet.references) {
        assert.equal(existsSync(resolve(projectRoot, reference.artifact_path)), true);
      }

      const review = await visualAestheticReview({}, { projectRoot, changeId });
      assert.equal(review.ok, true);
      assert.equal(review.status, 'accept');
      assert.ok(review.score >= 0.88);
      const artifact = JSON.parse(readFileSync(resolve(projectRoot, 'specs', 'changes', changeId, 'aesthetic_review.json'), 'utf8'));
      assert.equal(artifact.capability_positioning.pencil, 'editable assembly and targeted refinement');
      assert.equal(artifact.capability_positioning.image_generation, 'gpt-image-v2');
      assert.equal(artifact.design_system_evidence.ready, true);
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('aesthetic review rejects benchmark scenarios without captured product surface evidence', async () => {
    const projectRoot = makeProjectRoot();
    const changeId = 'chg-aesthetic-product-evidence';
    try {
      mkdirSync(resolve(projectRoot, 'specs', 'changes', changeId), { recursive: true });
      mkdirSync(resolve(projectRoot, 'refs'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'output'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'refs', 'target.png'), 'reference');
      writeFileSync(resolve(projectRoot, 'output', 'candidate.png'), 'candidate');
      writeFileSync(resolve(projectRoot, 'specs', 'changes', changeId, 'generation_contract.json'), JSON.stringify({
        generation_contract: {
          visual_constraints: {
            aesthetic_standard: {
              level: 'high',
              min_accept_score: 0.88,
              dimensions: [
                'composition_balance',
                'information_hierarchy',
                'typography_rhythm',
                'color_material_control',
                'density_and_spacing',
                'interaction_state_polish',
              ],
            },
            image_reference_generation: {
              enabled: true,
              model_capability: 'gpt-image-v2',
              required_outputs: [
                { id: 'primary_surface_reference_frame' },
                { id: 'component_density_sheet' },
                { id: 'state_polish_sheet' },
              ],
            },
            pencil_role_boundary: {
              role: 'editable assembly',
              sufficient_alone_for_high_aesthetic: false,
            },
          },
        },
      }, null, 2));
      writeFileSync(resolve(projectRoot, 'specs', 'changes', changeId, 'image_reference_set.json'), JSON.stringify({
        status: 'ready',
        references: [
          { id: 'primary_surface_reference_frame', status: 'ready', artifact_path: `specs/changes/${changeId}/primary.md` },
          { id: 'component_density_sheet', status: 'ready', artifact_path: `specs/changes/${changeId}/density.md` },
          { id: 'state_polish_sheet', status: 'ready', artifact_path: `specs/changes/${changeId}/state.md` },
        ],
      }, null, 2));
      writeFileSync(resolve(projectRoot, 'specs', 'changes', changeId, 'primary.md'), 'primary');
      writeFileSync(resolve(projectRoot, 'specs', 'changes', changeId, 'density.md'), 'density');
      writeFileSync(resolve(projectRoot, 'specs', 'changes', changeId, 'state.md'), 'state');
      writeFileSync(resolve(projectRoot, 'specs', 'changes', changeId, 'design_system_pack.json'), JSON.stringify({
        status: 'ready',
        practice_sources: [
          { id: 'lovable' },
          { id: 'open_design' },
          { id: 'open_codesign' },
          { id: 'openui' },
        ],
        component_policy: {
          required_states: ['default', 'hover', 'focus', 'selected', 'loading', 'empty', 'error'],
          allowed_primitives: ['button', 'input', 'tab', 'panel', 'list', 'chart'],
        },
        preview_loop: {
          required_artifacts: ['image_reference_set.json', 'visual_benchmark.json', 'aesthetic_review.json'],
        },
      }, null, 2));
      writeFileSync(resolve(projectRoot, 'specs', 'changes', changeId, 'visual_benchmark.json'), JSON.stringify({
        benchmark_mode: 'reference_backed',
        benchmark_input_mode: 'reference_scenarios',
        scenarios: [
          {
            id: 'static-candidate',
            reference_image: 'refs/target.png',
            screenshot_image: 'output/candidate.png',
            status: 'pass',
          },
        ],
      }, null, 2));
      writeFileSync(resolve(projectRoot, 'specs', 'changes', changeId, 'llm_design_review.json'), JSON.stringify({
        benchmark_summary: { needs_follow_up_count: 0 },
      }, null, 2));

      const review = await visualAestheticReview({}, { projectRoot, changeId });
      assert.equal(review.ok, false);
      assert.equal(review.status, 'needs_refine');
      assert.ok(review.blockers.includes('final_product_surface_captured'));
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('visual benchmark stays in follow-up mode until reference scenarios are supplied', async () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'specs', 'changes', 'chg-benchmark-placeholder'), { recursive: true });
      const result = await visualBenchmark({}, {
        projectRoot,
        changeId: 'chg-benchmark-placeholder',
      });

      assert.equal(result.ok, true);
      assert.equal(result.status, 'needs_follow_up');
      const benchmark = JSON.parse(readFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-benchmark-placeholder', 'visual_benchmark.json'), 'utf8'));
      assert.equal(benchmark.benchmark_mode, 'placeholder');
      assert.equal(benchmark.scenarios[0].status, 'needs_follow_up');
      assert.equal(benchmark.scenarios[0].blocker, 'reference_screenshot_required');
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('visual benchmark seeds layout and token contracts from generation_contract when scenarios omit them', async () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'specs', 'changes', 'chg-benchmark-generation-defaults'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'refs'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'output'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'refs', 'competitor-main.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#ffffff"/></svg>');
      writeFileSync(resolve(projectRoot, 'output', 'candidate-main.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#ffffff"/></svg>');
      writeFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-benchmark-generation-defaults', 'generation_contract.json'), JSON.stringify({
        generation_contract: {
          status: 'ready',
          layout_constraints: { required_regions: ['sidebar', 'main', 'detail'] },
          visual_constraints: {
            token_contract: {
              color_roles: { surface: '#ffffff' },
            },
          },
        },
      }, null, 2));

      const result = await visualBenchmark({
        competitor_product: 'CompetitorX',
        required_modules: ['sidebar', 'main', 'detail'],
        reference_scenarios_json: JSON.stringify([
          {
            id: 'desktop-main',
            viewport: { width: 80, height: 80 },
            reference_image: 'refs/competitor-main.svg',
            screenshot_image: 'output/candidate-main.svg',
            diff_metrics: { structural_similarity: 1, layout_shift_score: 0, pixel_diff_ratio: 0 },
            layout_observations: {
              dom_rects: [
                { panel_id: 'sidebar', left: 0, top: 0, width: 20, height: 80 },
                { panel_id: 'main', left: 20, top: 0, width: 40, height: 80 },
                { panel_id: 'detail', left: 60, top: 0, width: 20, height: 80 },
              ],
            },
            observed_visual_tokens: {
              color_roles: { surface: '#ffffff' },
            },
          },
        ]),
      }, {
        projectRoot,
        changeId: 'chg-benchmark-generation-defaults',
      });

      assert.equal(result.ok, true);
      const benchmark = JSON.parse(readFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-benchmark-generation-defaults', 'visual_benchmark.json'), 'utf8'));
      assert.equal(benchmark.scenarios[0].layout_contract.required_panels.join(','), 'sidebar,main,detail');
      assert.equal(benchmark.scenarios[0].visual_token_contract.color_roles.surface, '#ffffff');
      assert.ok(benchmark.scenarios[0].structure_checks.length > 0);
      assert.ok(benchmark.scenarios[0].token_checks.length > 0);
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('visual benchmark does not impose DOM-only generation defaults on screenshot-only scenarios', async () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'specs', 'changes', 'chg-benchmark-static-reference'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'refs'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'output'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'refs', 'main.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#ffffff"/></svg>');
      writeFileSync(resolve(projectRoot, 'output', 'main.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#ffffff"/></svg>');
      writeFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-benchmark-static-reference', 'generation_contract.json'), JSON.stringify({
        generation_contract: {
          status: 'ready',
          layout_constraints: { required_regions: ['left', 'main'] },
          visual_constraints: {
            token_contract: {
              color_roles: { surface: '#ffffff' },
              font_weights_required: [400],
            },
          },
        },
      }, null, 2));

      const result = await visualBenchmark({
        competitor_product: 'StaticRef',
        required_modules: ['left', 'main'],
        reference_scenarios_json: JSON.stringify([
          {
            id: 'desktop-main',
            viewport: { width: 80, height: 80 },
            reference_image: 'refs/main.svg',
            screenshot_image: 'output/main.svg',
            diff_metrics: { structural_similarity: 1, layout_shift_score: 0, pixel_diff_ratio: 0 },
            structure_checks: [{ id: 'static-reference-visible', status: 'pass' }],
          },
        ]),
      }, {
        projectRoot,
        changeId: 'chg-benchmark-static-reference',
      });

      assert.equal(result.ok, true);
      assert.equal(result.status, 'pass');
      const benchmark = JSON.parse(readFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-benchmark-static-reference', 'visual_benchmark.json'), 'utf8'));
      assert.equal(benchmark.scenarios[0].layout_contract, null);
      assert.equal(benchmark.scenarios[0].visual_token_contract, null);
      assert.deepEqual(benchmark.scenarios[0].blockers, []);
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('visual benchmark parses reference_scenarios_json and computes evidence-backed pass status', async () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'specs', 'changes', 'chg-benchmark-evaluated'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'refs'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'output'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'refs', 'ticktick-main.png'), 'ref');
      writeFileSync(resolve(projectRoot, 'output', 'ticktick-main.png'), 'shot');

      const result = await visualBenchmark({
        competitor_product: 'TickTick',
        required_modules: ['tasks', 'calendar', 'detail'],
        reference_scenarios_json: JSON.stringify([
          {
            id: 'desktop-main',
            viewport: { width: 1440, height: 900 },
            reference_image: 'refs/ticktick-main.png',
            screenshot_image: 'output/ticktick-main.png',
            diff_metrics: { structural_similarity: 0.94, layout_shift_score: 0.03 },
            structure_checks: [{ id: 'three-column-layout', status: 'pass' }],
          },
        ]),
      }, {
        projectRoot,
        changeId: 'chg-benchmark-evaluated',
      });

      assert.equal(result.ok, true);
      const benchmark = JSON.parse(readFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-benchmark-evaluated', 'visual_benchmark.json'), 'utf8'));
      assert.equal(benchmark.benchmark_mode, 'reference_backed');
      assert.equal(benchmark.benchmark_input_mode, 'reference_scenarios');
      assert.equal(benchmark.scenarios[0].status, 'pass');
      assert.equal(benchmark.scenarios[0].evidence.reference_image_exists, true);
      assert.equal(benchmark.scenarios[0].evidence.screenshot_image_exists, true);
      assert.equal(benchmark.scenarios[0].diff_metrics.status, 'pass');
      assert.deepEqual(benchmark.scenarios[0].blockers, []);
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('visual benchmark auto-computes diff metrics from reference and screenshot images when omitted', async () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'specs', 'changes', 'chg-benchmark-auto-diff'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'refs'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'output'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'refs', 'match.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#ffffff"/></svg>');
      writeFileSync(resolve(projectRoot, 'output', 'match.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#ffffff"/></svg>');

      const result = await visualBenchmark({
        competitor_product: 'CompetitorX',
        required_modules: ['workspace'],
        reference_scenarios_json: JSON.stringify([
          {
            id: 'desktop-main',
            viewport: { width: 1440, height: 900 },
            reference_image: 'refs/match.svg',
            screenshot_image: 'output/match.svg',
            structure_checks: [{ id: 'workspace-structure', status: 'pass' }],
          },
        ]),
      }, {
        projectRoot,
        changeId: 'chg-benchmark-auto-diff',
      });

      assert.equal(result.ok, true);
      const benchmark = JSON.parse(readFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-benchmark-auto-diff', 'visual_benchmark.json'), 'utf8'));
      assert.equal(benchmark.scenarios[0].diff_metrics.status, 'pass');
      assert.equal(benchmark.scenarios[0].diff_metrics.values.pixel_diff_ratio, 0);
      assert.equal(benchmark.scenarios[0].diff_metrics.values.layout_shift_score, 0);
      assert.equal(benchmark.scenarios[0].diff_metrics.values.structural_similarity > 0.99, true);
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('visual benchmark auto-captures page evidence from capture_url when reference scenarios are omitted', async () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'specs', 'changes', 'chg-benchmark-capture-url'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'refs'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'fixtures'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'refs', 'blank.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><rect width="800" height="400" fill="#ffffff"/></svg>');
      writeFileSync(resolve(projectRoot, 'fixtures', 'page.html'), `<!doctype html>
<html>
  <body style="margin:0;background:#fff;font-family:Inter, sans-serif;color:#111827;line-height:24px;letter-spacing:0px">
    <header data-panel="header" style="height:64px;background:#fff;line-height:24px"></header>
    <main data-panel="main" style="height:336px;background:#fff;line-height:28px"></main>
  </body>
</html>`);

      const result = await visualBenchmark({
        competitor_product: 'CompetitorX',
        required_modules: ['header', 'main'],
        capture_url: `file://${resolve(projectRoot, 'fixtures', 'page.html')}`,
        reference_image: 'refs/blank.svg',
        width: 800,
        height: 400,
        structure_checks: [{ id: 'captured-page-structure', status: 'pass' }],
      }, {
        projectRoot,
        changeId: 'chg-benchmark-capture-url',
      });

      assert.equal(result.ok, true);
      const benchmark = JSON.parse(readFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-benchmark-capture-url', 'visual_benchmark.json'), 'utf8'));
      assert.equal(benchmark.benchmark_mode, 'reference_backed');
      assert.equal(benchmark.benchmark_input_mode, 'capture_url');
      assert.equal(benchmark.scenarios[0].evidence.screenshot_image_exists, true);
      assert.equal(Array.isArray(benchmark.scenarios[0].layout_observations.dom_rects), true);
      assert.equal(Array.isArray(benchmark.scenarios[0].observed_visual_tokens.font_families), true);
      assert.equal(benchmark.scenarios[0].observed_visual_tokens.text_sizes.length > 0, true);
      assert.equal(benchmark.scenarios[0].observed_visual_tokens.line_heights.length > 0, true);
      assert.equal(benchmark.scenarios[0].observed_visual_tokens.icon_density_values.some((value) => value >= 0), true);
      assert.equal(Array.isArray(benchmark.scenarios[0].observed_visual_tokens.shadow_signatures), true);
      assert.equal(benchmark.scenarios[0].layout_observations.dom_rects.some((entry) => entry.panel_id === 'header'), true);
      assert.equal(benchmark.scenarios[0].diff_metrics.status, 'pass');
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('visual benchmark auto-generates structure checks from layout contract', async () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'specs', 'changes', 'chg-benchmark-layout-contract'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'refs'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'output'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'refs', 'ticktick-main.png'), 'ref');
      writeFileSync(resolve(projectRoot, 'output', 'ticktick-main.png'), 'shot');

      const result = await visualBenchmark({
        competitor_product: 'TickTick',
        required_modules: ['tasks', 'calendar', 'detail'],
        reference_scenarios_json: JSON.stringify([
          {
            id: 'desktop-main',
            viewport: { width: 1440, height: 900 },
            reference_image: 'refs/ticktick-main.png',
            screenshot_image: 'output/ticktick-main.png',
            diff_metrics: { structural_similarity: 0.94, layout_shift_score: 0.03 },
            layout_contract: {
              expected_columns: 3,
              required_panels: ['sidebar', 'main', 'detail'],
              min_sidebar_width: 220,
              min_main_width: 640,
              min_detail_width: 280,
            },
            observed_layout: {
              columns: [
                { id: 'sidebar', width: 264 },
                { id: 'main', width: 792 },
                { id: 'detail', width: 312 },
              ],
            },
          },
        ]),
      }, {
        projectRoot,
        changeId: 'chg-benchmark-layout-contract',
      });

      assert.equal(result.ok, true);
      const benchmark = JSON.parse(readFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-benchmark-layout-contract', 'visual_benchmark.json'), 'utf8'));
      const ids = benchmark.scenarios[0].structure_checks.map((check) => check.id);
      assert.ok(ids.includes('layout-column-count'));
      assert.ok(ids.includes('layout-panel-order'));
      assert.ok(ids.includes('layout-sidebar-width'));
      assert.ok(ids.includes('layout-main-width'));
      assert.ok(ids.includes('layout-detail-width'));
      assert.equal(benchmark.scenarios[0].structure_checks.every((check) => check.status === 'pass'), true);
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('visual benchmark derives observed layout from raw layout observations', async () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'specs', 'changes', 'chg-benchmark-layout-observations'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'refs'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'output'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'refs', 'competitor-main.png'), 'ref');
      writeFileSync(resolve(projectRoot, 'output', 'competitor-main.png'), 'shot');

      const result = await visualBenchmark({
        competitor_product: 'CompetitorX',
        required_modules: ['navigation', 'workspace', 'detail'],
        reference_scenarios_json: JSON.stringify([
          {
            id: 'desktop-main',
            viewport: { width: 1440, height: 900 },
            reference_image: 'refs/competitor-main.png',
            screenshot_image: 'output/competitor-main.png',
            diff_metrics: { structural_similarity: 0.95, layout_shift_score: 0.02 },
            layout_contract: {
              expected_columns: 3,
              required_panels: ['sidebar', 'main', 'detail'],
              min_sidebar_width: 220,
              min_main_width: 640,
              min_detail_width: 280,
            },
            layout_observations: {
              panels: [
                { id: 'detail', x: 1116, width: 324, height: 900 },
                { id: 'sidebar', x: 0, width: 264, height: 900 },
                { id: 'main', x: 264, width: 852, height: 900 },
              ],
            },
          },
        ]),
      }, {
        projectRoot,
        changeId: 'chg-benchmark-layout-observations',
      });

      assert.equal(result.ok, true);
      const benchmark = JSON.parse(readFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-benchmark-layout-observations', 'visual_benchmark.json'), 'utf8'));
      assert.deepEqual(benchmark.scenarios[0].observed_layout, {
        columns: [
          { id: 'sidebar', width: 264 },
          { id: 'main', width: 852 },
          { id: 'detail', width: 324 },
        ],
      });
      assert.equal(benchmark.scenarios[0].structure_checks.every((check) => check.status === 'pass'), true);
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('visual benchmark auto-generates anchor relation checks from observed panels', async () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'specs', 'changes', 'chg-benchmark-anchor-relations'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'refs'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'output'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'refs', 'competitor-main.png'), 'ref');
      writeFileSync(resolve(projectRoot, 'output', 'competitor-main.png'), 'shot');

      const result = await visualBenchmark({
        competitor_product: 'CompetitorX',
        required_modules: ['navigation', 'workspace', 'detail'],
        reference_scenarios_json: JSON.stringify([
          {
            id: 'desktop-main',
            viewport: { width: 1440, height: 900 },
            reference_image: 'refs/competitor-main.png',
            screenshot_image: 'output/competitor-main.png',
            diff_metrics: { structural_similarity: 0.95, layout_shift_score: 0.02 },
            layout_contract: {
              expected_columns: 3,
              required_panels: ['sidebar', 'main', 'detail'],
              anchor_relations: [
                { id: 'sidebar-left-of-main', from: 'sidebar', to: 'main', relation: 'left_of', gap_max: 0 },
                { id: 'detail-right-of-main', from: 'detail', to: 'main', relation: 'right_of', gap_max: 0 },
                { id: 'sidebar-aligned-top-main', from: 'sidebar', to: 'main', relation: 'aligned_top', tolerance: 0 },
              ],
            },
            layout_observations: {
              panels: [
                { id: 'sidebar', x: 0, y: 0, width: 264, height: 900 },
                { id: 'main', x: 264, y: 0, width: 852, height: 900 },
                { id: 'detail', x: 1116, y: 0, width: 324, height: 900 },
              ],
            },
          },
        ]),
      }, {
        projectRoot,
        changeId: 'chg-benchmark-anchor-relations',
      });

      assert.equal(result.ok, true);
      const benchmark = JSON.parse(readFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-benchmark-anchor-relations', 'visual_benchmark.json'), 'utf8'));
      const checks = benchmark.scenarios[0].structure_checks;
      assert.ok(checks.some((check) => check.id === 'sidebar-left-of-main' && check.status === 'pass'));
      assert.ok(checks.some((check) => check.id === 'detail-right-of-main' && check.status === 'pass'));
      assert.ok(checks.some((check) => check.id === 'sidebar-aligned-top-main' && check.status === 'pass'));
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('visual benchmark derives observed panels from raw regions and expands workspace patterns', async () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'specs', 'changes', 'chg-benchmark-pattern-regions'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'refs'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'output'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'refs', 'competitor-workspace.png'), 'ref');
      writeFileSync(resolve(projectRoot, 'output', 'competitor-workspace.png'), 'shot');

      const result = await visualBenchmark({
        competitor_product: 'CompetitorX',
        required_modules: ['navigation', 'workspace', 'detail', 'toolbar'],
        reference_scenarios_json: JSON.stringify([
          {
            id: 'desktop-workspace',
            viewport: { width: 1440, height: 900 },
            reference_image: 'refs/competitor-workspace.png',
            screenshot_image: 'output/competitor-workspace.png',
            diff_metrics: { structural_similarity: 0.96, layout_shift_score: 0.02 },
            layout_contract: {
              workspace_patterns: ['sidebar_docked_left', 'detail_docked_right', 'toolbar_over_workspace'],
            },
            layout_observations: {
              regions: [
                { id: 'toolbar', left: 264, top: 0, right: 1116, bottom: 72 },
                { id: 'sidebar', left: 0, top: 72, right: 264, bottom: 900 },
                { id: 'main', left: 264, top: 72, right: 1116, bottom: 900 },
                { id: 'detail', left: 1116, top: 72, right: 1440, bottom: 900 },
              ],
            },
          },
        ]),
      }, {
        projectRoot,
        changeId: 'chg-benchmark-pattern-regions',
      });

      assert.equal(result.ok, true);
      const benchmark = JSON.parse(readFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-benchmark-pattern-regions', 'visual_benchmark.json'), 'utf8'));
      const checks = benchmark.scenarios[0].structure_checks;
      assert.deepEqual(benchmark.scenarios[0].observed_layout, {
        columns: [
          { id: 'sidebar', width: 264 },
          { id: 'main', width: 852 },
          { id: 'detail', width: 324 },
        ],
      });
      assert.ok(checks.some((check) => check.id === 'pattern-sidebar-left-of-main' && check.status === 'pass'));
      assert.ok(checks.some((check) => check.id === 'pattern-detail-right-of-main' && check.status === 'pass'));
      assert.ok(checks.some((check) => check.id === 'pattern-toolbar-above-main' && check.status === 'pass'));
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('visual benchmark derives observed panels from dom_rects and expands list-detail workspace patterns', async () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'specs', 'changes', 'chg-benchmark-dom-rects'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'refs'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'output'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'refs', 'competitor-list-detail.png'), 'ref');
      writeFileSync(resolve(projectRoot, 'output', 'competitor-list-detail.png'), 'shot');

      const result = await visualBenchmark({
        competitor_product: 'CompetitorX',
        required_modules: ['header', 'filters', 'list', 'detail'],
        reference_scenarios_json: JSON.stringify([
          {
            id: 'desktop-list-detail',
            viewport: { width: 1440, height: 900 },
            reference_image: 'refs/competitor-list-detail.png',
            screenshot_image: 'output/competitor-list-detail.png',
            diff_metrics: { structural_similarity: 0.95, layout_shift_score: 0.02 },
            layout_contract: {
              workspace_patterns: ['header_with_split_workspace', 'filters_above_list', 'list_detail_master_detail'],
            },
            layout_observations: {
              dom_rects: [
                { panel_id: 'header', selector: '[data-panel=\"header\"]', left: 0, top: 0, width: 1440, height: 64 },
                { panel_id: 'filters', selector: '[data-panel=\"filters\"]', left: 0, top: 64, width: 920, height: 56 },
                { panel_id: 'sidebar', selector: '[data-panel=\"sidebar\"]', left: 0, top: 64, width: 280, height: 836 },
                { panel_id: 'list', selector: '[data-panel=\"list\"]', left: 0, top: 120, width: 920, height: 780 },
                { panel_id: 'main', selector: '[data-panel=\"main\"]', left: 0, top: 120, width: 920, height: 780 },
                { panel_id: 'detail', selector: '[data-panel=\"detail\"]', left: 920, top: 120, width: 520, height: 780 },
              ],
            },
          },
        ]),
      }, {
        projectRoot,
        changeId: 'chg-benchmark-dom-rects',
      });

      assert.equal(result.ok, true);
      const benchmark = JSON.parse(readFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-benchmark-dom-rects', 'visual_benchmark.json'), 'utf8'));
      const checks = benchmark.scenarios[0].structure_checks;
      assert.ok(checks.some((check) => check.id === 'pattern-header-above-main' && check.status === 'pass'));
      assert.ok(checks.some((check) => check.id === 'pattern-filters-above-list' && check.status === 'pass'));
      assert.ok(checks.some((check) => check.id === 'pattern-list-left-of-detail' && check.status === 'pass'));
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('visual benchmark evaluates visual token contracts against observed token evidence', async () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'specs', 'changes', 'chg-benchmark-visual-tokens'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'refs'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'output'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'refs', 'competitor-main.png'), 'ref');
      writeFileSync(resolve(projectRoot, 'output', 'competitor-main.png'), 'shot');

      const result = await visualBenchmark({
        competitor_product: 'CompetitorX',
        required_modules: ['workspace'],
        reference_scenarios_json: JSON.stringify([
          {
            id: 'desktop-main',
            viewport: { width: 1440, height: 900 },
            reference_image: 'refs/competitor-main.png',
            screenshot_image: 'output/competitor-main.png',
            diff_metrics: { structural_similarity: 0.96, layout_shift_score: 0.02, pixel_diff_ratio: 0.04 },
            structure_checks: [{ id: 'workspace-shell', status: 'pass' }],
            visual_token_contract: {
              font_families_required: ['Inter', 'SF Pro Display'],
              font_weights_required: [400, 600],
              text_size_range: { min: 12, max: 32 },
              icon_density_range: { min: 0, max: 2 },
              icon_size_range: { min: 16, max: 20 },
              line_height_range: { min: 20, max: 36 },
              letter_spacing_range: { min: 0, max: 0.5 },
              radius_range: { min: 0, max: 12 },
              border_width_range: { min: 0, max: 1 },
              border_styles_required: ['solid'],
              border_weight_tiers_required: ['hairline'],
              color_roles: {
                canvas: '#f7f8fa',
                accent: '#4f7cff',
              },
              shadow_signatures_required: ['0px 12px 32px rgba(15, 23, 42, 0.12)'],
              shadow_strength_tiers_required: ['strong'],
              spacing_scale: {
                base: 4,
                allowed_multipliers: [2, 3, 4, 6],
                tolerance: 0.5,
              },
            },
            observed_visual_tokens: {
              font_families: ['Inter', 'SF Pro Display', 'PingFang SC'],
              font_weights: [400, 500, 600],
              text_sizes: [12, 14, 16, 24, 32],
              icon_density_values: [0.4, 1.2],
              icon_size_values: [16, 20],
              line_heights: [20, 24, 32, 36],
              letter_spacings: [0, 0.2],
              radius_values: [0, 8, 12],
              border_widths: [0, 1],
              border_styles: ['solid'],
              border_weight_tiers: ['hairline'],
              color_roles: {
                canvas: '#f7f8fa',
                accent: '#4f7cff',
              },
              shadow_signatures: ['0px 12px 32px rgba(15, 23, 42, 0.12)'],
              shadow_strength_tiers: ['strong'],
              spacing_values: [8, 12, 16, 24],
            },
          },
        ]),
      }, {
        projectRoot,
        changeId: 'chg-benchmark-visual-tokens',
      });

      assert.equal(result.ok, true);
      const benchmark = JSON.parse(readFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-benchmark-visual-tokens', 'visual_benchmark.json'), 'utf8'));
      const checks = benchmark.scenarios[0].token_checks;
      assert.ok(checks.some((check) => check.id === 'token-font-families' && check.status === 'pass'));
      assert.ok(checks.some((check) => check.id === 'token-font-weights' && check.status === 'pass'));
      assert.ok(checks.some((check) => check.id === 'token-text-size-range' && check.status === 'pass'));
      assert.ok(checks.some((check) => check.id === 'token-icon-density-range' && check.status === 'pass'));
      assert.ok(checks.some((check) => check.id === 'token-icon-size-range' && check.status === 'pass'));
      assert.ok(checks.some((check) => check.id === 'token-line-height-range' && check.status === 'pass'));
      assert.ok(checks.some((check) => check.id === 'token-letter-spacing-range' && check.status === 'pass'));
      assert.ok(checks.some((check) => check.id === 'token-radius-range' && check.status === 'pass'));
      assert.ok(checks.some((check) => check.id === 'token-border-width-range' && check.status === 'pass'));
      assert.ok(checks.some((check) => check.id === 'token-border-styles' && check.status === 'pass'));
      assert.ok(checks.some((check) => check.id === 'token-border-weight-tiers' && check.status === 'pass'));
      assert.ok(checks.some((check) => check.id === 'token-color-roles' && check.status === 'pass'));
      assert.ok(checks.some((check) => check.id === 'token-shadow-signatures' && check.status === 'pass'));
      assert.ok(checks.some((check) => check.id === 'token-shadow-strength-tiers' && check.status === 'pass'));
      assert.ok(checks.some((check) => check.id === 'token-spacing-scale' && check.status === 'pass'));
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('visual benchmark persists multi-state capture evidence for capture_url scenarios', async () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'specs', 'changes', 'chg-benchmark-capture-states'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'refs'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'fixtures'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'refs', 'blank.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><rect width="800" height="400" fill="#ffffff"/></svg>');
      writeFileSync(resolve(projectRoot, 'fixtures', 'states.html'), `<!doctype html>
<html>
  <body style="margin:0;background:#fff;font-family:Inter,sans-serif">
    <main data-panel="main" style="height:400px;padding:20px;background:#fff">
      <button id="open" data-panel="toolbar" style="display:flex;gap:8px;align-items:center;padding:10px 14px;border:1px solid #d1d5db;border-radius:10px;background:#fff;box-shadow:0 1px 2px rgba(15,23,42,0.08)">
        <svg data-icon viewBox="0 0 16 16" width="16" height="16"><circle cx="8" cy="8" r="6" fill="#4f46e5"></circle></svg>
        <span>Open</span>
      </button>
      <section id="detail" data-panel="detail" style="display:none;margin-top:16px;height:160px;border:1px solid #e5e7eb;border-radius:12px;background:#fff;box-shadow:0 10px 24px rgba(15,23,42,0.14)"></section>
    </main>
    <script>
      document.getElementById('open').addEventListener('click', () => {
        document.getElementById('detail').style.display = 'block';
      });
    </script>
  </body>
</html>`);

      const result = await visualBenchmark({
        competitor_product: 'CompetitorX',
        required_modules: ['main', 'toolbar', 'detail'],
        capture_url: `file://${resolve(projectRoot, 'fixtures', 'states.html')}`,
        reference_image: 'refs/blank.svg',
        width: 800,
        height: 400,
        structure_checks: [{ id: 'captured-page-structure', status: 'pass' }],
        capture_states_json: JSON.stringify([
          { id: 'hover-open', hover_selector: '#open', wait_ms: 60 },
          { id: 'detail-open', click_selector: '#open', wait_ms: 60 },
        ]),
      }, {
        projectRoot,
        changeId: 'chg-benchmark-capture-states',
      });

      assert.equal(result.ok, true);
      const benchmark = JSON.parse(readFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-benchmark-capture-states', 'visual_benchmark.json'), 'utf8'));
      assert.equal(Array.isArray(benchmark.scenarios[0].state_evidence), true);
      assert.equal(benchmark.scenarios[0].state_evidence.length, 2);
      assert.ok(benchmark.scenarios[0].state_evidence.some((state) => state.id === 'detail-open'));
      assert.ok(Array.isArray(benchmark.scenarios[0].state_transition_checks));
      assert.ok(benchmark.scenarios[0].state_transition_checks.every((check) => check.status === 'pass'));
      assert.ok(benchmark.scenarios[0].observed_visual_tokens.icon_size_values.includes(16));
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('visual benchmark can auto-discover candidate states and enforce alignment rhythm', async () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'specs', 'changes', 'chg-benchmark-auto-states-grid'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'refs'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'fixtures'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'refs', 'blank.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><rect width="800" height="400" fill="#ffffff"/></svg>');
      writeFileSync(resolve(projectRoot, 'fixtures', 'grid.html'), `<!doctype html>
<html>
  <body style="margin:0;background:#fff;font-family:Inter,sans-serif">
    <aside data-panel="sidebar" style="position:absolute;left:0;top:0;width:240px;height:400px;background:#fff"></aside>
    <main data-panel="main" style="position:absolute;left:240px;top:0;width:560px;height:400px;background:#fff;padding:24px">
      <button id="toggle" data-panel="toolbar" aria-controls="detail" style="display:flex;gap:8px;align-items:center;padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;background:#fff">
        <svg data-icon viewBox="0 0 16 16" width="16" height="16"><circle cx="8" cy="8" r="6" fill="#4f46e5"></circle></svg>
        <span>Open detail</span>
      </button>
      <section id="detail" data-panel="detail" style="display:none;position:absolute;left:480px;top:24px;width:280px;height:200px;border:1px solid #e5e7eb;border-radius:12px;background:#fff"></section>
    </main>
    <script>
      document.getElementById('toggle').addEventListener('click', () => {
        document.getElementById('detail').style.display = 'block';
      });
    </script>
  </body>
</html>`);

      const result = await visualBenchmark({
        competitor_product: 'CompetitorX',
        required_modules: ['sidebar', 'main', 'detail', 'toolbar'],
        capture_url: `file://${resolve(projectRoot, 'fixtures', 'grid.html')}`,
        reference_image: 'refs/blank.svg',
        width: 800,
        height: 400,
        auto_discover_states: true,
        state_limit: 2,
        layout_contract: JSON.stringify({
          alignment_grid_step: 8,
          alignment_grid_tolerance: 0.5,
          alignment_grid_panels: ['sidebar', 'main', 'detail'],
        }),
        structure_checks: [{ id: 'captured-page-structure', status: 'pass' }],
      }, {
        projectRoot,
        changeId: 'chg-benchmark-auto-states-grid',
      });

      assert.equal(result.ok, true);
      const benchmark = JSON.parse(readFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-benchmark-auto-states-grid', 'visual_benchmark.json'), 'utf8'));
      assert.ok(benchmark.scenarios[0].state_evidence.length > 0);
      assert.ok(benchmark.scenarios[0].state_evidence.every((state) => typeof state.priority_score === 'number'));
      assert.ok(benchmark.scenarios[0].state_evidence.every((state) => typeof state.priority_reason === 'string'));
      assert.ok(benchmark.scenarios[0].state_evidence.some((state) => state.workbench_state_type === 'detail_open'));
      assert.ok(benchmark.scenarios[0].state_transition_checks.every((check) => check.status === 'pass'));
      assert.ok(benchmark.scenarios[0].structure_checks.some((check) => check.id === 'layout-grid-alignment-sidebar' && check.status === 'pass'));
      assert.ok(benchmark.scenarios[0].structure_checks.some((check) => check.id === 'layout-grid-alignment-main' && check.status === 'pass'));
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('visual benchmark compares state screenshots against reference state images when provided', async () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'specs', 'changes', 'chg-benchmark-reference-states'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'refs'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'output'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'refs', 'base.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#ffffff"/></svg>');
      writeFileSync(resolve(projectRoot, 'refs', 'detail-open.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#ffffff"/><rect x="20" y="20" width="40" height="40" rx="8" fill="#4f46e5"/></svg>');
      writeFileSync(resolve(projectRoot, 'output', 'base.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#ffffff"/></svg>');
      writeFileSync(resolve(projectRoot, 'output', 'detail-open.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#ffffff"/><rect x="20" y="20" width="40" height="40" rx="8" fill="#4f46e5"/></svg>');

      const result = await visualBenchmark({
        competitor_product: 'CompetitorX',
        required_modules: ['workspace', 'detail'],
        reference_scenarios_json: JSON.stringify([
          {
            id: 'desktop-main',
            viewport: { width: 80, height: 80 },
            reference_image: 'refs/base.svg',
            screenshot_image: 'output/base.svg',
            diff_metrics: { structural_similarity: 1, layout_shift_score: 0, pixel_diff_ratio: 0 },
            structure_checks: [{ id: 'workspace-shell', status: 'pass' }],
            state_evidence: [
              {
                id: 'detail-open',
                screenshot_image: 'output/detail-open.svg',
                reference_image: 'refs/detail-open.svg',
                nodes_captured: 2,
                expect_visual_change: true,
                min_pixel_diff_ratio: 0.002,
              },
            ],
          },
        ]),
      }, {
        projectRoot,
        changeId: 'chg-benchmark-reference-states',
      });

      assert.equal(result.ok, true);
      const benchmark = JSON.parse(readFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-benchmark-reference-states', 'visual_benchmark.json'), 'utf8'));
      assert.ok(benchmark.scenarios[0].state_transition_checks.some((check) => check.id === 'state-transition-detail-open' && check.status === 'pass'));
      assert.ok(benchmark.scenarios[0].state_transition_checks.some((check) => check.compared_to === 'reference_state'));
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('visual benchmark evaluates component rhythm tokens for list rows, toolbar density, and detail spacing', async () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'specs', 'changes', 'chg-benchmark-component-rhythm'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'refs'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'output'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'refs', 'competitor-main.png'), 'ref');
      writeFileSync(resolve(projectRoot, 'output', 'competitor-main.png'), 'shot');

      const result = await visualBenchmark({
        competitor_product: 'CompetitorX',
        required_modules: ['toolbar', 'list', 'detail'],
        reference_scenarios_json: JSON.stringify([
          {
            id: 'desktop-main',
            viewport: { width: 1440, height: 900 },
            reference_image: 'refs/competitor-main.png',
            screenshot_image: 'output/competitor-main.png',
            diff_metrics: { structural_similarity: 0.96, layout_shift_score: 0.02, pixel_diff_ratio: 0.04 },
            structure_checks: [{ id: 'workspace-shell', status: 'pass' }],
            visual_token_contract: {
              min_touch_target_size: 44,
              list_row_height_range: { min: 44, max: 56 },
              toolbar_control_density_range: { min: 0.03, max: 0.25 },
              detail_block_spacing_scale: {
                base: 8,
                allowed_multipliers: [1, 2, 3],
                tolerance: 0.5,
              },
              component_family_consistency: {
                toolbar_controls: {
                  max_text_size_delta: 2,
                  max_radius_delta: 4,
                },
                list_rows: {
                  max_line_height_delta: 4,
                },
                detail_blocks: {
                  max_border_width_delta: 1,
                },
              },
            },
            observed_visual_tokens: {
              touch_target_sizes: [44, 48, 52],
              list_row_heights: [44, 48, 52],
              toolbar_control_density_values: [0.08, 0.12],
              detail_block_spacing_values: [8, 16, 24],
              component_family_consistency: {
                toolbar_controls: {
                  text_sizes: [14, 16],
                  radius_values: [8, 10],
                },
                list_rows: {
                  line_heights: [20, 24],
                },
                detail_blocks: {
                  border_widths: [0, 1],
                },
              },
            },
          },
        ]),
      }, {
        projectRoot,
        changeId: 'chg-benchmark-component-rhythm',
      });

      assert.equal(result.ok, true);
      const benchmark = JSON.parse(readFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-benchmark-component-rhythm', 'visual_benchmark.json'), 'utf8'));
      const checks = benchmark.scenarios[0].token_checks;
      assert.ok(checks.some((check) => check.id === 'token-min-touch-target-size' && check.status === 'pass'));
      assert.ok(checks.some((check) => check.id === 'token-list-row-height-range' && check.status === 'pass'));
      assert.ok(checks.some((check) => check.id === 'token-toolbar-control-density-range' && check.status === 'pass'));
      assert.ok(checks.some((check) => check.id === 'token-detail-block-spacing-scale' && check.status === 'pass'));
      assert.ok(checks.some((check) => check.id === 'token-family-toolbar_controls-text-size-consistency' && check.status === 'pass'));
      assert.ok(checks.some((check) => check.id === 'token-family-list_rows-line-height-consistency' && check.status === 'pass'));
      assert.ok(checks.some((check) => check.id === 'token-family-detail_blocks-border-width-consistency' && check.status === 'pass'));
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('visual benchmark supports mobile layout patterns such as compact top nav and bottom tabbar', async () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'specs', 'changes', 'chg-benchmark-mobile-layout'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'refs'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'output'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'refs', 'mobile-main.png'), 'ref');
      writeFileSync(resolve(projectRoot, 'output', 'mobile-main.png'), 'shot');

      const result = await visualBenchmark({
        competitor_product: 'CompetitorX',
        required_modules: ['header', 'main', 'bottom_bar'],
        reference_scenarios_json: JSON.stringify([
          {
            id: 'mobile-main',
            viewport: { width: 390, height: 844 },
            reference_image: 'refs/mobile-main.png',
            screenshot_image: 'output/mobile-main.png',
            diff_metrics: { structural_similarity: 0.97, layout_shift_score: 0.02, pixel_diff_ratio: 0.03 },
            layout_contract: {
              workspace_patterns: ['compact_top_nav', 'bottom_tabbar_docked'],
            },
            layout_observations: {
              dom_rects: [
                { panel_id: 'header', left: 0, top: 0, width: 390, height: 56 },
                { panel_id: 'main', left: 0, top: 56, width: 390, height: 708 },
                { panel_id: 'bottom_bar', left: 0, top: 764, width: 390, height: 80 },
              ],
            },
            structure_checks: [{ id: 'mobile-shell', status: 'pass' }],
          },
        ]),
      }, {
        projectRoot,
        changeId: 'chg-benchmark-mobile-layout',
      });

      assert.equal(result.ok, true);
      const benchmark = JSON.parse(readFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-benchmark-mobile-layout', 'visual_benchmark.json'), 'utf8'));
      const checks = benchmark.scenarios[0].structure_checks;
      assert.ok(checks.some((check) => check.id === 'pattern-compact-top-nav-above-main' && check.status === 'pass'));
      assert.ok(checks.some((check) => check.id === 'pattern-bottom-tabbar-below-main' && check.status === 'pass'));
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('visual benchmark enforces mobile safe area, keyboard clearance, thumb reach, and mobile state affordances', async () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'specs', 'changes', 'chg-benchmark-mobile-ergonomics'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'refs'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'output'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'refs', 'mobile-ergonomics.png'), 'ref');
      writeFileSync(resolve(projectRoot, 'output', 'mobile-ergonomics.png'), 'shot');

      const result = await visualBenchmark({
        competitor_product: 'CompetitorX',
        required_modules: ['header', 'main', 'bottom_bar', 'composer', 'primary_action', 'sheet'],
        reference_scenarios_json: JSON.stringify([
          {
            id: 'mobile-ergonomics',
            viewport: { width: 390, height: 844 },
            viewport_metrics: {
              safe_area_top: 47,
              safe_area_bottom: 34,
              keyboard_inset_bottom: 290,
            },
            reference_image: 'refs/mobile-ergonomics.png',
            screenshot_image: 'output/mobile-ergonomics.png',
            diff_metrics: { structural_similarity: 0.97, layout_shift_score: 0.02, pixel_diff_ratio: 0.03 },
            layout_contract: {
              safe_area_top_panels: ['header'],
              safe_area_bottom_panels: ['bottom_bar'],
              safe_area_tolerance: 4,
              keyboard_aware_panels: ['composer'],
              keyboard_clearance_min: 8,
              thumb_reach_primary_action_panels: ['primary_action'],
              thumb_reach_zone: { min_y_ratio: 0.55, max_y_ratio: 0.95 },
            },
            layout_observations: {
              dom_rects: [
                { panel_id: 'header', left: 0, top: 47, width: 390, height: 56 },
                { panel_id: 'main', left: 0, top: 103, width: 390, height: 561 },
                { panel_id: 'composer', left: 16, top: 500, width: 358, height: 46 },
                { panel_id: 'primary_action', left: 107, top: 680, width: 176, height: 52 },
                { panel_id: 'bottom_bar', left: 0, top: 730, width: 390, height: 80 },
                { panel_id: 'sheet', left: 0, top: 420, width: 390, height: 390 },
              ],
            },
            structure_checks: [{ id: 'mobile-shell', status: 'pass' }],
            visual_token_contract: {
              bottom_sheet_handle_required: true,
              tabbar_active_state_required: true,
              floating_primary_action_required: true,
              segmented_control_active_state_required: true,
              required_component_semantics: ['bottom_sheet', 'tab_bar', 'floating_primary_action', 'segmented_control', 'loading_state', 'skeleton_state', 'error_state', 'search_active'],
              required_platform_physics_profiles: ['ios_spring'],
            },
            observed_visual_tokens: {
              bottom_sheet_handle_present: true,
              tabbar_active_state_present: true,
              floating_primary_action_present: true,
              segmented_control_active_state_present: true,
              loading_state_present: true,
              skeleton_state_present: true,
              error_state_present: true,
              search_active_present: true,
              component_semantics: ['bottom_sheet', 'tab_bar', 'floating_primary_action', 'segmented_control', 'loading_state', 'skeleton_state', 'error_state', 'search_active'],
              platform_physics_profiles: ['ios_spring'],
            },
          },
        ]),
      }, {
        projectRoot,
        changeId: 'chg-benchmark-mobile-ergonomics',
      });

      assert.equal(result.ok, true);
      const benchmark = JSON.parse(readFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-benchmark-mobile-ergonomics', 'visual_benchmark.json'), 'utf8'));
      const structureChecks = benchmark.scenarios[0].structure_checks;
      const tokenChecks = benchmark.scenarios[0].token_checks;
      assert.ok(structureChecks.some((check) => check.id === 'layout-safe-area-top-header' && check.status === 'pass'));
      assert.ok(structureChecks.some((check) => check.id === 'layout-safe-area-bottom-bottom_bar' && check.status === 'pass'));
      assert.ok(structureChecks.some((check) => check.id === 'layout-keyboard-clearance-composer' && check.status === 'pass'));
      assert.ok(structureChecks.some((check) => check.id === 'layout-thumb-reach-primary_action' && check.status === 'pass'));
      assert.ok(tokenChecks.some((check) => check.id === 'token-bottom-sheet-handle' && check.status === 'pass'));
      assert.ok(tokenChecks.some((check) => check.id === 'token-tabbar-active-state' && check.status === 'pass'));
      assert.ok(tokenChecks.some((check) => check.id === 'token-floating-primary-action' && check.status === 'pass'));
      assert.ok(tokenChecks.some((check) => check.id === 'token-segmented-control-active-state' && check.status === 'pass'));
      assert.ok(tokenChecks.some((check) => check.id === 'token-component-semantics' && check.status === 'pass'));
      assert.ok(tokenChecks.some((check) => check.id === 'token-platform-physics-profiles' && check.status === 'pass'));
      assert.equal(existsSync(resolve(projectRoot, 'specs', 'changes', 'chg-benchmark-mobile-ergonomics', 'visual_benchmark_report.html')), true);
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('visual benchmark enforces motion transitions and matrix coverage across multiple viewport baselines', async () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'specs', 'changes', 'chg-benchmark-motion-matrix'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'refs'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'output'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'refs', 'portrait.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="120"><rect width="80" height="120" fill="#ffffff"/></svg>');
      writeFileSync(resolve(projectRoot, 'output', 'portrait.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="120"><rect width="80" height="120" fill="#ffffff"/></svg>');
      writeFileSync(resolve(projectRoot, 'refs', 'landscape.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="#ffffff"/></svg>');
      writeFileSync(resolve(projectRoot, 'output', 'landscape.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="#ffffff"/></svg>');
      writeFileSync(resolve(projectRoot, 'output', 'sheet-revealed.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="120"><rect width="80" height="120" fill="#ffffff"/><rect x="10" y="54" width="60" height="48" rx="10" fill="#4f46e5"/></svg>');
      writeFileSync(resolve(projectRoot, 'output', 'sheet-frame-1.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="120"><rect width="80" height="120" fill="#ffffff"/><rect x="10" y="68" width="60" height="40" rx="10" fill="#a5b4fc"/></svg>');
      writeFileSync(resolve(projectRoot, 'output', 'sheet-frame-2.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="120"><rect width="80" height="120" fill="#ffffff"/><rect x="10" y="58" width="60" height="46" rx="10" fill="#818cf8"/></svg>');

      const result = await visualBenchmark({
        competitor_product: 'CompetitorX',
        required_modules: ['sheet', 'main'],
        benchmark_matrix_contract_json: JSON.stringify({
          required_scenario_ids: ['mobile-portrait', 'mobile-landscape'],
          required_platform_profiles: ['ios_phone', 'android_phone'],
          required_state_variants: ['revealed'],
          max_average_pixel_diff_ratio: 0.05,
        }),
        reference_scenarios_json: JSON.stringify([
          {
            id: 'mobile-portrait',
            platform_profile: 'ios_phone',
            viewport: { width: 390, height: 844 },
            reference_image: 'refs/portrait.svg',
            screenshot_image: 'output/portrait.svg',
            diff_metrics: { structural_similarity: 0.98, layout_shift_score: 0.01, pixel_diff_ratio: 0.03 },
            structure_checks: [{ id: 'portrait-shell', status: 'pass' }],
            state_evidence: [
              {
                id: 'sheet-revealed',
                screenshot_image: 'output/sheet-revealed.svg',
                nodes_captured: 1,
                expect_visual_change: true,
                expect_motion: true,
                min_motion_changed_frames: 1,
                frame_screenshot_images: ['output/sheet-frame-1.svg', 'output/sheet-frame-2.svg'],
                state_variant: 'revealed',
                component_family: 'sheet',
              },
            ],
          },
          {
            id: 'mobile-landscape',
            platform_profile: 'android_phone',
            viewport: { width: 844, height: 390 },
            reference_image: 'refs/landscape.svg',
            screenshot_image: 'output/landscape.svg',
            diff_metrics: { structural_similarity: 0.98, layout_shift_score: 0.01, pixel_diff_ratio: 0.04 },
            structure_checks: [{ id: 'landscape-shell', status: 'pass' }],
          },
        ]),
      }, {
        projectRoot,
        changeId: 'chg-benchmark-motion-matrix',
      });

      assert.equal(result.ok, true);
      const benchmark = JSON.parse(readFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-benchmark-motion-matrix', 'visual_benchmark.json'), 'utf8'));
      assert.equal(benchmark.matrix_status, 'pass');
      assert.equal(typeof benchmark.report_file, 'string');
      assert.equal(existsSync(benchmark.report_file), true);
      assert.ok(benchmark.matrix_checks.some((check) => check.id === 'matrix-required-scenarios' && check.status === 'pass'));
      assert.ok(benchmark.matrix_checks.some((check) => check.id === 'matrix-required-platform-profiles' && check.status === 'pass'));
      assert.ok(benchmark.matrix_checks.some((check) => check.id === 'matrix-required-state-variants' && check.status === 'pass'));
      assert.ok(benchmark.scenarios[0].motion_transition_checks.some((check) => check.id === 'motion-transition-sheet-revealed' && check.status === 'pass'));
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('visual benchmark enforces required workbench states through state contract checks', async () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'specs', 'changes', 'chg-benchmark-state-contract'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'refs'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'output'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'refs', 'competitor-main.png'), 'ref');
      writeFileSync(resolve(projectRoot, 'refs', 'detail-open.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#ffffff"/><rect x="20" y="20" width="40" height="40" rx="8" fill="#4f46e5"/></svg>');
      writeFileSync(resolve(projectRoot, 'output', 'competitor-main.png'), 'shot');
      writeFileSync(resolve(projectRoot, 'output', 'detail-open.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#ffffff"/><rect x="20" y="20" width="40" height="40" rx="8" fill="#4f46e5"/></svg>');

      const result = await visualBenchmark({
        competitor_product: 'CompetitorX',
        required_modules: ['workspace', 'detail', 'filters'],
        reference_scenarios_json: JSON.stringify([
          {
            id: 'desktop-main',
            viewport: { width: 80, height: 80 },
            reference_image: 'refs/competitor-main.png',
            screenshot_image: 'output/competitor-main.png',
            diff_metrics: { structural_similarity: 1, layout_shift_score: 0, pixel_diff_ratio: 0 },
            structure_checks: [{ id: 'workspace-shell', status: 'pass' }],
            state_contract: {
              required_workbench_states: ['detail_open'],
            },
            state_evidence: [
              {
                id: 'detail-open',
                screenshot_image: 'output/detail-open.svg',
                reference_image: 'refs/detail-open.svg',
                nodes_captured: 2,
                expect_visual_change: true,
                min_pixel_diff_ratio: 0.002,
                workbench_state_type: 'detail_open',
                state_tags: ['detail', 'open'],
              },
            ],
          },
        ]),
      }, {
        projectRoot,
        changeId: 'chg-benchmark-state-contract',
      });

      assert.equal(result.ok, true);
      const benchmark = JSON.parse(readFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-benchmark-state-contract', 'visual_benchmark.json'), 'utf8'));
      assert.ok(benchmark.scenarios[0].state_contract_checks.some((check) => check.id === 'state-contract-required-workbench-states' && check.status === 'pass'));
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('visual benchmark enforces state family consistency across component variants', async () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'specs', 'changes', 'chg-benchmark-state-family'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'refs'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'output'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'refs', 'competitor-main.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#ffffff"/></svg>');
      writeFileSync(resolve(projectRoot, 'output', 'competitor-main.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#ffffff"/></svg>');
      writeFileSync(resolve(projectRoot, 'output', 'hover.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#ffffff"/><rect x="20" y="20" width="40" height="40" rx="8" fill="#93c5fd"/></svg>');
      writeFileSync(resolve(projectRoot, 'output', 'active.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#ffffff"/><rect x="20" y="20" width="40" height="40" rx="8" fill="#60a5fa"/></svg>');

      const result = await visualBenchmark({
        competitor_product: 'CompetitorX',
        required_modules: ['toolbar'],
        reference_scenarios_json: JSON.stringify([
          {
            id: 'desktop-main',
            viewport: { width: 80, height: 80 },
            reference_image: 'refs/competitor-main.svg',
            screenshot_image: 'output/competitor-main.svg',
            diff_metrics: { structural_similarity: 1, layout_shift_score: 0, pixel_diff_ratio: 0 },
            structure_checks: [{ id: 'workspace-shell', status: 'pass' }],
            state_family_contract: {
              toolbar_controls: {
                required_variants: ['hover', 'active'],
                max_pixel_diff_spread: 0.02,
                max_layout_shift_spread: 0.01,
                min_distinct_surface_colors: 2,
                required_timing_functions: ['ease', 'ease-in'],
                max_radius_spread: 0,
                max_transition_duration_spread: 40,
              },
            },
            state_evidence: [
              {
                id: 'toolbar-hover',
                screenshot_image: 'output/hover.svg',
                nodes_captured: 1,
                expect_visual_change: true,
                min_pixel_diff_ratio: 0.01,
                component_family: 'toolbar_controls',
                state_variant: 'hover',
                state_visual_tokens: {
                  color_roles: { surface: '#93c5fd' },
                  shadow_strength_tiers: ['subtle'],
                  transition_durations: [120],
                  transition_timing_functions: ['ease'],
                  radius_values: [8],
                  border_widths: [1],
                },
              },
              {
                id: 'toolbar-active',
                screenshot_image: 'output/active.svg',
                nodes_captured: 1,
                expect_visual_change: true,
                min_pixel_diff_ratio: 0.02,
                component_family: 'toolbar_controls',
                state_variant: 'active',
                state_visual_tokens: {
                  color_roles: { surface: '#60a5fa' },
                  shadow_strength_tiers: ['medium'],
                  transition_durations: [150],
                  transition_timing_functions: ['ease-in'],
                  radius_values: [8],
                  border_widths: [1],
                },
              },
            ],
          },
        ]),
      }, {
        projectRoot,
        changeId: 'chg-benchmark-state-family',
      });

      assert.equal(result.ok, true);
      const benchmark = JSON.parse(readFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-benchmark-state-family', 'visual_benchmark.json'), 'utf8'));
      assert.ok(benchmark.scenarios[0].state_family_checks.some((check) => check.id === 'state-family-toolbar_controls-required-variants' && check.status === 'pass'));
      assert.ok(benchmark.scenarios[0].state_family_checks.some((check) => check.id === 'state-family-toolbar_controls-pixel-diff-spread' && check.status === 'pass'));
      assert.ok(benchmark.scenarios[0].state_family_checks.some((check) => check.id === 'state-family-toolbar_controls-surface-colors' && check.status === 'pass'));
      assert.ok(benchmark.scenarios[0].state_family_checks.some((check) => check.id === 'state-family-toolbar_controls-radius-spread' && check.status === 'pass'));
      assert.ok(benchmark.scenarios[0].state_family_checks.some((check) => check.id === 'state-family-toolbar_controls-timing-functions' && check.status === 'pass'));
      assert.ok(benchmark.scenarios[0].state_family_checks.some((check) => check.id === 'state-family-toolbar_controls-transition-duration-spread' && check.status === 'pass'));
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('benchmark repair plan summarizes unresolved benchmark hotspots into focused repair actions', async () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'specs', 'changes', 'chg-benchmark-repair-plan'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-benchmark-repair-plan', 'generation_contract.json'), JSON.stringify({
        generation_contract: {
          component_constraints: {
            component_blueprint: [
              { id: 'calendar_grid_cell_1', module: 'calendar', primitive_role: 'grid_cell', hierarchy_role: 'primary', stage_bucket: 'primary_focus' },
              { id: 'calendar_status_chip_1', module: 'calendar', primitive_role: 'status_chip', hierarchy_role: 'supporting', stage_bucket: 'polish' },
              { id: 'calendar_selection_badge_1', module: 'calendar', primitive_role: 'selection_badge', hierarchy_role: 'supporting', stage_bucket: 'polish' },
              { id: 'list_row_1', module: 'list', primitive_role: 'list_row', hierarchy_role: 'primary', stage_bucket: 'primary_focus' },
              { id: 'list_meta_1', module: 'list', primitive_role: 'meta_line', hierarchy_role: 'supporting', stage_bucket: 'polish' },
            ],
            staged_generation: {
              stages: [
                { id: 'primary_focus', target_component_ids: ['calendar_grid_cell_1', 'list_row_1'] },
                { id: 'polish', target_component_ids: ['calendar_status_chip_1', 'calendar_selection_badge_1', 'list_meta_1'] },
              ],
            },
          },
        },
      }, null, 2));
      writeFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-benchmark-repair-plan', 'primitive_feedback_history.json'), JSON.stringify({
        primitive_feedback_history: {
          entries: [
            {
              module: 'calendar',
              primitive_role: 'grid_cell',
              current_issue_score: 4,
              previous_issue_score: 2,
              improvement_score: 0,
              regression_score: 2,
              stabilization_score: 0,
              attention_score: 50,
            },
            {
              module: 'calendar',
              primitive_role: 'status_chip',
              current_issue_score: 0,
              previous_issue_score: 4,
              improvement_score: 4,
              regression_score: 0,
              stabilization_score: 4,
              attention_score: 0,
            },
            {
              module: 'calendar',
              primitive_role: 'selection_badge',
              current_issue_score: 3,
              previous_issue_score: 1,
              improvement_score: 0,
              regression_score: 2,
              stabilization_score: 0,
              attention_score: 40,
            },
          ],
        },
      }, null, 2));
      writeFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-benchmark-repair-plan', 'visual_benchmark.json'), JSON.stringify({
        version: 1,
        scenarios: [
          {
            id: 'desktop-main',
            status: 'needs_follow_up',
            blockers: [
              'layout_shift_score_above_threshold',
              'structural_similarity_below_threshold',
              'pixel_diff_ratio_above_threshold',
            ],
            structure_checks: [],
            layout_observations: {
              dom_rects: [
                { panel_id: 'calendar', left: 0, top: 0, width: 600, height: 400 },
                { panel_id: 'list', left: 600, top: 0, width: 300, height: 400 },
              ],
            },
            diff_metrics: {
              hotspots: [
                { row: 0, col: 1, changed_ratio: 0.25, x: 40, y: 40, width: 120, height: 120 },
              ],
            },
          },
        ],
      }, null, 2));

      const result = await benchmarkRepairPlan({}, {
        projectRoot,
        changeId: 'chg-benchmark-repair-plan',
      });

      assert.equal(result.ok, true);
      const repair = JSON.parse(readFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-benchmark-repair-plan', 'benchmark_repair_plan.json'), 'utf8'));
      assert.equal(repair.benchmark_repair_plan.unresolved_scenario_count, 1);
      assert.ok(repair.benchmark_repair_plan.scenario_repairs[0].repairs.some((entry) => entry.id === 'layout_ratio_repair'));
      assert.ok(repair.benchmark_repair_plan.scenario_repairs[0].repairs.some((entry) => entry.id === 'missing_structure_contract'));
      assert.ok(repair.benchmark_repair_plan.scenario_repairs[0].repairs.every((entry) => Array.isArray(entry.target_component_ids)));
      assert.ok(Array.isArray(repair.benchmark_repair_plan.scenario_repairs[0].preserved_component_ids));
      assert.ok(repair.benchmark_repair_plan.scenario_repairs[0].repairs.every((entry) => entry.impacted_panels.includes('calendar')));
      assert.ok(repair.benchmark_repair_plan.scenario_repairs[0].repairs.every((entry) => !entry.target_modules.includes('list')));
      const tokenRepair = repair.benchmark_repair_plan.scenario_repairs[0].repairs.find((entry) => entry.id === 'token_repair');
      assert.deepEqual(tokenRepair.target_primitive_roles, ['selection_badge']);
      assert.equal(tokenRepair.target_feedback_summary[0].attention_score, 40);
      assert.ok(!tokenRepair.target_component_ids.includes('calendar_status_chip_1'));
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });
});
