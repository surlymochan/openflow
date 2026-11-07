/**
 * XFlow Workflow Loader
 *
 * Responsibilities:
 *   1. Load and validate a workflow YAML against schemas/workflow.schema.json
 *   2. Resolve every atom ID through atoms/registry.json
 *   3. Verify track constraints (lite atoms must not appear in heavy-only positions)
 *   4. Check runtime preconditions (agentos_http, gh, etc.)
 *   5. Provide a WorkflowRunner that iterates phases and dispatches atoms
 *
 * E6 ≡ E1+E2 invariant: this loader does NOT perform structural artifact checks
 * directly — it always routes through E6.gate.local_precheck (Python) for
 * deterministic gate checks, regardless of track. Single source of truth.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as yaml from 'js-yaml';
import Ajv from 'ajv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');

// ─── Schema + Registry ───────────────────────────────────────────────────────

function loadSchema() {
  const path = resolve(ROOT, 'schemas', 'workflow.schema.json');
  return JSON.parse(readFileSync(path, 'utf8'));
}

function loadRegistry() {
  const path = resolve(ROOT, 'atoms', 'registry.json');
  return JSON.parse(readFileSync(path, 'utf8'));
}

// ─── Core loader ─────────────────────────────────────────────────────────────

/**
 * Load and validate a workflow YAML file.
 * Returns { workflow, phases, registry } ready for execution.
 *
 * @param {string} workflowPath - absolute or relative path to .yaml file
 * @param {object} options
 * @param {boolean} options.skipRuntimeChecks - skip gh/agentos-bin checks (for testing)
 * @returns {{ workflow, phases, registry, errors }}
 */
export function load(workflowPath, { skipRuntimeChecks = false } = {}) {
  const absPath = resolve(process.cwd(), workflowPath);
  if (!existsSync(absPath)) {
    throw new Error(`Workflow file not found: ${absPath}`);
  }

  const raw = readFileSync(absPath, 'utf8');
  const workflow = yaml.load(raw);

  // js-yaml 5 loads with CORE_SCHEMA, which no longer resolves the `<<`
  // merge key: a merge key now survives parsing as a literal "<<" property
  // instead of merging. The schema below (additionalProperties: false)
  // would reject it with a confusing validation error, so fail here with
  // an actionable one. Anchors/aliases still work; only `<<` is affected.
  assertNoMergeKeys(workflow, absPath);

  // 1. Schema validation
  const schema = loadSchema();
  const ajv = new Ajv({ allErrors: true });
  const validate = ajv.compile(schema);
  if (!validate(workflow)) {
    const errors = validate.errors.map(e => `  ${e.instancePath} ${e.message}`).join('\n');
    throw new Error(`Workflow schema validation failed for ${absPath}:\n${errors}`);
  }

  // 2. Registry resolution + track checks
  const registry = loadRegistry();
  const errors = [];

  for (const phase of workflow.phases) {
    for (const atomRef of (phase.atoms || [])) {
      const atomDef = registry.atoms[atomRef.id];
      if (!atomDef) {
        errors.push(`Phase "${phase.id}": unknown atom "${atomRef.id}"`);
        continue;
      }
      // Track constraint: lite workflow cannot use heavy atoms
      if (workflow.track === 'lite' && atomDef.track === 'heavy') {
        errors.push(`Phase "${phase.id}": lite workflow cannot use heavy atom "${atomRef.id}"`);
      }
    }
    // Gate atom check
    if (phase.gate?.atom) {
      const gateAtom = registry.atoms[phase.gate.atom];
      if (!gateAtom) {
        errors.push(`Phase "${phase.id}" gate: unknown atom "${phase.gate.atom}"`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Workflow validation errors in ${absPath}:\n${errors.map(e => `  - ${e}`).join('\n')}`);
  }

  // 3. Runtime requirement checks
  if (!skipRuntimeChecks) {
    const req = workflow.requires || {};
    if (req.agentos_bin) {
      checkBinOnPath('xflow', 'xflow CLI on PATH');
    }
    if (req.gh) {
      checkBinOnPath('gh', 'GitHub CLI (brew install gh)');
    }
  }

  return { workflow, phases: workflow.phases, registry };
}

// ─── Runtime checks ──────────────────────────────────────────────────────────

/**
 * Reject literal `<<` keys left behind by js-yaml 5's CORE_SCHEMA default,
 * which no longer resolves YAML merge keys. A workflow that relied on
 * merging must inline the merged mapping instead. Walks the whole parsed
 * document so the error names the exact location.
 */
function assertNoMergeKeys(value, workflowPath, trail = '$') {
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertNoMergeKeys(item, workflowPath, `${trail}[${i}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (key === '<<') {
        throw new Error(
          `Workflow uses a YAML merge key ("<<") at ${trail} in ${workflowPath}, which js-yaml 5 no longer resolves. Inline the merged mapping instead.`
        );
      }
      assertNoMergeKeys(child, workflowPath, `${trail}.${key}`);
    }
  }
}

import { spawnSync } from 'child_process';

function checkBinOnPath(bin, description) {
  const result = spawnSync('which', [bin], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`Required binary not found: ${bin} (${description})`);
  }
}

// ─── WorkflowRunner ──────────────────────────────────────────────────────────

/**
 * Dry-run: resolve all phases and atoms, print what would execute.
 * Does not mutate any state.
 */
export function dryRun(workflowPath, input = {}) {
  const { workflow, phases, registry } = load(workflowPath, { skipRuntimeChecks: true });

  console.log(`\n── Workflow: ${workflow.name} (${workflow.track}) ──`);
  console.log(`   requires: ${JSON.stringify(workflow.requires)}`);
  console.log(`   phases: ${phases.length}\n`);

  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    const atoms = (phase.atoms || []).map(a => {
      const def = registry.atoms[a.id];
      const impl = def?.script || def?.module || 'unknown';
      return `${a.id} [${def?.track || '?'}] → ${impl}`;
    });

    console.log(`  ${String(i + 1).padStart(2)}. [${phase.required ? 'required' : 'optional'}] ${phase.id}`);
    if (phase.label) console.log(`       ${phase.label}`);
    for (const a of atoms) {
      console.log(`       atom: ${a}`);
    }
    if (phase.gate) {
      console.log(`       gate: ${phase.gate.type}${phase.gate.atom ? ` via ${phase.gate.atom}` : ''}`);
    }
    console.log('');
  }

  return { workflow, phases };
}
