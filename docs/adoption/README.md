# Adoption Evidence

Use this folder for real external adoption proof. Do not use it for fixture-only
demo runs, synthetic screenshots, or private anecdotes that cannot be reviewed.

`xflow launch audit --json` intentionally treats public launch as incomplete
until at least one adoption artifact exists here or a linked public PR provides
equivalent evidence.

Validate records before using them in launch claims:

```bash
xflow adoption brief --name <team-or-project> --source <tracker-or-pr> --track yolo
xflow adoption trial --name <team-or-project> --source <tracker-or-pr> --track yolo
xflow adoption kit --name <team-or-project> --source <tracker-or-pr> --track yolo
xflow adoption init --name <team-or-project> --source <tracker-or-pr> --track yolo
xflow adoption status --json
xflow adoption validate --json
xflow adoption validate --splash --json
```

`xflow adoption status` is the non-failing release-owner view: it reports
ordinary adoption status, splash third-party status, blocker ids, and the next
external trial command without treating missing evidence as a CLI error.

`xflow adoption brief` prints a sendable third-party ask: what to ask for, what
acceptance bar to hold, and which maintainer follow-up commands close the loop.
Use it when you need to message an external team instead of just reading raw
commands yourself.

`xflow adoption trial` prints a copy-paste external trial sequence without
writing files. Use it when a third-party team asks what to run before you create
or send a packet.

`xflow adoption kit` creates `docs/adoption/trial-packets/<team-or-project>.md`.
Share that packet with the external project before the trial. It lists the
commands to run, the sendable ask text, the artifacts to collect, the
acceptance bar, and the validation commands that must pass after evidence is
converted into an adoption record.

`xflow adoption init` only creates a draft. The draft intentionally contains
placeholders and must fail validation until a real trial fills in evidence,
outcome, and redaction details.

## Required Shape

Each adoption record should be a short markdown file named after the project,
team, or tracker source:

```text
docs/adoption/<team-or-project>.md
```

The record must include:

- **Context**: what project, team, or external workflow tried xflow.
- **Goal**: the `.xflow/GOAL.md` direction or equivalent project objective.
- **Track**: yolo, corps, or both.
- **Evidence**: commands run, artifacts produced, and links or paths to proof.
- **Outcome**: what improved, what failed, and whether xflow would be used again.
- **Redactions**: what was sanitized and why.

## Acceptance Bar

An adoption record is strong enough for launch only when it proves all of these:

1. The work came from outside the fixture path in `docs/fixtures/`.
2. A real goal or tracker item shaped the delivery.
3. At least one xflow command produced reviewable artifacts.
4. The record names a concrete benefit or a concrete failure.
5. A reviewer can follow the evidence without private machine state.

For industry-splash claims, the bar is stricter: at least one passing record
must come from a third-party project, public PR, external repository, or named
external team beyond maintainer dogfooding. Use `xflow launch audit --splash
--strict --json` before saying broad third-party adoption is proven.

## Template

```markdown
# Adoption: <team-or-project>

Date: YYYY-MM-DD
Source: <tracker, repository, team workflow, or public PR>
Track: <yolo|corps|both>

## Context

<What external project or team workflow tried xflow?>

Use `third-party`, `public PR`, `external project`, `external repository`,
`customer`, `partner`, `team workflow`, or an `https://` source when the record
is intended to satisfy splash-launch third-party evidence.

## Goal

<What durable project direction or tracker objective guided the work?>

## Commands

```bash
xflow goal show --json
xflow assess --json
xflow workflow validate yolo --project-root .
# or: xflow corps ... && xflow proof --track corps --change-id <id>
```

## Evidence

- `<path-or-link-to-status.json>`
- `<path-or-link-to-red-green-quality-proof>`
- `<path-or-link-to-corps_proof.json>`
- `<path-or-link-to-PR-or-review>`

At least one evidence bullet must be reviewable by someone outside the authoring
machine. Prefer public PRs, external repository links, sanitized tracker exports,
or checked-in proof artifacts.

## Outcome

<What got better, what failed, and whether the team would use xflow again?>

## Redactions

<What was sanitized?>

State `None` only when the record and evidence are already public.
```
