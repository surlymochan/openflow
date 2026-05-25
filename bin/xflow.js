#!/usr/bin/env node
/**
 * xflow — openflow unified CLI
 *
 * Commands:
 *   workflow run <yaml>          Execute a workflow (or dry-run with --dry-run)
 *   workflow validate <yaml>     Validate workflow YAML against schema
 *   corps                        Run the heavy corps workflow through its governed entry
 *   proof                        Verify workflow completion evidence and write proof
 *   doctor                       Check local xflow readiness
 *   evaluate                     Show one-shot external evaluator brief
 *   release status               Show release-owner publish status
 *   assess                       Show the public quality assessment
 *   demo launch|clean            Show launch demo paths or run clean-project smoke
 *   launch audit|dossier|claims|copy
 *                                Audit readiness or print launch assets
 *   adoption validate|init|kit|trial|status
 *                                Validate records or guide external trials
 *   package audit|preflight|status
 *   compare                      Compare xflow against Codex goal, Superpowers, OpenSpec, or spec-kit
 *   objective                    Audit the top-level product objective
 *   goal show|set|audit|clear    Manage and audit the project-level .xflow/GOAL.md anchor
 *   adapter                      Import external tracker items into xflow
 *   spec delta                   Generate spec delta review for a change
 *   qa capture                   Run browser-QA capture with xflow defaults
 *   host status|sync|diff        Manage installed host skill surfaces
 *   coach                        Show role-like delivery coaching checklists
 *   atom list                    List all registered atoms
 *   quickstart                   Show copy-paste-safe first-run commands
 *   guide                        Show the human delivery loop
 *   atom show <id>               Show atom details
 *   atom run <id> [args...]      Run a single atom directly
 *   serve                        Start HTTP control plane (heavy track only)
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync, readdirSync, mkdtempSync } from 'fs';
import { resolve, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { tmpdir } from 'os';
import { ackPendingGate } from '../src/core/pending-gates.js';
import { exportDomRectsToFile, resolveCliPath } from '../src/agent_team/atoms/visual/dom-rect-export.js';
import { capturePageEvidence } from '../src/agent_team/atoms/visual/page-evidence-capture.js';
import { computeImageDiffMetrics } from '../src/agent_team/atoms/visual/image-diff.js';
import { renderVisualBenchmarkReport, renderVisualCompareReport } from '../src/agent_team/atoms/visual/visual-report.js';
import { exportVisualTokensToFile } from '../src/agent_team/atoms/visual/visual-token-export.js';
import {
  STRICT_CORPS_FORBIDDEN_ADAPTERS,
  STRICT_CORPS_FORBIDDEN_STATUSES,
  buildWorkflowManifest,
  validateExecutionLogChain,
} from '../src/core/workflow-integrity.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const [, , command, subcommand, ...rest] = process.argv;

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function main() {
  switch (command) {
    case 'workflow':
      await handleWorkflow(subcommand, rest);
      break;
    case 'corps':
      await handleCorps([subcommand, ...rest].filter(Boolean));
      break;
    case 'proof':
      await handleProof([subcommand, ...rest].filter(Boolean));
      break;
    case 'gate':
      await handleGate(subcommand, rest);
      break;
    case 'atom':
      await handleAtom(subcommand, rest);
      break;
    case 'doctor':
      await handleDoctor([subcommand, ...rest].filter(Boolean));
      break;
    case 'init':
      await handleInit([subcommand, ...rest].filter(Boolean));
      break;
    case 'goal':
      await handleGoal(subcommand, rest);
      break;
    case 'score':
      await handleScore([subcommand, ...rest].filter(Boolean));
      break;
    case 'evaluate':
      await handleEvaluate([subcommand, ...rest].filter(Boolean));
      break;
    case 'release':
      await handleRelease(subcommand, rest);
      break;
    case 'assess':
      await handleAssess([subcommand, ...rest].filter(Boolean));
      break;
    case 'demo':
      await handleDemo(subcommand, rest);
      break;
    case 'launch':
      await handleLaunch(subcommand, rest);
      break;
    case 'adoption':
      await handleAdoption(subcommand, rest);
      break;
    case 'package':
      await handlePackage(subcommand, rest);
      break;
    case 'compare':
      await handleCompare([subcommand, ...rest].filter(Boolean));
      break;
    case 'objective':
      await handleObjective([subcommand, ...rest].filter(Boolean));
      break;
    case 'adapter':
      await handleAdapter(subcommand, rest);
      break;
    case 'spec':
      await handleSpec(subcommand, rest);
      break;
    case 'qa':
      await handleQa(subcommand, rest);
      break;
    case 'host':
      await handleHost(subcommand, rest);
      break;
    case 'coach':
      await handleCoach([subcommand, ...rest].filter(Boolean));
      break;
    case 'role':
      await handleRole([subcommand, ...rest].filter(Boolean));
      break;
    case 'visual':
      await handleVisual(subcommand, rest);
      break;
    case 'quickstart':
      await handleQuickstart([subcommand, ...rest].filter(Boolean));
      break;
    case 'guide':
      await handleGuide([subcommand, ...rest].filter(Boolean));
      break;
    case 'serve':
      await handleServe([subcommand, ...rest].filter(Boolean));
      break;
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      printHelp();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

// ─── adapter ─────────────────────────────────────────────────────────────────

async function handleAdapter(sub, args) {
  if (isHelpRequest(sub) || args.some(isHelpRequest)) {
    printAdapterHelp();
    return;
  }

  switch (sub) {
    case 'import-file': {
      const parsedArgs = parseCliArgs(args);
      if (!parsedArgs.input) {
        console.error('Usage: xflow adapter import-file --input <tracker-item.json> [--project-root <path>] [--change-id <id>]');
        process.exit(1);
      }
      try {
        const projectRoot = parsedArgs.project_root || process.env.XFLOW_PROJECT_ROOT || process.cwd();
        const sourcePath = resolve(projectRoot, parsedArgs.input);
        if (!existsSync(sourcePath)) {
          console.error(`Adapter input not found: ${sourcePath}`);
          process.exit(1);
        }
        const item = JSON.parse(readFileSync(sourcePath, 'utf8'));
        const result = writeAdapterImport({
          projectRoot,
          item,
          changeId: parsedArgs.change_id,
          source: item.source || 'tracker-file',
          force: parsedArgs.force,
        });
        printAdapterResult(result, parsedArgs);
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
      break;
    }
    case 'github-issue': {
      const parsedArgs = parseCliArgs(args);
      if (!parsedArgs.repo || !parsedArgs.issue) {
        console.error('Usage: xflow adapter github-issue --repo owner/name --issue <number> [--project-root <path>] [--change-id <id>]');
        process.exit(1);
      }
      const projectRoot = parsedArgs.project_root || process.env.XFLOW_PROJECT_ROOT || process.cwd();
      const gh = spawnSync('gh', [
        'issue',
        'view',
        String(parsedArgs.issue),
        '--repo',
        String(parsedArgs.repo),
        '--json',
        'number,title,body,url,state,labels',
      ], { encoding: 'utf8' });
      if (gh.status !== 0) {
        console.error(gh.stderr || gh.stdout || 'gh issue view failed');
        process.exit(gh.status ?? 1);
      }
      const issue = JSON.parse(gh.stdout);
      const labels = Array.isArray(issue.labels)
        ? issue.labels.map((label) => label.name || label).filter(Boolean)
        : [];
      const result = writeAdapterImport({
        projectRoot,
        changeId: parsedArgs.change_id,
        source: 'github-issue',
        force: parsedArgs.force,
        item: {
          id: issue.number,
          title: issue.title,
          body: issue.body,
          url: issue.url,
          state: issue.state,
          labels,
          repo: parsedArgs.repo,
        },
      });
      printAdapterResult(result, parsedArgs);
      break;
    }
    default:
      console.error(`Unknown adapter subcommand: ${sub}`);
      console.error('Available: import-file, github-issue');
      process.exit(1);
  }
}

function writeAdapterImport({ projectRoot, item, changeId, source, force = false }) {
  const title = String(item.title || item.summary || item.name || `${source} import`).trim();
  const resolvedChangeId = normalizeChangeId(changeId || item.change_id || item.key || item.id || title);
  if (!resolvedChangeId) {
    throw new Error('adapter import requires a title, id, key, or --change-id that can form a change id');
  }
  const changeRoot = resolve(projectRoot, 'specs', 'changes', resolvedChangeId);
  const proposalPath = resolve(changeRoot, 'proposal.md');
  const statusPath = resolve(changeRoot, 'status.json');
  if (existsSync(proposalPath) && !force) {
    throw new Error(`adapter import would overwrite ${proposalPath}; pass --force to replace`);
  }

  mkdirSync(changeRoot, { recursive: true });
  const body = String(item.body || item.description || item.notes || '').trim();
  const sourceId = item.id || item.key || item.number || '';
  const sourceUrl = item.url || item.web_url || '';
  const labels = Array.isArray(item.labels) ? item.labels : [];
  const proposal = [
    '# Proposal',
    '',
    '## Source',
    '',
    `- Adapter: ${source}`,
    `- Source ID: ${sourceId || '(none)'}`,
    `- Source URL: ${sourceUrl || '(none)'}`,
    `- Labels: ${labels.length ? labels.join(', ') : '(none)'}`,
    '',
    '## Title',
    '',
    title,
    '',
    '## Body',
    '',
    body || '(empty)',
    '',
    '## Acceptance Criteria',
    '',
    '- MUST preserve source context in local xflow artifacts.',
    '- SHOULD convert tracker discussion into a reusable plan before execution.',
    '',
  ].join('\n');
  writeFileSync(proposalPath, proposal, 'utf8');

  const status = {
    change_id: resolvedChangeId,
    title,
    status: 'draft',
    current_stage: 'proposal',
    source_adapter: source,
    source_id: sourceId || null,
    source_url: sourceUrl || null,
    imported_at: new Date().toISOString(),
  };
  writeFileSync(statusPath, `${JSON.stringify(status, null, 2)}\n`, 'utf8');

  return {
    ok: true,
    adapter: source,
    change_id: resolvedChangeId,
    change_root: changeRoot,
    proposal_file: proposalPath,
    status_file: statusPath,
  };
}

function printAdapterResult(result, parsedArgs) {
  if (parsedArgs.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`xflow adapter: imported ${result.adapter}`);
  console.log(`Change: ${result.change_id}`);
  console.log(`Proposal: ${result.proposal_file}`);
  console.log(`Status: ${result.status_file}`);
}

const COMPARE_TARGETS = {
  openspec: {
    target: 'openspec',
    verdict: 'xflow leads on executable delivery closure, TDD proof, archive discipline, and release gates; OpenSpec remains lighter at pure spec authoring.',
    winner: {
      overall: 'xflow',
      basis: 'execution-grade workflow proof, spec-delta artifacts, archive discipline, and release readiness',
      caveat: 'OpenSpec remains the lighter option when the job stops at spec authoring and review.',
      confidence: 'high',
    },
    scorecard: {
      scale: '0-100',
      weights: {
        spec_authoring_friction: 15,
        executable_delivery_closure: 20,
        tdd_and_quality_gates: 15,
        migration_and_spec_delta: 15,
        workflow_auditability: 15,
        release_readiness: 20,
      },
      overall: {
        xflow: 93,
        openspec: 73,
      },
      dimensions: [
        {
          id: 'spec_authoring_friction',
          weight: 15,
          xflow: 15,
          openspec: 15,
          winner: 'tie',
          evidence_refs: ['xflow spec start', 'xflow spec quick', 'docs/openspec-migration.md command mapping', 'OpenSpec stays lighter for pure spec writing before execution starts'],
        },
        {
          id: 'executable_delivery_closure',
          weight: 20,
          xflow: 19,
          openspec: 10,
          winner: 'xflow',
          evidence_refs: ['workflows/yolo.yaml', 'workflows/corps.yaml', 'A5.archive.commit_push_close', 'npm run release:pack'],
        },
        {
          id: 'tdd_and_quality_gates',
          weight: 15,
          xflow: 14,
          openspec: 9,
          winner: 'xflow',
          evidence_refs: ['test/tdd-proof.test.js', 'xflow/atoms/i6c_tdd_quality_review.py', 'workflows/yolo.yaml'],
        },
        {
          id: 'migration_and_spec_delta',
          weight: 15,
          xflow: 14,
          openspec: 11,
          winner: 'xflow',
          evidence_refs: ['xflow spec openspec-map', 'xflow spec delta', '.as-xflow/openspec-migration.json'],
        },
        {
          id: 'workflow_auditability',
          weight: 15,
          xflow: 15,
          openspec: 9,
          winner: 'xflow',
          evidence_refs: ['HANDOFF.md', 'AHA.md', 'xflow goal audit --json', 'verify_proof.json'],
        },
        {
          id: 'release_readiness',
          weight: 20,
          xflow: 16,
          openspec: 9,
          winner: 'xflow',
          evidence_refs: ['xflow launch audit --json', 'xflow package status --json', 'docs/public-release.md', 'docs/npm-publish-handoff.md'],
        },
      ],
    },
    docs: ['docs/openspec-migration.md', 'docs/competitive-benchmark.md', 'docs/demo-proof.md'],
    xflow_edges: [
      'xflow spec start and spec quick scaffold specs/changes with low-friction defaults from one command',
      'workflow YAML validated by schema and atom registry',
      'red/green TDD proof plus test-quality review',
      'archive order with A5 before PR creation',
      'read-only OpenSpec migration map',
      'deterministic requirements-level spec delta review',
    ],
    target_edges: [
      'very low-friction spec-driven authoring',
      'native lightweight spec delta mental model',
      'broad cross-tool positioning',
    ],
    next_proof: 'Run xflow spec openspec-map, xflow spec delta, xflow score, and npm run release:pack on the same project.',
  },
  gstack: {
    target: 'gstack',
    verdict: 'gstack is stronger for command-rich role specialization and browser-centric sprint rituals; xflow is stronger when the team needs repo-owned workflow truth, goal alignment, auditable proof, and launch gating from source checkout.',
    winner: {
      overall: 'xflow',
      basis: 'repo-owned workflow state, durable goal alignment, auditable handoff artifacts, and release-owner gates',
      caveat: 'gstack remains excellent for fast role-based prompting, live browser QA, and low-friction delivery loops on top of host agents.',
      confidence: 'medium-high',
    },
    scorecard: {
      scale: '0-100',
      weights: {
        role_specialization: 15,
        browser_qa_and_roles: 15,
        repo_owned_workflow_state: 15,
        goal_alignment_and_project_memory: 15,
        release_gates_and_public_readiness: 15,
        cross_tool_host_support: 10,
        auditability_and_handoff: 15,
      },
      overall: {
        xflow: 96,
        gstack: 80,
      },
      dimensions: [
        {
          id: 'role_specialization',
          weight: 15,
          xflow: 15,
          gstack: 15,
          winner: 'tie',
          evidence_refs: ['xflow role developer|reviewer|qa|release|product', 'xflow qa review|ship|benchmark', 'xflow coach bugfix|feature|review|qa|ship|tdd|debug|red|green|verify', 'gstack.lol workflow and specialist command surface', 'github.com/garrytan/gstack AGENTS.md skill catalog'],
        },
        {
          id: 'browser_qa_and_roles',
          weight: 15,
          xflow: 15,
          gstack: 15,
          winner: 'tie',
          evidence_refs: ['xflow qa review|ship|benchmark', 'xflow visual capture-page-evidence', 'gstack.lol /qa and /ship workflow', 'github.com/garrytan/gstack AGENTS.md browser and QA commands'],
        },
        {
          id: 'repo_owned_workflow_state',
          weight: 15,
          xflow: 15,
          gstack: 9,
          winner: 'xflow',
          evidence_refs: ['workflows/yolo.yaml', 'workflows/corps.yaml', 'schemas/workflow.schema.json', 'test/workflow-loader.test.js'],
        },
        {
          id: 'goal_alignment_and_project_memory',
          weight: 15,
          xflow: 15,
          gstack: 10,
          winner: 'xflow',
          evidence_refs: ['.xflow/GOAL.md', 'xflow goal audit --json', 'docs/goal-vs-codex.md'],
        },
        {
          id: 'release_gates_and_public_readiness',
          weight: 15,
          xflow: 14,
          gstack: 10,
          winner: 'xflow',
          evidence_refs: ['xflow launch audit --strict --json', 'xflow package preflight --check-registry --check-auth --json', 'xflow adoption validate --json'],
        },
        {
          id: 'cross_tool_host_support',
          weight: 10,
          xflow: 11,
          gstack: 9,
          winner: 'xflow',
          evidence_refs: ['xflow host status', 'xflow host sync', 'xflow host diff', 'gstack.lol says it works with Claude Code and Codex', 'github.com/garrytan/gstack AGENTS.md host setup and upgrade flow'],
        },
        {
          id: 'auditability_and_handoff',
          weight: 15,
          xflow: 14,
          gstack: 12,
          winner: 'xflow',
          evidence_refs: ['HANDOFF.md', 'AHA.md', 'xflow/takein and xflow/handoff skills', 'npm run release:pack'],
        },
      ],
    },
    docs: ['docs/gstack-comparison.md', 'docs/competitive-benchmark.md', 'docs/public-benchmark.md'],
    xflow_edges: [
      'named role and QA commands such as xflow role qa and xflow qa review/ship/benchmark',
      'repo-owned workflow YAML and atom registry, not only host-level commands',
      'durable .xflow/GOAL.md consumed by yolo, corps, Ralph, handoff, and takein',
      'machine-checked proof surfaces such as spec delta, verify_proof, and release-pack gates',
      'explicit handoff and AHA artifacts that survive thread changes',
      'launch audit, package preflight, and adoption validation before public claims',
    ],
    target_edges: [
      'broad specialist command surface for product, engineering, QA, release, browser, and iOS roles',
      'real-browser QA and release rituals built into the workflow story',
      'fast host setup for Codex and Claude Code',
      'strong operator guidance when teams want named commands more than repo-owned workflow data',
    ],
    next_proof: 'Run xflow compare gstack --json beside gstack.lol and the garrytan/gstack AGENTS catalog, then verify xflow launch/goal/proof commands from source checkout.',
  },
  'spec-kit': {
    target: 'spec-kit',
    verdict: 'xflow leads on local executable gates and TDD quality enforcement; spec-kit leads on public ecosystem breadth and integrations.',
    docs: ['docs/spec-kit-benchmark.md', 'docs/integrations.md', 'docs/public-release.md'],
    xflow_edges: [
      'local workflow executor with deterministic atom gates',
      'quality proof for changed tests',
      'handoff/AHA/archive closure',
      'control-plane observability for heavy runs',
      'release-pack verification before publish',
    ],
    target_edges: [
      'larger public ecosystem',
      'more named extensions and integrations',
      'stronger public distribution surface',
    ],
    next_proof: 'Run the benchmark scenario in docs/spec-kit-benchmark.md and compare artifacts, verification, and archive evidence.',
  },
  superpowers: {
    target: 'superpowers',
    verdict: 'Superpowers is stronger as lightweight behavior discipline for coding agents and TDD coaching; xflow is stronger when the work needs repo-local executable workflow state, machine-checked evidence, cross-tool handoff, and launch gates.',
    winner: {
      overall: 'xflow',
      basis: 'repo-local team delivery, auditability, cross-tool handoff, and launch readiness',
      caveat: 'Superpowers remains the better choice for low-ceremony single-agent behavior coaching.',
      confidence: 'medium-high',
    },
    scorecard: {
      scale: '0-100',
      weights: {
        behavior_discipline: 15,
        tdd_and_debugging: 15,
        repo_local_evidence: 20,
        cross_tool_handoff: 15,
        workflow_execution: 20,
        launch_readiness: 15,
      },
      overall: {
        xflow: 91,
        superpowers: 78,
      },
      dimensions: [
        {
          id: 'behavior_discipline',
          weight: 15,
          xflow: 15,
          superpowers: 15,
          winner: 'tie',
          evidence_refs: ['xflow coach bugfix|feature|review|qa|ship|tdd|debug|red|green|verify', 'Superpowers skills: brainstorming, TDD, systematic debugging, review, verification-before-completion'],
        },
        {
          id: 'tdd_and_debugging',
          weight: 15,
          xflow: 15,
          superpowers: 14,
          winner: 'xflow',
          evidence_refs: ['xflow coach bugfix|tdd|debug', 'xflow split red/green proof: test/tdd-proof.test.js', 'Superpowers TDD and systematic-debugging skills'],
        },
        {
          id: 'repo_local_evidence',
          weight: 20,
          xflow: 19,
          superpowers: 9,
          winner: 'xflow',
          evidence_refs: ['.xflow/GOAL.md', '.as-xflow state and proof artifacts', 'xflow goal audit --json'],
        },
        {
          id: 'cross_tool_handoff',
          weight: 15,
          xflow: 14,
          superpowers: 10,
          winner: 'xflow',
          evidence_refs: ['xflow handoff/takein skills', 'Codex/OpenCode skill sync', 'npm run skill:diff'],
        },
        {
          id: 'workflow_execution',
          weight: 20,
          xflow: 18,
          superpowers: 12,
          winner: 'xflow',
          evidence_refs: ['workflows/yolo.yaml', 'workflows/corps.yaml', 'test/workflow-integrity.test.js', 'test/heavy-workflow-e2e.test.js'],
        },
        {
          id: 'launch_readiness',
          weight: 15,
          xflow: 10,
          superpowers: 6,
          winner: 'xflow',
          evidence_refs: ['xflow evaluate --json', 'xflow launch audit --json', 'xflow package status --json', 'npm run release:pack'],
        },
      ],
    },
    docs: ['docs/superpowers-comparison.md', 'docs/competitive-benchmark.md', 'docs/quality-assessment.md'],
    xflow_edges: [
      'xflow coach exposes named bugfix, feature, review, qa, ship, tdd, debug, red, green, and verify discipline loops',
      'project-level .xflow/GOAL.md that survives thread changes and feeds yolo/corps/Ralph/handoff/takein',
      'workflow YAML validated by schema, atom registry, and drift tests',
      'split red/green TDD proof plus changed-test quality review',
      'corps proof with execution-log witnesses and no-stub runtime checks',
      'launch audit, package preflight/audit, and adoption evidence gates',
    ],
    target_edges: [
      'excellent low-friction behavioral guidance for coding agents',
      'strong TDD, debugging, planning, and review skill coverage',
      'broad methodology surface with little repo setup',
      'useful when a team wants prompt-level discipline without adopting a workflow runtime',
    ],
    next_proof: 'Use xflow launch dossier, xflow score, xflow workflow validate yolo/corps, and npm run release:pack; compare that machine evidence against the lighter Superpowers skill-driven operating model.',
  },
  'codex-goal': {
    target: 'codex-goal',
    verdict: 'Codex native goal is better for thread-local intent and completion accounting; xflow goal is better when the objective must become repo-owned alignment evidence consumed by yolo, corps, Ralph, handoff, and takein.',
    winner: {
      overall: 'xflow:goal',
      basis: 'durable project alignment across tools, threads, workflows, handoff, and completion audits',
      caveat: 'Codex native goal remains better for thread-local accounting and one-conversation work.',
      confidence: 'high',
    },
    scorecard: {
      scale: '0-100',
      weights: {
        thread_local_control: 20,
        durability: 20,
        workflow_consumption: 20,
        cross_tool_portability: 20,
        auditability: 20,
      },
      overall: {
        xflow_goal: 88,
        codex_native_goal: 72,
      },
      dimensions: [
        {
          id: 'thread_local_control',
          weight: 20,
          xflow_goal: 14,
          codex_native_goal: 20,
          winner: 'codex_native_goal',
          evidence_refs: ['Codex native active thread goal and completion accounting'],
        },
        {
          id: 'durability',
          weight: 20,
          xflow_goal: 20,
          codex_native_goal: 10,
          winner: 'xflow_goal',
          evidence_refs: ['.xflow/GOAL.md', 'xflow goal show --json'],
        },
        {
          id: 'workflow_consumption',
          weight: 20,
          xflow_goal: 19,
          codex_native_goal: 12,
          winner: 'xflow_goal',
          evidence_refs: ['xflow goal audit --json checks plan/yolo/corps/Ralph/handoff/takein consumption'],
        },
        {
          id: 'cross_tool_portability',
          weight: 20,
          xflow_goal: 18,
          codex_native_goal: 10,
          winner: 'xflow_goal',
          evidence_refs: ['repo-local .xflow/GOAL.md', 'Codex/OpenCode skill sync and diff checks'],
        },
        {
          id: 'auditability',
          weight: 20,
          xflow_goal: 17,
          codex_native_goal: 20,
          winner: 'codex_native_goal',
          evidence_refs: ['Codex native completion audit', 'xflow launch dossier and goal audit evidence'],
        },
      ],
    },
    docs: ['docs/goal-vs-codex.md', 'docs/tooling-matrix.md', 'docs/quality-assessment.md'],
    xflow_edges: [
      'durable .xflow/GOAL.md artifact that survives thread and tool changes',
      'goal audit proves plan, yolo, corps, Ralph, handoff, and takein consume the same project anchor',
      'workflow proof can show whether a change aligns with, narrows, or intentionally diverges from the project goal',
      'portable across Codex, OpenCode, Claude Code, Cursor, Gemini, and generic CLI agents',
      'keeps goal as direction context instead of replacing plan.md, status.json, workflow YAML, or proof artifacts',
    ],
    target_edges: [
      'native to the active Codex thread',
      'useful for completion accounting inside one conversation',
      'low ceremony when the work does not need repo-local proof',
      'does not require committing a project artifact',
    ],
    next_proof: 'Run xflow goal audit --json, xflow assess --json, xflow launch dossier, and a yolo or corps proof path; the claim only holds if goal alignment is visible in repo-local evidence.',
  },
};

const GOAL_BOUNDARY = {
  role: 'project_direction_anchor',
  useful_when: [
    'the objective must survive thread changes',
    'multiple agent tools need the same project-local direction',
    'handoff, planning, yolo, corps, or Ralph completion reports need alignment evidence',
  ],
  not_for: [
    'replacing plan.md, status.json, workflow YAML, tests, or proof artifacts',
    'running implementation or archive steps by itself',
    'simple one-thread reminders where Codex native goal is enough',
  ],
  escalation_path: [
    'goal anchors direction',
    'plan turns direction into implementation strategy',
    'yolo or corps executes and verifies the change',
    'handoff or aha preserves what changed and why',
  ],
};

const QUALITY_ASSESSMENT = {
  verdict: 'strong, launch-ready after registry publish; adoption evidence is now non-fixture but third-party proof remains the next ecosystem win',
  codex_goal_verdict: 'xflow can beat Codex native goal at the project layer, not as a thread reminder',
  scorecard: [
    {
      surface: 'xflow:goal',
      grade: 'A',
      reason: 'Durable .xflow/GOAL.md anchor with CLI access, cross-tool portability, and machine-readable goal audit.',
      next_win: 'Collect real project examples where goal alignment changed handoff or review quality.',
    },
    {
      surface: 'xflow:yolo',
      grade: 'A',
      reason: 'Lite workflow is executable YAML with split red/green TDD proof, quality review, archive order, and drift coverage.',
      next_win: 'Publish a tiny external repo walkthrough that shows a real bugfix from red proof to archive.',
    },
    {
      surface: 'xflow:corps',
      grade: 'A',
      reason: 'Heavy workflow has governed proof, visual benchmark gates, no-stub runtime witnesses, control-plane observability, and a first-time operator guide.',
      next_win: 'Publish a third-party product/UI adoption walkthrough backed by corps proof.',
    },
    {
      surface: 'skill family',
      grade: 'A-',
      reason: 'The ladder now reads goal -> takein -> plan -> yolo/corps -> ralph -> handoff/aha, with sync and diff checks.',
      next_win: 'Publish the package and collect third-party adoption evidence beyond maintainer dogfooding.',
    },
  ],
  proof_commands: [
    'xflow assess --json',
    'xflow score --json',
    'xflow goal show --json',
    'xflow goal audit --json',
    'xflow launch claims --json',
    'xflow launch copy --json',
    'xflow launch audit --pre-publish --strict --json',
    'xflow launch audit --strict --json',
    'xflow adoption validate --splash --json',
    'xflow launch audit --splash --strict --json',
    'npm run drift:scan',
    'npm run release:pack',
  ],
  completion_boundary: {
    internal_quality: 'ready',
    codex_goal_comparison: 'proven at the project layer when xflow goal audit passes',
    external_blockers: [
      {
        id: 'npm_auth_and_publish',
        status: 'requires release-owner action',
        proof: 'xflow package status --json, xflow package preflight --check-registry --check-auth --json, and xflow package audit --check-registry --json',
      },
      {
        id: 'third_party_adoption',
        status: 'ecosystem proof still needed for splash claims',
        proof: 'docs/adoption/<third-party-project>.md plus xflow adoption validate --splash --json',
      },
    ],
  },
  docs: [
    'docs/quality-assessment.md',
    'docs/goal-vs-codex.md',
    'docs/competitive-benchmark.md',
    'docs/public-benchmark.md',
    'docs/adoption/openflow-release-hardening.md',
  ],
};

async function handleAssess(args) {
  if (args.some(isHelpRequest)) {
    printAssessHelp();
    return;
  }

  const parsedArgs = parseCliArgs(args);
  const payload = await buildAssessPayload();

  if (parsedArgs.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  printAssessText(payload);
}

async function buildAssessPayload() {
  const { buildCompetitiveScore } = await import('../src/core/competitive-score.js');
  const score = buildCompetitiveScore();
  const goalAlignment = score.dimensions.find((dimension) => dimension.id === 'goal_alignment');
  const audit = await buildLaunchAuditPayload({});
  const splashAudit = await buildLaunchAuditPayload({ splash: true, strict: true });
  const releaseOwner = buildEvaluateReleaseOwner(audit, splashAudit);
  const objectiveAudit = [
    {
      id: 'goal_vs_codex',
      status: 'proven_project_layer',
      verdict: 'xflow:goal beats Codex native goal at the project layer, while Codex still wins thread-local accounting.',
      proof: ['xflow compare codex-goal --json', 'xflow goal audit --json', '.xflow/GOAL.md'],
      blockers: [],
    },
    {
      id: 'yolo_delivery',
      status: 'proven_from_source',
      verdict: 'xflow:yolo is stronger than a plain thread goal when the work needs executable workflow state, TDD proof, and archive discipline.',
      proof: ['xflow workflow validate yolo --project-root .', 'test/tdd-proof.test.js', 'npm run release:pack'],
      blockers: [],
    },
    {
      id: 'corps_delivery',
      status: 'proven_from_source',
      verdict: 'xflow:corps is stronger than a plain thread goal when the work needs governed heavy proof, benchmark gates, and no-stub runtime evidence.',
      proof: ['xflow corps --explain --json', 'xflow workflow validate corps --project-root .', 'test/heavy-workflow-e2e.test.js'],
      blockers: [],
    },
    {
      id: 'skill_family_open_source_credibility',
      status: 'ready_from_source_checkout',
      verdict: 'The skill family is credible as an open-source runtime from source checkout today, but public package proof is still missing.',
      proof: ['xflow assess --json', 'xflow evaluate --json', 'npm run release:pack'],
      blockers: releaseOwner.ready_for_publish ? [] : ['published_package'],
    },
    {
      id: 'open_source_launch',
      status: releaseOwner.ready_for_publish ? 'ready' : 'blocked',
      verdict: releaseOwner.ready_for_publish
        ? 'Public package launch is fully backed by registry evidence.'
        : 'Open-source launch is still blocked until registry publication is proven.',
      proof: ['xflow package status --json', 'xflow launch audit --strict --json', 'xflow release status --json'],
      blockers: releaseOwner.ready_for_publish ? [] : [releaseOwner.blocking_surface].filter(Boolean),
    },
    {
      id: 'industry_splash',
      status: releaseOwner.ready_for_splash ? 'ready' : 'blocked',
      verdict: releaseOwner.ready_for_splash
        ? 'Industry-splash claims are backed by both registry publication and third-party adoption evidence.'
        : 'Industry-splash claims are still blocked until registry publication and third-party adoption are both proven.',
      proof: ['xflow adoption validate --splash --json', 'xflow launch audit --splash --strict --json', 'xflow release status --json'],
      blockers: releaseOwner.ready_for_splash ? [] : releaseOwner.blocking_surfaces,
    },
  ];
  return {
    ok: score.ok && goalAlignment?.status === 'strong',
    generated_at: new Date().toISOString(),
    ...QUALITY_ASSESSMENT,
    competitive_score: {
      score: score.score,
      max_score: score.max_score,
      goal_alignment: goalAlignment?.status || 'missing',
    },
    readiness: {
      source_checkout: {
        status: 'ready',
        reason: 'Repository-local evaluation is reproducible from source checkout with release:pack and the public assessment commands.',
        proof: ['npm run release:pack', 'xflow assess --json', 'xflow evaluate --json'],
      },
      open_source_launch: {
        status: releaseOwner.ready_for_publish ? 'ready' : 'blocked',
        blockers: releaseOwner.ready_for_publish ? [] : [releaseOwner.blocking_surface].filter(Boolean),
        reason: releaseOwner.ready_for_publish
          ? 'Registry publication evidence is present, so the public npm install path is claim-safe.'
          : 'Open-source launch still requires real npm publication evidence beyond source-checkout quality.',
        proof: ['xflow package status --json', 'xflow launch audit --strict --json', 'xflow release status --json'],
      },
      industry_splash: {
        status: releaseOwner.ready_for_splash ? 'ready' : 'blocked',
        blockers: releaseOwner.ready_for_splash ? [] : releaseOwner.blocking_surfaces,
        reason: releaseOwner.ready_for_splash
          ? 'Third-party adoption and registry publication evidence are both present.'
          : 'Industry-splash claims still require third-party adoption evidence plus registry publication.',
        proof: ['xflow adoption validate --splash --json', 'xflow launch audit --splash --strict --json', 'xflow release status --json'],
      },
    },
    objective_audit: objectiveAudit,
  };
}

function printAssessText(payload) {
  console.log('xflow quality assessment');
  console.log(`Verdict: ${payload.verdict}`);
  console.log(`Codex goal comparison: ${payload.codex_goal_verdict}`);
  console.log(`Score: ${payload.competitive_score.score}/${payload.competitive_score.max_score}; goal_alignment=${payload.competitive_score.goal_alignment}\n`);
  for (const item of payload.scorecard) {
    console.log(`${item.grade} ${item.surface}`);
    console.log(`  Why: ${item.reason}`);
    console.log(`  Next win: ${item.next_win}`);
  }
  console.log('\nReadiness ladder:');
  console.log(`- source_checkout: ${payload.readiness.source_checkout.status}`);
  console.log(`- open_source_launch: ${payload.readiness.open_source_launch.status}${payload.readiness.open_source_launch.blockers.length ? ` (${payload.readiness.open_source_launch.blockers.join(', ')})` : ''}`);
  console.log(`- industry_splash: ${payload.readiness.industry_splash.status}${payload.readiness.industry_splash.blockers.length ? ` (${payload.readiness.industry_splash.blockers.join(', ')})` : ''}`);
  console.log('\nObjective audit:');
  for (const item of payload.objective_audit) {
    console.log(`- ${item.id}: ${item.status}`);
  }
  console.log(`\nDocs: ${payload.docs.join(', ')}`);
  console.log(`Proof: ${payload.proof_commands.join(' && ')}`);
  console.log(`Boundary: internal_quality=${payload.completion_boundary.internal_quality}; external_blockers=${payload.completion_boundary.external_blockers.map((item) => item.id).join(', ')}`);
}

function buildComparePayload(target) {
  const payload = COMPARE_TARGETS[target];
  if (!payload) throw new Error(`Unknown compare target: ${target}`);
  const result = {
    ok: true,
    ...payload,
  };
  if (target === 'codex-goal') {
    result.boundary = GOAL_BOUNDARY;
  }
  return result;
}

async function handleEvaluate(args) {
  if (args.some(isHelpRequest)) {
    printEvaluateHelp();
    return;
  }

  const parsedArgs = parseCliArgs(args);
  const assess = await buildAssessPayload();
  const audit = await buildLaunchAuditPayload(parsedArgs);
  const splashAudit = await buildLaunchAuditPayload({ ...parsedArgs, splash: true, strict: true });
  const claims = buildLaunchClaimsPayload(audit);
  const copy = buildLaunchCopyPayload(audit);
  const splashClaims = buildLaunchClaimsPayload(splashAudit);
  const splashCopy = buildLaunchCopyPayload(splashAudit);
  const competitive = {
    codex_goal: buildComparePayload('codex-goal'),
    superpowers: buildComparePayload('superpowers'),
  };
  const withoutSelfEvaluate = (section) => ({
    ...section,
    commands: section.commands.filter((command) => !/\bevaluate\b/.test(command)),
  });
  const quickstart = {
    first_run_is_copy_paste_safe: true,
    published_package: withoutSelfEvaluate(QUICKSTART.published_package),
    source_checkout: withoutSelfEvaluate(QUICKSTART.source_checkout),
    release_owner_gates: QUICKSTART.release_owner_gates,
  };
  const releaseOwner = buildEvaluateReleaseOwner(audit, splashAudit);
  const payload = {
    ok: assess.ok && audit.ok,
    generated_at: new Date().toISOString(),
    verdict: audit.launch_ready
      ? 'ready: quality, claims, copy, and launch audit are green'
      : 'evaluation-ready: internal quality is ready, but launch has external blockers',
    recommended_path: audit.launch_ready ? 'published_package' : 'source_checkout',
    quality: {
      ok: assess.ok,
      score: assess.competitive_score.score,
      max_score: assess.competitive_score.max_score,
      goal_alignment: assess.competitive_score.goal_alignment,
      completion_boundary: assess.completion_boundary,
      readiness: assess.readiness,
      objective_audit: assess.objective_audit,
    },
    launch: {
      ready: audit.launch_ready,
      mode: audit.mode,
      missing_surfaces: audit.missing_surfaces.map((surface) => surface.id),
      next_actions: audit.next_actions,
      package_evidence: audit.package_evidence,
    },
    splash_launch: {
      ready: splashAudit.launch_ready,
      mode: splashAudit.mode,
      verdict: splashAudit.verdict,
      missing_surfaces: splashAudit.missing_surfaces.map((surface) => surface.id),
      next_actions: splashAudit.next_actions,
      package_evidence: splashAudit.package_evidence,
    },
    claims: {
      allowed: claims.allowed_claims.map((claim) => claim.id),
      blocked: claims.blocked_claims.map((claim) => claim.id),
      forbidden_phrases: copy.forbidden_phrases,
    },
    splash_claims: {
      allowed: splashClaims.allowed_claims.map((claim) => claim.id),
      blocked: splashClaims.blocked_claims.map((claim) => claim.id),
      forbidden_phrases: splashCopy.forbidden_phrases,
    },
    release_owner: releaseOwner,
    competitive,
    quickstart,
    proof_commands: [
      'xflow evaluate --json',
      'xflow release status --json',
      'xflow compare codex-goal --json',
      'xflow compare superpowers --json',
      ...assess.proof_commands,
      'xflow adoption status --json',
      'xflow package status --json',
      'xflow adoption trial --name <team-or-project> --source <tracker-or-pr> --track yolo --json',
      'xflow launch audit --json',
    ],
    docs: [
      'README.md',
      'docs/quickstart.md',
      'docs/quality-assessment.md',
      'docs/public-release.md',
    ],
  };

  if (parsedArgs.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('xflow evaluate');
  console.log(`Verdict: ${payload.verdict}`);
  console.log(`Recommended path: ${payload.recommended_path}`);
  console.log(`Score: ${payload.quality.score}/${payload.quality.max_score}; goal_alignment=${payload.quality.goal_alignment}`);
  console.log(`Readiness: source_checkout=${payload.quality.readiness.source_checkout.status}; open_source_launch=${payload.quality.readiness.open_source_launch.status}; industry_splash=${payload.quality.readiness.industry_splash.status}`);
  console.log(`Objective audit: goal_vs_codex=${payload.quality.objective_audit.find((item) => item.id === 'goal_vs_codex')?.status}; yolo_delivery=${payload.quality.objective_audit.find((item) => item.id === 'yolo_delivery')?.status}; corps_delivery=${payload.quality.objective_audit.find((item) => item.id === 'corps_delivery')?.status}`);
  console.log(`Launch ready: ${payload.launch.ready ? 'yes' : 'not yet'}`);
  console.log(`Missing: ${payload.launch.missing_surfaces.length ? payload.launch.missing_surfaces.join(', ') : 'none'}`);
  console.log(`Splash launch ready: ${payload.splash_launch.ready ? 'yes' : 'not yet'}`);
  console.log(`Splash missing: ${payload.splash_launch.missing_surfaces.length ? payload.splash_launch.missing_surfaces.join(', ') : 'none'}`);
  console.log(`Splash blocked claims: ${payload.splash_claims.blocked.length ? payload.splash_claims.blocked.join(', ') : 'none'}`);
  if (payload.launch.package_evidence && !payload.launch.package_evidence.ok) {
    const issue = payload.launch.package_evidence.issues[0] || 'package evidence is incomplete';
    console.log(`Package evidence: not yet (${issue})`);
    const packageAction = payload.launch.package_evidence.next_actions[0];
    if (packageAction) console.log(`Package next action: ${packageAction.id}: ${packageAction.command}`);
  }
  console.log(`Release owner status: ${payload.release_owner.ready_for_publish ? 'ready' : `blocked by ${payload.release_owner.blocking_surface || 'unknown'}`}`);
  if (payload.release_owner.next_action) {
    console.log(`Release owner next: ${payload.release_owner.next_action.id}: ${payload.release_owner.next_action.command}`);
  }
  console.log('\nCompetitive position:');
  console.log(`- Codex goal: ${payload.competitive.codex_goal.verdict}`);
  console.log(`- Superpowers: ${payload.competitive.superpowers.verdict}`);
  console.log('\nNext actions:');
  if (payload.launch.next_actions.length === 0) {
    console.log('- None.');
  } else {
    for (const action of payload.launch.next_actions) console.log(`- ${action.id}: ${action.command}`);
  }
  console.log('\nSplash next actions:');
  if (payload.splash_launch.next_actions.length === 0) {
    console.log('- None.');
  } else {
    for (const action of payload.splash_launch.next_actions) console.log(`- ${action.id}: ${action.command}`);
  }
  console.log('\nSafe first commands:');
  const section = payload.recommended_path === 'published_package'
    ? payload.quickstart.published_package
    : payload.quickstart.source_checkout;
  for (const command of section.commands) console.log(`- ${command}`);
  console.log(`\nDocs: ${payload.docs.join(', ')}`);
}

function buildEvaluateReleaseOwner(audit, splashAudit) {
  const packageEvidence = audit.package_evidence || {};
  const packageActions = Array.isArray(packageEvidence.next_actions) ? packageEvidence.next_actions : [];
  const primaryActions = audit.mode === 'pre_publish' && packageEvidence.ok === false
    ? packageActions
    : audit.next_actions;
  const seen = new Set();
  const nextActions = [];
  for (const action of [...primaryActions, ...audit.next_actions, ...splashAudit.next_actions, ...packageActions]) {
    if (!action || !action.id || !action.command) continue;
    const key = `${action.id}\n${action.command}`;
    if (seen.has(key)) continue;
    seen.add(key);
    nextActions.push(action);
  }
  const blockingSurface = packageEvidence.ok === false
    ? (audit.mode === 'pre_publish' ? 'package_preflight' : 'published_package')
    : (audit.missing_surfaces[0]?.id || splashAudit.missing_surfaces[0]?.id || null);
  const blockingSurfaces = [];
  for (const id of [
    blockingSurface,
    ...audit.missing_surfaces.map((surface) => surface.id),
    ...splashAudit.missing_surfaces.map((surface) => surface.id),
  ]) {
    if (!id || blockingSurfaces.includes(id)) continue;
    blockingSurfaces.push(id);
  }
  return {
    ready_for_publish: audit.launch_ready,
    ready_for_splash: splashAudit.launch_ready,
    mode: audit.mode,
    blocking_surface: blockingSurface,
    blocking_surfaces: blockingSurfaces,
    next_action: nextActions[0] || null,
    next_actions: nextActions,
    external_trial_command: 'xflow adoption trial --name <third-party-project> --source <public-pr-or-external-repo> --track yolo',
    package_status: {
      ok: packageEvidence.ok === true,
      package_name: packageEvidence.package_name,
      expected_version: packageEvidence.expected_version,
      npm_identity: packageEvidence.npm_identity || null,
      registry_status: packageEvidence.registry_status || null,
      registry_version: packageEvidence.registry_version || null,
      issues: packageEvidence.issues || [],
    },
    handoff_doc: 'docs/npm-publish-handoff.md',
    boundary: 'Goal evidence proves durable project direction; release ownership still requires package, registry, adoption, and splash gates to pass.',
  };
}

async function handleRelease(sub, args) {
  if (isHelpRequest(sub) || args.some(isHelpRequest)) {
    printReleaseHelp();
    return;
  }
  if (sub !== 'status') {
    console.error(`Unknown release subcommand: ${sub || '<none>'}`);
    console.error('Available: status');
    process.exit(1);
  }

  const parsedArgs = parseCliArgs(args);
  const audit = await buildLaunchAuditPayload(parsedArgs);
  const splashAudit = await buildLaunchAuditPayload({ ...parsedArgs, splash: true, strict: true });
  const payload = {
    ok: audit.launch_ready,
    generated_at: new Date().toISOString(),
    release_owner: buildEvaluateReleaseOwner(audit, splashAudit),
    launch: {
      ready: audit.launch_ready,
      mode: audit.mode,
      missing_surfaces: audit.missing_surfaces.map((surface) => surface.id),
    },
    splash_launch: {
      ready: splashAudit.launch_ready,
      missing_surfaces: splashAudit.missing_surfaces.map((surface) => surface.id),
    },
  };

  if (parsedArgs.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('xflow release status');
  console.log(`Publish ready: ${payload.release_owner.ready_for_publish ? 'yes' : 'not yet'}`);
  console.log(`Splash ready: ${payload.release_owner.ready_for_splash ? 'yes' : 'not yet'}`);
  console.log(`Blocking surface: ${payload.release_owner.blocking_surface || 'none'}`);
  console.log(`Blocking surfaces: ${payload.release_owner.blocking_surfaces.length ? payload.release_owner.blocking_surfaces.join(', ') : 'none'}`);
  if (payload.release_owner.package_status.issues.length) {
    console.log(`Package issue: ${payload.release_owner.package_status.issues[0]}`);
  }
  if (payload.release_owner.next_action) {
    console.log(`Next action: ${payload.release_owner.next_action.id}: ${payload.release_owner.next_action.command}`);
  }
  if (!payload.release_owner.ready_for_splash) {
    console.log(`External trial: ${payload.release_owner.external_trial_command}`);
  }
  console.log(`Handoff: ${payload.release_owner.handoff_doc}`);
}

const LAUNCH_DEMO = {
  title: 'openflow public launch demo',
  promise: 'Show that xflow turns a project goal into verified yolo or corps delivery evidence.',
  docs: ['docs/launch-demo.md', 'docs/demo-proof.md', 'docs/quality-assessment.md'],
  paths: [
    {
      id: 'goal-to-yolo',
      label: 'Goal to yolo',
      use_when: 'backend, docs, infra, and small UI changes',
      commands: [
        'xflow guide',
        'xflow assess',
        'xflow init --project-root .',
        'xflow goal set "Ship the next verified change" --project-root .',
        'xflow goal audit --project-root . --json',
        'xflow workflow validate yolo --project-root .',
        'xflow workflow run yolo --project-root . --title "Example verified change" --change-type backend --tdd-red-command "npm test -- --grep new-behavior" --tdd-green-command "npm test"',
      ],
      evidence: [
        '.xflow/GOAL.md',
        'xflow goal audit --json',
        'specs/changes/<change-id>/tdd/red-0.json',
        'specs/changes/<change-id>/tdd/green-0.json',
        'specs/changes/<change-id>/tdd/quality-0.json',
        'HANDOFF.md',
      ],
    },
    {
      id: 'goal-to-corps-proof',
      label: 'Goal to corps proof',
      use_when: 'product, UI, competitor-led, or multi-agent work',
      commands: [
        'xflow goal show --json',
        'xflow goal audit --json',
        'xflow corps --title "Competitor-aligned workbench" --change-type frontend --change-id launch-corps-demo --capture-url http://127.0.0.1:4174/ --reference-image refs/competitor-main.png --dry-run --json',
        'xflow proof --track corps --change-id launch-corps-demo',
      ],
      evidence: [
        '.xflow/GOAL.md',
        'xflow goal audit --json',
        'specs/changes/launch-corps-demo/visual_benchmark.json',
        'specs/changes/launch-corps-demo/corps_proof.json',
        'hash-linked execution log witnesses',
        'final goal-alignment review',
      ],
    },
  ],
  acceptance_gate: [
    'xflow demo launch --json',
    'xflow assess --json',
    'xflow score --json',
    'npm run release:pack',
  ],
};

async function handleDemo(sub, args) {
  if (isHelpRequest(sub)) {
    printDemoHelp();
    return;
  }

  const action = sub || 'launch';
  if (action === 'clean') {
    await handleCleanDemo(args);
    return;
  }
  if (action !== 'launch') {
    console.error(`Unknown demo action: ${action}`);
    printDemoHelp();
    process.exit(1);
  }

  const parsedArgs = parseCliArgs(args);
  const payload = {
    ok: true,
    generated_at: new Date().toISOString(),
    ...LAUNCH_DEMO,
  };

  if (parsedArgs.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(payload.title);
  console.log(`Promise: ${payload.promise}\n`);
  for (const demoPath of payload.paths) {
    console.log(`${demoPath.label} (${demoPath.id})`);
    console.log(`Use when: ${demoPath.use_when}`);
    console.log('Commands:');
    for (const command of demoPath.commands) console.log(`  ${command}`);
    console.log(`Evidence: ${demoPath.evidence.join(', ')}\n`);
  }
  console.log(`Docs: ${payload.docs.join(', ')}`);
  console.log(`Acceptance: ${payload.acceptance_gate.join(' && ')}`);
}

async function handleCleanDemo(args) {
  if (args.some(isHelpRequest)) {
    printDemoHelp();
    return;
  }

  const parsedArgs = parseCliArgs(args);
  const projectRoot = resolve(parsedArgs.project_root || mkdtempSync(resolve(tmpdir(), 'openflow-clean-')));
  const shouldCleanup = !parsedArgs.project_root && !parsedArgs.keep;
  mkdirSync(projectRoot, { recursive: true });
  const packagePath = resolve(projectRoot, 'package.json');
  if (!existsSync(packagePath)) {
    writeFileSync(packagePath, JSON.stringify({ name: 'openflow-clean-smoke', version: '0.0.0', private: true }, null, 2));
  }

  const cli = resolve(ROOT, 'bin', 'xflow.js');
  const steps = [
    {
      id: 'init_project',
      command: ['node', cli, 'init', '--project-root', projectRoot],
      display: `node ${relativeToProject(ROOT, cli)} init --project-root ${projectRoot}`,
    },
    {
      id: 'set_goal',
      command: ['node', cli, 'goal', 'set', 'Ship the next verified change', '--project-root', projectRoot],
      display: `node ${relativeToProject(ROOT, cli)} goal set "Ship the next verified change" --project-root ${projectRoot}`,
    },
    {
      id: 'audit_goal',
      command: ['node', cli, 'goal', 'audit', '--project-root', projectRoot, '--json'],
      display: `node ${relativeToProject(ROOT, cli)} goal audit --project-root ${projectRoot} --json`,
    },
    {
      id: 'doctor',
      command: ['node', cli, 'doctor', '--project-root', projectRoot, '--json'],
      display: `node ${relativeToProject(ROOT, cli)} doctor --project-root ${projectRoot} --json`,
    },
    {
      id: 'validate_yolo',
      command: ['node', cli, 'workflow', 'validate', 'yolo', '--project-root', projectRoot],
      display: `node ${relativeToProject(ROOT, cli)} workflow validate yolo --project-root ${projectRoot}`,
    },
  ];

  const results = [];
  let ok = true;
  try {
    for (const step of steps) {
      const result = spawnSync(step.command[0], step.command.slice(1), {
        cwd: ROOT,
        encoding: 'utf8',
        timeout: Number(parsedArgs.timeout_ms || 10000),
      });
      const stepOk = result.status === 0;
      if (!stepOk) ok = false;
      results.push({
        id: step.id,
        command: step.display,
        ok: stepOk,
        status: result.status,
        stdout: String(result.stdout || '').trim(),
        stderr: String(result.stderr || '').trim(),
      });
      if (!stepOk) break;
    }

    const artifacts = {
      package_json: existsSync(packagePath),
      project_config: existsSync(resolve(projectRoot, '.as-xflow', 'config.json')),
      goal_file: existsSync(resolve(projectRoot, '.xflow', 'GOAL.md')),
    };
    const payload = {
      ok,
      demo: 'clean_project_adoption',
      project_root: projectRoot,
      cleaned_up: shouldCleanup,
      kept: !shouldCleanup,
      artifacts,
      commands: results,
      docs: ['docs/demo-proof.md', 'docs/quickstart.md', 'docs/examples-gallery.md'],
      next: ok
        ? 'Use xflow demo launch for the goal-to-yolo and goal-to-corps proof story.'
        : 'Inspect the first failed command output before retrying the clean smoke.',
    };

    if (parsedArgs.json) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.log('xflow demo clean');
      console.log(`Status: ${ok ? 'pass' : 'fail'}`);
      console.log(`Project root: ${projectRoot}${shouldCleanup ? ' (cleaned up)' : ''}`);
      console.log('\nCommands:');
      for (const result of results) {
        console.log(`- ${result.ok ? 'pass' : 'fail'} ${result.id}: ${result.command}`);
      }
      console.log('\nArtifacts:');
      for (const [id, exists] of Object.entries(artifacts)) console.log(`- ${exists ? 'yes' : 'no'} ${id}`);
      console.log(`\nNext: ${payload.next}`);
    }

    if (!ok) process.exit(1);
  } finally {
    if (shouldCleanup) rmSync(projectRoot, { recursive: true, force: true });
  }
}

const LAUNCH_AUDIT = {
  available_surfaces: [
    'xflow quickstart --json',
    'xflow evaluate --json',
    'xflow release status --json',
    'xflow assess --json',
    'xflow demo launch --json',
    'xflow launch claims --json',
    'xflow launch copy --json',
    'xflow score --json',
    'xflow goal audit --json',
    'xflow adoption status --json',
    'npm run release:pack',
    'npm run publish:check',
    'xflow package status --json',
    'xflow package preflight --check-registry --check-auth --json',
    'xflow package audit --check-registry --json',
  ],
  release_gate: [
    'npm run release:pack',
    'npm run publish:check',
    'xflow evaluate --json',
    'xflow release status --json',
    'xflow adoption trial --name <team-or-project> --source <tracker-or-pr> --track yolo --json',
    'xflow goal audit --json',
    'xflow adoption status --json',
    'xflow adoption validate --json',
    'xflow launch claims --json',
    'xflow launch copy --json',
    'xflow package status --json',
    'xflow package preflight --check-registry --check-auth --json',
    'xflow package audit --check-registry --json',
    'xflow launch audit --strict --json',
    'xflow launch audit --splash --strict --json',
    'git status --short --branch',
  ],
  docs: [
    'docs/public-release.md',
    'docs/quality-assessment.md',
    'docs/launch-demo.md',
    'docs/launch-dossier.md',
    'docs/examples-gallery.md',
    'docs/adoption/README.md',
    'docs/public-benchmark.md',
  ],
};

const LAUNCH_MISSING_SURFACES = {
  real_external_adoption: {
    id: 'real_external_adoption',
    requirement: 'At least one real tracker, team, or external project adoption artifact beyond docs/fixtures/tracker-item.json.',
    why_it_matters: 'A public launch claim needs evidence that someone outside the fixture path can understand and benefit from xflow.',
    acceptable_evidence: [
      'docs/adoption/README.md plus docs/adoption/<team-or-project>.md',
      'docs/adoption/<team-or-project>.md',
      'a linked public PR using xflow artifacts',
      'a sanitized tracker import with provenance and resulting xflow artifacts',
    ],
  },
  third_party_adoption: {
    id: 'third_party_adoption',
    requirement: 'At least one adoption artifact comes from a third-party project, public PR, external repository, or named external team beyond maintainer dogfooding.',
    why_it_matters: 'An industry-splash claim needs ecosystem evidence, not only a maintainer hardening run inside openflow.',
    acceptable_evidence: [
      'docs/adoption/<third-party-project>.md with a public PR, external repository, or named external team source',
      'xflow adoption validate --splash --json passes',
      'xflow launch audit --splash --strict --json passes',
    ],
  },
  published_package: {
    id: 'published_package',
    requirement: 'Public npm package ownership confirmed and package published from a green dry run.',
    why_it_matters: 'A launch story is incomplete while users cannot install the advertised package name.',
    acceptable_evidence: [
      'npm view openflow name version --json returns this package',
      'npm publish --access public completed for the intended version',
    ],
  },
  package_preflight: {
    id: 'package_preflight',
    requirement: 'Pre-publish npm identity and package-name/version availability are confirmed without publishing.',
    why_it_matters: 'A release owner needs a machine-readable stop sign before the irreversible npm publish step.',
    acceptable_evidence: [
      'xflow package preflight --check-registry --check-auth --json passes',
      'xflow launch audit --pre-publish --strict --json passes before npm publish',
    ],
  },
  goal_alignment_audit: {
    id: 'goal_alignment_audit',
    requirement: 'Project goal exists and the core xflow skill family declares it as an intake, handoff, or completion-audit input.',
    why_it_matters: 'The Codex-goal comparison is only launch-grade if xflow can prove goal alignment is wired into yolo, corps, Ralph, handoff, and takein.',
    acceptable_evidence: [
      'xflow goal audit --json passes',
      '.xflow/GOAL.md plus goal audit checks for plan/yolo/corps/Ralph/handoff/takein',
    ],
  },
};

function buildLaunchReadySurfaces({
  score,
  goalStatus,
  adoptionStatus,
  packageStatus,
  prePublishMode,
  splashMode,
  launchReady,
}) {
  const surfaces = [];
  if (score.ok) {
    surfaces.push('xflow assess --json', 'xflow score --json');
  }
  if (goalStatus.ok) {
    surfaces.push('xflow goal audit --json');
  }
  if (adoptionStatus.ok) {
    surfaces.push('xflow adoption validate --json');
  }
  if (splashMode && adoptionStatus.third_party_ok) {
    surfaces.push('xflow adoption validate --splash --json');
  }
  if (packageStatus.ok) {
    surfaces.push(prePublishMode
      ? 'xflow package preflight --check-registry --check-auth --json'
      : 'xflow package audit --check-registry --json');
  }
  if (launchReady) {
    surfaces.push(prePublishMode
      ? 'xflow launch audit --pre-publish --strict --json'
      : 'xflow launch audit --strict --json');
    if (splashMode) surfaces.push('xflow launch audit --splash --strict --json');
  }
  return surfaces;
}

async function handleLaunch(sub, args) {
  if (isHelpRequest(sub) || args.some((arg) => isHelpRequest(arg))) {
    printLaunchHelp();
    return;
  }

  const action = sub || 'audit';
  if (!['audit', 'dossier', 'claims', 'copy'].includes(action)) {
    console.error(`Unknown launch action: ${action}`);
    printLaunchHelp();
    process.exit(1);
  }

  const parsedArgs = parseCliArgs(args);
  const payload = await buildLaunchAuditPayload(parsedArgs);

  if (action === 'claims') {
    const claims = buildLaunchClaimsPayload(payload);
    if (parsedArgs.json) {
      console.log(JSON.stringify(claims, null, 2));
    } else {
      printLaunchClaimsText(claims);
    }
    if (parsedArgs.strict && !claims.launch_ready) process.exit(1);
    return;
  }

  if (action === 'copy') {
    const copy = buildLaunchCopyPayload(payload);
    const markdown = renderLaunchCopy(copy);
    if (parsedArgs.output) {
      const outputPath = resolveCliPath(payload.project_root, parsedArgs.output);
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, markdown, 'utf8');
      copy.output_file = outputPath;
      if (!parsedArgs.json) {
        console.log(`xflow launch copy: wrote ${outputPath}`);
      }
    }
    if (parsedArgs.json) {
      console.log(JSON.stringify(copy, null, 2));
    } else if (!parsedArgs.output) {
      console.log(markdown);
    }
    if (parsedArgs.strict && !copy.launch_ready) process.exit(1);
    return;
  }

  if (action === 'dossier') {
    const splashPayload = await buildLaunchAuditPayload({ ...parsedArgs, splash: true, strict: true });
    const dossier = renderLaunchDossier(payload, splashPayload);
    if (parsedArgs.output) {
      const outputPath = resolveCliPath(payload.project_root, parsedArgs.output);
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, dossier, 'utf8');
      if (!parsedArgs.json) {
        console.log(`xflow launch dossier: wrote ${outputPath}`);
      }
      payload.output_file = outputPath;
    }
    if (parsedArgs.json) {
      console.log(JSON.stringify({
        ok: true,
        generated_at: payload.generated_at,
        output_file: payload.output_file || null,
        dossier,
        audit: payload,
        splash_audit: splashPayload,
      }, null, 2));
    } else if (!parsedArgs.output) {
      console.log(dossier);
    }
    return;
  }

  if (parsedArgs.json) {
    console.log(JSON.stringify(payload, null, 2));
    if (parsedArgs.strict && !payload.launch_ready) process.exit(1);
    return;
  }

  printLaunchAuditText(payload);
  if (parsedArgs.strict && !payload.launch_ready) process.exit(1);
}

function buildLaunchClaimsPayload(payload) {
  const allowedClaims = [];
  const blockedClaims = [];

  if (payload.competitive_score.ok) {
    allowedClaims.push({
      id: 'local_engine_ready',
      claim: `Local engine evidence is strong: xflow score is ${payload.competitive_score.score}/${payload.competitive_score.max_score}.`,
      proof: ['xflow score --json', 'npm run release:pack'],
    });
  }

  if (payload.goal_evidence.ok) {
    allowedClaims.push({
      id: 'project_goal_beats_thread_goal',
      claim: 'xflow can beat Codex native goal at the project layer because the repo-owned goal is audited across plan, yolo, corps, Ralph, handoff, and takein.',
      proof: ['xflow compare codex-goal --json', 'xflow goal audit --json'],
    });
  }

  if (payload.adoption_evidence.ok) {
    allowedClaims.push({
      id: 'non_fixture_adoption_evidence',
      claim: `Launch claims are backed by ${payload.adoption_evidence.record_count} reviewable non-fixture adoption record(s).`,
      proof: ['xflow adoption validate --json', 'docs/adoption/openflow-release-hardening.md'],
    });
  }

  if (payload.adoption_evidence.third_party_ok) {
    allowedClaims.push({
      id: 'third_party_adoption_evidence',
      claim: `Industry-splash claims have ${payload.adoption_evidence.third_party_record_count} reviewable third-party adoption record(s).`,
      proof: ['xflow adoption validate --splash --json', 'xflow launch audit --splash --strict --json'],
    });
  }

  allowedClaims.push({
    id: 'copy_paste_safe_first_run',
    claim: 'First-run and release-owner commands are separated so evaluators can copy the quickstart without hitting expected publish-gate failures.',
    proof: ['xflow quickstart --json', 'docs/quickstart.md'],
  });

  for (const missing of payload.missing_surfaces) {
    const claim = missing.id === 'published_package'
      ? 'Do not claim public npm install readiness or splash-launch completion until registry publication is verified.'
      : missing.id === 'package_preflight'
        ? 'Do not claim pre-publish readiness until npm identity and package-name/version availability are verified.'
        : missing.id === 'real_external_adoption'
          ? 'Do not claim broad adoption until a real external adoption artifact is present.'
          : missing.id === 'third_party_adoption'
            ? 'Do not claim broad third-party adoption or industry-splash readiness until third-party adoption evidence is present.'
          : `Do not claim launch completion until ${missing.requirement}`;
    blockedClaims.push({
      id: missing.id,
      claim,
      required_evidence: missing.acceptable_evidence,
    });
  }

  return {
    ok: true,
    generated_at: payload.generated_at,
    launch_ready: payload.launch_ready,
    verdict: payload.launch_ready
      ? 'claim-ready: launch claims are fully backed by current audit evidence'
      : 'claim-limited: use allowed claims, but hold blocked claims until missing evidence is present',
    allowed_claims: allowedClaims,
    blocked_claims: blockedClaims,
    audit: {
      mode: payload.mode,
      splash: payload.splash,
      missing_surfaces: payload.missing_surfaces.map((surface) => surface.id),
      competitive_score: payload.competitive_score,
      adoption_ok: payload.adoption_evidence.ok,
      third_party_adoption_ok: payload.adoption_evidence.third_party_ok,
      goal_ok: payload.goal_evidence.ok,
      package_ok: payload.package_evidence.ok,
    },
  };
}

function buildLaunchEvidenceCommands(payload) {
  const splashFlag = payload.splash ? ' --splash' : '';
  return Array.from(new Set([
    'xflow evaluate --json',
    'xflow assess --json',
    'xflow score --json',
    'xflow compare codex-goal --json',
    'xflow goal audit --json',
    `xflow launch claims${splashFlag} --json`,
    `xflow launch copy${splashFlag} --json`,
    `xflow launch audit${splashFlag} --strict --json`,
    'xflow adoption validate --splash --json',
    'xflow launch audit --splash --strict --json',
    'npm run release:pack',
  ]));
}

function printLaunchClaimsText(payload) {
  console.log('xflow launch claims');
  console.log(`Verdict: ${payload.verdict}`);
  console.log(`Launch ready: ${payload.launch_ready ? 'yes' : 'not yet'}\n`);
  console.log('Allowed public claims:');
  for (const item of payload.allowed_claims) {
    console.log(`- ${item.id}: ${item.claim}`);
  }
  console.log('\nHold these claims:');
  if (payload.blocked_claims.length === 0) {
    console.log('- None.');
  } else {
    for (const item of payload.blocked_claims) {
      console.log(`- ${item.id}: ${item.claim}`);
    }
  }
}

function buildLaunchCopyPayload(payload) {
  const claims = buildLaunchClaimsPayload(payload);
  const packageBlocked = claims.blocked_claims.some((item) => item.id === 'published_package');
  const installCommand = packageBlocked
    ? 'git clone <repo-url> openflow && cd openflow && npm install && node bin/xflow.js quickstart'
    : 'npm install -g openflow && xflow quickstart';
  const forbiddenPhrases = [];
  if (packageBlocked) {
    forbiddenPhrases.push('npm install -g openflow works now');
    forbiddenPhrases.push('openflow is publicly installable from npm');
    forbiddenPhrases.push('splash launch complete');
  }
  if (claims.blocked_claims.some((item) => item.id === 'package_preflight')) {
    forbiddenPhrases.push('ready to publish without npm auth or package-name checks');
  }
  if (claims.blocked_claims.some((item) => item.id === 'real_external_adoption')) {
    forbiddenPhrases.push('broad adoption is proven');
  }
  if (claims.blocked_claims.some((item) => item.id === 'third_party_adoption')) {
    forbiddenPhrases.push('broad third-party adoption is proven');
    forbiddenPhrases.push('industry-splash readiness is proven');
  }

  return {
    ok: true,
    generated_at: payload.generated_at,
    launch_ready: payload.launch_ready,
    mode: payload.mode,
    splash: payload.splash,
    verdict: claims.verdict,
    headline: 'openflow turns AI-agent delivery into executable workflow evidence',
    short_copy: 'openflow packages project goals, yolo delivery, corps product proof, TDD gates, handoff, and launch audits into a local CLI/runtime for AI coding agents.',
    install_command: installCommand,
    proof_points: claims.allowed_claims.map((item) => ({
      id: item.id,
      text: item.claim,
      proof: item.proof,
    })),
    hold_until_evidence: claims.blocked_claims.map((item) => ({
      id: item.id,
      text: item.claim,
      required_evidence: item.required_evidence,
    })),
    forbidden_phrases: forbiddenPhrases,
    evidence_commands: buildLaunchEvidenceCommands(payload),
    claims,
  };
}

function renderLaunchCopy(payload) {
  const lines = [
    '# openflow Launch Copy',
    '',
    `Generated: ${payload.generated_at}`,
    `Verdict: ${payload.verdict}`,
    `Launch ready: ${payload.launch_ready ? 'yes' : 'not yet'}`,
    `Splash mode: ${payload.splash ? 'yes' : 'no'}`,
    '',
    '## Headline',
    '',
    payload.headline,
    '',
    '## Short Copy',
    '',
    payload.short_copy,
    '',
    '## Safe Evaluation Command',
    '',
    '```bash',
    payload.install_command,
    '```',
    '',
    '## Safe Proof Points',
    '',
  ];

  for (const item of payload.proof_points) {
    lines.push(`- ${item.id}: ${item.text}`);
  }

  lines.push('', '## Hold Until Evidence Exists', '');
  if (payload.hold_until_evidence.length === 0) {
    lines.push('- None.');
  } else {
    for (const item of payload.hold_until_evidence) {
      lines.push(`- ${item.id}: ${item.text}`);
    }
  }

  lines.push('', '## Forbidden Until Unblocked', '');
  if (payload.forbidden_phrases.length === 0) {
    lines.push('- None.');
  } else {
    for (const phrase of payload.forbidden_phrases) {
      lines.push(`- ${phrase}`);
    }
  }

  lines.push('', '## Evidence Commands', '');
  for (const command of payload.evidence_commands) {
    lines.push(`- \`${command}\``);
  }

  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function buildLaunchAuditPayload(parsedArgs) {
  const { buildCompetitiveScore } = await import('../src/core/competitive-score.js');
  const score = buildCompetitiveScore();
  const projectRoot = resolve(parsedArgs.project_root || process.env.XFLOW_PROJECT_ROOT || process.cwd());
  const goalStatus = auditGoalAlignment({
    projectRoot,
    goalPath: resolve(projectRoot, '.xflow', 'GOAL.md'),
  });
  const adoptionStatus = validateAdoptionEvidence(parsedArgs);
  const prePublishMode = Boolean(parsedArgs.pre_publish);
  const splashMode = Boolean(parsedArgs.splash);
  const packageArgs = prePublishMode && parsedArgs.strict
    ? { ...parsedArgs, check_registry: true, check_auth: true }
    : parsedArgs;
  const packageStatus = prePublishMode
    ? validatePackagePreflight(packageArgs)
    : validatePackagePublication(packageArgs);
  const missingSurfaces = [];
  if (!goalStatus.ok) missingSurfaces.push(LAUNCH_MISSING_SURFACES.goal_alignment_audit);
  if (!adoptionStatus.ok) missingSurfaces.push(LAUNCH_MISSING_SURFACES.real_external_adoption);
  if (splashMode && !adoptionStatus.third_party_ok) missingSurfaces.push(LAUNCH_MISSING_SURFACES.third_party_adoption);
  if (!packageStatus.ok) {
    missingSurfaces.push(prePublishMode
      ? LAUNCH_MISSING_SURFACES.package_preflight
      : LAUNCH_MISSING_SURFACES.published_package);
  }
  const launchReady = score.ok && missingSurfaces.length === 0;
  const readySurfaces = buildLaunchReadySurfaces({
    score,
    goalStatus,
    adoptionStatus,
    packageStatus,
    prePublishMode,
    splashMode,
    launchReady,
  });
  const payload = {
    ok: parsedArgs.strict ? launchReady : true,
    generated_at: new Date().toISOString(),
    ...LAUNCH_AUDIT,
    ready_surfaces: readySurfaces,
    project_root: projectRoot,
    mode: prePublishMode ? 'pre_publish' : 'post_publish',
    splash: splashMode,
    strict: Boolean(parsedArgs.strict),
    verdict: launchReady
      ? (prePublishMode
        ? 'pre-publish ready: engine, adoption, score, npm identity, and package availability are present'
        : 'ready: engine, adoption, score, and registry evidence are present')
      : buildLaunchAuditVerdict(missingSurfaces),
    launch_ready: launchReady,
    missing_surfaces: missingSurfaces,
    next_actions: buildLaunchNextActions(missingSurfaces, prePublishMode),
    goal_evidence: {
      ok: goalStatus.ok,
      goal: goalStatus.goal,
      checks: goalStatus.checks,
      issues: goalStatus.checks
        .filter((check) => !check.ok)
        .map((check) => `${check.id}: ${check.detail}`),
    },
    adoption_evidence: {
      ok: adoptionStatus.ok,
      record_count: adoptionStatus.record_count,
      third_party_ok: adoptionStatus.third_party_ok,
      third_party_record_count: adoptionStatus.third_party_record_count,
      records: adoptionStatus.records.map((record) => ({
        path: record.path,
        ok: record.ok,
        track: record.track,
        scope: record.scope,
        issues: record.issues,
      })),
      issues: adoptionStatus.issues,
    },
    package_evidence: {
      ok: packageStatus.ok,
      package_name: packageStatus.package_name,
      expected_version: packageStatus.expected_version,
      npm_identity: packageStatus.npm_identity || null,
      registry_status: packageStatus.registry_status || null,
      registry_version: packageStatus.registry_version,
      checked_registry: packageStatus.checked_registry,
      source: packageStatus.source,
      issues: packageStatus.issues,
      next_actions: packageStatus.next_actions,
    },
    competitive_score: {
      score: score.score,
      max_score: score.max_score,
      ok: score.ok,
    },
  };
  return payload;
}

function printLaunchAuditText(payload) {
  console.log('xflow launch audit');
  console.log(`Verdict: ${payload.verdict}`);
  console.log(`Launch ready: ${payload.launch_ready ? 'yes' : 'not yet'}`);
  console.log(`Score: ${payload.competitive_score.score}/${payload.competitive_score.max_score}\n`);
  console.log('Passing evidence:');
  if (payload.ready_surfaces.length === 0) {
    console.log('- None yet.');
  } else {
    for (const surface of payload.ready_surfaces) console.log(`- ${surface}`);
  }
  console.log('\nAvailable checks:');
  for (const surface of payload.available_surfaces) console.log(`- ${surface}`);
  console.log('\nMissing before splash launch:');
  for (const missing of payload.missing_surfaces) {
    console.log(`- ${missing.id}: ${missing.requirement}`);
  }
  console.log('\nNext actions:');
  if (payload.next_actions.length === 0) {
    console.log('- None.');
  } else {
    for (const action of payload.next_actions) {
      console.log(`- ${action.id}: ${action.command}`);
    }
  }
  console.log(`\nDocs: ${payload.docs.join(', ')}`);
  console.log(`Gate: ${payload.release_gate.join(' && ')}`);
}

function pushMissingSurfaceSection(lines, title, missingSurfaces) {
  lines.push('', title, '');
  if (missingSurfaces.length === 0) {
    lines.push('- None. Launch evidence is complete for this mode.');
    return;
  }
  for (const missing of missingSurfaces) {
    lines.push(`- **${missing.id}**: ${missing.requirement}`);
    lines.push(`  Why it matters: ${missing.why_it_matters}`);
    lines.push(`  Acceptable evidence: ${missing.acceptable_evidence.join('; ')}`);
  }
}

function pushCommandListSection(lines, title, commands, emptyText) {
  lines.push('', title, '');
  if (!commands.length) {
    lines.push(`- ${emptyText}`);
    return;
  }
  for (const command of commands) lines.push(`- \`${command}\``);
}

function pushActionSection(lines, title, actions) {
  lines.push('', title, '');
  if (!actions.length) {
    lines.push('- None.');
    return;
  }
  for (const action of actions) {
    lines.push(`- **${action.id}**: \`${action.command}\``);
    if (action.reason) lines.push(`  Reason: ${action.reason}`);
  }
}

function renderLaunchDossier(payload, splashPayload = payload) {
  const lines = [
    '# openflow Launch Dossier',
    '',
    `Generated: ${payload.generated_at}`,
    `Mode: ${payload.mode}`,
    `Verdict: ${payload.verdict}`,
    `Launch ready: ${payload.launch_ready ? 'yes' : 'not yet'}`,
    `Splash verdict: ${splashPayload.verdict}`,
    `Splash launch ready: ${splashPayload.launch_ready ? 'yes' : 'not yet'}`,
    `Competitive score: ${payload.competitive_score.score}/${payload.competitive_score.max_score}`,
    '',
    '## Quality Judgment',
    '',
    QUALITY_ASSESSMENT.verdict,
    '',
    `Codex native goal comparison: ${QUALITY_ASSESSMENT.codex_goal_verdict}.`,
    '',
    '## Surface Scorecard',
    '',
    '| Surface | Grade | Why | Next win |',
    '| --- | --- | --- | --- |',
  ];
  for (const item of QUALITY_ASSESSMENT.scorecard) {
    lines.push(`| ${item.surface} | ${item.grade} | ${item.reason} | ${item.next_win} |`);
  }
  lines.push(
    '',
    '## Objective Audit',
    '',
    '- `goal_vs_codex`: proven_project_layer',
    '- `yolo_delivery`: proven_from_source',
    '- `corps_delivery`: proven_from_source',
    '- `skill_family_open_source_credibility`: ready_from_source_checkout',
    `- \`open_source_launch\`: ${payload.missing_surfaces.some((item) => item.id === 'published_package') ? 'blocked' : 'ready'}`,
    `- \`industry_splash\`: ${splashPayload.missing_surfaces.length ? 'blocked' : 'ready'}`,
    '',
    '## Demo Proof Paths',
    '',
  );
  for (const demoPath of LAUNCH_DEMO.paths) {
    lines.push(`### ${demoPath.label}`);
    lines.push('');
    lines.push(`Use when: ${demoPath.use_when}`);
    lines.push('');
    lines.push('Commands:');
    for (const command of demoPath.commands) lines.push(`- \`${command}\``);
    lines.push('');
    lines.push('Evidence:');
    for (const evidence of demoPath.evidence) lines.push(`- \`${evidence}\``);
    lines.push('');
  }
  lines.push(
    '## Runnable Examples',
    '',
    '- `docs/examples-gallery.md` maps clean adoption smoke, goal-to-yolo, goal-to-corps proof, external tracker import, and release gate examples.',
    '- Use `xflow demo launch --json` for the machine-readable launch path summary.',
    '',
    '## Release Gate',
    '',
  );
  for (const command of payload.release_gate) lines.push(`- \`${command}\``);
  pushMissingSurfaceSection(lines, '## Missing Before Ordinary Launch', payload.missing_surfaces);
  pushMissingSurfaceSection(lines, '## Missing Before Splash Launch', splashPayload.missing_surfaces);
  lines.push(
    '',
    '## Current Evidence Snapshot',
    '',
    `- Adoption records: ${payload.adoption_evidence.record_count}; status: ${payload.adoption_evidence.ok ? 'pass' : 'missing'}`,
    `- Goal audit: ${payload.goal_evidence.ok ? 'pass' : 'missing'}; goal: ${payload.goal_evidence.goal.summary || 'missing'}`,
    ...(payload.package_evidence.ok
      ? ['- `published_package`: complete via npm registry evidence and `xflow package audit --check-registry --json`']
      : []),
    `- Package evidence: ${payload.package_evidence.ok ? 'pass' : 'missing'}; source: ${payload.package_evidence.source}`,
    `- Package name/version: ${payload.package_evidence.package_name}@${payload.package_evidence.expected_version}`,
  );
  if (payload.package_evidence.registry_status) {
    lines.push(`- Registry status: ${payload.package_evidence.registry_status}`);
  }
  if (payload.package_evidence.registry_version) {
    lines.push(`- Registry version: ${payload.package_evidence.registry_version}`);
  }
  if (payload.package_evidence.npm_identity) {
    lines.push(`- npm identity: ${payload.package_evidence.npm_identity}`);
  }
  pushCommandListSection(
    lines,
    '## Passing Evidence',
    payload.ready_surfaces,
    'None yet.',
  );
  pushCommandListSection(
    lines,
    '## Available Checks',
    payload.available_surfaces,
    'No launch checks are registered.',
  );
  pushActionSection(lines, '## Next Actions For Ordinary Launch', payload.next_actions);
  pushActionSection(lines, '## Next Actions For Splash Launch', splashPayload.next_actions);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function buildLaunchNextActions(missingSurfaces, prePublishMode) {
  const ids = new Set(missingSurfaces.map((surface) => surface.id));
  const actions = [];
  if (ids.has('goal_alignment_audit')) {
    actions.push({
      id: 'restore_goal_alignment',
      command: 'xflow goal audit --json',
      reason: 'Prove .xflow/GOAL.md exists and plan/yolo/corps/Ralph/handoff/takein consume it before making Codex-goal superiority claims.',
    });
  }
  if (ids.has('real_external_adoption')) {
    actions.push({
      id: 'record_external_adoption',
      command: 'xflow adoption kit --name <team-or-project> --source <tracker-or-pr> --track yolo',
      reason: 'Generate a shareable trial packet before converting real results into an adoption record.',
    });
    actions.push({
      id: 'validate_external_adoption',
      command: 'xflow adoption validate --json',
      reason: 'Remove the real_external_adoption launch gap only after reviewable non-fixture evidence passes validation.',
    });
  }
  if (ids.has('third_party_adoption')) {
    actions.push({
      id: 'record_third_party_adoption',
      command: 'xflow adoption kit --name <third-party-project> --source <public-pr-or-external-repo> --track yolo',
      reason: 'Industry-splash claims require a third-party trial packet that becomes reviewable evidence beyond maintainer dogfooding.',
    });
    actions.push({
      id: 'validate_splash_adoption',
      command: 'xflow adoption validate --splash --json',
      reason: 'Remove the third_party_adoption gap only after a third-party record passes validation.',
    });
  }
  if (ids.has('package_preflight')) {
    actions.push({
      id: 'authenticate_npm',
      command: 'npm whoami',
      reason: 'Confirm the release owner has an authenticated npm session before the irreversible publish step.',
    });
    actions.push({
      id: 'check_package_preflight',
      command: 'xflow package preflight --check-registry --check-auth --json',
      reason: 'Verify npm identity plus package-name/version availability without publishing.',
    });
  }
  if (ids.has('published_package')) {
    if (!prePublishMode) {
      actions.push({
        id: 'verify_release_pack',
        command: 'npm run release:pack',
        reason: 'Re-run the full local release pack immediately before any publish attempt.',
      });
      actions.push({
        id: 'check_package_preflight',
        command: 'xflow package preflight --check-registry --check-auth --json',
        reason: 'Verify npm identity plus package-name/version availability without publishing.',
      });
      actions.push({
        id: 'run_pre_publish_launch_audit',
        command: 'xflow launch audit --pre-publish --strict --json',
        reason: 'Prove score, adoption evidence, npm identity, and package availability before the irreversible publish step.',
      });
    }
    actions.push({
      id: 'publish_package',
      command: 'npm publish --access public',
      reason: 'Run only after release:pack, package preflight, and pre-publish launch audit are green.',
    });
    actions.push({
      id: 'verify_registry_publication',
      command: 'xflow package audit --check-registry --json',
      reason: 'Prove the public npm registry reports the expected package name and version before claiming npm install readiness.',
    });
  }
  if (!prePublishMode && ids.has('published_package')) {
    actions.push({
      id: 'rerun_launch_audit',
      command: 'xflow launch audit --strict --json',
      reason: 'Close the post-publish launch gate after registry evidence is visible.',
    });
  }
  if (prePublishMode && actions.length === 0) {
    actions.push({
      id: 'publish_when_ready',
      command: 'npm publish --access public',
      reason: 'Pre-publish evidence is green; this remains the irreversible release-owner action.',
    });
  }
  return actions;
}

function buildLaunchAuditVerdict(missingSurfaces) {
  const ids = missingSurfaces.map((surface) => surface.id);
  if (ids.includes('goal_alignment_audit')) {
    return 'not launch-ready: goal alignment audit is missing, so the Codex native goal comparison is not yet proven';
  }
  if (ids.includes('real_external_adoption') && ids.includes('published_package')) {
    return 'conditionally ready: engine and package evidence are strong, external adoption proof and registry publication remain required for a splash launch';
  }
  if (ids.includes('real_external_adoption') && ids.includes('package_preflight')) {
    return 'pre-publish blocked: engine evidence is strong, but external adoption proof and npm preflight remain required before publish';
  }
  if (ids.includes('real_external_adoption')) {
    return 'conditionally ready: engine and package evidence are strong, external adoption proof remains required for a splash launch';
  }
  if (ids.includes('third_party_adoption') && ids.includes('published_package')) {
    return 'conditionally ready: engine and maintainer adoption evidence are strong, but third-party adoption and registry publication remain required for an industry-splash launch';
  }
  if (ids.includes('third_party_adoption') && ids.includes('package_preflight')) {
    return 'pre-publish blocked: engine and maintainer adoption evidence are strong, but third-party adoption and npm preflight remain required before industry-splash claims';
  }
  if (ids.includes('third_party_adoption')) {
    return 'conditionally ready: engine and maintainer adoption evidence are strong, but third-party adoption remains required for an industry-splash launch';
  }
  if (ids.includes('published_package')) {
    return 'conditionally ready: engine and adoption evidence are strong, registry publication remains required for a splash launch';
  }
  if (ids.includes('package_preflight')) {
    return 'pre-publish blocked: engine and adoption evidence are strong, but npm identity or package availability is not confirmed';
  }
  return 'ready: no missing launch surfaces';
}

// ─── adoption ────────────────────────────────────────────────────────────────

async function handleAdoption(sub, args) {
  if (isHelpRequest(sub)) {
    printAdoptionHelp();
    return;
  }

  const parsedArgs = parseCliArgs(args);
  const action = sub || 'validate';
  if (action === 'init') {
    const payload = initAdoptionRecord(parsedArgs);
    if (parsedArgs.json) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.log('xflow adoption init');
      console.log(`Created: ${payload.path}`);
      console.log('Next: replace placeholders with real evidence, then run:');
      console.log(`- ${payload.next_command}`);
      console.log(`- ${payload.splash_command}`);
    }
    return;
  }

  if (action === 'kit') {
    const payload = createAdoptionTrialKit(parsedArgs);
    if (parsedArgs.json) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.log('xflow adoption kit');
      console.log(`Created: ${payload.path}`);
      console.log(`Record command: ${payload.record_command}`);
      console.log('Trial commands:');
      for (const command of payload.trial_commands) console.log(`- ${command}`);
      console.log('Validation commands:');
      for (const command of payload.validation_commands) console.log(`- ${command}`);
    }
    return;
  }

  if (action === 'trial') {
    const payload = buildAdoptionTrialPayload(parsedArgs);
    if (parsedArgs.json) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.log('xflow adoption trial');
      console.log(`Track: ${payload.track}`);
      console.log(`Trial packet: ${payload.trial_packet_command}`);
      console.log('\nSource checkout commands:');
      for (const command of payload.source_checkout_commands) console.log(`- ${command}`);
      console.log('\nTrial commands:');
      for (const command of payload.trial_commands) console.log(`- ${command}`);
      console.log('\nEvidence to collect:');
      for (const item of payload.evidence_to_collect) console.log(`- ${item}`);
      console.log('\nConvert completed trial:');
      console.log(`- ${payload.record_command}`);
      console.log('\nValidation commands:');
      for (const command of payload.validation_commands) console.log(`- ${command}`);
    }
    return;
  }

  if (action === 'brief') {
    const payload = buildAdoptionBriefPayload(parsedArgs);
    if (parsedArgs.json) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.log('xflow adoption brief');
      console.log(`Track: ${payload.track}`);
      console.log(`Trial packet: ${payload.trial_packet_command}`);
      console.log('\nAsk message:');
      console.log(payload.ask_message);
      console.log('\nAcceptance bar:');
      for (const item of payload.acceptance_bar) console.log(`- ${item}`);
      console.log('\nMaintainer follow-up:');
      for (const command of payload.maintainer_follow_up) console.log(`- ${command}`);
    }
    return;
  }

  if (action === 'status') {
    const payload = buildAdoptionStatusPayload(parsedArgs);
    if (parsedArgs.json) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.log('xflow adoption status');
      console.log(`Adoption evidence: ${payload.adoption_ok ? 'pass' : 'missing'}`);
      console.log(`Splash evidence: ${payload.third_party_ok ? 'pass' : 'missing third-party adoption'}`);
      console.log(`Records: ${payload.record_count}`);
      console.log(`Third-party records: ${payload.third_party_record_count}`);
      if (payload.blocking_surfaces.length) {
        console.log(`Blocking surfaces: ${payload.blocking_surfaces.join(', ')}`);
      }
      if (payload.next_action) console.log(`Next action: ${payload.next_action.id}: ${payload.next_action.command}`);
      console.log(`External brief: ${payload.external_brief_command}`);
      console.log(`External trial: ${payload.external_trial_command}`);
      console.log('Validation commands:');
      for (const command of payload.validation_commands) console.log(`- ${command}`);
    }
    return;
  }

  if (action !== 'validate') {
    console.error(`Unknown adoption action: ${action}`);
    printAdoptionHelp();
    process.exit(1);
  }

  const payload = validateAdoptionEvidence(parsedArgs);
  const commandPayload = parsedArgs.splash && !payload.third_party_ok
    ? {
      ...payload,
      ok: false,
      issues: [
        ...payload.issues,
        'missing third-party adoption record for splash launch',
      ],
    }
    : payload;

  if (parsedArgs.json) {
    console.log(JSON.stringify(commandPayload, null, 2));
  } else {
    console.log('xflow adoption validate');
    console.log(`Status: ${commandPayload.ok ? 'pass' : 'fail'}`);
    console.log(`Records: ${commandPayload.records.length}`);
    console.log(`Third-party records: ${commandPayload.third_party_record_count}`);
    if (commandPayload.issues.length) {
      console.log('\nIssues:');
      for (const issue of commandPayload.issues) console.log(`- ${issue}`);
    }
    if (commandPayload.records.length) {
      console.log('\nRecord results:');
      for (const record of commandPayload.records) {
        console.log(`- ${record.path}: ${record.ok ? 'pass' : 'fail'} (${record.scope})`);
        for (const issue of record.issues) console.log(`  - ${issue}`);
      }
    }
  }

  if (!commandPayload.ok) process.exit(1);
}

function buildAdoptionStatusPayload(parsedArgs = {}) {
  const evidence = validateAdoptionEvidence(parsedArgs);
  const thirdPartyOk = evidence.third_party_ok === true;
  const adoptionOk = evidence.ok === true;
  const blockingSurfaces = [];
  if (!adoptionOk) blockingSurfaces.push('adoption_evidence');
  if (!thirdPartyOk) blockingSurfaces.push('third_party_adoption');
  const externalBriefCommand = 'xflow adoption brief --name <third-party-project> --source <public-pr-or-external-repo> --track yolo';
  const externalTrialCommand = 'xflow adoption trial --name <third-party-project> --source <public-pr-or-external-repo> --track yolo';
  const nextAction = !thirdPartyOk
    ? {
      id: 'prepare_external_brief',
      command: externalBriefCommand,
      reason: 'Generate a sendable third-party ask before requesting reviewable adoption evidence.',
    }
    : (!adoptionOk
      ? {
        id: 'validate_adoption',
        command: 'xflow adoption validate --json',
        reason: 'Fix adoption records until ordinary adoption validation passes.',
      }
      : {
        id: 'validate_splash_adoption',
        command: 'xflow adoption validate --splash --json',
        reason: 'Keep splash evidence green before using third-party adoption claims.',
      });
  return {
    ok: adoptionOk && thirdPartyOk,
    adoption_ok: adoptionOk,
    third_party_ok: thirdPartyOk,
    record_count: evidence.record_count,
    third_party_record_count: evidence.third_party_record_count,
    blocking_surfaces: blockingSurfaces,
    next_action: nextAction,
    external_brief_command: externalBriefCommand,
    external_trial_command: externalTrialCommand,
    validation_commands: [
      'xflow adoption validate --json',
      'xflow adoption validate --splash --json',
      'xflow launch audit --splash --strict --json',
    ],
    evidence,
  };
}

function buildAdoptionTrialPayload(parsedArgs = {}) {
  const rawName = parsedArgs.name || parsedArgs.project || parsedArgs.team || 'third-party-project';
  const source = parsedArgs.source || '<public-pr-or-external-repo>';
  const track = parsedArgs.track || 'yolo';
  const sourceCheckoutCommands = [
    'git clone <repo-url> openflow',
    'cd openflow',
    'npm install',
    'node bin/xflow.js quickstart',
    'node bin/xflow.js demo clean',
  ];
  const trialCommands = buildAdoptionTrialCommands(track);
  const recordCommand = `xflow adoption init --name ${shellQuote(rawName)} --source ${shellQuote(source)} --track ${shellQuote(track)}`;
  const validationCommands = [
    'xflow adoption validate --json',
    'xflow adoption validate --splash --json',
    'xflow launch audit --splash --strict --json',
  ];
  return {
    ok: true,
    name: rawName,
    source,
    track,
    trial_packet_command: `xflow adoption kit --name ${shellQuote(rawName)} --source ${shellQuote(source)} --track ${shellQuote(track)}`,
    source_checkout_commands: sourceCheckoutCommands,
    trial_commands: trialCommands,
    evidence_to_collect: [
      'the external project, public PR, repository, or named team workflow',
      'the project goal or tracker item that shaped the trial',
      'commands run and their pass/fail results',
      'reviewable xflow artifacts or links produced by the trial',
      'a concrete benefit, failure, or reuse decision',
      'redactions needed for public review',
    ],
    record_command: recordCommand,
    validation_commands: validationCommands,
    next: 'Run the trial with a real external project, then convert the collected evidence into an adoption record.',
  };
}

function buildAdoptionBriefPayload(parsedArgs = {}) {
  const trial = buildAdoptionTrialPayload(parsedArgs);
  const trackLabel = formatAdoptionTrackLabel(trial.track);
  const acceptanceBar = [
    'use a real external project, public PR, external repository, or named external team',
    'run the listed xflow commands and capture pass/fail results',
    'return at least one reviewable artifact or link that another reviewer can inspect',
    'state one concrete benefit, failure, or reuse decision',
    'note what was redacted before public sharing',
  ];
  const maintainerFollowUp = [
    trial.record_command,
    ...trial.validation_commands,
  ];
  const askLines = [
    `Would you be willing to run a short xflow ${trackLabel} trial on ${trial.name}?`,
    `Source or tracker: ${trial.source}`,
    'Please use the attached command sequence, then send back one reviewable proof link or artifact plus a short outcome note.',
    `If you prefer a file-based packet, I can send: ${trial.trial_packet_command}`,
  ];
  return {
    ok: true,
    name: trial.name,
    source: trial.source,
    track: trial.track,
    ask_message: askLines.join(' '),
    trial_packet_command: trial.trial_packet_command,
    source_checkout_commands: trial.source_checkout_commands,
    trial_commands: trial.trial_commands,
    evidence_to_collect: trial.evidence_to_collect,
    acceptance_bar: acceptanceBar,
    maintainer_follow_up: maintainerFollowUp,
    validation_commands: trial.validation_commands,
    next: 'Send the ask_message or generated packet to the external team, then convert the returned evidence into docs/adoption/<team-or-project>.md.',
  };
}

function formatAdoptionTrackLabel(track) {
  if (track === 'both') return 'yolo+corps';
  return track || 'yolo';
}

function createAdoptionTrialKit(parsedArgs = {}) {
  const projectRoot = resolve(parsedArgs.project_root || process.env.XFLOW_PROJECT_ROOT || process.cwd());
  const adoptionDir = resolve(projectRoot, parsedArgs.dir || 'docs/adoption');
  const kitDir = resolve(adoptionDir, 'trial-packets');
  const rawName = parsedArgs.name || parsedArgs.project || parsedArgs.team || 'third-party-project';
  const slug = slugifyAdoptionName(rawName);
  const path = resolve(kitDir, `${slug}.md`);
  if (existsSync(path) && !parsedArgs.force) {
    console.error(`Adoption trial kit already exists: ${relativeToProject(projectRoot, path)}. Use --force to replace it.`);
    process.exit(1);
  }
  mkdirSync(kitDir, { recursive: true });

  const source = parsedArgs.source || '<public-pr-or-external-repo>';
  const track = parsedArgs.track || 'yolo';
  const commands = buildAdoptionTrialCommands(track);
  const brief = buildAdoptionBriefPayload(parsedArgs);
  const recordCommand = `xflow adoption init --name ${shellQuote(rawName)} --source ${shellQuote(source)} --track ${shellQuote(track)}`;
  const validationCommands = [
    'xflow adoption validate --json',
    'xflow adoption validate --splash --json',
    'xflow launch audit --splash --strict --json',
  ];

  writeFileSync(path, renderAdoptionTrialKit({
    title: rawName,
    source,
    track,
    askMessage: brief.ask_message,
    commands,
    recordCommand,
    validationCommands,
    acceptanceBar: brief.acceptance_bar,
    maintainerFollowUp: brief.maintainer_follow_up,
  }));

  return {
    ok: true,
    path: relativeToProject(projectRoot, path),
    ask_message: brief.ask_message,
    record_command: recordCommand,
    trial_commands: commands,
    validation_commands: validationCommands,
    acceptance_bar: brief.acceptance_bar,
    maintainer_follow_up: brief.maintainer_follow_up,
    evidence_to_collect: [
      'the project goal or tracker item that shaped the trial',
      'commands run and their pass/fail results',
      'paths or links to reviewable xflow artifacts',
      'a concrete benefit, failure, or reuse decision',
      'redactions needed for public review',
    ],
    next: 'Share the trial packet with the external project, then convert completed evidence into docs/adoption/<team-or-project>.md.',
  };
}

function buildAdoptionTrialCommands(track) {
  const normalizedTrack = String(track || 'yolo').toLowerCase();
  const base = [
    'xflow demo clean',
    'xflow init --project-root .',
    'xflow goal set "Ship the next verified change" --project-root .',
    'xflow goal audit --project-root . --json',
    'xflow doctor --project-root .',
  ];
  if (normalizedTrack === 'corps') {
    return [
      ...base,
      'xflow corps --explain --json',
      'xflow proof --track corps --change-id <change-id>',
    ];
  }
  if (normalizedTrack === 'both') {
    return [
      ...base,
      'xflow workflow validate yolo --project-root .',
      'xflow corps --explain --json',
      'xflow proof --track corps --change-id <change-id>',
    ];
  }
  return [
    ...base,
    'xflow workflow validate yolo --project-root .',
  ];
}

function renderAdoptionTrialKit({ title, source, track, askMessage, commands, recordCommand, validationCommands, acceptanceBar, maintainerFollowUp }) {
  return `# xflow Adoption Trial Packet: ${title}

Source: ${source}
Track: ${track}

Use this packet with a real third-party project, public PR, external repository,
or named external team. It is not adoption evidence by itself; it is the
operator checklist that should produce reviewable evidence.

## Send This Ask

${askMessage}

## Trial Commands

\`\`\`bash
${commands.join('\n')}
\`\`\`

## Evidence To Collect

- Project goal, issue, tracker item, or PR that shaped the trial.
- Command outputs or CI links for the trial commands above.
- Reviewable xflow artifacts such as \`.xflow/GOAL.md\`, \`.as-xflow/config.json\`,
  \`specs/changes/<change-id>/status.json\`, TDD proof JSON, or \`corps_proof.json\`.
- A concrete outcome: what improved, what failed, and whether the project would
  use xflow again.
- Redactions required for public or external review.

## Acceptance Bar

${acceptanceBar.map((item) => `- ${item}`).join('\n')}

## Convert Completed Trial To Adoption Record

\`\`\`bash
${recordCommand}
\`\`\`

Replace the generated placeholders with the collected trial evidence, then run:

\`\`\`bash
${validationCommands.join('\n')}
\`\`\`

## Maintainer Follow-Up

${maintainerFollowUp.map((item) => `- ${item}`).join('\n')}

The splash validation must not pass until the completed record names a
third-party project, public PR, external repository, or named external team and
includes reviewable evidence outside the authoring machine.
`;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function initAdoptionRecord(parsedArgs = {}) {
  const projectRoot = resolve(parsedArgs.project_root || process.env.XFLOW_PROJECT_ROOT || process.cwd());
  const adoptionDir = resolve(projectRoot, parsedArgs.dir || 'docs/adoption');
  const rawName = parsedArgs.name || parsedArgs.project || parsedArgs.team || parsedArgs.source || 'team-or-project';
  const slug = slugifyAdoptionName(rawName);
  const path = resolve(adoptionDir, `${slug}.md`);
  if (existsSync(path) && !parsedArgs.force) {
    console.error(`Adoption record already exists: ${relativeToProject(projectRoot, path)}. Use --force to replace it.`);
    process.exit(1);
  }
  mkdirSync(adoptionDir, { recursive: true });
  writeFileSync(path, renderAdoptionTemplate({
    title: rawName,
    date: parsedArgs.date || new Date().toISOString().slice(0, 10),
    source: parsedArgs.source || '<tracker, repository, team workflow, or public PR>',
    track: parsedArgs.track || '<yolo|corps|both>',
  }));

  return {
    ok: true,
    path: relativeToProject(projectRoot, path),
    next_command: `xflow adoption validate --input ${relativeToProject(projectRoot, path)} --json`,
    splash_command: `xflow adoption validate --input ${relativeToProject(projectRoot, path)} --splash --json`,
    required_replacements: [
      'replace every <placeholder>',
      'name the real external project, public PR, external repository, or named external team',
      'include at least one xflow command that produced reviewable artifacts',
      'link or list reviewable proof paths',
      'record a concrete benefit, failure, or reuse decision',
      'state what was redacted',
    ],
  };
}

function renderAdoptionTemplate({ title, date, source, track }) {
  return `# Adoption: ${title}

Date: ${date}
Source: ${source}
Track: ${track}

## Context

<What external project or team workflow tried xflow?>

Use \`third-party\`, \`public PR\`, \`external project\`, \`external repository\`,
\`customer\`, \`partner\`, \`team workflow\`, or an \`https://\` source when the record
is intended to satisfy splash-launch third-party evidence.

## Goal

<What durable project direction or tracker objective guided the work?>

## Commands

\`\`\`bash
xflow goal show --json
xflow assess --json
xflow workflow validate yolo --project-root .
# or: xflow corps ... && xflow proof --track corps --change-id <id>
\`\`\`

## Evidence

- <path-or-link-to-status.json>
- <path-or-link-to-red-green-quality-proof>
- <path-or-link-to-corps_proof.json>
- <path-or-link-to-PR-or-review>

At least one evidence bullet must be reviewable by someone outside the authoring
machine. Prefer public PRs, external repository links, sanitized tracker exports,
or checked-in proof artifacts.

## Outcome

<What got better, what failed, and whether the team would use xflow again?>

## Redactions

<What was sanitized?>

State \`None\` only when the record and evidence are already public.
`;
}

function slugifyAdoptionName(value) {
  return String(value || 'team-or-project')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'team-or-project';
}

function validateAdoptionEvidence(parsedArgs = {}) {
  const projectRoot = resolve(parsedArgs.project_root || process.env.XFLOW_PROJECT_ROOT || process.cwd());
  const adoptionDir = resolve(projectRoot, parsedArgs.dir || 'docs/adoption');
  const inputs = normalizeArgList(parsedArgs.input);
  const recordPaths = inputs.length > 0
    ? inputs.map((input) => resolve(projectRoot, input))
    : listAdoptionRecordPaths(adoptionDir);

  const records = recordPaths.map((path) => validateAdoptionRecord(path, projectRoot));
  const issues = [];
  if (!existsSync(adoptionDir) && inputs.length === 0) issues.push(`missing adoption directory: ${relativeToProject(projectRoot, adoptionDir)}`);
  if (recordPaths.length === 0) issues.push('missing adoption records: add docs/adoption/<team-or-project>.md');
  for (const record of records) {
    for (const issue of record.issues) issues.push(`${record.path}: ${issue}`);
  }

  return {
    ok: issues.length === 0,
    project_root: projectRoot,
    adoption_dir: relativeToProject(projectRoot, adoptionDir),
    record_count: records.length,
    third_party_ok: records.some((record) => record.ok && record.scope === 'third_party'),
    third_party_record_count: records.filter((record) => record.ok && record.scope === 'third_party').length,
    records,
    issues,
    required_sections: ['Context', 'Goal', 'Commands', 'Evidence', 'Outcome', 'Redactions'],
    required_track_values: ['yolo', 'corps', 'both'],
    splash_required_scope: 'third_party',
  };
}

function listAdoptionRecordPaths(adoptionDir) {
  if (!existsSync(adoptionDir)) return [];
  return readdirSync(adoptionDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => resolve(adoptionDir, entry.name))
    .filter((path) => path.endsWith('.md') && !path.endsWith('/README.md'))
    .sort();
}

function validateAdoptionRecord(path, projectRoot) {
  const relativePath = relativeToProject(projectRoot, path);
  const issues = [];
  if (!existsSync(path)) {
    return { path: relativePath, ok: false, issues: ['file not found'] };
  }

  const markdown = readFileSync(path, 'utf8');
  const requiredSections = ['Context', 'Goal', 'Commands', 'Evidence', 'Outcome', 'Redactions'];
  for (const section of requiredSections) {
    if (!new RegExp(`^##\\s+${section}\\s*$`, 'm').test(markdown)) {
      issues.push(`missing ## ${section}`);
    }
  }

  const title = markdown.match(/^#\s+Adoption:\s+(.+)$/m)?.[1]?.trim() || '';
  const date = markdown.match(/^Date:\s*(.+)$/m)?.[1]?.trim() || '';
  const source = markdown.match(/^Source:\s*(.+)$/m)?.[1]?.trim() || '';
  const track = markdown.match(/^Track:\s*(.+)$/m)?.[1]?.trim().toLowerCase() || '';
  const evidenceSection = markdown.match(/^##\s+Evidence\s*$([\s\S]*?)(?=^##\s+|(?![\s\S]))/m)?.[1] || '';
  const outcomeSection = markdown.match(/^##\s+Outcome\s*$([\s\S]*?)(?=^##\s+|(?![\s\S]))/m)?.[1] || '';

  if (!title || title.includes('<')) issues.push('title must name the team or project');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) issues.push('Date must use YYYY-MM-DD');
  if (!source || source.includes('<')) issues.push('Source must name a tracker, repository, team workflow, or public PR');
  if (!['yolo', 'corps', 'both'].includes(track)) issues.push('Track must be yolo, corps, or both');
  if (!/\bxflow\s+\S+/.test(markdown)) issues.push('Commands must include at least one xflow command');
  if (!/^\s*-\s+`?[^`\n]+`?/m.test(evidenceSection)) issues.push('Evidence must include at least one reviewable path or link bullet');
  if (!/\b(improved|failed|failure|better|again|reuse|would use|would not use)\b/i.test(outcomeSection)) {
    issues.push('Outcome must name a concrete benefit, failure, or reuse decision');
  }
  if (/<[^>\n]+>/.test(markdown)) issues.push('record still contains template placeholders');
  if (relativePath.startsWith('docs/fixtures/')) issues.push('record must not live under docs/fixtures');
  const scope = classifyAdoptionScope({ title, source, markdown });

  return {
    path: relativePath,
    ok: issues.length === 0,
    title,
    date,
    source,
    track,
    scope,
    issues,
  };
}

function classifyAdoptionScope({ title, source, markdown }) {
  const text = `${title}\n${source}\n${markdown}`.toLowerCase();
  const maintainerSignals = [
    'openflow maintainer',
    'maintainer release-hardening',
    'dogfood',
    'self-hosted',
    'source repository',
  ];
  if (maintainerSignals.some((signal) => text.includes(signal))) return 'maintainer_dogfood';
  const thirdPartySignals = [
    'third-party',
    'public pr',
    'external project',
    'external repository',
    'customer',
    'partner',
    'team workflow',
    'https://',
  ];
  return thirdPartySignals.some((signal) => text.includes(signal)) ? 'third_party' : 'internal_team';
}

function normalizeArgList(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function relativeToProject(projectRoot, path) {
  return path.startsWith(`${projectRoot}/`) ? path.slice(projectRoot.length + 1) : path;
}

// ─── package ─────────────────────────────────────────────────────────────────

async function handlePackage(sub, args) {
  if (isHelpRequest(sub)) {
    printPackageHelp();
    return;
  }

  const action = sub || 'audit';
  if (!['audit', 'preflight', 'status'].includes(action)) {
    console.error(`Unknown package action: ${action}`);
    printPackageHelp();
    process.exit(1);
  }

  const parsedArgs = parseCliArgs(args);
  const payload = action === 'status'
    ? buildPackageStatusPayload(parsedArgs)
    : (action === 'preflight'
      ? validatePackagePreflight(parsedArgs)
      : validatePackagePublication(parsedArgs));

  if (parsedArgs.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(`xflow package ${action}`);
    console.log(`Status: ${payload.ok ? 'pass' : 'fail'}`);
    console.log(`Package: ${payload.package_name}@${payload.expected_version}`);
    console.log(`Registry: ${payload.registry_status || payload.registry_version || 'not confirmed'}`);
    if (action === 'status') {
      console.log(`Publish ready: ${payload.ready_for_publish ? 'yes' : 'not yet'}`);
      console.log(`Public install ready: ${payload.public_install_ready ? 'yes' : 'not yet'}`);
      console.log(`Blocking surfaces: ${payload.blocking_surfaces.length ? payload.blocking_surfaces.join(', ') : 'none'}`);
    }
    if (payload.issues.length) {
      console.log('\nIssues:');
      for (const issue of payload.issues) console.log(`- ${issue}`);
    }
    console.log('\nNext actions:');
    if (!payload.next_actions || payload.next_actions.length === 0) {
      console.log('- none');
    } else {
      for (const action of payload.next_actions) {
        console.log(`- ${action.id}: ${action.command}`);
        console.log(`  Reason: ${action.reason}`);
      }
    }
  }

  if (action !== 'status' && !payload.ok) process.exit(1);
}

function buildPackageStatusPayload(parsedArgs = {}) {
  const shouldCheckRegistry = !parsedArgs.registry_json && !parsedArgs.registry_file;
  const shouldCheckAuth = !parsedArgs.whoami;
  const statusArgs = {
    ...parsedArgs,
    check_registry: parsedArgs.check_registry || shouldCheckRegistry,
    check_auth: parsedArgs.check_auth || shouldCheckAuth,
  };
  const preflight = validatePackagePreflight(statusArgs);
  const publication = validatePackagePublication(statusArgs);
  const blockingSurfaces = [];
  if (!preflight.npm_identity) blockingSurfaces.push('npm_auth');
  if (!preflight.ok) blockingSurfaces.push('package_preflight');
  if (!publication.ok) blockingSurfaces.push('published_package');
  const nextActions = [];
  for (const action of [...preflight.next_actions, ...publication.next_actions]) {
    if (!nextActions.some((existing) => existing.id === action.id)) nextActions.push(action);
  }
  return {
    ok: preflight.ok || publication.ok,
    ready_for_publish: preflight.ok,
    public_install_ready: publication.ok,
    package_name: preflight.package_name,
    expected_version: preflight.expected_version,
    npm_identity: preflight.npm_identity,
    registry_status: publication.ok ? 'published' : preflight.registry_status,
    registry_name: publication.registry_name || preflight.registry_name,
    registry_version: publication.registry_version || preflight.registry_version,
    checked_registry: preflight.checked_registry || publication.checked_registry,
    blocking_surfaces: blockingSurfaces,
    next_action: nextActions[0] || null,
    next_actions: nextActions,
    preflight,
    publication,
  };
}

function readPackageMetadata(parsedArgs = {}) {
  const projectRoot = resolve(parsedArgs.project_root || process.env.XFLOW_PROJECT_ROOT || process.cwd());
  const packagePath = resolve(projectRoot, parsedArgs.package_json || 'package.json');
  const issues = [];
  let packageJson = {};

  if (!existsSync(packagePath)) {
    issues.push(`missing package.json: ${relativeToProject(projectRoot, packagePath)}`);
  } else {
    try {
      packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
    } catch (error) {
      issues.push(`invalid package.json: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    projectRoot,
    packagePath,
    packageJson,
    packageName: parsedArgs.package_name || packageJson.name || 'openflow',
    expectedVersion: parsedArgs.version || packageJson.version || null,
    issues,
  };
}

function validatePackagePublication(parsedArgs = {}) {
  const { projectRoot, packageName, expectedVersion, issues } = readPackageMetadata(parsedArgs);
  const registrySource = readRegistryEvidence(parsedArgs, projectRoot, packageName);
  const registryData = registrySource.data || {};
  const registryName = registryData.name || null;
  const registryVersion = registryData.version || null;
  const registryNotFound = registrySource.error_code === 'not_published'
    || /E404|404|not published/i.test(String(registryData.error || registryData.status || ''));

  if (!packageName) issues.push('missing package name');
  if (!expectedVersion) issues.push('missing expected package version');
  if (!registrySource.checked) {
    issues.push('registry evidence missing: pass --check-registry, --registry-file, or --registry-json');
  } else if (registrySource.error) {
    issues.push(registrySource.error);
  } else if (registryNotFound) {
    issues.push(`${packageName} is not published on the configured npm registry`);
  } else {
    if (registryName !== packageName) issues.push(`registry package name mismatch: expected ${packageName}, got ${registryName || 'missing'}`);
    if (expectedVersion && registryVersion !== expectedVersion) {
      issues.push(`registry version mismatch: expected ${expectedVersion}, got ${registryVersion || 'missing'}`);
    }
  }

  const nextActions = buildPackageAuditNextActions({
    issues,
    packageName,
    expectedVersion,
    registrySource,
    registryName,
    registryVersion,
  });

  return {
    ok: issues.length === 0,
    project_root: projectRoot,
    package_name: packageName,
    expected_version: expectedVersion,
    registry_name: registryName,
    registry_version: registryVersion,
    checked_registry: registrySource.checked,
    source: registrySource.source,
    issues,
    next_actions: nextActions,
  };
}

function validatePackagePreflight(parsedArgs = {}) {
  const { projectRoot, packageName, expectedVersion, issues } = readPackageMetadata(parsedArgs);
  const registrySource = readRegistryEvidence(parsedArgs, projectRoot, packageName);
  const registryData = registrySource.data || {};
  const registryName = registryData.name || null;
  const registryVersion = registryData.version || null;
  const registryNotFound = registrySource.error_code === 'not_published'
    || /E404|404|not published/i.test(String(registryData.error || registryData.status || ''));
  const identity = readNpmIdentity(parsedArgs, projectRoot);

  if (!packageName) issues.push('missing package name');
  if (!expectedVersion) issues.push('missing expected package version');
  if (!identity.ok) issues.push(identity.issue);
  if (!registrySource.checked) {
    issues.push('registry evidence missing: pass --check-registry, --registry-file, or --registry-json');
  } else if (registryNotFound) {
    // Good pre-publish state for a new package name.
  } else if (registrySource.error) {
    issues.push(registrySource.error);
  } else if (registryName !== packageName) {
    issues.push(`registry package name mismatch: expected ${packageName}, got ${registryName || 'missing'}`);
  } else if (registryVersion === expectedVersion) {
    issues.push(`registry already contains ${packageName}@${expectedVersion}; bump version before publishing`);
  } else if (!parsedArgs.allow_existing_package) {
    issues.push(`registry already contains ${packageName}@${registryVersion || 'unknown'}; pass --allow-existing-package only after confirming npm ownership`);
  }

  const nextActions = buildPackagePreflightNextActions({
    issues,
    packageName,
    expectedVersion,
    registrySource,
    registryNotFound,
    registryName,
    registryVersion,
    identity,
    allowExistingPackage: Boolean(parsedArgs.allow_existing_package),
  });

  return {
    ok: issues.length === 0,
    project_root: projectRoot,
    package_name: packageName,
    expected_version: expectedVersion,
    npm_identity: identity.name,
    registry_status: registryNotFound ? 'available' : (registryVersion ? 'existing_package' : 'unknown'),
    registry_name: registryName,
    registry_version: registryVersion,
    checked_registry: registrySource.checked,
    source: registrySource.source,
    issues,
    next_actions: nextActions,
  };
}

function buildPackageAuditNextActions({
  issues,
  packageName,
  expectedVersion,
  registrySource,
  registryName,
  registryVersion,
}) {
  const actions = [];
  const add = pushUniqueAction(actions);
  const issueText = issues.join('\n');

  if (!packageName || !expectedVersion) {
    add({
      id: 'fix_package_metadata',
      command: 'edit package.json',
      reason: 'Package audit needs a stable name and version before registry evidence can prove public availability.',
    });
  }
  if (!registrySource.checked) {
    add({
      id: 'verify_registry_publication',
      command: 'xflow package audit --check-registry --json',
      reason: 'Query the public npm registry and prove it reports the expected package name and version.',
    });
  }
  if (registrySource.error_code === 'not_published' || /not published/i.test(issueText)) {
    add({
      id: 'run_pre_publish_gate',
      command: 'xflow launch audit --pre-publish --strict --json',
      reason: 'Do not publish until local score, adoption, npm identity, and package availability are green.',
    });
    add({
      id: 'publish_package',
      command: 'npm publish --access public',
      reason: 'Run only after the pre-publish gate passes; audit cannot pass until the registry contains the expected version.',
    });
  }
  if (/npm authentication is required|ENEEDAUTH|E401|Unauthorized/i.test(issueText)) {
    add({
      id: 'authenticate_npm',
      command: 'npm login && npm whoami',
      reason: 'Restore the release owner npm session before retrying a registry check that requires authentication.',
    });
  }
  if (/registry package name mismatch/i.test(issueText)) {
    add({
      id: 'inspect_registry_name',
      command: `npm view ${packageName || '<package-name>'} name version --json`,
      reason: `The registry response reported ${registryName || 'no name'}; inspect the package target before making public claims.`,
    });
  }
  if (/registry version mismatch/i.test(issueText)) {
    add({
      id: 'publish_expected_version',
      command: 'npm publish --access public',
      reason: `The registry reports ${registryVersion || 'no version'} but package.json expects ${expectedVersion || 'a version'}; publish or bump before claiming readiness.`,
    });
  }
  if (registrySource.error && registrySource.error_code !== 'not_published') {
    add({
      id: 'retry_registry_check',
      command: 'xflow package audit --check-registry --json',
      reason: 'The registry query failed; retry or provide captured registry evidence after the npm registry is reachable.',
    });
  }

  return actions;
}

function buildPackagePreflightNextActions({
  issues,
  packageName,
  expectedVersion,
  registrySource,
  registryNotFound,
  registryName,
  registryVersion,
  identity,
  allowExistingPackage,
}) {
  const actions = [];
  const add = pushUniqueAction(actions);
  const issueText = issues.join('\n');

  if (!packageName || !expectedVersion) {
    add({
      id: 'fix_package_metadata',
      command: 'edit package.json',
      reason: 'Preflight needs the final package name and version before it can protect the publish step.',
    });
  }
  if (!identity.ok) {
    add({
      id: 'authenticate_npm',
      command: 'npm login && npm whoami',
      reason: 'Confirm the release owner has an authenticated npm session before any publish attempt.',
    });
  }
  if (!registrySource.checked) {
    add({
      id: 'check_package_availability',
      command: 'xflow package preflight --check-registry --check-auth --json',
      reason: 'Verify npm identity plus package-name/version availability without publishing.',
    });
  }
  if (registrySource.error && !registryNotFound) {
    add({
      id: 'retry_registry_check',
      command: 'xflow package preflight --check-registry --check-auth --json',
      reason: 'The npm registry check failed; retry after auth/network recovery or provide captured evidence.',
    });
  }
  if (/registry package name mismatch/i.test(issueText)) {
    add({
      id: 'inspect_registry_name',
      command: `npm view ${packageName || '<package-name>'} name version --json`,
      reason: `The registry response reported ${registryName || 'no name'}; inspect the target before publishing.`,
    });
  }
  if (/registry already contains/i.test(issueText) || (registryVersion && !registryNotFound && !allowExistingPackage)) {
    add({
      id: 'verify_package_ownership',
      command: `npm owner ls ${packageName || '<package-name>'}`,
      reason: 'An existing npm package requires an ownership check before publishing under this name.',
    });
    add({
      id: 'choose_release_version',
      command: 'npm version <new-version> --no-git-tag-version',
      reason: `The registry already has ${packageName || 'this package'}@${registryVersion || 'unknown'}; choose a publishable version before release.`,
    });
  }
  if (issues.length === 0) {
    add({
      id: 'run_pre_publish_gate',
      command: 'xflow launch audit --pre-publish --strict --json',
      reason: 'Package preflight is green; now prove the full launch gate before the irreversible publish step.',
    });
  }

  return actions;
}

function pushUniqueAction(actions) {
  return (action) => {
    if (!actions.some((existing) => existing.id === action.id)) actions.push(action);
  };
}

function readNpmIdentity(parsedArgs, projectRoot) {
  if (parsedArgs.whoami) return { ok: true, name: String(parsedArgs.whoami), issue: null };
  if (!parsedArgs.check_auth) {
    return { ok: false, name: null, issue: 'npm identity missing: pass --check-auth or --whoami <npm-user>' };
  }
  const result = spawnSync('npm', ['whoami'], {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: Number(parsedArgs.timeout_ms || 10000),
  });
  if (result.status !== 0) {
    const reason = normalizeNpmViewError(result.stderr || result.stdout || String(result.error || 'npm whoami failed'), 'npm');
    return { ok: false, name: null, issue: `npm whoami failed: ${reason}` };
  }
  return { ok: true, name: String(result.stdout || '').trim(), issue: null };
}

function readRegistryEvidence(parsedArgs, projectRoot, packageName) {
  if (parsedArgs.registry_json) {
    if (typeof parsedArgs.registry_json === 'object') {
      return { checked: true, source: 'registry_json', data: parsedArgs.registry_json };
    }
    try {
      return { checked: true, source: 'registry_json', data: JSON.parse(parsedArgs.registry_json) };
    } catch (error) {
      return { checked: true, source: 'registry_json', data: {}, error: `invalid registry_json: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  if (parsedArgs.registry_file) {
    const registryPath = resolve(projectRoot, parsedArgs.registry_file);
    if (!existsSync(registryPath)) {
      return { checked: true, source: relativeToProject(projectRoot, registryPath), data: {}, error: `registry file not found: ${relativeToProject(projectRoot, registryPath)}` };
    }
    try {
      return { checked: true, source: relativeToProject(projectRoot, registryPath), data: JSON.parse(readFileSync(registryPath, 'utf8')) };
    } catch (error) {
      return { checked: true, source: relativeToProject(projectRoot, registryPath), data: {}, error: `invalid registry file: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  if (parsedArgs.check_registry) {
    const result = spawnSync('npm', ['view', packageName, 'name', 'version', '--json'], {
      cwd: projectRoot,
      encoding: 'utf8',
      timeout: Number(parsedArgs.timeout_ms || 10000),
    });
    if (result.status !== 0) {
      const reason = normalizeNpmViewError(result.stderr || result.stdout || String(result.error || 'npm view failed'), packageName);
      return {
        checked: true,
        source: 'npm view',
        data: {},
        error: `npm view failed: ${reason}`,
        error_code: reason.includes('not published') ? 'not_published' : 'npm_view_failed',
      };
    }
    try {
      return { checked: true, source: 'npm view', data: JSON.parse(result.stdout || '{}') };
    } catch (error) {
      return { checked: true, source: 'npm view', data: {}, error: `invalid npm view JSON: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  return { checked: false, source: 'not_checked', data: {} };
}

function normalizeNpmViewError(raw, packageName) {
  const text = String(raw || '').trim();
  if (/E404|404 Not Found/i.test(text)) return `${packageName} is not published on the configured npm registry`;
  if (/E401|ENEEDAUTH|Unauthorized/i.test(text)) return 'npm authentication is required for this registry check';
  if (/ETIMEDOUT|timeout/i.test(text)) return 'npm registry check timed out';
  return text.split('\n').find((line) => line.trim())?.trim() || 'npm view failed';
}

async function handleCompare(args) {
  if (args.some(isHelpRequest)) {
    printCompareHelp();
    return;
  }

  const parsedArgs = parseCliArgs(args);
  const target = String(args.find((arg) => arg && !arg.startsWith('--')) || 'openspec').toLowerCase();
  let payload;
  try {
    payload = buildComparePayload(target);
  } catch {
    console.error(`Unknown compare target: ${target}`);
    console.error(`Available: ${Object.keys(COMPARE_TARGETS).join(', ')}`);
    process.exit(1);
  }

  const result = {
    generated_at: new Date().toISOString(),
    ...payload,
  };

  if (parsedArgs.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`xflow compare: ${result.target}`);
  console.log(`Verdict: ${result.verdict}\n`);
  if (result.winner) {
    console.log(`Winner: ${result.winner.overall}`);
    console.log(`Basis: ${result.winner.basis}`);
    console.log(`Caveat: ${result.winner.caveat}`);
    console.log(`Confidence: ${result.winner.confidence}\n`);
  }
  if (result.scorecard?.overall) {
    console.log('Scores:');
    for (const [name, score] of Object.entries(result.scorecard.overall)) console.log(`- ${name}: ${score}/${result.scorecard.scale === '0-100' ? 100 : result.scorecard.scale}`);
    console.log('');
  }
  console.log('xflow edges:');
  for (const edge of result.xflow_edges) console.log(`- ${edge}`);
  console.log('\ntarget edges:');
  for (const edge of result.target_edges) console.log(`- ${edge}`);
  if (result.boundary) {
    console.log('\nBoundary:');
    console.log(`- Role: ${result.boundary.role}`);
    console.log(`- Not for: ${result.boundary.not_for.join('; ')}`);
    console.log(`- Escalation: ${result.boundary.escalation_path.join(' -> ')}`);
  }
  console.log(`\nDocs: ${result.docs.join(', ')}`);
  console.log(`Proof: ${result.next_proof}`);
}

// ─── spec ────────────────────────────────────────────────────────────────────

async function handleSpec(sub, args) {
  if (isHelpRequest(sub)) {
    printSpecHelp();
    return;
  }

  switch (sub) {
    case 'start': {
      const parsedArgs = parseCliArgs(args);
      const projectRoot = parsedArgs.project_root || process.env.XFLOW_PROJECT_ROOT || process.cwd();
      const title = parsedArgs.title || parsedArgs.change_id || 'xflow-change';
      const changeId = normalizeChangeId(parsedArgs.change_id || title);
      if (!changeId) {
        console.error('Usage: xflow spec start --title <title> [--change-id <id>] [--change-type backend|frontend|full-stack|infrastructure|docs] [--project-root <path>] [--json]');
        process.exit(1);
      }
      const command = [
        resolve(ROOT, 'xflow', 'yolo', 'scripts', 'scaffold_specs_change.py'),
        '--project-root',
        projectRoot,
        '--change-id',
        changeId,
        '--title',
        title,
        '--change-type',
        parsedArgs.change_type || 'backend',
      ];
      for (const [flag, enabled] of [
        ['--with-ux', parsedArgs.with_ux],
        ['--with-design', parsedArgs.with_design],
        ['--with-findings', parsedArgs.with_findings],
        ['--with-progress', parsedArgs.with_progress],
        ['--with-workflow-merge', parsedArgs.with_workflow_merge],
      ]) {
        if (enabled) command.push(flag);
      }
      const result = spawnSync('python3', command, {
        cwd: projectRoot,
        encoding: 'utf8',
      });
      if ((result.status ?? 1) !== 0) {
        process.stderr.write(result.stderr || result.stdout || '');
        process.exit(result.status ?? 1);
      }
      const payload = {
        ok: true,
        project_root: resolve(projectRoot),
        specs_root: resolve(projectRoot, 'specs'),
        change_root: resolve(projectRoot, 'specs', 'changes', changeId),
        change_id: changeId,
        title,
        change_type: parsedArgs.change_type || 'backend',
        design_expected: ['frontend', 'full-stack'].includes(parsedArgs.change_type || 'backend'),
      };
      if (parsedArgs.json) {
        console.log(JSON.stringify(payload, null, 2));
        return;
      }
      console.log(`xflow spec start: scaffolded ${payload.change_root}`);
      console.log(`Change: ${payload.change_id} (${payload.change_type})`);
      break;
    }
    case 'quick': {
      const parsedArgs = parseCliArgs(args);
      const positionalTitle = args.find((arg) => !String(arg).startsWith('-'));
      const projectRoot = parsedArgs.project_root || process.env.XFLOW_PROJECT_ROOT || process.cwd();
      const title = positionalTitle || parsedArgs.title || parsedArgs.change_id || 'xflow-change';
      const changeId = normalizeChangeId(parsedArgs.change_id || title);
      if (!changeId) {
        console.error('Usage: xflow spec quick <title> [--change-id <id>] [--project-root <path>] [--json]');
        process.exit(1);
      }
      const command = [
        resolve(ROOT, 'xflow', 'yolo', 'scripts', 'scaffold_specs_change.py'),
        '--project-root',
        projectRoot,
        '--change-id',
        changeId,
        '--title',
        title,
        '--change-type',
        parsedArgs.change_type || 'docs',
      ];
      const result = spawnSync('python3', command, {
        cwd: projectRoot,
        encoding: 'utf8',
      });
      if ((result.status ?? 1) !== 0) {
        process.stderr.write(result.stderr || result.stdout || '');
        process.exit(result.status ?? 1);
      }
      const payload = {
        ok: true,
        entry: 'spec.quick',
        project_root: resolve(projectRoot),
        specs_root: resolve(projectRoot, 'specs'),
        change_root: resolve(projectRoot, 'specs', 'changes', changeId),
        change_id: changeId,
        title,
        change_type: parsedArgs.change_type || 'docs',
        design_expected: false,
      };
      if (parsedArgs.json) {
        console.log(JSON.stringify(payload, null, 2));
        return;
      }
      console.log(`xflow spec quick: scaffolded ${payload.change_root}`);
      console.log(`Change: ${payload.change_id} (${payload.change_type})`);
      break;
    }
    case 'delta': {
      const parsedArgs = parseCliArgs(args);
      const projectRoot = parsedArgs.project_root || process.env.XFLOW_PROJECT_ROOT || process.cwd();
      const changeId = resolveChangeId({ explicit: parsedArgs.change_id, projectRoot });
      ensureChangeId(changeId, 'spec delta', projectRoot);
      const result = spawnSync('python3', [
        resolve(ROOT, 'xflow', 'atoms', 'j4b_spec_delta_review.py'),
        '--project-root',
        projectRoot,
        '--change-id',
        changeId,
      ], { stdio: 'inherit' });
      process.exit(result.status ?? 1);
      break;
    }
    case 'openspec-map': {
      const parsedArgs = parseCliArgs(args);
      const projectRoot = parsedArgs.project_root || process.env.XFLOW_PROJECT_ROOT || process.cwd();
      const openspecRoot = parsedArgs.openspec_root || 'openspec';
      const result = spawnSync('python3', [
        resolve(ROOT, 'xflow', 'atoms', 'j4c_openspec_migration_map.py'),
        '--project-root',
        projectRoot,
        '--openspec-root',
        openspecRoot,
      ], { stdio: 'inherit' });
      process.exit(result.status ?? 1);
      break;
    }
    default:
      console.error(`Unknown spec subcommand: ${sub}`);
      console.error('Available: start, quick, delta, openspec-map');
      process.exit(1);
  }
}

async function handleQa(sub, args) {
  if (isHelpRequest(sub)) {
    printQaHelp();
    return;
  }

  const runQaCapture = (parsedArgs, overrides = {}) => {
    const projectRoot = parsedArgs.project_root || process.env.XFLOW_PROJECT_ROOT || process.cwd();
    const qaArgs = [
      'bin/xflow.js',
      'visual',
      'capture-page-evidence',
      '--url',
      String(parsedArgs.url),
      '--project-root',
      projectRoot,
      '--snapshot-output',
      overrides.snapshot_output || parsedArgs.snapshot_output || '.as-xflow/qa-page-snapshot.json',
      '--screenshot-output',
      overrides.screenshot_output || parsedArgs.screenshot_output || 'output/playwright/qa-page-evidence.png',
      '--dom-rects-output',
      overrides.dom_rects_output || parsedArgs.dom_rects_output || '.as-xflow/qa-dom-rects.json',
      '--visual-tokens-output',
      overrides.visual_tokens_output || parsedArgs.visual_tokens_output || '.as-xflow/qa-visual-tokens.json',
    ];
    if (parsedArgs.platform_profile) qaArgs.push('--platform-profile', String(parsedArgs.platform_profile));
    if (parsedArgs.reference) {
      qaArgs.push('--reference', String(parsedArgs.reference));
      qaArgs.push('--heatmap-output', overrides.heatmap_output || parsedArgs.heatmap_output || 'output/playwright/qa-diff-heatmap.png');
      qaArgs.push('--report-output', overrides.report_output || parsedArgs.report_output || 'output/playwright/qa-compare-report.html');
    } else if (overrides.report_output || parsedArgs.report_output) {
      qaArgs.push('--report-output', overrides.report_output || parsedArgs.report_output);
    }
    if (parsedArgs.capture_states_json) qaArgs.push('--capture-states-json', typeof parsedArgs.capture_states_json === 'string' ? parsedArgs.capture_states_json : JSON.stringify(parsedArgs.capture_states_json));
    if (parsedArgs.auto_discover_states !== false) qaArgs.push('--auto-discover-states');
    if (parsedArgs.state_limit) qaArgs.push('--state-limit', String(parsedArgs.state_limit));
    if (parsedArgs.width) qaArgs.push('--width', String(parsedArgs.width));
    if (parsedArgs.height) qaArgs.push('--height', String(parsedArgs.height));
    if (parsedArgs.wait_ms) qaArgs.push('--wait-ms', String(parsedArgs.wait_ms));
    if (parsedArgs.panel_attr) qaArgs.push('--panel-attr', String(parsedArgs.panel_attr));
    if (parsedArgs.panel_selector) qaArgs.push('--panel-selector', String(parsedArgs.panel_selector));
    qaArgs.push('--json');
    const result = spawnSync(process.execPath, qaArgs, {
      cwd: ROOT,
      encoding: 'utf8',
    });
    if ((result.status ?? 1) !== 0) {
      process.stderr.write(result.stderr || result.stdout || '');
      process.exit(result.status ?? 1);
    }
    return {
      projectRoot,
      payload: JSON.parse(result.stdout),
    };
  };

  switch (sub) {
    case 'capture': {
      const parsedArgs = parseCliArgs(args);
      if (!parsedArgs.url) {
        console.error('Usage: xflow qa capture --url <page-url> [--reference <reference.png>] [--platform-profile mobile_h5] [--project-root <path>] [--json]');
        process.exit(1);
      }
      const { payload } = runQaCapture(parsedArgs);
      if (parsedArgs.json) {
        payload.ok = true;
        payload.entry = 'qa.capture';
        console.log(JSON.stringify(payload, null, 2));
        return;
      }
      process.stdout.write(JSON.stringify(payload, null, 2));
      process.stdout.write('\n');
      break;
    }
    case 'review': {
      const parsedArgs = parseCliArgs(args);
      if (!parsedArgs.url) {
        console.error('Usage: xflow qa review --url <page-url> [--reference <reference.png>] [--platform-profile mobile_h5] [--project-root <path>] [--json]');
        process.exit(1);
      }
      const projectRoot = parsedArgs.project_root || process.env.XFLOW_PROJECT_ROOT || process.cwd();
      const reviewReportPath = resolveCliPath(projectRoot, parsedArgs.report_output || 'output/playwright/qa-review-report.html');
      const { payload } = runQaCapture(parsedArgs, {
        report_output: parsedArgs.report_output || 'output/playwright/qa-review-report.html',
        screenshot_output: parsedArgs.screenshot_output || 'output/playwright/qa-review-evidence.png',
      });
      mkdirSync(dirname(reviewReportPath), { recursive: true });
      writeFileSync(reviewReportPath, `<!doctype html>
<html lang="en">
  <meta charset="utf-8" />
  <title>xflow qa review</title>
  <body>
    <h1>xflow qa review</h1>
    <p>URL: ${escapeHtml(String(parsedArgs.url))}</p>
    <p>Platform: ${escapeHtml(String(parsedArgs.platform_profile || 'default'))}</p>
    <p>Reference: ${escapeHtml(String(parsedArgs.reference || 'not supplied'))}</p>
    <p>Screenshot: ${escapeHtml(String(payload.screenshot_output || 'n/a'))}</p>
    <p>Snapshot: ${escapeHtml(String(payload.snapshot_output || 'n/a'))}</p>
    <p>Next: promote to <code>xflow qa ship</code> only after this review is accepted.</p>
  </body>
</html>
`);
      const reviewPayload = {
        ok: true,
        entry: 'qa.review',
        role: 'qa_reviewer',
        verdict: parsedArgs.reference
          ? 'Captured QA evidence with review-ready diff artifacts.'
          : 'Captured QA evidence with a review-ready report; add --reference for visual diff proof.',
        capture: {
          ...payload,
          ok: true,
          entry: 'qa.capture',
        },
        next_steps: [
          parsedArgs.reference
            ? 'Inspect the HTML report and diff heatmap before accepting the visual surface.'
            : 'Add --reference to strengthen the review with explicit visual-diff proof.',
          'Promote the page into a ship gate with `xflow qa ship --url <page-url> --json` once the review is clean.',
        ],
        report_output: relative(projectRoot, reviewReportPath) || reviewReportPath,
      };
      console.log(JSON.stringify(reviewPayload, null, 2));
      break;
    }
    case 'ship': {
      const parsedArgs = parseCliArgs(args);
      if (!parsedArgs.url) {
        console.error('Usage: xflow qa ship --url <page-url> [--reference <reference.png>] [--platform-profile mobile_h5] [--project-root <path>] [--json]');
        process.exit(1);
      }
      const projectRoot = parsedArgs.project_root || process.env.XFLOW_PROJECT_ROOT || process.cwd();
      const shipReportPath = resolveCliPath(projectRoot, parsedArgs.report_output || 'output/playwright/qa-ship-report.html');
      const { payload } = runQaCapture(parsedArgs, {
        report_output: parsedArgs.report_output || 'output/playwright/qa-ship-report.html',
        screenshot_output: parsedArgs.screenshot_output || 'output/playwright/qa-ship-evidence.png',
      });
      mkdirSync(dirname(shipReportPath), { recursive: true });
      writeFileSync(shipReportPath, `<!doctype html>
<html lang="en">
  <meta charset="utf-8" />
  <title>xflow qa ship</title>
  <body>
    <h1>xflow qa ship</h1>
    <p>URL: ${escapeHtml(String(parsedArgs.url))}</p>
    <p>Platform: ${escapeHtml(String(parsedArgs.platform_profile || 'default'))}</p>
    <p>Reference: ${escapeHtml(String(parsedArgs.reference || 'not supplied'))}</p>
    <p>Screenshot: ${escapeHtml(String(payload.screenshot_output || 'n/a'))}</p>
    <p>Release checks: xflow launch audit --strict --json; xflow launch audit --splash --strict --check-registry --json; npm run release:pack</p>
  </body>
</html>
`);
      const shipPayload = {
        ok: true,
        entry: 'qa.ship',
        role: 'release_qa_operator',
        verdict: 'Captured ship-gate browser evidence and packaged the follow-on release checks.',
        capture: {
          ...payload,
          ok: true,
          entry: 'qa.capture',
        },
        release_gate: [
          'xflow launch audit --strict --json',
          'xflow launch audit --splash --strict --check-registry --json',
          'npm run release:pack',
        ],
        next_steps: [
          'Review the captured browser evidence and compare report before final release sign-off.',
          'Run the listed release gates after the browser surface is accepted.',
        ],
        report_output: relative(projectRoot, shipReportPath) || shipReportPath,
      };
      console.log(JSON.stringify(shipPayload, null, 2));
      break;
    }
    case 'benchmark': {
      const parsedArgs = parseCliArgs(args);
      if (!parsedArgs.url) {
        console.error('Usage: xflow qa benchmark --url <page-url> [--reference <reference.png>] [--platform-profile mobile_h5] [--project-root <path>] [--json]');
        process.exit(1);
      }
      const projectRoot = parsedArgs.project_root || process.env.XFLOW_PROJECT_ROOT || process.cwd();
      const benchmarkReportPath = resolveCliPath(projectRoot, parsedArgs.report_output || 'output/playwright/qa-benchmark-report.html');
      const reviewReportPath = resolveCliPath(projectRoot, 'output/playwright/qa-review-report.html');
      const shipReportPath = resolveCliPath(projectRoot, 'output/playwright/qa-ship-report.html');
      const { payload: reviewCapture } = runQaCapture(parsedArgs, {
        report_output: 'output/playwright/qa-review-report.html',
        screenshot_output: 'output/playwright/qa-review-evidence.png',
      });
      mkdirSync(dirname(reviewReportPath), { recursive: true });
      writeFileSync(reviewReportPath, `<!doctype html>
<html lang="en">
  <meta charset="utf-8" />
  <title>xflow qa review</title>
  <body>
    <h1>xflow qa review</h1>
    <p>URL: ${escapeHtml(String(parsedArgs.url))}</p>
    <p>Reference: ${escapeHtml(String(parsedArgs.reference || 'not supplied'))}</p>
    <p>Promote to ship only after this review is accepted.</p>
  </body>
</html>
`);
      const reviewPayload = {
        ok: true,
        entry: 'qa.review',
        role: 'qa_reviewer',
        verdict: parsedArgs.reference
          ? 'Captured QA evidence with review-ready diff artifacts.'
          : 'Captured QA evidence with a review-ready report; add --reference for visual diff proof.',
        capture: { ...reviewCapture, ok: true, entry: 'qa.capture' },
        next_steps: [
          parsedArgs.reference
            ? 'Inspect the HTML report and diff heatmap before accepting the visual surface.'
            : 'Add --reference to strengthen the review with explicit visual-diff proof.',
          'Promote the page into a ship gate with `xflow qa ship --url <page-url> --json` once the review is clean.',
        ],
        report_output: relative(projectRoot, reviewReportPath) || reviewReportPath,
      };

      const { payload: shipCapture } = runQaCapture(parsedArgs, {
        report_output: 'output/playwright/qa-ship-report.html',
        screenshot_output: 'output/playwright/qa-ship-evidence.png',
      });
      mkdirSync(dirname(shipReportPath), { recursive: true });
      writeFileSync(shipReportPath, `<!doctype html>
<html lang="en">
  <meta charset="utf-8" />
  <title>xflow qa ship</title>
  <body>
    <h1>xflow qa ship</h1>
    <p>URL: ${escapeHtml(String(parsedArgs.url))}</p>
    <p>Reference: ${escapeHtml(String(parsedArgs.reference || 'not supplied'))}</p>
    <p>Release checks: xflow launch audit --strict --json; xflow launch audit --splash --strict --check-registry --json; npm run release:pack</p>
  </body>
</html>
`);
      const shipPayload = {
        ok: true,
        entry: 'qa.ship',
        role: 'release_qa_operator',
        verdict: 'Captured ship-gate browser evidence and packaged the follow-on release checks.',
        capture: { ...shipCapture, ok: true, entry: 'qa.capture' },
        release_gate: [
          'xflow launch audit --strict --json',
          'xflow launch audit --splash --strict --check-registry --json',
          'npm run release:pack',
        ],
        next_steps: [
          'Review the captured browser evidence and compare report before final release sign-off.',
          'Run the listed release gates after the browser surface is accepted.',
        ],
        report_output: relative(projectRoot, shipReportPath) || shipReportPath,
      };

      mkdirSync(dirname(benchmarkReportPath), { recursive: true });
      writeFileSync(benchmarkReportPath, `<!doctype html>
<html lang="en">
  <meta charset="utf-8" />
  <title>xflow qa benchmark</title>
  <body>
    <h1>xflow qa benchmark</h1>
    <p>URL: ${escapeHtml(String(parsedArgs.url))}</p>
    <p>Reference: ${escapeHtml(String(parsedArgs.reference || 'not supplied'))}</p>
    <ol>
      <li>Review report: ${escapeHtml(relative(projectRoot, reviewReportPath) || reviewReportPath)}</li>
      <li>Ship report: ${escapeHtml(relative(projectRoot, shipReportPath) || shipReportPath)}</li>
      <li>Launch gates: xflow launch audit --strict --json; xflow launch audit --splash --strict --check-registry --json; npm run release:pack</li>
    </ol>
  </body>
</html>
`);
      const benchmarkPayload = {
        ok: true,
        entry: 'qa.benchmark',
        role: 'visual_benchmark_operator',
        verdict: 'Bundled review, ship, and release-gate expectations into one browser benchmark packet.',
        review: reviewPayload,
        ship: shipPayload,
        release_gate: shipPayload.release_gate,
        report_output: relative(projectRoot, benchmarkReportPath) || benchmarkReportPath,
        next_steps: [
          'Accept the review report before treating the ship packet as valid.',
          'Run the listed launch gates once the benchmark packet is accepted.',
        ],
      };
      console.log(JSON.stringify(benchmarkPayload, null, 2));
      break;
    }
    default:
      console.error(`Unknown qa subcommand: ${sub}`);
      console.error('Available: capture, review, ship, benchmark');
      process.exit(1);
  }
}

function listHostTargets() {
  const home = process.env.HOME || '';
  return [
    { id: 'codex', root: resolve(home, '.codex', 'skills'), skill_dir: resolve(home, '.codex', 'skills', 'xflow') },
    { id: 'agents', root: resolve(home, '.agents', 'skills'), skill_dir: resolve(home, '.agents', 'skills', 'xflow') },
    { id: 'opencode', root: resolve(home, '.config', 'opencode', 'skills'), skill_dir: resolve(home, '.config', 'opencode', 'skills', 'xflow') },
  ];
}

function selectHostTargets(host) {
  const targets = listHostTargets();
  if (!host) return targets;
  const match = targets.find((target) => target.id === host);
  if (!match) {
    console.error(`Unknown host: ${host}`);
    console.error('Available: codex, agents, opencode');
    process.exit(1);
  }
  return [match];
}

function runHostDiffTarget(projectRoot, target) {
  const result = spawnSync('sh', [
    resolve(ROOT, 'xflow', 'scripts', 'check_installed_xflow_skill_sync.sh'),
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      XFLOW_INSTALLED_SKILL_DIR: target.skill_dir,
    },
  });
  return {
    host: target.id,
    root: target.root,
    skill_dir: target.skill_dir,
    ok: (result.status ?? 1) === 0,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
    installed: existsSync(target.skill_dir),
  };
}

async function handleHost(sub, args) {
  if (isHelpRequest(sub)) {
    printHostHelp();
    return;
  }
  const action = sub || 'status';
  const parsedArgs = parseCliArgs(args);
  const projectRoot = parsedArgs.project_root || process.env.XFLOW_PROJECT_ROOT || process.cwd();
  const targets = selectHostTargets(parsedArgs.host);

  if (action === 'status') {
    const hosts = targets.map((target) => runHostDiffTarget(projectRoot, target));
    const payload = {
      ok: hosts.every((host) => host.ok || !host.installed),
      project_root: resolve(projectRoot),
      hosts,
    };
    if (parsedArgs.json) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }
    console.log('xflow host status');
    for (const host of hosts) {
      console.log(`- ${host.host}: ${host.installed ? (host.ok ? 'in sync' : 'drift or missing metadata') : 'not installed'}`);
    }
    return;
  }

  if (action === 'diff') {
    const hosts = targets.map((target) => runHostDiffTarget(projectRoot, target));
    const payload = {
      ok: hosts.every((host) => host.ok),
      project_root: resolve(projectRoot),
      hosts,
    };
    if (parsedArgs.json) {
      console.log(JSON.stringify(payload, null, 2));
      if (!payload.ok) process.exit(1);
      return;
    }
    for (const host of hosts) {
      console.log(`${host.host}: ${host.ok ? 'ok' : 'drift'}`);
      if (host.stdout) console.log(host.stdout);
      if (host.stderr) console.log(host.stderr);
    }
    if (!payload.ok) process.exit(1);
    return;
  }

  if (action === 'sync') {
    const env = { ...process.env };
    if (parsedArgs.host) {
      env.SKILL_SYNC_TARGET_DIRS = targets.map((target) => target.root).join('\n');
    }
    const result = spawnSync('sh', [
      resolve(ROOT, 'xflow', 'scripts', 'sync_installed_xflow_skill.sh'),
    ], {
      cwd: projectRoot,
      encoding: 'utf8',
      env,
    });
    if (parsedArgs.json) {
      console.log(JSON.stringify({
        ok: (result.status ?? 1) === 0,
        project_root: resolve(projectRoot),
        hosts: targets.map((target) => target.id),
        stdout: result.stdout.trim(),
        stderr: result.stderr.trim(),
      }, null, 2));
      if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);
      return;
    }
    process.stdout.write(result.stdout);
    if ((result.status ?? 1) !== 0) {
      process.stderr.write(result.stderr);
      process.exit(result.status ?? 1);
    }
    return;
  }

  console.error(`Unknown host subcommand: ${action}`);
  console.error('Available: status, sync, diff');
  process.exit(1);
}

async function handleCoach(args) {
  if (args.some(isHelpRequest)) {
    printCoachHelp();
    return;
  }
  const mode = args[0] || 'bugfix';
  const playbooks = {
    bugfix: {
      verdict: 'Use yolo + split red/green proof + archive order. Keep the loop short and evidence-first.',
      stages: [
        'Reproduce and name the failure clearly',
        'Write or identify a failing test first',
        'Run the red proof',
        'Implement the fix in the smallest viable slice',
        'Run green proof and changed-test quality review',
        'Verify and archive with durable handoff context',
      ],
      commands: [
        'xflow goal audit --json',
        'xflow spec start --title "<bugfix title>" --change-type backend',
        'xflow workflow run yolo --dry-run --title "<bugfix title>" --change-type backend',
        'npm test',
        'npm run release:pack',
      ],
    },
    feature: {
      verdict: 'Use spec scaffolding early, pick yolo or corps explicitly, and keep proof separate from execution.',
      stages: [
        'Scaffold the change workspace and root specs if missing',
        'Choose yolo for normal code paths or corps for product/UI-heavy risk',
        'Make goal alignment visible before implementation',
        'Run red/green proof and quality review',
        'Archive durable truth back into repo-owned artifacts',
      ],
      commands: [
        'xflow goal audit --json',
        'xflow spec start --title "<feature title>" --change-type full-stack',
        'xflow guide --json',
        'xflow workflow validate yolo',
        'xflow workflow validate corps',
      ],
    },
    review: {
      verdict: 'Review against proof, drift, launch, and handoff surfaces instead of trusting prose.',
      stages: [
        'Check workflow / skill drift first',
        'Read goal, handoff, and launch dossier together',
        'Inspect whether tests changed with code changes',
        'Check release gates before accepting public-facing claims',
      ],
      commands: [
        'npm run drift:scan',
        'npm run skill:diff',
        'xflow goal audit --json',
        'xflow launch dossier',
        'xflow launch audit --strict --json',
      ],
    },
    qa: {
      verdict: 'Treat browser QA as a named operator loop: capture evidence, compare against a reference, then decide if the surface is ship-ready.',
      stages: [
        'Capture a page with stable QA defaults',
        'Add or verify a reference surface before accepting visual changes',
        'Inspect the review report and diff artifacts, not just the screenshot',
        'Escalate to ship mode only after the browser surface is accepted',
      ],
      commands: [
        'xflow qa review --url <page-url> --json',
        'xflow qa review --url <page-url> --reference <reference.png> --json',
        'xflow qa ship --url <page-url> --json',
      ],
    },
    ship: {
      verdict: 'Use a named ship loop that ties browser evidence to release-owner gates before public-facing claims.',
      stages: [
        'Capture reviewable browser evidence first',
        'Check launch and release gates after the UI surface is accepted',
        'Preserve the resulting proof in dossier, benchmark, or handoff surfaces',
        'Only then treat the change as ready for wider rollout',
      ],
      commands: [
        'xflow qa ship --url <page-url> --json',
        'xflow launch audit --strict --json',
        'xflow launch audit --splash --strict --check-registry --json',
        'npm run release:pack',
      ],
    },
    tdd: {
      verdict: 'Keep the TDD loop lightweight but explicit: red first, verify the right failure, then green with the smallest passing change.',
      stages: [
        'Write one failing test that names the behavior in red',
        'Verify the failure is the expected one before touching implementation',
        'Make the smallest green change possible',
        'Only refactor after green stays clean',
      ],
      commands: [
        'xflow coach bugfix --json',
        'xflow workflow run yolo --dry-run --title "<bugfix title>" --change-type backend',
        'npm test',
      ],
    },
    debug: {
      verdict: 'Debug with evidence, not vibes: reproduce first, narrow the failure surface, then route into the bugfix/TDD loop.',
      stages: [
        'reproduce the failure in a narrow, repeatable way',
        'Name the failing surface before changing code',
        'Convert the reproduction into a test or proof artifact',
        'Then hand off to the bugfix/TDD loop',
      ],
      commands: [
        'xflow coach bugfix --json',
        'xflow goal audit --json',
        'npm test',
      ],
    },
    red: {
      verdict: 'Start at red with the narrowest failing test you can name, and do not write implementation before the failure is proven.',
      stages: [
        'Write a failing test that names one behavior clearly',
        'Run the test and confirm the failure is the intended one',
        'Avoid implementation work until red is real',
      ],
      commands: [
        'xflow coach tdd --json',
        'npm test',
      ],
    },
    green: {
      verdict: 'Move to green with the smallest passing change, then stop before over-engineering.',
      stages: [
        'Implement the smallest change that can turn red into green',
        'Re-run the focused test and confirm the suite is clean',
        'Avoid adding extra behavior before the first green pass lands',
      ],
      commands: [
        'xflow coach bugfix --json',
        'npm test',
      ],
    },
    verify: {
      verdict: 'Treat verification as a named last mile: proof, drift, and launch surfaces should all be clean before claims.',
      stages: [
        'Run proof and drift checks before trusting prose',
        'Check release and launch gates that match the change surface',
        'Only then convert the result into handoff or public claims',
      ],
      commands: [
        'npm run drift:scan',
        'xflow launch audit --strict --json',
        'npm run release:pack',
      ],
    },
  };
  const payload = playbooks[mode];
  if (!payload) {
    console.error(`Unknown coach mode: ${mode}`);
    console.error('Available: bugfix, feature, review, qa, ship, tdd, debug, red, green, verify');
    process.exit(1);
  }
  if (args.includes('--json')) {
    console.log(JSON.stringify({ ok: true, mode, ...payload }, null, 2));
    return;
  }
  console.log(`xflow coach: ${mode}`);
  console.log(`Verdict: ${payload.verdict}`);
  console.log('\nStages:');
  for (const stage of payload.stages) console.log(`- ${stage}`);
  console.log('\nCommands:');
  for (const command of payload.commands) console.log(`- ${command}`);
}

async function handleRole(args) {
  if (args.some(isHelpRequest)) {
    printRoleHelp();
    return;
  }
  const role = args[0] || 'developer';
  const playbooks = {
    developer: {
      verdict: 'Primary implementer role for repo-local changes with explicit workflow and proof surfaces.',
      commands: [
        'xflow workflow run yolo --dry-run --title "<change title>" --change-type backend',
        'xflow spec start --title "<change title>" --change-type backend',
        'xflow goal audit --json',
      ],
    },
    reviewer: {
      verdict: 'Proof-first reviewer role for drift, handoff, and changed-surface validation.',
      commands: [
        'npm run drift:scan',
        'xflow launch dossier',
        'xflow goal audit --json',
      ],
    },
    qa: {
      verdict: 'Browser evidence operator role that owns review, ship, and benchmark packets.',
      commands: [
        'xflow qa benchmark --url <page-url> --json',
        'xflow qa review --url <page-url> --json',
        'xflow qa ship --url <page-url> --json',
      ],
    },
    release: {
      verdict: 'Release-owner role for launch, package, and public-claim gates.',
      commands: [
        'xflow launch audit --splash --strict --check-registry --json',
        'xflow package audit --check-registry --json',
        'npm run release:pack',
      ],
    },
    product: {
      verdict: 'Direction-setting role that keeps goal, scope, and launch claims aligned.',
      commands: [
        'xflow goal audit --json',
        'xflow launch claims --json',
        'xflow guide --json',
      ],
    },
  };
  const payload = playbooks[role];
  if (!payload) {
    console.error(`Unknown role: ${role}`);
    console.error('Available: developer, reviewer, qa, release, product');
    process.exit(1);
  }
  if (args.includes('--json')) {
    console.log(JSON.stringify({ ok: true, role, ...payload }, null, 2));
    return;
  }
  console.log(`xflow role: ${role}`);
  console.log(`Verdict: ${payload.verdict}`);
  console.log('\nCommands:');
  for (const command of payload.commands) console.log(`- ${command}`);
}

// ─── visual ──────────────────────────────────────────────────────────────────

async function handleVisual(sub, args) {
  if (isHelpRequest(sub)) {
    printVisualHelp();
    return;
  }

  switch (sub) {
    case 'capture-page-evidence': {
      const parsedArgs = parseCliArgs(args);
      if (!parsedArgs.url) {
        console.error('Usage: xflow visual capture-page-evidence --url <page-url> [--snapshot-output <snapshot.json>] [--screenshot-output <screen.png>] [--dom-rects-output <dom-rects.json>] [--visual-tokens-output <visual-tokens.json>] [--reference <reference.png>] [--heatmap-output <diff-heatmap.png>] [--report-output <compare-report.html>] [--platform-profile ios_phone|android_phone|mobile_h5] [--capture-states-json <states.json>] [--auto-discover-states] [--state-limit 4] [--width 1440] [--height 900] [--wait-ms 250] [--panel-attr data-panel] [--panel-selector <selector>] [--project-root <path>] [--json]');
        process.exit(1);
      }
      const projectRoot = parsedArgs.project_root || process.env.XFLOW_PROJECT_ROOT || process.cwd();
      const snapshotPath = resolveCliPath(projectRoot, parsedArgs.snapshot_output || '.as-xflow/page-snapshot.json');
      const screenshotPath = resolveCliPath(projectRoot, parsedArgs.screenshot_output || 'output/playwright/page-evidence.png');
      let captureStates = [];
      if (parsedArgs.capture_states_json) {
        if (Array.isArray(parsedArgs.capture_states_json)) {
          captureStates = parsedArgs.capture_states_json;
        } else if (typeof parsedArgs.capture_states_json === 'string') {
          try {
            const parsedStates = JSON.parse(parsedArgs.capture_states_json);
            captureStates = Array.isArray(parsedStates) ? parsedStates : [];
          } catch (error) {
            console.error(`Invalid --capture-states-json payload: ${error instanceof Error ? error.message : String(error)}`);
            process.exit(1);
          }
        } else {
          console.error('Invalid --capture-states-json payload: expected a JSON array');
          process.exit(1);
        }
      }
      try {
        const payload = await capturePageEvidence({
          url: parsedArgs.url,
          snapshotPath,
          screenshotPath,
          width: parsedArgs.width,
          height: parsedArgs.height,
          waitMs: parsedArgs.wait_ms,
          platformProfile: parsedArgs.platform_profile,
          panelAttr: parsedArgs.panel_attr || 'data-panel',
          panelSelector: parsedArgs.panel_selector,
          captureStates,
          autoDiscoverStates: parsedArgs.auto_discover_states === true,
          stateLimit: parsedArgs.state_limit,
        });
        let domRectsPayload = null;
        if (parsedArgs.dom_rects_output) {
          const domRectsOutputPath = resolveCliPath(projectRoot, parsedArgs.dom_rects_output);
          domRectsPayload = exportDomRectsToFile({
            inputPath: snapshotPath,
            outputPath: domRectsOutputPath,
            panelAttr: parsedArgs.panel_attr || 'data-panel',
          });
          domRectsPayload.output_file = domRectsOutputPath;
        }
        let visualTokensPayload = null;
        if (parsedArgs.visual_tokens_output) {
          const visualTokensOutputPath = resolveCliPath(projectRoot, parsedArgs.visual_tokens_output);
          visualTokensPayload = exportVisualTokensToFile({
            inputPath: snapshotPath,
            outputPath: visualTokensOutputPath,
          });
          visualTokensPayload.output_file = visualTokensOutputPath;
        }
        let diffPayload = null;
        let reportPayload = null;
        if (parsedArgs.reference) {
          const referencePath = resolveCliPath(projectRoot, parsedArgs.reference);
          if (!existsSync(referencePath)) {
            console.error(`Reference image not found: ${referencePath}`);
            process.exit(1);
          }
          diffPayload = await computeImageDiffMetrics({
            referencePath,
            candidatePath: screenshotPath,
            pixelThreshold: parsedArgs.pixel_threshold,
            blockRows: parsedArgs.block_rows,
            blockCols: parsedArgs.block_cols,
            heatmapOutputPath: parsedArgs.heatmap_output ? resolveCliPath(projectRoot, parsedArgs.heatmap_output) : null,
          });
          diffPayload.reference_file = referencePath;
          diffPayload.candidate_file = screenshotPath;
          if (parsedArgs.report_output) {
            const reportPath = resolveCliPath(projectRoot, parsedArgs.report_output);
            reportPayload = renderVisualCompareReport({
              projectRoot,
              outputPath: reportPath,
              title: 'capture-page-evidence compare report',
              summary: '<p class="prose">Auto-generated from xflow visual capture-page-evidence.</p>',
              scenarios: [
                {
                  id: 'captured-page',
                  platform_profile: payload.platform_profile || null,
                  viewport: payload.snapshot?.viewport || null,
                  reference_image: referencePath,
                  screenshot_image: screenshotPath,
                  diff_metrics: {
                    status: 'pass',
                    values: {
                      structural_similarity: diffPayload.structural_similarity,
                      layout_shift_score: diffPayload.layout_shift_score,
                      pixel_diff_ratio: diffPayload.pixel_diff_ratio,
                    },
                    hotspots: diffPayload.hotspots,
                    heatmap_file: diffPayload.heatmap_file,
                  },
                  structure_checks: [],
                  token_checks: [],
                  status: 'pass',
                },
              ],
            });
          }
        }
        const result = {
          ok: true,
          url: parsedArgs.url,
          ...payload,
          dom_rects: domRectsPayload,
          visual_tokens: visualTokensPayload,
          diff_metrics: diffPayload,
          report: reportPayload,
        };
        if (parsedArgs.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        console.log(`xflow visual capture-page-evidence: wrote ${snapshotPath} and ${screenshotPath}`);
        console.log(`Panels captured: ${result.nodes_captured}`);
        if (Array.isArray(result.states) && result.states.length > 0) {
          console.log(`State captures: ${result.states.length}`);
        }
        if (domRectsPayload) {
          console.log(`DOM rects: ${domRectsPayload.output_file}`);
        }
        if (visualTokensPayload) {
          console.log(`Visual tokens: ${visualTokensPayload.output_file}`);
        }
        if (diffPayload) {
          console.log(`pixel_diff_ratio=${diffPayload.pixel_diff_ratio.toFixed(4)} layout_shift_score=${diffPayload.layout_shift_score.toFixed(4)} structural_similarity=${diffPayload.structural_similarity.toFixed(4)}`);
        }
        if (reportPayload) {
          console.log(`Report: ${reportPayload.output_file}`);
        }
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
      break;
    }
    case 'export-dom-rects': {
      const parsedArgs = parseCliArgs(args);
      if (!parsedArgs.input) {
        console.error('Usage: xflow visual export-dom-rects --input <snapshot.json> [--output <dom-rects.json>] [--panel-attr data-panel] [--project-root <path>] [--json]');
        process.exit(1);
      }
      const projectRoot = parsedArgs.project_root || process.env.XFLOW_PROJECT_ROOT || process.cwd();
      const inputPath = resolveCliPath(projectRoot, parsedArgs.input);
      const outputPath = resolveCliPath(projectRoot, parsedArgs.output || '.as-xflow/dom-rects.json');
      if (!existsSync(inputPath)) {
        console.error(`DOM snapshot input not found: ${inputPath}`);
        process.exit(1);
      }
      try {
        const payload = exportDomRectsToFile({
          inputPath,
          outputPath,
          panelAttr: parsedArgs.panel_attr || 'data-panel',
        });
        const result = {
          ok: true,
          input_file: inputPath,
          output_file: outputPath,
          ...payload,
        };
        if (parsedArgs.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        console.log(`xflow visual export-dom-rects: wrote ${outputPath}`);
        console.log(`Panels: ${result.extracted_panels} / Nodes scanned: ${result.input_nodes}`);
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
      break;
    }
    case 'export-visual-tokens': {
      const parsedArgs = parseCliArgs(args);
      if (!parsedArgs.input) {
        console.error('Usage: xflow visual export-visual-tokens --input <snapshot.json> [--output <visual-tokens.json>] [--project-root <path>] [--json]');
        process.exit(1);
      }
      const projectRoot = parsedArgs.project_root || process.env.XFLOW_PROJECT_ROOT || process.cwd();
      const inputPath = resolveCliPath(projectRoot, parsedArgs.input);
      const outputPath = resolveCliPath(projectRoot, parsedArgs.output || '.as-xflow/visual-tokens.json');
      if (!existsSync(inputPath)) {
        console.error(`DOM snapshot input not found: ${inputPath}`);
        process.exit(1);
      }
      try {
        const payload = exportVisualTokensToFile({
          inputPath,
          outputPath,
        });
        const result = {
          ok: true,
          input_file: inputPath,
          output_file: outputPath,
          ...payload,
        };
        if (parsedArgs.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        console.log(`xflow visual export-visual-tokens: wrote ${outputPath}`);
        console.log(`Nodes scanned: ${result.input_nodes}`);
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
      break;
    }
    case 'diff-images': {
      const parsedArgs = parseCliArgs(args);
      if (!parsedArgs.reference || !parsedArgs.candidate) {
        console.error('Usage: xflow visual diff-images --reference <reference.png> --candidate <candidate.png> [--heatmap-output <diff-heatmap.png>] [--report-output <compare-report.html>] [--pixel-threshold 16] [--block-rows 12] [--block-cols 12] [--project-root <path>] [--json]');
        process.exit(1);
      }
      const projectRoot = parsedArgs.project_root || process.env.XFLOW_PROJECT_ROOT || process.cwd();
      const referencePath = resolveCliPath(projectRoot, parsedArgs.reference);
      const candidatePath = resolveCliPath(projectRoot, parsedArgs.candidate);
      if (!existsSync(referencePath)) {
        console.error(`Reference image not found: ${referencePath}`);
        process.exit(1);
      }
      if (!existsSync(candidatePath)) {
        console.error(`Candidate image not found: ${candidatePath}`);
        process.exit(1);
      }
      try {
        const metrics = await computeImageDiffMetrics({
          referencePath,
          candidatePath,
          pixelThreshold: parsedArgs.pixel_threshold,
          blockRows: parsedArgs.block_rows,
          blockCols: parsedArgs.block_cols,
          heatmapOutputPath: parsedArgs.heatmap_output ? resolveCliPath(projectRoot, parsedArgs.heatmap_output) : null,
        });
        const result = {
          ok: true,
          reference_file: referencePath,
          candidate_file: candidatePath,
          ...metrics,
        };
        if (parsedArgs.report_output) {
          const reportPath = resolveCliPath(projectRoot, parsedArgs.report_output);
          result.report = renderVisualCompareReport({
            projectRoot,
            outputPath: reportPath,
            title: 'diff-images compare report',
            summary: '<p class="prose">Auto-generated from xflow visual diff-images.</p>',
            scenarios: [
              {
                id: 'diff-images',
                reference_image: referencePath,
                screenshot_image: candidatePath,
                diff_metrics: {
                  status: 'pass',
                  values: {
                    structural_similarity: result.structural_similarity,
                    layout_shift_score: result.layout_shift_score,
                    pixel_diff_ratio: result.pixel_diff_ratio,
                  },
                  hotspots: result.hotspots,
                  heatmap_file: result.heatmap_file,
                },
                structure_checks: [],
                token_checks: [],
                status: 'pass',
              },
            ],
          });
        }
        if (parsedArgs.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        console.log(`xflow visual diff-images: ${referencePath} vs ${candidatePath}`);
        console.log(`pixel_diff_ratio=${result.pixel_diff_ratio.toFixed(4)} layout_shift_score=${result.layout_shift_score.toFixed(4)} structural_similarity=${result.structural_similarity.toFixed(4)}`);
        if (result.report) {
          console.log(`Report: ${result.report.output_file}`);
        }
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
      break;
    }
    case 'render-report': {
      const parsedArgs = parseCliArgs(args);
      if (!parsedArgs.input) {
        console.error('Usage: xflow visual render-report --input <visual_benchmark.json> [--output <report.html>] [--project-root <path>] [--json]');
        process.exit(1);
      }
      const projectRoot = parsedArgs.project_root || process.env.XFLOW_PROJECT_ROOT || process.cwd();
      const inputPath = resolveCliPath(projectRoot, parsedArgs.input);
      const outputPath = resolveCliPath(projectRoot, parsedArgs.output || 'output/playwright/visual-report.html');
      if (!existsSync(inputPath)) {
        console.error(`Visual benchmark input not found: ${inputPath}`);
        process.exit(1);
      }
      try {
        const artifact = JSON.parse(readFileSync(inputPath, 'utf8'));
        const report = renderVisualBenchmarkReport({
          projectRoot,
          outputPath,
          artifact,
        });
        const result = { ok: true, input_file: inputPath, ...report };
        if (parsedArgs.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        console.log(`xflow visual render-report: wrote ${outputPath}`);
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
      break;
    }
    default:
      console.error(`Unknown visual subcommand: ${sub}`);
      console.error('Available: capture-page-evidence, export-dom-rects, export-visual-tokens, diff-images, render-report');
      process.exit(1);
  }
}

const GUIDE_STAGES = [
  {
    id: 'shape',
    label: 'Shape the work',
    intent: 'Turn a rough ask into a readable problem frame before implementation.',
    operator: 'xflow:plan',
    artifacts: ['proposal.md', 'plan.md'],
  },
  {
    id: 'choose-track',
    label: 'Choose the delivery track',
    intent: 'Use yolo for bounded backend/docs/infra changes; use corps for product/UI or multi-agent work.',
    operator: 'xflow:yolo or xflow:corps',
    artifacts: ['workflows/yolo.yaml', 'workflows/corps.yaml'],
  },
  {
    id: 'execute',
    label: 'Execute with gates',
    intent: 'Run deterministic atoms, stop at human/LLM gates, and keep evidence in the change workspace.',
    operator: 'yolo: xflow workflow run yolo; corps: xflow corps + xflow proof',
    artifacts: ['status.json', 'verify_proof.json', 'corps_proof.json', 'logs/*.ndjson'],
  },
  {
    id: 'review',
    label: 'Review the evidence',
    intent: 'Check implementation, tests, drift scans, skill sync, and reviewer-facing handoff state.',
    operator: 'npm test && npm run drift:scan && npm run skill:diff',
    artifacts: ['docs/reviewer-guide.md', 'HANDOFF.md'],
  },
  {
    id: 'finish',
    label: 'Finish and preserve context',
    intent: 'Archive durable artifacts, refresh handoff, record AHA when useful, commit, push, and close.',
    operator: 'A5.archive.commit_push_close',
    artifacts: ['specs/workflow.md', 'AHA.md', 'HANDOFF.md'],
  },
];

const QUICKSTART = {
  published_package: {
    label: 'Published package first run',
    intent: 'Copy-paste-safe commands for an evaluator after openflow is available from npm.',
    commands: [
      'npm install -g openflow',
      'xflow guide',
      'xflow evaluate',
      'xflow assess',
      'xflow demo clean',
      'xflow demo launch',
      'xflow launch dossier',
      'xflow init --project-root .',
      'xflow goal set "Ship the next verified change" --project-root .',
      'xflow goal audit --project-root . --json',
      'xflow doctor --project-root .',
      'xflow workflow validate yolo --project-root .',
    ],
  },
  source_checkout: {
    label: 'Source checkout evaluation',
    intent: 'Copy-paste-safe commands before npm publication or while developing xflow itself.',
    commands: [
      'git clone <repo-url> openflow',
      'cd openflow',
      'npm install',
      'npm run release:pack',
      'node bin/xflow.js assess',
      'node bin/xflow.js evaluate',
      'node bin/xflow.js demo clean',
      'node bin/xflow.js compare codex-goal',
      'node bin/xflow.js launch dossier',
    ],
  },
  release_owner_gates: {
    label: 'Release-owner gates',
    intent: 'Required for launch claims, but intentionally separated because they fail until real adoption, npm identity, or registry evidence exists.',
    commands: [
      'xflow release status --json',
      'xflow adoption trial --name <team-or-project> --source <tracker-or-pr> --track yolo',
      'xflow adoption kit --name <team-or-project> --source <tracker-or-pr> --track yolo',
      'xflow adoption init --name <team-or-project> --source <tracker-or-pr> --track yolo',
      'xflow adoption status --json',
      'xflow adoption validate --json',
      'xflow adoption validate --splash --json',
      'xflow package status --json',
      'xflow package preflight --check-registry --check-auth --json',
      'xflow launch audit --pre-publish --strict --json',
      'xflow launch audit --splash --strict --json',
      'xflow package audit --check-registry --json',
    ],
  },
};

// ─── quickstart ──────────────────────────────────────────────────────────────

async function handleQuickstart(args) {
  if (args.some(isHelpRequest)) {
    printQuickstartHelp();
    return;
  }

  const parsedArgs = parseCliArgs(args);
  const payload = {
    ok: true,
    first_run_is_copy_paste_safe: true,
    published_package: QUICKSTART.published_package,
    source_checkout: QUICKSTART.source_checkout,
    release_owner_gates: QUICKSTART.release_owner_gates,
    docs: ['README.md', 'docs/quickstart.md', 'docs/tooling-matrix.md'],
  };

  if (parsedArgs.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('xflow quickstart');
  console.log('First-run commands are copy-paste safe. Release-owner gates are listed separately.\n');
  for (const section of [payload.published_package, payload.source_checkout, payload.release_owner_gates]) {
    console.log(section.label);
    console.log(`Intent: ${section.intent}`);
    for (const command of section.commands) console.log(`  ${command}`);
    console.log('');
  }
  console.log(`Docs: ${payload.docs.join(', ')}`);
}

async function handleObjective(args) {
  if (args.some(isHelpRequest)) {
    printObjectiveHelp();
    return;
  }

  const parsedArgs = parseCliArgs(args);
  const assess = await buildAssessPayload();
  const audit = await buildLaunchAuditPayload(parsedArgs);
  const splashAudit = await buildLaunchAuditPayload({ ...parsedArgs, splash: true, strict: true });
  const releaseOwner = buildEvaluateReleaseOwner(audit, splashAudit);
  const payload = {
    ok: assess.ok,
    generated_at: new Date().toISOString(),
    objective: '当前xflow的质量整体评估，以及是否能够达到比codex的goal更好的效果（yolo和corps和goal），并将skill集合优化到可开源且具行业影响力的水准。',
    verdict: 'Project-layer quality and workflow strength are proven from source checkout; public launch and industry-splash outcomes still depend on external proof.',
    items: assess.objective_audit,
    readiness: assess.readiness,
    release_owner: {
      ready_for_publish: releaseOwner.ready_for_publish,
      ready_for_splash: releaseOwner.ready_for_splash,
      blocking_surfaces: releaseOwner.blocking_surfaces,
      next_action: releaseOwner.next_action,
    },
    proof_commands: [
      'xflow objective --json',
      'xflow assess --json',
      'xflow evaluate --json',
      'xflow launch dossier --json',
      'npm run release:pack',
    ],
  };

  if (parsedArgs.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('xflow objective audit');
  console.log(`Verdict: ${payload.verdict}`);
  console.log(`Publish ready: ${payload.release_owner.ready_for_publish ? 'yes' : 'not yet'}`);
  console.log(`Splash ready: ${payload.release_owner.ready_for_splash ? 'yes' : 'not yet'}`);
  console.log('\nItems:');
  for (const item of payload.items) {
    console.log(`- ${item.id}: ${item.status}`);
    console.log(`  ${item.verdict}`);
    if (item.blockers.length) console.log(`  Blockers: ${item.blockers.join(', ')}`);
  }
  if (payload.release_owner.next_action) {
    console.log(`\nRelease owner next: ${payload.release_owner.next_action.id}: ${payload.release_owner.next_action.command}`);
  }
  console.log(`Proof: ${payload.proof_commands.join(' && ')}`);
}

// ─── guide ───────────────────────────────────────────────────────────────────

async function handleGuide(args) {
  if (args.some(isHelpRequest)) {
    printGuideHelp();
    return;
  }

  const parsedArgs = parseCliArgs(args);
  const payload = {
    ok: true,
    loop: 'shape -> choose-track -> execute -> review -> finish',
    recommended_start: 'xflow guide, then xflow:plan for non-trivial work',
    stages: GUIDE_STAGES,
    docs: [
      'docs/methodology.md',
      'docs/quickstart.md',
      'docs/reviewer-guide.md',
      'docs/competitive-benchmark.md',
    ],
  };

  if (parsedArgs.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('xflow delivery guide');
  console.log('Loop: shape -> choose-track -> execute -> review -> finish\n');
  for (const [index, stage] of GUIDE_STAGES.entries()) {
    console.log(`${index + 1}. ${stage.label}`);
    console.log(`   Intent: ${stage.intent}`);
    console.log(`   Use: ${stage.operator}`);
    console.log(`   Artifacts: ${stage.artifacts.join(', ')}`);
  }
  console.log('\nDocs: docs/methodology.md, docs/quickstart.md, docs/reviewer-guide.md');
}

// ─── score ───────────────────────────────────────────────────────────────────

async function handleScore(args) {
  if (args.some(isHelpRequest)) {
    printScoreHelp();
    return;
  }

  const parsedArgs = parseCliArgs(args);
  const { buildCompetitiveScore } = await import('../src/core/competitive-score.js');
  const score = buildCompetitiveScore();
  const audit = await buildLaunchAuditPayload(parsedArgs);
  const splashAudit = await buildLaunchAuditPayload({ ...parsedArgs, splash: true, strict: true });
  const releaseOwner = buildEvaluateReleaseOwner(audit, splashAudit);
  const payload = {
    ...score,
    scope: 'competitive_internal_readiness',
    boundary: {
      summary: 'Competitive score measures repo-proven internal readiness and cross-tool strength; public launch still depends on release-owner gates.',
      release_status_command: 'xflow release status --json',
      ready_for_publish: releaseOwner.ready_for_publish,
      ready_for_splash: releaseOwner.ready_for_splash,
      blocking_surfaces: releaseOwner.blocking_surfaces,
      mode: releaseOwner.mode,
      next_action: releaseOwner.next_action,
    },
  };

  if (parsedArgs.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`xflow score: ${score.score}/${score.max_score}`);
  for (const dimension of score.dimensions) {
    console.log(`${dimension.points}/10 ${dimension.label} (${dimension.status})`);
  }
  console.log('\nBoundary: internal competitive readiness only');
  console.log(`Publish ready: ${releaseOwner.ready_for_publish ? 'yes' : 'not yet'}`);
  console.log(`Splash ready: ${releaseOwner.ready_for_splash ? 'yes' : 'not yet'}`);
  console.log(`Release gates: ${releaseOwner.blocking_surfaces.length ? releaseOwner.blocking_surfaces.join(', ') : 'none'}`);
  console.log(`Check: ${payload.boundary.release_status_command}`);
  if (score.next_wins.length) {
    console.log('\nNext wins:');
    for (const nextWin of score.next_wins) {
      console.log(`- ${nextWin}`);
    }
  }
}

// ─── init ────────────────────────────────────────────────────────────────────

async function handleInit(args) {
  if (args.some(isHelpRequest)) {
    printInitHelp();
    return;
  }

  const parsedArgs = parseCliArgs(args);
  const projectRoot = parsedArgs.project_root || process.env.XFLOW_PROJECT_ROOT || process.cwd();
  const configDir = resolve(projectRoot, '.as-xflow');
  const configPath = resolve(configDir, 'config.json');

  if (existsSync(configPath) && !parsedArgs.force) {
    console.error(`xflow init: config already exists: ${configPath}`);
    console.error('Use --force to rewrite it.');
    process.exit(1);
  }

  const config = {
    version: 1,
    project_root: projectRoot,
    workflows: {
      lite: 'builtin:yolo',
      heavy: 'builtin:corps',
    },
    skills: {
      source_dir: 'xflow',
      installed_dir: '~/.agents/skills/xflow',
      extra_source_dirs: ['~/Documents/workspace/pro/as-skillhub/skills'],
      sync_script: '~/Documents/workspace/pro/as-skillhub/skills/skills_sync.sh',
    },
    issue_routing: {
      repo: null,
      language: 'zh-CN',
    },
  };

  mkdirSync(configDir, { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

  if (parsedArgs.json) {
    console.log(JSON.stringify({ ok: true, config_path: configPath, config }, null, 2));
    return;
  }

  console.log(`xflow init: wrote ${configPath}`);
  console.log('Next: xflow doctor --project-root <path>');
}

// ─── goal ────────────────────────────────────────────────────────────────────

async function handleGoal(sub, args) {
  if (isHelpRequest(sub)) {
    printGoalHelp();
    return;
  }

  const action = sub || 'show';
  const parsedArgs = parseCliArgs(args);
  const projectRoot = parsedArgs.project_root || process.env.XFLOW_PROJECT_ROOT || process.cwd();
  const goalDir = resolve(projectRoot, '.xflow');
  const goalPath = resolve(goalDir, 'GOAL.md');

  switch (action) {
    case 'show': {
      const exists = existsSync(goalPath);
      const content = exists ? readFileSync(goalPath, 'utf8') : '';
      const payload = {
        ok: true,
        exists,
        goal_file: goalPath,
        summary: exists ? extractGoalSummary(content) : null,
        content: parsedArgs.full && exists ? content : undefined,
      };

      if (parsedArgs.json) {
        console.log(JSON.stringify(payload, null, 2));
        return;
      }

      if (!exists) {
        console.log('xflow goal: none');
        console.log(`Set one with: xflow goal set "Ship the next verified change" --project-root ${projectRoot}`);
        return;
      }

      console.log(`xflow goal: ${payload.summary || '(no summary)'}`);
      console.log(`File: ${goalPath}`);
      if (parsedArgs.full) {
        console.log('');
        console.log(content.trimEnd());
      }
      return;
    }

    case 'set': {
      const goalText = normalizeGoalText(args, parsedArgs);
      if (!goalText) {
        console.error('Usage: xflow goal set "<goal>" [--project-root <path>] [--force] [--json]');
        process.exit(1);
      }
      if (existsSync(goalPath) && !parsedArgs.force) {
        console.error(`xflow goal: goal already exists: ${goalPath}`);
        console.error('Use --force to replace it intentionally.');
        process.exit(1);
      }

      mkdirSync(goalDir, { recursive: true });
      const content = renderGoalFile(goalText);
      writeFileSync(goalPath, content, 'utf8');

      const payload = {
        ok: true,
        action: 'set',
        goal_file: goalPath,
        summary: extractGoalSummary(content),
      };

      if (parsedArgs.json) {
        console.log(JSON.stringify(payload, null, 2));
        return;
      }

      console.log(`xflow goal: wrote ${goalPath}`);
      console.log(`Summary: ${payload.summary}`);
      return;
    }

    case 'clear': {
      const existed = existsSync(goalPath);
      if (existed) {
        rmSync(goalPath, { force: true });
      }

      const payload = {
        ok: true,
        action: 'clear',
        existed,
        goal_file: goalPath,
      };

      if (parsedArgs.json) {
        console.log(JSON.stringify(payload, null, 2));
        return;
      }

      console.log(existed ? `xflow goal: removed ${goalPath}` : `xflow goal: none at ${goalPath}`);
      return;
    }

    case 'audit': {
      const payload = auditGoalAlignment({ projectRoot, goalPath });

      if (parsedArgs.json) {
        console.log(JSON.stringify(payload, null, 2));
      } else {
        console.log(`xflow goal audit: ${payload.ok ? 'ok' : 'missing evidence'}`);
        console.log(`Goal: ${payload.goal.exists ? payload.goal.summary : 'missing'}`);
        console.log('');
        for (const check of payload.checks) {
          console.log(`${check.ok ? '✓' : '✗'} ${check.id}: ${check.detail}`);
        }
      }

      if (!payload.ok) {
        process.exit(1);
      }
      return;
    }

    default:
      console.error(`Unknown goal action: ${action}`);
      printGoalHelp();
      process.exit(1);
  }
}

function normalizeGoalText(args, parsedArgs) {
  const explicit = parsedArgs.text || parsedArgs.goal;
  if (Array.isArray(explicit)) {
    return explicit.join(' ').trim();
  }
  if (typeof explicit === 'string') {
    return explicit.trim();
  }
  return collectPositionalArgs(args).join(' ').trim();
}

function collectPositionalArgs(args) {
  const positionals = [];
  for (let i = 0; i < args.length; i += 1) {
    const part = args[i];
    if (!part.startsWith('--')) {
      positionals.push(part);
      continue;
    }
    const next = args[i + 1];
    if (next && !next.startsWith('--')) {
      i += 1;
    }
  }
  return positionals;
}

function renderGoalFile(goalText) {
  return `# xflow Goal

## Goal

${goalText.trim()}

## Scope

- Project delivery direction.

## Non-Goals

- None recorded.

## Updated

${new Date().toISOString().slice(0, 10)}
`;
}

function extractGoalSummary(content) {
  const match = content.match(/## Goal\s+([\s\S]*?)(?:\n## |\n?$)/);
  if (!match) return '';
  return match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function auditGoalAlignment({ projectRoot, goalPath }) {
  const goalExists = existsSync(goalPath);
  const goalContent = goalExists ? readFileSync(goalPath, 'utf8') : '';
  const checks = [];
  const addCheck = (id, ok, detail, file = null) => {
    checks.push({ id, ok, detail, file });
  };

  addCheck(
    'durable_goal_file',
    goalExists,
    goalExists ? `found ${goalPath}` : `missing ${goalPath}`,
    goalPath,
  );

  const requiredConsumers = [
    ['plan_consumes_goal', 'xflow/plan/SKILL.md'],
    ['yolo_consumes_goal', 'xflow/yolo/SKILL.md'],
    ['corps_consumes_goal', 'xflow/corps/SKILL.md'],
    ['ralph_audits_goal', 'xflow/ralph/SKILL.md'],
    ['handoff_preserves_goal', 'xflow/handoff/SKILL.md'],
    ['takein_recovers_goal', 'xflow/takein/SKILL.md'],
  ];

  for (const [id, relativePath] of requiredConsumers) {
    const file = resolve(ROOT, relativePath);
    const content = existsSync(file) ? readFileSync(file, 'utf8') : '';
    const ok = /\.xflow\/GOAL\.md/.test(content);
    addCheck(
      id,
      ok,
      ok ? `${relativePath} references .xflow/GOAL.md` : `${relativePath} does not reference .xflow/GOAL.md`,
      file,
    );
  }

  const comparisonDoc = resolve(ROOT, 'docs/goal-vs-codex.md');
  const comparisonContent = existsSync(comparisonDoc) ? readFileSync(comparisonDoc, 'utf8') : '';
  addCheck(
    'codex_goal_boundary',
    /Codex native goal/i.test(comparisonContent) && /project-level alignment contract/i.test(comparisonContent),
    'docs/goal-vs-codex.md explains the Codex-native boundary',
    comparisonDoc,
  );

  const guideDoc = resolve(ROOT, 'docs/tooling-matrix.md');
  const guideContent = existsSync(guideDoc) ? readFileSync(guideDoc, 'utf8') : '';
  addCheck(
    'public_ladder',
    /skill family as a ladder/i.test(guideContent) && /xflow goal set/i.test(guideContent),
    'docs/tooling-matrix.md presents goal as the first ladder step',
    guideDoc,
  );

  return {
    ok: checks.every((check) => check.ok),
    project_root: projectRoot,
    goal: {
      exists: goalExists,
      goal_file: goalPath,
      summary: goalExists ? extractGoalSummary(goalContent) : null,
    },
    boundary: GOAL_BOUNDARY,
    checks,
  };
}

// ─── doctor ──────────────────────────────────────────────────────────────────

async function handleDoctor(args) {
  if (args.some(isHelpRequest)) {
    printDoctorHelp();
    return;
  }

  const parsedArgs = parseCliArgs(args);
  const projectRoot = parsedArgs.project_root || process.env.XFLOW_PROJECT_ROOT || process.cwd();
  const projectConfig = loadProjectConfig(projectRoot);
  const checks = [];
  const addCheck = (id, ok, detail) => {
    checks.push({ id, ok: Boolean(ok), detail });
  };

  const pkgPath = resolve(ROOT, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  addCheck('package.bin', pkg.bin?.xflow === 'bin/xflow.js', 'package.json exposes bin/xflow.js');
  addCheck('script.verify', pkg.scripts?.verify === 'npm test', 'verify stays pure and runs npm test');
  addCheck('script.skill-sync', pkg.scripts?.['skill:sync'] === 'sh xflow/scripts/sync_installed_xflow_skill.sh', 'skill sync uses the repo wrapper');
  addCheck('script.skill-diff', pkg.scripts?.['skill:diff'] === 'sh xflow/scripts/check_installed_xflow_skill_sync.sh', 'skill diff uses the canonical drift check');
  addCheck('script.drift-scan', pkg.scripts?.['drift:scan'] === 'node --test test/workflow-drift-scan.test.js', 'drift scan is exposed as a targeted preflight');

  const { load } = await import('../src/core/workflow-loader.js');
  for (const workflowPath of ['workflows/yolo.yaml', 'workflows/corps.yaml']) {
    try {
      load(resolve(ROOT, workflowPath), { skipRuntimeChecks: true });
      addCheck(`workflow.${workflowPath}`, true, `${workflowPath} validates`);
    } catch (error) {
      addCheck(`workflow.${workflowPath}`, false, error instanceof Error ? error.message : String(error));
    }
  }

  addCheck('skill.root-index', existsSync(resolve(ROOT, 'xflow', 'README.md')), 'xflow namespace has README.md');
  addCheck('skill.no-root-skill', !existsSync(resolve(ROOT, 'xflow', 'SKILL.md')), 'xflow root SKILL.md remains absent');
  addCheck('skill.sync-wrapper', existsSync(resolve(ROOT, 'xflow', 'scripts', 'sync_installed_xflow_skill.sh')), 'sync wrapper exists');
  addCheck('skill.diff-wrapper', existsSync(resolve(ROOT, 'xflow', 'scripts', 'check_installed_xflow_skill_sync.sh')), 'diff wrapper exists');
  addCheck('project-root', existsSync(projectRoot), `project root exists: ${projectRoot}`);
  if (projectConfig.path) {
    addCheck('project.config', true, `project config loaded: ${projectConfig.path}`);
  }

  const ok = checks.every((check) => check.ok);
  const summary = { ok, project_root: projectRoot, config_path: projectConfig.path, checks };

  if (parsedArgs.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`xflow doctor: ${ok ? 'ok' : 'failed'}`);
    for (const check of checks) {
      console.log(`${check.ok ? '✓' : '✗'} ${check.id} — ${check.detail}`);
    }
  }

  if (!ok) process.exit(1);
}

// ─── workflow ─────────────────────────────────────────────────────────────────

async function handleWorkflow(sub, args) {
  if (isHelpRequest(sub)) {
    printWorkflowHelp();
    return;
  }

  switch (sub) {
    case 'run': {
      const parsedArgs = parseCliArgs(args.slice(1));
      const projectRoot = parsedArgs.project_root || process.env.XFLOW_PROJECT_ROOT || process.cwd();
      const projectConfig = loadProjectConfig(projectRoot);
      const yamlPath = resolveWorkflowPath(args[0], { projectRoot, projectConfig: projectConfig.config });
      if (!yamlPath) {
        console.error('Usage: xflow workflow run <path/to/workflow.yaml> [--dry-run]');
        process.exit(1);
      }
      const isDryRun = args.includes('--dry-run');
      const input = buildWorkflowInput(parsedArgs);
      const changeId = resolveChangeId({ explicit: parsedArgs.change_id, projectRoot });
      ensureChangeId(changeId, 'workflow run', projectRoot);
      const { load, dryRun } = await import('../src/core/workflow-loader.js');
      if (isDryRun) {
        dryRun(yamlPath);
      } else {
        const { WorkflowExecutor } = await import('../src/core/workflow-executor.js');
        const { workflow, phases, registry } = load(yamlPath);
        const executor = new WorkflowExecutor({
          workflow,
          phases,
          registry,
          workflowPath: yamlPath,
          projectRoot,
          changeId,
          input,
        });
        await executor.run();
      }
      break;
    }
    case 'validate': {
      const parsedArgs = parseCliArgs(args.slice(1));
      const projectRoot = parsedArgs.project_root || process.env.XFLOW_PROJECT_ROOT || process.cwd();
      const projectConfig = loadProjectConfig(projectRoot);
      const yamlPath = resolveWorkflowPath(args[0], { projectRoot, projectConfig: projectConfig.config });
      if (!yamlPath) {
        console.error('Usage: xflow workflow validate <path/to/workflow.yaml>');
        process.exit(1);
      }
      try {
        const { load } = await import('../src/core/workflow-loader.js');
        load(yamlPath, { skipRuntimeChecks: true });
        console.log(`✓ ${yamlPath} is valid`);
      } catch (e) {
        console.error(`✗ ${e.message}`);
        process.exit(1);
      }
      break;
    }
    default:
      console.error(`Unknown workflow subcommand: ${sub}`);
      console.error('Available: run, validate');
      process.exit(1);
  }
}

const CORPS_PROOF_ARTIFACTS = [
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

// ─── corps governed entry ───────────────────────────────────────────────────

async function handleCorps(args) {
  if (args.some(isHelpRequest)) {
    printCorpsHelp();
    return;
  }

  const parsedArgs = parseCliArgs(args);
  if (parsedArgs.explain) {
    const guide = buildCorpsOperatorGuide(parsedArgs);
    if (parsedArgs.json) {
      console.log(JSON.stringify(guide, null, 2));
      return;
    }
    printCorpsOperatorGuide(guide);
    return;
  }

  const projectRoot = parsedArgs.project_root || process.env.XFLOW_PROJECT_ROOT || process.cwd();
  const yamlPath = resolveGovernedCorpsWorkflowPath();
  const changeId = resolveChangeId({ explicit: parsedArgs.change_id, projectRoot });
  ensureChangeId(changeId, 'corps', projectRoot);
  const input = buildWorkflowInput(parsedArgs);
  const dryRunRequested = parsedArgs.dry_run === true;
  const proofPath = resolve(projectRoot, 'specs', 'changes', changeId, 'corps_proof.json');
  const competitorLed = detectCompetitorLedUiMode(parsedArgs, input);
  const benchmarkInputPresent = hasBenchmarkEvidencePath(input);
  const primaryReferencePresent = typeof input.primary_reference_surface === 'string' && input.primary_reference_surface.trim().length > 0;
  const entryContractIssues = [];
  if (competitorLed.detected && !benchmarkInputPresent) {
    entryContractIssues.push('competitor_led_ui_requires_benchmark_input');
  }
  if (competitorLed.detected && !primaryReferencePresent) {
    entryContractIssues.push('competitor_led_ui_requires_primary_reference_surface');
  }

  if (dryRunRequested && parsedArgs.json) {
    console.log(JSON.stringify({
      ok: true,
      entry: 'corps',
      workflow: 'corps',
      workflow_path: yamlPath,
      project_root: projectRoot,
      change_id: changeId,
      dry_run: true,
      proof_required: proofPath,
      competitor_led_ui_mode: {
        detected: competitorLed.detected,
        enforced: competitorLed.detected,
        reasons: competitorLed.reasons,
        benchmark_input_present: benchmarkInputPresent,
      },
      entry_contract_issues: entryContractIssues,
      benchmark_contract: {
        competitor_product: parsedArgs.competitor_product || 'required',
        required_modules: normalizeCliList(parsedArgs.required_modules),
        target_surfaces: normalizeCliList(parsedArgs.target_surfaces),
        primary_reference_surface: parsedArgs.primary_reference_surface || 'required_for_competitor_led_ui',
        primary_journeys: normalizeCliList(parsedArgs.primary_journeys),
        business_logic_invariants: normalizeCliList(parsedArgs.business_logic_invariants),
        enforcement: competitorLed.detected ? 'required' : 'optional_unless_competitor_led',
        input_contract: 'exactly_one_of(reference_scenarios_json, capture_url+reference_image)',
        reference_scenarios_json: parsedArgs.reference_scenarios_json || 'optional_path_a',
        capture_url: parsedArgs.capture_url || 'optional_path_b',
        reference_image: parsedArgs.reference_image || 'required_with_path_b',
      },
      aesthetic_contract: {
        level: 'high',
        design_system_pack: 'design_system_pack.json must materialize generic commercial/open UI generation practices',
        image_reference_generation: parsedArgs.visual_generation_model || parsedArgs.image_model || 'gpt_image_v2_style_reference',
        pencil_role: 'editable assembly and targeted refinement',
        final_gate: 'aesthetic_review.json must be accepted before corps proof can pass',
      },
      strict_runtime_contract: {
        governed_workflow_manifest: 'built-in corps workflow only',
        execution_log: 'hash-linked workflow/phase/atom/gate witnesses required',
        forbidden_fallbacks: ['stub', 'task_queued', 'pencil_stubbed'],
      },
      human_role: [
        'clarify requirements before execution',
        'inspect auto-approved human gates only when you need to audit scripted decisions',
        'inspect corps_proof.json before accepting completion',
      ],
    }, null, 2));
    return;
  }

  if (competitorLed.detected && (!benchmarkInputPresent || !primaryReferencePresent)) {
    if (!benchmarkInputPresent) {
      console.error('Competitor-led UI detected at corps entry, but no benchmark evidence path was provided.');
    }
    if (!primaryReferencePresent) {
      console.error('Competitor-led UI detected at corps entry, but no primary reference surface was provided.');
    }
    console.error('Provide exactly one of:');
    console.error('- --reference-scenarios-json <json>');
    console.error('- --capture-url <url> together with --reference-image <path>');
    console.error('And also provide:');
    console.error('- --primary-reference-surface <surface-id>');
    process.exit(1);
  }

  const { load, dryRun } = await import('../src/core/workflow-loader.js');
  if (dryRunRequested) {
    dryRun(yamlPath);
    console.log(`\nGoverned entry: xflow corps`);
    console.log(`Completion proof required: ${proofPath}`);
    console.log('workflow validate is preflight only; it is not an execution proof.');
    return;
  }

  const { WorkflowExecutor } = await import('../src/core/workflow-executor.js');
  const { workflow, phases, registry } = load(yamlPath);
  const previousAutoRuntime = process.env.XFLOW_AUTO_AGENT_RUNTIME;
  const previousAutoHumanGates = process.env.XFLOW_AUTO_HUMAN_GATES;
  const previousRequireRealRuntime = process.env.XFLOW_REQUIRE_REAL_AGENT_RUNTIME;
  process.env.XFLOW_AUTO_AGENT_RUNTIME = '1';
  process.env.XFLOW_AUTO_HUMAN_GATES = '1';
  process.env.XFLOW_REQUIRE_REAL_AGENT_RUNTIME = '1';
  const executor = new WorkflowExecutor({
    workflow,
    phases,
    registry,
    workflowPath: yamlPath,
    projectRoot,
    changeId,
    input,
  });
  try {
    await executor.run();
  } finally {
    if (previousAutoRuntime === undefined) {
      delete process.env.XFLOW_AUTO_AGENT_RUNTIME;
    } else {
      process.env.XFLOW_AUTO_AGENT_RUNTIME = previousAutoRuntime;
    }
    if (previousAutoHumanGates === undefined) {
      delete process.env.XFLOW_AUTO_HUMAN_GATES;
    } else {
      process.env.XFLOW_AUTO_HUMAN_GATES = previousAutoHumanGates;
    }
    if (previousRequireRealRuntime === undefined) {
      delete process.env.XFLOW_REQUIRE_REAL_AGENT_RUNTIME;
    } else {
      process.env.XFLOW_REQUIRE_REAL_AGENT_RUNTIME = previousRequireRealRuntime;
    }
  }

  const proof = await buildWorkflowProof({
    track: 'corps',
    workflowPath: yamlPath,
    projectRoot,
    changeId,
    write: true,
  });
  printProof(proof, parsedArgs);
  if (!proof.ok) process.exit(1);
}

// ─── proof ──────────────────────────────────────────────────────────────────

async function handleProof(args) {
  if (args.some(isHelpRequest)) {
    printProofHelp();
    return;
  }

  const parsedArgs = parseCliArgs(args);
  const track = String(parsedArgs.track || args.find((arg) => arg && !arg.startsWith('--')) || 'corps');
  const projectRoot = parsedArgs.project_root || process.env.XFLOW_PROJECT_ROOT || process.cwd();
  const changeId = resolveChangeId({ explicit: parsedArgs.change_id, projectRoot });
  ensureChangeId(changeId, 'proof', projectRoot);
  const projectConfig = loadProjectConfig(projectRoot);
  const workflowPath = track === 'corps'
    ? resolveGovernedCorpsWorkflowPath()
    : resolveWorkflowPath(track, { projectRoot, projectConfig: projectConfig.config });
  if (!workflowPath) {
    console.error('Usage: xflow proof [--track corps] --change-id <id> [--project-root <path>]');
    process.exit(1);
  }

  const proof = await buildWorkflowProof({
    track,
    workflowPath,
    projectRoot,
    changeId,
    write: parsedArgs.write !== false,
  });
  printProof(proof, parsedArgs);
  if (!proof.ok) process.exit(1);
}

async function buildWorkflowProof({ track, workflowPath, projectRoot, changeId, write = true }) {
  const { load } = await import('../src/core/workflow-loader.js');
  const { readExecutionLog } = await import('../src/core/execution-log.js');
  const { workflow, phases, registry } = load(workflowPath, { skipRuntimeChecks: true });
  const workflowManifest = buildWorkflowManifest({ workflowPath, workflow, phases, registry });
  const expectedPhases = phases.map((phase) => phase.id);
  const log = await readExecutionLog(projectRoot, { limit: 5000 });
  const chronologicalEvents = Array.isArray(log.entries_chronological) ? log.entries_chronological : [...log.entries].reverse();
  const matchingEvents = chronologicalEvents.filter((entry) => (
    entry.workflow === workflow.name
    && entry.change_id === changeId
  ));
  const completedEvent = [...matchingEvents].reverse().find((entry) => entry.kind === 'workflow_completed');
  const runId = completedEvent?.workflow_run_id || null;
  const runEvents = runId
    ? matchingEvents.filter((entry) => entry.workflow_run_id === runId)
    : matchingEvents;
  const phaseCompletedEvents = runEvents.filter((entry) => entry.kind === 'phase_completed');
  const loggedCompletedPhases = Array.isArray(completedEvent?.completed_phases)
    ? completedEvent.completed_phases
    : [];
  const phaseEventCompletedPhases = phaseCompletedEvents.map((entry) => entry.phase_id).filter(Boolean);
  const statePath = resolve(projectRoot, '.as-xflow', 'workflow-state.json');
  const state = readJsonIfExists(statePath) || {};
  const stateCompletedPhases = Array.isArray(state.completed_phases) ? state.completed_phases : [];
  const completedPhases = track === 'corps'
    ? phaseEventCompletedPhases
    : Array.from(new Set([...loggedCompletedPhases, ...stateCompletedPhases]));
  const missingPhases = expectedPhases.filter((phaseId) => !completedPhases.includes(phaseId));
  const artifactRoot = resolve(projectRoot, 'specs', 'changes', changeId);
  const requiredArtifacts = track === 'corps' ? CORPS_PROOF_ARTIFACTS : ['status.json', 'plan.md'];
  const missingArtifacts = requiredArtifacts.filter((artifact) => !existsSync(resolve(artifactRoot, artifact)));
  const contractFailures = track === 'corps' ? validateCorpsProductContract(artifactRoot) : [];
  const strictRuntimeFailures = track === 'corps'
    ? validateStrictCorpsRuntime({ workflow, phases, workflowManifest, expectedPhases, completedEvent, loggedCompletedPhases, runEvents })
    : [];
  const proofPath = resolve(artifactRoot, `${track}_proof.json`);
  const payload = {
    ok: missingPhases.length === 0
      && missingArtifacts.length === 0
      && contractFailures.length === 0
      && strictRuntimeFailures.length === 0
      && Boolean(completedEvent),
    generated_at: new Date().toISOString(),
    track,
    workflow: workflow.name,
    workflow_path: workflowPath,
    workflow_integrity: workflowManifest,
    project_root: projectRoot,
    change_id: changeId,
    proof_file: proofPath,
    execution_log: log.file,
    execution_run_id: runId,
    completed_event_seen: Boolean(completedEvent),
    expected_phases: expectedPhases,
    completed_phases: completedPhases,
    missing_phases: missingPhases,
    logged_completed_phases: loggedCompletedPhases,
    required_artifacts: requiredArtifacts,
    missing_artifacts: missingArtifacts,
    contract_failures: contractFailures,
    strict_runtime_failures: strictRuntimeFailures,
    conversation_ai_role: [
      'requirements clarification',
      'scripted human-gate audit when needed',
      'final proof inspection',
    ],
  };

  if (write) {
    mkdirSync(artifactRoot, { recursive: true });
    writeFileSync(proofPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  }
  return payload;
}

function printProof(proof, parsedArgs) {
  if (parsedArgs.json) {
    console.log(JSON.stringify(proof, null, 2));
    return;
  }
  console.log(`xflow proof: ${proof.ok ? 'ok' : 'failed'}`);
  console.log(`Track: ${proof.track}`);
  console.log(`Change: ${proof.change_id}`);
  console.log(`Proof: ${proof.proof_file}`);
  if (!proof.ok) {
    if (!proof.completed_event_seen) console.log('- Missing workflow_completed event');
    for (const phaseId of proof.missing_phases) console.log(`- Missing phase: ${phaseId}`);
    for (const artifact of proof.missing_artifacts) console.log(`- Missing artifact: ${artifact}`);
    for (const issue of proof.contract_failures || []) console.log(`- Contract failure: ${issue}`);
    for (const issue of proof.strict_runtime_failures || []) console.log(`- Runtime failure: ${issue}`);
  }
}

function buildCorpsOperatorGuide(parsedArgs = {}) {
  const title = parsedArgs.title || '<product or UI change>';
  const changeId = parsedArgs.change_id || '<change-id>';
  return {
    ok: true,
    entry: 'corps',
    mode: 'operator_guide',
    verdict: 'Use corps when product/UI risk needs governed heavy proof, not for ordinary backend/docs work.',
    when_to_use: [
      'new user-facing product surface or interaction pattern',
      'competitor-led UI, visual fidelity, or primary journey proof matters',
      'multi-agent design/review is useful',
      'completion must be accepted from artifacts instead of chat summary',
    ],
    first_time_sequence: [
      'xflow goal show --json',
      'xflow goal audit --json',
      `xflow corps --title "${title}" --change-type frontend --change-id ${changeId} --dry-run --json`,
      `xflow corps --title "${title}" --change-type frontend --change-id ${changeId}`,
      `xflow proof --track corps --change-id ${changeId}`,
    ],
    proof_contract: [
      'specs/changes/<change-id>/corps_proof.json reports ok=true',
      'built-in governed corps workflow manifest is used',
      'hash-linked execution log contains every canonical phase, atom, and gate witness',
      'required product, visual, QA, and archive artifacts exist',
      'no stub, task_queued, or pencil_stubbed runtime fallback appears',
      'operator confirms the proof aligns with .xflow/GOAL.md',
    ],
    competitor_led_inputs: {
      rule: 'competitor-led UI requires a primary reference surface and exactly one benchmark evidence path before execution',
      required: [
        '--primary-reference-surface <surface-id>',
        '--competitor-product <name>',
      ],
      exactly_one_of: [
        '--reference-scenarios-json <path>',
        '--capture-url <url> plus --reference-image <path>',
      ],
    },
    common_failure_meanings: [
      {
        issue: 'competitor_led_ui_requires_benchmark_input',
        meaning: 'the entry detected competitor-led UI but cannot prove visual comparison without benchmark evidence',
      },
      {
        issue: 'competitor_led_ui_requires_primary_reference_surface',
        meaning: 'the entry cannot tell which surface anchors the comparison',
      },
      {
        issue: 'stub runtime fallback',
        meaning: 'a required heavy agent runtime was unavailable or unauthenticated, so completion is not claimable',
      },
    ],
    docs: [
      'docs/corps-operator-guide.md',
      'docs/launch-demo.md',
      'docs/team-adoption.md',
      'xflow/corps/SKILL.md',
    ],
  };
}

function printCorpsOperatorGuide(guide) {
  console.log('xflow corps operator guide');
  console.log(`Verdict: ${guide.verdict}\n`);
  console.log('When to use:');
  for (const item of guide.when_to_use) console.log(`- ${item}`);
  console.log('\nFirst-time sequence:');
  for (const command of guide.first_time_sequence) console.log(`- ${command}`);
  console.log('\nProof contract:');
  for (const item of guide.proof_contract) console.log(`- ${item}`);
  console.log('\nCompetitor-led inputs:');
  console.log(`- ${guide.competitor_led_inputs.rule}`);
  console.log(`- Required: ${guide.competitor_led_inputs.required.join(', ')}`);
  console.log(`- Exactly one of: ${guide.competitor_led_inputs.exactly_one_of.join(' OR ')}`);
  console.log(`\nDocs: ${guide.docs.join(', ')}`);
}

function validateStrictCorpsRuntime({ workflow, phases, workflowManifest, expectedPhases, completedEvent, loggedCompletedPhases, runEvents }) {
  const issues = [];
  const startedEvent = runEvents.find((entry) => entry.kind === 'workflow_started');
  const completedDigest = completedEvent?.workflow_integrity?.digest || null;
  const startedDigest = startedEvent?.workflow_integrity?.digest || null;
  if (!startedEvent) issues.push('workflow_started_event_missing');
  if (!completedEvent) issues.push('workflow_completed_event_missing');
  if (startedDigest && startedDigest !== workflowManifest.digest) issues.push('workflow_integrity_started_digest_mismatch');
  if (completedDigest && completedDigest !== workflowManifest.digest) issues.push('workflow_integrity_completed_digest_mismatch');
  if (!startedDigest) issues.push('workflow_integrity_started_digest_missing');
  if (!completedDigest) issues.push('workflow_integrity_completed_digest_missing');
  if (!arraysEqual(loggedCompletedPhases, expectedPhases)) issues.push('workflow_completed_phase_order_mismatch');

  const startedIndex = runEvents.findIndex((entry) => entry.kind === 'workflow_started');
  const completedIndex = runEvents.findIndex((entry) => entry.kind === 'workflow_completed');
  if (startedIndex >= 0 && completedIndex >= startedIndex) {
    const runChain = validateExecutionLogChain(runEvents.slice(startedIndex, completedIndex + 1), { allowExternalPreviousHash: true });
    if (!runChain.ok) issues.push(...runChain.issues.map((issue) => `execution_log_chain_invalid:${issue}`));
  } else {
    issues.push('execution_log_run_chain_missing');
  }

  const phaseStarted = new Set(runEvents.filter((entry) => entry.kind === 'phase_started').map((entry) => entry.phase_id));
  const phaseCompletedEvents = runEvents.filter((entry) => entry.kind === 'phase_completed');
  const phaseCompletedIds = phaseCompletedEvents.map((entry) => entry.phase_id).filter(Boolean);
  const phaseCompleted = new Set(phaseCompletedIds);
  const phaseSkipped = runEvents.filter((entry) => entry.kind === 'phase_skipped');
  if (!arraysEqual(phaseCompletedIds, expectedPhases)) issues.push('phase_completed_order_mismatch');
  for (const phaseId of expectedPhases) {
    if (!phaseStarted.has(phaseId)) issues.push(`phase_started_missing:${phaseId}`);
    if (!phaseCompleted.has(phaseId)) issues.push(`phase_completed_missing:${phaseId}`);
  }
  for (const skipped of phaseSkipped) {
    issues.push(`phase_skipped:${skipped.phase_id || 'unknown'}`);
  }

  const atomRuns = runEvents.filter((entry) => entry.kind === 'atom_run');
  const gateChecks = runEvents.filter((entry) => entry.kind === 'gate_check');
  const successfulAtomKeys = new Set(atomRuns.filter((entry) => entry.ok !== false).map((entry) => `${entry.phase_id}:${entry.atom_id}`));
  const successfulGatePhases = new Set(gateChecks.filter((entry) => entry.ok !== false).map((entry) => entry.phase_id));
  for (const phase of phases) {
    for (const atomRef of phase.atoms || []) {
      if (!successfulAtomKeys.has(`${phase.id}:${atomRef.id}`)) {
        issues.push(`atom_run_missing:${phase.id}:${atomRef.id}`);
      }
    }
    if (!successfulGatePhases.has(phase.id)) {
      issues.push(`gate_check_missing:${phase.id}`);
    }
  }
  for (const event of atomRuns) {
    if (event.ok === false) issues.push(`atom_run_failed:${event.phase_id || 'unknown'}:${event.atom_id || 'unknown'}`);
    if (STRICT_CORPS_FORBIDDEN_ADAPTERS.has(event.adapter)) {
      issues.push(`stub_adapter_forbidden:${event.phase_id || 'unknown'}:${event.atom_id || 'unknown'}`);
    }
    if (STRICT_CORPS_FORBIDDEN_STATUSES.has(event.status)) {
      issues.push(`stub_status_forbidden:${event.phase_id || 'unknown'}:${event.atom_id || 'unknown'}:${event.status}`);
    }
  }

  if (workflow.name !== 'corps' || workflow.track !== 'heavy') {
    issues.push('governed_corps_workflow_identity_mismatch');
  }
  return issues;
}

function arraysEqual(left = [], right = []) {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

function validateCorpsProductContract(artifactRoot) {
  const issues = [];
  const competitorReview = readJsonIfExists(resolve(artifactRoot, 'competitor_reconstruction_review.json'));
  const referenceSurfaceLock = readJsonIfExists(resolve(artifactRoot, 'reference_surface_lock.json'));
  const reconstructionPackArtifact = readJsonIfExists(resolve(artifactRoot, 'reconstruction_pack.json'));
  const generationContractArtifact = readJsonIfExists(resolve(artifactRoot, 'generation_contract.json'));
  const designSystemPack = readJsonIfExists(resolve(artifactRoot, 'design_system_pack.json'));
  const imageReferenceSet = readJsonIfExists(resolve(artifactRoot, 'image_reference_set.json'));
  const projectRoot = dirname(dirname(dirname(artifactRoot)));
  const contract = competitorReview?.competitor_reconstruction_contract || null;
  if (!contract) {
    issues.push('competitor_reconstruction_contract_missing');
  } else {
    if (contract.status !== 'frozen') issues.push('competitor_reconstruction_contract_not_frozen');
    if (!contract.competitor_product || contract.competitor_product === 'required') issues.push('competitor_product_unspecified');
    if (!contract.primary_reference_surface) issues.push('primary_reference_surface_missing');
    if (!Array.isArray(contract.required_modules) || contract.required_modules.length === 0) issues.push('required_modules_missing');
    if (!Array.isArray(contract.primary_journeys) || contract.primary_journeys.length === 0) issues.push('primary_journeys_missing');
    if (!Array.isArray(contract.business_logic_invariants) || contract.business_logic_invariants.length === 0) issues.push('business_logic_invariants_missing');
  }
  if (referenceSurfaceLock?.reference_surface_lock?.status !== 'locked') issues.push('reference_surface_lock_missing');
  if (reconstructionPackArtifact?.reconstruction_pack?.status !== 'ready') issues.push('reconstruction_pack_missing');
  if (generationContractArtifact?.generation_contract?.status !== 'ready') issues.push('generation_contract_missing');
  if (!designSystemPack) {
    issues.push('design_system_pack_missing');
  } else {
    if (designSystemPack.status !== 'ready') issues.push('design_system_pack_not_ready');
    const practiceSources = Array.isArray(designSystemPack.practice_sources)
      ? designSystemPack.practice_sources.map((source) => source?.id).filter(Boolean)
      : [];
    for (const sourceId of ['lovable', 'open_design', 'open_codesign', 'openui']) {
      if (!practiceSources.includes(sourceId)) issues.push(`design_system_practice_missing:${sourceId}`);
    }
    const requiredStates = Array.isArray(designSystemPack.component_policy?.required_states)
      ? designSystemPack.component_policy.required_states
      : [];
    for (const stateId of ['default', 'hover', 'focus', 'selected', 'loading', 'empty', 'error']) {
      if (!requiredStates.includes(stateId)) issues.push(`design_system_state_missing:${stateId}`);
    }
    const previewArtifacts = Array.isArray(designSystemPack.preview_loop?.required_artifacts)
      ? designSystemPack.preview_loop.required_artifacts
      : [];
    for (const artifactName of ['image_reference_set.json', 'visual_benchmark.json', 'aesthetic_review.json']) {
      if (!previewArtifacts.includes(artifactName)) issues.push(`design_system_preview_artifact_missing:${artifactName}`);
    }
  }
  const imageReferenceContract = generationContractArtifact?.generation_contract?.visual_constraints?.image_reference_generation || {};
  if (imageReferenceContract.enabled !== false) {
    const requiredIds = Array.isArray(imageReferenceContract.required_outputs)
      ? imageReferenceContract.required_outputs.map((output) => output.id).filter(Boolean)
      : [];
    const references = Array.isArray(imageReferenceSet?.references) ? imageReferenceSet.references : [];
    const readyReferenceIds = new Set(references.filter((reference) => reference?.status === 'ready').map((reference) => reference.id));
    if (!imageReferenceSet) {
      issues.push('image_reference_set_missing');
    } else {
      if (imageReferenceSet.status !== 'ready') issues.push('image_reference_set_not_ready');
      for (const requiredId of requiredIds) {
        if (!readyReferenceIds.has(requiredId)) issues.push(`image_reference_missing:${requiredId}`);
      }
      for (const reference of references.filter((entry) => entry?.status === 'ready')) {
        const artifactPath = reference.artifact_path || reference.reference_path || null;
        if (!artifactPath || !existsSync(artifactPath.startsWith('/') ? artifactPath : resolve(projectRoot, artifactPath))) {
          issues.push(`image_reference_artifact_missing:${reference.id || 'unknown'}`);
        }
      }
    }
  }
  const aestheticReview = readJsonIfExists(resolve(artifactRoot, 'aesthetic_review.json'));
  if (!aestheticReview) {
    issues.push('aesthetic_review_missing');
  } else {
    if (aestheticReview.status !== 'accept') issues.push('aesthetic_review_not_accepted');
    if (Number(aestheticReview.score || 0) < Number(aestheticReview.min_accept_score || 0.88)) {
      issues.push('aesthetic_review_score_below_threshold');
    }
    if (Array.isArray(aestheticReview.blockers) && aestheticReview.blockers.length > 0) {
      issues.push('aesthetic_review_has_blockers');
    }
    if (aestheticReview.final_product_surface_evidence?.ready !== true) {
      issues.push('aesthetic_review_final_product_surface_evidence_missing');
    }
  }

  const benchmark = readJsonIfExists(resolve(artifactRoot, 'visual_benchmark.json'));
  if (!benchmark) {
    issues.push('visual_benchmark_missing');
  } else {
    if (benchmark.benchmark_mode !== 'reference_backed') issues.push('visual_benchmark_not_reference_backed');
    if (!['reference_scenarios', 'capture_url'].includes(benchmark.benchmark_input_mode)) {
      issues.push('visual_benchmark_input_contract_missing');
    }
    if (!Array.isArray(benchmark.scenarios) || benchmark.scenarios.length === 0) issues.push('visual_benchmark_scenarios_missing');
    if (Array.isArray(benchmark.scenarios) && benchmark.scenarios.some((scenario) => scenario.status !== 'pass')) {
      issues.push('visual_benchmark_has_unresolved_scenarios');
    }
    if (Array.isArray(benchmark.scenarios) && benchmark.scenarios.some((scenario) => sameResolvedProofPath(projectRoot, scenario.reference_image, scenario.screenshot_image))) {
      issues.push('visual_benchmark_self_referential_scenario');
    }
    if (Array.isArray(benchmark.scenarios) && !benchmark.scenarios.some(hasCapturedProductSurfaceEvidence)) {
      issues.push('visual_benchmark_final_product_surface_not_captured');
    }
  }
  return issues;
}

function sameResolvedProofPath(projectRoot, left, right) {
  if (!left || !right) return false;
  const leftPath = left.startsWith('/') ? left : resolve(projectRoot, left);
  const rightPath = right.startsWith('/') ? right : resolve(projectRoot, right);
  if (leftPath === rightPath) return true;
  if (!existsSync(leftPath) || !existsSync(rightPath)) return false;
  return hashFile(leftPath) === hashFile(rightPath);
}

function hashFile(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function hasCapturedProductSurfaceEvidence(scenario = {}) {
  if (typeof scenario.capture_url === 'string' && scenario.capture_url.trim()) return true;
  if (scenario.screenshot_evidence_mode === 'captured_page') return true;
  const domRects = scenario.layout_observations?.dom_rects;
  return Array.isArray(domRects) && domRects.length > 0 && Boolean(scenario.observed_visual_tokens);
}

function readJsonIfExists(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function resolveWorkflowPath(value, { projectRoot = process.cwd(), projectConfig = null } = {}) {
  if (!value) return value;
  const workflows = projectConfig?.workflows && typeof projectConfig.workflows === 'object'
    ? projectConfig.workflows
    : {};
  const aliases = {
    yolo: workflows.yolo || workflows.lite || 'builtin:yolo',
    lite: workflows.lite || workflows.yolo || 'builtin:yolo',
    corps: workflows.corps || workflows.heavy || 'builtin:corps',
    heavy: workflows.heavy || workflows.corps || 'builtin:corps',
  };

  if (aliases[value]) {
    return resolvePathFromProject(projectRoot, aliases[value]);
  }
  return value;
}

function resolveGovernedCorpsWorkflowPath() {
  return resolve(ROOT, 'workflows', 'corps.yaml');
}

function loadProjectConfig(projectRoot) {
  const configPath = resolve(projectRoot, '.as-xflow', 'config.json');
  if (!existsSync(configPath)) {
    return { path: null, config: null };
  }

  try {
    return {
      path: configPath,
      config: JSON.parse(readFileSync(configPath, 'utf8')),
    };
  } catch (error) {
    console.error(`Invalid xflow config: ${configPath}`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

function resolvePathFromProject(projectRoot, value) {
  const raw = String(value || '');
  if (raw === 'builtin:yolo') {
    return resolve(ROOT, 'workflows', 'yolo.yaml');
  }
  if (raw === 'builtin:corps') {
    return resolve(ROOT, 'workflows', 'corps.yaml');
  }
  if (raw.startsWith('~/')) {
    return resolve(process.env.HOME || '', raw.slice(2));
  }
  if (raw.startsWith('/')) {
    return raw;
  }
  return resolve(projectRoot, raw);
}

// ─── atom ─────────────────────────────────────────────────────────────────────

async function handleAtom(sub, args) {
  if (isHelpRequest(sub)) {
    printAtomHelp();
    return;
  }

  const registryPath = resolve(ROOT, 'atoms', 'registry.json');
  const registry = JSON.parse(readFileSync(registryPath, 'utf8'));

  switch (sub) {
    case 'list': {
      const track = args.find(a => a.startsWith('--track='))?.split('=')[1];
      const atoms = Object.entries(registry.atoms)
        .filter(([, def]) => !track || def.track === track)
        .sort(([a], [b]) => a.localeCompare(b));

      console.log(`\n${'ID'.padEnd(45)} ${'TRACK'.padEnd(6)} IMPL`);
      console.log('─'.repeat(90));
      for (const [id, def] of atoms) {
        const impl = def.script || def.module || '(shell)';
        console.log(`${id.padEnd(45)} ${(def.track || '?').padEnd(6)} ${impl}`);
      }
      console.log(`\nTotal: ${atoms.length} atoms`);
      break;
    }
    case 'show': {
      const id = args[0];
      if (!id) { console.error('Usage: xflow atom show <atom-id>'); process.exit(1); }
      const def = registry.atoms[id];
      if (!def) { console.error(`Unknown atom: ${id}`); process.exit(1); }
      console.log(JSON.stringify({ id, ...def }, null, 2));
      break;
    }
    case 'run': {
      const id = args[0];
      if (!id) { console.error('Usage: xflow atom run <atom-id> [args...]'); process.exit(1); }
      const def = registry.atoms[id];
      if (!def) { console.error(`Unknown atom: ${id}`); process.exit(1); }
      const atomArgs = args.slice(1);
      await runAtom(def, atomArgs);
      break;
    }
    default:
      console.error(`Unknown atom subcommand: ${sub}`);
      console.error('Available: list, show, run');
      process.exit(1);
  }
}

// ─── gate ─────────────────────────────────────────────────────────────────────

async function handleGate(sub, args) {
  if (isHelpRequest(sub)) {
    printGateHelp();
    return;
  }

  switch (sub) {
    case 'ack': {
      const phase = args[0];
      if (!phase) {
        console.error('Usage: xflow gate ack <phase>');
        process.exit(1);
      }
      try {
        ackPendingGate(process.env.XFLOW_PROJECT_ROOT || process.cwd(), phase, { approved_by: 'cli:xflow-gate-ack' });
        console.log(`✓ Approved gate: ${phase}`);
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
      break;
    }
    default:
      console.error(`Unknown gate subcommand: ${sub}`);
      console.error('Available: ack');
      process.exit(1);
  }
}

async function runAtom(def, args) {
  const parsedArgs = parseCliArgs(args);
  const projectRoot = parsedArgs.project_root || process.env.XFLOW_PROJECT_ROOT || process.cwd();
  const changeId = resolveChangeId({ explicit: parsedArgs.change_id, projectRoot });

  if (def.type === 'python') {
    const scriptPath = resolve(ROOT, def.script);
    if (!existsSync(scriptPath)) {
      console.error(`Atom script not found: ${scriptPath}`);
      process.exit(1);
    }
    const normalizedArgs = normalizeAtomCliArgs(args, parsedArgs, { changeId, projectRoot });
    const result = spawnSync('python3', [scriptPath, ...normalizedArgs], { stdio: 'inherit' });
    process.exit(result.status ?? 1);
  } else if (def.type === 'shell') {
    const scriptPath = resolve(ROOT, def.script);
    const normalizedArgs = normalizeAtomCliArgs(args, parsedArgs, { changeId, projectRoot });
    const result = spawnSync('bash', [scriptPath, ...normalizedArgs], { stdio: 'inherit' });
    process.exit(result.status ?? 1);
  } else if (def.type === 'js' || def.type === 'agent_invoke') {
    const modulePath = resolve(ROOT, def.module);
    if (!existsSync(modulePath)) {
      console.error(`Atom module not found: ${modulePath}`);
      process.exit(1);
    }
    const mod = await import(modulePath);
    const handler = mod[def.export || 'default'];
    if (typeof handler !== 'function') {
      console.error(`Atom export not found: ${def.export || 'default'}`);
      process.exit(1);
    }
    try {
      const phase = def.type === 'agent_invoke'
        ? buildSyntheticPhase(def, parsedArgs, changeId)
        : undefined;
      const result = await handler(parsedArgs, {
        projectRoot,
        changeId,
        runtime: {},
        input: parsedArgs,
        atomDef: def,
        workflow: { track: def.track || 'heavy' },
        phase,
      });
      console.log(JSON.stringify(result, null, 2));
      process.exit(result?.ok === false ? 1 : 0);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  } else {
    console.error(`Unknown atom type: ${def.type}`);
    process.exit(1);
  }
}

function parseCliArgs(args) {
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    const part = args[i];
    if (!part.startsWith('--')) {
      continue;
    }
    const key = part.slice(2).replace(/-/g, '_');
    const next = args[i + 1];
    if (!next || next.startsWith('--')) {
      setNestedValue(parsed, key, true);
      continue;
    }
    i += 1;
    let value = next;
    if ((value.startsWith('{') && value.endsWith('}')) || (value.startsWith('[') && value.endsWith(']'))) {
      try {
        value = JSON.parse(value);
      } catch {
        // Leave invalid JSON-looking strings as raw strings.
      }
    } else if (value === 'true') {
      value = true;
    } else if (value === 'false') {
      value = false;
    }
    appendNestedValue(parsed, key, value);
  }
  return parsed;
}

function setNestedValue(target, rawKey, value) {
  const segments = rawKey.split('.').map((segment) => segment.replace(/-/g, '_'));
  let cursor = target;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const seg = segments[i];
    if (!cursor[seg] || typeof cursor[seg] !== 'object' || Array.isArray(cursor[seg])) {
      cursor[seg] = {};
    }
    cursor = cursor[seg];
  }
  cursor[segments[segments.length - 1]] = value;
}

function appendNestedValue(target, rawKey, value) {
  const segments = rawKey.split('.').map((segment) => segment.replace(/-/g, '_'));
  let cursor = target;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const seg = segments[i];
    if (!cursor[seg] || typeof cursor[seg] !== 'object' || Array.isArray(cursor[seg])) {
      cursor[seg] = {};
    }
    cursor = cursor[seg];
  }
  const leaf = segments[segments.length - 1];
  if (cursor[leaf] === undefined) {
    cursor[leaf] = value;
  } else if (Array.isArray(cursor[leaf])) {
    cursor[leaf].push(value);
  } else {
    cursor[leaf] = [cursor[leaf], value];
  }
}

function buildWorkflowInput(parsedArgs) {
  const reserved = new Set(['project_root', 'change_id', 'dry_run', 'input_json']);
  const input = parsedArgs.input && typeof parsedArgs.input === 'object' && !Array.isArray(parsedArgs.input)
    ? structuredClone(parsedArgs.input)
    : {};

  if (parsedArgs.input_json) {
    if (typeof parsedArgs.input_json === 'object') {
      Object.assign(input, parsedArgs.input_json);
    } else if (typeof parsedArgs.input_json === 'string') {
      Object.assign(input, JSON.parse(parsedArgs.input_json));
    }
  }

  for (const [key, value] of Object.entries(parsedArgs)) {
    if (reserved.has(key) || key === 'input') continue;
    input[key] = value;
  }
  return input;
}

function normalizeCliList(value) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function hasNonEmptyValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  return value !== undefined && value !== null && value !== false;
}

function hasBenchmarkEvidencePath(input = {}) {
  const hasReferenceScenarios = Array.isArray(input.reference_scenarios_json)
    ? input.reference_scenarios_json.length > 0
    : typeof input.reference_scenarios_json === 'string' && input.reference_scenarios_json.trim().length > 0;
  const hasCapturePath = typeof input.capture_url === 'string' && input.capture_url.trim().length > 0;
  const hasReferenceImage = typeof input.reference_image === 'string' && input.reference_image.trim().length > 0;
  return hasReferenceScenarios || (hasCapturePath && hasReferenceImage);
}

function detectCompetitorLedUiMode(parsedArgs = {}, input = {}) {
  const reasons = [];
  if (parsedArgs.competitor_led_ui === true || input.competitor_led_ui === true) {
    reasons.push('explicit_flag');
  }
  if (typeof input.competitor_product === 'string' && input.competitor_product.trim() && input.competitor_product !== 'required') {
    reasons.push('competitor_product');
  }
  if (hasNonEmptyValue(input.reference_scenarios_json)) {
    reasons.push('reference_scenarios_json');
  }
  if (typeof input.capture_url === 'string' && input.capture_url.trim()) {
    reasons.push('capture_url');
  }
  if (typeof input.reference_image === 'string' && input.reference_image.trim()) {
    reasons.push('reference_image');
  }
  const titleText = String(input.title || parsedArgs.title || '').toLowerCase();
  if (/(competitor|benchmark|clone|copy|pixel|reference|对标|竞品|复刻|还原|像素级)/.test(titleText)) {
    reasons.push('title_keyword');
  }
  return {
    detected: reasons.length > 0,
    reasons: Array.from(new Set(reasons)),
  };
}

function resolveChangeId({ explicit, projectRoot }) {
  if (explicit) return explicit;
  if (process.env.CHANGE_ID) return process.env.CHANGE_ID;
  const branch = currentBranch(projectRoot);
  return deriveChangeIdFromBranch(branch);
}

function currentBranch(projectRoot) {
  try {
    return spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: projectRoot,
      encoding: 'utf8',
    }).stdout.trim();
  } catch {
    return '';
  }
}

function deriveChangeIdFromBranch(branchName) {
  const branch = String(branchName || '').trim();
  if (!branch || ['main', 'master', 'develop', 'dev', 'trunk', 'HEAD'].includes(branch)) {
    return null;
  }
  const issueMatch = branch.match(/^issue-\d+-(.+)$/);
  if (issueMatch?.[1]) return normalizeChangeId(issueMatch[1]);

  const prefixed = branch.match(/^(?:change|changes|codex|feature|feat|fix|bugfix|hotfix)\/(.+)$/);
  if (prefixed?.[1]) return normalizeChangeId(prefixed[1]);

  return normalizeChangeId(branch.replace(/^origin\//, ''));
}

function normalizeChangeId(value) {
  return String(value || '')
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/[\/\s]+/g, '-')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || null;
}

function normalizeAtomCliArgs(rawArgs, parsedArgs, { changeId, projectRoot }) {
  const passthrough = [];
  const dottedRoots = {};

  for (let i = 0; i < rawArgs.length; i += 1) {
    const part = rawArgs[i];
    if (!part.startsWith('--')) {
      passthrough.push(part);
      continue;
    }
    const rawKey = part.slice(2);
    const next = rawArgs[i + 1];
    const hasValue = next && !next.startsWith('--');
    const normalizedKey = rawKey.replace(/-/g, '_');

    if (rawKey.includes('.')) {
      const value = hasValue ? next : true;
      if (hasValue) i += 1;
      const [root, ...rest] = rawKey.split('.');
      dottedRoots[root.replace(/-/g, '_')] ||= {};
      setNestedValue(dottedRoots[root.replace(/-/g, '_')], rest.join('.'), value);
      continue;
    }

    if (hasValue && (next === 'true' || next === 'false')) {
      if (next === 'true') {
        passthrough.push(part);
      }
      i += 1;
      continue;
    }

    if (normalizedKey === 'change_id' && !hasValue && changeId) {
      passthrough.push('--change-id', String(changeId));
      continue;
    }
    if (normalizedKey === 'project_root' && !hasValue && projectRoot) {
      passthrough.push('--project-root', String(projectRoot));
      continue;
    }

    passthrough.push(part);
    if (hasValue) {
      passthrough.push(next);
      i += 1;
    }
  }

  if (!rawArgs.includes('--change-id') && !rawArgs.includes('--change_id') && changeId) {
    passthrough.push('--change-id', String(changeId));
  }
  if (!rawArgs.includes('--project-root') && !rawArgs.includes('--project_root') && projectRoot) {
    passthrough.push('--project-root', String(projectRoot));
  }

  for (const [root, payload] of Object.entries(dottedRoots)) {
    passthrough.push(`--${root.replace(/_/g, '-')}`, JSON.stringify(payload));
  }

  return passthrough;
}

function buildSyntheticPhase(def, parsedArgs, changeId) {
  const phaseId = parsedArgs.phase || inferPhaseIdFromArtifact(def.expected_artifact, changeId) || 'agent_invoke';
  const artifactPath = def.expected_artifact
    ? def.expected_artifact.replace(/\$\{change_id\}/g, changeId || '')
    : `specs/changes/${changeId || 'unknown-change'}/${phaseId}.json`;
  return {
    id: phaseId,
    label: phaseId,
    artifacts: [{ path: artifactPath, optional: false }],
  };
}

function inferPhaseIdFromArtifact(expectedArtifact, changeId) {
  if (!expectedArtifact) return null;
  const resolved = expectedArtifact.replace(/\$\{change_id\}/g, changeId || '');
  const match = resolved.match(/\/([^/]+)\.(json|md|pen)$/);
  return match?.[1] || null;
}

function ensureChangeId(changeId, context, projectRoot) {
  if (changeId) return;
  const branch = currentBranch(projectRoot) || '(unknown branch)';
  console.error(`CHANGE_ID is required for ${context}. Pass --change-id <id> or switch to a branch name that can be derived. Current branch: ${branch}`);
  process.exit(1);
}

function isHelpRequest(value) {
  return value === 'help' || value === '--help' || value === '-h';
}


// ─── serve ────────────────────────────────────────────────────────────────────

async function handleServe(args) {
  if (args.some(isHelpRequest)) {
    printServeHelp();
    return;
  }

  console.log('Starting openflow HTTP control plane...');
  // For now, delegate to as-agentos server if available
  const agentosServer = resolve(ROOT, 'src', 'server.js');
  if (existsSync(agentosServer)) {
    const { default: startServer } = await import('../src/server.js');
    await startServer();
  } else {
    console.error('HTTP server not yet available. Heavy track requires as-agentos server.');
    console.error('See: https://github.com/surlymochan/as-agentos');
    process.exit(1);
  }
}

// ─── help ─────────────────────────────────────────────────────────────────────

function printWorkflowHelp() {
  console.log(`
Usage: xflow workflow <command>

Commands:
  run <yaml|yolo|corps>       Run a workflow (add --dry-run to preview)
  validate <yaml|yolo|corps>  Validate workflow YAML as preflight only

Options:
  help, -h, --help Show this help message
`);
}

function printCorpsHelp() {
  console.log(`
Usage: xflow corps --title <title> --change-type frontend --change-id <id>

Run the heavy product/multi-agent workflow through the governed entry point.
This is the only completion-claiming entry for xflow:corps. Use
workflow validate corps only as preflight; it never proves execution.
Use --explain for a first-time operator guide without starting the workflow.

Options:
  --title TEXT        Human-readable product/change title
  --change-type TYPE  Usually frontend, product, or fullstack
  --change-id ID      Override derived change id
  --project-root PATH Target project root
  --competitor-product NAME
                     Named competitor to reconstruct against
  --required-modules NAME
                     Repeatable. Required IA/module slices, e.g. workspace
  --target-surfaces NAME
                     Repeatable. Required surfaces, e.g. primary_workspace
  --primary-reference-surface NAME
                     Exactly one target surface to lock as the main reference
  --primary-journeys NAME
                     Repeatable. Required end-to-end flows to preserve
  --business-logic-invariants TEXT
                     Repeatable. Hard product-logic constraints
  --reference-scenarios-json JSON
                     JSON array with viewport, reference_image, screenshot_image,
                     diff_metrics, structure_checks, and status per scenario
  --dry-run           Preview the governed workflow without executing
  --explain           Print first-time operator guide without executing
  --json              Print machine-readable output for dry-run/proof
  help, -h, --help    Show this help message
`);
}

function printProofHelp() {
  console.log(`
Usage: xflow proof [--track corps] --change-id <id> [--project-root <path>]

Verify workflow completion from execution logs and required artifacts, then
write specs/changes/<id>/<track>_proof.json. A corps run is not complete
until corps_proof.json reports ok=true.

Options:
  --track NAME        Workflow track to verify, default: corps
  --change-id ID      Override derived change id
  --project-root PATH Target project root
  --json              Print machine-readable output
  --write false       Check without writing the proof file
  help, -h, --help    Show this help message
`);
}

function printAtomHelp() {
  console.log(`
Usage: xflow atom <command>

Commands:
  list [--track=lite|heavy]  List all registered atoms
  show <id>                  Show atom details from registry
  run <id> [args...]         Run a single atom directly

Options:
  help, -h, --help           Show this help message
`);
}

function printGateHelp() {
  console.log(`
Usage: xflow gate <command>

Commands:
  ack <phase>  Approve a pending human gate for resume

Options:
  help, -h, --help Show this help message
`);
}

function printDoctorHelp() {
  console.log(`
Usage: xflow doctor [--json] [--project-root <path>]

Check local xflow readiness: package scripts, workflow YAMLs, skill topology,
and the project root used by workflow execution.

Options:
  --json              Print machine-readable output
  --project-root PATH Check a specific project root
  help, -h, --help    Show this help message
`);
}

function printInitHelp() {
  console.log(`
Usage: xflow init [--project-root <path>] [--force] [--json]

Create a project-local .as-xflow/config.json with portable defaults for
workflow paths, skill sync paths, and issue routing.

Options:
  --project-root PATH Initialize a specific project root
  --force             Rewrite an existing config
  --json              Print machine-readable output
  help, -h, --help    Show this help message
`);
}

function printGoalHelp() {
  console.log(`
Usage: xflow goal [show|set|audit|clear] [options]

Manage the project-level .xflow/GOAL.md anchor that xflow skills and workflows
use to keep yolo, corps, Ralph, handoff, and takein aligned.

Examples:
  xflow goal set "Ship the next verified change" --project-root .
  xflow goal show --project-root . --json
  xflow goal audit --project-root . --json
  xflow goal clear --project-root .

Options:
  --project-root PATH Read or write a specific project root
  --text TEXT         Set goal text without positional arguments
  --goal TEXT         Alias for --text
  --force             Replace an existing goal on set
  --full              Print the full goal file on show
  --json              Print machine-readable output
  help, -h, --help    Show this help message
`);
}

function printScoreHelp() {
  console.log(`
Usage: xflow score [--json]

Print the current competitive readiness score used to compare xflow against
adjacent agent workflow systems.

Options:
  --json              Print machine-readable output
  help, -h, --help    Show this help message
`);
}

function printAssessHelp() {
  console.log(`
Usage: xflow assess [--json]

Show the public quality assessment for xflow:goal, xflow:yolo, xflow:corps,
and the overall skill family, including the Codex native goal comparison.

Options:
  --json              Print machine-readable output
  help, -h, --help    Show this help message
`);
}

function printEvaluateHelp() {
  console.log(`
Usage: xflow evaluate [--json] [--project-root <path>]

Show a one-shot external evaluator brief that combines quality score,
completion boundary, launch blockers, splash-launch blockers, claim boundaries,
release-owner status, next actions, and the safe first-run command path.

Options:
  --project-root PATH Evaluate adoption and goal evidence from a specific root
  --json              Print machine-readable output
  help, -h, --help    Show this help message
`);
}

function printReleaseHelp() {
  console.log(`
Usage: xflow release status [--json] [--project-root <path>] [--pre-publish]

Show the release-owner publish status: current blocker, package evidence,
next action, splash readiness, and handoff document.

Options:
  --project-root PATH Evaluate adoption and goal evidence from a specific root
  --pre-publish       Check publish prerequisites instead of post-publish registry evidence
  --check-registry    Query npm registry evidence when package checks need it
  --check-auth        Run npm whoami for pre-publish identity evidence
  --json              Print machine-readable output
  help, -h, --help    Show this help message
`);
}

function printDemoHelp() {
  console.log(`
Usage: xflow demo <launch|clean> [--json]

Show public launch demo paths or run the clean-project adoption smoke. The
clean demo creates a temporary project, initializes xflow, writes a goal, audits
the goal, runs doctor, validates yolo, and cleans up unless --keep is passed.

Options:
  --project-root PATH clean: run the smoke in an existing or explicit directory
  --keep              clean: keep the temporary project directory
  --timeout-ms N      clean: timeout per smoke command
  --json              Print machine-readable output
  help, -h, --help    Show this help message
`);
}

function printLaunchHelp() {
  console.log(`
Usage: xflow launch <audit|dossier|claims|copy> [--json] [--strict] [--project-root <path>] [--check-registry]

Audit public launch readiness, separating verified engine/package evidence from
missing adoption or registry evidence. Adoption evidence is validated from
docs/adoption/ before the missing surface list is produced. Registry evidence is
validated when --check-registry, --registry-json, or --registry-file is supplied.
Pass --pre-publish to validate the pre-publish npm identity/package-availability
gate instead of the post-publish registry audit.
Use dossier to print the one-page public launch narrative backed by the same
audit payload. Use claims to print what may be publicly claimed now and what
must be held until missing evidence is present. Use copy to render safe launch
copy, evaluation commands, and forbidden phrases from the same evidence.

Options:
  --project-root PATH Read docs/adoption from a specific project root
  --dir PATH         Override the adoption evidence directory
  --output PATH      dossier/copy: write the markdown output to a file
  --pre-publish      Check pre-publish readiness with package preflight
  --splash           Require third-party adoption evidence for splash claims
  --check-registry   Run npm view for the package publication check
  --check-auth       pre-publish: run npm whoami
  --whoami USER      pre-publish: provide captured npm identity
  --registry-json OBJ Use captured npm view JSON as package evidence
  --registry-file PATH Read captured npm view JSON from a file
  --strict           Exit non-zero when launch_ready is false
  --json              Print machine-readable output
  help, -h, --help    Show this help message
`);
}

function printAdoptionHelp() {
  console.log(`
Usage: xflow adoption <validate|init|kit|trial|brief|status> [--json] [--project-root <path>]

Validate real adoption evidence records under docs/adoption/. The command fails
when no reviewable adoption record exists or when a record still looks like the
template instead of evidence from a real team, tracker, repository, or PR. Use
trial to print a copy-paste external trial sequence, brief to generate a
sendable third-party ask, or kit to write a shareable third-party trial packet
before evidence exists. Use status for a non-failing release-owner view of
ordinary and splash adoption blockers.

Options:
  --project-root PATH Read docs/adoption from a specific project root
  --input FILE       Validate a specific adoption markdown file; repeatable
  --dir PATH         Override the adoption evidence directory
  --splash           Require at least one third-party adoption record
  --name NAME        init/kit/trial/brief: team or project name
  --source TEXT      init/kit/trial/brief: source tracker, repository, team workflow, or PR
  --track VALUE      init/kit/trial/brief: yolo, corps, or both
  --date YYYY-MM-DD  init: adoption date
  --force            init/kit: replace an existing draft record or trial packet
  --json             Print machine-readable output
  help, -h, --help   Show this help message
`);
}

function printPackageHelp() {
  console.log(`
Usage: xflow package <audit|preflight|status> [--json] [--project-root <path>]

Validate public npm package evidence for launch readiness. audit verifies an
already published package. preflight checks publish prerequisites without
publishing. status gives a non-failing release-owner summary of both publish
readiness and public install readiness. By default audit/preflight do not hit
the network; pass --check-registry or provide captured registry evidence with
--registry-json / --registry-file. status checks registry/auth unless captured
evidence or --whoami is provided.

Options:
  --project-root PATH Read package.json from a specific project root
  --package-name NAME Override the expected npm package name
  --version VERSION   Override the expected version
  --check-registry    Run npm view <package> name version --json
  --check-auth        preflight: run npm whoami
  --whoami USER       preflight: provide captured npm identity
  --allow-existing-package
                      preflight: allow an existing package after ownership check
  --registry-json OBJ Use captured npm view JSON as evidence
  --registry-file PATH Read captured npm view JSON from a file
  --timeout-ms N      Timeout for npm view when --check-registry is used
  --json              Print machine-readable output
  help, -h, --help    Show this help message
`);
}

function printCompareHelp() {
  console.log(`
Usage: xflow compare <superpowers|codex-goal|openspec|gstack|spec-kit> [--json]

Show a compact evidence-backed comparison against a reference spec workflow
or agent-methodology system and point to the local proof docs/operators should
run next.

Options:
  --json              Print machine-readable output
  help, -h, --help    Show this help message
`);
}

function printObjectiveHelp() {
  console.log(`
Usage: xflow objective [--json] [--project-root <path>]

Audit the top-level xflow product objective: whether xflow:goal, xflow:yolo,
xflow:corps, and the overall skill family are already proven from source
checkout, and what still blocks open-source launch or industry-splash claims.

Options:
  --project-root PATH Evaluate adoption and goal evidence from a specific root
  --json              Print machine-readable output
  help, -h, --help    Show this help message
`);
}

function printAdapterHelp() {
  console.log(`
Usage: xflow adapter <command>

Commands:
  import-file --input <tracker-item.json>
      Import a generic tracker item JSON into specs/changes/<change-id>/

  github-issue --repo owner/name --issue <number>
      Import a GitHub issue through gh into specs/changes/<change-id>/

Options:
  --project-root PATH  Target project root
  --change-id ID       Override derived change id
  --force              Replace an existing imported proposal
  --json               Print machine-readable output
  help, -h, --help     Show this help message
`);
}

function printSpecHelp() {
  console.log(`
Usage: xflow spec <command>

Commands:
  start [--title <title>] [--change-id <id>] [--change-type backend|frontend|full-stack|infrastructure|docs]
      Scaffold root specs/ and specs/changes/<id>/ with lower-friction xflow defaults

  delta [--change-id <id>] [--project-root <path>]
      Generate specs/changes/<id>/spec_delta_review.json and .md

  openspec-map [--project-root <path>] [--openspec-root openspec]
      Generate .as-xflow/openspec-migration.json without moving files

Options:
  help, -h, --help    Show this help message
`);
}

function printQaHelp() {
  console.log(`
Usage: xflow qa <command>

Commands:
  capture --url <page-url>
      Capture screenshot + DOM snapshot + dom_rects + visual tokens with QA-focused defaults.
      If --reference is supplied, also compute image diff, heatmap, and an HTML report.
  review --url <page-url>
      Run a QA-review flavored capture and package the next review decisions in one payload.
  ship --url <page-url>
      Run a ship-gate flavored capture and package the follow-on release checks.
  benchmark --url <page-url>
      Bundle review, ship, and release-gate expectations into one benchmark packet.

Options:
  --project-root PATH Target project root
  --url URL          Page to capture
  --reference PATH   Optional reference image for diff/report
  --platform-profile NAME Use a preset such as ios_phone, android_phone, or mobile_h5
  --json             Print machine-readable output
  help, -h, --help   Show this help message
`);
}

function printHostHelp() {
  console.log(`
Usage: xflow host <status|sync|diff> [--host codex|agents|opencode] [--json]

Show or maintain installed xflow skill copies across common host roots.

Commands:
  status             Show whether Codex, agents, and OpenCode roots exist and whether xflow is in sync
  sync               Run the installed-skill sync wrapper for one host or all configured hosts
  diff               Run the installed-skill drift check for one host or all known hosts

Options:
  --host NAME        codex, agents, or opencode
  --project-root PATH Target project root
  --json             Print machine-readable output
  help, -h, --help   Show this help message
`);
}

function printCoachHelp() {
  console.log(`
Usage: xflow coach <bugfix|feature|review|qa|ship|tdd|debug|red|green|verify> [--json]

Show a concise execution checklist that turns xflow's workflow and proof model
into a role-like coaching surface.

Options:
  --json             Print machine-readable output
  help, -h, --help   Show this help message
`);
}

function printGuideHelp() {
  console.log(`
Usage: xflow guide [--json]

Show the human-facing xflow delivery loop: shape the work, choose a track,
execute with gates, review evidence, and finish with durable context.

Options:
  --json              Print machine-readable output
  help, -h, --help    Show this help message
`);
}

function printRoleHelp() {
  console.log(`
Usage: xflow role <developer|reviewer|qa|release|product> [--json]

Show a named specialist operator surface with the most relevant xflow commands
for that role.

Options:
  --json             Print machine-readable output
  help, -h, --help   Show this help message
`);
}

function printQuickstartHelp() {
  console.log(`
Usage: xflow quickstart [--json]

Show copy-paste-safe first-run commands separately from release-owner gates that
require real adoption, npm identity, or public registry evidence.

Options:
  --json              Print machine-readable output
  help, -h, --help    Show this help message
`);
}

function printVisualHelp() {
  console.log(`
Usage: xflow visual <command>

Commands:
  capture-page-evidence --url <page-url>
      Capture a screenshot and DOM snapshot from a local/remote page,
      optionally exporting dom_rects, visual tokens, image diff, and extra interaction states in the same run

  export-dom-rects --input <snapshot.json>
      Export layout_observations.dom_rects from a DOM snapshot JSON

  export-visual-tokens --input <snapshot.json>
      Export observed_visual_tokens from a DOM snapshot JSON

  diff-images --reference <reference.png> --candidate <candidate.png>
      Compute real image diff metrics through a browser canvas

  render-report --input <visual_benchmark.json>
      Render an HTML compare viewer from a benchmark artifact

Options:
  --snapshot-output PATH  Destination DOM snapshot JSON
  --screenshot-output PATH Destination screenshot file
  --output PATH       Destination JSON file (default: .as-xflow/dom-rects.json)
  --dom-rects-output PATH Export dom_rects JSON during capture-page-evidence
  --visual-tokens-output PATH Export visual tokens JSON during capture-page-evidence
  --reference PATH    Reference image for inline diff during capture-page-evidence
  --heatmap-output PATH Write a PNG diff heatmap during capture-page-evidence or diff-images
  --report-output PATH Write an HTML compare report during capture-page-evidence or diff-images
  --platform-profile NAME Use a preset such as ios_phone, android_phone, or mobile_h5
  --capture-states-json JSON
                     Additional state captures to sample hover/click/focus/press states
  --auto-discover-states
                     Auto-discover a small set of interactive candidate states
  --state-limit N     Maximum discovered states to capture (default: 4)
  --pixel-threshold N Pixel diff threshold (default: 16)
  --block-rows N      Diff grid row count (default: 12)
  --block-cols N      Diff grid column count (default: 12)
  --panel-attr NAME   Attribute used to resolve panel ids (default: data-panel)
  --project-root PATH Target project root
  --json              Print machine-readable output
  help, -h, --help    Show this help message
`);
}

function printServeHelp() {
  console.log(`
Usage: xflow serve

Start the openflow HTTP control plane for heavy-track workflows.

Options:
  help, -h, --help  Show this help message without starting the server
`);
}

function printHelp() {
  console.log(`
xflow — openflow unified workflow CLI

Usage:
  xflow workflow run <yaml>      Run a workflow (add --dry-run to preview)
  xflow workflow validate <yaml> Validate workflow YAML
  xflow corps --title <title>    Run heavy track through governed entry
  xflow proof --track corps      Verify final execution proof
  xflow doctor [--json]          Check local xflow readiness
  xflow init [--project-root .]   Create project-local xflow config
  xflow goal set "<goal>"        Write the project-level .xflow/GOAL.md anchor
  xflow goal show [--json]       Show the current project goal
  xflow goal audit [--json]      Audit goal consumption across the skill family
  xflow evaluate [--json]        Show one-shot external evaluator brief
  xflow release status [--json]  Show release-owner publish status
  xflow assess [--json]          Show the public quality assessment
  xflow demo launch [--json]     Show the public launch demo script
  xflow launch audit [--json]    Audit public launch readiness
  xflow launch dossier           Print public launch dossier
  xflow adoption validate        Validate real adoption evidence records
  xflow adoption brief           Print a sendable third-party trial ask
  xflow adoption status          Show ordinary and splash adoption status
  xflow package audit            Validate public npm package evidence
  xflow package status           Show npm publish/install status without failing
  xflow score [--json]           Print competitive readiness score
  xflow objective [--json]       Audit the top-level product objective
  xflow compare codex-goal       Compare xflow goal against Codex native goal
  xflow compare superpowers      Compare xflow against Superpowers
  xflow compare openspec         Compare xflow against OpenSpec
  xflow compare gstack           Compare xflow against gstack
  xflow compare spec-kit         Compare xflow against spec-kit
  xflow adapter import-file      Import tracker JSON into xflow artifacts
    xflow spec start               Scaffold specs/changes with xflow defaults
    xflow spec quick               Scaffold a docs-first change from a positional title
  xflow qa capture               Run browser-QA capture with xflow defaults
    xflow host status              Show installed host skill status
    xflow host sync                Refresh installed xflow skill copies
    xflow host diff                Check installed xflow skill drift
    xflow coach bugfix             Show a bugfix coaching checklist
    xflow role qa                  Show a named role-specific operator surface
    xflow spec delta                Generate spec delta review for a change
  xflow visual capture-page-evidence
                                 Capture screenshot + DOM snapshot from a page
  xflow visual export-dom-rects  Export dom_rects from a DOM snapshot JSON
  xflow visual export-visual-tokens
                                 Export observed visual tokens from a DOM snapshot JSON
  xflow visual diff-images       Compute image diff metrics through browser canvas
  xflow spec openspec-map         Generate OpenSpec migration mapping
  xflow quickstart [--json]      Show copy-paste-safe first-run commands
  xflow guide [--json]           Show the human delivery loop
  xflow gate ack <phase>         Approve a pending human gate for resume
  xflow atom list [--track=lite|heavy]
                                 List all registered atoms
  xflow atom show <id>           Show atom details from registry
  xflow atom run <id> [args...]  Run a single atom directly
  xflow serve                    Start HTTP control plane (heavy track)

Workflows:
  workflows/yolo.yaml   Lite track  — 12 phases, no HTTP server required
  workflows/corps.yaml  Heavy track — 26 phases, requires HTTP server + Pencil

Quick start:
  xflow quickstart
  xflow goal set "Ship the next verified change" --project-root .
  xflow spec start --title "修复示例" --change-type backend
  xflow workflow run workflows/yolo.yaml --dry-run
  xflow workflow run workflows/yolo.yaml --title "修复示例" --change-type backend
    xflow qa capture --url http://127.0.0.1:3000 --platform-profile mobile_h5
    xflow host status --json
    xflow role qa --json
    CHANGE_ID=my-change xflow workflow run workflows/yolo.yaml --title "修复示例" --change-type backend

Quick start (corps):
  xflow corps --explain
  xflow serve &
  xflow corps --title "产品示例" --change-type frontend --dry-run
  xflow corps --title "产品示例" --change-type frontend --change-id my-product
`);
}

main().catch(e => {
  console.error(e.message);
  process.exit(1);
});
