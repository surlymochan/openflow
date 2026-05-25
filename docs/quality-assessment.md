# openflow Quality Assessment

Date: 2026-05-23

## Verdict

`openflow` is strong enough to present as a serious open-source agent delivery
runtime today. The core engine is no longer the weak point: yolo and corps both
have executable workflow data, verification gates, and release checks.

The remaining gap for an industry splash is distribution proof: publish the
package and show a polished external demo. Fixture-only adoption proof has been
replaced with a reviewable maintainer release-hardening record, while broader
third-party adoption remains the next ecosystem win.

In readiness terms, the current state is:

- `source_checkout`: ready
- `open_source_launch`: blocked by `published_package`
- `industry_splash`: blocked by `published_package` and `third_party_adoption`

## Objective Audit

- `goal_vs_codex`: proven at the project layer
- `yolo_delivery`: proven from source checkout
- `corps_delivery`: proven from source checkout
- `skill_family_open_source_credibility`: ready from source checkout
- `open_source_launch`: blocked by `published_package`
- `industry_splash`: blocked by `published_package` and `third_party_adoption`

## Can xflow Beat Codex Native Goal?

Yes, but only in a specific way.

Codex native goal is better for one active thread: it is close to the model,
cheap to update, and useful for completion accounting. `xflow:goal` is better
for project delivery when `.xflow/GOAL.md` becomes a durable artifact that yolo,
corps, Ralph, handoff, and takein all read and audit.

That distinction is the product claim:

```text
Codex goal = thread memory
xflow goal = project alignment evidence
```

## Scorecard

| Surface | Grade | Current Evidence | Next Win |
| --- | --- | --- | --- |
| `xflow:goal` | A | `.xflow/GOAL.md`, `xflow goal set`, `xflow goal show --json`, `xflow goal audit --json`, `docs/goal-vs-codex.md` | Real examples where goal alignment changed review or handoff quality |
| `xflow:yolo` | A | YAML workflow, split TDD proof, quality review, archive order, drift tests | Tiny public bugfix demo from red proof to archive |
| `xflow:corps` | A | Governed corps entry, `xflow corps --explain`, `corps_proof.json`, visual benchmark gates, no-stub witnesses | Real product/UI adoption walkthrough backed by corps proof |
| Skill family | A- | `xflow quickstart`, `xflow guide`, `xflow assess`, `xflow score`, tooling matrix, skill sync/diff, `docs/adoption/openflow-release-hardening.md` | Public npm publish plus third-party adoption evidence |

## Public Proof Path

```bash
xflow objective
xflow objective --json
xflow assess
xflow assess --json
xflow evaluate
xflow evaluate --json
xflow compare codex-goal --json
xflow compare superpowers --json
xflow compare gstack --json
xflow demo launch
xflow demo launch --json
xflow launch dossier
xflow launch claims --json
xflow launch copy --json
xflow launch audit
xflow launch audit --json
xflow launch audit --strict --json
xflow adoption kit --name <team-or-project> --source <tracker-or-pr> --track yolo
xflow adoption init --name <team-or-project> --source <tracker-or-pr> --track yolo
xflow adoption status --json
xflow adoption validate --json
xflow adoption validate --splash --json
xflow package status --json
xflow package preflight --check-registry --check-auth --json
xflow launch audit --pre-publish --strict --json
xflow launch audit --splash --strict --json
xflow package audit --check-registry --json
xflow score --json
xflow goal show --json
xflow goal audit --json
xflow corps --explain --json
npm run drift:scan
npm run release:pack
```

`xflow assess` is the human-facing assessment. `xflow score` is the repository
evidence gate. `release:pack` proves the shipped package includes the current
docs, CLI, workflows, atoms, and skill sources.
`docs/npm-publish-handoff.md` is the last-mile publish checklist once npm auth
is restored.

## Completion Boundary

Internal quality is ready: `xflow score --json` is 100/100, `xflow goal audit
--json` proves the Codex-goal comparison at the project layer, and
`npm run release:pack` proves the package contents. The remaining blockers are
external proof, not hidden engine work:

- `npm_auth_and_publish`: requires release-owner npm auth, preflight, real
  `npm publish --access public`, and registry audit.
- `third_party_adoption`: requires a real third-party project or public PR
  started from `xflow adoption kit`, captured with
  `docs/adoption/<team-or-project>.md`, and validated by `xflow adoption
  validate --splash --json`.

`xflow evaluate --json` reports both ordinary launch readiness and stricter
`splash_launch` readiness, plus ordinary `claims` and stricter `splash_claims`,
so evaluators can distinguish source-checkout quality, post-publish package
proof, and broad ecosystem claims.

## Open-Source Launch Bar

Before calling the launch story excellent rather than merely ready:

1. Publish the npm package from the verified tarball only after `xflow package preflight --check-registry --check-auth --json` confirms npm identity and package-name/version availability, and `xflow launch audit --pre-publish --strict --json` confirms score plus adoption evidence are not being bypassed.
2. Keep `xflow adoption validate --json` green with at least one non-fixture
   adoption record. The current maintainer release-hardening record proves the
   gate works and names the remaining npm-publication failure; the next
   ecosystem upgrade is a third-party project or public PR using
   `xflow adoption kit` before converting trial results into the same
   evidence shape.
3. Keep `docs/launch-demo.md`, `docs/launch-dossier.md`,
   `docs/corps-operator-guide.md`, and `xflow demo launch` current as the
   canonical walkthrough for `goal -> yolo` and `goal -> corps proof`, and keep
   `xflow launch dossier` aligned as the concise public-facing summary.
4. Make `published_package` disappear from `xflow launch audit --strict --json` only
   after `xflow package audit --check-registry --json` confirms the npm
   registry reports the expected package name and version.
5. Keep the scorecard honest: if any public claim lacks a runnable command,
   checked artifact, or drift test, downgrade it until evidence exists.
