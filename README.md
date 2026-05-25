# OpenFlow

[![CI](https://github.com/surlymochan/openflow/actions/workflows/ci.yml/badge.svg)](https://github.com/surlymochan/openflow/actions/workflows/ci.yml)
[![xflow score](https://img.shields.io/badge/xflow%20score-100%2F100-brightgreen)](docs/competitive-benchmark.md)
[![publish check](https://img.shields.io/badge/publish--check-dry--run%20ready-blue)](docs/public-release.md)
[![spec delta](https://img.shields.io/badge/spec%20delta-requirements--level-blueviolet)](docs/openspec-migration.md)

Executable delivery workflow for AI coding agents.

OpenFlow is the public extraction of the `openflow` workflow runtime. It turns
agent work from "follow this prose process" into a local workflow runtime with
YAML phases, deterministic atoms, TDD proof gates, handoff state, archive
discipline, and packageable CLI commands.

## Why It Exists

Most agent workflow systems are strong at behavior shaping. OpenFlow adds a
harder layer:

- workflow data that can be validated before it runs
- red/green TDD proof that is checked by code, not only by prompt discipline
- `quality-0.json` test-quality review for code/test pairing and common fake-test patterns
- local handoff and AHA files so context survives across sessions
- archive and PR ordering that is executable and test-covered
- clean-project adoption proof in CI plus a reviewable maintainer adoption record

## 3 Minute Start

For a source checkout:

```bash
git clone https://github.com/surlymochan/openflow.git
cd openflow
npm install
npm run release:pack
node bin/xflow.js quickstart
node bin/xflow.js guide
node bin/xflow.js evaluate
node bin/xflow.js assess
node bin/xflow.js demo clean
node bin/xflow.js compare codex-goal
node bin/xflow.js launch dossier
node bin/xflow.js launch copy
```

To initialize OpenFlow inside a target project after the CLI is linked or
installed:

```bash
xflow quickstart
xflow guide
xflow init --project-root .
xflow goal set "Ship the next verified change" --project-root .
xflow goal audit --project-root . --json
xflow doctor --project-root .
xflow workflow validate yolo --project-root .
```

Release-owner gates such as `xflow adoption status --json`, `xflow adoption validate --json`,
`xflow package status --json`, `xflow package preflight --check-registry --check-auth --json`, and
`xflow package audit --check-registry --json` are intentionally separate from
the first-run path because they fail until real adoption evidence, npm identity,
or published registry evidence exists. Use `xflow adoption brief --name <team-or-project> --source <tracker-or-pr> --track yolo`
to generate the outbound ask, `xflow adoption trial --name <team-or-project> --source <tracker-or-pr> --track yolo`
to preview the copy-paste external trial, `xflow adoption kit --name <team-or-project> --source <tracker-or-pr> --track yolo`
to create a shareable packet, then `xflow adoption init --name <team-or-project> --source <tracker-or-pr> --track yolo`
to create the draft record after real trial evidence exists.

## Run A Change

```bash
git checkout -b codex/example-change
xflow workflow run yolo --project-root . \
  --title "Example change" \
  --change-type backend \
  --tdd-red-command "npm test -- --grep new-behavior" \
  --tdd-green-command "npm test"
```

The lite workflow runs `tdd-red -> execute -> tdd-green -> verify -> archive`.

Red proof must fail before implementation. Green proof must pass after implementation. `I6c.tdd.quality_review` then rejects code changes without meaningful changed tests, empty assertions, snapshot-only tests, or mock-heavy tests without real assertions.

## Choose A Track

| Track | Use When | Entry |
| --- | --- | --- |
| `goal` | You want a simple project direction anchor that later xflow work can read and audit | `xflow:goal`, `xflow goal set`, or `xflow goal audit` |
| `plan` | You only need a reusable implementation plan | `xflow:plan` |
| `ralph` | You want Codex to keep implementing, verifying, and repairing until completion evidence is clean | `xflow:ralph` |
| `yolo` | Backend, docs, infra, small UI, low ceremony | `xflow:yolo` or `xflow workflow run yolo` |
| `corps` | Product/UI-heavy or multi-agent work | `xflow:corps`, `xflow corps --explain`, or `xflow corps` |

`xflow:plan` is track-neutral. `yolo` and `corps` reuse an existing current plan instead of re-planning.
`xflow workflow validate corps` is preflight only; heavy-track completion is only accepted after `xflow proof --track corps` writes `corps_proof.json` with `ok=true`. The corps proof now requires the built-in governed corps manifest, hash-linked execution-log witnesses for every phase/atom/gate, and no `stub`/`pencil_stubbed` runtime fallback.

## What Makes It Different

| Surface | OpenFlow Position |
| --- | --- |
| Goal alignment | Project-level `.xflow/GOAL.md` that yolo, corps, Ralph, handoff, and takein consume |
| One-shot evaluation | `xflow evaluate` combines quality score, Codex goal / Superpowers comparison, ordinary and splash launch blockers, release-owner status, claim boundaries, next actions, and first-run path |
| Quality assessment | `xflow assess` gives a public scorecard for goal, yolo, corps, and the skill family |
| Launch demo | `xflow demo launch` shows goal -> yolo and goal -> corps proof paths |
| Launch audit | `xflow launch audit` separates ready engine and adoption evidence from missing registry proof |
| Launch dossier | `xflow launch dossier` prints the one-page public narrative backed by the same audit payload |
| Launch claims | `xflow launch claims` separates what can be said publicly now from claims blocked by missing evidence |
| Launch copy | `xflow launch copy` generates claim-safe announcement copy and forbidden phrases from the same evidence |
| Package status | `xflow package status` gives a non-failing publish/install status summary |
| Package audit | `xflow package audit` validates public npm registry evidence before splash-launch claims |
| Release status | `xflow release status` gives the release owner one focused blocker, next action, package status, and handoff doc |
| Adoption status | `xflow adoption status` gives a non-failing ordinary/splash adoption blocker summary |
| Adoption trial | `xflow adoption trial` gives external teams the exact commands and evidence checklist before a trial packet is written |
| Publish handoff | `docs/npm-publish-handoff.md` records the exact auth, preflight, publish, and post-publish gates |
| TDD | Executable red/green proof plus quality review |
| Workflow | YAML phases validated against atom registry |
| Spec migration | OpenSpec mapping report plus deterministic `spec_delta_review.json` |
| Local closure | Doctor, drift scan, release pack, archive ordering |
| Team handoff | `HANDOFF.md`, `AHA.md`, reviewer guide |
| Team adoption | Role model, CI boundary, PR acceptance, release ownership |
| Cross-tool use | Plain CLI and skill docs for Codex, Claude Code, Cursor, OpenCode, Gemini |
| Competitive proof | `xflow compare codex-goal`, `xflow compare superpowers`, `xflow compare openspec`, `xflow compare gstack`, `xflow compare spec-kit`, benchmark docs |
| Adoption proof | Minimal clean project runs in CI, plus public adoption-record templates |

## Docs

- [Quickstart](docs/quickstart.md)
- [Install and upgrade](docs/install-upgrade.md)
- [Tooling matrix](docs/tooling-matrix.md)
- [Compatibility notes](docs/compatibility.md)
- [Demo proof](docs/demo-proof.md)
- [Examples gallery](docs/examples-gallery.md)
- [Public benchmark](docs/public-benchmark.md)
- [Quality assessment](docs/quality-assessment.md)
- [Launch demo](docs/launch-demo.md)
- [Launch dossier](docs/launch-dossier.md)
- [Corps operator guide](docs/corps-operator-guide.md)
- [Superpowers comparison](docs/superpowers-comparison.md)
- [Adoption evidence template](docs/adoption/README.md)
- [Maintainer adoption record](docs/adoption/openflow-release-hardening.md)
- [xflow Goal vs Codex native goal](docs/goal-vs-codex.md)
- [Walkthrough](docs/walkthrough.md)
- [OpenSpec migration](docs/openspec-migration.md)
- [spec-kit benchmark](docs/spec-kit-benchmark.md)
- [Integration matrix](docs/integrations.md)
- [Public release gate](docs/public-release.md)
- [npm publish handoff](docs/npm-publish-handoff.md)
- [Release notes](RELEASE_NOTES.md)
- [Adapter fixture](docs/fixtures/tracker-item.json)
- [Methodology](docs/methodology.md)
- [Reviewer guide](docs/reviewer-guide.md)
- [Team adoption operating model](docs/team-adoption.md)
- [Competitive benchmark](docs/competitive-benchmark.md)
- [2026-05-25 benchmark report](docs/benchmark-openflow-vs-gstack-superpowers-openspec-2026-05-25.md)

## Verify

```bash
npm run drift:scan
npm run verify
npm run skill:diff
npm run release:pack
xflow assess
xflow launch audit
xflow score
```

Current release gate expectation: all active score dimensions are `strong`, and `xflow score` reports `100/100`.
