---
name: xflow:ralph
description: "Codex-native Ralph/autopilot loop for xflow. Use when the user wants autonomous implementation until verified completion, self-healing from tests or review feedback, full-auto execution, or a Desktop-friendly alternative to OMX Ralph."
---

# xflow:ralph

`xflow:ralph` is a Codex-native completion loop inspired by OMX `$ralph` and `$autopilot`, adapted for Codex Desktop, Codex CLI, and the existing xflow skill family. It does not depend on tmux, OMX hooks, HUD panes, or `omx_state`.

The contract: do not call work complete until the original request, later user feedback, implementation evidence, and verification evidence all agree.

## Relation To xflow

- Use `xflow:plan` first when the user asks for planning, the task is broad, or a reusable plan is needed.
- Use `xflow:ralph` when the user wants a concrete task carried through implementation, verification, feedback repair, and completion audit.
- Use `xflow:yolo` or `xflow:corps` when the project has an explicit xflow runtime/change workflow and the user wants that governed track.
- `xflow:ralph` is a conversation-native loop; it should not pretend to execute the governed `xflow corps` runtime or produce corps proof artifacts.

## Modes

Choose the smallest mode that satisfies the request.

| Mode | Trigger | Contract |
|---|---|---|
| `ralph` | Clear task or existing plan | Implement, verify, self-heal, audit, finish |
| `autopilot` | Vague-but-actionable feature, issue, PRD, or "full auto" | Plan, Ralph, review; loop back on review findings |
| `review-repair` | User provides test/review/feedback failures | Convert feedback into repair items, Ralph until clean |

## Desktop Boundaries

- Use `update_plan` as the visible working ledger for substantial tasks.
- Keep exactly one plan item `in_progress`.
- Use local files only when they are useful project artifacts; do not create `.omx` files for Ralph state.
- Use Codex subagents only when the user explicitly asks for subagents, delegation, or parallel agent work.
- If Codex goal tools are visible, treat the active goal as binding scope and mark it complete only after the completion audit passes. If goal tools are not visible, continue without them.

## Ralph Loop

1. Intake the objective.
   - Restate the concrete deliverables and acceptance criteria.
   - Read project root `.xflow/GOAL.md` if present and treat it as directional context.
   - Identify constraints, risky actions, likely files, and verification commands.
   - Ask only if a missing answer would make the work unsafe or materially ambiguous.

2. Create or update the working plan.
   - Use `update_plan` for multi-step work.
   - Include at least one verification/audit step.
   - If an existing `xflow:plan` artifact is current, reuse it instead of replanning.

3. Execute the next reversible step.
   - Inspect before editing.
   - Make scoped changes.
   - Preserve unrelated user changes.
   - Give concise progress updates during longer work.

4. Verify with fresh evidence.
   - Run the most relevant tests, build, typecheck, lint, UI/browser checks, or command-level proof.
   - Read the output and confirm it proves the acceptance criteria.
   - Passing a low-level command is not enough if the user-facing path remains untested.

5. Self-heal on failure.
   - Convert every failing test, error, review comment, or user correction into a concrete repair item.
   - Update the plan, fix, and rerun the relevant verification.
   - If the same failure recurs three times without new information, stop and report the blocker with evidence.

6. Completion audit.
   - Confirm the result still aligns with `.xflow/GOAL.md` when that file exists.
   - If the result intentionally diverges from the goal, name the divergence and
     require explicit user direction or an updated goal before calling the work
     complete.
   - Compare the original request and all later user updates against delivered files, behavior, and verification output.
   - Confirm no plan item remains pending or in progress.
   - Confirm no known failing check is being ignored.
   - Only then report completion.

## Autopilot Loop

Autopilot is the stricter full-delivery loop:

```text
plan -> ralph -> review -> repair-or-complete
```

1. `plan`: Produce or update an implementation plan with acceptance criteria and verification commands.
2. `ralph`: Execute the plan through the Ralph loop above.
3. `review`: Review the changed work for bugs, regressions, missing tests, scope drift, and incomplete requirements.
4. If review is clean, finish with evidence.
5. If review is not clean, convert findings into planning input and return to `plan`.

Do not skip from vague input directly to implementation in autopilot mode. Do not patch review findings ad hoc without updating the plan.

## Feedback Handling

Treat feedback as first-class input:

| Feedback source | Required action |
|---|---|
| Test failure | Extract failing assertion/error and repair the smallest cause |
| Build/type/lint failure | Fix the diagnostic, rerun the failed command |
| Code review finding | Add a repair item with severity and affected file |
| User says "not right" | Ask for specifics only if the issue cannot be inferred from artifacts |
| User changes direction | Preserve non-conflicting completed work; update only the active branch |

## Stop Rules

Continue automatically through safe, reversible work. Stop and ask or report when:

- The next step is destructive, credentialed, external-production, financial, privacy-sensitive, or materially preference-dependent.
- Required credentials, services, or permissions are missing.
- The same blocker recurs three times.
- Verification cannot be run in this environment.
- The user says stop, cancel, pause, or asks only for status.

## Final Response

Finish with:

- What changed.
- Which verification commands or checks passed.
- Any checks that could not be run and the residual risk.
- The most important remaining user decision, only if one exists.

Never say the task is complete merely because the code "looks good" or because an implementation pass ended. Completion requires evidence.
