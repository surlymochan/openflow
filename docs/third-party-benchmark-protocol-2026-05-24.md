# Third-Party Benchmark Protocol - 2026-05-24

## Purpose

This protocol defines what must happen before xflow can honestly claim
public-world comprehensive superiority over `superpowers`, `OpenSpec`, and
`gstack`.

The benchmark must be third-party-reviewable, not only repo-internal.

## Required Benchmark Properties

1. Same task family across systems
2. Same success criteria across systems
3. Preserved commands and artifacts
4. Reviewer-visible outputs
5. Explicit tradeoff notes where xflow does not win

## Task Families

The benchmark should include at least these three scenarios:

### Scenario A: backend or docs change

Goal:

- show xflow `yolo` against lightweight process-oriented systems

Why:

- strongest contrast vs prompt-discipline-only workflows

### Scenario B: spec-to-execution change

Goal:

- compare xflow against OpenSpec-style flows once implementation closure matters

Why:

- proves whether spec quality actually turns into delivery rigor

### Scenario C: product or UI workflow

Goal:

- compare xflow against gstack once browser QA, review, and release ritual are
  relevant

Why:

- this is the fairest environment for gstack's strengths

## Evidence To Preserve

For every scenario, preserve:

- initial task statement
- commands run
- pass/fail results
- produced artifacts
- reviewer-visible proof link or checked-in artifact
- explicit judgment

## Minimum Artifacts

- xflow compare output or equivalent benchmark summary
- xflow goal or workflow artifact
- proof JSON or benchmark artifact where applicable
- competitor-visible output or documented workflow result
- final comparison note explaining who won and why

## Acceptance Standard

The benchmark is strong enough for public claims only when:

1. at least one non-maintainer reviewer can inspect the evidence
2. xflow wins on the dimensions it claims to win
3. the report explicitly names dimensions where competitors still win
4. the report is checked into the repo and linked from public docs

## Prepared External Trial Packet

Use this prepared packet to recruit a third-party evaluator:

- [external-benchmark-evaluator trial packet](./adoption/trial-packets/external-benchmark-evaluator.md)

Suggested outbound commands:

```bash
xflow adoption brief --name external-benchmark-evaluator --source https://github.com/surlymochan/as-xflow --track yolo
xflow adoption trial --name external-benchmark-evaluator --source https://github.com/surlymochan/as-xflow --track yolo
```

## Current Status

As of `2026-05-24`:

- protocol exists
- trial packet exists
- local benchmark/report surfaces exist
- one checked-in third-party benchmark artifact now exists:
  `docs/third-party-benchmark-openspec-2026-05-24.md`
- one validated third-party adoption record now exists:
  `docs/adoption/openspec-external-repo-trial.md`
- splash adoption validation passes:
  `xflow adoption validate --splash --json`
- public-world completion remains blocked by npm publication evidence only

## Completion Trigger

This protocol is only complete when both are true:

1. a third-party benchmark artifact exists and is reviewable
2. the resulting adoption record passes `xflow adoption validate --splash --json`

As of this snapshot, both conditions above are satisfied. What remains outside
this protocol is public package publication and registry verification.
