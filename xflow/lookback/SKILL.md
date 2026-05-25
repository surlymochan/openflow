---
name: xflow:lookback
description: 通过读取项目根目录的 `AHA.md`、`HANDOFF.md` 和核心设计文档，重新加载最相关的持久上下文，用于识别当前工作与既有决策之间是否发生偏移。适用于验证新方向是否仍符合过去的关键认知、设计意图或 handoff 事实时。
---

# Superflow Lookback

Use this skill to check whether current design or implementation has drifted from recorded insight.

Primary sources:

- project root `AHA.md`
- project root `HANDOFF.md`
- project root `DESIGN.md` (if frontend project)
- core design docs under `docs/plans/`

## Goal

Answer one question:

`Is the current direction still aligned with the strongest prior reasoning?`

## Workflow

1. Read `AHA.md` if present.
2. Read `HANDOFF.md`.
3. Read `DESIGN.md` if present (check design decisions).
4. Read only the directly relevant design docs in `docs/plans/`.
5. Compare current design / code / proposal against:
   - active aha constraints
   - frozen design intent
   - design decisions log (if UI)
   - current handoff truth
6. Produce a concise drift report:
   - aligned
   - partially drifted
   - materially drifted
7. For any drift, name the exact file or design surface that drifted.

## Output requirements

Every lookback should include:

1. current target
2. prior anchors consulted
3. alignment verdict
4. concrete drift points, if any
5. recommended correction

## Guardrails

- Do not read the whole repo by default.
- Prefer high-signal docs over broad exploration.
- Treat `AHA.md` as durable reasoning, not optional commentary.
- If `AHA.md` and `HANDOFF.md` conflict, surface the conflict explicitly.

## Script

The agent autonomously calls this helper for source listing:

```bash
python3 ~/.codex/skills/xflow/lookback/scripts/lookback_digest.py
```

Agent uses output to prioritize which docs to read.
User invokes skill, agent handles execution.
