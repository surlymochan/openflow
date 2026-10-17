export function rate(hit, total) {
  if (!total) return null;
  return hit / total;
}

export function formatRate(hit, total) {
  if (!total) return 'n/a';
  const pct = ((hit / total) * 100).toFixed(1);
  return `${hit}/${total} (${pct}%)`;
}

export function scoreRows(rows) {
  const honest = rows.filter((row) => row.expected === 'ACCEPT');
  const faulty = rows.filter((row) => row.expected === 'REJECT');
  const detected = faulty.filter((row) => row.verdict === 'REJECT').length;
  const falsePositives = honest.filter((row) => row.verdict === 'REJECT').length;
  const correct = rows.filter((row) => row.verdict === row.expected).length;
  return {
    scenarios: rows.length,
    honest: honest.length,
    faulty: faulty.length,
    detection: { hit: detected, n: faulty.length, rate: rate(detected, faulty.length) },
    falsePositive: { hit: falsePositives, n: honest.length, rate: rate(falsePositives, honest.length) },
    accuracy: { correct, n: rows.length, rate: rate(correct, rows.length) },
    detectionText: formatRate(detected, faulty.length),
    falsePositiveText: formatRate(falsePositives, honest.length),
    accuracyText: formatRate(correct, rows.length),
  };
}

export function majorityVerdict(votes) {
  const counts = { ACCEPT: 0, REJECT: 0 };
  for (const vote of votes) {
    if (vote === 'ACCEPT' || vote === 'REJECT') counts[vote] += 1;
  }
  if (counts.ACCEPT > counts.REJECT) return 'ACCEPT';
  if (counts.REJECT > counts.ACCEPT) return 'REJECT';
  return 'TIE';
}

export function agreement(votes, verdict) {
  if (!votes.length || verdict === 'TIE') {
    if (!votes.length) return 0;
    const mode = Math.max(
      votes.filter((vote) => vote === 'ACCEPT').length,
      votes.filter((vote) => vote === 'REJECT').length,
    );
    return mode / votes.length;
  }
  return votes.filter((vote) => vote === verdict).length / votes.length;
}

export function scoreLlmRecords(records, scenarios) {
  const byScenario = new Map();
  for (const record of records) {
    if (record.type === 'meta') continue;
    if (!byScenario.has(record.scenario)) byScenario.set(record.scenario, []);
    byScenario.get(record.scenario).push(record);
  }
  const rows = scenarios.map((scenario) => {
    const repeats = (byScenario.get(scenario.id) || []).slice().sort((a, b) => a.repeat - b.repeat);
    const votes = repeats.map((repeat) => repeat.verdict);
    const verdict = votes.length ? majorityVerdict(votes) : 'MISSING';
    return {
      id: scenario.id,
      category: scenario.category,
      expected: scenario.expected,
      description: scenario.description,
      verdict,
      votes,
      repeats: repeats.length,
      agreement: votes.length ? agreement(votes, verdict === 'MISSING' ? 'TIE' : verdict) : 0,
      reasons: repeats.map((repeat) => repeat.reason || ''),
    };
  });
  const scored = scoreRows(rows.filter((row) => row.verdict !== 'MISSING'));
  const present = rows.filter((row) => row.verdict !== 'MISSING');
  const meanAgreement = present.length
    ? present.reduce((sum, row) => sum + row.agreement, 0) / present.length
    : null;
  return { rows, ...scored, meanAgreement, missing: rows.length - present.length };
}
