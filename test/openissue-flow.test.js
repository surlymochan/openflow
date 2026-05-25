import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = process.cwd();

function runHydrate(projectRoot, changeId, title = 'Preserve frozen docs') {
  const code = `
import importlib.util
import pathlib
import sys

repo_root = pathlib.Path(sys.argv[1])
project_root = pathlib.Path(sys.argv[2])
change_id = sys.argv[3]
title = sys.argv[4]
module_path = repo_root / "xflow" / "openissue" / "scripts" / "open_issue_flow.py"
spec = importlib.util.spec_from_file_location("open_issue_flow", module_path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.hydrate_change_docs(
    project_root,
    change_id,
    title,
    "## Background\\nIssue body context.\\n\\n## Scope\\nIssue body scope.\\n\\n## Acceptance Criteria\\nIssue acceptance.",
    "issue-123-preserve-docs",
)
`;
  return spawnSync('python3', ['-c', code, REPO_ROOT, projectRoot, changeId, title], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
}

describe('openissue flow hydration', () => {
  test('resolves issue repo from project-local xflow config when repo arg is absent', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'as-xflow-openissue-config-'));
    try {
      mkdirSync(resolve(projectRoot, '.as-xflow'), { recursive: true });
      writeFileSync(resolve(projectRoot, '.as-xflow', 'config.json'), JSON.stringify({
        version: 1,
        issue_routing: {
          repo: 'owner/internal-tracker',
        },
      }, null, 2), 'utf8');

      const code = `
import importlib.util
import pathlib
import sys

repo_root = pathlib.Path(sys.argv[1])
project_root = pathlib.Path(sys.argv[2])
module_path = repo_root / "xflow" / "openissue" / "scripts" / "open_issue_flow.py"
spec = importlib.util.spec_from_file_location("open_issue_flow", module_path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class Args:
    project_root = str(project_root)
    repo = None

print(module.resolve_issue_repo(Args()))
`;

      const result = spawnSync('python3', ['-c', code, REPO_ROOT, projectRoot], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      });

      assert.equal(result.status, 0, result.stderr || result.stdout);
      assert.equal(result.stdout.trim(), 'owner/internal-tracker');
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('preserves authored proposal and plan content', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'as-xflow-openissue-preserve-'));
    try {
      const changeRoot = resolve(projectRoot, 'specs', 'changes', 'chg-preserve');
      mkdirSync(changeRoot, { recursive: true });
      writeFileSync(resolve(changeRoot, 'proposal.md'), [
        '# Proposal',
        '',
        '## Objective',
        '',
        '- Preserve this proposal.',
        '',
        '## Acceptance Intent',
        '',
        '- Keep the exact acceptance text.',
        '',
      ].join('\n'), 'utf8');
      writeFileSync(resolve(changeRoot, 'plan.md'), [
        '# Plan',
        '',
        '## Target Outcome',
        '',
        '- Preserve this plan.',
        '',
        '## Verification Commands',
        '',
        '```bash',
        'node --test kept.test.js',
        '```',
        '',
      ].join('\n'), 'utf8');

      const result = runHydrate(projectRoot, 'chg-preserve');

      assert.equal(result.status, 0, result.stderr || result.stdout);
      const proposal = readFileSync(resolve(changeRoot, 'proposal.md'), 'utf8');
      const plan = readFileSync(resolve(changeRoot, 'plan.md'), 'utf8');
      assert.match(proposal, /Preserve this proposal/);
      assert.match(proposal, /Keep the exact acceptance text/);
      assert.doesNotMatch(proposal, /Track execution through issue branch/);
      assert.match(plan, /Preserve this plan/);
      assert.match(plan, /node --test kept\.test\.js/);
      assert.doesNotMatch(plan, /Fill in the smallest proof commands/);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('hydrates untouched scaffold placeholders', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'as-xflow-openissue-placeholder-'));
    try {
      const changeRoot = resolve(projectRoot, 'specs', 'changes', 'chg-placeholder');
      mkdirSync(changeRoot, { recursive: true });
      writeFileSync(resolve(changeRoot, 'proposal.md'), [
        '# Proposal',
        '',
        '## Objective',
        '',
        '-',
        '',
        '## Chosen Path',
        '',
        '-',
        '',
        '## Acceptance Intent',
        '',
        '-',
        '',
      ].join('\n'), 'utf8');
      writeFileSync(resolve(changeRoot, 'plan.md'), [
        '# Plan',
        '',
        '## Target Outcome',
        '',
        '-',
        '',
        '## Verification Commands',
        '',
        '```bash',
        '# Fill in the smallest proof commands',
        '```',
        '',
      ].join('\n'), 'utf8');

      const result = runHydrate(projectRoot, 'chg-placeholder', 'Hydrate placeholders');

      assert.equal(result.status, 0, result.stderr || result.stdout);
      const proposal = readFileSync(resolve(changeRoot, 'proposal.md'), 'utf8');
      const plan = readFileSync(resolve(changeRoot, 'plan.md'), 'utf8');
      const issue = readFileSync(resolve(changeRoot, 'issue.md'), 'utf8');
      assert.match(proposal, /Hydrate placeholders/);
      assert.match(proposal, /Track execution through issue branch `issue-123-preserve-docs`/);
      assert.match(plan, /Hydrate placeholders/);
      assert.match(plan, /Fill in the smallest proof commands for this change/);
      assert.match(issue, /Hydrate placeholders/);
      assert.match(issue, /Issue body scope/);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
