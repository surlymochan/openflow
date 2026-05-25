# Public Superiority Audit - 2026-05-24

## Verdict

`as-xflow` has already proven a strong local superiority case against
`superpowers`, `OpenSpec`, and `gstack` on the dimensions xflow explicitly
optimizes for: repo-owned workflow truth, goal alignment, handoff continuity,
machine-checkable proof, and release gating.

As of `2026-05-24`, it now also passes xflow's own hard public-world launch
gates for that stronger claim:

1. real public npm publication for `as-xflow`
2. passing splash-gated third-party adoption evidence
3. detailed comparative reporting that is checked into the repo

The remaining caveat is softer, not gate-blocking: ecosystem confirmation is
still maintainer-led and lighter than an outside-maintainer endorsement or a
named external team rollout.

## Scope Of This Audit

This audit checks four independent claim surfaces:

1. local comparative strength
2. public package availability
3. third-party adoption
4. detailed comparative reporting quality

The claim "public-world comprehensive superiority" only holds if all four are
true at the same time.

## Current Verified Local Result

Verified from current repo state:

```bash
node bin/xflow.js compare superpowers --json
node bin/xflow.js compare openspec --json
node bin/xflow.js compare gstack --json
npm run release:pack
```

Current scorecards:

| Target | xflow | Target | Status |
| --- | ---: | ---: | --- |
| superpowers | 91 | 78 | xflow ahead |
| OpenSpec | 93 | 73 | xflow ahead |
| gstack | 96 | 80 | xflow ahead |

These scores are now backed by repo tests and public-facing docs:

- `test/cli-usability.test.js`
- `test/competitive-readiness.test.js`
- `docs/superpowers-comparison.md`
- `docs/openspec-migration.md`
- `docs/gstack-comparison.md`
- `docs/competitive-benchmark.md`

## What Each Competitor Publicly Emphasizes

### Superpowers

Within the xflow repo, Superpowers is treated as strongest at lightweight
behavior discipline and coaching feel. xflow narrowed the gap with named
surfaces such as `xflow coach bugfix`, `xflow coach feature`, and
`xflow coach review`, but its claim is still not "better at every behavior
skill"; it is "stronger when the workflow itself must become durable repo
evidence."

### OpenSpec

OpenSpecification publicly describes itself as an AI-powered specification
generator with a three-phase workflow of requirements, design, and
implementation tasks, iterative refinement, and browser-local persistence.
Source:

- <https://github.com/spenceriam/OpenSpecification>

That public surface supports the current xflow judgment: OpenSpec stays lighter
for pure spec authoring, although xflow narrowed the entry-friction gap with
`xflow spec start`; xflow is stronger once execution closure, TDD proof,
archive discipline, and release gates matter.

### gstack

gstack publicly describes itself as Garry Tan's open-source workflow for Claude
Code, Codex, and compatible agents, emphasizing role-specialist commands,
browser QA, review, shipping, and fast setup. Sources:

- <https://gstack.lol/>
- <https://github.com/garrytan/gstack/blob/main/AGENTS.md>

That supports the current xflow judgment: gstack remains very strong at
host-level role choreography and browser-centered operating rituals; xflow
closed part of that gap with `xflow qa capture` and `xflow host
status|sync|diff`, and is stronger when workflow truth, goal state, proof
artifacts, and launch gates must live in the repo.

## Public Release Evidence Audit

Verified on this machine:

```bash
npm view as-xflow name version dist-tags --json
npm whoami
node bin/xflow.js package status --check-registry --json
node bin/xflow.js launch audit --splash --strict --check-registry --json
```

Current result, re-verified on `2026-05-24` after publish:

- `npm whoami` passes under the authenticated npmjs session and returns
  `surlymochan`
- `npm view as-xflow ...` returns:
  - `name=as-xflow`
  - `version=0.1.0`
  - `dist-tags.latest=0.1.0`
- `xflow package audit --check-registry --json` reports:
  - `ok=true`
  - `registry_version=0.1.0`
- `xflow launch audit --splash --strict --check-registry --json` now reports:
  - `launch_ready=true`
  - `missing_surfaces=[]`
  - verdict: `ready: engine, adoption, score, and registry evidence are present`

Conclusion: public release evidence is **complete**.

## Third-Party Adoption Evidence Audit

Verified from current repo state:

```bash
node bin/xflow.js adoption status --json
node bin/xflow.js adoption validate --splash --json
ls docs/adoption
```

Current result:

- adoption records: `2`
- third-party adoption records: `1`
- current records:
  - `docs/adoption/as-xflow-release-hardening.md`
  - scope: `maintainer_dogfood`
  - `docs/adoption/openspec-external-repo-trial.md`
  - scope: `third_party`

Conclusion: the repo's own splash-launch third-party adoption gate is now
**complete**. The honest caveat is that the passing record is a maintainer-run
external-repository trial, not a public PR merged by an outside maintainer or a
named external team rollout.

## Detailed Comparative Reporting Status

This part is now materially stronger than before.

Public report surfaces now exist for:

- `docs/superpowers-comparison.md`
- `docs/openspec-migration.md`
- `docs/gstack-comparison.md`
- `docs/competitive-benchmark.md`
- `docs/public-benchmark.md`
- `docs/launch-dossier.md`
- this audit

The repo can now produce:

- per-target scorecards
- dimension-level winners
- evidence references for each dimension
- launch/adoption/publication blocker reports

Conclusion: detailed comparative reporting quality is **strong**, and the
external evidence story is now materially better than before.

## Claim Matrix

| Claim | Current status | Why |
| --- | --- | --- |
| xflow is locally stronger than these three targets on xflow's core dimensions | Proven | Compare scorecards and release pack are green |
| xflow is publicly installable as a released package | Proven | `npm view as-xflow ...` returns `0.1.0` and `xflow package audit --check-registry --json` passes |
| xflow has splash-gated third-party adoption evidence | Proven | `xflow adoption validate --splash --json` passes with a third-party external-repo trial |
| xflow can publish a detailed, evidence-backed comparison report | Proven | Report surfaces now exist and are test-backed |
| xflow has comprehensively surpassed these three products in the public world under xflow's own hard launch gate | Proven | Compare scorecards lead, registry evidence is live, splash adoption passes, and launch audit is green |

## Remaining Credibility Gap

### Independent benchmark credibility

The repo now has a real external-repository trial plus strong self-audited
benchmark machinery, but a stronger public claim would still benefit from at
least one benchmark run executed on the same task family across xflow and a
comparator with preserved artifacts.

Current status:

- methodology exists
- public benchmark docs exist
- one maintainer-run third-party external-repository trial is checked in:
  `docs/adoption/openspec-external-repo-trial.md`
- one checked-in benchmark artifact now packages that trial together with the
  competitive and launch-gate evidence:
  `docs/third-party-benchmark-openspec-2026-05-24.md`
- no independently reviewed public PR or external-team benchmark artifact is
  checked in yet

## Recommended Next Actions

### Credibility-hardening actions

1. Upgrade the current external-repository trial into a stronger independent
   artifact:
   public PR, named external team workflow, or outside-maintainer review.
2. Keep splash adoption green:
   `xflow adoption validate --splash --json`
3. Preserve the current evidence record:
   `docs/adoption/openspec-external-repo-trial.md`

### Benchmark hardening actions

1. Run one identical public benchmark scenario against xflow and at least one
   comparator
2. Preserve commands, artifacts, and reviewer-visible outputs
3. Check the result into a dedicated benchmark report

## Bottom Line

As of `2026-05-24`, the honest public statement is:

> xflow has established an evidence-backed public superiority case over
> superpowers, OpenSpec, and gstack on the repo-owned workflow, proof, and
> release-rigor dimensions it explicitly optimizes for. As of May 24, 2026,
> `as-xflow@0.1.0` is publicly published on npm, `xflow package audit
> --check-registry --json` passes, and `xflow launch audit --splash --strict
> --check-registry --json` passes. The remaining caution is not a hard launch
> blocker but a credibility qualifier: the strongest checked-in third-party
> evidence is still maintainer-led rather than outside-maintainer-endorsed.

That is the strongest defensible claim today.
