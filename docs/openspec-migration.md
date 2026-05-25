# OpenSpec Migration Guide

Use this guide when moving an OpenSpec-style project into openflow, or when explaining how the two systems map.

OpenSpec is strongest as a lightweight spec-driven development surface. openflow keeps that spec discipline, then adds executable workflow gates, TDD proof, test-quality review, archive ordering, handoff, and release checks.

## Safe Mapping Command

Run this first. It does not move or rewrite files.

```bash
xflow spec openspec-map --project-root . --openspec-root openspec
xflow spec start --title "example change" --change-type backend
xflow spec quick "example change"
xflow spec delta --project-root . --change-id <id>
```

First command output:

```text
.as-xflow/openspec-migration.json
```

The report maps:

- `openspec/specs/*.md` to durable `specs/*.md`
- `openspec/changes/<change>/proposal.md` to `specs/changes/<change-id>/proposal.md`
- `openspec/changes/<change>/design.md` to design context or change notes
- accepted OpenSpec scope and design decisions to `specs/changes/<id>/plan.md`
- `openspec/changes/<change>/tasks.md` to `specs/changes/<change-id>/tasks.md`
- OpenSpec change folders to xflow `change_id` values

## Command Mapping

| OpenSpec | openflow |
| --- | --- |
| `openspec init` | `xflow init --project-root .` |
| `/opsx:new <change>` | `xflow spec quick "<title>"` or `xflow spec start --title "<title>" --change-type <type>` |
| `/opsx:ff` | `xflow:plan` creates or refreshes `plan.md` |
| `/opsx:apply` | `xflow workflow run yolo|corps --project-root .` |
| `/opsx:archive` | xflow archive phase through `A5.archive.commit_push_close` |
| OpenSpec spec delta review | `xflow spec delta --change-id <id>` |

## Folder Mapping

| OpenSpec Path | openflow Path | Notes |
| --- | --- | --- |
| `openspec/specs/` | `specs/` | Durable root specs. Keep stable, reviewed, and human-readable. |
| `openspec/changes/<id>/proposal.md` | `specs/changes/<id>/proposal.md` | Preserved as change intent. |
| `openspec/changes/<id>/design.md` | `specs/changes/<id>/design.md` or `DESIGN.md` | Use root `DESIGN.md` for active frontend design contract. |
| accepted OpenSpec scope/design | `specs/changes/<id>/plan.md` | Canonical reusable xflow implementation plan. |
| `openspec/changes/<id>/tasks.md` | `specs/changes/<id>/tasks.md` | Optional working checklist; xflow:plan writes `plan.md` as the canonical plan. |
| `openspec/changes/<id>/specs/` | `merge-product.md`, `merge-architecture.md`, `merge-workflow.md` | Archive-ready spec snippets. |

## Spec Delta Review

Run:

```bash
xflow spec delta --project-root . --change-id <id>
```

Output:

```text
specs/changes/<id>/spec_delta_review.json
specs/changes/<id>/spec_delta_review.md
```

The review summarizes:

- proposal headings and intent bullets
- plan sections and verification commands
- task counts and completed task counts
- merge spec snippets that will affect durable root specs
- warnings such as missing verification commands or missing merge spec snippets

## Migration Strategy

1. Run `xflow init --project-root .`.
2. Run `xflow spec openspec-map --project-root . --openspec-root openspec`.
3. Review `.as-xflow/openspec-migration.json`.
4. Copy durable OpenSpec specs into `specs/` only after human review.
5. Copy active OpenSpec changes into `specs/changes/<change-id>/`.
6. Run `xflow spec quick "<change title>"` for the fastest scaffold, or `xflow spec start --title "<change title>" --change-id <change-id>` when you need tighter control.
7. Run `xflow spec delta --change-id <change-id>`.
8. Run `xflow workflow validate yolo --project-root .`.
9. Use `xflow:yolo` or `xflow:corps` for execution.

## What Not To Migrate Blindly

- Do not overwrite existing `specs/*.md` without reviewing durable conflicts.
- Do not turn every OpenSpec task checklist into the canonical xflow plan; `plan.md` remains the reusable implementation plan.
- Do not skip TDD proof. OpenSpec specs explain intent; xflow proof verifies behavior.
- Do not bypass archive. Durable spec deltas should land through the archive boundary.

## Why This Beats A Pure OpenSpec Flow

OpenSpec is excellent at making intent explicit before implementation. openflow keeps that benefit and adds:

- executable workflow validation
- deterministic spec delta review artifacts
- red/green TDD proof
- test-quality proof
- archive ordering and PR publish boundary
- release-pack verification
