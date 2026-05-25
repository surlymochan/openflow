# openflow Launch Demo

Use this page when someone asks whether xflow goal is useful or whether yolo
and corps are only prompt wrappers.

## Demo Promise

`xflow goal` is useful when it becomes the direction anchor for verified
delivery, not when it acts as another chat reminder.

The launch demo has two paths:

1. `goal -> yolo`: a small change proves red/green TDD, quality review, archive
   order, and final goal alignment.
2. `goal -> corps proof`: a product or UI change proves the same direction can
   survive heavy-track evidence, visual benchmarks, and final proof review.

## One-Minute Overview

```bash
xflow guide
xflow assess
xflow demo launch
xflow demo launch --json
xflow corps --explain
xflow launch audit
xflow launch dossier
```

The JSON form is for agents and docs generators. The text form is for humans
reviewing the launch story.

## Path 1: Goal To Yolo

```bash
xflow init --project-root .
xflow goal set "Ship the next verified change" --project-root .
xflow goal audit --project-root . --json
xflow workflow validate yolo --project-root .
xflow workflow run yolo --project-root . \
  --title "Example verified change" \
  --change-type backend \
  --tdd-red-command "npm test -- --grep new-behavior" \
  --tdd-green-command "npm test"
```

Proof to inspect:

- `.xflow/GOAL.md`
- `xflow goal audit --json` showing yolo/corps/Ralph/handoff/takein consumption
- `specs/changes/<change-id>/tdd/red-0.json`
- `specs/changes/<change-id>/tdd/green-0.json`
- `specs/changes/<change-id>/tdd/quality-0.json`
- final verification summary naming goal alignment

## Path 2: Goal To Corps Proof

```bash
xflow goal show --json
xflow goal audit --json
xflow corps --explain --json
xflow corps \
  --title "Competitor-aligned workbench" \
  --change-type frontend \
  --change-id launch-corps-demo \
  --capture-url http://127.0.0.1:4174/ \
  --reference-image refs/competitor-main.png \
  --dry-run \
  --json
xflow proof --track corps --change-id launch-corps-demo
```

Proof to inspect:

- `.xflow/GOAL.md`
- `specs/changes/launch-corps-demo/visual_benchmark.json`
- `specs/changes/launch-corps-demo/corps_proof.json`
- hash-linked execution-log witnesses
- final proof review naming whether the product contract satisfies the goal

## Why Goal Still Matters

Codex native goal is good thread memory. xflow goal is useful when it is project
memory plus workflow evidence. If a change cannot explain how it aligns with,
narrows, or intentionally diverges from `.xflow/GOAL.md`, the goal has not done
its job.

That is why `xflow demo launch` includes both yolo and corps. The value is not
the existence of a goal file; the value is that the file becomes a shared audit
input for lightweight and heavyweight delivery.

`xflow goal audit --json` is the machine-readable guard for that claim. It
fails when the project has no durable goal or when the core skill family stops
declaring `.xflow/GOAL.md` as an intake, handoff, or completion-audit input.

## Launch Readiness Audit

```bash
xflow launch audit --strict --json
```

This command is intentionally stricter than `xflow demo launch`. The demo proves
the story is explainable. The launch audit says whether the story is ready to be
promoted as an industry splash. In strict mode it exits non-zero until every
launch surface is proven. It validates `docs/adoption/` before producing the
missing-surface list, so a real adoption record removes the
`real_external_adoption` gap automatically. Registry publication remains a
separate launch gate checked through `xflow package preflight --check-registry
--check-auth --json` plus `xflow launch audit --pre-publish --strict --json`
before publish, and `xflow package audit --check-registry --json` after publish.

Use `xflow launch dossier` when you need the concise public-facing one-pager:
it summarizes the quality judgment, Codex native goal comparison, yolo/corps
proof paths, release gate, and missing launch surfaces from the same audit
payload.

Use [docs/adoption/README.md](./adoption/README.md) when turning a real team or
external project trial into reviewable launch evidence, then run
`xflow adoption validate --json` before using that record in launch claims.

Use [docs/corps-operator-guide.md](./corps-operator-guide.md) when the heavy
track feels too large to start. It compresses corps into first-time commands,
proof requirements, competitor-led inputs, and common failure meanings.
