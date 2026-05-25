import { existsSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const STATUS_POINTS = {
  strong: 10,
  improving: 8,
  needs_work: 5,
  weak: 2,
};

const DIMENSIONS = [
  {
    id: 'local_delivery_closure',
    label: 'Local delivery closure',
    evidence: [
      ['file', 'workflows/yolo.yaml'],
      ['file', 'workflows/corps.yaml'],
      ['text', 'HANDOFF.md', /archive/i],
    ],
  },
  {
    id: 'executable_workflow_data',
    label: 'Executable workflow data',
    evidence: [
      ['file', 'schemas/workflow.schema.json'],
      ['text', 'test/workflow-loader.test.js', /Workflow: yolo\.yaml/],
      ['text', 'test/workflow-loader.test.js', /Workflow: corps\.yaml/],
    ],
  },
  {
    id: 'goal_alignment',
    label: 'Goal alignment',
    evidence: [
      ['file', 'docs/goal-vs-codex.md'],
      ['text', 'bin/xflow.js', /case 'goal'/],
      ['text', 'bin/xflow.js', /goal audit/],
      ['text', 'bin/xflow.js', /codex-goal/],
      ['text', 'README.md', /xflow goal set/],
      ['text', 'README.md', /docs\/goal-vs-codex\.md/],
      ['text', 'docs/tooling-matrix.md', /skill family as a ladder/],
      ['text', 'docs/tooling-matrix.md', /xflow goal set/],
      ['text', 'docs/competitive-benchmark.md', /Goal alignment/],
      ['text', 'docs/competitive-benchmark.md', /xflow compare codex-goal/],
      ['text', 'docs/competitive-benchmark.md', /xflow goal show --json/],
      ['text', 'docs/competitive-benchmark.md', /xflow goal audit --json/],
      ['text', 'xflow/goal/SKILL.md', /Advantage Over Codex Native Goal/],
      ['text', 'xflow/yolo/SKILL.md', /aligns with it, intentionally narrows it, or conflicts with it/],
      ['text', 'xflow/corps/SKILL.md', /final proof review/],
      ['text', 'xflow/ralph/SKILL.md', /intentionally diverges from the goal/],
    ],
  },
  {
    id: 'verification_rigor',
    label: 'Verification rigor',
    evidence: [
      ['text', 'package.json', /"drift:scan"/],
      ['text', 'package.json', /"skill:diff"/],
      ['file', 'test/release-checklist.test.js'],
    ],
  },
  {
    id: 'tdd_code_quality_push',
    label: 'TDD / code quality push',
    evidence: [
      ['text', 'xflow/atoms/i6a_tdd_run.py', /Red expects a failing test/],
      ['text', 'xflow/atoms/i6b_tdd_proof_validate.py', /Red must prove a failing test/],
      ['text', 'xflow/atoms/i6c_tdd_quality_review.py', /code changes should be accompanied by test changes/],
      ['file', 'test/tdd-proof.test.js'],
      ['text', 'workflows/yolo.yaml', /tdd-red[\s\S]*execute[\s\S]*tdd-green/],
      ['text', 'workflows/corps.yaml', /I6c\.tdd\.quality_review/],
    ],
  },
  {
    id: 'operator_onboarding',
    label: 'Operator onboarding',
    evidence: [
      ['text', 'README.md', /3 Minute Start/],
      ['text', 'bin/xflow.js', /case 'init'/],
      ['text', 'bin/xflow.js', /case 'doctor'/],
      ['text', 'bin/xflow.js', /case 'guide'/],
      ['text', 'docs/quickstart.md', /xflow init --project-root \./],
      ['file', 'docs/walkthrough.md'],
    ],
  },
  {
    id: 'spec_durability',
    label: 'Spec durability',
    evidence: [
      ['file', 'specs/workflow.md'],
      ['file', 'AHA.md'],
      ['file', 'HANDOFF.md'],
      ['file', 'docs/openspec-migration.md'],
      ['text', 'xflow/atoms/j4b_spec_delta_review.py', /Spec Delta Review/],
      ['text', 'xflow/atoms/j4c_openspec_migration_map.py', /OpenSpec project to as-xflow surfaces/],
    ],
  },
  {
    id: 'cross_tool_portability',
    label: 'Cross-tool portability',
    evidence: [
      ['file', 'docs/tooling-matrix.md'],
      ['file', 'docs/integrations.md'],
      ['text', 'docs/tooling-matrix.md', /Codex CLI \/ App/],
      ['text', 'docs/tooling-matrix.md', /Gemini CLI/],
      ['text', 'docs/compatibility.md', /Claude Code/],
      ['text', 'docs/compatibility.md', /Cursor/],
      ['text', 'docs/compatibility.md', /OpenCode/],
      ['text', 'bin/xflow.js', /case 'adapter'/],
      ['text', 'docs/integrations.md', /xflow adapter import-file/],
      ['text', 'xflow/openissue/scripts/open_issue_flow.py', /configured_issue_repo/],
      ['text', 'xflow/scripts/sync_installed_xflow_skill.sh', /config_value/],
    ],
  },
  {
    id: 'public_product_clarity',
    label: 'Public product clarity',
    evidence: [
      ['file', 'README.md'],
      ['file', 'docs/competitive-benchmark.md'],
      ['file', 'docs/superpowers-comparison.md'],
      ['file', 'docs/quality-assessment.md'],
      ['file', 'docs/launch-demo.md'],
      ['file', 'docs/launch-dossier.md'],
      ['file', 'docs/examples-gallery.md'],
      ['file', 'docs/corps-operator-guide.md'],
      ['file', 'docs/adoption/README.md'],
      ['file', 'docs/adoption/as-xflow-release-hardening.md'],
      ['file', 'docs/demo-proof.md'],
      ['file', 'docs/openspec-migration.md'],
      ['file', 'docs/spec-kit-benchmark.md'],
      ['file', 'docs/public-benchmark.md'],
      ['file', 'docs/npm-publish-handoff.md'],
      ['file', 'docs/walkthrough.md'],
      ['file', 'docs/methodology.md'],
      ['file', 'RELEASE_NOTES.md'],
      ['file', 'docs/quickstart.md'],
      ['text', 'xflow/README.md', /docs\/quickstart\.md/],
      ['text', 'bin/xflow.js', /case 'assess'/],
      ['text', 'bin/xflow.js', /case 'demo'/],
      ['text', 'bin/xflow.js', /case 'launch'/],
      ['text', 'bin/xflow.js', /case 'quickstart'/],
      ['text', 'bin/xflow.js', /launch dossier/],
      ['text', 'bin/xflow.js', /case 'adoption'/],
      ['text', 'bin/xflow.js', /case 'package'/],
      ['text', 'docs/quality-assessment.md', /xflow assess --json/],
      ['text', 'docs/launch-demo.md', /goal -> yolo/],
      ['text', 'docs/launch-demo.md', /goal -> corps proof/],
      ['text', 'docs/examples-gallery.md', /Goal To yolo/],
      ['text', 'docs/examples-gallery.md', /External Tracker Import/],
      ['text', 'docs/launch-dossier.md', /Missing Before Splash Launch/],
      ['text', 'docs/launch-dossier.md', /published_package/],
      ['text', 'docs/corps-operator-guide.md', /xflow corps --explain/],
      ['text', 'docs/launch-demo.md', /xflow launch dossier/],
      ['text', 'docs/public-release.md', /xflow launch audit --strict --json/],
      ['text', 'docs/public-release.md', /xflow launch audit --pre-publish --strict --json/],
      ['text', 'docs/public-release.md', /xflow adoption validate --json/],
      ['text', 'docs/public-release.md', /xflow package preflight --check-registry --check-auth --json/],
      ['text', 'docs/public-release.md', /xflow package audit --check-registry --json/],
      ['text', 'docs/npm-publish-handoff.md', /npm publish --access public/],
      ['text', 'docs/adoption/README.md', /Required Shape/],
      ['text', 'docs/adoption/README.md', /Acceptance Bar/],
      ['text', 'docs/adoption/README.md', /xflow adoption init/],
      ['text', 'docs/adoption/README.md', /xflow adoption validate --json/],
      ['text', 'docs/adoption/as-xflow-release-hardening.md', /xflow launch audit --strict --json/],
      ['text', 'bin/xflow.js', /case 'spec'/],
      ['text', 'bin/xflow.js', /case 'adapter'/],
      ['text', 'bin/xflow.js', /case 'compare'/],
      ['text', 'bin/xflow.js', /superpowers/],
      ['text', 'bin/xflow.js', /case 'score'/],
    ],
  },
  {
    id: 'team_collaboration',
    label: 'Team collaboration',
    evidence: [
      ['file', 'docs/reviewer-guide.md'],
      ['text', 'docs/reviewer-guide.md', /verify_proof\.json/],
      ['text', 'docs/reviewer-guide.md', /A5\.archive\.commit_push_close/],
      ['file', 'docs/team-adoption.md'],
      ['text', 'docs/team-adoption.md', /95 Percent Readiness Gate/],
      ['text', 'docs/team-adoption.md', /Operator/],
      ['text', 'docs/team-adoption.md', /Release owner/],
      ['text', 'docs/team-adoption.md', /PR Acceptance Checklist/],
      ['text', 'README.md', /docs\/team-adoption\.md/],
    ],
  },
  {
    id: 'control_plane_observability',
    label: 'Control-plane observability',
    evidence: [
      ['file', 'src/server.js'],
      ['text', 'test/server.test.js', /timeline analytics/],
      ['text', 'test/server.test.js', /orphaned/],
    ],
  },
  {
    id: 'ecosystem_packaging',
    label: 'Ecosystem packaging',
    evidence: [
      ['text', 'package.json', /"bin"/],
      ['text', 'package.json', /"pack:check"/],
      ['text', 'package.json', /"release:pack"/],
      ['text', 'package.json', /"publish:check"/],
      ['text', 'package.json', /"README\.md"/],
      ['text', 'package.json', /"RELEASE_NOTES\.md"/],
      ['file', 'docs/install-upgrade.md'],
      ['file', 'docs/public-release.md'],
      ['file', 'docs/public-benchmark.md'],
      ['file', 'docs/npm-publish-handoff.md'],
      ['text', 'docs/install-upgrade.md', /npm install -g as-xflow/],
      ['text', 'docs/install-upgrade.md', /xflow package preflight --check-registry --check-auth --json/],
      ['file', 'docs/demo-proof.md'],
      ['file', 'docs/fixtures/tracker-item.json'],
      ['text', '.github/workflows/ci.yml', /Minimal External Adoption Example/],
    ],
  },
];

export function buildCompetitiveScore({ root = ROOT } = {}) {
  const dimensions = DIMENSIONS.map((dimension) => {
    const evidence = dimension.evidence.map((item) => evaluateEvidence(root, item));
    const passed = evidence.filter((item) => item.ok).length;
    const status = passed === evidence.length ? 'strong' : passed > 0 ? 'improving' : 'weak';
    return {
      id: dimension.id,
      label: dimension.label,
      status,
      points: STATUS_POINTS[status],
      evidence,
    };
  });
  const total = dimensions.reduce((sum, dimension) => sum + dimension.points, 0);
  const max = dimensions.length * 10;
  const weakDimensions = dimensions.filter((dimension) => dimension.status !== 'strong');

  return {
    ok: weakDimensions.length === 0,
    score: Math.round((total / max) * 100),
    max_score: 100,
    dimensions,
    next_wins: weakDimensions.length
      ? weakDimensions.map((dimension) => `Strengthen evidence for ${dimension.label}.`)
      : ['Keep score evidence generated from repo files as new competitive surfaces are added.'],
  };
}

function evaluateEvidence(root, [type, relativePath, pattern]) {
  const path = resolve(root, relativePath);
  if (type === 'file') {
    return { type, path: relativePath, ok: existsSync(path) };
  }

  if (type === 'text') {
    if (!existsSync(path)) {
      return { type, path: relativePath, ok: false, pattern: String(pattern) };
    }
    const content = readFileSync(path, 'utf8');
    return { type, path: relativePath, ok: pattern.test(content), pattern: String(pattern) };
  }

  return { type, path: relativePath, ok: false };
}
