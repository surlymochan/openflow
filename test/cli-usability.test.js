import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import yaml from 'js-yaml';
import registry from '../atoms/registry.json' with { type: 'json' };
import { appendExecutionLogSync } from '../src/core/execution-log.js';
import { buildWorkflowManifest } from '../src/core/workflow-integrity.js';

const REPO_ROOT = process.cwd();

function makeProjectRoot() {
  const root = mkdtempSync(join(tmpdir(), 'openflow-cli-'));
  mkdirSync(resolve(root, '.as-xflow'), { recursive: true });
  return root;
}

function cleanupProjectRoot(root) {
  rmSync(root, { recursive: true, force: true });
}

function initGitRepo(root, branchName) {
  const run = (args) => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  };
  run(['init', '-b', 'main']);
  run(['config', 'user.name', 'Codex']);
  run(['config', 'user.email', 'codex@example.com']);
  writeFileSync(resolve(root, 'README.md'), '# temp\n');
  run(['add', 'README.md']);
  run(['commit', '-m', 'init']);
  if (branchName && branchName !== 'main') {
    run(['checkout', '-b', branchName]);
  }
}

function writeStrictCorpsExecutionLog(projectRoot, changeId, options = {}) {
  const workflowPath = resolve(REPO_ROOT, 'workflows', 'corps.yaml');
  const workflow = yaml.load(readFileSync(workflowPath, 'utf8'));
  const phases = workflow.phases;
  const manifest = buildWorkflowManifest({ workflowPath, workflow, phases, registry });
  const runId = options.runId || `wf-test-${changeId}`;

  appendExecutionLogSync(projectRoot, {
    kind: 'workflow_started',
    workflow_run_id: runId,
    workflow: 'corps',
    track: 'heavy',
    change_id: changeId,
    workflow_integrity: manifest,
  });

  for (let index = 0; index < phases.length; index += 1) {
    const phase = phases[index];
    appendExecutionLogSync(projectRoot, {
      kind: 'phase_started',
      workflow_run_id: runId,
      workflow: 'corps',
      track: 'heavy',
      change_id: changeId,
      phase_id: phase.id,
      phase_index: index,
      workflow_integrity_digest: manifest.digest,
    });
    for (const atomRef of phase.atoms || []) {
      const adapter = adapterForAtom(atomRef.id);
      const isForcedStub = options.stubAtom
        && options.stubAtom.phase_id === phase.id
        && options.stubAtom.atom_id === atomRef.id;
      appendExecutionLogSync(projectRoot, {
        kind: 'atom_run',
        workflow_run_id: runId,
        workflow: 'corps',
        track: 'heavy',
        change_id: changeId,
        phase_id: phase.id,
        atom_id: atomRef.id,
        atom_type: registry.atoms[atomRef.id]?.type || 'unknown',
        ok: !isForcedStub,
        status: isForcedStub ? 'task_queued' : 'completed',
        adapter: isForcedStub ? 'stub' : adapter,
        adapter_reason: isForcedStub ? 'auto_stub_default' : null,
        workflow_integrity_digest: manifest.digest,
      });
    }
    appendExecutionLogSync(projectRoot, {
      kind: 'gate_check',
      workflow_run_id: runId,
      workflow: 'corps',
      track: 'heavy',
      change_id: changeId,
      phase_id: phase.id,
      gate_type: phase.gate?.type || 'skip',
      ok: true,
      workflow_integrity_digest: manifest.digest,
    });
    if (options.omitPhaseCompleted !== phase.id) {
      appendExecutionLogSync(projectRoot, {
        kind: 'phase_completed',
        workflow_run_id: runId,
        workflow: 'corps',
        track: 'heavy',
        change_id: changeId,
        phase_id: phase.id,
        phase_index: index,
        workflow_integrity_digest: manifest.digest,
      });
    }
  }

  appendExecutionLogSync(projectRoot, {
    kind: 'workflow_completed',
    workflow_run_id: runId,
    workflow: 'corps',
    track: 'heavy',
    change_id: changeId,
    workflow_integrity: manifest,
    completed_phases: phases.map((phase) => phase.id),
  });
}

function adapterForAtom(atomId) {
  const def = registry.atoms[atomId] || {};
  if (atomId.startsWith('H4')) return 'pencil_cli';
  if (def.type === 'agent_invoke') return 'codex_cli';
  return null;
}

function writeCompleteCorpsArtifacts(projectRoot, changeId, options = {}) {
  const changeRoot = resolve(projectRoot, 'specs', 'changes', changeId);
  const requiredArtifacts = [
    'status.json',
    'proposal.md',
    'design_contract.json',
    'competitor_reconstruction_review.json',
    'reference_surface_lock.json',
    'reconstruction_pack.json',
    'generation_contract.json',
    'design_system_pack.json',
    'image_reference_set.json',
    'visual_direction_synthesis.json',
    'layout_competition.json',
    'visual_benchmark.json',
    'design_selection.json',
    'ux_design_brief.json',
    'pencil_output.pen',
    'llm_design_review.json',
    'aesthetic_review.json',
    'benchmark_repair_plan.json',
    'design_accept.json',
    'pencil_output.attestation.json',
    'plan.md',
    'tdd/red-0.json',
    'execute.json',
    'tdd/green-0.json',
    'tdd/quality-0.json',
    'review.json',
    'qa_acceptance.json',
    'gate_final.json',
  ];
  mkdirSync(resolve(projectRoot, 'refs'), { recursive: true });
  mkdirSync(resolve(projectRoot, 'output'), { recursive: true });
  writeFileSync(resolve(projectRoot, 'refs', 'competitor-main.png'), 'ref');
  writeFileSync(resolve(projectRoot, 'output', 'competitor-main.png'), 'shot');

  for (const artifact of requiredArtifacts) {
    const path = resolve(changeRoot, artifact);
    mkdirSync(resolve(path, '..'), { recursive: true });
    if (artifact === 'competitor_reconstruction_review.json') {
      writeFileSync(path, `${JSON.stringify({
        competitor_reconstruction_contract: {
          status: 'frozen',
          competitor_product: 'CompetitorX',
          target_surfaces: ['primary_workspace'],
          primary_reference_surface: 'primary_workspace',
          supporting_reference_surfaces: [],
          required_modules: ['workspace', 'detail'],
          primary_journeys: ['capture_to_review'],
          business_logic_invariants: ['domain_invariant_a'],
        },
      }, null, 2)}\n`);
    } else if (artifact === 'reference_surface_lock.json') {
      writeFileSync(path, `${JSON.stringify({ reference_surface_lock: { status: 'locked', primary_reference_surface: 'primary_workspace' } }, null, 2)}\n`);
    } else if (artifact === 'reconstruction_pack.json') {
      writeFileSync(path, `${JSON.stringify({
        reconstruction_pack: {
          status: 'ready',
          surface_map: [{ surface_id: 'primary_workspace' }],
          layout_map: { regions: [{ id: 'workspace' }] },
          component_inventory: [{ id: 'workspace_component' }],
          component_blueprint: [{ id: 'workspace_list_row_1', module: 'workspace', primitive_role: 'list_row' }],
          state_inventory: [{ id: 'review_state' }],
          visual_token_map: { color_roles: ['surface'] },
          reference_intermediate_model: { reference_dom_regions: [{ id: 'workspace' }], relationship_graph: [{ id: 'workspace_order' }] },
        },
      }, null, 2)}\n`);
    } else if (artifact === 'generation_contract.json') {
      writeFileSync(path, `${JSON.stringify({
        generation_contract: {
          status: 'ready',
          component_constraints: {
            component_blueprint: [{ id: 'workspace_list_row_1', module: 'workspace', primitive_role: 'list_row' }],
            staged_generation: { stages: [{ id: 'primary_focus', target_component_ids: ['workspace_list_row_1'] }] },
          },
          visual_constraints: {
            image_reference_generation: {
              enabled: true,
              model_capability: 'gpt-image-v2',
              required_outputs: [
                { id: 'primary_surface_reference_frame' },
                { id: 'component_density_sheet' },
                { id: 'state_polish_sheet' },
              ],
            },
          },
        },
      }, null, 2)}\n`);
    } else if (artifact === 'design_system_pack.json') {
      writeFileSync(path, `${JSON.stringify({
        status: 'ready',
        practice_sources: [{ id: 'lovable' }, { id: 'open_design' }, { id: 'open_codesign' }, { id: 'openui' }],
        component_policy: { required_states: ['default', 'hover', 'focus', 'selected', 'loading', 'empty', 'error'] },
        preview_loop: { required_artifacts: ['image_reference_set.json', 'visual_benchmark.json', 'aesthetic_review.json'] },
      }, null, 2)}\n`);
    } else if (artifact === 'image_reference_set.json') {
      const referenceIds = ['primary_surface_reference_frame', 'component_density_sheet', 'state_polish_sheet'];
      for (const id of referenceIds) {
        const referencePath = resolve(changeRoot, 'image-references', `${id}.md`);
        mkdirSync(resolve(referencePath, '..'), { recursive: true });
        writeFileSync(referencePath, `# ${id}\n`);
      }
      writeFileSync(path, `${JSON.stringify({
        status: 'ready',
        references: referenceIds.map((id) => ({ id, status: 'ready', artifact_path: `specs/changes/${changeId}/image-references/${id}.md` })),
      }, null, 2)}\n`);
    } else if (artifact === 'visual_benchmark.json') {
      writeFileSync(path, `${JSON.stringify({
        benchmark_mode: 'reference_backed',
        benchmark_input_mode: options.benchmarkInputMode || 'reference_scenarios',
        scenarios: [{ id: 'main', status: 'pass', reference_image: 'refs/competitor-main.png', screenshot_image: 'output/competitor-main.png' }],
      }, null, 2)}\n`);
    } else if (artifact === 'aesthetic_review.json') {
      writeFileSync(path, `${JSON.stringify({ status: 'accept', score: 0.94, min_accept_score: 0.88, blockers: [] }, null, 2)}\n`);
    } else {
      writeFileSync(path, artifact.endsWith('.md') ? '# proof\n' : '{"ok":true}\n');
    }
  }
}

describe('CLI usability', () => {
  test('package bin exposes an executable xflow entrypoint', () => {
    const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8'));
    const binPath = resolve(REPO_ROOT, pkg.bin.xflow);

    assert.equal(pkg.bin.xflow, 'bin/xflow.js');
    assert.notEqual(statSync(binPath).mode & 0o111, 0);
  });

  test('serve help exits without starting the HTTP server', () => {
    const result = spawnSync('node', ['bin/xflow.js', 'serve', '--help'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 1500,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    assert.match(result.stdout, /Usage: xflow serve/);
    assert.doesNotMatch(result.stdout, /server listening/i);
  });

  test('doctor reports local readiness in text and json modes', () => {
    let result = spawnSync('node', ['bin/xflow.js', 'doctor'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 3000,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    assert.match(result.stdout, /xflow doctor: ok/);
    assert.match(result.stdout, /workflow\.workflows\/yolo\.yaml/);
    assert.match(result.stdout, /skill\.no-root-skill/);

    result = spawnSync('node', ['bin/xflow.js', 'doctor', '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 3000,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.ok(payload.checks.some((check) => check.id === 'script.drift-scan' && check.ok));
    assert.ok(payload.checks.some((check) => check.id === 'workflow.workflows/corps.yaml' && check.ok));
  });

  test('init creates a portable project-local config without overwriting by default', () => {
    const projectRoot = makeProjectRoot();
    try {
      let result = spawnSync('node', [
        'bin/xflow.js',
        'init',
        '--project-root',
        projectRoot,
        '--json',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });

      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.ok, true);
      assert.equal(payload.config.project_root, projectRoot);
      assert.equal(payload.config.workflows.lite, 'builtin:yolo');
      assert.equal(payload.config.workflows.heavy, 'builtin:corps');
      assert.equal(payload.config.issue_routing.language, 'zh-CN');

      const config = JSON.parse(readFileSync(resolve(projectRoot, '.as-xflow', 'config.json'), 'utf8'));
      assert.equal(config.skills.source_dir, 'xflow');
      assert.equal(config.skills.sync_script, '~/Documents/workspace/pro/as-skillhub/skills/skills_sync.sh');
      assert.deepEqual(config.skills.extra_source_dirs, ['~/Documents/workspace/pro/as-skillhub/skills']);

      result = spawnSync('node', ['bin/xflow.js', 'init', '--project-root', projectRoot], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });
      assert.notEqual(result.status, 0, result.stdout);
      assert.match(result.stderr, /config already exists/);

      result = spawnSync('node', ['bin/xflow.js', 'init', '--project-root', projectRoot, '--force'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });
      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      assert.match(result.stdout, /xflow init: wrote/);
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('goal manages the project-level alignment anchor', () => {
    const projectRoot = makeProjectRoot();
    try {
      let result = spawnSync('node', [
        'bin/xflow.js',
        'goal',
        'show',
        '--project-root',
        projectRoot,
        '--json',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });

      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      let payload = JSON.parse(result.stdout);
      assert.equal(payload.ok, true);
      assert.equal(payload.exists, false);

      result = spawnSync('node', [
        'bin/xflow.js',
        'goal',
        'set',
        'Make xflow impossible to misread',
        '--project-root',
        projectRoot,
        '--json',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });

      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      payload = JSON.parse(result.stdout);
      assert.equal(payload.ok, true);
      assert.equal(payload.summary, 'Make xflow impossible to misread');

      const goalFile = resolve(projectRoot, '.xflow', 'GOAL.md');
      assert.match(readFileSync(goalFile, 'utf8'), /Make xflow impossible to misread/);

      result = spawnSync('node', [
        'bin/xflow.js',
        'goal',
        'set',
        'Replace without force should fail',
        '--project-root',
        projectRoot,
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });
      assert.notEqual(result.status, 0, result.stdout);
      assert.match(result.stderr, /goal already exists/);

      result = spawnSync('node', [
        'bin/xflow.js',
        'goal',
        'set',
        '--text',
        'Updated launch-grade goal',
        '--project-root',
        projectRoot,
        '--force',
        '--json',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });
      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      payload = JSON.parse(result.stdout);
      assert.equal(payload.summary, 'Updated launch-grade goal');

      result = spawnSync('node', [
        'bin/xflow.js',
        'goal',
        'show',
        '--project-root',
        projectRoot,
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });
      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      assert.match(result.stdout, /Updated launch-grade goal/);

      result = spawnSync('node', [
        'bin/xflow.js',
        'goal',
        'audit',
        '--project-root',
        projectRoot,
        '--json',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });
      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      payload = JSON.parse(result.stdout);
      assert.equal(payload.ok, true);
      assert.equal(payload.goal.summary, 'Updated launch-grade goal');
      assert.equal(payload.boundary.role, 'project_direction_anchor');
      assert.ok(payload.boundary.not_for.some((item) => item.includes('running implementation')));
      assert.ok(payload.boundary.escalation_path.includes('yolo or corps executes and verifies the change'));
      assert.ok(payload.checks.some((check) => check.id === 'yolo_consumes_goal' && check.ok));
      assert.ok(payload.checks.some((check) => check.id === 'corps_consumes_goal' && check.ok));
      assert.ok(payload.checks.some((check) => check.id === 'public_ladder' && check.ok));

      result = spawnSync('node', [
        'bin/xflow.js',
        'goal',
        'clear',
        '--project-root',
        projectRoot,
        '--json',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });
      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      payload = JSON.parse(result.stdout);
      assert.equal(payload.ok, true);
      assert.equal(payload.existed, true);
      assert.equal(existsSync(goalFile), false);

      result = spawnSync('node', [
        'bin/xflow.js',
        'goal',
        'audit',
        '--project-root',
        projectRoot,
        '--json',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });
      assert.equal(result.status, 1, result.stderr || result.stdout || String(result.error));
      payload = JSON.parse(result.stdout);
      assert.equal(payload.ok, false);
      assert.equal(payload.goal.exists, false);
      assert.ok(payload.checks.some((check) => check.id === 'durable_goal_file' && !check.ok));
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('workflow validate accepts public yolo and corps aliases', () => {
    for (const alias of ['yolo', 'corps']) {
      const result = spawnSync('node', ['bin/xflow.js', 'workflow', 'validate', alias], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });

      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      assert.match(result.stdout, new RegExp(`workflows/${alias === 'yolo' ? 'yolo' : 'corps'}\\.yaml is valid`));
    }
  });

  test('visual export-dom-rects derives dom_rects from a DOM snapshot json', () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'fixtures'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'fixtures', 'dom-snapshot.json'), JSON.stringify({
        nodes: [
          {
            selector: '[data-panel="header"]',
            attributes: { 'data-panel': 'header' },
            boundingClientRect: { left: 0, top: 0, width: 1440, height: 64 },
          },
          {
            selector: '[data-panel="list"]',
            attributes: { 'data-panel': 'list' },
            rect: { left: 0, top: 120, width: 920, height: 780 },
          },
          {
            selector: '[data-panel="detail"]',
            attributes: { 'data-panel': 'detail' },
            box: { x: 920, y: 120, width: 520, height: 780 },
          },
        ],
      }, null, 2));

      const result = spawnSync('node', [
        'bin/xflow.js',
        'visual',
        'export-dom-rects',
        '--project-root',
        projectRoot,
        '--input',
        'fixtures/dom-snapshot.json',
        '--output',
        '.as-xflow/exported-dom-rects.json',
        '--json',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });

      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.ok, true);
      assert.equal(payload.input_nodes, 3);
      assert.equal(payload.extracted_panels, 3);
      assert.deepEqual(JSON.parse(readFileSync(resolve(projectRoot, '.as-xflow', 'exported-dom-rects.json'), 'utf8')), {
        dom_rects: [
          { panel_id: 'header', selector: '[data-panel="header"]', left: 0, top: 0, width: 1440, height: 64 },
          { panel_id: 'list', selector: '[data-panel="list"]', left: 0, top: 120, width: 920, height: 780 },
          { panel_id: 'detail', selector: '[data-panel="detail"]', left: 920, top: 120, width: 520, height: 780 },
        ],
        panel_attr: 'data-panel',
        input_nodes: 3,
        extracted_panels: 3,
      });
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('visual capture-page-evidence captures screenshot and DOM snapshot from a local page', () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'fixtures'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'fixtures', 'page.html'), `<!doctype html>
<html>
  <body style="margin:0">
    <header data-panel="header" style="height:64px;background:#eee"></header>
    <main data-panel="main" style="height:200px;background:#ccc"></main>
  </body>
</html>`);

      const pageUrl = `file://${resolve(projectRoot, 'fixtures', 'page.html')}`;
      const result = spawnSync('node', [
        'bin/xflow.js',
        'visual',
        'capture-page-evidence',
        '--project-root',
        projectRoot,
        '--url',
        pageUrl,
        '--platform-profile',
        'mobile_h5',
        '--snapshot-output',
        '.as-xflow/page-snapshot.json',
        '--screenshot-output',
        'output/playwright/page.png',
        '--width',
        '800',
        '--height',
        '400',
        '--json',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 15000,
      });

      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.ok, true);
      assert.equal(payload.platform_profile, 'mobile_h5');
      assert.equal(payload.nodes_captured, 2);
      assert.equal(existsSync(resolve(projectRoot, '.as-xflow', 'page-snapshot.json')), true);
      assert.equal(existsSync(resolve(projectRoot, 'output', 'playwright', 'page.png')), true);
      const snapshot = JSON.parse(readFileSync(resolve(projectRoot, '.as-xflow', 'page-snapshot.json'), 'utf8'));
      assert.equal(snapshot.nodes.some((node) => node.panel_id === 'header'), true);
      assert.equal(snapshot.nodes.some((node) => node.panel_id === 'main'), true);
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('visual capture-page-evidence can inline export dom_rects and compute diff metrics', () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'fixtures'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'fixtures', 'page.html'), `<!doctype html>
<html>
  <body style="margin:0;background:#fff">
    <header data-panel="header" style="height:64px;background:#fff"></header>
    <main data-panel="main" style="height:200px;background:#fff"></main>
  </body>
</html>`);
      writeFileSync(resolve(projectRoot, 'fixtures', 'ref.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><rect width="800" height="400" fill="#ffffff"/></svg>');

      const pageUrl = `file://${resolve(projectRoot, 'fixtures', 'page.html')}`;
      const result = spawnSync('node', [
        'bin/xflow.js',
        'visual',
        'capture-page-evidence',
        '--project-root',
        projectRoot,
        '--url',
        pageUrl,
        '--snapshot-output',
        '.as-xflow/page-snapshot.json',
        '--screenshot-output',
        'output/playwright/page.png',
        '--dom-rects-output',
        '.as-xflow/dom-rects.json',
        '--reference',
        'fixtures/ref.svg',
        '--heatmap-output',
        'output/playwright/page-heatmap.png',
        '--report-output',
        'output/playwright/page-compare.html',
        '--width',
        '800',
        '--height',
        '400',
        '--json',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 15000,
      });

      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.ok, true);
      assert.equal(payload.dom_rects.extracted_panels, 2);
      assert.equal(Array.isArray(payload.dom_rects.dom_rects), true);
      assert.equal(typeof payload.diff_metrics.pixel_diff_ratio, 'number');
      assert.equal(typeof payload.diff_metrics.layout_shift_score, 'number');
      assert.equal(typeof payload.diff_metrics.structural_similarity, 'number');
      assert.ok(Array.isArray(payload.diff_metrics.hotspots));
      assert.equal(existsSync(resolve(projectRoot, 'output', 'playwright', 'page-heatmap.png')), true);
      assert.equal(existsSync(resolve(projectRoot, 'output', 'playwright', 'page-compare.html')), true);
      assert.equal(existsSync(resolve(projectRoot, '.as-xflow', 'dom-rects.json')), true);
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('visual capture-page-evidence can inline export visual tokens from computed styles', () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'fixtures'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'fixtures', 'page.html'), `<!doctype html>
<html>
  <body style="margin:0;background:#f7f8fa;font-family:Inter, sans-serif;color:#1f2329;line-height:24px;letter-spacing:0px">
    <main data-panel="main" style="height:220px;padding:16px 16px 96px;background:#f7f8fa;position:relative">
      <section data-panel="search_bar" style="display:flex;align-items:center;gap:8px;margin-bottom:12px;padding:10px 12px;border:1px solid #e5e7eb;border-radius:12px;background:#ffffff;transition:all 240ms cubic-bezier(0.32, 0.72, 0, 1)">
        <input type="search" value="deskplan" aria-label="Search tasks" style="border:none;outline:none;width:100%;font:inherit;background:transparent;color:#0f172a" />
      </section>
      <section data-panel="detail" style="height:120px;border:1px solid #e5e7eb;border-radius:12px;background:#ffffff;color:#1f2329;line-height:32px;letter-spacing:0.2px;box-shadow:0 12px 32px rgba(15, 23, 42, 0.12);transition:all 240ms cubic-bezier(0.32, 0.72, 0, 1)">Panel</section>
      <section data-panel="loading" aria-busy="true" style="margin-top:12px;height:44px;border-radius:12px;background:#ffffff;display:flex;align-items:center;padding:0 12px;transition:all 240ms cubic-bezier(0.32, 0.72, 0, 1)">Loading tasks...</section>
      <section data-panel="skeleton" class="skeleton shimmer" style="margin-top:12px;height:44px;border-radius:12px;background:#e2e8f0;transition:all 240ms cubic-bezier(0.32, 0.72, 0, 1)"></section>
      <section data-panel="error" role="alert" style="margin-top:12px;height:44px;border-radius:12px;background:#fff1f2;color:#be123c;display:flex;align-items:center;padding:0 12px;transition:all 240ms cubic-bezier(0.32, 0.72, 0, 1)">Failed to sync</section>
      <div data-panel="filters" role="tablist" style="display:flex;gap:8px;margin-top:12px;padding:4px;border:1px solid #e5e7eb;border-radius:999px;background:#ffffff;width:max-content">
        <button role="tab" aria-selected="true" data-active="true" style="border:none;background:#4f46e5;color:#ffffff;border-radius:999px;padding:8px 14px;transition:all 240ms cubic-bezier(0.32, 0.72, 0, 1)">Inbox</button>
        <button role="tab" aria-selected="false" style="border:none;background:transparent;color:#475569;border-radius:999px;padding:8px 14px;transition:all 240ms cubic-bezier(0.32, 0.72, 0, 1)">Today</button>
      </div>
      <section data-panel="sheet" style="margin-top:12px;height:80px;border-radius:16px;background:#ffffff;padding-top:16px;transition:all 260ms cubic-bezier(0.32, 0.72, 0, 1)">
        <div style="width:40px;height:4px;border-radius:999px;background:#cbd5e1;margin:0 auto 12px"></div>
      </section>
      <button data-panel="primary_action" style="position:fixed;right:20px;bottom:92px;width:56px;height:56px;border:none;border-radius:999px;background:#4f46e5;color:#ffffff;box-shadow:0 12px 24px rgba(79,70,229,0.24);transition:all 240ms cubic-bezier(0.32, 0.72, 0, 1)">+</button>
    </main>
    <nav data-panel="bottom_bar" style="position:fixed;left:0;right:0;bottom:0;height:72px;background:#ffffff;border-top:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-around;transition:all 240ms cubic-bezier(0.32, 0.72, 0, 1)">
      <button aria-selected="true" data-active="true" style="border:none;background:transparent;color:#4f46e5;transition:all 240ms cubic-bezier(0.32, 0.72, 0, 1)">Home</button>
      <button style="border:none;background:transparent;color:#64748b;transition:all 240ms cubic-bezier(0.32, 0.72, 0, 1)">Search</button>
    </nav>
  </body>
</html>`);

      const pageUrl = `file://${resolve(projectRoot, 'fixtures', 'page.html')}`;
      const result = spawnSync('node', [
        'bin/xflow.js',
        'visual',
        'capture-page-evidence',
        '--project-root',
        projectRoot,
        '--url',
        pageUrl,
        '--platform-profile',
        'ios_phone',
        '--snapshot-output',
        '.as-xflow/page-snapshot.json',
        '--screenshot-output',
        'output/playwright/page.png',
        '--visual-tokens-output',
        '.as-xflow/visual-tokens.json',
        '--width',
        '800',
        '--height',
        '400',
        '--json',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 15000,
      });

      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.ok, true);
      assert.equal(existsSync(resolve(projectRoot, '.as-xflow', 'visual-tokens.json')), true);
      assert.equal(typeof payload.viewport_metrics.safe_area_top, 'number');
      assert.equal(typeof payload.viewport_metrics.keyboard_inset_bottom, 'number');
      assert.ok(Array.isArray(payload.visual_tokens.observed_visual_tokens.font_families));
      assert.ok(payload.visual_tokens.observed_visual_tokens.text_sizes.length > 0);
      assert.ok(payload.visual_tokens.observed_visual_tokens.line_heights.length > 0);
      assert.ok(payload.visual_tokens.observed_visual_tokens.letter_spacings.some((value) => value >= 0));
      assert.ok(payload.visual_tokens.observed_visual_tokens.radius_values.some((value) => value >= 12));
      assert.ok(payload.visual_tokens.observed_visual_tokens.border_widths.some((value) => value >= 1));
      assert.ok(payload.visual_tokens.observed_visual_tokens.border_styles.includes('solid'));
      assert.ok(payload.visual_tokens.observed_visual_tokens.border_weight_tiers.includes('hairline'));
      assert.ok(payload.visual_tokens.observed_visual_tokens.shadow_strength_tiers.includes('strong'));
      assert.equal(payload.visual_tokens.observed_visual_tokens.bottom_sheet_handle_present, true);
      assert.equal(payload.visual_tokens.observed_visual_tokens.tabbar_active_state_present, true);
      assert.equal(payload.visual_tokens.observed_visual_tokens.floating_primary_action_present, true);
      assert.equal(payload.visual_tokens.observed_visual_tokens.segmented_control_active_state_present, true);
      assert.equal(payload.visual_tokens.observed_visual_tokens.loading_state_present, true);
      assert.equal(payload.visual_tokens.observed_visual_tokens.skeleton_state_present, true);
      assert.equal(payload.visual_tokens.observed_visual_tokens.error_state_present, true);
      assert.equal(payload.visual_tokens.observed_visual_tokens.search_active_present, true);
      assert.ok(payload.visual_tokens.observed_visual_tokens.component_semantics.includes('loading_state'));
      assert.ok(payload.visual_tokens.observed_visual_tokens.component_semantics.includes('skeleton_state'));
      assert.ok(payload.visual_tokens.observed_visual_tokens.component_semantics.includes('error_state'));
      assert.ok(payload.visual_tokens.observed_visual_tokens.component_semantics.includes('search_active'));
      assert.ok(payload.visual_tokens.observed_visual_tokens.platform_physics_profiles.includes('ios_spring'));
      assert.ok(payload.visual_tokens.observed_visual_tokens.shadow_signatures.length > 0);
      assert.equal(typeof payload.visual_tokens.observed_visual_tokens.component_family_consistency, 'object');
      assert.equal(typeof payload.visual_tokens.observed_visual_tokens.color_roles.canvas, 'string');
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('visual export-visual-tokens derives observed visual tokens from a DOM snapshot json', () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'fixtures'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'fixtures', 'dom-snapshot.json'), JSON.stringify({
        platform_profile: 'ios_phone',
        viewport_metrics: {
          safe_area_top: 47,
          safe_area_bottom: 34,
          keyboard_inset_bottom: 290,
        },
        nodes: [
          {
            panel_id: 'main',
            selector: '[data-panel="main"]',
            descendantMetrics: {
              icon_density: 0,
              icon_rects: [],
            },
            computedStyle: {
              fontFamily: 'Inter, sans-serif',
              fontWeight: '400',
              fontSize: '16px',
              lineHeight: '24px',
              letterSpacing: '0px',
              color: 'rgb(31, 35, 41)',
              backgroundColor: 'rgb(247, 248, 250)',
              borderColor: 'rgba(0, 0, 0, 0)',
              borderWidth: '0px',
              borderStyle: 'none',
              borderRadius: '0px',
              boxShadow: 'none',
              paddingTop: '16px',
              paddingRight: '16px',
              paddingBottom: '16px',
              paddingLeft: '16px',
              marginTop: '0px',
              marginRight: '0px',
              marginBottom: '0px',
              marginLeft: '0px',
              rowGap: '8px',
              columnGap: '8px',
              gap: '8px',
            },
          },
          {
            panel_id: 'detail',
            selector: '[data-panel="detail"]',
            descendantMetrics: {
              icon_density: 1.234,
              icon_rects: [{ width: 16, height: 16 }, { width: 20, height: 20 }],
            },
            computedStyle: {
              fontFamily: 'Inter, sans-serif',
              fontWeight: '600',
              fontSize: '24px',
              lineHeight: '32px',
              letterSpacing: '0.2px',
              color: 'rgb(31, 35, 41)',
              backgroundColor: 'rgb(255, 255, 255)',
              borderColor: 'rgb(229, 231, 235)',
              borderWidth: '1px',
              borderStyle: 'solid',
              borderRadius: '12px',
              borderTopLeftRadius: '12px',
              borderTopRightRadius: '12px',
              borderBottomLeftRadius: '12px',
              borderBottomRightRadius: '12px',
              boxShadow: '0px 12px 32px rgba(15, 23, 42, 0.12)',
              paddingTop: '24px',
              paddingRight: '24px',
              paddingBottom: '24px',
              paddingLeft: '24px',
              marginTop: '0px',
              marginRight: '0px',
              marginBottom: '0px',
              marginLeft: '0px',
              rowGap: '12px',
              columnGap: '12px',
              gap: '12px',
            },
          },
          {
            panel_id: 'sheet',
            selector: '[data-panel="sheet"]',
            descendantMetrics: {
              bottom_sheet_handle_present: true,
              active_tab_present: false,
              floating_primary_action_present: false,
              segmented_control_active_present: false,
              loading_state_present: true,
              skeleton_state_present: false,
              error_state_present: false,
              search_active_present: false,
            },
            computedStyle: {
              fontFamily: 'Inter, sans-serif',
              fontWeight: '400',
              fontSize: '16px',
              lineHeight: '24px',
              letterSpacing: '0px',
              color: 'rgb(31, 35, 41)',
              backgroundColor: 'rgb(255, 255, 255)',
              borderColor: 'rgba(0, 0, 0, 0)',
              borderWidth: '0px',
              borderStyle: 'none',
              borderRadius: '16px',
              boxShadow: 'none',
              paddingTop: '16px',
              paddingRight: '16px',
              paddingBottom: '16px',
              paddingLeft: '16px',
              marginTop: '0px',
              marginRight: '0px',
              marginBottom: '0px',
              marginLeft: '0px',
              rowGap: '8px',
              columnGap: '8px',
              gap: '8px',
            },
          },
          {
            panel_id: 'bottom_bar',
            selector: '[data-panel="bottom_bar"]',
            descendantMetrics: {
              bottom_sheet_handle_present: false,
              active_tab_present: true,
              floating_primary_action_present: true,
              segmented_control_active_present: true,
              control_rects: [{ width: 44, height: 44 }, { width: 56, height: 56 }],
              loading_state_present: false,
              skeleton_state_present: true,
              error_state_present: true,
              search_active_present: true,
            },
            computedStyle: {
              fontFamily: 'Inter, sans-serif',
              fontWeight: '500',
              fontSize: '14px',
              lineHeight: '20px',
              letterSpacing: '0px',
              color: 'rgb(79, 70, 229)',
              backgroundColor: 'rgb(255, 255, 255)',
              borderColor: 'rgb(229, 231, 235)',
              borderWidth: '1px',
              borderStyle: 'solid',
              borderRadius: '0px',
              boxShadow: 'none',
              transitionDuration: '240ms',
              transitionTimingFunction: 'cubic-bezier(0.32, 0.72, 0, 1)',
              animationDuration: '0ms',
              paddingTop: '12px',
              paddingRight: '12px',
              paddingBottom: '12px',
              paddingLeft: '12px',
              marginTop: '0px',
              marginRight: '0px',
              marginBottom: '0px',
              marginLeft: '0px',
              rowGap: '8px',
              columnGap: '8px',
              gap: '8px',
            },
          },
        ],
      }, null, 2));

      const result = spawnSync('node', [
        'bin/xflow.js',
        'visual',
        'export-visual-tokens',
        '--project-root',
        projectRoot,
        '--input',
        'fixtures/dom-snapshot.json',
        '--output',
        '.as-xflow/exported-visual-tokens.json',
        '--json',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });

      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.ok, true);
      assert.ok(payload.observed_visual_tokens.font_families.includes('Inter'));
      assert.ok(payload.observed_visual_tokens.font_weights.includes(400));
      assert.ok(payload.observed_visual_tokens.font_weights.includes(600));
      assert.ok(payload.observed_visual_tokens.text_sizes.includes(16));
      assert.ok(payload.observed_visual_tokens.text_sizes.includes(24));
      assert.ok(payload.observed_visual_tokens.line_heights.includes(24));
      assert.ok(payload.observed_visual_tokens.line_heights.includes(32));
      assert.ok(payload.observed_visual_tokens.letter_spacings.includes(0));
      assert.ok(payload.observed_visual_tokens.letter_spacings.includes(0.2));
      assert.ok(payload.observed_visual_tokens.radius_values.includes(12));
      assert.ok(payload.observed_visual_tokens.border_widths.includes(1));
      assert.ok(payload.observed_visual_tokens.border_styles.includes('solid'));
      assert.ok(payload.observed_visual_tokens.border_weight_tiers.includes('hairline'));
      assert.ok(payload.observed_visual_tokens.icon_density_values.some((value) => value > 1));
      assert.ok(payload.observed_visual_tokens.icon_size_values.includes(16));
      assert.ok(payload.observed_visual_tokens.shadow_signatures.some((value) => value.includes('rgba(15, 23, 42, 0.12)')));
      assert.ok(payload.observed_visual_tokens.shadow_strength_tiers.some((value) => ['medium', 'strong'].includes(value)));
      assert.equal(payload.observed_visual_tokens.safe_area_top_inset, 47);
      assert.equal(payload.observed_visual_tokens.safe_area_bottom_inset, 34);
      assert.equal(payload.observed_visual_tokens.keyboard_inset_bottom, 290);
      assert.equal(payload.observed_visual_tokens.bottom_sheet_handle_present, true);
      assert.equal(payload.observed_visual_tokens.tabbar_active_state_present, true);
      assert.equal(payload.observed_visual_tokens.floating_primary_action_present, true);
      assert.equal(payload.observed_visual_tokens.segmented_control_active_state_present, true);
      assert.equal(payload.observed_visual_tokens.loading_state_present, true);
      assert.equal(payload.observed_visual_tokens.skeleton_state_present, true);
      assert.equal(payload.observed_visual_tokens.error_state_present, true);
      assert.equal(payload.observed_visual_tokens.search_active_present, true);
      assert.ok(payload.observed_visual_tokens.component_semantics.includes('loading_state'));
      assert.ok(payload.observed_visual_tokens.component_semantics.includes('skeleton_state'));
      assert.ok(payload.observed_visual_tokens.component_semantics.includes('error_state'));
      assert.ok(payload.observed_visual_tokens.component_semantics.includes('search_active'));
      assert.ok(payload.observed_visual_tokens.platform_physics_profiles.includes('ios_spring'));
      assert.equal(typeof payload.observed_visual_tokens.color_roles.canvas, 'string');
      assert.equal(existsSync(resolve(projectRoot, '.as-xflow', 'exported-visual-tokens.json')), true);
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('visual capture-page-evidence records extra interaction states and icon-density tokens', () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'fixtures'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'fixtures', 'stateful-page.html'), `<!doctype html>
<html>
  <body style="margin:0;background:#f8fafc;font-family:Inter,sans-serif">
    <main data-panel="main" style="padding:20px;background:#f8fafc">
      <button id="toggle" data-panel="toolbar" style="display:flex;align-items:center;gap:8px;padding:10px 14px;border:1px solid #cbd5e1;border-radius:10px;background:#ffffff;color:#0f172a;box-shadow:0 1px 2px rgba(15,23,42,0.08)">
        <svg data-icon viewBox="0 0 16 16" width="16" height="16"><circle cx="8" cy="8" r="6" fill="#4f46e5"></circle></svg>
        <span>Toggle</span>
      </button>
      <section id="detail" data-panel="detail" style="margin-top:16px;padding:20px;border:1px solid #e2e8f0;border-radius:14px;background:#ffffff;box-shadow:0 10px 24px rgba(15,23,42,0.14);display:none">
        <div class="icon-row" style="display:flex;gap:10px">
          <svg data-icon viewBox="0 0 20 20" width="20" height="20"><rect x="3" y="3" width="14" height="14" rx="4" fill="#0ea5e9"></rect></svg>
          <svg data-icon viewBox="0 0 20 20" width="20" height="20"><rect x="3" y="3" width="14" height="14" rx="4" fill="#22c55e"></rect></svg>
        </div>
      </section>
    </main>
    <script>
      const toggle = document.getElementById('toggle');
      const detail = document.getElementById('detail');
      toggle.addEventListener('click', () => {
        detail.style.display = detail.style.display === 'none' ? 'block' : 'none';
        toggle.style.boxShadow = detail.style.display === 'block' ? '0 12px 28px rgba(79, 70, 229, 0.22)' : '0 1px 2px rgba(15,23,42,0.08)';
      });
    </script>
  </body>
</html>`);

      const result = spawnSync('node', [
        'bin/xflow.js',
        'visual',
        'capture-page-evidence',
        '--project-root',
        projectRoot,
        '--url',
        `file://${resolve(projectRoot, 'fixtures', 'stateful-page.html')}`,
        '--snapshot-output',
        '.as-xflow/stateful-snapshot.json',
        '--screenshot-output',
        'output/playwright/stateful-page.png',
        '--visual-tokens-output',
        '.as-xflow/stateful-tokens.json',
        '--capture-states-json',
        JSON.stringify([
          { id: 'hover-toggle', hover_selector: '#toggle', wait_ms: 60 },
          { id: 'detail-open', click_selector: '#toggle', wait_ms: 60 },
        ]),
        '--json',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 10000,
      });

      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.ok, true);
      assert.equal(Array.isArray(payload.states), true);
      assert.equal(payload.states.length, 2);
      assert.ok(payload.states.some((state) => state.id === 'detail-open'));
      assert.ok(payload.visual_tokens.observed_visual_tokens.icon_density_values.some((value) => value > 0));
      assert.ok(payload.visual_tokens.observed_visual_tokens.icon_size_values.includes(16));
      assert.ok(payload.visual_tokens.observed_visual_tokens.icon_size_values.includes(20));
      assert.ok(payload.visual_tokens.observed_visual_tokens.shadow_strength_tiers.some((value) => ['medium', 'strong'].includes(value)));
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('visual capture-page-evidence supports swipe, drag, and scroll interaction states', () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'fixtures'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'fixtures', 'gesture-page.html'), `<!doctype html>
<html>
  <body style="margin:0;font-family:Inter,sans-serif;background:#f8fafc">
    <main data-panel="main" style="height:640px;overflow:auto;padding:16px;background:#f8fafc">
      <section data-panel="sheet" id="sheet" style="height:120px;border-radius:18px;background:#ffffff;padding-top:16px;transition:transform 120ms ease">
        <div id="sheet-handle" style="width:40px;height:4px;border-radius:999px;background:#cbd5e1;margin:0 auto 12px;cursor:grab"></div>
        <div id="sheet-state">collapsed</div>
      </section>
      <div style="height:24px"></div>
      <div data-panel="list" style="display:flex;gap:12px;align-items:flex-start">
        <div id="drag-card" style="width:80px;height:80px;border-radius:16px;background:#93c5fd;cursor:grab"></div>
        <div id="drop-zone" style="width:120px;height:120px;border:2px dashed #94a3b8;border-radius:16px"></div>
      </div>
      <div style="height:600px"></div>
      <div id="scroll-marker" data-panel="detail" style="height:120px;border-radius:16px;background:#ffffff;border:1px solid #e2e8f0">bottom</div>
    </main>
    <script>
      const handle = document.getElementById('sheet-handle');
      const sheet = document.getElementById('sheet');
      const sheetState = document.getElementById('sheet-state');
      let startY = null;
      handle.addEventListener('mousedown', (event) => { startY = event.clientY; });
      document.addEventListener('mouseup', (event) => {
        if (startY === null) return;
        if (startY - event.clientY > 30) {
          sheet.style.transform = 'translateY(-48px)';
          sheet.setAttribute('data-state-target', 'revealed');
          sheetState.textContent = 'revealed';
        }
        startY = null;
      });

      const dragCard = document.getElementById('drag-card');
      const dropZone = document.getElementById('drop-zone');
      let dragging = false;
      dragCard.addEventListener('mousedown', () => { dragging = true; });
      document.addEventListener('mouseup', () => {
        if (!dragging) return;
        dragging = false;
        dropZone.style.background = '#bfdbfe';
        dropZone.setAttribute('data-active', 'true');
      });
    </script>
  </body>
</html>`);

      const result = spawnSync('node', [
        'bin/xflow.js',
        'visual',
        'capture-page-evidence',
        '--project-root',
        projectRoot,
        '--url',
        `file://${resolve(projectRoot, 'fixtures', 'gesture-page.html')}`,
        '--snapshot-output',
        '.as-xflow/gesture-snapshot.json',
        '--screenshot-output',
        'output/playwright/gesture-page.png',
        '--capture-states-json',
        JSON.stringify([
          { id: 'sheet-revealed', swipe_selector: '#sheet-handle', swipe_direction: 'up', swipe_distance: 72, state_variant: 'revealed', wait_ms: 60 },
          { id: 'card-dragged', drag_selector: '#drag-card', drag_to_selector: '#drop-zone', state_variant: 'dragged', wait_ms: 60 },
          { id: 'list-scrolled', scroll_selector: '[data-panel=\"main\"]', scroll_dy: 400, state_variant: 'focused', wait_ms: 60 },
        ]),
        '--json',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 30000,
      });

      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.ok, true);
      assert.ok(payload.states.some((state) => state.id === 'sheet-revealed' && state.state_variant === 'revealed'));
      assert.ok(payload.states.some((state) => state.id === 'card-dragged' && state.state_variant === 'dragged'));
      assert.ok(payload.states.some((state) => state.id === 'list-scrolled'));
      assert.ok(payload.states.every((state) => existsSync(resolve(projectRoot, state.screenshot_file))));
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('visual capture-page-evidence can auto-discover candidate interaction states', () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'fixtures'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'fixtures', 'auto-state-page.html'), `<!doctype html>
<html>
  <body style="margin:0;background:#fff;font-family:Inter,sans-serif">
    <main data-panel="main" style="padding:24px">
      <button id="primary" data-panel="toolbar" aria-controls="detail-panel" style="padding:10px 14px;border:1px solid #d1d5db;border-radius:10px;background:#fff">Open detail</button>
    </main>
  </body>
</html>`);

      const result = spawnSync('node', [
        'bin/xflow.js',
        'visual',
        'capture-page-evidence',
        '--project-root',
        projectRoot,
        '--url',
        `file://${resolve(projectRoot, 'fixtures', 'auto-state-page.html')}`,
        '--snapshot-output',
        '.as-xflow/auto-state-snapshot.json',
        '--screenshot-output',
        'output/playwright/auto-state-page.png',
        '--auto-discover-states',
        '--state-limit',
        '2',
        '--json',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 10000,
      });

      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.ok, true);
      assert.equal(Array.isArray(payload.states), true);
      assert.equal(payload.states.length, 2);
      assert.ok(payload.states.some((state) => state.id.startsWith('auto-click-')));
      assert.ok(payload.states.every((state) => state.source === 'auto_discovered'));
      assert.ok((payload.states[0].priority_score || 0) >= (payload.states[1].priority_score || 0));
      assert.equal(typeof payload.states[0].priority_reason, 'string');
      assert.ok(payload.states[0].label.toLowerCase().includes('detail'));
      assert.ok(payload.states.every((state) => state.workbench_state_type === 'detail_open'));
      assert.ok(payload.states.every((state) => state.component_family === 'toolbar_controls'));
      assert.ok(payload.states.every((state) => ['hover', 'active'].includes(state.state_variant)));
      assert.ok(payload.states.every((state) => state.state_visual_tokens == null || typeof state.state_visual_tokens === 'object'));
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('visual diff-images computes real diff metrics for local images', () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'fixtures'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'fixtures', 'ref.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#ffffff"/></svg>');
      writeFileSync(resolve(projectRoot, 'fixtures', 'cand.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#ffffff"/></svg>');

      const result = spawnSync('node', [
        'bin/xflow.js',
        'visual',
        'diff-images',
        '--project-root',
        projectRoot,
        '--reference',
        'fixtures/ref.svg',
        '--candidate',
        'fixtures/cand.svg',
        '--heatmap-output',
        'output/playwright/diff-heatmap.png',
        '--report-output',
        'output/playwright/diff-report.html',
        '--json',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 10000,
      });

      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.ok, true);
      assert.equal(payload.pixel_diff_ratio, 0);
      assert.equal(payload.layout_shift_score, 0);
      assert.equal(payload.structural_similarity > 0.99, true);
      assert.ok(Array.isArray(payload.hotspots));
      assert.equal(existsSync(resolve(projectRoot, 'output', 'playwright', 'diff-heatmap.png')), true);
      assert.equal(existsSync(resolve(projectRoot, 'output', 'playwright', 'diff-report.html')), true);
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('visual render-report renders an HTML compare viewer from a benchmark artifact', () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'specs', 'changes', 'chg-report'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'refs'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'output'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'refs', 'main.png'), 'ref');
      writeFileSync(resolve(projectRoot, 'output', 'main.png'), 'shot');
      writeFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-report', 'visual_benchmark.json'), JSON.stringify({
        version: 1,
        benchmark_mode: 'reference_backed',
        benchmark_input_mode: 'reference_scenarios',
        competitor_product: 'CompetitorX',
        required_modules: ['workspace'],
        matrix_status: 'pass',
        matrix_checks: [],
        scenarios: [
          {
            id: 'desktop-main',
            viewport: { width: 1440, height: 900 },
            reference_image: 'refs/main.png',
            screenshot_image: 'output/main.png',
            diff_metrics: {
              status: 'pass',
              values: { structural_similarity: 0.97, layout_shift_score: 0.01, pixel_diff_ratio: 0.03 },
              thresholds: { structural_similarity_min: 0.9, layout_shift_score_max: 0.08, pixel_diff_ratio_max: 0.12 },
              hotspots: [],
              heatmap_file: null,
            },
            structure_checks: [{ id: 'workspace-shell', status: 'pass' }],
            token_checks: [],
            state_transition_checks: [],
            motion_transition_checks: [],
            state_contract_checks: [],
            state_family_checks: [],
            screenshot_evidence_mode: 'reference_backed',
            status: 'pass',
          },
        ],
      }, null, 2));

      const result = spawnSync('node', [
        'bin/xflow.js',
        'visual',
        'render-report',
        '--project-root',
        projectRoot,
        '--input',
        'specs/changes/chg-report/visual_benchmark.json',
        '--output',
        'output/playwright/benchmark-report.html',
        '--json',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 5000,
      });

      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.ok, true);
      assert.equal(existsSync(resolve(projectRoot, 'output', 'playwright', 'benchmark-report.html')), true);
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('corps governed entry exposes dry-run proof contract as json', () => {
    const projectRoot = makeProjectRoot();
    try {
      const result = spawnSync('node', [
        'bin/xflow.js',
        'corps',
        '--project-root',
        projectRoot,
        '--change-id',
        'chg-corps-entry',
        '--title',
        'Corps governed entry',
        '--change-type',
        'frontend',
        '--dry-run',
        '--json',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });

      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.ok, true);
      assert.equal(payload.entry, 'corps');
      assert.equal(payload.workflow, 'corps');
      assert.equal(payload.dry_run, true);
      assert.match(payload.proof_required, /specs\/changes\/chg-corps-entry\/corps_proof\.json$/);
      assert.equal(payload.competitor_led_ui_mode.detected, false);
      assert.equal(payload.competitor_led_ui_mode.benchmark_input_present, false);
      assert.deepEqual(payload.entry_contract_issues, []);
      assert.equal(payload.benchmark_contract.competitor_product, 'required');
      assert.deepEqual(payload.benchmark_contract.required_modules, []);
      assert.equal(payload.benchmark_contract.enforcement, 'optional_unless_competitor_led');
      assert.equal(payload.benchmark_contract.input_contract, 'exactly_one_of(reference_scenarios_json, capture_url+reference_image)');
      assert.equal(payload.benchmark_contract.reference_scenarios_json, 'optional_path_a');
      assert.equal(payload.benchmark_contract.capture_url, 'optional_path_b');
      assert.equal(payload.benchmark_contract.reference_image, 'required_with_path_b');
      assert.equal(payload.strict_runtime_contract.governed_workflow_manifest, 'built-in corps workflow only');
      assert.ok(payload.strict_runtime_contract.forbidden_fallbacks.includes('stub'));
      assert.ok(payload.human_role.includes('inspect corps_proof.json before accepting completion'));
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('corps explain gives first-time operator guide without executing', () => {
    const result = spawnSync('node', [
      'bin/xflow.js',
      'corps',
      '--explain',
      '--title',
      'First corps run',
      '--change-id',
      'first-corps-run',
      '--json',
    ], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 3000,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.mode, 'operator_guide');
    assert.ok(payload.first_time_sequence.includes('xflow goal audit --json'));
    assert.ok(payload.first_time_sequence.some((command) => command.includes('--dry-run --json')));
    assert.ok(payload.proof_contract.some((item) => item.includes('corps_proof.json')));
    assert.equal(payload.competitor_led_inputs.rule, 'competitor-led UI requires a primary reference surface and exactly one benchmark evidence path before execution');
    assert.ok(payload.docs.includes('docs/corps-operator-guide.md'));
  });

  test('corps dry-run auto-detects competitor-led UI mode and marks benchmark evidence as required', () => {
    const projectRoot = makeProjectRoot();
    try {
      const result = spawnSync('node', [
        'bin/xflow.js',
        'corps',
        '--project-root',
        projectRoot,
        '--change-id',
        'chg-corps-competitor',
        '--title',
        'TickTick 像素级复刻',
        '--change-type',
        'frontend',
        '--competitor-product',
        'TickTick',
        '--primary-reference-surface',
        'desktop_primary_workspace',
        '--dry-run',
        '--json',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });

      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.ok, true);
      assert.equal(payload.competitor_led_ui_mode.detected, true);
      assert.equal(payload.competitor_led_ui_mode.enforced, true);
      assert.ok(payload.competitor_led_ui_mode.reasons.includes('competitor_product'));
      assert.ok(payload.entry_contract_issues.includes('competitor_led_ui_requires_benchmark_input'));
      assert.equal(payload.entry_contract_issues.includes('competitor_led_ui_requires_primary_reference_surface'), false);
      assert.equal(payload.benchmark_contract.enforcement, 'required');
      assert.equal(payload.benchmark_contract.primary_reference_surface, 'desktop_primary_workspace');
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('corps fails fast before workflow execution when competitor-led UI lacks benchmark evidence', () => {
    const projectRoot = makeProjectRoot();
    try {
      const result = spawnSync('node', [
        'bin/xflow.js',
        'corps',
        '--project-root',
        projectRoot,
        '--change-id',
        'chg-corps-missing-benchmark',
        '--title',
        'Linear clone',
        '--change-type',
        'frontend',
        '--competitor-product',
        'Linear',
        '--primary-reference-surface',
        'issue_workspace',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });

      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /Competitor-led UI detected at corps entry/);
      assert.match(result.stderr, /reference-scenarios-json/);
      assert.match(result.stderr, /capture-url/);
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('corps fails fast before workflow execution when competitor-led UI lacks a primary reference surface', () => {
    const projectRoot = makeProjectRoot();
    try {
      const result = spawnSync('node', [
        'bin/xflow.js',
        'corps',
        '--project-root',
        projectRoot,
        '--change-id',
        'chg-corps-missing-primary-reference',
        '--title',
        'Things clone',
        '--change-type',
        'frontend',
        '--competitor-product',
        'Things',
        '--capture-url',
        'http://localhost:4174/mock',
        '--reference-image',
        'refs/mock.png',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });

      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /primary reference surface/);
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('proof rejects incomplete corps runs and writes a failing proof artifact', () => {
    const projectRoot = makeProjectRoot();
    try {
      const result = spawnSync('node', [
        'bin/xflow.js',
        'proof',
        '--track',
        'corps',
        '--project-root',
        projectRoot,
        '--change-id',
        'chg-incomplete-corps',
        '--json',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });

      assert.notEqual(result.status, 0, result.stdout);
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.ok, false);
      assert.equal(payload.completed_event_seen, false);
      assert.ok(payload.missing_phases.includes('change-init'));
      assert.ok(payload.missing_artifacts.includes('status.json'));
      assert.ok(payload.missing_artifacts.includes('competitor_reconstruction_review.json'));
      assert.ok(payload.missing_artifacts.includes('design_system_pack.json'));
      assert.ok(payload.missing_artifacts.includes('image_reference_set.json'));
      assert.ok(payload.missing_artifacts.includes('visual_benchmark.json'));
      assert.ok(payload.missing_artifacts.includes('ux_design_brief.json'));
      assert.ok(payload.missing_artifacts.includes('pencil_output.pen'));
      assert.ok(payload.missing_artifacts.includes('llm_design_review.json'));
      assert.ok(payload.missing_artifacts.includes('aesthetic_review.json'));
      assert.ok(payload.missing_artifacts.includes('design_accept.json'));
      assert.ok(payload.missing_artifacts.includes('pencil_output.attestation.json'));
      assert.ok(payload.missing_artifacts.includes('execute.json'));
      assert.equal(
        JSON.parse(readFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-incomplete-corps', 'corps_proof.json'), 'utf8')).ok,
        false,
      );
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('proof accepts a completed corps log only when required artifacts exist', () => {
    const projectRoot = makeProjectRoot();
    const changeId = 'chg-complete-corps';
    const workflow = yaml.load(readFileSync(resolve(REPO_ROOT, 'workflows', 'corps.yaml'), 'utf8'));
    const phaseIds = workflow.phases.map((phase) => phase.id);
    const requiredArtifacts = [
      'status.json',
      'proposal.md',
      'design_contract.json',
      'competitor_reconstruction_review.json',
      'reference_surface_lock.json',
      'reconstruction_pack.json',
      'generation_contract.json',
      'design_system_pack.json',
      'image_reference_set.json',
      'visual_direction_synthesis.json',
      'layout_competition.json',
      'visual_benchmark.json',
      'design_selection.json',
      'ux_design_brief.json',
      'pencil_output.pen',
      'llm_design_review.json',
      'aesthetic_review.json',
      'benchmark_repair_plan.json',
      'design_accept.json',
      'pencil_output.attestation.json',
      'plan.md',
      'tdd/red-0.json',
      'execute.json',
      'tdd/green-0.json',
      'tdd/quality-0.json',
      'review.json',
      'qa_acceptance.json',
      'gate_final.json',
    ];

    try {
      const changeRoot = resolve(projectRoot, 'specs', 'changes', changeId);
      mkdirSync(resolve(projectRoot, 'refs'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'output'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'refs', 'ticktick-main.png'), 'ref');
      writeFileSync(resolve(projectRoot, 'refs', 'ticktick-detail.png'), 'ref');
      writeFileSync(resolve(projectRoot, 'output', 'ticktick-main.png'), 'shot');
      writeFileSync(resolve(projectRoot, 'output', 'ticktick-detail.png'), 'shot');
      for (const artifact of requiredArtifacts) {
        const path = resolve(changeRoot, artifact);
        mkdirSync(resolve(path, '..'), { recursive: true });
        if (artifact === 'competitor_reconstruction_review.json') {
          writeFileSync(path, `${JSON.stringify({
            competitor_reconstruction_contract: {
              status: 'frozen',
              competitor_product: 'CompetitorX',
              target_surfaces: ['primary_workspace', 'detail_drawer'],
              primary_reference_surface: 'primary_workspace',
              supporting_reference_surfaces: ['detail_drawer'],
              required_modules: ['navigation', 'workspace', 'detail'],
              primary_journeys: ['create_to_review', 'review_to_complete'],
              business_logic_invariants: ['domain_invariant_a'],
              decomposition_requirements: {
                surface_map_required: true,
                layout_map_required: true,
                component_inventory_required: true,
                state_inventory_required: true,
                visual_token_map_required: true,
                reference_intermediate_model_required: true,
              },
            },
          }, null, 2)}\n`);
          continue;
        }
        if (artifact === 'reference_surface_lock.json') {
          writeFileSync(path, `${JSON.stringify({
            reference_surface_lock: {
              status: 'locked',
              primary_reference_surface: 'primary_workspace',
            },
          }, null, 2)}\n`);
          continue;
        }
        if (artifact === 'reconstruction_pack.json') {
          writeFileSync(path, `${JSON.stringify({
            reconstruction_pack: {
              status: 'ready',
              surface_map: [{ surface_id: 'primary_workspace' }],
              layout_map: { regions: [{ id: 'workspace' }] },
              component_inventory: [{ id: 'workspace_component' }],
              component_blueprint: [{ id: 'workspace_list_row_1', module: 'workspace', primitive_role: 'list_row' }],
              state_inventory: [{ id: 'review_state' }],
              visual_token_map: { color_roles: ['surface'] },
              reference_intermediate_model: { reference_dom_regions: [{ id: 'workspace' }], relationship_graph: [{ id: 'workspace_order' }] },
            },
          }, null, 2)}\n`);
          continue;
        }
        if (artifact === 'generation_contract.json') {
          writeFileSync(path, `${JSON.stringify({
            generation_contract: {
              status: 'ready',
              layout_constraints: { required_regions: ['workspace'] },
              component_constraints: {
                required_families: ['workbench_region'],
                component_blueprint: [{ id: 'workspace_list_row_1', module: 'workspace', primitive_role: 'list_row' }],
                staged_generation: { stages: [{ id: 'primary_focus', target_component_ids: ['workspace_list_row_1'] }] },
              },
              state_constraints: { required_states: ['review'] },
              visual_constraints: {
                image_reference_generation: {
                  enabled: true,
                  model_capability: 'gpt-image-v2',
                  required_outputs: [
                    { id: 'primary_surface_reference_frame' },
                    { id: 'component_density_sheet' },
                    { id: 'state_polish_sheet' },
                  ],
                },
                token_contract: { color_roles: { surface: '#ffffff' } },
                geometry_hints: { alignment_rules: ['align repeated primitives'] },
                token_hints: { typography_roles: ['list_body'] },
              },
              repair_policy: { mode: 'component_target_only' },
            },
          }, null, 2)}\n`);
          continue;
        }
        if (artifact === 'design_system_pack.json') {
          writeFileSync(path, `${JSON.stringify({
            status: 'ready',
            practice_sources: [
              { id: 'lovable' },
              { id: 'open_design' },
              { id: 'open_codesign' },
              { id: 'openui' },
            ],
            component_policy: {
              allowed_primitives: ['button', 'input', 'table', 'tabs'],
              required_states: ['default', 'hover', 'focus', 'selected', 'loading', 'empty', 'error'],
            },
            preview_loop: {
              required_artifacts: ['image_reference_set.json', 'visual_benchmark.json', 'aesthetic_review.json'],
            },
          }, null, 2)}\n`);
          continue;
        }
        if (artifact === 'image_reference_set.json') {
          const referenceIds = ['primary_surface_reference_frame', 'component_density_sheet', 'state_polish_sheet'];
          for (const id of referenceIds) {
            const referencePath = resolve(changeRoot, 'image-references', `${id}.md`);
            mkdirSync(resolve(referencePath, '..'), { recursive: true });
            writeFileSync(referencePath, `# ${id}\n`);
          }
          writeFileSync(path, `${JSON.stringify({
            status: 'ready',
            model_capability: 'gpt-image-v2',
            references: referenceIds.map((id) => ({
              id,
              status: 'ready',
              artifact_path: `specs/changes/${changeId}/image-references/${id}.md`,
            })),
          }, null, 2)}\n`);
          continue;
        }
        if (artifact === 'visual_benchmark.json') {
          writeFileSync(path, `${JSON.stringify({
            benchmark_mode: 'reference_backed',
            benchmark_input_mode: 'reference_scenarios',
            competitor_product: 'CompetitorX',
            required_modules: ['navigation', 'workspace', 'detail'],
            scenarios: [
              {
                id: 'desktop-main',
                viewport: { width: 1440, height: 900 },
                capture_url: 'http://127.0.0.1:4173/',
                reference_image: 'refs/ticktick-main.png',
                screenshot_image: 'output/ticktick-main.png',
                diff_metrics: {
                  status: 'pass',
                  values: { structural_similarity: 0.94, layout_shift_score: 0.03 },
                  thresholds: { structural_similarity_min: 0.9, layout_shift_score_max: 0.08, pixel_diff_ratio_max: 0.12 },
                },
                structure_checks: [{ id: 'three-column-layout', status: 'pass' }],
                screenshot_evidence_mode: 'captured_page',
                layout_observations: {
                  dom_rects: [
                    { panel_id: 'workspace', selector: '[data-panel=workspace]', left: 0, top: 0, width: 1000, height: 700 },
                  ],
                },
                observed_visual_tokens: { panel_count: 1 },
                status: 'pass',
              },
              {
                id: 'detail-panel',
                viewport: { width: 1440, height: 900 },
                reference_image: 'refs/ticktick-detail.png',
                screenshot_image: 'output/ticktick-detail.png',
                diff_metrics: {
                  status: 'pass',
                  values: { structural_similarity: 0.92, layout_shift_score: 0.04 },
                  thresholds: { structural_similarity_min: 0.9, layout_shift_score_max: 0.08, pixel_diff_ratio_max: 0.12 },
                },
                structure_checks: [{ id: 'right-detail-panel', status: 'pass' }],
                status: 'pass',
              },
            ],
          }, null, 2)}\n`);
          continue;
        }
        if (artifact === 'aesthetic_review.json') {
          writeFileSync(path, `${JSON.stringify({
            status: 'accept',
            score: 0.94,
            min_accept_score: 0.88,
            blockers: [],
            final_product_surface_evidence: {
              required: true,
              captured_scenario_count: 1,
              ready: true,
            },
          }, null, 2)}\n`);
          continue;
        }
        writeFileSync(path, artifact.endsWith('.md') ? '# proof\n' : '{"ok":true}\n');
      }
      writeStrictCorpsExecutionLog(projectRoot, changeId);

      const result = spawnSync('node', [
        'bin/xflow.js',
        'proof',
        '--track',
        'corps',
        '--project-root',
        projectRoot,
        '--change-id',
        changeId,
        '--json',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });

      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.ok, true);
      assert.deepEqual(payload.missing_phases, []);
      assert.deepEqual(payload.missing_artifacts, []);
      assert.deepEqual(payload.contract_failures, []);
      assert.ok(payload.required_artifacts.includes('competitor_reconstruction_review.json'));
      assert.ok(payload.required_artifacts.includes('design_system_pack.json'));
      assert.ok(payload.required_artifacts.includes('image_reference_set.json'));
      assert.ok(payload.required_artifacts.includes('visual_benchmark.json'));
      assert.ok(payload.required_artifacts.includes('ux_design_brief.json'));
      assert.ok(payload.required_artifacts.includes('pencil_output.pen'));
      assert.ok(payload.required_artifacts.includes('llm_design_review.json'));
      assert.ok(payload.required_artifacts.includes('aesthetic_review.json'));
      assert.ok(payload.required_artifacts.includes('design_accept.json'));
      assert.ok(payload.required_artifacts.includes('pencil_output.attestation.json'));
      assert.ok(payload.required_artifacts.includes('execute.json'));
      assert.equal(
        JSON.parse(readFileSync(resolve(changeRoot, 'corps_proof.json'), 'utf8')).ok,
        true,
      );
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('proof accepts a completed corps log when benchmark evidence is declared through capture_url', () => {
    const projectRoot = makeProjectRoot();
    const changeId = 'chg-complete-corps-capture-url';
    const workflow = yaml.load(readFileSync(resolve(REPO_ROOT, 'workflows', 'corps.yaml'), 'utf8'));
    const phaseIds = workflow.phases.map((phase) => phase.id);
    const requiredArtifacts = [
      'status.json',
      'proposal.md',
      'design_contract.json',
      'competitor_reconstruction_review.json',
      'reference_surface_lock.json',
      'reconstruction_pack.json',
      'generation_contract.json',
      'design_system_pack.json',
      'image_reference_set.json',
      'visual_direction_synthesis.json',
      'layout_competition.json',
      'visual_benchmark.json',
      'design_selection.json',
      'ux_design_brief.json',
      'pencil_output.pen',
      'llm_design_review.json',
      'aesthetic_review.json',
      'benchmark_repair_plan.json',
      'design_accept.json',
      'pencil_output.attestation.json',
      'plan.md',
      'tdd/red-0.json',
      'execute.json',
      'tdd/green-0.json',
      'tdd/quality-0.json',
      'review.json',
      'qa_acceptance.json',
      'gate_final.json',
    ];

    try {
      const changeRoot = resolve(projectRoot, 'specs', 'changes', changeId);
      mkdirSync(resolve(projectRoot, 'refs'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'output'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'refs', 'competitor-main.png'), 'ref');
      writeFileSync(resolve(projectRoot, 'output', 'competitor-main.png'), 'shot');
      for (const artifact of requiredArtifacts) {
        const path = resolve(changeRoot, artifact);
        mkdirSync(resolve(path, '..'), { recursive: true });
        if (artifact === 'competitor_reconstruction_review.json') {
          writeFileSync(path, `${JSON.stringify({
            competitor_reconstruction_contract: {
              status: 'frozen',
              competitor_product: 'CompetitorX',
              target_surfaces: ['primary_workspace'],
              primary_reference_surface: 'primary_workspace',
              supporting_reference_surfaces: [],
              required_modules: ['workspace', 'detail'],
              primary_journeys: ['capture_to_review'],
              business_logic_invariants: ['domain_invariant_a'],
              decomposition_requirements: {
                surface_map_required: true,
                layout_map_required: true,
                component_inventory_required: true,
                state_inventory_required: true,
                visual_token_map_required: true,
                reference_intermediate_model_required: true,
              },
            },
          }, null, 2)}\n`);
          continue;
        }
        if (artifact === 'reference_surface_lock.json') {
          writeFileSync(path, `${JSON.stringify({
            reference_surface_lock: {
              status: 'locked',
              primary_reference_surface: 'primary_workspace',
            },
          }, null, 2)}\n`);
          continue;
        }
        if (artifact === 'reconstruction_pack.json') {
          writeFileSync(path, `${JSON.stringify({
            reconstruction_pack: {
              status: 'ready',
              surface_map: [{ surface_id: 'primary_workspace' }],
              layout_map: { regions: [{ id: 'workspace' }] },
              component_inventory: [{ id: 'workspace_component' }],
              component_blueprint: [{ id: 'workspace_list_row_1', module: 'workspace', primitive_role: 'list_row' }],
              state_inventory: [{ id: 'review_state' }],
              visual_token_map: { color_roles: ['surface'] },
              reference_intermediate_model: { reference_dom_regions: [{ id: 'workspace' }], relationship_graph: [{ id: 'workspace_order' }] },
            },
          }, null, 2)}\n`);
          continue;
        }
        if (artifact === 'generation_contract.json') {
          writeFileSync(path, `${JSON.stringify({
            generation_contract: {
              status: 'ready',
              layout_constraints: { required_regions: ['workspace'] },
              component_constraints: {
                required_families: ['workbench_region'],
                component_blueprint: [{ id: 'workspace_list_row_1', module: 'workspace', primitive_role: 'list_row' }],
                staged_generation: { stages: [{ id: 'primary_focus', target_component_ids: ['workspace_list_row_1'] }] },
              },
              state_constraints: { required_states: ['review'] },
              visual_constraints: {
                image_reference_generation: {
                  enabled: true,
                  model_capability: 'gpt-image-v2',
                  required_outputs: [
                    { id: 'primary_surface_reference_frame' },
                    { id: 'component_density_sheet' },
                    { id: 'state_polish_sheet' },
                  ],
                },
                token_contract: { color_roles: { surface: '#ffffff' } },
                geometry_hints: { alignment_rules: ['align repeated primitives'] },
                token_hints: { typography_roles: ['list_body'] },
              },
              repair_policy: { mode: 'component_target_only' },
            },
          }, null, 2)}\n`);
          continue;
        }
        if (artifact === 'design_system_pack.json') {
          writeFileSync(path, `${JSON.stringify({
            status: 'ready',
            practice_sources: [
              { id: 'lovable' },
              { id: 'open_design' },
              { id: 'open_codesign' },
              { id: 'openui' },
            ],
            component_policy: {
              allowed_primitives: ['button', 'input', 'table', 'tabs'],
              required_states: ['default', 'hover', 'focus', 'selected', 'loading', 'empty', 'error'],
            },
            preview_loop: {
              required_artifacts: ['image_reference_set.json', 'visual_benchmark.json', 'aesthetic_review.json'],
            },
          }, null, 2)}\n`);
          continue;
        }
        if (artifact === 'image_reference_set.json') {
          const referenceIds = ['primary_surface_reference_frame', 'component_density_sheet', 'state_polish_sheet'];
          for (const id of referenceIds) {
            const referencePath = resolve(changeRoot, 'image-references', `${id}.md`);
            mkdirSync(resolve(referencePath, '..'), { recursive: true });
            writeFileSync(referencePath, `# ${id}\n`);
          }
          writeFileSync(path, `${JSON.stringify({
            status: 'ready',
            model_capability: 'gpt-image-v2',
            references: referenceIds.map((id) => ({
              id,
              status: 'ready',
              artifact_path: `specs/changes/${changeId}/image-references/${id}.md`,
            })),
          }, null, 2)}\n`);
          continue;
        }
        if (artifact === 'visual_benchmark.json') {
          writeFileSync(path, `${JSON.stringify({
            benchmark_mode: 'reference_backed',
            benchmark_input_mode: 'capture_url',
            competitor_product: 'CompetitorX',
            required_modules: ['workspace', 'detail'],
            scenarios: [
              {
                id: 'captured-main',
                viewport: { width: 1440, height: 900 },
                capture_url: 'http://127.0.0.1:4174/',
                reference_image: 'refs/competitor-main.png',
                screenshot_image: 'output/competitor-main.png',
                diff_metrics: {
                  status: 'pass',
                  values: { structural_similarity: 0.95, layout_shift_score: 0.03, pixel_diff_ratio: 0.05 },
                  thresholds: { structural_similarity_min: 0.9, layout_shift_score_max: 0.08, pixel_diff_ratio_max: 0.12 },
                },
                structure_checks: [{ id: 'workspace-detail-layout', status: 'pass' }],
                screenshot_evidence_mode: 'captured_page',
                evidence: { reference_image_exists: true, screenshot_image_exists: true },
                status: 'pass',
                blockers: [],
              },
            ],
          }, null, 2)}\n`);
          continue;
        }
        if (artifact === 'aesthetic_review.json') {
          writeFileSync(path, `${JSON.stringify({
            status: 'accept',
            score: 0.94,
            min_accept_score: 0.88,
            blockers: [],
            final_product_surface_evidence: {
              required: true,
              captured_scenario_count: 1,
              ready: true,
            },
          }, null, 2)}\n`);
          continue;
        }
        writeFileSync(path, artifact.endsWith('.md') ? '# proof\n' : '{"ok":true}\n');
      }
      writeStrictCorpsExecutionLog(projectRoot, changeId);

      const result = spawnSync('node', [
        'bin/xflow.js',
        'proof',
        '--track',
        'corps',
        '--project-root',
        projectRoot,
        '--change-id',
        changeId,
        '--json',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });

      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.ok, true);
      assert.deepEqual(payload.contract_failures, []);
      assert.ok(payload.required_artifacts.includes('design_system_pack.json'));
      assert.ok(payload.required_artifacts.includes('image_reference_set.json'));
      assert.equal(
        JSON.parse(readFileSync(resolve(changeRoot, 'corps_proof.json'), 'utf8')).ok,
        true,
      );
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('proof rejects corps completion when any required runtime falls back to stub', () => {
    const projectRoot = makeProjectRoot();
    const changeId = 'chg-corps-stub-forbidden';
    try {
      writeCompleteCorpsArtifacts(projectRoot, changeId);
      writeStrictCorpsExecutionLog(projectRoot, changeId, {
        stubAtom: { phase_id: 'execute', atom_id: 'I2.phase_run.dispatch' },
      });

      const result = spawnSync('node', [
        'bin/xflow.js',
        'proof',
        '--track',
        'corps',
        '--project-root',
        projectRoot,
        '--change-id',
        changeId,
        '--json',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });

      assert.notEqual(result.status, 0, result.stdout);
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.ok, false);
      assert.ok(payload.strict_runtime_failures.includes('stub_adapter_forbidden:execute:I2.phase_run.dispatch'));
      assert.ok(payload.strict_runtime_failures.includes('stub_status_forbidden:execute:I2.phase_run.dispatch:task_queued'));
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('proof rejects corps completion when a phase completion witness is missing', () => {
    const projectRoot = makeProjectRoot();
    const changeId = 'chg-corps-skip-forbidden';
    try {
      writeCompleteCorpsArtifacts(projectRoot, changeId);
      writeStrictCorpsExecutionLog(projectRoot, changeId, {
        omitPhaseCompleted: 'pencil_draft',
      });

      const result = spawnSync('node', [
        'bin/xflow.js',
        'proof',
        '--track',
        'corps',
        '--project-root',
        projectRoot,
        '--change-id',
        changeId,
        '--json',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });

      assert.notEqual(result.status, 0, result.stdout);
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.ok, false);
      assert.ok(payload.missing_phases.includes('pencil_draft'));
      assert.ok(payload.strict_runtime_failures.includes('phase_completed_missing:pencil_draft'));
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('governed corps entry ignores project-local workflow overrides that would shorten corps', () => {
    const projectRoot = makeProjectRoot();
    try {
      writeFileSync(resolve(projectRoot, '.as-xflow', 'config.json'), JSON.stringify({
        version: 1,
        project_root: projectRoot,
        workflows: {
          corps: 'short-corps.yaml',
          heavy: 'short-corps.yaml',
        },
      }, null, 2));
      writeFileSync(resolve(projectRoot, 'short-corps.yaml'), `
name: corps
version: 1
track: heavy
requires:
  agentos_http: false
  gh: false
  pencil: false
phases:
  - id: change-init
    label: "Tampered short init"
    catalog_ref: 1
    required: true
    atoms: []
    gate:
      type: skip
`);

      const result = spawnSync('node', [
        'bin/xflow.js',
        'corps',
        '--project-root',
        projectRoot,
        '--change-id',
        'chg-corps-config-tamper',
        '--title',
        'Config tamper',
        '--change-type',
        'frontend',
        '--dry-run',
        '--json',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });

      assert.equal(result.status, 0, result.stderr || result.stdout);
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.workflow_path, resolve(REPO_ROOT, 'workflows', 'corps.yaml'));
      assert.notEqual(payload.workflow_path, resolve(projectRoot, 'short-corps.yaml'));
      assert.equal(payload.strict_runtime_contract.governed_workflow_manifest, 'built-in corps workflow only');
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('workflow aliases honor project-local xflow config', () => {
    const projectRoot = makeProjectRoot();
    const workflowPath = resolve(projectRoot, 'custom-lite.yaml');
    try {
      writeFileSync(resolve(projectRoot, '.as-xflow', 'config.json'), JSON.stringify({
        version: 1,
        project_root: projectRoot,
        workflows: {
          lite: 'custom-lite.yaml',
          heavy: 'workflows/corps.yaml',
        },
      }, null, 2));
      writeFileSync(workflowPath, `
name: configured-lite
version: 1
track: lite
requires:
  agentos_http: false
  gh: false
  pencil: false
phases:
  - id: change-init
    label: "Configured init"
    catalog_ref: 1
    required: true
    atoms: []
    gate:
      type: skip
`);

      const result = spawnSync('node', [
        'bin/xflow.js',
        'workflow',
        'validate',
        'yolo',
        '--project-root',
        projectRoot,
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });

      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      assert.match(result.stdout, /custom-lite\.yaml is valid/);
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('score reports competitive readiness in text and json modes', () => {
    let result = spawnSync('node', ['bin/xflow.js', 'score'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 3000,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    assert.match(result.stdout, /xflow score: 100\/100/);
    assert.match(result.stdout, /Cross-tool portability/);
    assert.match(result.stdout, /Boundary: internal competitive readiness only/);
    assert.match(result.stdout, /Publish ready: not yet/);
    assert.match(result.stdout, /Release gates: published_package/);
    assert.match(result.stdout, /Check: xflow release status --json/);

    result = spawnSync('node', ['bin/xflow.js', 'score', '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 3000,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.score, 100);
    assert.equal(payload.scope, 'competitive_internal_readiness');
    assert.equal(payload.boundary.release_status_command, 'xflow release status --json');
    assert.equal(payload.boundary.ready_for_publish, false);
    assert.equal(payload.boundary.ready_for_splash, false);
    assert.deepEqual(payload.boundary.blocking_surfaces, ['published_package', 'third_party_adoption']);
    assert.equal(payload.boundary.next_action.id, 'verify_release_pack');
    assert.ok(payload.dimensions.some((dimension) => dimension.id === 'ecosystem_packaging'));
    assert.ok(payload.dimensions.some((dimension) => dimension.id === 'tdd_code_quality_push'));
    assert.ok(payload.dimensions.every((dimension) => Array.isArray(dimension.evidence) && dimension.evidence.every((item) => item.ok)));
  });

  test('assess reports quality scorecard in text and json modes', () => {
    let result = spawnSync('node', ['bin/xflow.js', 'assess'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 3000,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    assert.match(result.stdout, /xflow quality assessment/);
    assert.match(result.stdout, /Codex goal comparison/);
    assert.match(result.stdout, /xflow:goal/);
    assert.match(result.stdout, /xflow:yolo/);
    assert.match(result.stdout, /xflow:corps/);
    assert.match(result.stdout, /Readiness ladder:/);
    assert.match(result.stdout, /source_checkout: ready/);
    assert.match(result.stdout, /open_source_launch: blocked \(published_package\)/);
    assert.match(result.stdout, /industry_splash: blocked \(published_package, third_party_adoption\)/);
    assert.match(result.stdout, /Objective audit:/);
    assert.match(result.stdout, /goal_vs_codex: proven_project_layer/);
    assert.match(result.stdout, /yolo_delivery: proven_from_source/);
    assert.match(result.stdout, /corps_delivery: proven_from_source/);
    assert.match(result.stdout, /Boundary: internal_quality=ready/);

    result = spawnSync('node', ['bin/xflow.js', 'assess', '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 3000,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.competitive_score.score, 100);
    assert.equal(payload.competitive_score.goal_alignment, 'strong');
    assert.equal(payload.readiness.source_checkout.status, 'ready');
    assert.equal(payload.readiness.open_source_launch.status, 'blocked');
    assert.deepEqual(payload.readiness.open_source_launch.blockers, ['published_package']);
    assert.equal(payload.readiness.industry_splash.status, 'blocked');
    assert.deepEqual(payload.readiness.industry_splash.blockers, ['published_package', 'third_party_adoption']);
    assert.equal(payload.objective_audit.find((item) => item.id === 'goal_vs_codex').status, 'proven_project_layer');
    assert.equal(payload.objective_audit.find((item) => item.id === 'yolo_delivery').status, 'proven_from_source');
    assert.equal(payload.objective_audit.find((item) => item.id === 'corps_delivery').status, 'proven_from_source');
    assert.equal(payload.objective_audit.find((item) => item.id === 'skill_family_open_source_credibility').status, 'ready_from_source_checkout');
    assert.deepEqual(payload.objective_audit.find((item) => item.id === 'open_source_launch').blockers, ['published_package']);
    assert.deepEqual(payload.objective_audit.find((item) => item.id === 'industry_splash').blockers, ['published_package', 'third_party_adoption']);
    assert.ok(payload.scorecard.some((item) => item.surface === 'xflow:goal' && item.grade === 'A'));
    assert.ok(payload.docs.includes('docs/quality-assessment.md'));
    assert.ok(payload.proof_commands.includes('xflow goal audit --json'));
    assert.ok(payload.proof_commands.includes('xflow launch audit --pre-publish --strict --json'));
    assert.ok(payload.proof_commands.includes('xflow adoption validate --splash --json'));
    assert.ok(payload.proof_commands.includes('xflow launch audit --splash --strict --json'));
    assert.ok(payload.proof_commands.includes('npm run release:pack'));
    assert.equal(payload.completion_boundary.internal_quality, 'ready');
    assert.equal(payload.completion_boundary.codex_goal_comparison, 'proven at the project layer when xflow goal audit passes');
    assert.ok(payload.completion_boundary.external_blockers.some((item) => item.id === 'npm_auth_and_publish'));
    assert.ok(payload.completion_boundary.external_blockers.some((item) => item.id === 'third_party_adoption'));
  });

  test('evaluate gives one-shot external evaluator brief', () => {
    let result = spawnSync('node', ['bin/xflow.js', 'evaluate'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 3000,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    assert.match(result.stdout, /xflow evaluate/);
    assert.match(result.stdout, /Recommended path: source_checkout/);
    assert.match(result.stdout, /Readiness: source_checkout=ready; open_source_launch=blocked; industry_splash=blocked/);
    assert.match(result.stdout, /Objective audit: goal_vs_codex=proven_project_layer; yolo_delivery=proven_from_source; corps_delivery=proven_from_source/);
    assert.match(result.stdout, /Launch ready: not yet/);
    assert.match(result.stdout, /Splash launch ready: not yet/);
    assert.match(result.stdout, /Splash blocked claims: third_party_adoption, published_package/);
    assert.match(result.stdout, /Competitive position:/);
    assert.match(result.stdout, /Codex goal:/);
    assert.match(result.stdout, /Superpowers:/);
    assert.match(result.stdout, /published_package/);
    assert.match(result.stdout, /run_pre_publish_launch_audit/);
    assert.match(result.stdout, /npm publish --access public/);
    assert.match(result.stdout, /Package evidence: not yet/);
    assert.match(result.stdout, /Package next action:/);
    assert.match(result.stdout, /Release owner status: blocked by published_package/);
    assert.match(result.stdout, /Release owner next: verify_release_pack: npm run release:pack/);
    assert.match(result.stdout, /Splash next actions:/);
    assert.match(result.stdout, /record_third_party_adoption/);

    result = spawnSync('node', ['bin/xflow.js', 'evaluate', '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 3000,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.recommended_path, 'source_checkout');
    assert.equal(payload.quality.score, 100);
    assert.equal(payload.quality.completion_boundary.internal_quality, 'ready');
    assert.equal(payload.quality.readiness.source_checkout.status, 'ready');
    assert.equal(payload.quality.readiness.open_source_launch.status, 'blocked');
    assert.deepEqual(payload.quality.readiness.open_source_launch.blockers, ['published_package']);
    assert.equal(payload.quality.readiness.industry_splash.status, 'blocked');
    assert.deepEqual(payload.quality.readiness.industry_splash.blockers, ['published_package', 'third_party_adoption']);
    assert.equal(payload.quality.objective_audit.find((item) => item.id === 'goal_vs_codex').status, 'proven_project_layer');
    assert.equal(payload.quality.objective_audit.find((item) => item.id === 'yolo_delivery').status, 'proven_from_source');
    assert.equal(payload.quality.objective_audit.find((item) => item.id === 'corps_delivery').status, 'proven_from_source');
    assert.equal(payload.quality.objective_audit.find((item) => item.id === 'skill_family_open_source_credibility').status, 'ready_from_source_checkout');
    assert.deepEqual(payload.quality.objective_audit.find((item) => item.id === 'open_source_launch').blockers, ['published_package']);
    assert.deepEqual(payload.quality.objective_audit.find((item) => item.id === 'industry_splash').blockers, ['published_package', 'third_party_adoption']);
    assert.equal(payload.launch.ready, false);
    assert.ok(payload.launch.missing_surfaces.includes('published_package'));
    assert.ok(payload.launch.next_actions.some((item) => item.id === 'verify_release_pack'));
    assert.ok(payload.launch.next_actions.some((item) => item.id === 'check_package_preflight'));
    assert.ok(payload.launch.next_actions.some((item) => item.id === 'run_pre_publish_launch_audit'));
    assert.ok(payload.launch.next_actions.some((item) => item.id === 'publish_package'));
    assert.equal(payload.launch.package_evidence.ok, false);
    assert.ok(payload.launch.package_evidence.next_actions.some((item) => item.id === 'verify_registry_publication'));
    assert.equal(payload.release_owner.ready_for_publish, false);
    assert.equal(payload.release_owner.ready_for_splash, false);
    assert.equal(payload.release_owner.blocking_surface, 'published_package');
    assert.equal(payload.release_owner.next_action.id, 'verify_release_pack');
    assert.equal(payload.release_owner.package_status.ok, false);
    assert.equal(payload.release_owner.handoff_doc, 'docs/npm-publish-handoff.md');
    assert.match(payload.release_owner.boundary, /Goal evidence proves durable project direction/);
    assert.equal(payload.splash_launch.ready, false);
    assert.ok(payload.splash_launch.missing_surfaces.includes('published_package'));
    assert.equal(payload.splash_launch.missing_surfaces.includes('third_party_adoption'), true);
    assert.equal(payload.splash_launch.next_actions.some((item) => item.id === 'record_third_party_adoption'), true);
    assert.equal(payload.splash_launch.package_evidence.ok, false);
    assert.ok(payload.claims.allowed.includes('project_goal_beats_thread_goal'));
    assert.ok(payload.claims.blocked.includes('published_package'));
    assert.ok(payload.claims.forbidden_phrases.includes('openflow is publicly installable from npm'));
    assert.ok(payload.splash_claims.allowed.includes('project_goal_beats_thread_goal'));
    assert.ok(payload.splash_claims.blocked.includes('published_package'));
    assert.ok(payload.splash_claims.forbidden_phrases.includes('splash launch complete'));
    assert.equal(payload.competitive.codex_goal.target, 'codex-goal');
    assert.ok(payload.competitive.codex_goal.xflow_edges.some((edge) => edge.includes('.xflow/GOAL.md')));
    assert.equal(payload.competitive.codex_goal.boundary.role, 'project_direction_anchor');
    assert.ok(payload.competitive.codex_goal.boundary.not_for.some((item) => item.includes('replacing plan.md')));
    assert.equal(payload.competitive.superpowers.target, 'superpowers');
    assert.ok(payload.competitive.superpowers.target_edges.some((edge) => edge.includes('behavioral guidance')));
    assert.ok(payload.quickstart.source_checkout.commands.includes('npm run release:pack'));
    assert.ok(payload.quickstart.release_owner_gates.commands.includes('xflow release status --json'));
    assert.ok(payload.quickstart.release_owner_gates.commands.includes('xflow adoption trial --name <team-or-project> --source <tracker-or-pr> --track yolo'));
    assert.ok(payload.quickstart.release_owner_gates.commands.includes('xflow adoption kit --name <team-or-project> --source <tracker-or-pr> --track yolo'));
    assert.ok(payload.quickstart.release_owner_gates.commands.includes('xflow adoption status --json'));
    assert.ok(payload.quickstart.release_owner_gates.commands.includes('xflow adoption validate --splash --json'));
    assert.ok(payload.quickstart.release_owner_gates.commands.includes('xflow package status --json'));
    assert.ok(payload.quickstart.release_owner_gates.commands.includes('xflow launch audit --splash --strict --json'));
    assert.ok(payload.proof_commands.includes('xflow evaluate --json'));
    assert.ok(payload.proof_commands.includes('xflow release status --json'));
    assert.ok(payload.proof_commands.includes('xflow compare codex-goal --json'));
    assert.ok(payload.proof_commands.includes('xflow compare superpowers --json'));
    assert.ok(payload.proof_commands.includes('xflow adoption status --json'));
    assert.ok(payload.proof_commands.includes('xflow package status --json'));
    assert.ok(payload.proof_commands.includes('xflow adoption trial --name <team-or-project> --source <tracker-or-pr> --track yolo --json'));
    assert.ok(payload.proof_commands.includes('xflow adoption validate --splash --json'));
    assert.ok(payload.proof_commands.includes('xflow launch audit --splash --strict --json'));
  });

  test('objective reports top-level product objective status in text and json modes', () => {
    let result = spawnSync('node', ['bin/xflow.js', 'objective'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 3000,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    assert.match(result.stdout, /xflow objective audit/);
    assert.match(result.stdout, /goal_vs_codex: proven_project_layer/);
    assert.match(result.stdout, /yolo_delivery: proven_from_source/);
    assert.match(result.stdout, /corps_delivery: proven_from_source/);
    assert.match(result.stdout, /open_source_launch: blocked/);
    assert.match(result.stdout, /industry_splash: blocked/);
    assert.match(result.stdout, /Release owner next: verify_release_pack: npm run release:pack/);

    result = spawnSync('node', ['bin/xflow.js', 'objective', '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 3000,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.items.find((item) => item.id === 'goal_vs_codex').status, 'proven_project_layer');
    assert.equal(payload.items.find((item) => item.id === 'yolo_delivery').status, 'proven_from_source');
    assert.equal(payload.items.find((item) => item.id === 'corps_delivery').status, 'proven_from_source');
    assert.equal(payload.items.find((item) => item.id === 'skill_family_open_source_credibility').status, 'ready_from_source_checkout');
    assert.deepEqual(payload.items.find((item) => item.id === 'open_source_launch').blockers, ['published_package']);
    assert.deepEqual(payload.items.find((item) => item.id === 'industry_splash').blockers, ['published_package', 'third_party_adoption']);
    assert.equal(payload.release_owner.ready_for_publish, false);
    assert.equal(payload.release_owner.ready_for_splash, false);
    assert.equal(payload.release_owner.next_action.id, 'verify_release_pack');
    assert.ok(payload.proof_commands.includes('xflow objective --json'));
  });

  test('evaluate surfaces pre-publish package owner actions', () => {
    const registryNotFound = JSON.stringify({ error: 'E404' });
    let result = spawnSync('node', ['bin/xflow.js', 'evaluate', '--pre-publish', '--registry-json', registryNotFound], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 3000,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    assert.match(result.stdout, /Package evidence: not yet/);
    assert.match(result.stdout, /Package next action: authenticate_npm: npm login && npm whoami/);

    result = spawnSync('node', ['bin/xflow.js', 'evaluate', '--pre-publish', '--registry-json', registryNotFound, '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 3000,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.launch.mode, 'pre_publish');
    assert.equal(payload.launch.package_evidence.registry_status, 'available');
    assert.ok(payload.launch.package_evidence.issues.some((issue) => issue.includes('npm identity missing')));
    assert.ok(payload.launch.package_evidence.next_actions.some((item) => item.id === 'authenticate_npm'));
    assert.equal(payload.release_owner.blocking_surface, 'package_preflight');
    assert.equal(payload.release_owner.next_action.command, 'npm login && npm whoami');
    assert.equal(payload.release_owner.package_status.registry_status, 'available');
  });

  test('release status gives focused release-owner blocker and next action', () => {
    let result = spawnSync('node', ['bin/xflow.js', 'release', 'status'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 3000,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    assert.match(result.stdout, /xflow release status/);
    assert.match(result.stdout, /Publish ready: not yet/);
    assert.match(result.stdout, /Blocking surface: published_package/);
    assert.match(result.stdout, /Blocking surfaces: published_package, third_party_adoption/);
    assert.match(result.stdout, /Next action: verify_release_pack: npm run release:pack/);
    assert.match(result.stdout, /External trial: xflow adoption trial --name <third-party-project> --source <public-pr-or-external-repo> --track yolo/);
    assert.match(result.stdout, /Handoff: docs\/npm-publish-handoff.md/);

    result = spawnSync('node', ['bin/xflow.js', 'release', 'status', '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 3000,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, false);
    assert.equal(payload.release_owner.blocking_surface, 'published_package');
    assert.deepEqual(payload.release_owner.blocking_surfaces, ['published_package', 'third_party_adoption']);
    assert.equal(payload.release_owner.next_action.id, 'verify_release_pack');
    assert.equal(payload.release_owner.external_trial_command, 'xflow adoption trial --name <third-party-project> --source <public-pr-or-external-repo> --track yolo');
    assert.equal(payload.release_owner.handoff_doc, 'docs/npm-publish-handoff.md');

    const registryNotFound = JSON.stringify({ error: 'E404' });
    result = spawnSync('node', ['bin/xflow.js', 'release', 'status', '--pre-publish', '--registry-json', registryNotFound, '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 3000,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    const prePublishPayload = JSON.parse(result.stdout);
    assert.equal(prePublishPayload.release_owner.mode, 'pre_publish');
    assert.equal(prePublishPayload.release_owner.blocking_surface, 'package_preflight');
    assert.ok(prePublishPayload.release_owner.blocking_surfaces.includes('package_preflight'));
    assert.equal(prePublishPayload.release_owner.next_action.command, 'npm login && npm whoami');
  });

  test('demo launch reports goal-to-yolo and goal-to-corps proof paths', () => {
    let result = spawnSync('node', ['bin/xflow.js', 'demo', 'launch'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 3000,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    assert.match(result.stdout, /openflow public launch demo/);
    assert.match(result.stdout, /Goal to yolo/);
    assert.match(result.stdout, /Goal to corps proof/);

    result = spawnSync('node', ['bin/xflow.js', 'demo', 'launch', '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 3000,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.ok(payload.paths.some((item) => item.id === 'goal-to-yolo'));
    assert.ok(payload.paths.some((item) => item.id === 'goal-to-corps-proof'));
    assert.ok(payload.docs.includes('docs/launch-demo.md'));
    assert.ok(payload.acceptance_gate.includes('npm run release:pack'));
  });

  test('demo clean runs a temporary clean-project adoption smoke', () => {
    let result = spawnSync('node', ['bin/xflow.js', 'demo', 'clean'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 10000,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    assert.match(result.stdout, /xflow demo clean/);
    assert.match(result.stdout, /Status: pass/);
    assert.match(result.stdout, /validate_yolo/);

    result = spawnSync('node', ['bin/xflow.js', 'demo', 'clean', '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 10000,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.demo, 'clean_project_adoption');
    assert.equal(payload.cleaned_up, true);
    assert.equal(payload.artifacts.project_config, true);
    assert.equal(payload.artifacts.goal_file, true);
    assert.ok(payload.commands.some((item) => item.id === 'init_project' && item.ok));
    assert.ok(payload.commands.some((item) => item.id === 'audit_goal' && item.ok));
    assert.ok(payload.commands.some((item) => item.id === 'validate_yolo' && item.ok));
    assert.ok(payload.docs.includes('docs/demo-proof.md'));
  });

  test('launch audit separates ready adoption evidence from missing package proof', () => {
    let result = spawnSync('node', ['bin/xflow.js', 'launch', 'audit'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 3000,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    assert.match(result.stdout, /xflow launch audit/);
    assert.match(result.stdout, /Launch ready: not yet/);
    assert.match(result.stdout, /Passing evidence/);
    assert.match(result.stdout, /Available checks/);
    assert.match(result.stdout, /published_package/);
    assert.match(result.stdout, /Next actions/);
    assert.match(result.stdout, /xflow package audit --check-registry --json/);
    assert.doesNotMatch(result.stdout, /real_external_adoption/);

    result = spawnSync('node', ['bin/xflow.js', 'launch', 'audit', '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 3000,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.launch_ready, false);
    assert.equal(payload.competitive_score.score, 100);
    assert.equal(payload.adoption_evidence.ok, true);
    assert.equal(payload.adoption_evidence.record_count, 1);
    assert.equal(payload.adoption_evidence.records[0].path, 'docs/adoption/openflow-release-hardening.md');
    assert.equal(payload.adoption_evidence.third_party_ok, false);
    assert.equal(payload.adoption_evidence.records[0].scope, 'maintainer_dogfood');
    assert.equal(payload.goal_evidence.ok, true);
    assert.equal(payload.package_evidence.ok, false);
    assert.equal(payload.package_evidence.checked_registry, false);
    assert.equal(payload.missing_surfaces.some((item) => item.id === 'real_external_adoption'), false);
    assert.ok(payload.missing_surfaces.some((item) => item.id === 'published_package'));
    assert.ok(payload.available_surfaces.includes('npm run publish:check'));
    assert.ok(payload.available_surfaces.includes('xflow evaluate --json'));
    assert.ok(payload.available_surfaces.includes('xflow release status --json'));
    assert.ok(payload.available_surfaces.includes('xflow adoption status --json'));
    assert.ok(payload.available_surfaces.includes('xflow package status --json'));
    assert.ok(payload.available_surfaces.includes('xflow launch claims --json'));
    assert.ok(payload.available_surfaces.includes('xflow launch copy --json'));
    assert.ok(payload.available_surfaces.includes('xflow package preflight --check-registry --check-auth --json'));
    assert.ok(payload.available_surfaces.includes('xflow package audit --check-registry --json'));
    assert.ok(payload.ready_surfaces.includes('xflow assess --json'));
    assert.ok(payload.ready_surfaces.includes('xflow score --json'));
    assert.ok(payload.ready_surfaces.includes('xflow goal audit --json'));
    assert.ok(payload.ready_surfaces.includes('xflow adoption validate --json'));
    assert.equal(payload.ready_surfaces.includes('xflow package preflight --check-registry --check-auth --json'), false);
    assert.equal(payload.ready_surfaces.includes('xflow package audit --check-registry --json'), false);
    assert.equal(payload.ready_surfaces.includes('xflow launch audit --splash --strict --json'), false);
    assert.ok(payload.docs.includes('docs/adoption/README.md'));
    assert.ok(payload.docs.includes('docs/launch-dossier.md'));
    assert.ok(payload.docs.includes('docs/examples-gallery.md'));
    assert.ok(payload.release_gate.includes('xflow adoption validate --json'));
    assert.ok(payload.release_gate.includes('xflow evaluate --json'));
    assert.ok(payload.release_gate.includes('xflow release status --json'));
    assert.ok(payload.release_gate.includes('xflow adoption trial --name <team-or-project> --source <tracker-or-pr> --track yolo --json'));
    assert.ok(payload.release_gate.includes('xflow goal audit --json'));
    assert.ok(payload.release_gate.includes('xflow adoption status --json'));
    assert.ok(payload.release_gate.includes('xflow launch claims --json'));
    assert.ok(payload.release_gate.includes('xflow launch copy --json'));
    assert.ok(payload.release_gate.includes('xflow package status --json'));
    assert.ok(payload.release_gate.includes('xflow package preflight --check-registry --check-auth --json'));
    assert.ok(payload.release_gate.includes('xflow launch audit --strict --json'));
    assert.ok(payload.release_gate.includes('xflow launch audit --splash --strict --json'));
    assert.ok(payload.next_actions.some((item) => item.id === 'publish_package'));
    assert.ok(payload.next_actions.some((item) => item.command === 'npm run release:pack'));
    assert.ok(payload.next_actions.some((item) => item.command === 'xflow package preflight --check-registry --check-auth --json'));
    assert.ok(payload.next_actions.some((item) => item.command === 'xflow launch audit --pre-publish --strict --json'));
    assert.ok(payload.next_actions.some((item) => item.command === 'xflow package audit --check-registry --json'));
    assert.ok(payload.next_actions.some((item) => item.command === 'xflow launch audit --strict --json'));

    result = spawnSync('node', ['bin/xflow.js', 'launch', 'audit', '--splash', '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 3000,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    const splashPayload = JSON.parse(result.stdout);
    assert.equal(splashPayload.splash, true);
    assert.equal(splashPayload.adoption_evidence.ok, true);
    assert.equal(splashPayload.adoption_evidence.third_party_ok, false);
    assert.equal(splashPayload.missing_surfaces.some((item) => item.id === 'third_party_adoption'), true);

    result = spawnSync('node', ['bin/xflow.js', 'launch', 'audit', '--strict', '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 3000,
    });

    assert.equal(result.status, 1, result.stderr || result.stdout || String(result.error));
    const strictPayload = JSON.parse(result.stdout);
    assert.equal(strictPayload.ok, false);
    assert.equal(strictPayload.strict, true);
    assert.equal(strictPayload.launch_ready, false);
    assert.equal(strictPayload.adoption_evidence.ok, true);
    assert.equal(strictPayload.missing_surfaces.some((item) => item.id === 'published_package'), true);
    assert.ok(strictPayload.next_actions.some((item) => item.id === 'verify_registry_publication'));
  });

  test('launch claims separates usable public claims from blocked claims', () => {
    let result = spawnSync('node', ['bin/xflow.js', 'launch', 'claims'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 3000,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    assert.match(result.stdout, /xflow launch claims/);
    assert.match(result.stdout, /Allowed public claims/);
    assert.match(result.stdout, /Hold these claims/);
    assert.match(result.stdout, /published_package/);

    result = spawnSync('node', ['bin/xflow.js', 'launch', 'claims', '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 3000,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.launch_ready, false);
    assert.ok(payload.allowed_claims.some((item) => item.id === 'project_goal_beats_thread_goal'));
    assert.ok(payload.allowed_claims.some((item) => item.id === 'copy_paste_safe_first_run'));
    assert.ok(payload.blocked_claims.some((item) => item.id === 'published_package'));
    assert.equal(payload.audit.package_ok, false);
    assert.equal(payload.audit.goal_ok, true);
    assert.equal(payload.audit.adoption_ok, true);
    assert.equal(payload.audit.third_party_adoption_ok, false);

    result = spawnSync('node', ['bin/xflow.js', 'launch', 'claims', '--splash', '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 3000,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    const splashPayload = JSON.parse(result.stdout);
    assert.equal(splashPayload.audit.splash, true);
    assert.equal(splashPayload.blocked_claims.some((item) => item.id === 'third_party_adoption'), true);

    result = spawnSync('node', ['bin/xflow.js', 'launch', 'claims', '--strict', '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 3000,
    });

    assert.equal(result.status, 1, result.stderr || result.stdout || String(result.error));
    const strictPayload = JSON.parse(result.stdout);
    assert.equal(strictPayload.launch_ready, false);
    assert.ok(strictPayload.blocked_claims.some((item) => item.id === 'published_package'));
  });

  test('launch copy renders claim-safe public announcement assets', () => {
    let result = spawnSync('node', ['bin/xflow.js', 'launch', 'copy'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 3000,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    assert.match(result.stdout, /openflow Launch Copy/);
    assert.match(result.stdout, /Safe Evaluation Command/);
    assert.match(result.stdout, /Forbidden Until Unblocked/);
    assert.match(result.stdout, /git clone <repo-url> openflow/);
    assert.match(result.stdout, /npm install -g openflow works now/);

    result = spawnSync('node', ['bin/xflow.js', 'launch', 'copy', '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 3000,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.launch_ready, false);
    assert.match(payload.headline, /executable workflow evidence/);
    assert.match(payload.install_command, /git clone <repo-url> openflow/);
    assert.ok(payload.proof_points.some((item) => item.id === 'project_goal_beats_thread_goal'));
    assert.ok(payload.hold_until_evidence.some((item) => item.id === 'published_package'));
    assert.ok(payload.forbidden_phrases.includes('npm install -g openflow works now'));
    assert.ok(payload.evidence_commands.includes('xflow evaluate --json'));
    assert.ok(payload.evidence_commands.includes('xflow launch claims --json'));
    assert.ok(payload.evidence_commands.includes('xflow launch copy --json'));

    result = spawnSync('node', ['bin/xflow.js', 'launch', 'copy', '--splash', '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 3000,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    const splashCopyPayload = JSON.parse(result.stdout);
    assert.equal(splashCopyPayload.splash, true);
    assert.equal(splashCopyPayload.hold_until_evidence.some((item) => item.id === 'third_party_adoption'), true);
    assert.ok(splashCopyPayload.evidence_commands.includes('xflow launch claims --splash --json'));
    assert.ok(splashCopyPayload.evidence_commands.includes('xflow launch copy --splash --json'));
    assert.ok(splashCopyPayload.evidence_commands.includes('xflow launch audit --splash --strict --json'));

    result = spawnSync('node', ['bin/xflow.js', 'launch', 'copy', '--strict', '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 3000,
    });

    assert.equal(result.status, 1, result.stderr || result.stdout || String(result.error));
    const strictPayload = JSON.parse(result.stdout);
    assert.equal(strictPayload.launch_ready, false);
    assert.ok(strictPayload.forbidden_phrases.includes('openflow is publicly installable from npm'));
  });

  test('launch dossier summarizes score, goal comparison, demo paths, and blockers', () => {
    const projectRoot = makeProjectRoot();
    try {
      const outputPath = resolve(projectRoot, 'launch-dossier.md');
      let result = spawnSync('node', [
        'bin/xflow.js',
        'launch',
        'dossier',
        '--project-root',
        projectRoot,
        '--json',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });

      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.ok, true);
      assert.equal(payload.audit.launch_ready, false);
      assert.equal(payload.splash_audit.launch_ready, false);
      assert.equal(payload.splash_audit.splash, true);
      assert.ok(payload.splash_audit.missing_surfaces.some((item) => item.id === 'third_party_adoption'));
      assert.match(payload.dossier, /openflow Launch Dossier/);
      assert.match(payload.dossier, /Codex native goal comparison/);
      assert.match(payload.dossier, /xflow:goal/);
      assert.match(payload.dossier, /xflow goal audit --json/);
      assert.match(payload.dossier, /Goal to yolo/);
      assert.match(payload.dossier, /Goal to corps proof/);
      assert.match(payload.dossier, /Runnable Examples/);
      assert.match(payload.dossier, /docs\/examples-gallery\.md/);
      assert.match(payload.dossier, /Missing Before Ordinary Launch/);
      assert.match(payload.dossier, /Missing Before Splash Launch/);
      assert.match(payload.dossier, /published_package/);
      assert.match(payload.dossier, /third_party_adoption/);
      assert.match(payload.dossier, /real_external_adoption/);

      result = spawnSync('node', [
        'bin/xflow.js',
        'launch',
        'dossier',
        '--project-root',
        projectRoot,
        '--output',
        outputPath,
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });

      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      assert.match(result.stdout, /xflow launch dossier: wrote/);
      assert.match(readFileSync(outputPath, 'utf8'), /Release Gate/);
      assert.match(readFileSync(outputPath, 'utf8'), /docs\/examples-gallery\.md/);

      result = spawnSync('node', [
        'bin/xflow.js',
        'launch',
        'dossier',
        '--help',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });

      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      assert.match(result.stdout, /Usage: xflow launch/);
      assert.doesNotMatch(result.stdout, /openflow Launch Dossier/);
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('launch audit removes adoption and package gaps when evidence validates', () => {
    const projectRoot = makeProjectRoot();
    try {
      writeFileSync(resolve(projectRoot, 'package.json'), JSON.stringify({ name: 'openflow', version: '0.1.0' }, null, 2));
      mkdirSync(resolve(projectRoot, '.xflow'), { recursive: true });
      writeFileSync(resolve(projectRoot, '.xflow', 'GOAL.md'), `# xflow Goal

## Goal

Ship a verified external adoption example.

## Updated

2026-05-22
`);
      const adoptionDir = resolve(projectRoot, 'docs', 'adoption');
      mkdirSync(adoptionDir, { recursive: true });
      writeFileSync(resolve(adoptionDir, 'clean-project.md'), `# Adoption: clean-project

Date: 2026-05-22
Source: public PR in clean-project
Track: both

## Context

A small external repository used xflow to finish a verified cleanup.

## Goal

Keep the package installable while removing stale workflow instructions.

## Commands

\`\`\`bash
xflow goal show --json
xflow assess --json
xflow workflow validate yolo --project-root .
\`\`\`

## Evidence

- \`docs/proof/status.json\`
- \`https://example.com/clean-project/pull/12\`

## Outcome

The review got better because the command evidence made the change easier to accept, and the team would use xflow again.

## Redactions

Repository names were sanitized.
`);

      let result = spawnSync('node', ['bin/xflow.js', 'launch', 'audit', '--project-root', projectRoot, '--json'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });

      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.launch_ready, false);
      assert.equal(payload.adoption_evidence.ok, true);
      assert.equal(payload.adoption_evidence.record_count, 1);
      assert.equal(payload.adoption_evidence.records[0].track, 'both');
      assert.equal(payload.adoption_evidence.records[0].scope, 'third_party');
      assert.equal(payload.missing_surfaces.some((item) => item.id === 'real_external_adoption'), false);
      assert.ok(payload.missing_surfaces.some((item) => item.id === 'published_package'));

      result = spawnSync('node', [
        'bin/xflow.js',
        'launch',
        'audit',
        '--project-root',
        projectRoot,
        '--pre-publish',
        '--registry-json',
        '{"error":"E404"}',
        '--whoami',
        'codex',
        '--strict',
        '--json',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });

      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      const prePublishPayload = JSON.parse(result.stdout);
      assert.equal(prePublishPayload.mode, 'pre_publish');
      assert.equal(prePublishPayload.launch_ready, true);
      assert.equal(prePublishPayload.package_evidence.ok, true);
      assert.equal(prePublishPayload.package_evidence.npm_identity, 'codex');
      assert.equal(prePublishPayload.package_evidence.registry_status, 'available');
      assert.ok(prePublishPayload.ready_surfaces.includes('xflow package preflight --check-registry --check-auth --json'));
      assert.ok(prePublishPayload.ready_surfaces.includes('xflow launch audit --pre-publish --strict --json'));

      const fakeBin = resolve(projectRoot, 'fake-bin');
      mkdirSync(fakeBin, { recursive: true });
      writeFileSync(resolve(fakeBin, 'npm'), '#!/bin/sh\n[ "$1" = "whoami" ] && { echo codex; exit 0; }\necho unexpected npm "$@" >&2\nexit 1\n', { mode: 0o755 });
      result = spawnSync('node', [
        'bin/xflow.js',
        'launch',
        'audit',
        '--project-root',
        projectRoot,
        '--pre-publish',
        '--registry-json',
        '{"error":"E404"}',
        '--strict',
        '--json',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
        env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH || ''}` },
      });

      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      const strictAutoPreflightPayload = JSON.parse(result.stdout);
      assert.equal(strictAutoPreflightPayload.launch_ready, true);
      assert.equal(strictAutoPreflightPayload.package_evidence.npm_identity, 'codex');
      assert.equal(strictAutoPreflightPayload.package_evidence.checked_registry, true);

      writeFileSync(resolve(fakeBin, 'npm'), '#!/bin/sh\n[ "$1" = "whoami" ] && { echo ENEEDAUTH >&2; exit 1; }\necho unexpected npm "$@" >&2\nexit 1\n', { mode: 0o755 });
      result = spawnSync('node', [
        'bin/xflow.js',
        'launch',
        'audit',
        '--project-root',
        projectRoot,
        '--pre-publish',
        '--registry-json',
        '{"error":"E404"}',
        '--strict',
        '--json',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
        env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH || ''}` },
      });

      assert.equal(result.status, 1, result.stderr || result.stdout || String(result.error));
      const prePublishBlockedPayload = JSON.parse(result.stdout);
      assert.equal(prePublishBlockedPayload.mode, 'pre_publish');
      assert.equal(prePublishBlockedPayload.package_evidence.ok, false);
      assert.ok(prePublishBlockedPayload.package_evidence.next_actions.some((item) => item.id === 'authenticate_npm'));

      result = spawnSync('node', [
        'bin/xflow.js',
        'launch',
        'audit',
        '--project-root',
        projectRoot,
        '--registry-json',
        '{"name":"openflow","version":"0.1.0"}',
        '--json',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });

      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      const readyPayload = JSON.parse(result.stdout);
      assert.equal(readyPayload.launch_ready, true);
      assert.equal(readyPayload.ok, true);
      assert.equal(readyPayload.package_evidence.ok, true);
      assert.equal(readyPayload.package_evidence.registry_version, '0.1.0');
      assert.equal(readyPayload.missing_surfaces.length, 0);
      assert.ok(readyPayload.ready_surfaces.includes('xflow package audit --check-registry --json'));
      assert.ok(readyPayload.ready_surfaces.includes('xflow launch audit --strict --json'));

      result = spawnSync('node', [
        'bin/xflow.js',
        'launch',
        'audit',
        '--project-root',
        projectRoot,
        '--registry-json',
        '{"name":"openflow","version":"0.1.0"}',
        '--splash',
        '--strict',
        '--json',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });

      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      const splashReadyPayload = JSON.parse(result.stdout);
      assert.equal(splashReadyPayload.splash, true);
      assert.equal(splashReadyPayload.launch_ready, true);
      assert.equal(splashReadyPayload.adoption_evidence.third_party_ok, true);
      assert.ok(splashReadyPayload.ready_surfaces.includes('xflow adoption validate --splash --json'));
      assert.ok(splashReadyPayload.ready_surfaces.includes('xflow launch audit --splash --strict --json'));

      result = spawnSync('node', [
        'bin/xflow.js',
        'launch',
        'audit',
        '--project-root',
        projectRoot,
        '--registry-json',
        '{"name":"openflow","version":"0.1.0"}',
        '--strict',
        '--json',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });

      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      const strictReadyPayload = JSON.parse(result.stdout);
      assert.equal(strictReadyPayload.ok, true);
      assert.equal(strictReadyPayload.strict, true);
      assert.equal(strictReadyPayload.launch_ready, true);
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('package audit validates captured npm registry evidence', () => {
    const projectRoot = makeProjectRoot();
    try {
      writeFileSync(resolve(projectRoot, 'package.json'), JSON.stringify({ name: 'openflow', version: '0.1.0' }, null, 2));

      let result = spawnSync('node', ['bin/xflow.js', 'package', 'audit', '--project-root', projectRoot, '--json'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });

      assert.equal(result.status, 1, result.stderr || result.stdout || String(result.error));
      let payload = JSON.parse(result.stdout);
      assert.equal(payload.ok, false);
      assert.ok(payload.issues.some((issue) => issue.includes('registry evidence missing')));
      assert.ok(payload.next_actions.some((action) => action.id === 'verify_registry_publication'));
      assert.ok(payload.next_actions.some((action) => action.command === 'xflow package audit --check-registry --json'));

      result = spawnSync('node', [
        'bin/xflow.js',
        'package',
        'audit',
        '--project-root',
        projectRoot,
        '--registry-json',
        '{"error":"E404"}',
        '--json',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });

      assert.equal(result.status, 1, result.stderr || result.stdout || String(result.error));
      payload = JSON.parse(result.stdout);
      assert.ok(payload.issues.some((issue) => issue.includes('not published')));
      assert.ok(payload.next_actions.some((action) => action.id === 'run_pre_publish_gate'));
      assert.ok(payload.next_actions.some((action) => action.id === 'publish_package'));

      result = spawnSync('node', [
        'bin/xflow.js',
        'package',
        'audit',
        '--project-root',
        projectRoot,
        '--registry-json',
        '{"name":"openflow","version":"0.1.0"}',
        '--json',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });

      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      payload = JSON.parse(result.stdout);
      assert.equal(payload.ok, true);
      assert.equal(payload.package_name, 'openflow');
      assert.equal(payload.registry_version, '0.1.0');
      assert.deepEqual(payload.next_actions, []);
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('package preflight checks npm identity and package-name availability without publishing', () => {
    const projectRoot = makeProjectRoot();
    try {
      writeFileSync(resolve(projectRoot, 'package.json'), JSON.stringify({ name: 'openflow', version: '0.1.0' }, null, 2));

      let result = spawnSync('node', [
        'bin/xflow.js',
        'package',
        'preflight',
        '--project-root',
        projectRoot,
        '--registry-json',
        '{"error":"E404"}',
        '--json',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });

      assert.equal(result.status, 1, result.stderr || result.stdout || String(result.error));
      let payload = JSON.parse(result.stdout);
      assert.equal(payload.ok, false);
      assert.equal(payload.registry_status, 'available');
      assert.ok(payload.issues.some((issue) => issue.includes('npm identity missing')));
      assert.ok(payload.next_actions.some((action) => action.id === 'authenticate_npm'));
      assert.ok(payload.next_actions.some((action) => action.command === 'npm login && npm whoami'));

      result = spawnSync('node', [
        'bin/xflow.js',
        'package',
        'preflight',
        '--project-root',
        projectRoot,
        '--registry-json',
        '{"error":"E404"}',
        '--whoami',
        'codex',
        '--json',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });

      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      payload = JSON.parse(result.stdout);
      assert.equal(payload.ok, true);
      assert.equal(payload.npm_identity, 'codex');
      assert.equal(payload.registry_status, 'available');
      assert.ok(payload.next_actions.some((action) => action.id === 'run_pre_publish_gate'));
      assert.ok(payload.next_actions.some((action) => action.command === 'xflow launch audit --pre-publish --strict --json'));

      result = spawnSync('node', [
        'bin/xflow.js',
        'package',
        'preflight',
        '--project-root',
        projectRoot,
        '--registry-json',
        '{"name":"openflow","version":"0.1.0"}',
        '--whoami',
        'codex',
        '--json',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });

      assert.equal(result.status, 1, result.stderr || result.stdout || String(result.error));
      payload = JSON.parse(result.stdout);
      assert.ok(payload.issues.some((issue) => issue.includes('already contains openflow@0.1.0')));
      assert.ok(payload.next_actions.some((action) => action.id === 'verify_package_ownership'));
      assert.ok(payload.next_actions.some((action) => action.id === 'choose_release_version'));
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('package status summarizes publish and install readiness without failing', () => {
    const projectRoot = makeProjectRoot();
    try {
      writeFileSync(resolve(projectRoot, 'package.json'), JSON.stringify({ name: 'openflow', version: '0.1.0' }, null, 2));

      let result = spawnSync('node', [
        'bin/xflow.js',
        'package',
        'status',
        '--project-root',
        projectRoot,
        '--registry-json',
        '{"error":"E404"}',
        '--json',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });

      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      let payload = JSON.parse(result.stdout);
      assert.equal(payload.ok, false);
      assert.equal(payload.ready_for_publish, false);
      assert.equal(payload.public_install_ready, false);
      assert.equal(payload.registry_status, 'available');
      assert.ok(payload.blocking_surfaces.includes('npm_auth'));
      assert.ok(payload.blocking_surfaces.includes('package_preflight'));
      assert.ok(payload.blocking_surfaces.includes('published_package'));
      assert.equal(payload.next_action.id, 'authenticate_npm');

      result = spawnSync('node', [
        'bin/xflow.js',
        'package',
        'status',
        '--project-root',
        projectRoot,
        '--registry-json',
        '{"error":"E404"}',
        '--whoami',
        'codex',
        '--json',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });

      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      payload = JSON.parse(result.stdout);
      assert.equal(payload.ready_for_publish, true);
      assert.equal(payload.public_install_ready, false);
      assert.equal(payload.next_action.id, 'run_pre_publish_gate');

      result = spawnSync('node', [
        'bin/xflow.js',
        'package',
        'status',
        '--project-root',
        projectRoot,
        '--registry-json',
        '{"name":"openflow","version":"0.1.0"}',
        '--json',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });

      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      payload = JSON.parse(result.stdout);
      assert.equal(payload.public_install_ready, true);
      assert.equal(payload.registry_status, 'published');
      assert.ok(payload.blocking_surfaces.includes('npm_auth'));
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('adoption validate fails without real records and accepts reviewable evidence', () => {
    const projectRoot = makeProjectRoot();
    try {
      let result = spawnSync('node', ['bin/xflow.js', 'adoption', 'validate', '--project-root', projectRoot, '--json'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });

      assert.equal(result.status, 1, result.stderr || result.stdout || String(result.error));
      let payload = JSON.parse(result.stdout);
      assert.equal(payload.ok, false);
      assert.ok(payload.issues.some((issue) => issue.includes('missing adoption records')));

      const adoptionDir = resolve(projectRoot, 'docs', 'adoption');
      mkdirSync(adoptionDir, { recursive: true });
      writeFileSync(resolve(adoptionDir, 'clean-project.md'), `# Adoption: clean-project

Date: 2026-05-22
Source: public PR in clean-project
Track: yolo

## Context

A small external repository used xflow for a dependency cleanup.

## Goal

Keep the package installable while removing stale workflow instructions.

## Commands

\`\`\`bash
xflow goal show --json
xflow assess --json
\`\`\`

## Evidence

- \`docs/proof/status.json\`
- \`https://example.com/clean-project/pull/12\`

## Outcome

The review got better because the command evidence made the change easier to accept, and the team would use xflow again.

## Redactions

Repository names were sanitized.
`);

      result = spawnSync('node', ['bin/xflow.js', 'adoption', 'validate', '--project-root', projectRoot, '--json'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });

      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      payload = JSON.parse(result.stdout);
      assert.equal(payload.ok, true);
      assert.equal(payload.record_count, 1);
      assert.equal(payload.records[0].path, 'docs/adoption/clean-project.md');
      assert.equal(payload.records[0].track, 'yolo');
      assert.equal(payload.records[0].scope, 'third_party');
      assert.equal(payload.third_party_ok, true);

      result = spawnSync('node', ['bin/xflow.js', 'adoption', 'validate', '--project-root', projectRoot, '--splash', '--json'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });

      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      payload = JSON.parse(result.stdout);
      assert.equal(payload.ok, true);
      assert.equal(payload.third_party_record_count, 1);
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('adoption status summarizes ordinary and splash adoption blockers without failing', () => {
    const projectRoot = makeProjectRoot();
    try {
      let result = spawnSync('node', ['bin/xflow.js', 'adoption', 'status', '--project-root', projectRoot], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });

      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      assert.match(result.stdout, /xflow adoption status/);
      assert.match(result.stdout, /Adoption evidence: missing/);
      assert.match(result.stdout, /Splash evidence: missing third-party adoption/);
      assert.match(result.stdout, /Blocking surfaces: adoption_evidence, third_party_adoption/);
      assert.match(result.stdout, /Next action: prepare_external_brief/);
      assert.match(result.stdout, /External brief: xflow adoption brief --name <third-party-project> --source <public-pr-or-external-repo> --track yolo/);
      assert.match(result.stdout, /xflow adoption validate --splash --json/);

      result = spawnSync('node', ['bin/xflow.js', 'adoption', 'status', '--project-root', projectRoot, '--json'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });

      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      let payload = JSON.parse(result.stdout);
      assert.equal(payload.ok, false);
      assert.equal(payload.adoption_ok, false);
      assert.equal(payload.third_party_ok, false);
      assert.deepEqual(payload.blocking_surfaces, ['adoption_evidence', 'third_party_adoption']);
      assert.equal(payload.next_action.id, 'prepare_external_brief');
      assert.equal(payload.external_brief_command, 'xflow adoption brief --name <third-party-project> --source <public-pr-or-external-repo> --track yolo');
      assert.equal(payload.external_trial_command, 'xflow adoption trial --name <third-party-project> --source <public-pr-or-external-repo> --track yolo');

      const adoptionDir = resolve(projectRoot, 'docs', 'adoption');
      mkdirSync(adoptionDir, { recursive: true });
      writeFileSync(resolve(adoptionDir, 'clean-project.md'), `# Adoption: clean-project

Date: 2026-05-22
Source: public PR in clean-project
Track: yolo

## Context

A small external repository used xflow for a dependency cleanup.

## Goal

Keep the package installable while removing stale workflow instructions.

## Commands

\`\`\`bash
xflow goal show --json
xflow assess --json
\`\`\`

## Evidence

- \`docs/proof/status.json\`
- \`https://example.com/clean-project/pull/12\`

## Outcome

The review got better because the command evidence made the change easier to accept, and the team would use xflow again.

## Redactions

Repository names were sanitized.
`);

      result = spawnSync('node', ['bin/xflow.js', 'adoption', 'status', '--project-root', projectRoot, '--json'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });

      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      payload = JSON.parse(result.stdout);
      assert.equal(payload.ok, true);
      assert.equal(payload.adoption_ok, true);
      assert.equal(payload.third_party_ok, true);
      assert.deepEqual(payload.blocking_surfaces, []);
      assert.equal(payload.next_action.id, 'validate_splash_adoption');
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('adoption init creates a draft that must not pass validation until real evidence replaces placeholders', () => {
    const projectRoot = makeProjectRoot();
    try {
      let result = spawnSync('node', [
        'bin/xflow.js',
        'adoption',
        'init',
        '--project-root',
        projectRoot,
        '--name',
        'Clean Project',
        '--source',
        'public PR 12',
        '--track',
        'yolo',
        '--date',
        '2026-05-22',
        '--json',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });

      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      let payload = JSON.parse(result.stdout);
      assert.equal(payload.path, 'docs/adoption/clean-project.md');
      assert.equal(payload.next_command, 'xflow adoption validate --input docs/adoption/clean-project.md --json');
      assert.equal(payload.splash_command, 'xflow adoption validate --input docs/adoption/clean-project.md --splash --json');
      assert.ok(payload.required_replacements.some((item) => item.includes('real external project')));
      assert.equal(existsSync(resolve(projectRoot, payload.path)), true);
      const draft = readFileSync(resolve(projectRoot, payload.path), 'utf8');
      assert.match(draft, /splash-launch third-party evidence/);
      assert.match(draft, /reviewable by someone outside the authoring/);
      assert.match(draft, /State `None` only when/);

      result = spawnSync('node', ['bin/xflow.js', 'adoption', 'validate', '--project-root', projectRoot, '--json'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });

      assert.equal(result.status, 1, result.stderr || result.stdout || String(result.error));
      payload = JSON.parse(result.stdout);
      assert.equal(payload.ok, false);
      assert.ok(payload.issues.some((issue) => issue.includes('record still contains template placeholders')));
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('adoption kit creates a third-party trial packet without passing validation by itself', () => {
    const projectRoot = makeProjectRoot();
    try {
      const result = spawnSync('node', [
        'bin/xflow.js',
        'adoption',
        'kit',
        '--project-root',
        projectRoot,
        '--name',
        'Clean Project',
        '--source',
        'https://example.com/clean-project/pull/12',
        '--track',
        'both',
        '--json',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });

      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.ok, true);
      assert.equal(payload.path, 'docs/adoption/trial-packets/clean-project.md');
      assert.ok(payload.trial_commands.includes('xflow demo clean'));
      assert.ok(payload.trial_commands.includes('xflow workflow validate yolo --project-root .'));
      assert.ok(payload.trial_commands.includes('xflow corps --explain --json'));
      assert.ok(payload.record_command.includes('xflow adoption init'));
      assert.ok(payload.validation_commands.includes('xflow adoption validate --splash --json'));

      const kit = readFileSync(resolve(projectRoot, payload.path), 'utf8');
      assert.match(kit, /Adoption Trial Packet/);
      assert.match(kit, /not adoption evidence by itself/);
      assert.match(kit, /xflow launch audit --splash --strict --json/);

      const validate = spawnSync('node', ['bin/xflow.js', 'adoption', 'validate', '--project-root', projectRoot, '--json'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });

      assert.equal(validate.status, 1, validate.stderr || validate.stdout || String(validate.error));
      const validatePayload = JSON.parse(validate.stdout);
      assert.equal(validatePayload.record_count, 0);
      assert.ok(validatePayload.issues.some((issue) => issue.includes('missing adoption records')));
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('adoption trial prints external trial commands without writing files', () => {
    const projectRoot = makeProjectRoot();
    try {
      let result = spawnSync('node', [
        'bin/xflow.js',
        'adoption',
        'trial',
        '--project-root',
        projectRoot,
        '--name',
        'Clean Project',
        '--source',
        'https://example.com/clean-project/pull/12',
        '--track',
        'both',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });

      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      assert.match(result.stdout, /xflow adoption trial/);
      assert.match(result.stdout, /xflow adoption kit --name 'Clean Project'/);
      assert.match(result.stdout, /xflow workflow validate yolo --project-root \./);
      assert.match(result.stdout, /xflow corps --explain --json/);
      assert.match(result.stdout, /Evidence to collect:/);
      assert.match(result.stdout, /xflow adoption validate --splash --json/);
      assert.equal(existsSync(resolve(projectRoot, 'docs', 'adoption', 'trial-packets')), false);

      result = spawnSync('node', [
        'bin/xflow.js',
        'adoption',
        'trial',
        '--project-root',
        projectRoot,
        '--name',
        'Clean Project',
        '--source',
        'https://example.com/clean-project/pull/12',
        '--track',
        'yolo',
        '--json',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });

      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.ok, true);
      assert.equal(payload.name, 'Clean Project');
      assert.equal(payload.track, 'yolo');
      assert.ok(payload.source_checkout_commands.includes('node bin/xflow.js demo clean'));
      assert.ok(payload.trial_commands.includes('xflow workflow validate yolo --project-root .'));
      assert.ok(payload.trial_packet_command.includes('xflow adoption kit'));
      assert.ok(payload.record_command.includes('xflow adoption init'));
      assert.ok(payload.validation_commands.includes('xflow launch audit --splash --strict --json'));
      assert.ok(payload.evidence_to_collect.some((item) => item.includes('external project')));
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('adoption brief prepares a sendable third-party ask without writing files', () => {
    const projectRoot = makeProjectRoot();
    try {
      let result = spawnSync('node', [
        'bin/xflow.js',
        'adoption',
        'brief',
        '--project-root',
        projectRoot,
        '--name',
        'Clean Project',
        '--source',
        'https://example.com/clean-project/pull/12',
        '--track',
        'corps',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });

      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      assert.match(result.stdout, /xflow adoption brief/);
      assert.match(result.stdout, /Would you be willing to run a short xflow corps trial on Clean Project\?/);
      assert.match(result.stdout, /Acceptance bar:/);
      assert.match(result.stdout, /xflow adoption validate --splash --json/);
      assert.equal(existsSync(resolve(projectRoot, 'docs', 'adoption', 'trial-packets')), false);

      result = spawnSync('node', [
        'bin/xflow.js',
        'adoption',
        'brief',
        '--project-root',
        projectRoot,
        '--name',
        'Clean Project',
        '--source',
        'https://example.com/clean-project/pull/12',
        '--track',
        'yolo',
        '--json',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });

      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.ok, true);
      assert.equal(payload.track, 'yolo');
      assert.ok(payload.ask_message.includes('Would you be willing to run a short xflow yolo trial on Clean Project?'));
      assert.ok(payload.trial_packet_command.includes('xflow adoption kit'));
      assert.ok(payload.acceptance_bar.some((item) => item.includes('reviewable artifact')));
      assert.ok(payload.maintainer_follow_up.includes('xflow adoption validate --splash --json'));
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('guide exposes the human delivery loop in text and json modes', () => {
    let result = spawnSync('node', ['bin/xflow.js', 'guide'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 3000,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    assert.match(result.stdout, /shape -> choose-track -> execute -> review -> finish/);
    assert.match(result.stdout, /xflow:plan/);
    assert.match(result.stdout, /A5\.archive\.commit_push_close/);

    result = spawnSync('node', ['bin/xflow.js', 'guide', '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 3000,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.loop, 'shape -> choose-track -> execute -> review -> finish');
    assert.ok(payload.stages.some((stage) => stage.id === 'review'));
    assert.ok(payload.docs.includes('docs/methodology.md'));
  });

  test('spec start scaffolds a lower-friction change workspace', () => {
    const projectRoot = makeProjectRoot();
    try {
      const result = spawnSync('node', [
        'bin/xflow.js',
        'spec',
        'start',
        '--project-root',
        projectRoot,
        '--title',
        'Add launch checklist',
        '--change-type',
        'frontend',
        '--with-design',
        '--json',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 5000,
      });

      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.ok, true);
      assert.equal(payload.change_id, 'Add-launch-checklist');
      assert.equal(payload.change_type, 'frontend');
      assert.equal(payload.design_expected, true);
      assert.equal(existsSync(resolve(projectRoot, 'specs', 'changes', 'Add-launch-checklist', 'proposal.md')), true);
      assert.equal(existsSync(resolve(projectRoot, 'specs', 'changes', 'Add-launch-checklist', 'design.md')), true);
      assert.equal(existsSync(resolve(projectRoot, 'DESIGN.md')), true);
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('spec quick accepts positional titles for lower-friction authoring', () => {
    const projectRoot = makeProjectRoot();
    try {
      const result = spawnSync('node', [
        'bin/xflow.js',
        'spec',
        'quick',
        'Polish onboarding copy',
        '--project-root',
        projectRoot,
        '--json',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 5000,
      });

      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.ok, true);
      assert.equal(payload.entry, 'spec.quick');
      assert.equal(payload.title, 'Polish onboarding copy');
      assert.equal(payload.change_type, 'docs');
      assert.equal(existsSync(resolve(projectRoot, 'specs', 'changes', 'Polish-onboarding-copy', 'proposal.md')), true);
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('qa capture packages browser evidence capture with QA defaults', () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'fixtures'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'fixtures', 'page.html'), `<!doctype html>
<html>
  <body style="margin:0;background:#fff">
    <aside data-panel="sidebar" style="position:absolute;left:0;top:0;width:200px;height:300px;background:#f8fafc"></aside>
    <main data-panel="workspace" style="position:absolute;left:200px;top:0;width:600px;height:300px;background:#ffffff"></main>
  </body>
</html>`);
      const pageUrl = `file://${resolve(projectRoot, 'fixtures', 'page.html')}`;
      const result = spawnSync('node', [
        'bin/xflow.js',
        'qa',
        'capture',
        '--project-root',
        projectRoot,
        '--url',
        pageUrl,
        '--json',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 15000,
      });

      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.ok, true);
      assert.equal(payload.entry, 'qa.capture');
      assert.equal(existsSync(resolve(projectRoot, '.as-xflow', 'qa-page-snapshot.json')), true);
      assert.equal(existsSync(resolve(projectRoot, '.as-xflow', 'qa-dom-rects.json')), true);
      assert.equal(existsSync(resolve(projectRoot, '.as-xflow', 'qa-visual-tokens.json')), true);
      assert.equal(existsSync(resolve(projectRoot, 'output', 'playwright', 'qa-page-evidence.png')), true);
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('qa review and qa ship expose role-shaped browser QA flows', () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'fixtures'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'fixtures', 'page.html'), `<!doctype html>
<html>
  <body style="margin:0;background:#fff">
    <aside data-panel="sidebar" style="position:absolute;left:0;top:0;width:220px;height:320px;background:#f8fafc"></aside>
    <main data-panel="workspace" style="position:absolute;left:220px;top:0;width:660px;height:320px;background:#ffffff"></main>
  </body>
</html>`);
      const pageUrl = `file://${resolve(projectRoot, 'fixtures', 'page.html')}`;

      let result = spawnSync('node', [
        'bin/xflow.js',
        'qa',
        'review',
        '--project-root',
        projectRoot,
        '--url',
        pageUrl,
        '--json',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 15000,
      });

      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      let payload = JSON.parse(result.stdout);
      assert.equal(payload.ok, true);
      assert.equal(payload.entry, 'qa.review');
      assert.equal(payload.role, 'qa_reviewer');
      assert.ok(Array.isArray(payload.next_steps));
      assert.ok(payload.next_steps.some((step) => step.includes('qa ship')));
      assert.equal(existsSync(resolve(projectRoot, 'output', 'playwright', 'qa-review-report.html')), true);

      result = spawnSync('node', [
        'bin/xflow.js',
        'qa',
        'ship',
        '--project-root',
        projectRoot,
        '--url',
        pageUrl,
        '--json',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 15000,
      });

      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      payload = JSON.parse(result.stdout);
      assert.equal(payload.ok, true);
      assert.equal(payload.entry, 'qa.ship');
      assert.equal(payload.role, 'release_qa_operator');
      assert.ok(Array.isArray(payload.release_gate));
      assert.ok(payload.release_gate.includes('xflow launch audit --strict --json'));
      assert.ok(payload.capture?.entry === 'qa.capture');

      result = spawnSync('node', [
        'bin/xflow.js',
        'qa',
        'benchmark',
        '--project-root',
        projectRoot,
        '--url',
        pageUrl,
        '--json',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 20000,
      });

      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      payload = JSON.parse(result.stdout);
      assert.equal(payload.ok, true);
      assert.equal(payload.entry, 'qa.benchmark');
      assert.equal(payload.role, 'visual_benchmark_operator');
      assert.ok(payload.review?.entry === 'qa.review');
      assert.ok(payload.ship?.entry === 'qa.ship');
      assert.ok(Array.isArray(payload.release_gate));
      assert.ok(payload.release_gate.includes('xflow launch audit --strict --json'));
      assert.equal(existsSync(resolve(projectRoot, 'output', 'playwright', 'qa-benchmark-report.html')), true);
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('host status and coach expose named operator surfaces in json mode', () => {
    let result = spawnSync('node', ['bin/xflow.js', 'host', 'status', '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 5000,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    let payload = JSON.parse(result.stdout);
    assert.equal(payload.project_root, REPO_ROOT);
    assert.ok(Array.isArray(payload.hosts));
    assert.ok(payload.hosts.some((host) => host.host === 'codex'));

    result = spawnSync('node', ['bin/xflow.js', 'coach', 'bugfix', '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 3000,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.mode, 'bugfix');
    assert.ok(payload.commands.includes('xflow goal audit --json'));
    assert.ok(payload.stages.some((stage) => stage.includes('failing test')));

    result = spawnSync('node', ['bin/xflow.js', 'coach', 'qa', '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 3000,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.mode, 'qa');
    assert.ok(payload.commands.includes('xflow qa review --url <page-url> --json'));
    assert.ok(payload.stages.some((stage) => stage.includes('reference')));

    result = spawnSync('node', ['bin/xflow.js', 'coach', 'ship', '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 3000,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.mode, 'ship');
    assert.ok(payload.commands.includes('xflow qa ship --url <page-url> --json'));
    assert.ok(payload.stages.some((stage) => stage.includes('launch')));

    result = spawnSync('node', ['bin/xflow.js', 'coach', 'tdd', '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 3000,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.mode, 'tdd');
    assert.ok(payload.commands.includes('xflow coach bugfix --json'));
    assert.ok(payload.stages.some((stage) => stage.includes('red')));

    result = spawnSync('node', ['bin/xflow.js', 'coach', 'debug', '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 3000,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.mode, 'debug');
    assert.ok(payload.commands.includes('xflow coach bugfix --json'));
    assert.ok(payload.stages.some((stage) => stage.includes('reproduce')));

    result = spawnSync('node', ['bin/xflow.js', 'coach', 'red', '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 3000,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.mode, 'red');
    assert.ok(payload.stages.some((stage) => stage.includes('failing test')));

    result = spawnSync('node', ['bin/xflow.js', 'coach', 'green', '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 3000,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.mode, 'green');
    assert.ok(payload.stages.some((stage) => stage.includes('smallest')));

    result = spawnSync('node', ['bin/xflow.js', 'coach', 'verify', '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 3000,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.mode, 'verify');
    assert.ok(payload.commands.includes('xflow launch audit --strict --json'));
  });

  test('role exposes named specialist operator surfaces in json mode', () => {
    const cases = [
      ['developer', 'xflow workflow run yolo --dry-run --title "<change title>" --change-type backend'],
      ['reviewer', 'npm run drift:scan'],
      ['qa', 'xflow qa benchmark --url <page-url> --json'],
      ['release', 'xflow launch audit --splash --strict --check-registry --json'],
      ['product', 'xflow goal audit --json'],
    ];

    for (const [role, expectedCommand] of cases) {
      const result = spawnSync('node', ['bin/xflow.js', 'role', role, '--json'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });
      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.ok, true);
      assert.equal(payload.role, role);
      assert.ok(Array.isArray(payload.commands));
      assert.ok(payload.commands.includes(expectedCommand));
    }
  });

  test('quickstart separates copy-paste first run from release-owner gates', () => {
    let result = spawnSync('node', ['bin/xflow.js', 'quickstart'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 3000,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    assert.match(result.stdout, /First-run commands are copy-paste safe/);
    assert.match(result.stdout, /Release-owner gates/);
    assert.match(result.stdout, /xflow package preflight --check-registry --check-auth --json/);

    result = spawnSync('node', ['bin/xflow.js', 'quickstart', '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 3000,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.first_run_is_copy_paste_safe, true);
    assert.ok(payload.published_package.commands.includes('xflow quickstart') === false);
    assert.ok(payload.published_package.commands.includes('xflow guide'));
    assert.ok(payload.published_package.commands.includes('xflow evaluate'));
    assert.ok(payload.published_package.commands.includes('xflow demo clean'));
    assert.ok(payload.source_checkout.commands.includes('npm run release:pack'));
    assert.ok(payload.source_checkout.commands.includes('node bin/xflow.js evaluate'));
    assert.ok(payload.source_checkout.commands.includes('node bin/xflow.js demo clean'));
    assert.ok(payload.release_owner_gates.commands.includes('xflow release status --json'));
    assert.ok(payload.release_owner_gates.commands.includes('xflow adoption trial --name <team-or-project> --source <tracker-or-pr> --track yolo'));
    assert.ok(payload.release_owner_gates.commands.includes('xflow adoption status --json'));
    assert.ok(payload.release_owner_gates.commands.includes('xflow adoption validate --json'));
    assert.ok(payload.release_owner_gates.commands.includes('xflow adoption kit --name <team-or-project> --source <tracker-or-pr> --track yolo'));
    assert.ok(payload.release_owner_gates.commands.includes('xflow adoption validate --splash --json'));
    assert.ok(payload.release_owner_gates.commands.includes('xflow package status --json'));
    assert.ok(payload.release_owner_gates.commands.includes('xflow package audit --check-registry --json'));
    assert.ok(payload.release_owner_gates.commands.includes('xflow launch audit --splash --strict --json'));
    assert.ok(payload.published_package.commands.every((command) => !command.includes('adoption validate')));
    assert.ok(payload.published_package.commands.every((command) => !command.includes('package preflight')));
    assert.ok(payload.published_package.commands.every((command) => !command.includes('package audit')));
    assert.ok(payload.source_checkout.commands.every((command) => !command.includes('adoption validate')));
    assert.ok(payload.source_checkout.commands.every((command) => !command.includes('package preflight')));
    assert.ok(payload.source_checkout.commands.every((command) => !command.includes('package audit')));

    result = spawnSync('node', ['bin/xflow.js', 'evaluate', '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 3000,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    const evaluatePayload = JSON.parse(result.stdout);
    assert.ok(evaluatePayload.quickstart.published_package.commands.every((command) => !/\bevaluate\b/.test(command)));
    assert.ok(evaluatePayload.quickstart.source_checkout.commands.every((command) => !/\bevaluate\b/.test(command)));
  });

  test('primary subcommands expose help without unknown-subcommand errors', () => {
    const cases = [
      ['workflow', /Usage: xflow workflow/],
      ['corps', /Usage: xflow corps/],
      ['proof', /Usage: xflow proof/],
      ['atom', /Usage: xflow atom/],
      ['gate', /Usage: xflow gate/],
      ['doctor', /Usage: xflow doctor/],
      ['init', /Usage: xflow init/],
      ['goal', /Usage: xflow goal/],
      ['score', /Usage: xflow score/],
      ['evaluate', /Usage: xflow evaluate/],
      ['release', /Usage: xflow release/],
      ['assess', /Usage: xflow assess/],
      ['demo', /Usage: xflow demo/],
      ['launch', /Usage: xflow launch/],
      ['adoption', /Usage: xflow adoption/],
      ['package', /Usage: xflow package/],
      ['compare', /Usage: xflow compare/],
      ['adapter', /Usage: xflow adapter/],
      ['spec', /Usage: xflow spec/],
      ['qa', /Usage: xflow qa/],
      ['host', /Usage: xflow host/],
      ['coach', /Usage: xflow coach/],
      ['role', /Usage: xflow role/],
      ['quickstart', /Usage: xflow quickstart/],
      ['guide', /Usage: xflow guide/],
    ];
    const helpArgs = ['--help', '-h', 'help'];

    for (const [subcommand, usagePattern] of cases) {
      for (const helpArg of helpArgs) {
        const result = spawnSync('node', ['bin/xflow.js', subcommand, helpArg], {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          timeout: 1500,
        });
        const output = `${result.stdout}\n${result.stderr}`;

        assert.equal(result.status, 0, output || String(result.error));
        assert.match(result.stdout, usagePattern);
        assert.doesNotMatch(output, /Unknown .* subcommand/i);
      }
    }
  });

  test('adapter import-file creates local change artifacts without owning workflow truth', () => {
    const projectRoot = makeProjectRoot();
    try {
      const help = spawnSync('node', ['bin/xflow.js', 'adapter', 'import-file', '--help'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 1500,
      });
      assert.equal(help.status, 0, help.stderr || help.stdout || String(help.error));
      assert.match(help.stdout, /Usage: xflow adapter/);

      writeFileSync(resolve(projectRoot, 'tracker-item.json'), JSON.stringify({
        source: 'linear',
        id: 'LIN-42',
        title: 'Harden release proof',
        body: 'Capture external tracker context, then let xflow own local proposal and status files.',
        url: 'https://linear.example/LIN-42',
        labels: ['release', 'proof'],
      }, null, 2));

      let result = spawnSync('node', [
        'bin/xflow.js',
        'adapter',
        'import-file',
        '--project-root',
        projectRoot,
        '--input',
        'tracker-item.json',
        '--json',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });

      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.ok, true);
      assert.equal(payload.adapter, 'linear');
      assert.equal(payload.change_id, 'LIN-42');

      const proposal = readFileSync(resolve(projectRoot, 'specs', 'changes', 'LIN-42', 'proposal.md'), 'utf8');
      const status = JSON.parse(readFileSync(resolve(projectRoot, 'specs', 'changes', 'LIN-42', 'status.json'), 'utf8'));
      assert.match(proposal, /Adapter: linear/);
      assert.match(proposal, /MUST preserve source context/);
      assert.equal(status.source_adapter, 'linear');
      assert.equal(status.source_id, 'LIN-42');

      result = spawnSync('node', [
        'bin/xflow.js',
        'adapter',
        'import-file',
        '--project-root',
        projectRoot,
        '--input',
        'tracker-item.json',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 3000,
      });

      assert.notEqual(result.status, 0, result.stdout);
      assert.match(result.stderr, /would overwrite/);
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('compare reports reference-system edges in text and json modes', () => {
    let result = spawnSync('node', ['bin/xflow.js', 'compare', 'superpowers'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 3000,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    assert.match(result.stdout, /xflow compare: superpowers/);
    assert.match(result.stdout, /docs\/superpowers-comparison\.md/);
    assert.match(result.stdout, /behavior discipline/);
    assert.match(result.stdout, /Winner: xflow/);
    assert.match(result.stdout, /superpowers: 78\/100/);

    result = spawnSync('node', ['bin/xflow.js', 'compare', 'openspec', '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 3000,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.target, 'openspec');
    assert.equal(payload.winner.overall, 'xflow');
    assert.equal(payload.scorecard.overall.xflow, 93);
    assert.equal(payload.scorecard.overall.openspec, 73);
    assert.ok(payload.scorecard.dimensions.some((dimension) => dimension.id === 'spec_authoring_friction' && dimension.winner === 'tie'));
    assert.ok(payload.scorecard.dimensions.every((dimension) => Array.isArray(dimension.evidence_refs) && dimension.evidence_refs.length > 0));
    assert.ok(payload.xflow_edges.includes('xflow spec start and spec quick scaffold specs/changes with low-friction defaults from one command'));

    result = spawnSync('node', ['bin/xflow.js', 'compare', 'superpowers', '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 3000,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    const superpowersPayload = JSON.parse(result.stdout);
    assert.equal(superpowersPayload.ok, true);
    assert.equal(superpowersPayload.target, 'superpowers');
    assert.equal(superpowersPayload.winner.overall, 'xflow');
    assert.equal(superpowersPayload.scorecard.overall.xflow, 91);
    assert.equal(superpowersPayload.scorecard.overall.superpowers, 78);
    assert.ok(superpowersPayload.scorecard.dimensions.some((dimension) => dimension.id === 'behavior_discipline' && dimension.winner === 'tie'));
    assert.ok(superpowersPayload.scorecard.dimensions.some((dimension) => dimension.id === 'tdd_and_debugging' && dimension.winner === 'xflow'));
    assert.ok(superpowersPayload.scorecard.dimensions.every((dimension) => Array.isArray(dimension.evidence_refs) && dimension.evidence_refs.length > 0));
    assert.ok(superpowersPayload.scorecard.dimensions.some((dimension) => dimension.id === 'workflow_execution' && dimension.evidence_refs.includes('workflows/corps.yaml')));
    assert.ok(superpowersPayload.target_edges.some((edge) => edge.includes('behavioral guidance')));
    assert.ok(superpowersPayload.xflow_edges.some((edge) => edge.includes('xflow coach')));

    result = spawnSync('node', ['bin/xflow.js', 'compare', 'codex-goal', '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 3000,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    const codexGoalPayload = JSON.parse(result.stdout);
    assert.equal(codexGoalPayload.ok, true);
    assert.equal(codexGoalPayload.target, 'codex-goal');
    assert.equal(codexGoalPayload.winner.overall, 'xflow:goal');
    assert.equal(codexGoalPayload.scorecard.overall.xflow_goal, 88);
    assert.equal(codexGoalPayload.scorecard.overall.codex_native_goal, 72);
    assert.ok(codexGoalPayload.scorecard.dimensions.some((dimension) => dimension.id === 'thread_local_control' && dimension.winner === 'codex_native_goal'));
    assert.ok(codexGoalPayload.scorecard.dimensions.every((dimension) => Array.isArray(dimension.evidence_refs) && dimension.evidence_refs.length > 0));
    assert.ok(codexGoalPayload.scorecard.dimensions.some((dimension) => dimension.id === 'workflow_consumption' && dimension.evidence_refs.some((ref) => ref.includes('xflow goal audit --json'))));
    assert.equal(codexGoalPayload.boundary.role, 'project_direction_anchor');
    assert.ok(codexGoalPayload.boundary.useful_when.some((item) => item.includes('thread changes')));
    assert.ok(codexGoalPayload.boundary.not_for.some((item) => item.includes('Codex native goal is enough')));
    assert.ok(codexGoalPayload.boundary.escalation_path.includes('plan turns direction into implementation strategy'));
    assert.ok(codexGoalPayload.xflow_edges.some((edge) => edge.includes('.xflow/GOAL.md')));
    assert.ok(codexGoalPayload.target_edges.some((edge) => edge.includes('active Codex thread')));

    result = spawnSync('node', ['bin/xflow.js', 'compare', 'gstack'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 3000,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    assert.match(result.stdout, /xflow compare: gstack/);
    assert.match(result.stdout, /Winner: xflow/);
    assert.match(result.stdout, /gstack: 80\/100/);
    assert.match(result.stdout, /docs\/gstack-comparison\.md/);

    result = spawnSync('node', ['bin/xflow.js', 'compare', 'gstack', '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 3000,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    const gstackPayload = JSON.parse(result.stdout);
    assert.equal(gstackPayload.ok, true);
    assert.equal(gstackPayload.target, 'gstack');
    assert.equal(gstackPayload.winner.overall, 'xflow');
    assert.equal(gstackPayload.scorecard.overall.xflow, 96);
    assert.equal(gstackPayload.scorecard.overall.gstack, 80);
    assert.ok(gstackPayload.scorecard.dimensions.some((dimension) => dimension.id === 'role_specialization' && dimension.winner === 'tie'));
    assert.ok(gstackPayload.scorecard.dimensions.some((dimension) => dimension.id === 'browser_qa_and_roles' && dimension.winner === 'tie'));
    assert.ok(gstackPayload.scorecard.dimensions.some((dimension) => dimension.id === 'repo_owned_workflow_state' && dimension.winner === 'xflow'));
    assert.ok(gstackPayload.scorecard.dimensions.some((dimension) => dimension.id === 'cross_tool_host_support' && dimension.winner === 'xflow'));
    assert.ok(gstackPayload.scorecard.dimensions.every((dimension) => Array.isArray(dimension.evidence_refs) && dimension.evidence_refs.length > 0));
    assert.ok(gstackPayload.docs.includes('docs/gstack-comparison.md'));
  });

  test('workflow run accepts direct input args and derives CHANGE_ID from branch name', () => {
    const projectRoot = makeProjectRoot();
    const workflowPath = resolve(projectRoot, 'cli-workflow.yaml');
    try {
      initGitRepo(projectRoot, 'issue-123-yolo-cli-smoke');
      writeFileSync(workflowPath, `
name: cli-smoke
version: 1
track: lite
requires:
  agentos_http: false
  gh: false
  pencil: false
phases:
  - id: change-init
    label: "Change init"
    catalog_ref: 1
    required: true
    atoms:
      - id: B1.change.scaffold
        with: { change_type: "\${input.change_type}", title: "\${input.title}" }
      - id: B2b.status.write
        with:
          fields:
            current_stage: "change-init"
            status: "draft"
    gate:
      type: skip
`);

      const result = spawnSync('node', [
        'bin/xflow.js',
        'workflow',
        'run',
        workflowPath,
        '--project-root',
        projectRoot,
        '--title',
        'CLI smoke title',
        '--change-type',
        'backend',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      });

      assert.equal(result.status, 0, result.stderr || result.stdout);
      const status = JSON.parse(readFileSync(resolve(projectRoot, 'specs', 'changes', 'yolo-cli-smoke', 'status.json'), 'utf8'));
      assert.equal(status.title, 'CLI smoke title');
      assert.equal(status.change_type, 'backend');
      assert.equal(status.current_stage, 'change-init');
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('atom run supports dotted object args for python atoms and respects XFLOW_PROJECT_ROOT', () => {
    const projectRoot = makeProjectRoot();
    try {
      let result = spawnSync('node', [
        'bin/xflow.js',
        'atom',
        'run',
        'B1.change.scaffold',
        '--change-id',
        'chg-cli-atom',
        '--title',
        'CLI atom title',
        '--change-type',
        'backend',
      ], {
        cwd: REPO_ROOT,
        env: { ...process.env, XFLOW_PROJECT_ROOT: projectRoot },
        encoding: 'utf8',
      });
      assert.equal(result.status, 0, result.stderr || result.stdout);

      result = spawnSync('node', [
        'bin/xflow.js',
        'atom',
        'run',
        'B2b.status.write',
        '--change-id',
        'chg-cli-atom',
        '--fields.current-stage',
        'plan',
        '--fields.status',
        'active',
      ], {
        cwd: REPO_ROOT,
        env: { ...process.env, XFLOW_PROJECT_ROOT: projectRoot },
        encoding: 'utf8',
      });
      assert.equal(result.status, 0, result.stderr || result.stdout);

      const status = JSON.parse(readFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-cli-atom', 'status.json'), 'utf8'));
      assert.equal(status.current_stage, 'plan');
      assert.equal(status.status, 'active');
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('atom run can invoke agent_invoke atoms directly with synthetic phase context', () => {
    const projectRoot = makeProjectRoot();
    try {
      const result = spawnSync('node', [
        'bin/xflow.js',
        'atom',
        'run',
        'I1.team.run',
        '--change-id',
        'chg-cli-agent',
        '--phase',
        'explore',
      ], {
        cwd: REPO_ROOT,
        env: { ...process.env, XFLOW_PROJECT_ROOT: projectRoot },
        encoding: 'utf8',
      });
      assert.equal(result.status, 0, result.stderr || result.stdout);
      const artifact = JSON.parse(readFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-cli-agent', 'execution.json'), 'utf8'));
      assert.equal(artifact.phase, 'explore');
      assert.match(result.stdout, /task_queued/);
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('atom run can invoke H6.visual.benchmark via its named JS export', () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'fixtures'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'fixtures', 'page.html'), `<!doctype html>
<html>
  <body style="margin:0;background:#fff">
    <aside data-panel="sidebar" style="position:absolute;left:0;top:0;width:200px;height:300px;background:#f8fafc"></aside>
    <main data-panel="workspace" style="position:absolute;left:200px;top:0;width:600px;height:300px;background:#ffffff"></main>
  </body>
</html>`);
      writeFileSync(resolve(projectRoot, 'fixtures', 'ref.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="300"><rect width="800" height="300" fill="#ffffff"/></svg>');

      const pageUrl = `file://${resolve(projectRoot, 'fixtures', 'page.html')}`;
      const result = spawnSync('node', [
        'bin/xflow.js',
        'atom',
        'run',
        'H6.visual.benchmark',
        '--project-root',
        projectRoot,
        '--change-id',
        'chg-cli-benchmark',
        '--competitor-product',
        'Reference Product',
        '--required-modules',
        'sidebar',
        '--required-modules',
        'workspace',
        '--capture-url',
        pageUrl,
        '--reference-image',
        'fixtures/ref.svg',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 15000,
      });

      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      const artifact = JSON.parse(readFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-cli-benchmark', 'visual_benchmark.json'), 'utf8'));
      assert.equal(artifact.competitor_product, 'Reference Product');
      assert.equal(Array.isArray(artifact.scenarios), true);
      assert.equal(artifact.scenarios.length, 1);
      assert.match(result.stdout, /needs_follow_up|pass/);
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('atom run normalizes boolean false flags for python atoms', () => {
    const projectRoot = makeProjectRoot();
    try {
      writeFileSync(resolve(projectRoot, 'DESIGN.md'), [
        '# DESIGN',
        '',
        '## Visual Tone',
        'Calm',
        '',
        '## Color System',
        'Neutral',
        '',
        '## Typography',
        'System',
      ].join('\n'));

      const result = spawnSync('node', [
        'bin/xflow.js',
        'atom',
        'run',
        'H1.design.lite_gate',
        '--project-root',
        projectRoot,
        '--require-full-contract',
        'false',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      });

      assert.equal(result.status, 0, result.stderr || result.stdout);
      assert.match(result.stdout, /"verdict": "pass"/);
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('workflow run fails fast with a clear message when CHANGE_ID cannot be derived', () => {
    const projectRoot = makeProjectRoot();
    const workflowPath = resolve(projectRoot, 'needs-change-id.yaml');
    try {
      initGitRepo(projectRoot, 'main');
      writeFileSync(workflowPath, `
name: needs-change-id
version: 1
track: lite
requires:
  agentos_http: false
  gh: false
  pencil: false
phases:
  - id: change-init
    label: "Change init"
    catalog_ref: 1
    required: true
    atoms:
      - id: B1.change.scaffold
        with: { change_type: "backend", title: "Needs change id" }
    gate:
      type: skip
`);

      const result = spawnSync('node', [
        'bin/xflow.js',
        'workflow',
        'run',
        workflowPath,
        '--project-root',
        projectRoot,
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      });

      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /CHANGE_ID is required/);
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });
});
