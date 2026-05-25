import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = process.cwd();

describe('doctor branch/worktree readiness', () => {
  test('run_doctor_checks reports branch-worktree-ready when checkout matches the linked branch', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'as-xflow-doctor-'));
    try {
      const changeRoot = resolve(projectRoot, 'specs', 'changes', 'chg-doctor-ready');
      mkdirSync(changeRoot, { recursive: true });
      writeFileSync(resolve(changeRoot, 'status.json'), JSON.stringify({
        change_id: 'chg-doctor-ready',
        status: 'active',
        current_stage: 'tdd',
        target_repo: 'example/repo-private',
        issue_repo: 'example/repo-private',
        issue_number: 17,
        branch_name: 'codex/doctor-ready',
        checkout_path: '/tmp/as-xflow-doctor-ready',
        code_repo: 'example/code-repo',
      }, null, 2), 'utf8');

      const code = [
        'import importlib.util',
        'import json',
        'import pathlib',
        'import sys',
        '',
        'repo_root = pathlib.Path(sys.argv[1])',
        'project_root = pathlib.Path(sys.argv[2])',
        'change_id = sys.argv[3]',
        '',
        'module_path = repo_root / "xflow" / "scripts" / "doctor.py"',
        'spec = importlib.util.spec_from_file_location("doctor", module_path)',
        'doctor = importlib.util.module_from_spec(spec)',
        'spec.loader.exec_module(doctor)',
        '',
        'def fake_gh_json(args):',
        '    if args[:2] == ["issue", "view"]:',
        '        return {"url": "https://github.com/example/repo-private/issues/17", "state": "OPEN"}',
        '    if args[:1] == ["api"]:',
        '        return [{"body": "<!-- xflow:branch-link --> linked to " + chr(96) + "codex/doctor-ready" + chr(96)}]',
        '    return []',
        '',
        'doctor.gh_json = fake_gh_json',
        'doctor.get_remote_url = lambda checkout_path: "git@github.com:example/code-repo.git"',
        'doctor.get_current_branch = lambda checkout_path: "codex/doctor-ready"',
        'doctor.remote_branch_exists = lambda checkout_path, branch_name: True',
        'doctor.resolve_project_context = lambda repo, issue_number: None',
        '',
        'result = doctor.run_doctor_checks(project_root=project_root, change_id=change_id)',
        'print(json.dumps(result))',
      ].join('\n');

      const result = spawnSync('python3', ['-c', code, REPO_ROOT, projectRoot, 'chg-doctor-ready'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      });

      assert.equal(result.status, 0, result.stderr || result.stdout);
      const parsed = JSON.parse(result.stdout);
      const readyCheck = parsed.checks.find((item) => item.name === 'branch-worktree-ready');
      assert.ok(readyCheck, 'doctor output should include branch-worktree-ready');
      assert.equal(readyCheck.ok, true);
      assert.equal(parsed.ok, true);
      assert.equal(parsed.hard_failures, 0);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
