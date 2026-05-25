# xflow Methodology

Date: 2026-04-19

## Purpose

xflow should feel like a guided delivery loop, not a bag of internal atoms. Operators should know what to do next even when they do not know the workflow internals.

The loop is:

```text
shape -> choose-track -> execute -> review -> finish
```

Use `xflow guide` when you need the shortest reminder of this loop.

## 1. Shape The Work

Goal: turn a rough request into a readable problem frame before implementation.

Use:

```bash
xflow:plan
```

Expected artifacts:

- `proposal.md`
- `plan.md`

Rules:

- Keep planning track-neutral.
- Do not choose yolo or corps inside plan.
- Reuse an existing current `plan.md` when yolo or corps starts.

## 2. Choose The Delivery Track

Goal: select the smallest track that can safely complete the work.

Use `xflow:yolo` when the change is bounded:

- backend logic
- docs
- scripts
- infrastructure
- small UI changes without a design loop

Use `xflow:corps` when the change needs heavier coordination:

- complex UI or product work
- multi-agent execution
- visual review
- mission control and gate observability

CLI equivalents:

```bash
xflow workflow validate yolo
xflow workflow validate corps
```

`workflow validate` is preflight only. It must not be used as proof that
`xflow:corps` ran.

## 3. Execute With Gates

Goal: move work through deterministic phases while preserving evidence.

Use:

```bash
xflow workflow run yolo --title "<title>" --change-type backend
```

or:

```bash
xflow corps --title "<title>" --change-type frontend --change-id <id>
xflow proof --track corps --change-id <id>
```

Expected artifacts:

- `status.json`
- `verify_proof.json`
- `corps_proof.json` for heavy-track completion
- workflow logs
- phase outputs under `specs/changes/<change-id>/`

Rules:

- Gates are stop signs, not decoration.
- Human gates require explicit approval.
- Verification evidence should be produced before archive.
- `corps` completion requires the governed built-in workflow manifest, hash-linked execution-log witnesses for every canonical phase, successful atom/gate evidence, and no `stub`, `task_queued`, or `pencil_stubbed` fallback.
- TDD is a first-class gate: the red proof runs before implementation, the green proof runs after implementation, and quality review rejects code changes without meaningful changed tests.

## 4. Review The Evidence

Goal: make completion defensible before shipping or handing off.

Run:

```bash
npm test
npm run drift:scan
npm run skill:diff
xflow score
```

Review:

- `docs/reviewer-guide.md`
- `verify_proof.json`
- `HANDOFF.md`
- current git status

## 5. Finish And Preserve Context

Goal: close the loop without losing durable learning.

Archive ownership stays with:

```text
A5.archive.commit_push_close
```

Expected durable outputs:

- refreshed `HANDOFF.md`
- updated `AHA.md` when there is a durable insight
- merged spec/workflow deltas
- committed and pushed implementation

## How This Beats Prompt-Only Workflows

xflow does not rely on a remembered chat ritual. The methodology is backed by:

- executable YAML workflows
- schema and registry tests
- local readiness checks
- drift scans
- installed skill sync checks
- handoff and archive artifacts
- `xflow score` evidence

The result is a workflow that is understandable to humans and enforceable by tooling.
