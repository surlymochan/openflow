import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = process.cwd();

function writeSkill(root, name, description) {
  const skillDir = resolve(root, name);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(resolve(skillDir, 'SKILL.md'), [
    '---',
    `name: ${name}`,
    `description: "${description}"`,
    '---',
    '',
    `# ${name}`,
    '',
  ].join('\n'), 'utf8');
  return skillDir;
}

function writeStandaloneXmem(root) {
  const xmemRoot = resolve(root, 'as-xmem');
  mkdirSync(resolve(xmemRoot, 'get'), { recursive: true });
  writeFileSync(resolve(xmemRoot, 'skill.md'), [
    '---',
    'name: xmem',
    'description: "Standalone shared-memory skill family."',
    '---',
    '',
    '# xmem',
    '',
  ].join('\n'), 'utf8');
  writeFileSync(resolve(xmemRoot, 'get', 'SKILL.md'), [
    '---',
    'name: xmem:get',
    'description: "Recall shared memory."',
    '---',
    '',
    '# xmem:get',
    '',
  ].join('\n'), 'utf8');
  return xmemRoot;
}

function writeFakeSkillhubSync(scriptPath) {
  writeFileSync(scriptPath, `#!/bin/sh
set -eu

if [ "\${1:-}" != "xflow" ]; then
  echo "expected xflow sync arg" >&2
  exit 64
fi

if [ ! -d "$SKILLHUB/xflow" ]; then
  echo "missing xflow source under SKILLHUB" >&2
  exit 65
fi

printf '%s\\n' "$SKILL_SYNC_TARGET_DIRS" | while IFS= read -r target_dir; do
  [ -n "$target_dir" ] || continue
  mkdir -p "$target_dir"

  for target_path in "$target_dir"/*; do
    [ -d "$target_path" ] || continue
    marker_path="$target_path/.skillhub-source"
    [ -f "$marker_path" ] || continue
    skill_name=$(basename "$target_path")
    recorded_source=$(cat "$marker_path")
    expected_source=""

    if [ -d "$SKILLHUB/$skill_name" ]; then
      expected_source="$SKILLHUB/$skill_name"
    elif [ -d "$SKILL_SYNC_EXTRA_SOURCE_DIRS/$skill_name" ]; then
      expected_source="$SKILL_SYNC_EXTRA_SOURCE_DIRS/$skill_name"
    fi

    if [ -z "$expected_source" ] || [ "$recorded_source" != "$expected_source" ]; then
      rm -rf "$target_path"
    fi
  done

  rm -rf "$target_dir/xflow"
  cp -R "$SKILLHUB/xflow" "$target_dir/xflow"
  printf '%s\\n' "$SKILLHUB/xflow" >"$target_dir/xflow/.skillhub-source"
done
`, 'utf8');
  chmodSync(scriptPath, 0o755);
}

describe('xflow skill sync wrapper', () => {
  test('syncs xflow from this repo while preserving extra-source managed skills', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'as-xflow-skill-sync-'));
    try {
      const targetRoot = resolve(tempRoot, 'installed-skills');
      const extraRoot = resolve(tempRoot, 'extra-skills');
      const fakeSyncScript = resolve(tempRoot, 'skills_sync.sh');
      const xmemSource = writeStandaloneXmem(tempRoot);
      const otherSkillSource = writeSkill(extraRoot, 'other-skill', 'Other managed skill');
      const otherSkillTarget = writeSkill(targetRoot, 'other-skill', 'Other installed skill');
      writeFileSync(resolve(otherSkillTarget, '.skillhub-source'), `${otherSkillSource}\n`, 'utf8');
      const xmemTarget = writeSkill(targetRoot, 'xmem', 'Stale xmem install');
      writeFileSync(resolve(xmemTarget, '.skillhub-source'), `${xmemSource}\n`, 'utf8');
      writeFakeSkillhubSync(fakeSyncScript);

      const result = spawnSync('sh', ['xflow/scripts/sync_installed_xflow_skill.sh'], {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          XFLOW_SKILL_SYNC_SCRIPT: fakeSyncScript,
          XFLOW_SKILL_SYNC_EXTRA_SOURCE_DIRS: extraRoot,
          XFLOW_XMEM_SOURCE_DIR: xmemSource,
          SKILL_SYNC_TARGET_DIRS: targetRoot,
        },
        encoding: 'utf8',
      });

      assert.equal(result.status, 0, result.stderr || result.stdout);
      assert.ok(existsSync(resolve(targetRoot, 'other-skill', 'SKILL.md')), 'extra-source managed skill should not be pruned');
      assert.equal(readFileSync(resolve(targetRoot, 'other-skill', '.skillhub-source'), 'utf8').trim(), otherSkillSource);
      assert.ok(existsSync(resolve(targetRoot, 'xmem', 'SKILL.md')), 'standalone xmem root skill should be restored');
      assert.ok(existsSync(resolve(targetRoot, 'xmem', 'get', 'SKILL.md')), 'xmem child skills should be restored');
      assert.equal(readFileSync(resolve(targetRoot, 'xmem', '.xflow-source'), 'utf8').trim(), xmemSource);
      assert.equal(existsSync(resolve(targetRoot, 'xmem', '.skillhub-source')), false, 'xmem should not be pruned by skillhub single-skill sync');
      assert.ok(existsSync(resolve(targetRoot, 'xflow', 'README.md')), 'xflow root README should be synced');
      assert.equal(existsSync(resolve(targetRoot, 'xflow', 'SKILL.md')), false, 'xflow root skill should no longer exist');
      assert.equal(readFileSync(resolve(targetRoot, 'xflow', '.skillhub-source'), 'utf8').trim(), resolve(REPO_ROOT, 'xflow'));
      assert.match(result.stdout, /verified xmem skill sync target/);
      assert.match(result.stdout, /verified xflow skill sync target/);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test('sync reads skill defaults from project-local xflow config', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'as-xflow-skill-sync-config-'));
    const configDir = resolve(REPO_ROOT, '.as-xflow');
    const configPath = resolve(configDir, 'config.json');
    const originalConfig = existsSync(configPath) ? readFileSync(configPath, 'utf8') : null;
    try {
      const targetRoot = resolve(tempRoot, 'installed-from-config');
      const extraRoot = resolve(tempRoot, 'extra-skills');
      const fakeSyncScript = resolve(tempRoot, 'skills_sync.sh');

      mkdirSync(configDir, { recursive: true });
      mkdirSync(extraRoot, { recursive: true });
      writeFakeSkillhubSync(fakeSyncScript);
      writeFileSync(configPath, JSON.stringify({
        version: 1,
        skills: {
          sync_script: fakeSyncScript,
          extra_source_dirs: [extraRoot],
          installed_dir: targetRoot,
        },
      }, null, 2));

      const result = spawnSync('sh', ['xflow/scripts/sync_installed_xflow_skill.sh'], {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          XFLOW_SKILL_SYNC_SCRIPT: '',
          XFLOW_SKILL_SYNC_EXTRA_SOURCE_DIRS: '',
          SKILL_SYNC_TARGET_DIRS: '',
          SKILLHUB_SYNC_SCRIPT: '',
          SKILL_SYNC_EXTRA_SOURCE_DIRS: '',
        },
        encoding: 'utf8',
      });

      assert.equal(result.status, 0, result.stderr || result.stdout);
      assert.ok(existsSync(resolve(targetRoot, 'xflow', 'README.md')));
      assert.match(result.stdout, new RegExp(`verified xflow skill sync target: ${targetRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/xflow`));
    } finally {
      if (originalConfig === null) {
        rmSync(configPath, { force: true });
      } else {
        writeFileSync(configPath, originalConfig, 'utf8');
      }
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test('sync defaults to codex installed skill root and keeps xmem aligned to the same target', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'as-xflow-skill-sync-auto-'));
    const configDir = resolve(REPO_ROOT, '.as-xflow');
    const configPath = resolve(configDir, 'config.json');
    const originalConfig = existsSync(configPath) ? readFileSync(configPath, 'utf8') : null;
    try {
      const fakeHome = resolve(tempRoot, 'home');
      const agentsRoot = resolve(fakeHome, '.agents', 'skills');
      const codexRoot = resolve(fakeHome, '.codex', 'skills');
      const opencodeRoot = resolve(fakeHome, '.config', 'opencode', 'skills');
      const extraRoot = resolve(tempRoot, 'extra-skills');
      const fakeSyncScript = resolve(tempRoot, 'skills_sync.sh');
      const xmemSource = writeStandaloneXmem(tempRoot);

      mkdirSync(agentsRoot, { recursive: true });
      mkdirSync(codexRoot, { recursive: true });
      mkdirSync(opencodeRoot, { recursive: true });
      mkdirSync(extraRoot, { recursive: true });
      rmSync(configPath, { force: true });
      writeFakeSkillhubSync(fakeSyncScript);

      const result = spawnSync('sh', ['xflow/scripts/sync_installed_xflow_skill.sh'], {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          HOME: fakeHome,
          XFLOW_SKILL_SYNC_SCRIPT: fakeSyncScript,
          XFLOW_SKILL_SYNC_EXTRA_SOURCE_DIRS: extraRoot,
          XFLOW_XMEM_SOURCE_DIR: xmemSource,
          SKILL_SYNC_TARGET_DIRS: '',
          SKILLHUB_SYNC_SCRIPT: '',
          SKILL_SYNC_EXTRA_SOURCE_DIRS: '',
        },
        encoding: 'utf8',
      });

      assert.equal(result.status, 0, result.stderr || result.stdout);
      assert.equal(existsSync(resolve(agentsRoot, 'xflow', 'README.md')), false, 'agents root should not receive xflow by default');
      assert.equal(existsSync(resolve(agentsRoot, 'xmem', 'SKILL.md')), false, 'agents root should not receive xmem by default');
      assert.ok(existsSync(resolve(codexRoot, 'xflow', 'README.md')), 'codex root should receive xflow by default');
      assert.ok(existsSync(resolve(codexRoot, 'xmem', 'SKILL.md')), 'codex root should receive xmem by default');
      assert.equal(existsSync(resolve(opencodeRoot, 'xflow', 'README.md')), false, 'opencode root should not receive xflow by default');
      assert.equal(existsSync(resolve(opencodeRoot, 'xmem', 'SKILL.md')), false, 'opencode root should not receive xmem by default');
      assert.match(result.stdout, /verified xflow skill sync target: .*\.codex\/skills\/xflow/);
      assert.doesNotMatch(result.stdout, /\.agents\/skills\/xflow/);
      assert.doesNotMatch(result.stdout, /\.config\/opencode\/skills\/xflow/);
    } finally {
      if (originalConfig === null) {
        rmSync(configPath, { force: true });
      } else {
        mkdirSync(configDir, { recursive: true });
        writeFileSync(configPath, originalConfig, 'utf8');
      }
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test('sync removes generated Python cache artifacts from the installed xflow skill', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'as-xflow-skill-sync-pycache-'));
    const repoCacheDir = resolve(REPO_ROOT, 'xflow', 'scripts', '__pycache__');
    try {
      const targetRoot = resolve(tempRoot, 'installed-skills');
      const extraRoot = resolve(tempRoot, 'extra-skills');
      const fakeSyncScript = resolve(tempRoot, 'skills_sync.sh');
      const cacheFile = resolve(repoCacheDir, 'wrapper.cpython-314.pyc');

      mkdirSync(extraRoot, { recursive: true });
      mkdirSync(repoCacheDir, { recursive: true });
      writeFileSync(cacheFile, 'pycache', 'utf8');
      writeFakeSkillhubSync(fakeSyncScript);

      const result = spawnSync('sh', ['xflow/scripts/sync_installed_xflow_skill.sh'], {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          XFLOW_SKILL_SYNC_SCRIPT: fakeSyncScript,
          XFLOW_SKILL_SYNC_EXTRA_SOURCE_DIRS: extraRoot,
          SKILL_SYNC_TARGET_DIRS: targetRoot,
        },
        encoding: 'utf8',
      });

      assert.equal(result.status, 0, result.stderr || result.stdout);
      assert.equal(existsSync(resolve(targetRoot, 'xflow', 'scripts', '__pycache__')), false);
      assert.equal(existsSync(resolve(targetRoot, 'xflow', 'scripts', 'wrapper.cpython-314.pyc')), false);
      assert.match(result.stdout, /verified xflow skill sync target/);
    } finally {
      rmSync(repoCacheDir, { recursive: true, force: true });
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test('skill diff defaults to the codex installed xflow target', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'as-xflow-skill-diff-default-'));
    try {
      const fakeHome = resolve(tempRoot, 'home');
      const codexRoot = resolve(fakeHome, '.codex', 'skills');
      mkdirSync(codexRoot, { recursive: true });
      const copy = spawnSync('cp', ['-R', resolve(REPO_ROOT, 'xflow'), resolve(codexRoot, 'xflow')], {
        encoding: 'utf8',
      });
      assert.equal(copy.status, 0, copy.stderr || copy.stdout);

      const result = spawnSync('sh', ['xflow/scripts/check_installed_xflow_skill_sync.sh'], {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          HOME: fakeHome,
          XFLOW_INSTALLED_SKILL_DIR: '',
        },
        encoding: 'utf8',
      });

      assert.equal(result.status, 0, result.stderr || result.stdout);
      assert.match(result.stdout, /verified xflow skill diff target: .*\.codex\/skills\/xflow/);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
