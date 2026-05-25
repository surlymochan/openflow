---
name: xflow:yolo
description: "轻量轨交付工作流：从 change-init 到 archive。适用于后端、文档、基础设施和小型 UI 改动。可复用 xflow:plan 产物，或在缺少 plan 时先补一轮通用规划。"
---

# Superflow Yolo — Track Execution Driver

This skill drives the lite workflow. It does not own a separate planning
track; planning is shared with `xflow:plan`.

## How to run

```bash
xflow workflow validate workflows/yolo.yaml
```

Then execute the workflow phases in order.

For a full run:

```bash
xflow workflow run workflows/yolo.yaml --title "<中文标题>" --change-type backend
```

## Plan reuse rule

- Read `.xflow/GOAL.md` before execution when present. State whether the current
  change aligns with it, intentionally narrows it, or conflicts with it.
- Reuse `specs/changes/${CHANGE_ID}/plan.md` when it is current.
- If the plan is missing or still a scaffold placeholder, create it once before continuing.
- Planning stays track-neutral; do not decide yolo vs corps here.

## State and context

- Project root: `process.env.XFLOW_PROJECT_ROOT || cwd`
- Project goal: `.xflow/GOAL.md` when present; use it as direction context only
- Change root: `specs/changes/${CHANGE_ID}/`
- Status file: `specs/changes/${CHANGE_ID}/status.json`

## Phase playbook

1. `change-init`
2. `brainstorm`
3. `design-check` if the change is frontend/UI
4. `proposal-freeze`
5. `proposal-consistency-check`
6. `plan`
7. `openissue`
8. `set-in-progress`
9. `tdd`
10. `execute`
11. `verify-consistency`
12. `archive`

The workflow YAML is the canonical execution source for atom order, gates, and
artifact checks. This skill only explains the contract.

## Guardrails

- Keep the plan reusable and track-neutral
- Do not introduce a separate tasks artifact
- Do not re-plan if a current `plan.md` already exists
- Do not treat `.xflow/GOAL.md` as executable scope; it is alignment context
  that must be reflected in the final verification summary
- Do not enter `set-in-progress` or `execute` unless doctor confirms the linked branch and checkout are ready
- Do not expose deleted top-level xflow utility skills as entry points
