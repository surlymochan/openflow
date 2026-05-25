---
name: xflow:goal
description: Use when the user wants to set, inspect, update, clear, or align an xflow project goal, thread goal, direction anchor, anti-drift objective, or Codex native goal for a project.
---

# xflow:goal

`xflow:goal` keeps one simple project-level direction anchor.

The MVP contract is intentionally small:

```text
.xflow/GOAL.md
```

Do not introduce session ids, named goal registries, active-goal pointers, or
multiple goal files unless the user explicitly asks for that complexity.

## Advantage Over Codex Native Goal

Codex native goals are thread-local control and completion accounting. They are
valuable, but they do not by themselves create a repo-level artifact that future
threads, OpenCode, Claude Code, Cursor, or CI-visible workflow docs can inspect.

`xflow:goal` is better only when it stays durable and consumable:

- durable in `.xflow/GOAL.md`
- portable across agent tools
- read by `xflow:plan`, `xflow:yolo`, `xflow:corps`, `xflow:ralph`,
  `xflow:handoff`, and `xflow:takein`
- included in completion audits as alignment evidence

If the current environment exposes Codex native goal controls, mirror the xflow
project goal into the native thread goal. Do not treat native sync as the source
of truth; the project artifact remains canonical for xflow.

## When To Use

Use this skill when the user wants to:

- set a goal for the current project or thread
- see the active xflow goal
- audit whether the skill family still consumes the project goal
- update or clear the project goal
- make Ralph, yolo, corps, handoff, or takein stay aligned to a direction
- make xflow mirror Codex native goal behavior

## Native Codex Goal Sync

When Codex native goal controls are available in the current environment,
set or update the active thread goal to match the xflow goal.

Do not hard-code a nonexistent CLI command such as `codex goal set`. If native
goal controls are not exposed, continue with `.xflow/GOAL.md` and explicitly
say that native thread-goal sync was unavailable.

## Project Artifact

Use the current project root:

```text
.xflow/GOAL.md
```

Create `.xflow/` if needed.

Recommended file shape:

```markdown
# xflow Goal

## Goal

<one or a few paragraphs describing the project direction anchor>

## Scope

- <what this goal covers>

## Non-Goals

- <optional exclusions>

## Updated

YYYY-MM-DD
```

Keep it short enough to read at the start of later work.

## Operations

### Set

When the user asks to set a goal:

1. Inspect whether `.xflow/GOAL.md` already exists.
2. If an existing goal is clearly unrelated, warn before overwriting unless the
   user has already said to replace it.
3. Write the new goal into `.xflow/GOAL.md`.
4. Try native Codex goal sync when available.
5. Report the file path and whether native sync happened.

### Show

When the user asks what the current goal is, read `.xflow/GOAL.md` and summarize
it. If the file is missing, say there is no xflow project goal yet.

### Audit

When the user asks whether goal is useful, stale, or actually connected to the
workflow family, run or recommend:

```bash
xflow goal audit --json
```

The audit should prove both sides of the claim: a durable `.xflow/GOAL.md`
exists in the project, and the core skill family still declares that goal as
direction context for plan, yolo, corps, Ralph, handoff, and takein.

### Update

When the user asks to update the goal, preserve still-current parts and patch
only the changed intent. If the update changes the direction materially, call
out that the goal changed.

### Clear

When the user asks to clear the goal, remove or blank `.xflow/GOAL.md` only
after confirming they mean to remove the project direction anchor. If native
goal controls are available, clear the active thread goal too.

## Integration Rules

- `xflow:ralph` should read `.xflow/GOAL.md` before planning substantial work
  and include it in the completion audit.
- `xflow:plan` should use `.xflow/GOAL.md` as context when writing or refreshing
  `specs/changes/<change-id>/plan.md`.
- `xflow:yolo` and `xflow:corps` should treat `.xflow/GOAL.md` as directional
  context, not as a replacement for change scope, workflow status, or proof.
- `xflow:handoff` should include the current goal when refreshing `HANDOFF.md`.
- `xflow:takein` should read `.xflow/GOAL.md` when present so new threads
  recover the project direction quickly.

## Boundary

`xflow:goal` is not an executor. It does not run implementation, tests,
archive, or PR steps. Use `xflow:ralph`, `xflow:yolo`, or `xflow:corps` for
execution.
