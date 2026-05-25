# xflow Goal vs Codex Native Goal

## Verdict

`xflow:goal` should not compete with Codex native goals as another thread-level
reminder. It wins only when it becomes a project-level alignment contract that
`xflow:plan`, `xflow:yolo`, `xflow:corps`, `xflow:ralph`, `xflow:handoff`, and
`xflow:takein` all consume.

The target quality bar is:

```text
Codex native goal = thread memory and completion accounting
xflow:goal = project direction anchor plus workflow alignment evidence
```

Codex native goals are useful inside one active thread. `xflow:goal` is better
for delivery work when a team needs the objective to survive thread changes,
tool changes, workflow runs, handoff refreshes, and proof review.

## Current Quality Assessment

| Surface | Current Grade | Evidence | Open-Source Bar |
| --- | --- | --- | --- |
| `xflow:goal` | Strong foundation | `.xflow/GOAL.md`, native goal sync boundary, shared consumption rules | Must explain why it is more durable than a thread goal |
| `xflow:yolo` | Strong | YAML-backed lite workflow, split TDD, archive order, drift tests | Must show goal alignment without adding ceremony |
| `xflow:corps` | Strong but complex | Governed `xflow corps`, `corps_proof.json`, visual proof, no-stub runtime witnesses | Must make proof language understandable to first-time users |
| `xflow:ralph` | Strong bridge | Conversation-native completion loop with verification and self-heal | Must treat `.xflow/GOAL.md` as a completion audit input |
| Skill family | Strong engine, improving packaging | skill sync/diff, tooling matrix, public benchmark | Must present the family as one ladder, not many unrelated entry points |

## Scored Judgment

For durable project delivery, `xflow:goal` beats Codex native goal: `88/100`
versus `72/100`. Codex native goal still wins thread-local control; xflow wins
when the objective needs to become repo-owned, portable, workflow-consumed, and
auditable.

| Dimension | Weight | Codex native goal | xflow:goal | Winner |
| --- | ---: | ---: | ---: | --- |
| Thread-local control | 20 | 20 | 14 | Codex native goal |
| Durability | 20 | 10 | 20 | xflow:goal |
| Workflow consumption | 20 | 12 | 19 | xflow:goal |
| Cross-tool portability | 20 | 10 | 18 | xflow:goal |
| Auditability | 20 | 20 | 17 | Codex native goal |

The scorecard is evidence-linked. `xflow compare codex-goal --json` exposes
`evidence_refs` per dimension, including `.xflow/GOAL.md`,
`xflow goal show --json`, `xflow goal audit --json`, Codex native completion
accounting, and Codex/OpenCode skill sync checks.

Machine-readable form:

```bash
xflow compare codex-goal --json
```

## Why xflow Can Beat Codex Goal

`xflow:goal` beats a native Codex goal only if these conditions are true:

1. **Durable** - the goal is stored in the repo at `.xflow/GOAL.md` through `xflow goal set`, not only in one chat thread.
2. **Portable** - Codex, OpenCode, Claude Code, Cursor, Gemini, and generic CLI agents can read the same artifact.
3. **Consumable** - the goal is read before planning, yolo, corps, Ralph, handoff, and takein work.
4. **Auditable** - completion reports say how the delivered change aligned with or deliberately diverged from the goal.
5. **Non-invasive** - it does not replace change scope, `plan.md`, `status.json`, workflow YAML, or proof artifacts.
6. **Native-friendly** - when Codex native goal tools are available, xflow syncs the project goal into the active thread goal instead of pretending Codex has a stable `codex goal set` CLI.

If any of these fail, `xflow:goal` is only a weaker duplicate of Codex native
goal. If all hold, it is a stronger project memory and alignment layer.

## The Public Ladder

The skill set should be explained as a ladder:

| Step | Entry | Promise |
| --- | --- | --- |
| 1 | `xflow:goal` / `xflow goal set` | Define the durable project direction. |
| 2 | `xflow:takein` | Reload durable context before acting. |
| 3 | `xflow:plan` | Produce one reusable implementation plan. |
| 4a | `xflow:yolo` | Execute low-ceremony work with TDD and archive gates. |
| 4b | `xflow:corps` | Execute high-risk product work with governed heavy proof. |
| 5 | `xflow:ralph` | Keep conversational work moving until evidence is clean. |
| 6 | `xflow:handoff` / `xflow:aha` | Preserve current state and durable lessons. |

This ladder is the open-source story. It is easier to understand than a list of
skills, and it explains why xflow is more than Codex goal plus prompts.

## Acceptance Gate

Before claiming the skill family is ready for public launch:

```bash
xflow compare codex-goal --json
xflow score
xflow goal show --json
xflow goal audit --json
npm run drift:scan
npm run skill:diff
npm run release:pack
codex debug prompt-input '测试是否能看到 $xflow:goal skill'
codex debug prompt-input '测试是否能看到 $xflow:corps skill'
```

The docs must also prove:

- `docs/tooling-matrix.md` explains the ladder.
- `docs/competitive-benchmark.md` lists goal alignment as a scored dimension.
- `xflow/goal/SKILL.md` states the durable advantage over Codex native goal.
- `xflow:yolo`, `xflow:corps`, and `xflow:ralph` all include goal alignment in their intake or completion contract.

## Public Comparison Command

Use this when someone asks whether `goal` itself still matters:

```bash
xflow compare codex-goal --json
xflow goal audit --json
```

The comparison is intentionally narrow. Codex native goal remains the right tool
for thread-local intent and completion accounting. `xflow:goal` is better only
when the objective has to become repo-owned evidence that survives handoff and is
consumed by yolo, corps, Ralph, handoff, and takein.

Both commands expose a machine-readable `boundary` section. That section is part
of the public contract: goal is a project direction anchor, not an executor, not
a replacement for `plan.md`, `status.json`, workflow YAML, tests, or proof
artifacts. If the work needs implementation, the escalation path is goal -> plan
-> yolo/corps -> handoff or aha.
