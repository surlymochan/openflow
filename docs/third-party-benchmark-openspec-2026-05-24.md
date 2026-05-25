# Third-Party Benchmark Artifact - OpenSpecification Trial - 2026-05-24

## Verdict

This checked-in artifact upgrades the earlier benchmark protocol from "prepared"
to "executed once on a real third-party external repository".

It does **not** prove full public-world superiority on its own, because this
trial is still maintainer-run rather than outside-maintainer-led.

It **does** prove that xflow can preserve reviewer-visible evidence on a real
third-party repository while continuing to lead OpenSpec on the execution-grade
surfaces xflow explicitly claims to own.

## Benchmark Scope

Scenario family:

- Scenario B: spec-to-execution change / external repository bootstrap

Third-party source:

- OpenSpecification public repository:
  <https://github.com/spenceriam/OpenSpecification>

Trial objective:

- evaluate whether xflow can bootstrap durable repo-local goal state, validate
  workflow entrypoints, and preserve reviewable artifacts inside a third-party
  repository that was not authored for xflow

## Commands Run

External repository trial:

```bash
git clone --depth 1 https://github.com/spenceriam/OpenSpecification.git /tmp/xflow-openspec-trial
node bin/xflow.js init --project-root /tmp/xflow-openspec-trial --json
node bin/xflow.js goal set "Evaluate xflow bootstrap and workflow validation in the OpenSpecification source checkout without changing product code." --project-root /tmp/xflow-openspec-trial --json
node bin/xflow.js goal show --project-root /tmp/xflow-openspec-trial --json
node bin/xflow.js goal audit --project-root /tmp/xflow-openspec-trial --json
node bin/xflow.js doctor --project-root /tmp/xflow-openspec-trial --json
node bin/xflow.js workflow validate yolo --project-root /tmp/xflow-openspec-trial
node bin/xflow.js workflow run yolo --project-root /tmp/xflow-openspec-trial --title "OpenSpecification external benchmark bootstrap" --change-type backend --change-id openspec-benchmark --dry-run
```

Comparator and launch evidence:

```bash
node bin/xflow.js compare openspec --json
node bin/xflow.js compare superpowers --json
node bin/xflow.js compare gstack --json
node bin/xflow.js score --json
node bin/xflow.js adoption validate --splash --json
node bin/xflow.js launch audit --splash --strict --check-registry --json
```

## Preserved Artifacts

External repository evidence:

- [OpenSpecification adoption record](./adoption/openspec-external-repo-trial.md)
- [source checkout snapshot](./adoption/evidence/openspec-external-repo/source-checkout.json)
- [goal audit snapshot](./adoption/evidence/openspec-external-repo/goal-audit.json)
- [doctor snapshot](./adoption/evidence/openspec-external-repo/doctor.json)
- [workflow dry run](./adoption/evidence/openspec-external-repo/workflow-dry-run.txt)

Benchmark and release-gate evidence:

- [compare-openspec.json](./benchmark-evidence/2026-05-24/compare-openspec.json)
- [compare-superpowers.json](./benchmark-evidence/2026-05-24/compare-superpowers.json)
- [compare-gstack.json](./benchmark-evidence/2026-05-24/compare-gstack.json)
- [score.json](./benchmark-evidence/2026-05-24/score.json)
- [adoption-validate-splash.json](./benchmark-evidence/2026-05-24/adoption-validate-splash.json)
- [launch-audit-splash.json](./benchmark-evidence/2026-05-24/launch-audit-splash.json)

## Result Summary

### Same task family

The benchmark uses the same task family xflow claims to outperform on:

- turn repository direction into durable goal state
- validate executable workflow entrypoints
- preserve machine-readable evidence
- distinguish local readiness from public launch readiness

### Reviewable third-party outcome

The OpenSpecification checkout trial produced reviewable artifacts without
changing OpenSpecification product code:

- repo-local xflow config
- repo-local `.xflow/GOAL.md`
- goal-audit proof
- doctor proof
- yolo validation proof
- yolo dry-run structure

### Competitive result

Current checked-in scorecards still show xflow ahead:

| Target | xflow | Target | Delta |
| --- | ---: | ---: | ---: |
| superpowers | 91 | 78 | +13 |
| OpenSpec | 93 | 73 | +20 |
| gstack | 96 | 80 | +16 |

### Public launch boundary

The same artifact set now contributes to a fully green hard launch gate:

- `xflow adoption validate --splash --json` passes
- `npm publish --access public` completed on `2026-05-24`
- `xflow package audit --check-registry --json` passes
- `xflow launch audit --splash --strict --check-registry --json` passes

## Dimensions Where xflow Wins

- executable delivery closure
- repo-owned workflow truth
- durable project goal alignment
- machine-checkable adoption and launch gates
- distinction between internal readiness and public-world proof

## Dimensions Where Competitors Still Win

- `OpenSpec`: still lighter for pure spec authoring, even after `xflow spec start`
- `superpowers`: still lighter for behavior coaching and process discipline
- `gstack`: still broader at host-level role and browser ritual surface, even after `xflow qa capture` and `xflow host` wrappers

## Honest Boundary

This artifact is strong enough to say:

> xflow now has a checked-in, reviewer-visible third-party repository benchmark
> artifact plus a passing splash adoption gate.

This artifact alone is **not** strong enough to say:

> xflow has already completed public-world comprehensive superiority.

That stronger claim now depends on the broader evidence bundle, not this single
artifact in isolation. The remaining honest caveat is stronger independent
ecosystem endorsement, not missing npm publication.
