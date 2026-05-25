import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = process.cwd();

describe('local release checklist', () => {
  test('package scripts expose safe xflow skill sync as part of local release', () => {
    const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8'));

    assert.equal(pkg.scripts.test, 'node scripts/run-tests.mjs');
    assert.equal(pkg.scripts['drift:scan'], 'node --test test/workflow-drift-scan.test.js');
    assert.equal(pkg.scripts.doctor, 'node bin/xflow.js doctor');
    assert.equal(pkg.scripts.verify, 'npm test');
    assert.equal(pkg.scripts['skill:sync'], 'sh xflow/scripts/sync_installed_xflow_skill.sh');
    assert.equal(pkg.scripts['skill:diff'], 'sh xflow/scripts/check_installed_xflow_skill_sync.sh');
    assert.equal(pkg.scripts['pack:check'], 'npm pack --dry-run');
    assert.equal(pkg.scripts['publish:check'], 'npm run release:pack && npm publish --dry-run --access public');
    assert.equal(pkg.scripts['release:local'], 'npm run verify && npm run drift:scan && npm run skill:sync && npm run skill:diff');
    assert.equal(pkg.scripts['release:pack'], 'npm run verify && npm run drift:scan && npm run skill:diff && npm run pack:check');
    assert.ok(pkg.files.includes('README.md'));
    assert.ok(pkg.files.includes('RELEASE_NOTES.md'));
    assert.ok(pkg.files.includes('xflow/'));
    assert.ok(pkg.files.includes('workflows/'));
  });

  test('npm package whitelist excludes local config and test fixtures', () => {
    const result = spawnSync('npm', ['pack', '--dry-run', '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 10000,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    const [pack] = JSON.parse(result.stdout);
    const paths = pack.files.map((file) => file.path);

    for (const requiredPath of [
      'README.md',
      'RELEASE_NOTES.md',
      'bin/xflow.js',
      'docs/methodology.md',
      'docs/quickstart.md',
      'docs/quality-assessment.md',
      'docs/install-upgrade.md',
      'docs/tooling-matrix.md',
      'docs/demo-proof.md',
      'docs/launch-dossier.md',
      'docs/public-benchmark.md',
      'docs/public-release.md',
      'docs/npm-publish-handoff.md',
      'docs/integrations.md',
      'docs/goal-vs-codex.md',
      'docs/superpowers-comparison.md',
      'docs/adoption/README.md',
      'docs/adoption/openflow-release-hardening.md',
      'docs/spec-kit-benchmark.md',
      'docs/walkthrough.md',
      'docs/openspec-migration.md',
      'docs/fixtures/tracker-item.json',
      'workflows/yolo.yaml',
      'xflow/README.md',
    ]) {
      assert.ok(paths.includes(requiredPath), `missing package file: ${requiredPath}`);
    }

    assert.ok(!paths.some((path) => path.startsWith('.claude/')), 'package must not include local Claude settings');
    assert.ok(!paths.some((path) => path.startsWith('test/')), 'package must not include repo test suite');
    assert.ok(!paths.includes('HANDOFF.md'), 'package must not include operator handoff state');
    assert.ok(!paths.includes('AHA.md'), 'package must not include local durable memory state');
    assert.ok(!paths.some((path) => path.startsWith('docs/adoption/evidence/')), 'package must not include raw adoption evidence');
    assert.ok(!paths.some((path) => path.startsWith('docs/benchmark-evidence/')), 'package must not include raw benchmark evidence');
    assert.ok(!paths.some((path) => path.includes('__pycache__')), 'package must not include Python cache directories');
    assert.ok(!paths.some((path) => path.endsWith('.pyc')), 'package must not include Python bytecode');
    assert.ok(!paths.includes('.DS_Store'), 'package must not include Finder metadata');

    const packagedText = pack.files
      .filter((file) => /\.(md|json|ya?ml|js|py|sh|txt)$/.test(file.path))
      .map((file) => readFileSync(resolve(REPO_ROOT, file.path), 'utf8'))
      .join('\n');
    assert.doesNotMatch(packagedText, /\/Users\/chenchao\//, 'package must not expose local absolute paths');
    assert.doesNotMatch(packagedText, /surlymochan\/workspace-private/, 'package must not expose private tracker repo names');
  });

  test('skill diff command allows only installed .skillhub-source drift', () => {
    const script = resolve(REPO_ROOT, 'xflow', 'scripts', 'check_installed_xflow_skill_sync.sh');
    assert.equal(existsSync(script), true);

    const tempRoot = mkdtempSync(resolve(tmpdir(), 'openflow-skill-diff-'));
    try {
      const source = resolve(tempRoot, 'source-xflow');
      const target = resolve(tempRoot, 'target-xflow');
      mkdirSync(resolve(source, 'scripts'), { recursive: true });
      mkdirSync(resolve(target, 'scripts'), { recursive: true });
      writeFileSync(resolve(source, 'SKILL.md'), '# xflow\n', 'utf8');
      writeFileSync(resolve(target, 'SKILL.md'), '# xflow\n', 'utf8');
      writeFileSync(resolve(source, 'scripts', 'run.sh'), 'echo ok\n', 'utf8');
      writeFileSync(resolve(target, 'scripts', 'run.sh'), 'echo ok\n', 'utf8');
      writeFileSync(resolve(target, '.skillhub-source'), 'source-xflow\n', 'utf8');

      const allowed = spawnSync('sh', [script], {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          XFLOW_SKILL_SOURCE_DIR: source,
          XFLOW_INSTALLED_SKILL_DIR: target,
        },
        encoding: 'utf8',
      });
      assert.equal(allowed.status, 0, allowed.stderr || allowed.stdout);

      writeFileSync(resolve(target, 'drift.txt'), 'unexpected\n', 'utf8');
      const drift = spawnSync('sh', [script], {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          XFLOW_SKILL_SOURCE_DIR: source,
          XFLOW_INSTALLED_SKILL_DIR: target,
        },
        encoding: 'utf8',
      });
      assert.notEqual(drift.status, 0, drift.stdout);
      assert.match(`${drift.stdout}\n${drift.stderr}`, /drift\.txt/);
      rmSync(resolve(target, 'drift.txt'), { force: true });

      mkdirSync(resolve(source, 'scripts', '__pycache__'), { recursive: true });
      mkdirSync(resolve(target, 'scripts', '__pycache__'), { recursive: true });
      writeFileSync(resolve(source, 'scripts', '__pycache__', 'run.cpython-314.pyc'), 'cache\n', 'utf8');
      writeFileSync(resolve(target, 'scripts', '__pycache__', 'run.cpython-314.pyc'), 'cache\n', 'utf8');
      const cacheAllowed = spawnSync('sh', [script], {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          XFLOW_SKILL_SOURCE_DIR: source,
          XFLOW_INSTALLED_SKILL_DIR: target,
        },
        encoding: 'utf8',
      });
      assert.equal(cacheAllowed.status, 0, cacheAllowed.stderr || cacheAllowed.stdout);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test('workflow manual documents the local release checklist and current archive order', () => {
    const manual = readFileSync(resolve(REPO_ROOT, 'docs', 'workflow-manual.md'), 'utf8');

    assert.match(manual, /## 10\. 本地 Release Checklist/);
    assert.match(manual, /npm run drift:scan/);
    assert.match(manual, /npm run verify/);
    assert.match(manual, /npm run skill:sync/);
    assert.match(manual, /npm run skill:diff/);
    assert.match(manual, /K1 \+ K6 \+ K3 \+ K4 \+ A5 commit\/push\/close \+ A6 PR/);
    assert.doesNotMatch(manual, /K2 \+ K6 \+ K3 \+ K4 \+ A6 PR \+ A5/);
  });

  test('handoff is concise and does not retain stale completed-change next steps', () => {
    const handoff = readFileSync(resolve(REPO_ROOT, 'HANDOFF.md'), 'utf8');

    assert.match(handoff, /xflow workflow validate workflows\/yolo\.yaml/);
    assert.match(handoff, /xflow serve/);
    assert.doesNotMatch(handoff, /xflow is not on PATH/);
    assert.match(handoff, /npm run skill:sync/);
    assert.match(handoff, /npm run skill:diff/);
    assert.match(handoff, /xflow\/scripts\/sync_installed_xflow_skill\.sh/);
    assert.match(handoff, /xflow\/scripts\/check_installed_xflow_skill_sync\.sh/);
    assert.doesNotMatch(handoff, /Continue the `handoff-current-state` change/);
    assert.doesNotMatch(handoff, /## Recently Merged/);
  });
});
