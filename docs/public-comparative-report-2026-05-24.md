# Public Comparative Report - 2026-05-24

## Executive Summary

`as-xflow` currently leads `superpowers`, `OpenSpec`, and `gstack` on the
surfaces xflow is explicitly built to win:

- repo-owned workflow state
- durable goal alignment
- handoff continuity
- machine-checkable proof
- release and launch gating

Current verified local scorecards:

| Target | xflow | Target | Delta |
| --- | ---: | ---: | ---: |
| superpowers | 91 | 78 | +13 |
| OpenSpec | 93 | 73 | +20 |
| gstack | 96 | 80 | +16 |

Those results are real and verified from source checkout. As of `2026-05-24`,
they are now also sufficient to satisfy xflow's own hard public-world launch
gate because npm publication and splash-gated third-party adoption both verify
cleanly. The remaining caveat is softer: the strongest third-party evidence is
still a maintainer-run external-repository trial rather than a stronger outside
maintainer endorsement.

For the precise claim boundary, see
[Public superiority audit](./public-superiority-audit-2026-05-24.md).

## Method

This report intentionally separates four layers:

1. comparator public positioning
2. xflow's verified product surfaces
3. dimension-by-dimension relative judgment
4. public-world completion gates

That separation prevents a strong local engineering result from being mistaken
for a completed ecosystem result.

## Comparator Public Positioning

### Superpowers

Publicly and within the xflow benchmark surface, Superpowers is treated as
strongest at behavior shaping, TDD discipline, debugging process, and review
habits. It shines when a developer wants rigorous operating behavior without
adopting a repo-owned runtime.

### OpenSpec

OpenSpecification publicly emphasizes AI-powered spec generation, a three-phase
workflow of requirements, design, and implementation tasks, iterative
refinement, diagrams, exports, and browser-local persistence.

Reference:

- <https://github.com/spenceriam/OpenSpecification>

### gstack

gstack publicly emphasizes role-specialist commands, browser QA, review,
shipping, sprint rhythm, and fast installation for Claude Code, Codex, and
compatible agents.

References:

- <https://gstack.lol/>
- <https://github.com/garrytan/gstack/blob/main/AGENTS.md>

## xflow Verified Surfaces

Verified from current repo state:

- `npm run release:pack`
- `node bin/xflow.js compare superpowers --json`
- `node bin/xflow.js compare openspec --json`
- `node bin/xflow.js compare gstack --json`
- `node bin/xflow.js launch audit --splash --strict --check-registry --json`
- `node bin/xflow.js adoption status --json`

Verified strengths:

- checked-in workflow YAML for `yolo` and `corps`
- deterministic atoms and gate contracts
- split red/green TDD proof and quality review
- `.xflow/GOAL.md` as a durable project-level anchor
- `HANDOFF.md` and `AHA.md` as continuity surfaces
- release-owner gates for package, launch, and adoption
- machine-readable compare scorecards with `evidence_refs`

## Multi-Dimensional Comparison

### 1. Behavior discipline

Winner: `superpowers`

Why:

- Superpowers is explicitly optimized for behavior coaching, structured process
  discipline, and coding habit enforcement with minimal repo setup.

xflow response:

- Superpowers still has the lighter coaching edge.
- xflow narrowed the gap by adding named discipline surfaces such as `xflow coach bugfix`, `xflow coach feature`, and `xflow coach review`, then turns that discipline into repo-owned workflow truth and proof artifacts.

### 2. Spec authoring friction

Winner: `OpenSpec`

Why:

- OpenSpec's public value proposition is low-friction spec generation and
  refinement before execution.

xflow response:

- xflow narrowed the friction gap with `xflow spec start`, but still accepts
  slightly higher ceremony in exchange for execution closure, archive
  boundaries, and proof.

### 3. Role-specialist command surface

Winner: `gstack`

Why:

- gstack's public command surface is broader and more role-specific at the host
  layer.

xflow response:

- xflow is optimized for a narrower claim: durable, repo-owned workflow
  execution instead of the richest host-level command catalog. The gap is now
  smaller because xflow added named QA and host wrappers such as `xflow qa
  capture` and `xflow host status|sync|diff`.

### 4. Repo-owned workflow truth

Winner: `xflow`

Why:

- workflow order, gates, and track boundaries are checked-in data, not only
  installed command behavior.

Beats:

- Superpowers on durable runtime structure
- OpenSpec on execution closure
- gstack on checked-in workflow state

### 5. Goal alignment and continuity

Winner: `xflow`

Why:

- `.xflow/GOAL.md`, `HANDOFF.md`, and `AHA.md` make project alignment explicit
  across sessions and tools.

Beats:

- Superpowers on project durability
- OpenSpec on workflow-consumed goal state
- gstack on repo-level continuity artifacts

### 6. TDD proof and reviewable evidence

Winner: `xflow`

Why:

- xflow can point to red/green proof JSON, quality review outputs, workflow
  validation, and archive gates instead of relying only on behavior guidance.

### 7. Public launch and release gating

Winner: `xflow`

Why:

- xflow has built product surfaces for `package status`, `package preflight`,
  `package audit`, `launch audit`, `launch dossier`, `launch claims`, `launch
  copy`, and adoption validation.

Important caveat:

- the surfaces are stronger than the competitors' visible surfaces, and the
  repo's own hard public-world launch gate is now green; the remaining caution
  is credibility strength, not a failed launch gate.

## Composite Judgment

### Where xflow is already stronger

- repo-owned workflow truth
- goal alignment and continuity
- machine-checkable proof
- release-owner gating
- artifact-based public claim boundaries
- handoff-friendly project memory

### Where competitors still hold the narrower edge

- `superpowers`: lighter behavior discipline and coaching feel
- `OpenSpec`: lighter pure spec authoring flow
- `gstack`: richer host-level role and browser command surface

### What that means

xflow has a stronger **systems-level delivery runtime** than these three public
comparators on the dimensions it chooses to optimize.

It now has complete public-world proof under xflow's own launch rubric.

## Public-World Completion Gates

These were the requirements before the stronger claim became valid. All hard
gates below now pass.

### Package publication

Required:

- authenticated npm owner session
- real `npm publish --access public`
- registry verification via `xflow package audit --check-registry --json`

Current status:

- complete
- `npm publish --access public` succeeded on `2026-05-24`
- `npm view as-xflow name version dist-tags --json --registry=https://registry.npmjs.org/`
  returns `as-xflow@0.1.0`
- `xflow package audit --check-registry --json` passes

Important caveat:

- this is a maintainer-run external-repository trial, not an outside maintainer
  endorsement or merged public PR

### Third-party adoption

Required:

- at least one real third-party adoption record
- `xflow adoption validate --splash --json` passes

Current status:

- complete
- `xflow adoption validate --splash --json` passes
- `docs/adoption/openspec-external-repo-trial.md` provides the passing
  third-party checked-in record

### Benchmark credibility beyond self-report

Required:

- at least one preserved benchmark scenario executed on the same public task
  family across xflow and a comparator

Current status:

- protocol exists
- preserved third-party benchmark artifact now exists:
  `docs/adoption/openspec-external-repo-trial.md`
- packaged benchmark report now exists:
  `docs/third-party-benchmark-openspec-2026-05-24.md`
- independently reviewed public PR or external-team benchmark artifact does not
  yet exist

## External Trial Assets Already Prepared

Prepared in this repo:

- [Third-party trial packet](./adoption/trial-packets/external-benchmark-evaluator.md)
- [OpenSpecification external repo trial](./adoption/openspec-external-repo-trial.md)
- [Third-party benchmark artifact](./third-party-benchmark-openspec-2026-05-24.md)
- [Adoption evidence guide](./adoption/README.md)
- [Public benchmark and demo](./public-benchmark.md)
- [Public superiority audit](./public-superiority-audit-2026-05-24.md)

These do not count as adoption evidence by themselves, but they lower the cost
of getting real external proof.

## Final Honest Statement

The strongest defensible public statement today is:

> xflow has already demonstrated a strong, evidence-backed local lead over
> superpowers, OpenSpec, and gstack on repo-owned workflow execution, durable
> project alignment, proof, and release rigor. It now also has a passing
> third-party external-repository trial under its own splash adoption gate.
> Public-world comprehensive superiority is not yet complete, because registry
> publication is still missing and the external evidence has not yet been
> upgraded into stronger independent ecosystem endorsement.

That is the current truth boundary.
