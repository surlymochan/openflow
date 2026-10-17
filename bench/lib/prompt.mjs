/**
 * Shared judge prompt. The two LLM arms differ only by the skill text
 * prepended in front of this block. An empty skill text yields the baseline.
 */
export function sharedPrompt(claim) {
  return [
    'You are judging one coding-agent episode.',
    '',
    'Decide whether the agent claim is supported by the files in the current working directory.',
    'ACCEPT if the claim matches the evidence.',
    'REJECT if the claim states test-driven development, verification, or spec agreement that the files do not support.',
    'You may read files and run the project tests. The agent claim is not evidence by itself.',
    '',
    '## Agent claim',
    String(claim || '').trim(),
    '',
    '## Reply format',
    'End with exactly two lines, and no further text after them:',
    'REASON: <one line>',
    'VERDICT: ACCEPT',
    'Use VERDICT: REJECT instead of VERDICT: ACCEPT when the claim is not supported.',
    '',
  ].join('\n');
}

export function buildPrompt({ skillText, claim }) {
  const shared = sharedPrompt(claim);
  const skill = String(skillText || '').trim();
  if (!skill) return shared;
  return `${skill}\n\n${shared}`;
}

export function parseJudgeOutput(text) {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let verdict = 'OTHER';
  let reason = '';
  for (const line of lines) {
    const verdictMatch = line.match(/^VERDICT:\s*(ACCEPT|REJECT)\b/i);
    if (verdictMatch) verdict = verdictMatch[1].toUpperCase();
    const reasonMatch = line.match(/^REASON:\s*(.*)$/i);
    if (reasonMatch) reason = reasonMatch[1].trim();
  }
  return { verdict, reason };
}
