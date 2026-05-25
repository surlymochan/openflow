import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import yaml from 'js-yaml';

const ROOT = process.cwd();

function readRepoFile(path) {
  return readFileSync(resolve(ROOT, path), 'utf8');
}

function trackedFiles() {
  const result = spawnSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.split('\n').filter(Boolean);
}

function activeTrackedFiles() {
  return trackedFiles().filter((path) => {
    if (path.startsWith('specs/changes/')) return false;
    if (path.startsWith('node_modules/')) return false;
    if (path.startsWith('.as-xflow/')) return false;
    if (!existsSync(resolve(ROOT, path))) return false;
    return true;
  });
}

function filesWithExtensions(extensions) {
  return activeTrackedFiles().filter((path) => extensions.some((extension) => path.endsWith(extension)));
}

function hitsFor(files, phrase) {
  return files
    .filter((path) => readRepoFile(path).includes(phrase))
    .map((path) => `${path}: ${phrase}`);
}

describe('active surface drift scan', () => {
  test('package exposes a targeted drift scan script', () => {
    const pkg = JSON.parse(readRepoFile('package.json'));

    assert.equal(pkg.scripts['drift:scan'], 'node --test test/workflow-drift-scan.test.js');
  });

  test('retired partial pre-openissue gate literal is absent from active tracked text', () => {
    const retiredGateLiteral = ['pre-openissue', 'partial'].join('-');
    const files = filesWithExtensions(['.md', '.yaml', '.yml', '.json', '.js', '.py']);

    assert.deepEqual(hitsFor(files, retiredGateLiteral), []);
  });

  test('active narrative surfaces do not carry stale workflow manual phrases', () => {
    const files = filesWithExtensions(['.md', '.yaml', '.yml']);
    const stalePhrases = [
      ['44', '-atom catalog'].join(''),
      ['All ', '44', ' atoms are available'].join(''),
      ['65', ' atoms'].join(''),
      ['64', ' atoms'].join(''),
      ['63', ' atoms'].join(''),
      'K2 + K6 + K3 + K4 + A6 PR + A5',
      'A6 PR + A5 + K5',
      'K2 @ archive',
    ];
    const hits = stalePhrases.flatMap((phrase) => hitsFor(files, phrase));

    assert.deepEqual(hits, []);
  });

  test('public workflow surfaces do not carry case-specific product specializations', () => {
    const files = filesWithExtensions(['.md', '.yaml', '.yml', '.json', '.js'])
      .filter((path) => !path.startsWith('test/'));
    const caseSpecificPatterns = [
      /ticktick/i,
      /滴答/,
      /pc-todo/i,
      /todo-schedule/i,
      /pixel-h5/i,
      /things\s*3/i,
      /things3/i,
      /deskplan/i,
      /todolist/i,
    ];
    const hits = [];

    for (const file of files) {
      const text = readRepoFile(file);
      for (const pattern of caseSpecificPatterns) {
        if (pattern.test(text)) hits.push(`${file}: ${pattern}`);
      }
    }

    assert.deepEqual(hits, []);
  });

  test('plan and primary skill docs expose drift scan with current atom count', () => {
    const registry = JSON.parse(readRepoFile('atoms/registry.json'));
    const atomCount = Object.keys(registry.atoms).length;
    const rootReadme = readRepoFile('xflow/README.md');
    const cli = readRepoFile('bin/xflow.js');
    const goalSkill = readRepoFile('xflow/goal/SKILL.md');
    const planSkill = readRepoFile('xflow/plan/SKILL.md');
    const corpsSkill = readRepoFile('xflow/corps/SKILL.md');
    const takeinSkill = readRepoFile('xflow/takein/SKILL.md');
    const adoptionEvidence = readRepoFile('docs/adoption/README.md');
    const mergeWorkflowTemplate = readRepoFile('xflow/archive/templates/merge-workflow.md');
    const compatibility = readRepoFile('docs/compatibility.md');
    const specsReadme = readRepoFile('specs/README.md');
    const specsWorkflow = readRepoFile('specs/workflow.md');

    assert.match(rootReadme, /xflow:plan/);
    assert.match(rootReadme, /xflow assess/);
    assert.match(rootReadme, /xflow demo launch/);
    assert.match(rootReadme, /xflow launch audit/);
    assert.match(rootReadme, /xflow adoption init/);
    assert.match(rootReadme, /xflow adoption validate --json/);
    assert.match(rootReadme, /xflow package audit --check-registry --json/);
    assert.match(cli, /case 'goal'/);
    assert.match(cli, /case 'assess'/);
    assert.match(cli, /case 'demo'/);
    assert.match(cli, /case 'launch'/);
    assert.match(cli, /case 'adoption'/);
    assert.match(cli, /case 'package'/);
    assert.match(cli, /xflow goal set/);
    assert.match(goalSkill, /Advantage Over Codex Native Goal/);
    assert.match(planSkill, /Do not produce `tasks\.md`/);
    assert.match(corpsSkill, /Planning is shared with\s+`xflow:plan`/);
    assert.match(corpsSkill, /xflow corps --title/);
    assert.match(corpsSkill, /Do not manually simulate/);
    assert.match(corpsSkill, /workflow validate corps` is preflight only/);
    assert.match(corpsSkill, /corps_proof\.json/);
    assert.match(corpsSkill, /findings\.md/);
    assert.match(corpsSkill, /progress\.md/);
    assert.match(corpsSkill, /merge-workflow\.md/);
    assert.match(mergeWorkflowTemplate, /Capability Delta/);
    assert.match(takeinSkill, /npm run drift:scan/);
    assert.match(adoptionEvidence, /Acceptance Bar/);
    assert.match(adoptionEvidence, /xflow adoption init/);
    assert.match(adoptionEvidence, /xflow adoption validate --json/);
    assert.match(compatibility, /`xmem` remains outside the xflow namespace/);
    assert.match(specsReadme, /`xflow:plan` only writes `plan\.md`/);
    assert.match(specsReadme, /findings\.md/);
    assert.match(specsReadme, /progress\.md/);
    assert.match(specsReadme, /merge-workflow\.md.*workflow or capability deltas/);
    assert.doesNotMatch(specsReadme, /tasks\.md.*optional internal checklist/);
    assert.match(specsWorkflow, /`xflow:plan` is the only planning entry point/);
    assert.match(specsWorkflow, /Turn accepted scope\/design into a reusable `plan\.md`/);
    assert.match(specsWorkflow, /branch-worktree-ready/);
    assert.match(specsWorkflow, /workflow semantics or capability boundaries/);
  });

  test('split subskill docs use canonical phase names instead of local numeric ranges', () => {
    const splitDocs = [
      'xflow/plan/SKILL.md',
      'xflow/yolo/SKILL.md',
      'xflow/corps/SKILL.md',
    ];
    const retiredLocalRanges = [
      'phases 0-6',
      'phases 8-10',
      'phase 11',
      'steps 1-6',
      'steps 7-9',
      'phases 1–7 + 19',
      'phases 20–23',
    ];
    const hits = retiredLocalRanges.flatMap((phrase) => hitsFor(splitDocs, phrase));

    assert.deepEqual(hits, []);

    const yoloSkill = readRepoFile('xflow/yolo/SKILL.md');
    assert.match(yoloSkill, /`xflow:plan`/);
    assert.doesNotMatch(yoloSkill, /tasks\.md/);
    assert.doesNotMatch(yoloSkill, /xflow:openissue/);
    assert.doesNotMatch(yoloSkill, /xflow:archive/);
  });

  test('handoff keeps operation and risk headings instead of the old mixed focus heading', () => {
    const handoff = readRepoFile('HANDOFF.md');

    assert.doesNotMatch(handoff, /^## Current Focus$/m);
    assert.match(handoff, /^## 操作入口$/m);
    assert.match(handoff, /^## 近期风险$/m);
  });

  test('workflow archive phases keep A5 as publisher before PR creation', () => {
    for (const workflowPath of ['workflows/yolo.yaml', 'workflows/corps.yaml']) {
      const workflow = yaml.load(readRepoFile(workflowPath));
      const archive = workflow.phases.find((phase) => phase.id === 'archive');
      assert.ok(archive, `${workflowPath} must define an archive phase`);
      const atomIds = (archive.atoms || []).map((atomRef) => atomRef.id);

      for (const retiredAtom of ['K2.merge_snippets.apply', 'K5.archive.publish']) {
        assert.equal(atomIds.includes(retiredAtom), false, `${workflowPath} archive must not include ${retiredAtom}`);
      }
      if (workflowPath.endsWith('corps.yaml')) {
        assert.equal(atomIds.includes('A4.project.set_status'), false, 'corps archive must let A5 own issue close-out');
      }
      assert.equal(atomIds.includes('B3.status.transition'), false, `${workflowPath} archive must not add terminal B3 after A5`);

      const a5Index = atomIds.indexOf('A5.archive.commit_push_close');
      const a6Index = atomIds.indexOf('A6.pr.create');
      assert.notEqual(a5Index, -1, `${workflowPath} archive should include A5.archive.commit_push_close`);
      assert.notEqual(a6Index, -1, `${workflowPath} archive should include A6.pr.create`);
      assert.ok(a5Index < a6Index, `${workflowPath} archive must run A5 before A6`);
    }
  });

  test('K2 and K5 atom descriptions keep standalone archive helper boundary', () => {
    const registry = JSON.parse(readRepoFile('atoms/registry.json'));
    const k2Description = registry.atoms['K2.merge_snippets.apply'].description;
    const k5Description = registry.atoms['K5.archive.publish'].description;
    const k2Source = readRepoFile('xflow/atoms/k2_merge_snippets_apply.py');
    const k5Source = readRepoFile('xflow/atoms/k5_archive_publish.py');

    assert.match(k2Description, /Standalone merge-snippets-only helper/);
    assert.match(k2Source, /Standalone merge-snippets-only helper/);
    assert.match(k5Description, /Standalone terminal status helper/);
    assert.match(k5Description, /not the workflow archive publisher/);
    assert.match(k5Source, /Standalone terminal status helper/);
    assert.match(k5Source, /not the workflow archive publisher/);

    const stalePublisherPhrase = ['Final archive', 'publish'].join(' ');
    assert.doesNotMatch(k5Description, new RegExp(stalePublisherPhrase));
    assert.doesNotMatch(k5Source, new RegExp(stalePublisherPhrase));
  });
});
