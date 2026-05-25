import { resolveChangePath, writeJsonFile } from './change-artifacts.js';

const TYPE_PATTERNS = [
  ['hotfix', ['hotfix', '紧急修复', '线上问题', 'p0']],
  ['bugfix', ['bug', 'fix', '修复', '缺陷', '报错']],
  ['config-change', ['config', '配置', '开关', '阈值', '环境变量']],
  ['docs', ['doc', 'docs', 'readme', '文档', '说明']],
  ['refactor', ['refactor', '重构', '技术债', '解耦']],
  ['feature', ['feature', '新增', '功能', '需求']],
];

export function buildWorkflowRecommendation(input = {}, effectivePolicy = {}) {
  const profile = buildDemandProfile(input);
  const mode = effectivePolicy.execution_mode || input.execution_mode || 'personal';
  const recommendedTrack = chooseTrack(profile);
  const requiresCoverageGate = shouldRequireCoverage(profile, effectivePolicy);
  const requiresHumanCheckpoint = ['critical', 'elevated'].includes(profile.risk_level)
    || profile.complexity === 'critical';
  const requiresTeamNotification = mode === 'team' && (requiresHumanCheckpoint || recommendedTrack === 'corps');

  return {
    version: 1,
    generated_at: new Date().toISOString(),
    recommended_track: recommendedTrack,
    requires_coverage_gate: requiresCoverageGate,
    requires_human_checkpoint: requiresHumanCheckpoint,
    requires_team_notification: requiresTeamNotification,
    profile,
    policy_overlay: {
      execution_mode: mode,
      workflows_remain: ['yolo', 'corps'],
      creates_team_workflow_fork: false,
    },
    reasons: buildReasons(profile, recommendedTrack, {
      requiresCoverageGate,
      requiresHumanCheckpoint,
      requiresTeamNotification,
    }),
  };
}

export function writeWorkflowRecommendation({ projectRoot, changeId, input = {}, effectivePolicy = {} }) {
  const recommendation = buildWorkflowRecommendation(input, effectivePolicy);
  const outputPath = resolveChangePath(projectRoot, changeId, 'workflow_recommendation.json');
  writeJsonFile(outputPath, recommendation);
  return { ok: true, recommendation, workflow_recommendation_file: outputPath };
}

export function buildDemandProfile(input = {}) {
  const title = String(input.title || input.requirement_title || input.req_name || '').trim();
  const description = String(input.description || input.requirement_description || '').trim();
  const combined = `${title} ${description}`.toLowerCase();
  const repoCount = normalizeRepoCount(input);
  const estimatedFileCount = Number(input.estimated_file_count || input.file_count || 1);
  const demandType = input.demand_type || input.change_type || classifyDemandType(combined);
  const affectsApi = hasAny(combined, ['api', '接口', 'endpoint', 'rpc', 'grpc']);
  const affectsDatabase = hasAny(combined, ['database', 'db', '数据库', 'ddl', 'migration', 'schema']);
  const involvesPayment = hasAny(combined, ['payment', '支付', 'pay', 'billing', '结算']);
  const involvesUserData = hasAny(combined, ['user data', '用户数据', '隐私', '个人信息']);
  const riskLevel = assessRisk({ involvesPayment, involvesUserData, affectsDatabase, repoCount });
  const complexity = assessComplexity({ repoCount, estimatedFileCount, affectsApi, affectsDatabase, riskLevel });

  return {
    demand_type: normalizeDemandType(demandType),
    complexity,
    risk_level: riskLevel,
    repo_count: repoCount,
    estimated_file_count: estimatedFileCount,
    cross_service: repoCount > 1,
    affects_api: affectsApi,
    affects_database: affectsDatabase,
    involves_payment: involvesPayment,
    involves_user_data: involvesUserData,
    title,
  };
}

function classifyDemandType(text) {
  for (const [type, patterns] of TYPE_PATTERNS) {
    if (patterns.some((pattern) => text.includes(pattern))) return type;
  }
  return 'feature';
}

function normalizeDemandType(type) {
  if (type === 'documentation') return 'docs';
  if (type === 'backend' || type === 'frontend' || type === 'full-stack') return 'feature';
  return type || 'feature';
}

function normalizeRepoCount(input = {}) {
  if (Array.isArray(input.repositories)) return input.repositories.length || 1;
  const value = Number(input.repo_count || input.repositories || 1);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function assessRisk({ involvesPayment, involvesUserData, affectsDatabase, repoCount }) {
  if (involvesPayment || involvesUserData) return 'critical';
  if (affectsDatabase || repoCount > 1) return 'elevated';
  return 'standard';
}

function assessComplexity({ repoCount, estimatedFileCount, affectsApi, affectsDatabase, riskLevel }) {
  if (riskLevel === 'critical' || repoCount > 3 || estimatedFileCount > 20) return 'critical';
  if (repoCount > 1 || estimatedFileCount > 8 || affectsDatabase) return 'high';
  if (estimatedFileCount > 3 || affectsApi) return 'medium';
  return 'low';
}

function chooseTrack(profile) {
  if (profile.demand_type === 'docs' && profile.risk_level === 'standard') return 'yolo';
  if (profile.risk_level === 'critical' || profile.complexity === 'critical' || profile.cross_service) return 'corps';
  return 'yolo';
}

function shouldRequireCoverage(profile, policy = {}) {
  if (profile.demand_type === 'docs') return false;
  if (policy?.coding?.min_changed_line_coverage !== undefined) return true;
  return ['feature', 'bugfix', 'hotfix', 'refactor'].includes(profile.demand_type);
}

function buildReasons(profile, track, flags) {
  const reasons = [`track:${track}`];
  if (profile.cross_service) reasons.push('cross_service');
  if (profile.risk_level !== 'standard') reasons.push(`risk:${profile.risk_level}`);
  if (flags.requiresCoverageGate) reasons.push('coverage_gate');
  if (flags.requiresHumanCheckpoint) reasons.push('human_checkpoint');
  if (flags.requiresTeamNotification) reasons.push('team_notification');
  return reasons;
}

function hasAny(text, patterns) {
  return patterns.some((pattern) => text.includes(pattern));
}
