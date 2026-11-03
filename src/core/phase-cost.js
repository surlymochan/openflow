/**
 * Phase cost accounting (issue #5 P1-1).
 *
 * A workflow run records one entry per executed phase: how long the phase
 * took and, when an atom reported usage, how many tokens it burned. The
 * report compares the sum of phase durations against the run's wall clock;
 * the two must agree within tolerance (default 5%) or the accounting itself
 * is flagged as incomplete — an overhead number that cannot account for the
 * wall clock is not evidence.
 */

export const PHASE_COST_TOLERANCE_PCT = 5;

const TOTAL_KEYS = ['total_tokens', 'totalTokens', 'tokens_total', 'tokens'];
const INPUT_KEYS = ['input_tokens', 'inputTokens', 'prompt_tokens', 'promptTokens'];
const OUTPUT_KEYS = ['output_tokens', 'outputTokens', 'completion_tokens', 'completionTokens'];

function pickNumber(source, keys) {
  if (!source || typeof source !== 'object') return null;
  for (const key of keys) {
    const value = Number(source[key]);
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return null;
}

/**
 * Extract a normalized { input, output, total } token usage from an atom
 * result, looking at the result itself and at common nested containers
 * (`usage`, `token_usage`, `metrics`). Returns null when the atom reported
 * nothing usable.
 */
export function extractTokenUsage(result) {
  if (!result || typeof result !== 'object') return null;
  const containers = [result, result.usage, result.token_usage, result.metrics];
  for (const container of containers) {
    if (!container || typeof container !== 'object') continue;
    const input = pickNumber(container, INPUT_KEYS);
    const output = pickNumber(container, OUTPUT_KEYS);
    let total = pickNumber(container, TOTAL_KEYS);
    if (total === null && (input !== null || output !== null)) {
      total = (input || 0) + (output || 0);
    }
    if (total !== null || input !== null || output !== null) {
      return { input: input || 0, output: output || 0, total: total || 0 };
    }
  }
  return null;
}

export function emptyTokenUsage() {
  return { input: 0, output: 0, total: 0 };
}

export function addTokenUsage(accumulator, usage) {
  if (!usage) return accumulator;
  accumulator.input += usage.input || 0;
  accumulator.output += usage.output || 0;
  accumulator.total += usage.total || 0;
  return accumulator;
}

/**
 * Build the per-phase cost report for one workflow run.
 *
 * phases: [{ phase_id, status, duration_ms, tokens? }]
 * wallClockMs: measured wall clock of the whole run.
 */
export function buildPhaseCostReport({ phases = [], wallClockMs = null, tolerancePct = PHASE_COST_TOLERANCE_PCT, recordedAt = null } = {}) {
  const entries = phases.map((phase) => {
    const durationMs = Number.isFinite(Number(phase.duration_ms)) ? Math.max(0, Math.round(Number(phase.duration_ms))) : 0;
    return {
      phase_id: phase.phase_id || phase.id || 'unknown',
      status: phase.status || 'completed',
      duration_ms: durationMs,
      tokens: phase.tokens
        ? {
            input: phase.tokens.input || 0,
            output: phase.tokens.output || 0,
            total: phase.tokens.total || 0,
          }
        : null,
    };
  });

  const totalPhaseMs = entries.reduce((sum, entry) => sum + entry.duration_ms, 0);
  const wall = Number.isFinite(Number(wallClockMs)) && Number(wallClockMs) >= 0 ? Math.round(Number(wallClockMs)) : null;
  const unaccountedMs = wall === null ? null : wall - totalPhaseMs;
  const driftPct = wall !== null && wall > 0
    ? Math.round((Math.abs(unaccountedMs) / wall) * 10000) / 100
    : null;

  for (const entry of entries) {
    entry.duration_share = totalPhaseMs > 0
      ? Math.round((entry.duration_ms / totalPhaseMs) * 10000) / 100
      : 0;
  }

  const tokens = entries.reduce(
    (acc, entry) => (entry.tokens ? addTokenUsage(acc, entry.tokens) : acc),
    emptyTokenUsage(),
  );
  const anyTokens = entries.some((entry) => entry.tokens && entry.tokens.total > 0);

  return {
    phases: entries,
    total_phase_ms: totalPhaseMs,
    wall_clock_ms: wall,
    unaccounted_ms: unaccountedMs,
    drift_pct: driftPct,
    tolerance_pct: tolerancePct,
    within_tolerance: driftPct === null ? null : driftPct <= tolerancePct,
    tokens: anyTokens ? tokens : null,
    recorded_at: recordedAt || new Date().toISOString(),
  };
}
