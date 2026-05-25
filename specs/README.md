# Specs

This directory is the single Superflow-owned root directory at the project root.

It has two layers:

- `specs/*.md` for durable project source-of-truth specs
- `specs/changes/<change-id>/` for per-change working artifacts

## Layout

```text
specs/
|-- README.md
|-- product.md
|-- architecture.md
|-- workflow.md
|-- ux.md                # optional (or use DESIGN.md)
|-- DESIGN.md            # optional design system
`-- changes/
    `-- <change-id>/
        |-- proposal.md
        |-- plan.md
        |-- findings.md         # optional research notes for long or uncertain changes
        |-- progress.md         # optional rolling status for long-running changes
        |-- status.json
        |-- design.md            # if frontend/UI change
        |-- merge-product.md     # optional
        |-- merge-architecture.md
        |-- merge-workflow.md
        |-- merge-ux.md
        `-- merge-design.md      # if design change
```

## Root specs vs change specs

Use root specs for durable truth:

- `product.md`
  - product goals
  - accepted behavior
  - scope boundaries
- `architecture.md`
  - system shape
  - module boundaries
  - technical invariants
- `workflow.md`
  - delivery rules
  - QA / review / release rules
- `ux.md` / `DESIGN.md`
  - visual tone
  - color system
  - typography
  - layout rules
  - component patterns

Use `specs/changes/<change-id>/` for change-scoped work:

- proposal
- plan
- design reasoning (if UI)
- machine-readable state
- explicit archive merge snippets

`xflow:plan` only writes `plan.md`. It does not create `tasks.md`.

For research-heavy or long-running changes, `findings.md` and `progress.md`
may be added as auxiliary notes. They are optional and do not replace the plan.

## DESIGN.md

`DESIGN.md` is the canonical design system file.

It follows the format from Google Stitch / awesome-design-md.

Use it OR `specs/ux.md` — never both with overlapping content.

When a change involves UI:

1. Check if `DESIGN.md` exists
2. If not, create one from template
3. Run design-check in yolo workflow
4. Archive design decisions to Design Decisions Log

## Archive rule

Do not treat `proposal.md`, `plan.md`, or `design.md` as automatic sources for root spec updates.

When a change produces durable truth, write the exact durable facts into explicit merge files:

- `merge-product.md`
- `merge-architecture.md`
- `merge-workflow.md` for workflow or capability deltas
- `merge-ux.md`
- `merge-design.md`

Archive should prefer these explicit merge files over trying to summarize large documents.

This is intentional:

- it reduces accidental deletion of older truth
- it reduces under-summary or over-summary of the current change
- it keeps the durable root specs stable and auditable

## Status rule

`status.json` is the machine-readable state for the active change.

Use it to track:

- change type (backend | frontend | full-stack | infrastructure | docs)
- current stage
- verification state
- design alignment (if frontend)
- archival readiness
- next action

Do not use it as a replacement for the human-readable plan or proposal.
