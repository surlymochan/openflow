import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

import {
  mergePolicy,
  readProfile,
  readTeamPolicy,
  resolveEffectivePolicy,
  validateTeamPolicy,
} from '../src/core/policy-overlay.js';
import { buildWorkflowRecommendation } from '../src/core/intake-recommendation.js';
import { notifyCheckpoint } from '../src/core/atoms/notify/checkpoint.js';
import { policyGate } from '../src/core/atoms/policy/gate.js';
import { pluginRun } from '../src/core/atoms/plugin/run.js';
import { storageSync } from '../src/core/atoms/storage/sync.js';
import { experienceDigest } from '../src/core/atoms/experience/digest.js';

const REPO_ROOT = process.cwd();

function makeProjectRoot() {
  const root = mkdtempSync(join(tmpdir(), 'openflow-policy-'));
  mkdirSync(resolve(root, '.xflow'), { recursive: true });
  mkdirSync(resolve(root, 'specs', 'changes', 'chg-policy-1'), { recursive: true });
  return root;
}

function cleanupProjectRoot(root) {
  rmSync(root, { recursive: true, force: true });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

describe('policy overlay', () => {
  test('merges personal profile and team policy without forking workflow tracks', () => {
    const personal = {
      execution_mode: 'personal',
      coding: {
        min_changed_line_coverage: 60,
        forbidden_patterns: ['large function'],
      },
      review: {
        min_reviewers: 1,
      },
    };
    const team = {
      execution_mode: 'team',
      coding: {
        min_changed_line_coverage: 80,
        forbidden_patterns: ['snapshot-only tests', 'large function'],
        require_meaningful_tests: true,
      },
      review: {
        min_reviewers: 2,
        focus_categories: ['security'],
      },
    };

    const merged = mergePolicy(personal, team);

    assert.equal(merged.execution_mode, 'team');
    assert.equal(merged.coding.min_changed_line_coverage, 80);
    assert.deepEqual(merged.coding.forbidden_patterns, ['snapshot-only tests', 'large function']);
    assert.equal(merged.coding.require_meaningful_tests, true);
    assert.equal(merged.review.min_reviewers, 2);
    assert.deepEqual(merged.review.focus_categories, ['security']);
    assert.equal(merged.workflow_tracks.personal, 'yolo|corps');
    assert.equal(merged.workflow_tracks.team, 'yolo|corps');
  });

  test('reads personal defaults and writes effective policy artifact for team mode', () => {
    const projectRoot = makeProjectRoot();
    try {
      writeFileSync(resolve(projectRoot, '.xflow', 'profile.json'), JSON.stringify({
        execution_mode: 'team',
        coding: { min_changed_line_coverage: 60 },
        review: { min_reviewers: 1 },
      }, null, 2));
      writeFileSync(resolve(projectRoot, '.xflow', 'team-policy.json'), JSON.stringify({
        coding: { min_changed_line_coverage: 85 },
        review: { min_reviewers: 2 },
      }, null, 2));

      assert.equal(readProfile(projectRoot).execution_mode, 'team');
      assert.equal(readTeamPolicy(projectRoot).coding.min_changed_line_coverage, 85);

      const result = resolveEffectivePolicy({ projectRoot, changeId: 'chg-policy-1' });
      assert.equal(result.ok, true);
      assert.equal(result.policy.execution_mode, 'team');
      assert.equal(result.policy.coding.min_changed_line_coverage, 85);
      assert.ok(existsSync(resolve(projectRoot, 'specs', 'changes', 'chg-policy-1', 'policy_effective.json')));
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('team mode reports a clear policy error when team-policy is missing', () => {
    const projectRoot = makeProjectRoot();
    try {
      writeFileSync(resolve(projectRoot, '.xflow', 'profile.json'), JSON.stringify({
        execution_mode: 'team',
      }, null, 2));

      const result = resolveEffectivePolicy({ projectRoot, changeId: 'chg-policy-1' });

      assert.equal(result.ok, false);
      assert.equal(result.error.code, 'team_policy_missing');
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('rejects invalid team policy shapes before gates consume them', () => {
    const validation = validateTeamPolicy({
      coding: { min_changed_line_coverage: 'high' },
      review: { min_reviewers: -1 },
    });

    assert.equal(validation.ok, false);
    assert.deepEqual(validation.errors, [
      'coding.min_changed_line_coverage must be a number between 0 and 100',
      'review.min_reviewers must be a non-negative number',
    ]);
  });
});

describe('adaptive intake recommendation', () => {
  test('recommends yolo without team notification for low-risk docs work', () => {
    const recommendation = buildWorkflowRecommendation({
      title: 'Update README docs',
      description: 'Documentation cleanup only',
      change_type: 'docs',
      estimated_file_count: 1,
    });

    assert.equal(recommendation.recommended_track, 'yolo');
    assert.equal(recommendation.requires_coverage_gate, false);
    assert.equal(recommendation.requires_human_checkpoint, false);
    assert.equal(recommendation.requires_team_notification, false);
  });

  test('recommends corps, coverage, checkpoint, and team notification for high-risk cross-service work', () => {
    const recommendation = buildWorkflowRecommendation({
      title: 'Payment API migration',
      description: 'Migrate user payment API and database schema across services',
      repositories: ['api', 'billing'],
      estimated_file_count: 18,
    }, {
      execution_mode: 'team',
    });

    assert.equal(recommendation.recommended_track, 'corps');
    assert.equal(recommendation.requires_coverage_gate, true);
    assert.equal(recommendation.requires_human_checkpoint, true);
    assert.equal(recommendation.requires_team_notification, true);
    assert.equal(recommendation.profile.risk_level, 'critical');
  });
});

describe('enterprise integration atoms', () => {
  test('policy.gate fails with structured reasons when team thresholds are unmet', async () => {
    const projectRoot = makeProjectRoot();
    try {
      writeFileSync(resolve(projectRoot, '.xflow', 'profile.json'), JSON.stringify({ execution_mode: 'team' }, null, 2));
      writeFileSync(resolve(projectRoot, '.xflow', 'team-policy.json'), JSON.stringify({
        coding: { min_changed_line_coverage: 80 },
        review: { min_reviewers: 2 },
        deploy: { required_smoke_pass_rate: 95 },
      }, null, 2));
      mkdirSync(resolve(projectRoot, 'specs', 'changes', 'chg-policy-1', 'tdd'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-policy-1', 'tdd', 'quality-0.json'), JSON.stringify({
        ok: true,
        changed_line_coverage: 74,
      }, null, 2));
      writeFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-policy-1', 'review.json'), JSON.stringify({
        reviewers: ['alice'],
      }, null, 2));
      writeFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-policy-1', 'smoke.json'), JSON.stringify({
        pass_rate: 90,
      }, null, 2));

      const result = await policyGate({}, { projectRoot, changeId: 'chg-policy-1' });

      assert.equal(result.ok, false);
      assert.deepEqual(result.failed_checks.map((check) => check.code), [
        'coverage_below_policy',
        'reviewers_below_policy',
        'smoke_pass_rate_below_policy',
      ]);
      assert.ok(existsSync(resolve(projectRoot, 'specs', 'changes', 'chg-policy-1', 'policy_gate.json')));
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('notify.checkpoint writes notification evidence but does not approve a human gate', async () => {
    const projectRoot = makeProjectRoot();
    try {
      const result = await notifyCheckpoint(
        {
          provider: 'file',
          phase: 'tech-plan',
          recipient: 'team@example.com',
          artifact_url: 'specs/changes/chg-policy-1/plan.md',
        },
        { projectRoot, changeId: 'chg-policy-1' },
      );

      assert.equal(result.ok, true);
      assert.equal(result.approves_gate, false);
      const evidence = readJson(result.notification_file);
      assert.equal(evidence.provider, 'file');
      assert.equal(evidence.phase, 'tech-plan');
      assert.equal(evidence.approves_gate, false);
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('plugin.run dry-runs script and webhook plugins into structured results', async () => {
    const projectRoot = makeProjectRoot();
    try {
      const scriptResult = await pluginRun(
        { type: 'script', ref: 'scripts/check.sh', dry_run: true, payload: { hello: 'world' } },
        { projectRoot, changeId: 'chg-policy-1' },
      );
      const webhookResult = await pluginRun(
        { type: 'webhook', ref: 'https://example.invalid/hook', dry_run: true },
        { projectRoot, changeId: 'chg-policy-1' },
      );

      assert.equal(scriptResult.ok, true);
      assert.equal(scriptResult.result.status, 'dry_run');
      assert.equal(webhookResult.result.status, 'dry_run');
      assert.ok(existsSync(scriptResult.plugin_result_file));
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('storage.sync file provider copies experience entries and records evidence', async () => {
    const projectRoot = makeProjectRoot();
    try {
      const source = resolve(projectRoot, 'team-experience.json');
      writeFileSync(source, JSON.stringify({ entries: [{ title: 'Prefer real assertions', category: 'testing' }] }, null, 2));

      const result = await storageSync(
        { provider: 'file', direction: 'import', source, target: 'team/experience.json' },
        { projectRoot, changeId: 'chg-policy-1' },
      );

      assert.equal(result.ok, true);
      assert.ok(existsSync(resolve(projectRoot, '.xflow', 'storage', 'team', 'experience.json')));
      assert.ok(existsSync(result.storage_sync_file));
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('experience.digest summarizes local and team experience as advisory context', async () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, '.xflow', 'experience'), { recursive: true });
      mkdirSync(resolve(projectRoot, '.xflow', 'storage', 'team'), { recursive: true });
      writeFileSync(resolve(projectRoot, '.xflow', 'experience', 'local.json'), JSON.stringify({
        entries: [{ title: 'Keep tests meaningful', category: 'testing', content: 'Reject empty assertions.' }],
      }, null, 2));
      writeFileSync(resolve(projectRoot, '.xflow', 'storage', 'team', 'experience.json'), JSON.stringify({
        entries: [{ title: 'Review migrations', category: 'review', content: 'Require migration smoke evidence.' }],
      }, null, 2));

      const result = await experienceDigest({}, { projectRoot, changeId: 'chg-policy-1' });

      assert.equal(result.ok, true);
      assert.equal(result.digest.entry_count, 2);
      assert.equal(result.digest.advisory_only, true);
      assert.ok(existsSync(resolve(projectRoot, 'specs', 'changes', 'chg-policy-1', 'experience_digest.json')));
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });
});

describe('CLI policy/profile/intake surfaces', () => {
  test('profile show, policy validate, and intake recommend expose JSON surfaces', () => {
    const projectRoot = makeProjectRoot();
    try {
      writeFileSync(resolve(projectRoot, '.xflow', 'profile.json'), JSON.stringify({ execution_mode: 'personal' }, null, 2));
      writeFileSync(resolve(projectRoot, '.xflow', 'team-policy.json'), JSON.stringify({
        coding: { min_changed_line_coverage: 80 },
      }, null, 2));

      const profile = spawnSync('node', [resolve(REPO_ROOT, 'bin/xflow.js'), 'profile', 'show', '--project-root', projectRoot, '--json'], { encoding: 'utf8' });
      assert.equal(profile.status, 0, profile.stderr || profile.stdout);
      assert.equal(JSON.parse(profile.stdout).profile.execution_mode, 'personal');

      const policy = spawnSync('node', [resolve(REPO_ROOT, 'bin/xflow.js'), 'policy', 'validate', '--project-root', projectRoot, '--change-id', 'chg-policy-1', '--json'], { encoding: 'utf8' });
      assert.equal(policy.status, 0, policy.stderr || policy.stdout);
      assert.equal(JSON.parse(policy.stdout).ok, true);

      const intake = spawnSync('node', [
        resolve(REPO_ROOT, 'bin/xflow.js'),
        'intake',
        'recommend',
        '--project-root',
        projectRoot,
        '--change-id',
        'chg-policy-1',
        '--title',
        'Payment API migration',
        '--description',
        'payment user data api database',
        '--repo-count',
        '2',
        '--json',
      ], { encoding: 'utf8' });
      assert.equal(intake.status, 0, intake.stderr || intake.stdout);
      assert.equal(JSON.parse(intake.stdout).recommendation.recommended_track, 'corps');
      assert.ok(existsSync(resolve(projectRoot, 'specs', 'changes', 'chg-policy-1', 'workflow_recommendation.json')));
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });
});
