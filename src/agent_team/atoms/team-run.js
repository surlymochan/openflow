import { readFileSync, existsSync } from 'node:fs';

import { readJsonFile, resolveChangePath, writeJsonFile, writeTextFile } from '../../core/change-artifacts.js';
import { synthesizePhaseArtifact } from '../common.js';

function readText(path, fallback = '') {
  if (!existsSync(path)) return fallback;
  return readFileSync(path, 'utf8');
}

function loadCorpsInput(projectRoot, changeId) {
  return readJsonFile(resolveChangePath(projectRoot, changeId, 'corps-input.json'), {}) || {};
}

function buildDirectionOptions(contract = {}) {
  const modules = Array.isArray(contract.required_modules) ? contract.required_modules : [];
  const surface = contract.primary_reference_surface || 'locked primary surface';
  return [
    {
      id: 'shell-first-reference-copy',
      label: 'Shell-first reference copy',
      strengths: [
        'Fastest path to visual fidelity on the locked desktop surface.',
        `Keeps ${surface} proportionally stable before density polish.`,
      ],
      risks: [
        'Can under-specify deeper scheduling and detail-panel states if left unchecked.',
      ],
    },
    {
      id: 'journey-first-ia-lock',
      label: 'Journey-first IA lock',
      strengths: [
        'Preserves declared business invariants around primary journeys, state changes, and detail editing.',
        'Keeps module coverage aligned with the named competitor model.',
      ],
      risks: [
        'Can drift visually if the shell is not re-anchored to the primary reference surface.',
      ],
    },
    {
      id: 'component-token-copy',
      label: 'Component/token copy',
      strengths: [
        'Improves density, control language, and polish across shared components.',
        `Maps well to required modules: ${modules.join(', ') || 'unspecified modules'}.`,
      ],
      risks: [
        'Without a strict shell baseline it can still look inspired-by rather than copied.',
      ],
    },
  ];
}

function buildRiskEntries(contract = {}) {
  const invariants = Array.isArray(contract.business_logic_invariants) ? contract.business_logic_invariants : [];
  const primarySurface = contract.primary_reference_surface || 'the locked primary reference surface';
  return [
    {
      id: 'reference-drift',
      severity: 'high',
      mitigation: `Lock ${primarySurface} and reject mixed visual direction before implementation.`,
    },
    {
      id: 'domain-invariant-break',
      severity: 'high',
      mitigation: `Keep declared domain behavior explicit in state and tests. Invariants: ${invariants.join(' | ') || 'none declared'}`,
    },
    {
      id: 'density-gap',
      severity: 'medium',
      mitigation: 'Treat task row height, control sizing, and right-panel density as reference-copied constraints rather than local design choices.',
    },
  ];
}

function buildClarifyPayload(contract = {}) {
  return {
    assumptions: [
      'This change targets the platform and viewport class declared by the contract.',
      'Visual success is defined by the selected design mode and reference evidence, not local taste alone.',
    ],
    decisions: [
      `Primary competitor product: ${contract.competitor_product || 'unspecified competitor'}`,
      `Primary reference surface: ${contract.primary_reference_surface || 'unspecified primary surface'}`,
    ],
    open_questions: [],
    resolved_scope: {
      target_surfaces: contract.target_surfaces || [],
      primary_journeys: contract.primary_journeys || [],
      required_modules: contract.required_modules || [],
    },
  };
}

function proposalMarkdown(contract = {}) {
  const requiredModules = (contract.required_modules || []).map((entry) => `- ${entry}`).join('\n') || '- (none)';
  const journeys = (contract.primary_journeys || []).map((entry) => `- ${entry}`).join('\n') || '- (none)';
  const invariants = (contract.business_logic_invariants || []).map((entry) => `- ${entry}`).join('\n') || '- (none)';
  return [
    '# Proposal',
    '',
    '## Objective',
    '',
    `Deliver a direct reconstruction of ${contract.competitor_product || 'the named competitor'} on the locked primary surface \`${contract.primary_reference_surface || 'unspecified'}\`.`,
    '',
    '## Required Modules',
    '',
    requiredModules,
    '',
    '## Primary Journeys',
    '',
    journeys,
    '',
    '## Business Logic Invariants',
    '',
    invariants,
    '',
    '## Acceptance Intent',
    '',
    '- The result should read as a competitor copy, not an inspiration piece.',
    '- The shell, density, repeated-component rhythm, primary work surface, and detail editing must stay aligned with the frozen reference.',
    '',
  ].join('\n');
}

function buildUxDesignBrief(contract = {}) {
  const states = Array.isArray(contract.required_states) && contract.required_states.length > 0
    ? contract.required_states
    : Array.isArray(contract.primary_journeys) && contract.primary_journeys.length > 0
      ? contract.primary_journeys.map((journey) => `${journey}_state`)
      : ['primary_ready', 'focused_item', 'empty_or_loading', 'error_or_recovery'];
  return {
    layout: {
      shell: contract.primary_reference_surface || 'desktop workbench',
      primary_reference_surface: contract.primary_reference_surface || null,
      required_modules: contract.required_modules || [],
    },
    flows: contract.primary_journeys || [],
    states,
    interaction_constraints: [
      'Primary domain objects remain visible until the user explicitly changes their state.',
      'The main work surface stays visible during key decisions instead of hiding context behind generic forms.',
      'Secondary panels must feel like part of the same product surface, not pasted-on admin UI.',
    ],
    visual_constraints: {
      competitor_product: contract.competitor_product || null,
      reference_mode: contract.competitor_product ? 'reference_matched' : 'high_aesthetic_native',
      density_target: contract.density_target || 'reference_matched_product_density',
    },
  };
}

function buildPlanJson(contract = {}, changeId = 'change') {
  const workspace = contract.workspace || `specs/changes/${changeId}/prototype`;
  return {
    execution_plan: [
      {
        step: 'Build the product shell to match the locked reference surface proportions and hierarchy.',
        owner: 'workflow',
        outputs: [`${workspace}/index.html`, `${workspace}/styles.css`],
      },
      {
        step: 'Tighten repeated component density, state affordances, and interaction rhythm to match the reference or design standard.',
        owner: 'workflow',
        outputs: [`${workspace}/app.js`],
      },
      {
        step: 'Recheck benchmark evidence against the primary reference surface and repair any remaining drift.',
        owner: 'workflow',
        outputs: ['specs/changes/${change_id}/visual_benchmark.json'],
      },
    ],
    verification: {
      red: contract.tdd_red_command || null,
      green: contract.tdd_green_command || null,
    },
  };
}

function writeStructuredPlanMarkdown(projectRoot, changeId, contract = {}) {
  const plan = buildPlanJson(contract, changeId);
  const workspace = contract.workspace || `specs/changes/${changeId}/prototype`;
  const verificationCommands = [
    contract.tdd_green_command || 'npm test',
  ];
  const modules = (contract.required_modules || []).map((entry) => `- ${entry}`).join('\n') || '- Product shell';
  const journeys = (contract.primary_journeys || []).map((entry) => `- ${entry}`).join('\n') || '- Primary journey remains visible and testable';
  const invariants = (contract.business_logic_invariants || []).map((entry) => `- ${entry}`).join('\n') || '- Preserve the accepted product contract';
  const executionSteps = plan.execution_plan.map((step, index) => [
    `${index + 1}. ${step.step}`,
    `   - Owner: ${step.owner}`,
    `   - Outputs: ${step.outputs.join(', ')}`,
  ].join('\n')).join('\n');
  writeTextFile(resolveChangePath(projectRoot, changeId, 'plan.md'), [
    '# Plan',
    '',
    '## Target Outcome',
    '',
    `Build the accepted product surface in \`${workspace}\` and keep it aligned with the frozen corps contract.`,
    '',
    '## Product Contract',
    '',
    '### Required Modules',
    '',
    modules,
    '',
    '### Primary Journeys',
    '',
    journeys,
    '',
    '### Business Logic Invariants',
    '',
    invariants,
    '',
    '## Execution Plan',
    '',
    executionSteps,
    '',
    '## Verification',
    '',
    '```bash',
    ...verificationCommands,
    '```',
    '',
    '## Main Risk',
    '',
    '- Execution drift: the implementation must preserve the product contract, not merely write phase artifacts.',
    '',
  ].join('\n'));
}

function buildStructuredPhaseSpec(phase, contract = {}, projectRoot, changeId) {
  const planText = readText(resolveChangePath(projectRoot, changeId, 'plan.md'));
  const findingsText = readText(resolveChangePath(projectRoot, changeId, 'findings.md'));
  const proposalText = readText(resolveChangePath(projectRoot, changeId, 'proposal.md'));
  const referenceScenarios = Array.isArray(contract.reference_scenarios_json) ? contract.reference_scenarios_json : [];

  switch (phase) {
    case 'explore':
      return {
        summary: 'Explore locked the same-category evidence, product invariants, and primary reference surface before decomposition.',
        findings: [
          { summary: `Primary reference surface stays locked to ${contract.primary_reference_surface || 'the declared desktop surface'}.` },
          { summary: `Required modules remain constrained to ${Array.isArray(contract.required_modules) && contract.required_modules.length > 0 ? contract.required_modules.join(', ') : 'the declared module set'}.` },
          { summary: 'Inbox-first capture and explicit scheduling stay frozen as non-negotiable business logic.' },
        ],
        payload: {
          competitor_product: contract.competitor_product || null,
          primary_reference_surface: contract.primary_reference_surface || null,
          target_surfaces: contract.target_surfaces || [],
          required_modules: contract.required_modules || [],
          primary_journeys: contract.primary_journeys || [],
          business_logic_invariants: contract.business_logic_invariants || [],
        },
      };
    case 'brainstorm':
      return {
        summary: 'Brainstorm converged on a shell-first product reconstruction direction with explicit downstream tradeoffs.',
        findings: [
          { summary: 'A shell-first copy path is the safest way to reduce competitor drift early.' },
          { summary: 'Journey-first logic is still necessary to preserve the declared business invariants.' },
        ],
        payload: {
          directions: buildDirectionOptions(contract),
          recommended_direction: 'shell-first-reference-copy',
          recommendation_rationale: 'Pixel-level fidelity depends on freezing the three-column desk shell before component polish or secondary states.',
          reference_context: referenceScenarios.map((scenario) => scenario.id),
          sources_used: {
            plan_present: Boolean(planText.trim()),
            findings_present: Boolean(findingsText.trim()),
          },
        },
      };
    case 'risk_review':
      return {
        summary: 'Risk review captured the main failure modes for competitor-led UI reconstruction before implementation.',
        findings: buildRiskEntries(contract).map((entry) => ({ summary: `${entry.id}: ${entry.mitigation}` })),
        payload: {
          risks: buildRiskEntries(contract),
        },
      };
    case 'clarify':
      return {
        summary: 'Clarify locked the product mode as competitor-led desktop reconstruction with no open blocker questions.',
        findings: [
          { summary: 'The primary surface and product mode are frozen before implementation.' },
          { summary: 'No unresolved scope ambiguity remains for primary state transitions, work surface, or detail-panel behavior.' },
        ],
        payload: buildClarifyPayload(contract),
      };
    case 'proposal':
      return {
        summary: 'Proposal translated the competitor contract into a concrete reconstruction brief.',
        findings: [
          { summary: 'Proposal now names modules, journeys, and invariants as execution constraints.' },
        ],
        payload: {
          objective: `Directly reconstruct ${contract.competitor_product || 'the named competitor'} on ${contract.primary_reference_surface || 'the locked surface'}.`,
          required_modules: contract.required_modules || [],
          primary_journeys: contract.primary_journeys || [],
          business_logic_invariants: contract.business_logic_invariants || [],
          reference_scenarios: referenceScenarios.map((scenario) => scenario.id),
          proposal_markdown_present: Boolean(proposalText.trim()),
        },
        sideEffects() {
          writeTextFile(resolveChangePath(projectRoot, changeId, 'proposal.md'), proposalMarkdown(contract));
          writeJsonFile(resolveChangePath(projectRoot, changeId, 'proposal.json'), {
            version: 1,
            proposal: {
              competitor_product: contract.competitor_product || null,
              primary_reference_surface: contract.primary_reference_surface || null,
              target_surfaces: contract.target_surfaces || [],
              required_modules: contract.required_modules || [],
              primary_journeys: contract.primary_journeys || [],
              business_logic_invariants: contract.business_logic_invariants || [],
              reference_scenarios: referenceScenarios,
            },
          });
        },
      };
    case 'ux_design_brief':
      return {
        summary: 'UX design brief locked the workbench shell, core states, and copy-not-reinterpret visual constraints.',
        findings: [
          { summary: 'UX brief keeps the primary work surface explicit and visible inside the central workbench.' },
          { summary: 'Secondary detail/editing surfaces are constrained to feel like part of the same product system.' },
        ],
        payload: buildUxDesignBrief(contract),
        sideEffects() {
          writeJsonFile(resolveChangePath(projectRoot, changeId, 'ux_design_brief.json'), {
            version: 1,
            ux_design_brief: buildUxDesignBrief(contract),
          });
        },
      };
    case 'plan':
      return {
        summary: 'Plan converted the competitor contract into an implementation-ready execution sequence.',
        findings: [
          { summary: 'Execution is ordered around shell fidelity first, then dense module alignment, then benchmark recheck.' },
        ],
        payload: buildPlanJson(contract, changeId),
        sideEffects() {
          writeJsonFile(resolveChangePath(projectRoot, changeId, 'plan.json'), {
            version: 1,
            ...buildPlanJson(contract, changeId),
          });
          writeStructuredPlanMarkdown(projectRoot, changeId, contract);
        },
      };
    default:
      return {
        summary: `${phase} completed through the heavy structured team-run bridge.`,
        findings: [],
        payload: {},
      };
  }
}

export async function teamRun(input = {}, context = {}) {
  const phase = input.phase || context.phase?.id || null;
  const projectRoot = context.projectRoot || process.cwd();
  const changeId = context.changeId || input.change_id || null;
  const contract = changeId ? loadCorpsInput(projectRoot, changeId) : {};
  const spec = buildStructuredPhaseSpec(phase, contract, projectRoot, changeId);

  const result = await synthesizePhaseArtifact(input, context, {
    phase,
    summary: spec.summary,
    findings: spec.findings,
    extraEnvelope: spec.payload,
  });

  if (typeof spec.sideEffects === 'function') {
    spec.sideEffects();
  }

  return result;
}
