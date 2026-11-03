---
name: xflow:plan
description: Track-neutral planning skill for xflow. Use it to turn an accepted change into a single implementation plan before choosing or running yolo/corps.
---

# xflow:plan

Use this skill when the change needs a plan before execution.

## Goal

Produce one reusable `plan.md` for the change. Do not produce `tasks.md`.
Do not decide whether the change is yolo or corps at planning time.

## What the plan should cover

- active project goal from `.xflow/GOAL.md`, when present
- objective and expected outcome
- scope and explicit non-goals
- constraints and dependencies
- implementation approach
- verification strategy
- risks and failure modes

## Reuse rule

If `specs/changes/<change-id>/plan.md` already exists and is still current,
reuse it instead of rewriting the same plan again.

If the file is missing or still a scaffold placeholder, create the reusable
plan once and leave routing to the execution workflow.

## Lite-track merged pass

When the change will run the lite (yolo) track, do the red-proof authoring
in the same pass as the plan: write the failing test and fix the red test
command in the plan itself. The yolo workflow seals `tdd-red` immediately
after `plan`, so a separate test-authoring pass would only re-read the
same files. This does not apply to the corps track, which keeps planning
and proof authoring apart.

## Boundary

- This skill does not open issues.
- This skill does not create branches.
- This skill does not commit or archive.
- This skill does not choose between yolo and corps.
