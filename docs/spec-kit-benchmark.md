# spec-kit Benchmark

This benchmark is the repeatable comparison path for spec-kit-style specification-driven delivery.

## Scenario

Use the same brownfield change in both systems:

> Add a deterministic spec delta review for a project that already has proposal, plan, task checklist, and durable root specs.

## xflow Run

```bash
xflow init --project-root .
xflow guide
xflow workflow validate yolo --project-root .
xflow spec delta --project-root . --change-id <change-id>
xflow score
npm run release:pack
```

Expected xflow artifacts:

- `specs/changes/<change-id>/proposal.md`
- `specs/changes/<change-id>/plan.md`
- `specs/changes/<change-id>/spec_delta_review.json`
- `specs/changes/<change-id>/spec_delta_review.md`
- `specs/changes/<change-id>/tdd/red-0.json`
- `specs/changes/<change-id>/tdd/green-0.json`
- `specs/changes/<change-id>/tdd/quality-0.json`
- `HANDOFF.md`
- `AHA.md`

## spec-kit Run

Use the equivalent spec-kit flow:

```text
/speckit.constitution
/speckit.specify
/speckit.plan
/speckit.tasks
/speckit.implement
/speckit.analyze
```

Record the generated spec, plan, tasks, implementation evidence, and quality checks.

## Scoring Rubric

| Dimension | xflow Win Condition |
| --- | --- |
| Requirements traceability | Requirement-level statements appear in `requirements_delta`. |
| Executable workflow | Workflow order validates from YAML and atom registry. |
| TDD semantics | Red fails before implementation; green passes after implementation. |
| Test quality | `quality-0.json` rejects empty, snapshot-only, or mock-heavy tests without assertions. |
| Archive closure | Handoff/AHA/archive order is explicit and test-covered. |
| Release readiness | `npm run release:pack` passes. |
| Public comparison | `xflow compare spec-kit --json` prints machine-readable edges. |

## Current Judgment

xflow should win the local engineering rigor section. spec-kit may still win public ecosystem breadth until xflow has public registry release, richer external adapters, and a larger example library.

Do not claim a full spec-kit product win unless:

- `npm run publish:check` passes
- `xflow package preflight --check-registry --check-auth --json` passes before public publish
- `xflow launch audit --pre-publish --strict --json` passes before the irreversible publish step
- `xflow package audit --check-registry --json` passes after public publish
- `docs/integrations.md` covers the target integration class
- `xflow compare spec-kit --json` is green
- the benchmark artifacts above are produced for the same change
