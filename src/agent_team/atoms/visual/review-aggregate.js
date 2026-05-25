import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv from 'ajv';

import { readJsonFile, resolveChangePath, writeJsonFile } from '../../../core/change-artifacts.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const AGGREGATE_SCHEMA = JSON.parse(readFileSync(
  resolve(__dirname, '../../../../schemas/llm-design-review-aggregate.schema.json'),
  'utf8',
));
const ajv = new Ajv({ allErrors: true });
const validateAggregate = ajv.compile(AGGREGATE_SCHEMA);

function nowIso() {
  return new Date().toISOString();
}

export async function visualReviewAggregate(input = {}, context = {}) {
  const projectRoot = context.projectRoot || process.cwd();
  const changeId = context.changeId || input.change_id || null;
  if (!changeId) {
    throw new Error('change_id is required for H5b.visual.review.aggregate');
  }

  const reviewPath = resolveChangePath(projectRoot, changeId, 'llm_design_review.json');
  const benchmarkPath = resolveChangePath(projectRoot, changeId, 'visual_benchmark.json');
  const review = readJsonFile(reviewPath, {
    version: 1,
    phase: 'llm_design_review',
    summary: 'Visual review completed.',
    team_run: {},
  });
  const benchmark = readJsonFile(benchmarkPath, { version: 1, scenarios: [] });

  const scenarios = Array.isArray(benchmark.scenarios) ? benchmark.scenarios : [];
  const passing = scenarios.filter((scenario) => scenario.status === 'pass').length;
  const failing = scenarios.filter((scenario) => scenario.status && scenario.status !== 'pass').length;
  const summary = [
    review.summary || 'Visual review completed.',
    scenarios.length > 0
      ? `Benchmarked ${scenarios.length} scenario(s); ${passing} passed${failing > 0 ? `, ${failing} need follow-up` : ''}.`
      : 'No benchmark scenarios were captured.',
  ].join(' ');

  const merged = {
    ...review,
    version: review.version || 1,
    phase: 'llm_design_review',
    summary,
    benchmark_summary: {
      scenario_count: scenarios.length,
      passed_count: passing,
      needs_follow_up_count: failing,
      statuses: scenarios.map((scenario) => ({
        id: scenario.id || null,
        status: scenario.status || 'unknown',
      })),
    },
    worker_runs: {
      visual_review: {
        artifact_file: reviewPath,
      },
      visual_benchmark: {
        artifact_file: benchmarkPath,
      },
    },
    aggregated_at: nowIso(),
  };

  if (!validateAggregate(merged)) {
    const details = (validateAggregate.errors || []).map((error) => `${error.instancePath || '/'} ${error.message}`).join('; ');
    throw new Error(`llm_design_review aggregate schema invalid: ${details}`);
  }

  writeJsonFile(reviewPath, merged);
  return {
    ok: true,
    status: 'aggregated',
    artifact_file: reviewPath,
    payload: merged,
  };
}

export default visualReviewAggregate;
