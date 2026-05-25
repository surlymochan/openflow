# as-xflow Launch Dossier

Generated: 2026-05-25T11:02:51.205Z
Mode: post_publish
Verdict: conditionally ready: engine and adoption evidence are strong, registry publication remains required for a splash launch
Launch ready: not yet
Splash verdict: conditionally ready: engine and maintainer adoption evidence are strong, but third-party adoption and registry publication remain required for an industry-splash launch
Splash launch ready: not yet
Competitive score: 100/100

## Quality Judgment

strong, launch-ready after registry publish; adoption evidence is now non-fixture but third-party proof remains the next ecosystem win

Codex native goal comparison: xflow can beat Codex native goal at the project layer, not as a thread reminder.

## Surface Scorecard

| Surface | Grade | Why | Next win |
| --- | --- | --- | --- |
| xflow:goal | A | Durable .xflow/GOAL.md anchor with CLI access, cross-tool portability, and machine-readable goal audit. | Collect real project examples where goal alignment changed handoff or review quality. |
| xflow:yolo | A | Lite workflow is executable YAML with split red/green TDD proof, quality review, archive order, and drift coverage. | Publish a tiny external repo walkthrough that shows a real bugfix from red proof to archive. |
| xflow:corps | A | Heavy workflow has governed proof, visual benchmark gates, no-stub runtime witnesses, control-plane observability, and a first-time operator guide. | Publish a third-party product/UI adoption walkthrough backed by corps proof. |
| skill family | A- | The ladder now reads goal -> takein -> plan -> yolo/corps -> ralph -> handoff/aha, with sync and diff checks. | Publish the package and collect third-party adoption evidence beyond maintainer dogfooding. |

## Objective Audit

- `goal_vs_codex`: proven_project_layer
- `yolo_delivery`: proven_from_source
- `corps_delivery`: proven_from_source
- `skill_family_open_source_credibility`: ready_from_source_checkout
- `open_source_launch`: blocked
- `industry_splash`: blocked

## Demo Proof Paths

### Goal to yolo

Use when: backend, docs, infra, and small UI changes

Commands:
- `xflow guide`
- `xflow assess`
- `xflow init --project-root .`
- `xflow goal set "Ship the next verified change" --project-root .`
- `xflow goal audit --project-root . --json`
- `xflow workflow validate yolo --project-root .`
- `xflow workflow run yolo --project-root . --title "Example verified change" --change-type backend --tdd-red-command "npm test -- --grep new-behavior" --tdd-green-command "npm test"`

Evidence:
- `.xflow/GOAL.md`
- `xflow goal audit --json`
- `specs/changes/<change-id>/tdd/red-0.json`
- `specs/changes/<change-id>/tdd/green-0.json`
- `specs/changes/<change-id>/tdd/quality-0.json`
- `HANDOFF.md`

### Goal to corps proof

Use when: product, UI, competitor-led, or multi-agent work

Commands:
- `xflow goal show --json`
- `xflow goal audit --json`
- `xflow corps --title "Competitor-aligned workbench" --change-type frontend --change-id launch-corps-demo --capture-url http://127.0.0.1:4174/ --reference-image refs/competitor-main.png --dry-run --json`
- `xflow proof --track corps --change-id launch-corps-demo`

Evidence:
- `.xflow/GOAL.md`
- `xflow goal audit --json`
- `specs/changes/launch-corps-demo/visual_benchmark.json`
- `specs/changes/launch-corps-demo/corps_proof.json`
- `hash-linked execution log witnesses`
- `final goal-alignment review`

## Runnable Examples

- `docs/examples-gallery.md` maps clean adoption smoke, goal-to-yolo, goal-to-corps proof, external tracker import, and release gate examples.
- Use `xflow demo launch --json` for the machine-readable launch path summary.

## Release Gate

- `npm run release:pack`
- `npm run publish:check`
- `xflow evaluate --json`
- `xflow release status --json`
- `xflow adoption trial --name <team-or-project> --source <tracker-or-pr> --track yolo --json`
- `xflow goal audit --json`
- `xflow adoption status --json`
- `xflow adoption validate --json`
- `xflow launch claims --json`
- `xflow launch copy --json`
- `xflow package status --json`
- `xflow package preflight --check-registry --check-auth --json`
- `xflow package audit --check-registry --json`
- `xflow launch audit --strict --json`
- `xflow launch audit --splash --strict --json`
- `git status --short --branch`

## Missing Before Ordinary Launch

- **published_package**: Public npm package ownership confirmed and package published from a green dry run.
  Why it matters: A launch story is incomplete while users cannot install the advertised package name.
  Acceptable evidence: npm view as-xflow name version --json returns this package; npm publish --access public completed for the intended version

## Missing Before Splash Launch

- **third_party_adoption**: At least one adoption artifact comes from a third-party project, public PR, external repository, or named external team beyond maintainer dogfooding.
  Why it matters: An industry-splash claim needs ecosystem evidence, not only a maintainer hardening run inside as-xflow.
  Acceptable evidence: docs/adoption/<third-party-project>.md with a public PR, external repository, or named external team source; xflow adoption validate --splash --json passes; xflow launch audit --splash --strict --json passes
- **published_package**: Public npm package ownership confirmed and package published from a green dry run.
  Why it matters: A launch story is incomplete while users cannot install the advertised package name.
  Acceptable evidence: npm view as-xflow name version --json returns this package; npm publish --access public completed for the intended version

## Current Evidence Snapshot

- Adoption records: 1; status: pass
- Goal audit: pass; goal: Keep OpenFlow credible as an open-source agent delivery runtime: repo-owned workflow contracts, executable verification gates, durable project context, and honest benchmark evidence.
- Package evidence: missing; source: registry_json
- Package name/version: openflow@0.1.0

## Passing Evidence

- `xflow assess --json`
- `xflow score --json`
- `xflow goal audit --json`
- `xflow adoption validate --json`

## Available Checks

- `xflow quickstart --json`
- `xflow evaluate --json`
- `xflow release status --json`
- `xflow assess --json`
- `xflow demo launch --json`
- `xflow launch claims --json`
- `xflow launch copy --json`
- `xflow score --json`
- `xflow goal audit --json`
- `xflow adoption status --json`
- `npm run release:pack`
- `npm run publish:check`
- `xflow package status --json`
- `xflow package preflight --check-registry --check-auth --json`
- `xflow package audit --check-registry --json`

## Next Actions For Ordinary Launch

- **verify_release_pack**: `npm run release:pack`
  Reason: Re-run the full local release pack immediately before any publish attempt.
- **check_package_preflight**: `xflow package preflight --check-registry --check-auth --json`
  Reason: Verify npm identity plus package-name/version availability without publishing.
- **run_pre_publish_launch_audit**: `xflow launch audit --pre-publish --strict --json`
  Reason: Prove score, adoption evidence, npm identity, and package availability before the irreversible publish step.
- **publish_package**: `npm publish --access public`
  Reason: Run only after release:pack, package preflight, and pre-publish launch audit are green.
- **verify_registry_publication**: `xflow package audit --check-registry --json`
  Reason: Prove the public npm registry reports the expected package name and version before claiming npm install readiness.
- **rerun_launch_audit**: `xflow launch audit --strict --json`
  Reason: Close the post-publish launch gate after registry evidence is visible.

## Next Actions For Splash Launch

- **record_third_party_adoption**: `xflow adoption kit --name <third-party-project> --source <public-pr-or-external-repo> --track yolo`
  Reason: Industry-splash claims require a third-party trial packet that becomes reviewable evidence beyond maintainer dogfooding.
- **validate_splash_adoption**: `xflow adoption validate --splash --json`
  Reason: Remove the third_party_adoption gap only after a third-party record passes validation.
- **verify_release_pack**: `npm run release:pack`
  Reason: Re-run the full local release pack immediately before any publish attempt.
- **check_package_preflight**: `xflow package preflight --check-registry --check-auth --json`
  Reason: Verify npm identity plus package-name/version availability without publishing.
- **run_pre_publish_launch_audit**: `xflow launch audit --pre-publish --strict --json`
  Reason: Prove score, adoption evidence, npm identity, and package availability before the irreversible publish step.
- **publish_package**: `npm publish --access public`
  Reason: Run only after release:pack, package preflight, and pre-publish launch audit are green.
- **verify_registry_publication**: `xflow package audit --check-registry --json`
  Reason: Prove the public npm registry reports the expected package name and version before claiming npm install readiness.
- **rerun_launch_audit**: `xflow launch audit --strict --json`
  Reason: Close the post-publish launch gate after registry evidence is visible.


