# as-xflow Competitive Benchmark

Date: 2026-04-19

## Goal

Make `as-xflow` stronger than adjacent agent workflow systems in every dimension that matters for serious delivery work: planning, execution, verification, portability, team handoff, and operator confidence.

This benchmark is intentionally stricter than a marketing comparison. A category is only considered won when `as-xflow` has a named project surface, a command or artifact operators can use, and local tests or drift scans that protect it.

## Reference Systems

- Superpowers: strong skill distribution, agent behavior shaping, and test-driven coding guidance.
- OpenSpec: strong spec-driven workflow, low-friction command surface, and cross-tool positioning.
- gstack: strong role-specialist command surface, browser QA, and host-native release rituals for Codex / Claude Code.
- spec-kit: strong specification-driven development lifecycle, broad public extension surface, and ecosystem credibility.

## Score Dimensions

| Dimension | Win Condition | Current as-xflow Surface | Current Status |
| --- | --- | --- | --- |
| Local delivery closure | One command family can move from plan through archive with verification evidence. | `xflow:plan`, `xflow:yolo`, `xflow:corps`, `workflows/*.yaml`, archive atoms | Strong |
| Goal alignment | Project direction survives across threads, tools, handoffs, and workflow tracks. | `xflow goal set`, `xflow goal audit`, `xflow compare codex-goal`, `xflow:goal`, `.xflow/GOAL.md`, `docs/goal-vs-codex.md`, yolo/corps/Ralph goal-alignment rules | Strong |
| Executable workflow data | Workflow order is data, validated by schema/tests, not only prose. | `workflows/yolo.yaml`, `workflows/corps.yaml`, `schemas/workflow.schema.json` | Strong |
| Verification rigor | Drift checks, tests, gates, and sync checks catch regressions before release. | `npm test`, `npm run drift:scan`, `npm run skill:diff`, deterministic gates | Strong |
| TDD / code quality push | Red runs before implementation, green runs after implementation, and changed tests are checked for quality anti-patterns. | `I6a.tdd.run`, `I6b.tdd.proof_validate`, `I6c.tdd.quality_review`, `test/tdd-proof.test.js`, `verify_proof.json` | Strong |
| Operator onboarding | First commands explain the human loop, initialize a project, and report whether the local install is ready. | `xflow quickstart`, `xflow guide`, `xflow init`, `xflow doctor`, `npm run doctor` | Strong |
| One-shot evaluation | External evaluators can see quality score, Codex goal / Superpowers positioning, plus OpenSpec / gstack comparisons, launch blockers, release-owner status, claim boundaries, next actions, and first-run path from one command family. | `xflow evaluate`, `xflow evaluate --json`, `xflow release status`, `xflow release status --json`, `xflow compare codex-goal --json`, `xflow compare superpowers --json`, `xflow compare openspec --json`, `xflow compare gstack --json`, `xflow assess --json`, `xflow launch audit --json`, `xflow launch claims --json`, `xflow launch copy --json` | Strong |
| Spec durability | Plans, proposal artifacts, workflow deltas, AHA, and handoff survive thread changes. | `specs/changes/*`, `specs/workflow.md`, `AHA.md`, `HANDOFF.md` | Strong |
| Cross-tool portability | Skills and workflows can be installed without personal machine assumptions. | `docs/compatibility.md`, `.as-xflow/config.json`, skillhub sync wrapper, installed skill diff | Strong |
| Public product clarity | New users can understand the system without reading implementation internals. | README badges, `xflow quickstart`, `xflow guide`, `xflow evaluate`, `xflow assess`, `xflow demo launch`, `xflow launch dossier`, `xflow launch claims`, `xflow launch copy`, `xflow launch audit`, `xflow adoption status`, `xflow adoption trial`, `xflow package status`, `xflow package preflight`, `xflow package audit`, `xflow score`, `docs/quality-assessment.md`, `docs/launch-demo.md`, `docs/examples-gallery.md`, `docs/adoption/README.md`, `docs/methodology.md`, `docs/public-benchmark.md`, `RELEASE_NOTES.md`, `docs/fixtures/tracker-item.json`, this benchmark | Strong |
| Team collaboration | Issues, branches, PR/archive state, handoff, and reviewer checks are explicit and auditable. | `docs/reviewer-guide.md`, openissue/archive atoms, current-state handoff block | Strong |
| Control-plane observability | Operators can inspect run state, gates, orphaned runs, and aggregate signals. | `xflow serve`, server tests, timeline analytics | Strong |
| Ecosystem packaging | External users can install, initialize, upgrade, inspect package readiness, and import external tracker context with minimal manual wiring. | `docs/install-upgrade.md`, `docs/public-release.md`, `docs/demo-proof.md`, `docs/fixtures/tracker-item.json`, `.github/workflows/ci.yml`, `package.json` bin/files, `npm run publish:check`, `xflow adapter import-file`, `xflow adapter github-issue` | Strong |

## Current Judgment

`as-xflow` now beats reference systems on executable workflow depth, local delivery closure, archive discipline, observable heavy-track control, first-run commands, split red/green TDD proof semantics, TDD test-quality review, deterministic requirements-level spec delta review, OpenSpec migration mapping, public release checks, real adapter seams, examples gallery, public benchmark proof, methodology guidance, and reviewer-facing collaboration guidance.

Against Superpowers, xflow should not claim behavior-guidance superiority.
Superpowers remains stronger as lightweight behavior discipline; xflow's
stronger claim is repo-local workflow evidence, cross-tool state, and launch
gates.

Against gstack, xflow should not claim better role choreography or browser
rituals. The stronger xflow claim is repo-owned workflow truth: checked-in YAML,
goal alignment, handoff/AHA continuity, and launch gates that can be audited
from source checkout without assuming a specific host command pack.

Against Codex native goal, xflow wins only at the project layer: Codex goal is
excellent thread memory, while `.xflow/GOAL.md` becomes stronger when yolo,
corps, Ralph, handoff, and takein all consume it and report alignment. The
score dimension above is intentionally product-facing: a public user should be
able to see why `xflow:goal` is not a duplicate prompt reminder.
CLI users should be able to prove the same story without knowing the skill
system first: `xflow goal set` writes the durable anchor, and `xflow goal show
--json` exposes it to any agent runtime. `xflow goal audit --json` then proves
the core skill family still consumes the anchor instead of leaving it as a
decorative file.

The remaining product moat work is no longer the core engine; it is distribution and ecosystem proof. The current repo now includes a root README with public badges, install/upgrade page, tooling matrix, demo proof page, walkthrough, integration matrix, public release gate, release notes, public benchmark, examples gallery, spec-kit benchmark, and CI-backed minimal adoption example so the external story is testable instead of aspirational.

The highest-leverage path is not more workflow phases. The next win is authenticated public registry publish plus third-party adoption data from real teams, recorded through `docs/adoption/README.md`.

## Proof Commands

```bash
xflow score
xflow quickstart
xflow evaluate --json
xflow assess --json
xflow demo launch --json
xflow launch dossier
xflow launch claims --json
xflow launch copy --json
xflow launch audit --strict --json
xflow adoption kit --name <team-or-project> --source <tracker-or-pr> --track yolo
xflow adoption init --name <team-or-project> --source <tracker-or-pr> --track yolo
xflow adoption validate --json
xflow package preflight --check-registry --check-auth --json
xflow launch audit --pre-publish --strict --json
xflow package audit --check-registry --json
xflow goal show --json
xflow goal audit --json
xflow corps --explain --json
xflow compare codex-goal
xflow compare gstack
xflow compare superpowers
xflow compare openspec
xflow compare spec-kit
xflow adapter import-file --input docs/fixtures/tracker-item.json --json
xflow spec delta --change-id <change-id>
npm run release:pack
npm run publish:check
```

## Required Next Wins

1. Run `npm run publish:check`, confirm package ownership and npm identity with `xflow package preflight --check-registry --check-auth --json`, require `xflow launch audit --pre-publish --strict --json` before the irreversible publish, publish the package to the public registry, and verify it with `xflow package audit --check-registry --json`.
2. Extend the current non-fixture maintainer adoption record with at least one third-party tracker workflow using `xflow adoption status`, `xflow adoption trial`, `xflow adoption kit`, `xflow adoption init`, and `docs/adoption/README.md`, then gate it with `xflow adoption validate --json`.
