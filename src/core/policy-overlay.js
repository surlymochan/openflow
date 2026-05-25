import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { resolveChangePath, writeJsonFile } from './change-artifacts.js';

const DEFAULT_PROFILE = {
  version: 1,
  execution_mode: 'personal',
  workflow_tracks: {
    personal: 'yolo|corps',
    team: 'yolo|corps',
  },
};

function readJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  try {
    const raw = readFileSync(path, 'utf8');
    return raw.trim() ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(path, payload) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return path;
}

export function resolveProfilePath(projectRoot) {
  return resolve(projectRoot, '.xflow', 'profile.json');
}

export function resolveTeamPolicyPath(projectRoot) {
  return resolve(projectRoot, '.xflow', 'team-policy.json');
}

export function readProfile(projectRoot) {
  const profile = readJson(resolveProfilePath(projectRoot), {});
  return mergePolicy(DEFAULT_PROFILE, profile || {});
}

export function writeProfile(projectRoot, patch = {}) {
  const current = readProfile(projectRoot);
  const next = mergePolicy(current, patch);
  writeJson(resolveProfilePath(projectRoot), next);
  return next;
}

export function readTeamPolicy(projectRoot) {
  return readJson(resolveTeamPolicyPath(projectRoot), null);
}

export function validateTeamPolicy(policy = {}) {
  const errors = [];
  const coverage = policy?.coding?.min_changed_line_coverage;
  if (coverage !== undefined && (!Number.isFinite(Number(coverage)) || Number(coverage) < 0 || Number(coverage) > 100)) {
    errors.push('coding.min_changed_line_coverage must be a number between 0 and 100');
  }
  const reviewers = policy?.review?.min_reviewers;
  if (reviewers !== undefined && (!Number.isFinite(Number(reviewers)) || Number(reviewers) < 0)) {
    errors.push('review.min_reviewers must be a non-negative number');
  }
  const smoke = policy?.deploy?.required_smoke_pass_rate;
  if (smoke !== undefined && (!Number.isFinite(Number(smoke)) || Number(smoke) < 0 || Number(smoke) > 100)) {
    errors.push('deploy.required_smoke_pass_rate must be a number between 0 and 100');
  }
  return { ok: errors.length === 0, errors };
}

export function mergePolicy(personal = {}, team = {}) {
  const merged = mergeValue(personal || {}, team || {});
  merged.workflow_tracks = {
    personal: 'yolo|corps',
    team: 'yolo|corps',
    ...(merged.workflow_tracks || {}),
  };
  return merged;
}

function mergeValue(personal, team) {
  if (team === undefined || team === null) return cloneValue(personal);
  if (personal === undefined || personal === null) return cloneValue(team);

  if (Array.isArray(personal) || Array.isArray(team)) {
    return mergeLists(team, personal);
  }
  if (typeof personal === 'number' || typeof team === 'number') {
    const personalNumber = Number(personal);
    const teamNumber = Number(team);
    if (Number.isFinite(personalNumber) && Number.isFinite(teamNumber)) {
      return Math.max(personalNumber, teamNumber);
    }
    return cloneValue(team);
  }
  if (isPlainObject(personal) && isPlainObject(team)) {
    const result = {};
    for (const key of new Set([...Object.keys(personal), ...Object.keys(team)])) {
      result[key] = mergeValue(personal[key], team[key]);
    }
    return result;
  }
  return cloneValue(team);
}

function mergeLists(teamList, personalList) {
  const values = [
    ...(Array.isArray(teamList) ? teamList : [teamList]),
    ...(Array.isArray(personalList) ? personalList : [personalList]),
  ].filter((value) => value !== undefined && value !== null);
  const seen = new Set();
  const merged = [];
  for (const value of values) {
    const key = JSON.stringify(value);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(cloneValue(value));
  }
  return merged;
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function cloneValue(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

export function resolveEffectivePolicy({ projectRoot, changeId = null, executionMode = null, writeArtifact = true } = {}) {
  const profile = readProfile(projectRoot);
  if (executionMode) {
    profile.execution_mode = executionMode;
  }

  const mode = profile.execution_mode || 'personal';
  const teamPolicy = readTeamPolicy(projectRoot);
  if (mode === 'team' && !teamPolicy) {
    return {
      ok: false,
      error: {
        code: 'team_policy_missing',
        message: 'execution_mode=team requires .xflow/team-policy.json',
      },
      profile,
      policy: null,
    };
  }

  const validation = teamPolicy ? validateTeamPolicy(teamPolicy) : { ok: true, errors: [] };
  if (!validation.ok) {
    return {
      ok: false,
      error: {
        code: 'team_policy_invalid',
        message: 'team policy failed validation',
        errors: validation.errors,
      },
      profile,
      policy: null,
    };
  }

  const policy = mode === 'team' ? mergePolicy(profile, teamPolicy) : mergePolicy(DEFAULT_PROFILE, profile);
  policy.execution_mode = mode;
  policy.generated_at = new Date().toISOString();
  policy.source = {
    profile: resolveProfilePath(projectRoot),
    team_policy: teamPolicy ? resolveTeamPolicyPath(projectRoot) : null,
  };
  policy.authority = 'policy_overlay_only_workflows_remain_yolo_corps';

  const result = { ok: true, profile, team_policy: teamPolicy, policy };
  if (writeArtifact && changeId) {
    result.policy_effective_file = writeJsonFile(resolveChangePath(projectRoot, changeId, 'policy_effective.json'), policy);
  }
  return result;
}
