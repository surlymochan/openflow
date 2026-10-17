import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseJudgeOutput, sharedPrompt, buildPrompt } from '../bench/lib/prompt.mjs';
import { assertCatalog, scenarios } from '../bench/lib/scenarios.mjs';
import { relativizeText } from '../bench/lib/paths.mjs';
import { selectScenarios } from '../bench/lib/load-scenarios.mjs';
import { majorityVerdict, scoreRows } from '../bench/lib/score.mjs';

const repoRoot = process.cwd();

function readmeLabels() {
  const readme = readFileSync(resolve(repoRoot, 'bench/README.md'), 'utf8');
  const rows = new Map();
  for (const line of readme.split('\n')) {
    const match = line.match(/^\| ([a-z0-9-]+) \| ([a-z0-9-]+) \| (ACCEPT|REJECT) \|$/);
    if (match) rows.set(match[1], { category: match[2], expected: match[3] });
  }
  return rows;
}

describe('head-to-head catalog', () => {
  test('labels stay inside the published rubric table', () => {
    assertCatalog(scenarios);
    const published = readmeLabels();
    assert.equal(published.size, scenarios.length);
    for (const scenario of scenarios) {
      const row = published.get(scenario.id);
      assert.ok(row, scenario.id);
      assert.equal(row.category, scenario.category);
      assert.equal(row.expected, scenario.expected);
    }
  });

  test('package file list does not ship bench/', () => {
    const pkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
    assert.ok(!pkg.files.includes('bench'));
    assert.ok(!pkg.files.includes('bench/'));
    assert.ok(pkg.files.every((entry) => !entry.startsWith('bench')));
  });

  test('llm prompt is identical except for the skill prefix', () => {
    const claim = 'I watched the test fail and then pass.';
    const baseline = buildPrompt({ skillText: '', claim });
    const skilled = buildPrompt({ skillText: '# Skill\n\nWatch it fail.\n', claim });
    assert.equal(baseline, sharedPrompt(claim));
    assert.equal(skilled.endsWith(sharedPrompt(claim)), true);
    assert.match(skilled, /^# Skill/);
    const parsed = parseJudgeOutput('REASON: the test never failed\nVERDICT: REJECT\n');
    assert.equal(parsed.verdict, 'REJECT');
    assert.equal(parsed.reason, 'the test never failed');
  });

  test('score counts stay tied to the labels', () => {
    const rows = scenarios.map((scenario, index) => ({
      id: scenario.id,
      expected: scenario.expected,
      verdict: index % 2 === 0 ? 'REJECT' : 'ACCEPT',
    }));
    const scored = scoreRows(rows);
    assert.equal(scored.detection.hit + (scored.faulty - scored.detection.hit), scored.faulty);
    assert.equal(scored.accuracy.n, scenarios.length);
    assert.equal(majorityVerdict(['REJECT', 'REJECT', 'ACCEPT']), 'REJECT');
    assert.equal(majorityVerdict(['ACCEPT', 'REJECT']), 'TIE');
  });

  test('result paths stay relative to the repo and scenario sets split', () => {
    const root = '/workspace/agents/gity/release/openflow';
    const text = relativizeText(
      `${root}/bin/xflow.js /workspace/agents/gity/bench-deps/superpowers /tmp/of-bench-honest-add-abc /tmp/of-pack-xyz`,
      root,
    );
    assert.equal(text.includes('/workspace'), false);
    assert.match(text, /bin\/xflow\.js/);
    assert.match(text, /\.\.\/\.\.\/bench-deps\/superpowers/);
    assert.match(text, /<fixture>/);
    assert.match(text, /<tmp>/);
    const selected = selectScenarios({
      originals: scenarios,
      heldoutDir: resolve(repoRoot, 'bench/scenarios-heldout'),
      set: 'original',
    });
    assert.equal(selected.chosen.length, scenarios.length);
    assert.equal(selected.chosen.every((scenario) => scenario.set === 'original'), true);
    assert.equal(selected.chosen.some((scenario) => scenario.set === 'heldout'), false);
  });
});
