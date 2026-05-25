---
name: xflow:aha
description: 将高价值讨论洞察、设计认知、流程经验和具持续影响的转折点沉淀到项目根目录的规范 `AHA.md` 中。适用于当前线程产生了会影响后续执行、评审、设计或流程决策的重要认识时。
---

# Superflow Aha

Write durable insight into exactly one canonical file:

- project root `AHA.md`

`AHA.md` is not a handoff replacement.
It is the canonical log of high-signal realizations that would be costly to rediscover.

## When to record

Record an aha when any of these become true:

- a root cause reframes the problem
- a workflow weakness is identified clearly
- a design/system principle is discovered that should constrain future work
- a repeated failure mode becomes understandable
- a strong product or design insight should influence later implementation and review

Do not log routine status updates, generic summaries, or low-signal chatter.

## Required structure

Each entry in `AHA.md` should include:

1. date
2. title
3. insight
4. why it matters
5. consequence for workflow / design / execution
6. evidence anchors

Keep entries compact and forceful.

## Workflow

1. Inspect the current repo state and discussion context.
2. Read existing `AHA.md` if present.
3. Merge with the existing log instead of scattering similar insights.
4. Add the new aha as a durable entry with anchors.
5. If the insight changes operational expectations, mention which skills, docs, or gates should consume it.

## Guardrails

- `AHA.md` is for durable realizations, not chronological journaling.
- Prefer one strong entry over several weak entries.
- Link the insight to exact files or contracts when possible.
- If an insight becomes obsolete, mark it superseded rather than silently deleting history.

## Suggested format

Use this structure unless the project already has a stronger convention:

- title with project name
- `## Active Ahas`
- repeated `### YYYY-MM-DD — Title`
- short bullets:
  - `Insight`
  - `Why It Matters`
  - `Action`
  - `Evidence`

## Script

The agent autonomously calls this helper to append structured aha entries:

```bash
python3 ~/.codex/skills/xflow/aha/scripts/append_aha.py \
  --title "Title" \
  --insight "Core insight" \
  --why "Why it matters" \
  --action "Required action" \
  --evidence "/abs/path/or/doc"
```

Agent determines parameters from discussion context.
User invokes skill, agent handles execution.
