# Team Adoption Operating Model

Use this page when adopting as-xflow in a team rather than a solo local workflow.
The goal is a stable operating contract: every change has one workflow track, one
proof path, one review surface, and one release boundary.

## Readiness Levels

| Level | Audience | Required Proof |
| --- | --- | --- |
| Pilot | one maintainer, one repository | `xflow doctor`, `xflow workflow validate yolo`, `npm run drift:scan` |
| Team | 2-8 contributors | PR template requires workflow track, proof artifact, reviewer checklist, and drift evidence |
| Organization | multiple repositories | CI runs adoption smoke, release pack, skill diff, and score checks before publishing claims |

Do not present a repository as team-ready until the Team level is green.
Do not present a package as publicly promoted until the Organization level is green.

## Role Model

| Role | Responsibility |
| --- | --- |
| Operator | chooses `yolo` or `corps`, starts the workflow, and keeps `HANDOFF.md` current |
| Implementer | makes code/doc changes inside the accepted proposal and plan |
| Reviewer | checks proof artifacts, drift scan, TDD semantics, and archive order |
| Release owner | runs `npm run release:pack`, `npm run publish:check`, and confirms package ownership |

The conversation LLM is not the release owner. It can execute commands and collect
evidence, but a human owner accepts public publication.

## Track Policy

Use `yolo` when the current conversation or a human implementer owns the work:

```bash
xflow workflow run yolo --project-root . \
  --title "<change title>" \
  --change-type backend \
  --tdd-red-command "<failing command>" \
  --tdd-green-command "<passing command>"
```

Use `corps` when the workflow runtime should own heavy product/design execution:

```bash
xflow serve &
xflow corps --project-root . \
  --title "<product change>" \
  --change-type frontend \
  --change-id <id> \
  --competitor-product <name> \
  --target-surfaces primary_workspace \
  --primary-reference-surface primary_workspace \
  --reference-scenarios-json '<json>'
xflow proof --track corps --change-id <id> --project-root .
```

`corps` completion is not accepted from screenshots, chat summaries, partial
artifact checks, shortened workflow YAML, or stubbed agent output. It is
accepted only when `corps_proof.json` reports `ok=true` with strict runtime
evidence: built-in corps manifest, hash-linked execution logs, every canonical
phase completed, every atom/gate witnessed, and no `stub` / `task_queued` /
`pencil_stubbed` fallback.

## Required CI Checks

Every team repository using as-xflow should keep an equivalent CI boundary:

```bash
npm test
npm run drift:scan
npm run skill:diff
npm run release:pack
xflow score --json
xflow workflow validate yolo --project-root .
xflow workflow validate corps --project-root .
```

For consumer projects that only install the CLI, keep a smaller adoption smoke:

```bash
npm install -g as-xflow
xflow guide
xflow init --project-root .
xflow doctor --project-root .
xflow workflow validate yolo --project-root .
```

## PR Acceptance Checklist

A reviewer can accept a workflow-driven PR only when all of these are true:

- The PR names the track: `yolo` or `corps`.
- `proposal.md` and `plan.md` match the code and documentation changes.
- `verify_proof.json` or `corps_proof.json` is present for the claimed track.
- TDD proof includes red, green, and quality artifacts when code changed.
- `npm run drift:scan` passed after workflow, skill, or public-doc changes.
- Archive order remains `A5.archive.commit_push_close` before `A6.pr.create`.
- `HANDOFF.md` names the current stage, risk, and next operator action.

## Failure Policy

- If `status.json` disagrees with proof artifacts, trust proof artifacts and fix
  state persistence before claiming completion.
- If `skill:diff` fails, run `npm run skill:sync` intentionally, then rerun
  `npm run skill:diff`; do not publish with installed-skill drift.
- If `corps` lacks benchmark evidence or a primary reference surface, stop at
  the governed entry contract instead of inventing a product-specific shortcut.
- If release pack passes but publish dry-run fails, treat the package as locally
  ready but not publicly publishable.

## 95 Percent Readiness Gate

For public promotion, the project should satisfy all of these:

- `xflow score --json` returns `ok=true` and every dimension is `strong`.
- `npm run release:pack` passes from a clean source checkout.
- CI includes the minimal external adoption example.
- The reviewer guide and this team adoption model are linked from README.
- `yolo` dry-run exposes the full lite workflow without HTTP or Pencil.
- `corps` dry-run exposes a governed proof contract with no entry issues when
  benchmark evidence and `primary_reference_surface` are supplied.
- Remaining limitations are operational, not architectural: external service
  auth, package ownership, and real-case visual quality variance.
