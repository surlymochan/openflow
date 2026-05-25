# Public Benchmark And Demo

This benchmark is the public, repeatable proof path for claims against OpenSpec, gstack, spec-kit, and prompt-only skill systems.

## Demo Scenario

A tracker item arrives from an external system. `as-xflow` imports the source context, turns it into local change artifacts, reviews spec deltas, and proves the release surface before any public claim or package publish.

## Commands

```bash
xflow init --project-root .
xflow spec start --title "release proof adapter" --change-type backend
xflow objective --json
xflow assess --json
xflow demo launch --json
xflow launch dossier
xflow launch claims --json
xflow launch copy --json
xflow goal audit --json
xflow corps --explain --json
xflow adoption trial --name <team-or-project> --source <tracker-or-pr> --track yolo
xflow launch audit --strict --json
xflow doctor --project-root .
xflow adapter import-file --project-root . --input docs/fixtures/tracker-item.json --json
xflow spec delta --change-id release-proof-adapter
xflow compare codex-goal
xflow compare gstack
xflow compare superpowers
xflow compare openspec
xflow compare spec-kit
xflow score
npm run publish:check
xflow package preflight --check-registry --check-auth --json
xflow launch audit --pre-publish --strict --json
```

## Expected Artifacts

| Artifact | Meaning |
| --- | --- |
| `.as-xflow/config.json` | Project-local workflow defaults. |
| `specs/changes/release-proof-adapter/proposal.md` | Imported tracker context, now owned by repo-local xflow artifacts. |
| `specs/changes/release-proof-adapter/status.json` | Draft workflow state and adapter provenance. |
| `specs/changes/release-proof-adapter/spec_delta_review.json` | Requirements-level spec delta review. |
| `npm pack --dry-run` output | Package whitelist proof. |

## Scoring Method

| Dimension | Passing Evidence |
| --- | --- |
| Local engineering closure | `xflow workflow validate yolo`, `xflow workflow validate corps`, archive atoms, release pack. |
| TDD quality pressure | `I6a.tdd.run`, `I6b.tdd.proof_validate`, `I6c.tdd.quality_review`, and `test/tdd-proof.test.js`. |
| gstack comparison | `docs/gstack-comparison.md` and `xflow compare gstack --json`. |
| Superpowers comparison | `docs/superpowers-comparison.md` and `xflow compare superpowers --json`. |
| OpenSpec migration | `xflow spec openspec-map`, `docs/openspec-migration.md`, and `xflow spec delta`. |
| Spec authoring flow | `xflow spec start`, `docs/openspec-migration.md`, and generated `specs/changes/<id>/` artifacts. |
| spec-kit comparison | `docs/spec-kit-benchmark.md`, `docs/integrations.md`, and `xflow compare spec-kit --json`. |
| Public product readiness | README badges, `RELEASE_NOTES.md`, `docs/fixtures/tracker-item.json`, package whitelist, `npm run publish:check`, `xflow package status --json`, `xflow package preflight --check-registry --check-auth --json`, and `xflow package audit --check-registry --json`. |
| Quality assessment | `xflow assess --json`, `docs/quality-assessment.md`, `docs/goal-vs-codex.md`, `xflow compare codex-goal --json`, `xflow goal audit --json`, and `xflow score --json`. |
| Launch demo | `xflow demo launch --json`, `xflow corps --explain --json`, `xflow launch dossier`, `docs/launch-demo.md`, `docs/launch-dossier.md`, `docs/examples-gallery.md`, `docs/corps-operator-guide.md`, and goal-to-yolo / goal-to-corps proof paths. |
| Launch readiness | `xflow evaluate --json` with `splash_launch` and `splash_claims`, `xflow goal audit --json`, `xflow launch claims --json`, `xflow launch claims --splash --json`, `xflow launch copy --json`, `xflow launch copy --splash --json`, `xflow launch audit --pre-publish --strict --json`, `xflow launch audit --strict --json`, `xflow launch audit --splash --strict --json`, `xflow adoption status --json`, `xflow adoption trial`, `xflow adoption validate --json`, `xflow adoption validate --splash --json`, `xflow package status --json`, `xflow package preflight --check-registry --check-auth --json`, `xflow package audit --check-registry --json`, `docs/public-release.md`, `docs/npm-publish-handoff.md`, `docs/adoption/README.md`, `docs/adoption/as-xflow-release-hardening.md`, and explicit missing registry proof. |

## Current Result

`as-xflow` is designed to win the local delivery and verification benchmark because every superiority claim is backed by a runnable command or checked file. Public ecosystem breadth still needs third-party adoption, but the repo now ships the adapter seam, adoption validator, fixture-backed smoke path, and a non-fixture maintainer release-hardening adoption record.
