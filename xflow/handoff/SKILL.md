---
name: xflow:handoff
description: 在当前项目根目录的 `HANDOFF.md` 中创建或刷新规范的项目交接文档。适用于用户要求编写 handoff、会话总结、下次会话简报、项目交接说明，或把项目背景、架构、任务状态、进展、问题、经验和建议汇总到一个根级交接文档中时。
---

# Superflow Handoff

Write handoff into exactly one canonical file:

- project root `HANDOFF.md`

Do not maintain parallel handoff files such as:

- `MUST_READ_NEXT_SESSION.md`
- `NEXT_SESSION.md`
- `SESSION_SUMMARY.md`

If those files exist and are only duplicating handoff intent, fold any still-useful content into `HANDOFF.md` and remove or reduce the duplicate file so `HANDOFF.md` remains the single source of truth.

## Required Output

Every handoff must cover these seven areas in root `HANDOFF.md`:

1. project background
2. architecture and non-negotiable invariants
3. current task or objective
4. progress / verified state
5. open problems / risks / blockers
6. lessons learned / operational gotchas
7. concrete recommendations / next steps

If some area is unknown, say so explicitly instead of omitting it.

In addition, every handoff must include a high-density `Context Pack` section.

`Context Pack` is the canonical place to preserve high-signal facts without relying on long thread history.
It should be skimmable and referenceable (paths, commands, numbers, dates), and avoid long logs or full file dumps.

## Workflow

1. Inspect the current repo state first.
2. Read project root `.xflow/GOAL.md` if present and include the current goal.
3. Read the existing root `HANDOFF.md` if present.
4. Search for any other handoff-style docs only if needed to recover useful context.
5. Prefer evidence from the codebase, tests, recent tracker docs, and current repo status.
6. Rewrite `HANDOFF.md` so it reflects the latest truth, not stale historical guesses.
7. Keep the document concise but decision-useful.

## Structure

Use this structure unless the project has a stronger established convention:

- title with project name and date
- `Current State`
- `Context Pack`
- `Project Background`
- `Architecture`
- `Current Objective`
- `Progress`
- `Open Problems`
- `Lessons Learned`
- `Recommendations`
- `Key Files`

`Recommendations` should be action-oriented and ordered.

### Context Pack Format

Keep this section dense and easy to rehydrate after `/compact`:

- `TL;DR` (<= 40 lines): objective, current status, next action, key risks
- `Key Facts`: numbers, dates, invariants, known constraints (each with an anchor)
- `Decisions`: what was decided and why (1-2 lines each)
- `Commands`: 5-15 high-value commands (include flags and caveats)
- `Pointers`: 5-15 key files/dirs + 1-line description each
- `Gotchas`: sharp edges that caused real waste (rate limits, flaky tests, env vars, etc.)

## Guardrails

- `HANDOFF.md` is the only canonical handoff.
- Do not scatter status across multiple root handoff docs.
- Do not keep known-false claims once newer verification exists.
- Distinguish verified facts from inferred judgments.
- Prefer repo-relative operational truth over conversational memory.

## Script

The agent autonomously calls this scaffold when creating handoff:

```bash
python3 ~/.codex/skills/xflow/handoff/scripts/scaffold_handoff.py
```

Agent fills the scaffold with real project content.
User invokes skill, agent handles execution.
