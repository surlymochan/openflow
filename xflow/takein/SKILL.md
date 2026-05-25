---
name: xflow:takein
description: 通过读取项目根目录的规范 `HANDOFF.md`，提取当前目标、进展、阻塞、经验和下一步动作，并在执行前完成一次轻量级仓库状态摄入，从而在新线程中接手工作。适用于用户要求在新线程继续、接管项目、根据 handoff 衔接、恢复上次会话，或从 `HANDOFF.md` 启动上下文时。
---

# Superflow Takein

This skill is for new-thread takeover.

Your primary source of truth is:

- project root `.xflow/GOAL.md` (if present)
- project root `HANDOFF.md`
- project root `AHA.md`
- project root `DESIGN.md` (if frontend project)

Do not start by reading a large random slice of the repository.
Start from `HANDOFF.md`, then validate only the minimum additional context needed to begin the task safely.

## Goal

Build a correct working context for the new thread fast enough to act, without redoing full-project discovery.

## Required Intake Output

Before substantial implementation work, produce an intake summary covering:

1. project background
2. architecture and invariants
3. current objective
4. verified progress
5. blockers / risks / open problems
6. lessons learned / operational gotchas
7. recommended first action in this thread

If `HANDOFF.md` is missing or stale, say so explicitly and repair the situation instead of pretending the context is complete.

## Workflow

1. Read project root `.xflow/GOAL.md` if present.
2. Read project root `HANDOFF.md`.
3. Read project root `AHA.md` if present.
4. Read project root `DESIGN.md` if present (frontend projects).
5. Extract the current objective, verified state, blockers, recommendations, and any active constraints.
6. Run a lightweight repo-state check:
   - `git status -sb`
   - `npm run drift:scan` when the project exposes it; for as-xflow this is required before substantial implementation
   - inspect directly relevant files only
7. Compare current repo reality against `.xflow/GOAL.md`, `HANDOFF.md`, `AHA.md`, and `DESIGN.md`.
8. Call out any mismatch between goal, handoff, aha log, design decisions, and repo state.
9. State the first concrete action you will take next.
10. Then proceed with execution.

## Scope Control

Keep intake tight.

- do not re-read the entire codebase unless the handoff is clearly insufficient
- do not expand into open-ended architecture exploration unless blocked
- do not overwrite `HANDOFF.md` during takein unless the user asks, or the file is clearly dangerously stale

## Guardrails

- treat `HANDOFF.md` as canonical until contradicted by repo evidence
- treat `AHA.md` as canonical for durable discussion insights until contradicted by repo evidence
- prefer verified repo truth over stale handoff claims
- distinguish verified facts from assumptions
- surface drift immediately if handoff and code disagree
- surface drift immediately if current design or implementation conflicts with a recorded aha
- always end intake with a recommended first action

## Script

The agent autonomously calls this helper to generate intake digest:

```bash
python3 ~/.codex/skills/xflow/takein/scripts/takein_digest.py --project-root .
```

Agent uses digest as starting point, then validates repo reality.
User invokes skill, agent handles execution.
