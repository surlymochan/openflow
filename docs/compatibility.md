# as-xflow Compatibility Notes

`as-xflow` is designed to work as a workflow runtime below multiple agent tools. The agent can change, but the project artifacts, workflow YAML, gates, and archive rules stay stable.

For installation snippets by tool, see `docs/tooling-matrix.md`.

## Codex

- Use project-local instructions to call `xflow:takein`, `xflow:plan`, and `xflow:yolo`.
- Run `xflow doctor` before substantial work in a new checkout.
- Use `npm run drift:scan` before editing active workflow or skill surfaces.

## Claude Code

- Treat `docs/quickstart.md` as the first-run path.
- Keep the active plan in `specs/changes/<change-id>/plan.md`.
- Run `xflow workflow validate yolo` or `xflow workflow validate corps` before executing a workflow.

## Cursor

- Put xflow commands in project rules or agent instructions rather than duplicating workflow prose.
- Keep `.as-xflow/config.json` in the project root as the local contract.
- Use `xflow doctor --json` for machine-readable readiness checks.
- Let `.as-xflow/config.json` carry workflow aliases, issue routing defaults, and skill sync defaults across tools.

## OpenCode

- Prefer CLI commands over editor-specific state: `xflow init`, `xflow doctor`, `xflow workflow validate yolo`.
- Keep verification in package scripts so OpenCode tasks can run the same checks as Codex or Claude Code.

## Generic CLI Agents

- Required commands are intentionally plain shell commands.
- Minimum adoption path:
  - `xflow init --project-root .`
  - `xflow doctor --project-root .`
  - `xflow workflow validate yolo`
  - `npm run drift:scan`

## Gemini CLI

- Use the universal CLI contract from `docs/tooling-matrix.md`.
- Treat xflow as the workflow source of truth and Gemini as the executor.
- Validate workflow data with `xflow workflow validate yolo --project-root .` before running implementation.

## Invariants Across Tools

- `xflow:plan` remains track-neutral.
- `xflow:yolo` and `xflow:corps` reuse a current plan instead of re-planning.
- `xmem` remains outside the xflow namespace.
- Archive publish stays owned by `A5.archive.commit_push_close` before `A6.pr.create`.
- Installed skill sync goes through the as-xflow wrapper and verifies with `npm run skill:diff`.
