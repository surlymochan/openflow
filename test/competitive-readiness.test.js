import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = process.cwd();

function normalizeGeneratedAt(markdown) {
  return markdown.replace(/^Generated: .+$/m, 'Generated: <timestamp>');
}

describe('competitive readiness benchmark', () => {
  test('root README presents a product-grade first-run story', () => {
    const rootReadme = readFileSync(resolve(REPO_ROOT, 'README.md'), 'utf8');
    const skillReadme = readFileSync(resolve(REPO_ROOT, 'xflow', 'README.md'), 'utf8');

    for (const phrase of [
      'Executable delivery workflow for AI coding agents',
      '3 Minute Start',
      'git clone https://github.com/surlymochan/openflow.git',
      'cd openflow',
      'xflow quickstart',
      'xflow guide',
      'xflow evaluate',
      'xflow release status',
      'xflow assess',
      'xflow demo launch',
      'xflow launch dossier',
      'xflow launch copy',
      'For a source checkout',
      'node bin/xflow.js compare codex-goal',
      'node bin/xflow.js quickstart',
      'node bin/xflow.js evaluate',
      'node bin/xflow.js launch copy',
      'xflow adoption trial --name <team-or-project> --source <tracker-or-pr> --track yolo',
      'xflow package preflight --check-registry --check-auth --json',
      'xflow package audit --check-registry --json',
      'xflow init --project-root .',
      'xflow goal set "Ship the next verified change" --project-root .',
      'xflow goal audit --project-root . --json',
      'xflow doctor --project-root .',
      'xflow workflow validate yolo --project-root .',
      'tdd-red -> execute -> tdd-green',
      'I6c.tdd.quality_review',
      'docs/tooling-matrix.md',
      'docs/demo-proof.md',
      'docs/openspec-migration.md',
      'docs/spec-kit-benchmark.md',
      'docs/superpowers-comparison.md',
      'docs/public-release.md',
      'docs/public-benchmark.md',
      'docs/npm-publish-handoff.md',
      'docs/quality-assessment.md',
      'docs/launch-demo.md',
      'docs/launch-dossier.md',
      'docs/examples-gallery.md',
      'docs/adoption/README.md',
      'docs/adoption/as-xflow-release-hardening.md',
      'docs/goal-vs-codex.md',
      'docs/team-adoption.md',
      'RELEASE_NOTES.md',
      'docs/fixtures/tracker-item.json',
      'xflow score',
      'xflow evaluate',
      'xflow assess',
      'xflow demo launch',
      'xflow launch dossier',
      'xflow package preflight',
      'xflow package audit',
    ]) {
      assert.match(rootReadme, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }

    const firstRunBlock = rootReadme.match(/For a source checkout:[\s\S]*?```bash\n([\s\S]*?)```/)?.[1] || '';
    assert.doesNotMatch(firstRunBlock, /xflow adoption validate --json/);
    assert.doesNotMatch(firstRunBlock, /xflow package preflight/);
    assert.doesNotMatch(firstRunBlock, /xflow package audit/);

    assert.match(rootReadme, /actions\/workflows\/ci\.yml\/badge\.svg/);
    assert.match(rootReadme, /xflow%20score-100%2F100/);
    assert.match(rootReadme, /publish--check-dry--run%20ready/);
  });

  test('benchmark names score dimensions, current surfaces, and required next wins', () => {
    const benchmark = readFileSync(resolve(REPO_ROOT, 'docs', 'competitive-benchmark.md'), 'utf8');

    for (const phrase of [
      'Local delivery closure',
      'Executable workflow data',
      'Verification rigor',
      'TDD / code quality push',
      'Operator onboarding',
      'Cross-tool portability',
      'Goal alignment',
      'One-shot evaluation',
      'Codex goal / Superpowers positioning',
      'xflow goal set',
      'xflow goal show --json',
      'xflow goal audit --json',
      'Ecosystem packaging',
      'demo proof',
      'xflow guide',
      'xflow quickstart',
      'xflow assess',
      'xflow demo launch',
      'xflow launch audit',
      'xflow launch claims',
      'xflow launch copy',
      'xflow package preflight',
      'xflow package audit',
      'xflow doctor',
      'xflow score',
      'xflow assess --json',
      'xflow evaluate --json',
      'xflow demo launch --json',
      'xflow launch dossier',
      'xflow launch claims --json',
      'xflow launch copy --json',
      'xflow launch audit --strict --json',
      'xflow adoption kit --name <team-or-project> --source <tracker-or-pr> --track yolo',
      'xflow adoption init --name <team-or-project> --source <tracker-or-pr> --track yolo',
      'xflow package preflight --check-registry --check-auth --json',
      'xflow launch audit --pre-publish --strict --json',
      'xflow package audit --check-registry --json',
      'docs/quality-assessment.md',
      'docs/launch-demo.md',
      'docs/adoption/README.md',
      'docs/goal-vs-codex.md',
      'xflow compare codex-goal',
      'xflow compare gstack',
      'xflow compare openspec',
      'xflow compare spec-kit',
      'xflow compare superpowers',
      'xflow adapter import-file',
      'npm run release:pack',
      'npm run publish:check',
      'xflow package audit --check-registry --json',
      'Required Next Wins',
    ]) {
      assert.match(benchmark, new RegExp(phrase));
    }

    assert.match(benchmark, /Superpowers/);
    assert.match(benchmark, /xflow compare superpowers/);
    assert.match(benchmark, /OpenSpec/);
    assert.match(benchmark, /spec-kit/);
    assert.match(benchmark, /gstack/);
    assert.match(benchmark, /`xflow init`/);
    assert.match(benchmark, /\.as-xflow\/config\.json/);
  });

  test('goal benchmark explains why xflow goal can beat Codex native goal', () => {
    const goalBenchmark = readFileSync(resolve(REPO_ROOT, 'docs', 'goal-vs-codex.md'), 'utf8');
    const goalSkill = readFileSync(resolve(REPO_ROOT, 'xflow', 'goal', 'SKILL.md'), 'utf8');
    const yoloSkill = readFileSync(resolve(REPO_ROOT, 'xflow', 'yolo', 'SKILL.md'), 'utf8');
    const corpsSkill = readFileSync(resolve(REPO_ROOT, 'xflow', 'corps', 'SKILL.md'), 'utf8');
    const ralphSkill = readFileSync(resolve(REPO_ROOT, 'xflow', 'ralph', 'SKILL.md'), 'utf8');

    for (const phrase of [
      'Codex native goal = thread memory and completion accounting',
      'xflow:goal = project direction anchor plus workflow alignment evidence',
      'Durable',
      'Portable',
      'Consumable',
      'Auditable',
      'The Public Ladder',
      'xflow goal set',
      'xflow goal show --json',
      'xflow goal audit --json',
      'xflow compare codex-goal --json',
      'xflow:goal',
      'xflow:yolo',
      'xflow:corps',
      'xflow:ralph',
      'Scored Judgment',
      '88/100',
      '72/100',
      'evidence_refs',
      'Codex/OpenCode skill sync checks',
    ]) {
      assert.match(goalBenchmark, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }

    assert.match(goalSkill, /Advantage Over Codex Native Goal/);
    assert.match(yoloSkill, /aligns with it, intentionally narrows it, or conflicts with it/);
    assert.match(corpsSkill, /final proof review/);
    assert.match(ralphSkill, /intentionally diverges from the goal/);
  });

  test('Superpowers comparison includes objective scoring and winner caveat', () => {
    const comparison = readFileSync(resolve(REPO_ROOT, 'docs', 'superpowers-comparison.md'), 'utf8');

    for (const phrase of [
      '91/100',
      '78/100',
      'behavior-discipline coverage',
      'Repo-local evidence',
      'Launch readiness',
      'xflow coach bugfix',
      'xflow coach tdd',
      'xflow coach debug',
      'xflow coach qa',
      'xflow coach ship',
      'evidence_refs',
      'workflows/corps.yaml',
      'xflow compare superpowers --json',
    ]) {
      assert.match(comparison, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  });

  test('methodology guide exposes the natural delivery loop', () => {
    const methodology = readFileSync(resolve(REPO_ROOT, 'docs', 'methodology.md'), 'utf8');
    const readme = readFileSync(resolve(REPO_ROOT, 'xflow', 'README.md'), 'utf8');

    for (const phrase of [
      'shape -> choose-track -> execute -> review -> finish',
      'xflow guide',
      'xflow:plan',
      'xflow:yolo',
      'xflow:corps',
      'npm run drift:scan',
      'A5.archive.commit_push_close',
    ]) {
      assert.match(methodology, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }

    assert.match(readme, /docs\/methodology\.md/);
  });

  test('quickstart exposes the public first-run path', () => {
    const quickstart = readFileSync(resolve(REPO_ROOT, 'docs', 'quickstart.md'), 'utf8');
    const readme = readFileSync(resolve(REPO_ROOT, 'xflow', 'README.md'), 'utf8');

    for (const phrase of [
      'xflow guide',
      'xflow evaluate',
      'xflow assess',
      'xflow demo launch',
      'xflow launch dossier',
      'Use source checkout mode before npm publication',
      'node bin/xflow.js compare codex-goal',
      'node bin/xflow.js quickstart',
      'node bin/xflow.js evaluate',
      'xflow adoption trial --name first-team --source first-tracker --track yolo',
      'xflow adoption kit --name first-team --source first-tracker --track yolo',
      'xflow adoption init --name first-team --source first-tracker --track yolo',
      'xflow adoption validate --json',
      'xflow goal audit --project-root . --json',
      'xflow package preflight --check-registry --check-auth --json',
      'xflow launch audit --pre-publish --strict --json',
      'xflow package audit --check-registry --json',
      'npm install -g as-xflow',
      'xflow init --project-root .',
      'xflow goal set "Ship the next verified change" --project-root .',
      'xflow doctor --project-root .',
      'xflow workflow validate yolo',
      'xflow workflow run yolo',
      'tdd-red-command',
      'tdd-green-command',
      'npm run release:local',
    ]) {
      assert.match(quickstart, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }

    const publishedPackageBlock = quickstart.match(/Use the published package path[\s\S]*?```bash\n([\s\S]*?)```/)?.[1] || '';
    assert.doesNotMatch(publishedPackageBlock, /xflow adoption validate --json/);
    assert.doesNotMatch(publishedPackageBlock, /xflow package preflight/);
    assert.doesNotMatch(publishedPackageBlock, /xflow package audit/);

    assert.match(readme, /docs\/quickstart\.md/);
  });

  test('quality assessment gives a direct public scorecard', () => {
    const assessment = readFileSync(resolve(REPO_ROOT, 'docs', 'quality-assessment.md'), 'utf8');
    const publicBenchmark = readFileSync(resolve(REPO_ROOT, 'docs', 'public-benchmark.md'), 'utf8');
    const launchDemo = readFileSync(resolve(REPO_ROOT, 'docs', 'launch-demo.md'), 'utf8');
    const adoption = readFileSync(resolve(REPO_ROOT, 'docs', 'adoption', 'README.md'), 'utf8');

    for (const phrase of [
      'Can xflow Beat Codex Native Goal?',
      'Codex goal = thread memory',
      'xflow goal = project alignment evidence',
      'xflow:goal',
      'xflow:yolo',
      'xflow:corps',
      'Skill family',
      'xflow goal audit --json',
      'xflow corps --explain --json',
      'xflow assess --json',
      'xflow evaluate',
      'xflow evaluate --json',
      'xflow demo launch --json',
      'xflow launch dossier',
      'xflow launch audit --json',
      'xflow launch audit --strict --json',
      'xflow adoption kit --name <team-or-project> --source <tracker-or-pr> --track yolo',
      'xflow adoption init --name <team-or-project> --source <tracker-or-pr> --track yolo',
      'xflow adoption validate --json',
      'xflow package preflight --check-registry --check-auth --json',
      'xflow package audit --check-registry --json',
      'npm run release:pack',
      'Completion Boundary',
      'npm_auth_and_publish',
      'third_party_adoption',
      'Open-Source Launch Bar',
    ]) {
      assert.match(assessment, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }

    assert.match(publicBenchmark, /xflow assess --json/);
    assert.match(publicBenchmark, /xflow demo launch --json/);
    assert.match(publicBenchmark, /xflow corps --explain --json/);
    assert.match(publicBenchmark, /xflow launch dossier/);
    assert.match(publicBenchmark, /xflow launch audit --strict --json/);
    assert.match(publicBenchmark, /xflow launch audit --pre-publish --strict --json/);
    assert.match(publicBenchmark, /xflow adoption validate --json/);
    assert.match(publicBenchmark, /xflow package preflight --check-registry --check-auth --json/);
    assert.match(publicBenchmark, /xflow package audit --check-registry --json/);
    assert.match(publicBenchmark, /docs\/quality-assessment\.md/);
    assert.match(publicBenchmark, /docs\/launch-demo\.md/);
    assert.match(publicBenchmark, /docs\/launch-dossier\.md/);
    assert.match(publicBenchmark, /docs\/corps-operator-guide\.md/);
    assert.match(publicBenchmark, /docs\/adoption\/README\.md/);
    assert.match(launchDemo, /goal -> yolo/);
    assert.match(launchDemo, /goal -> corps proof/);
    assert.match(launchDemo, /xflow goal audit --json/);
    assert.match(launchDemo, /Why Goal Still Matters/);
    assert.match(adoption, /Required Shape/);
    assert.match(adoption, /Acceptance Bar/);
    assert.match(adoption, /xflow adoption init/);
    assert.match(adoption, /xflow adoption validate --json/);
    assert.match(adoption, /splash-launch third-party evidence/);
    assert.match(adoption, /reviewable by someone outside the authoring/);
    assert.match(adoption, /docs\/adoption\/<team-or-project>\.md/);
  });

  test('team adoption model defines multi-person operating gates', () => {
    const teamAdoption = readFileSync(resolve(REPO_ROOT, 'docs', 'team-adoption.md'), 'utf8');
    const reviewerGuide = readFileSync(resolve(REPO_ROOT, 'docs', 'reviewer-guide.md'), 'utf8');
    const publicRelease = readFileSync(resolve(REPO_ROOT, 'docs', 'public-release.md'), 'utf8');
    const rootReadme = readFileSync(resolve(REPO_ROOT, 'README.md'), 'utf8');
    const skillReadme = readFileSync(resolve(REPO_ROOT, 'xflow', 'README.md'), 'utf8');

    for (const phrase of [
      'Team Adoption Operating Model',
      'Readiness Levels',
      'Pilot',
      'Team',
      'Organization',
      'Operator',
      'Implementer',
      'Reviewer',
      'Release owner',
      'Track Policy',
      'Required CI Checks',
      'PR Acceptance Checklist',
      'Failure Policy',
      '95 Percent Readiness Gate',
      'xflow workflow validate corps --project-root .',
      'corps_proof.json',
      'primary_reference_surface',
    ]) {
      assert.match(teamAdoption, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }

    assert.match(rootReadme, /docs\/team-adoption\.md/);
    assert.match(skillReadme, /docs\/team-adoption\.md/);
    assert.match(reviewerGuide, /Team Adoption Operating Model/);
    assert.match(publicRelease, /95 percent readiness gate/);
  });

  test('compatibility notes cover major agent surfaces and shared invariants', () => {
    const compatibility = readFileSync(resolve(REPO_ROOT, 'docs', 'compatibility.md'), 'utf8');
    const toolingMatrix = readFileSync(resolve(REPO_ROOT, 'docs', 'tooling-matrix.md'), 'utf8');
    const readme = readFileSync(resolve(REPO_ROOT, 'xflow', 'README.md'), 'utf8');

    for (const phrase of [
      'Codex',
      'Claude Code',
      'Cursor',
      'OpenCode',
      'Gemini CLI',
      'Generic CLI Agents',
      'xflow doctor --json',
      'A5.archive.commit_push_close',
      'npm run skill:diff',
    ]) {
      assert.match(compatibility, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }

    for (const phrase of [
      'Universal CLI Contract',
      'npm install -g as-xflow',
      'Codex CLI / App',
      'Claude Code',
      'Cursor',
      'OpenCode',
      'Gemini CLI',
      'tdd-red before execute',
      'tdd-green after execute',
    ]) {
      assert.match(toolingMatrix, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }

    assert.match(readme, /docs\/compatibility\.md/);
    assert.match(readme, /docs\/tooling-matrix\.md/);
  });

  test('install and upgrade guide covers source, global, adoption, and release paths', () => {
    const guide = readFileSync(resolve(REPO_ROOT, 'docs', 'install-upgrade.md'), 'utf8');
    const publishHandoff = readFileSync(resolve(REPO_ROOT, 'docs', 'npm-publish-handoff.md'), 'utf8');
    const readme = readFileSync(resolve(REPO_ROOT, 'xflow', 'README.md'), 'utf8');

    for (const phrase of [
      'Source Checkout',
      'Global CLI',
      'Project Adoption',
      'Local Release',
      'Upgrade Checks',
      'Publication Readiness',
      'npm install -g as-xflow',
      'npm install -g .',
      'xflow init --project-root .',
      'npm run release:local',
      'npm run release:pack',
      'npm run publish:check',
      'xflow adoption validate --json',
      'xflow package preflight --check-registry --check-auth --json',
      'xflow launch audit --pre-publish --strict --json',
      'xflow package audit --check-registry --json',
    ]) {
      assert.match(guide, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }

    for (const phrase of [
      'npm Publish Handoff',
      'npm login',
      'npm publish --access public',
      'xflow launch audit --pre-publish --strict --json',
      'ENEEDAUTH',
    ]) {
      assert.match(publishHandoff, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }

    assert.match(readme, /docs\/install-upgrade\.md/);
  });

  test('demo proof documents externally repeatable proof commands', () => {
    const demoProof = readFileSync(resolve(REPO_ROOT, 'docs', 'demo-proof.md'), 'utf8');
    const readme = readFileSync(resolve(REPO_ROOT, 'xflow', 'README.md'), 'utf8');

    for (const phrase of [
      'Clean Project Adoption',
      'npm install -g as-xflow',
      'xflow demo clean',
      'xflow workflow validate yolo --project-root .',
      'Source Checkout Release Proof',
      'npm run release:pack',
      'TDD Proof Demonstration',
      'red-0.json',
      'green-0.json',
      'quality-0.json',
      'Competitive Claim Gate',
      'xflow score',
      'xflow goal audit --json',
      'xflow corps --explain --json',
      'xflow spec delta',
      'xflow compare openspec',
      'xflow compare spec-kit',
      'xflow compare superpowers',
    ]) {
      assert.match(demoProof, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }

    assert.match(readme, /docs\/demo-proof\.md/);
  });

  test('OpenSpec migration guide exposes command and folder mappings', () => {
    const guide = readFileSync(resolve(REPO_ROOT, 'docs', 'openspec-migration.md'), 'utf8');
    const readme = readFileSync(resolve(REPO_ROOT, 'xflow', 'README.md'), 'utf8');

    for (const phrase of [
      'xflow spec openspec-map',
      'xflow spec start',
      '.as-xflow/openspec-migration.json',
      '/opsx:new <change>',
      '/opsx:apply',
      'xflow spec delta',
      'spec_delta_review.json',
      'openspec/changes/<id>/proposal.md',
      'specs/changes/<id>/plan.md',
    ]) {
      assert.match(guide, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }

    assert.match(readme, /docs\/openspec-migration\.md/);
  });

  test('public moat docs cover release, integrations, benchmark, and walkthrough', () => {
    const publicRelease = readFileSync(resolve(REPO_ROOT, 'docs', 'public-release.md'), 'utf8');
    const publicBenchmark = readFileSync(resolve(REPO_ROOT, 'docs', 'public-benchmark.md'), 'utf8');
    const launchDossier = readFileSync(resolve(REPO_ROOT, 'docs', 'launch-dossier.md'), 'utf8');
    const integrations = readFileSync(resolve(REPO_ROOT, 'docs', 'integrations.md'), 'utf8');
    const specKitBenchmark = readFileSync(resolve(REPO_ROOT, 'docs', 'spec-kit-benchmark.md'), 'utf8');
    const examplesGallery = readFileSync(resolve(REPO_ROOT, 'docs', 'examples-gallery.md'), 'utf8');
    const walkthrough = readFileSync(resolve(REPO_ROOT, 'docs', 'walkthrough.md'), 'utf8');
    const releaseNotes = readFileSync(resolve(REPO_ROOT, 'RELEASE_NOTES.md'), 'utf8');
    const trackerItem = JSON.parse(readFileSync(resolve(REPO_ROOT, 'docs', 'fixtures', 'tracker-item.json'), 'utf8'));
    const readme = readFileSync(resolve(REPO_ROOT, 'xflow', 'README.md'), 'utf8');

    for (const phrase of [
      'npm run publish:check',
      'xflow launch dossier --output docs/launch-dossier.md',
      'xflow goal audit --json',
      'npm publish --dry-run --access public',
      'npm view as-xflow name version --json',
      'xflow package preflight --check-registry --check-auth --json',
      'xflow launch audit --pre-publish --strict --json',
      'xflow package audit --check-registry --json',
      'available_surfaces',
      'ready_surfaces',
      'next_actions',
      'npm whoami',
    ]) {
      assert.match(publicRelease, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }

    for (const phrase of [
      'GitHub Issues',
      'xflow adapter github-issue',
      'xflow adapter import-file',
      'Jira',
      'Linear',
      'Confluence',
      'CI Guard',
      'Superpowers',
      'OpenSpec',
      'spec-kit',
    ]) {
      assert.match(integrations, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }

    for (const phrase of [
      'Public Benchmark And Demo',
      'xflow adapter import-file',
      'xflow evaluate --json',
      'xflow spec start --title "release proof adapter" --change-type backend',
      'splash_claims',
      'xflow launch dossier',
      'xflow launch claims --json',
      'xflow launch claims --splash --json',
      'xflow launch copy --json',
      'xflow launch copy --splash --json',
      'xflow goal audit --json',
      'xflow corps --explain --json',
      'xflow adoption trial',
      'xflow compare codex-goal',
      'xflow compare superpowers',
      'xflow compare openspec',
      'xflow compare spec-kit',
      'npm run publish:check',
      'xflow package preflight --check-registry --check-auth --json',
      'xflow launch audit --pre-publish --strict --json',
      'xflow launch audit --splash --strict --json',
      'README badges',
      'RELEASE_NOTES.md',
      'docs/examples-gallery.md',
      'docs/fixtures/tracker-item.json',
    ]) {
      assert.match(publicBenchmark, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }

    const corpsGuide = readFileSync(resolve(REPO_ROOT, 'docs', 'corps-operator-guide.md'), 'utf8');
    for (const phrase of [
      'Corps Operator Guide',
      'xflow corps --explain',
      'First-Time Sequence',
      'Proof Contract',
      'Competitor-Led UI Inputs',
      'Common Failure Meanings',
      'corps_proof.json',
    ]) {
      assert.match(corpsGuide, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }

    for (const phrase of [
      '/speckit.specify',
      '/speckit.plan',
      '/speckit.tasks',
      'requirements_delta',
      'xflow compare spec-kit --json',
    ]) {
      assert.match(specKitBenchmark, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }

    for (const phrase of [
      'Examples Gallery',
      'Clean Project Adoption Smoke',
      'xflow demo clean',
      'Goal To yolo',
      'Goal To corps Proof',
      'External Tracker Import',
      'Release Gate',
      'xflow adapter import-file --input docs/fixtures/tracker-item.json --project-root .',
      'xflow package preflight --check-registry --check-auth --json',
    ]) {
      assert.match(examplesGallery, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }

    for (const phrase of [
      'xflow compare codex-goal',
      'xflow compare openspec',
      'xflow compare spec-kit',
      'xflow compare superpowers',
      'xflow adapter import-file',
      'npm run publish:check',
      'spec_delta_review.json',
    ]) {
      assert.match(walkthrough, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }

    assert.match(readme, /docs\/public-release\.md/);
    assert.match(readme, /docs\/public-benchmark\.md/);
    assert.match(readme, /docs\/launch-dossier\.md/);
    assert.match(readme, /docs\/examples-gallery\.md/);
    assert.match(readme, /docs\/integrations\.md/);
    assert.match(readme, /docs\/spec-kit-benchmark\.md/);
    assert.match(readme, /docs\/walkthrough\.md/);
    assert.match(readme, /RELEASE_NOTES\.md/);
    assert.match(readme, /docs\/fixtures\/tracker-item\.json/);

    for (const phrase of [
      '0.1.0 - Public Readiness Candidate',
      'xflow demo clean',
      'xflow adapter import-file',
      'xflow adapter github-issue',
      'npm run publish:check',
    ]) {
      assert.match(releaseNotes, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }

    assert.equal(trackerItem.id, 'release-proof-adapter');
    assert.equal(trackerItem.source, 'tracker-file');
    assert.match(launchDossier, /as-xflow Launch Dossier/);
    assert.match(launchDossier, /Competitive score: 100\/100/);
    assert.match(launchDossier, /Objective Audit/);
    assert.match(launchDossier, /`goal_vs_codex`: proven_project_layer/);
    assert.match(launchDossier, /`yolo_delivery`: proven_from_source/);
    assert.match(launchDossier, /`corps_delivery`: proven_from_source/);
    assert.match(launchDossier, /Adoption records: 1; status: pass/);
    assert.match(launchDossier, /Passing Evidence/);
    assert.match(launchDossier, /Available Checks/);
    assert.match(launchDossier, /xflow adoption validate --json/);
    assert.match(launchDossier, /Next Actions For Ordinary Launch/);
    assert.match(launchDossier, /verify_release_pack/);
    assert.match(launchDossier, /xflow package audit --check-registry --json/);
    assert.match(launchDossier, /Next Actions For Splash Launch/);
    assert.match(launchDossier, /Missing Before Ordinary Launch/);
    assert.match(launchDossier, /Missing Before Splash Launch/);
    assert.match(launchDossier, /third_party_adoption/);
    assert.match(launchDossier, /xflow launch audit --splash --strict --json/);
    assert.match(launchDossier, /published_package/);
    assert.doesNotMatch(launchDossier, /real_external_adoption/);
  });

  test('minimal external adoption remains documented and exercised in CI', () => {
    const demoProof = readFileSync(resolve(REPO_ROOT, 'docs', 'demo-proof.md'), 'utf8');
    const ciWorkflow = readFileSync(resolve(REPO_ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
    const adoptionRecord = readFileSync(resolve(REPO_ROOT, 'docs', 'adoption', 'as-xflow-release-hardening.md'), 'utf8');

    for (const phrase of [
      'npm install -g as-xflow',
      'xflow init --project-root .',
      'xflow doctor --project-root .',
      'xflow workflow validate yolo --project-root .',
    ]) {
      assert.match(demoProof, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }

    assert.match(ciWorkflow, /Minimal External Adoption Example/);
    assert.match(ciWorkflow, /cat > package\.json/);
    assert.match(ciWorkflow, /xflow workflow validate yolo --project-root \./);

    for (const phrase of [
      'as-xflow release hardening',
      'public commit 84add67',
      'xflow corps --explain --json',
      'xflow launch audit --strict --json',
      'would use this gate',
    ]) {
      assert.match(adoptionRecord, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  });

  test('checked-in launch dossier matches the CLI renderer', () => {
    const launchDossier = readFileSync(resolve(REPO_ROOT, 'docs', 'launch-dossier.md'), 'utf8');
    const result = spawnSync('node', ['bin/xflow.js', 'launch', 'dossier', '--registry-json', '{"error":"E404"}', '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 6000,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    const payload = JSON.parse(result.stdout);
    assert.equal(normalizeGeneratedAt(launchDossier).trimEnd(), normalizeGeneratedAt(payload.dossier).trimEnd());
    assert.equal(payload.splash_audit.splash, true);
    assert.equal(payload.splash_audit.missing_surfaces.some((item) => item.id === 'third_party_adoption'), true);
  });

  test('reviewer guide covers team handoff and PR review gates', () => {
    const guide = readFileSync(resolve(REPO_ROOT, 'docs', 'reviewer-guide.md'), 'utf8');
    const readme = readFileSync(resolve(REPO_ROOT, 'xflow', 'README.md'), 'utf8');

    for (const phrase of [
      'HANDOFF.md',
      'proposal.md',
      'plan.md',
      'verify_proof.json',
      'TDD proof',
      'I6b.tdd.proof_validate',
      'I6c.tdd.quality_review',
      'npm run drift:scan',
      'npm run skill:diff',
      'A5.archive.commit_push_close',
      'A6.pr.create',
    ]) {
      assert.match(guide, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }

    assert.match(readme, /docs\/reviewer-guide\.md/);
  });
});
