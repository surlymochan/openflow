#!/usr/bin/env node
/**
 * Deterministic head-to-head runner: OpenFlow arm + overhead.
 * Merges any bench/results/llm-*.jsonl files that are already present.
 * Does not invoke a model.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'url';
import { renderChart } from './lib/chart.mjs';
import { collectEnvironment } from './lib/env.mjs';
import { selectScenarios } from './lib/load-scenarios.mjs';
import { measureOverhead, resolveSuperpowersDir } from './lib/overhead.mjs';
import { runOpenflowArm } from './lib/openflow-arm.mjs';
import { relativize } from './lib/paths.mjs';
import { assertCatalog, scenarios } from './lib/scenarios.mjs';
import { scoreLlmRecords, scoreRows } from './lib/score.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const benchRoot = join(repoRoot, 'bench');

function parseArgs(argv) {
  const args = {
    skipOverhead: false,
    out: join(benchRoot, 'results'),
    concurrency: 4,
    superpowersDir: resolveSuperpowersDir(),
    date: new Date().toISOString().slice(0, 10),
    set: 'all',
    only: '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--skip-overhead') {
      args.skipOverhead = true;
      continue;
    }
    const value = argv[i + 1];
    if (!key.startsWith('--') || value === undefined) {
      throw new Error(`Unknown argument ${key}`);
    }
    i += 1;
    if (key === '--out') args.out = resolve(value);
    else if (key === '--concurrency') args.concurrency = Number(value);
    else if (key === '--superpowers-dir') args.superpowersDir = resolveSuperpowersDir(value);
    else if (key === '--date') args.date = value;
    else if (key === '--set') args.set = value;
    else if (key === '--only') args.only = value;
    else throw new Error(`Unknown argument ${key}`);
  }
  return args;
}

function publishScenarios() {
  const root = join(benchRoot, 'scenarios');
  mkdirSync(root, { recursive: true });
  for (const scenario of scenarios) {
    const dir = join(root, scenario.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'claim.md'), `${scenario.claim.trim()}\n`);
    writeFileSync(join(dir, 'scenario.json'), `${JSON.stringify(scenario, null, 2)}\n`);
  }
}

function csvCell(value) {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function toCsv(rows) {
  const header = ['set', 'scenario', 'category', 'expected', 'verdict', 'correct', 'first_gate', 'failed_gates', 'message'];
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push([
      row.set || 'original',
      row.id,
      row.category,
      row.expected,
      row.verdict,
      row.verdict === row.expected ? 'yes' : 'no',
      row.firstGate,
      (row.failedGates || []).join('|'),
      row.message,
    ].map(csvCell).join(','));
  }
  return `${lines.join('\n')}\n`;
}

function loadLlmFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.startsWith('llm-') && name.endsWith('.jsonl'))
    .sort()
    .map((name) => {
      const records = readFileSync(join(dir, name), 'utf8')
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line));
      const meta = records.find((record) => record.type === 'meta') || {};
      const arm = meta.arm || name.split('-')[1] || 'llm';
      const model = meta.model || 'unknown';
      return {
        file: name,
        arm,
        model,
        label: `${arm}/${model}`,
        records,
      };
    });
}

function bytes(value) {
  if (value == null) return 'n/a';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MiB`;
}

function latencyLine(sample) {
  if (!sample) return 'n/a';
  return `median ${sample.medianMs} ms, p95 ${sample.p95Ms} ms, n=${sample.n}, last exit ${sample.lastExitCode}`;
}

function setSection(title, scored, rows) {
  const lines = [];
  lines.push(`## ${title}`);
  lines.push('');
  if (!rows.length) {
    lines.push('No scenarios in this set.');
    lines.push('');
    return lines;
  }
  lines.push('| Metric | Result |');
  lines.push('| --- | --- |');
  lines.push(`| Detection rate | ${scored.detectionText} |`);
  lines.push(`| False-positive rate | ${scored.falsePositiveText} |`);
  lines.push(`| Accuracy | ${scored.accuracyText} |`);
  lines.push('');
  lines.push('| Scenario | Category | Label | Verdict | First gate | Message |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const row of rows) {
    const message = String(row.message || '').replaceAll('|', '/').replaceAll('\n', ' ');
    lines.push(`| ${row.id} | ${row.category} | ${row.expected} | ${row.verdict} | ${row.firstGate || '—'} | ${message || '—'} |`);
  }
  lines.push('');
  return lines;
}

function summaryMarkdown({ environment, overhead, sets, llmArms, commands, scenarioSet }) {
  const lines = [];
  lines.push('# Head-to-head summary');
  lines.push('');
  lines.push(`Generated ${environment.date}. Verdicts for the OpenFlow arm come from the atoms listed below. Rates use the labels in bench/README.md. Scenario set: \`${scenarioSet}\`.`);
  lines.push('');
  lines.push('## Environment');
  lines.push('');
  lines.push(`- CPU: ${environment.cpuModel} (${environment.cores} cores)`);
  lines.push(`- OS: ${environment.os}`);
  lines.push(`- Kernel: ${environment.kernel}`);
  lines.push(`- Node: ${environment.node} (${environment.nodePath})`);
  lines.push(`- Python: ${environment.python}`);
  lines.push(`- OpenFlow commit: ${environment.openflowCommit} (${environment.openflowBranch})`);
  lines.push(`- superpowers: ${environment.superpowersTag || 'untagged'} ${environment.superpowersCommit}`);
  lines.push(`- superpowers checkout: ${environment.superpowersDir}`);
  lines.push('');
  lines.push('## Commands');
  lines.push('');
  for (const command of commands) lines.push(`- \`${command}\``);
  lines.push('');
  lines.push('## OpenFlow arm');
  lines.push('');
  lines.push(...setSection('Original', sets.original.scored, sets.original.rows));
  lines.push(...setSection('Held-out', sets.heldout.scored, sets.heldout.rows));
  lines.push(...setSection('Combined', sets.combined.scored, sets.combined.rows));
  if (overhead) {
    lines.push('## Overhead');
    lines.push('');
    lines.push(`- OpenFlow npm tarball: ${bytes(overhead.openflowPack.tarballBytes)} (${overhead.openflowPack.fileCount} files), unpacked ${bytes(overhead.openflowPack.unpackedBytes)}.`);
    lines.push(`- \`npm pack --dry-run\` bench entries: ${overhead.openflowDryRun.benchIncluded.length ? overhead.openflowDryRun.benchIncluded.join(', ') : 'none'}.`);
    lines.push(`- superpowers skills/ + hooks/: ${bytes(overhead.superpowersCore.bytes)} across ${overhead.superpowersCore.fileCount} files.`);
    lines.push(`- superpowers shipped plugin payload (skills, hooks, host manifests, package entry): ${bytes(overhead.superpowersShipped.bytes)} across ${overhead.superpowersShipped.fileCount} files.`);
    lines.push(`- I6b.tdd.proof_validate: ${latencyLine(overhead.latency.i6b)}`);
    lines.push(`- I6c.tdd.quality_review: ${latencyLine(overhead.latency.i6c)}`);
    lines.push(`- xflow workflow validate yolo: ${latencyLine(overhead.latency.workflowValidate)}`);
    lines.push(`- superpowers hooks/session-start: ${latencyLine(overhead.latency.sessionStart)}`);
    const injected = overhead.context.superpowers;
    const skill = overhead.context.openflow;
    lines.push(`- superpowers session-start injected context: ${injected.injectedContextBytes} bytes, about ${injected.approxTokens} tokens (bytes/4, approximate). Raw stdout ${injected.stdoutBytes} bytes (${injected.shape}).`);
    lines.push(`- OpenFlow skill entry ${skill.skillEntry}: ${skill.bytes} bytes, about ${skill.approxTokens} tokens (bytes/4, approximate). ${skill.tokenNote}`);
    lines.push(`- LLM-arm skill text (test-driven-development + verification-before-completion), not injected at session start: ${injected.llmArmSkillBytes} bytes, about ${injected.llmArmSkillApproxTokens} tokens (bytes/4, approximate).`);
    lines.push('');
  }
  lines.push('## LLM arms');
  lines.push('');
  if (!llmArms.length) {
    lines.push('No `llm-*.jsonl` files were present. The superpowers and baseline arms were not run.');
  } else {
    lines.push('| Arm | Detection | False-positive | Accuracy | Mean repeat agreement |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const arm of llmArms) {
      const agreement = arm.scored.meanAgreement == null ? 'n/a' : `${(arm.scored.meanAgreement * 100).toFixed(1)}%`;
      lines.push(`| ${arm.label} | ${arm.scored.detectionText} | ${arm.scored.falsePositiveText} | ${arm.scored.accuracyText} | ${agreement} |`);
    }
    lines.push('');
    lines.push('LLM verdicts are majority votes. A tie is `TIE`, which counts as incorrect and as neither a detection nor a false positive. Agreement is the share of repeats that match the majority (the larger side when the vote ties).');
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function resultsBlock({ sets, llmArms, overhead }) {
  const lines = [];
  lines.push('| Arm | Detection | False-positive rate | Accuracy |');
  lines.push('| --- | --- | --- | --- |');
  lines.push(`| openflow original | ${sets.original.scored.detectionText} | ${sets.original.scored.falsePositiveText} | ${sets.original.scored.accuracyText} |`);
  lines.push(`| openflow held-out | ${sets.heldout.scored.detectionText} | ${sets.heldout.scored.falsePositiveText} | ${sets.heldout.scored.accuracyText} |`);
  lines.push(`| openflow combined | ${sets.combined.scored.detectionText} | ${sets.combined.scored.falsePositiveText} | ${sets.combined.scored.accuracyText} |`);
  for (const arm of llmArms) {
    lines.push(`| ${arm.label} | ${arm.scored.detectionText} | ${arm.scored.falsePositiveText} | ${arm.scored.accuracyText} |`);
  }
  if (!llmArms.length) {
    lines.push('| superpowers | not run | not run | not run |');
    lines.push('| baseline | not run | not run | not run |');
  }
  lines.push('');
  lines.push('Per-scenario OpenFlow outcomes, overhead figures, and the environment block are in [results/summary.md](results/summary.md). The chart is [results/chart.svg](results/chart.svg).');
  if (overhead) {
    lines.push('');
    lines.push(`Install size this run: OpenFlow tarball ${overhead.openflowPack.tarballBytes} bytes, unpacked ${overhead.openflowPack.unpackedBytes} bytes; superpowers skills/ + hooks/ ${overhead.superpowersCore.bytes} bytes. Session-start context ${overhead.context.superpowers.injectedContextBytes} bytes versus yolo skill entry ${overhead.context.openflow.bytes} bytes.`);
  }
  return lines.join('\n');
}

function fillMarker(markdown, marker, body) {
  const start = `<!-- ${marker}:start -->`;
  const end = `<!-- ${marker}:end -->`;
  const pattern = new RegExp(`${start}[\\s\\S]*?${end}`);
  if (!pattern.test(markdown)) throw new Error(`README is missing ${marker} markers`);
  return markdown.replace(pattern, `${start}\n${body}\n${end}`);
}

async function main() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 22) {
    console.error(`Node ${process.version} is below 22. Run this harness with Node 22 on PATH.`);
    process.exit(1);
  }
  const args = parseArgs(process.argv.slice(2));
  assertCatalog(scenarios);
  publishScenarios();
  const selection = selectScenarios({
    originals: scenarios,
    heldoutDir: join(benchRoot, 'scenarios-heldout'),
    set: args.set,
    only: args.only,
  });
  const rows = await runOpenflowArm({
    repoRoot,
    scenarios: selection.chosen,
    concurrency: args.concurrency,
  });
  const originalRows = rows.filter((row) => row.set !== 'heldout');
  const heldoutRows = rows.filter((row) => row.set === 'heldout');
  const sets = {
    original: { scored: scoreRows(originalRows), rows: originalRows },
    heldout: { scored: scoreRows(heldoutRows), rows: heldoutRows },
    combined: { scored: scoreRows(rows), rows },
  };
  const environment = collectEnvironment({ repoRoot, superpowersDir: args.superpowersDir });
  const overhead = args.skipOverhead ? null : measureOverhead({ repoRoot, superpowersDir: args.superpowersDir });
  const llmArms = loadLlmFiles(args.out).map((file) => ({
    ...file,
    scored: scoreLlmRecords(file.records, selection.chosen),
  }));
  const commands = [
    'node bench/run.mjs --set original|heldout|all --only id1,id2',
    'node bin/xflow.js atom run I6a.tdd.run --project-root <fixture> --change-id <id> --phase red|green --test-command <cmd>',
    'node bin/xflow.js atom run I6b.tdd.proof_validate --project-root <fixture> --change-id <id> --phase red|green',
    'node bin/xflow.js atom run I6c.tdd.quality_review --project-root <fixture> --change-id <id>',
    'node bin/xflow.js atom run J1.tests.run --project-root <fixture> --change-id <id>',
    'node bin/xflow.js atom run J4a.spec_consistency.structural --project-root <fixture> --change-id <id>',
    'node bin/xflow.js atom run J4b.spec_delta.review --project-root <fixture> --change-id <id>',
    'node bin/xflow.js atom run E6.gate.local_precheck --project-root <fixture> --change-id <id> --phase pre-archive --json',
    'node bin/xflow.js workflow validate yolo --project-root <openflow checkout>',
    'bash <superpowers>/hooks/session-start',
    'npm pack --json --pack-destination <tmp>',
    'npm pack --dry-run --json',
    'node bench/llm-arm.mjs --arm superpowers|baseline --runner "<cmd>" --model <name> --repeats N --concurrency N --set original|heldout|all --only id1,id2',
  ];
  const payload = relativize({
    scenarioSet: args.set,
    environment,
    commands,
    sets,
    openflow: sets.combined,
    overhead,
    llm: llmArms.map((arm) => ({
      file: arm.file,
      arm: arm.arm,
      model: arm.model,
      scored: {
        detection: arm.scored.detection,
        falsePositive: arm.scored.falsePositive,
        accuracy: arm.scored.accuracy,
        detectionText: arm.scored.detectionText,
        falsePositiveText: arm.scored.falsePositiveText,
        accuracyText: arm.scored.accuracyText,
        meanAgreement: arm.scored.meanAgreement,
        missing: arm.scored.missing,
      },
      rows: arm.scored.rows,
    })),
  }, repoRoot);
  mkdirSync(args.out, { recursive: true });
  const stem = join(args.out, `openflow-${args.date}`);
  writeFileSync(`${stem}.json`, `${JSON.stringify(payload, null, 2)}\n`);
  writeFileSync(`${stem}.csv`, toCsv(payload.sets.combined.rows));
  writeFileSync(join(args.out, 'summary.md'), summaryMarkdown({
    environment: payload.environment,
    overhead: payload.overhead,
    sets: payload.sets,
    llmArms: llmArms.map((arm, index) => ({ ...arm, scored: payload.llm[index].scored, rows: payload.llm[index].rows })),
    commands: payload.commands,
    scenarioSet: args.set,
  }));
  const chartArms = [];
  if (payload.sets.heldout.rows.length) {
    chartArms.push({
      name: 'openflow-original',
      detail: 'original',
      detection: payload.sets.original.scored.detection.rate,
      falsePositive: payload.sets.original.scored.falsePositive.rate,
    });
    chartArms.push({
      name: 'openflow-heldout',
      detail: 'held-out',
      detection: payload.sets.heldout.scored.detection.rate,
      falsePositive: payload.sets.heldout.scored.falsePositive.rate,
    });
  } else {
    chartArms.push({
      name: 'openflow',
      detail: 'deterministic',
      detection: payload.sets.combined.scored.detection.rate,
      falsePositive: payload.sets.combined.scored.falsePositive.rate,
    });
  }
  chartArms.push(...llmArms.map((arm, index) => ({
    name: arm.arm,
    detail: arm.model,
    detection: payload.llm[index].scored.detection.rate,
    falsePositive: payload.llm[index].scored.falsePositive.rate,
  })));
  writeFileSync(join(args.out, 'chart.svg'), renderChart(chartArms));
  const readmePath = join(benchRoot, 'README.md');
  if (existsSync(readmePath)) {
    const readme = readFileSync(readmePath, 'utf8');
    writeFileSync(readmePath, fillMarker(readme, 'results', resultsBlock({
      sets: payload.sets,
      llmArms: llmArms.map((arm, index) => ({ ...arm, scored: payload.llm[index].scored })),
      overhead: payload.overhead,
    })));
  }
  const combined = payload.sets.combined.scored;
  console.log(`openflow original detection ${payload.sets.original.scored.detectionText}`);
  console.log(`openflow held-out detection ${payload.sets.heldout.scored.detectionText}`);
  console.log(`openflow combined detection ${combined.detectionText}`);
  console.log(`openflow combined false-positive ${combined.falsePositiveText}`);
  console.log(`openflow combined accuracy ${combined.accuracyText}`);
  console.log(`${stem}.json`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
