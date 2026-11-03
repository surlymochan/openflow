import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = process.cwd();

function makeProjectRoot() {
  return mkdtempSync(join(tmpdir(), 'evalid-init-gitignore-'));
}

function cleanupProjectRoot(root) {
  rmSync(root, { recursive: true, force: true });
}

function runInit(projectRoot, extraArgs = []) {
  const result = spawnSync('node', ['bin/xflow.js', 'init', '--project-root', projectRoot, '--json', ...extraArgs], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
  return JSON.parse(result.stdout);
}

function git(projectRoot, args) {
  const result = spawnSync('git', args, { cwd: projectRoot, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

describe('xflow init .gitignore handling', () => {
  test('creates .gitignore on a fresh project and keeps runtime artifacts out of git status', () => {
    const projectRoot = makeProjectRoot();
    try {
      const payload = runInit(projectRoot);
      const gitignorePath = resolve(projectRoot, '.gitignore');

      assert.equal(payload.gitignore.created, true);
      assert.deepEqual(payload.gitignore.added, ['.as-xflow/', 'specs/changes/']);
      const content = readFileSync(gitignorePath, 'utf8');
      assert.match(content, /^\.as-xflow\/$/m);
      assert.match(content, /^specs\/changes\/$/m);

      // Sample project carrying evalid runtime/evidence artifacts: after the
      // generated .gitignore is committed, git status must stay clean.
      git(projectRoot, ['init', '-b', 'main']);
      git(projectRoot, ['config', 'user.name', 'Test']);
      git(projectRoot, ['config', 'user.email', 'test@example.com']);
      git(projectRoot, ['add', '.gitignore']);
      git(projectRoot, ['commit', '-m', 'init']);

      writeFileSync(resolve(projectRoot, '.as-xflow', 'state.sqlite'), 'state');
      mkdirSync(resolve(projectRoot, '.as-xflow', 'logs'), { recursive: true });
      writeFileSync(resolve(projectRoot, '.as-xflow', 'logs', 'execution.ndjson'), '{}\n');
      mkdirSync(resolve(projectRoot, 'specs', 'changes', 'demo-change'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'specs', 'changes', 'demo-change', 'corps_proof.json'), '{}');
      writeFileSync(resolve(projectRoot, 'specs', 'changes', 'demo-change', 'status.json'), '{}');

      assert.equal(git(projectRoot, ['status', '--porcelain']), '');
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('merges into an existing .gitignore without touching existing lines', () => {
    const projectRoot = makeProjectRoot();
    try {
      const gitignorePath = resolve(projectRoot, '.gitignore');
      // `.as-xflow` without the trailing slash must count as already covered.
      const original = 'node_modules/\n.as-xflow\ncustom-*.tmp\n';
      writeFileSync(gitignorePath, original, 'utf8');

      const payload = runInit(projectRoot);

      assert.equal(payload.gitignore.created, false);
      assert.deepEqual(payload.gitignore.added, ['specs/changes/']);
      const content = readFileSync(gitignorePath, 'utf8');
      assert.ok(content.startsWith(original), 'existing lines must be preserved verbatim');
      assert.match(content, /^specs\/changes\/$/m);
      assert.equal(content.match(/^\.as-xflow\/?$/gm).length, 1, 'no duplicate .as-xflow entry may be appended');
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('is idempotent: re-running init (with --force) adds nothing twice', () => {
    const projectRoot = makeProjectRoot();
    try {
      runInit(projectRoot);
      const gitignorePath = resolve(projectRoot, '.gitignore');
      const afterFirst = readFileSync(gitignorePath, 'utf8');

      const payload = runInit(projectRoot, ['--force']);

      assert.deepEqual(payload.gitignore.added, []);
      assert.equal(readFileSync(gitignorePath, 'utf8'), afterFirst);
      assert.ok(existsSync(resolve(projectRoot, '.as-xflow', 'config.json')));
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });
});
