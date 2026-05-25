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

## Boundary

- This skill does not open issues.
- This skill does not create branches.
- This skill does not commit or archive.
- This skill does not choose between yolo and corps.
