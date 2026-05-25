# openflow Tooling Matrix

Use this page when installing or explaining xflow across different agent tools.

The rule is simple: keep the workflow runtime in the project and keep the agent-specific layer thin. Tools can change; workflow YAML, TDD proof, handoff state, and archive gates should stay the same.

## Universal CLI Contract

Every supported tool should be able to run this sequence:

```bash
npm install -g openflow
xflow quickstart
xflow guide
xflow assess
xflow demo launch
xflow launch dossier
xflow compare codex-goal
xflow compare superpowers
xflow compare gstack
xflow init --project-root .
xflow goal set "Ship the next verified change" --project-root .
xflow goal audit --project-root . --json
xflow doctor --project-root .
xflow workflow validate yolo --project-root .
```

For source checkouts, replace the global install with:

```bash
npm install
npm run release:pack
```

Keep release-owner checks out of universal first-run docs. `xflow adoption
validate --json`, `xflow package preflight --check-registry --check-auth
--json`, and `xflow package audit --check-registry --json` are still required
for launch, but they intentionally fail until real adoption or npm registry
evidence exists.

## Tool Matrix

| Tool | Install / Enable | First Command | Notes |
| --- | --- | --- | --- |
| Codex CLI / App | Install package or use source checkout | `xflow guide` | Best paired with `xflow:takein`, `xflow:goal`, `xflow:plan`, and `xflow:yolo` skills. |
| Claude Code | Install package in the project shell | `xflow doctor --project-root .` | Keep workflow prose out of CLAUDE.md; point Claude at this CLI contract. |
| Cursor | Add project rule pointing to this page | `xflow workflow validate yolo --project-root .` | Use `.as-xflow/config.json` for stable aliases instead of duplicating commands in rules. |
| OpenCode | Use plain shell commands | `xflow init --project-root .` | Keep verification in package scripts so OpenCode tasks run the same gates. |
| Gemini CLI | Use package install or source checkout | `xflow guide` | Treat xflow as the local runtime; use Gemini for execution, not workflow source-of-truth. |
| Generic CLI Agent | Any shell with Node 22+ | `xflow assess --json` | Use JSON output when the agent needs machine-readable quality and readiness context. |

## Skill Entry Points

Think of the skill family as a ladder, not a menu. Start with a durable goal,
reload context, plan once, then choose the light or heavy execution track.

| Skill | Purpose |
| --- | --- |
| `xflow:takein` | Reload current repo context from `HANDOFF.md` and local state. |
| `xflow:goal` | Set, inspect, or audit `.xflow/GOAL.md` as the project direction anchor; CLI users can run `xflow goal set` and `xflow goal audit`. |
| `xflow:plan` | Produce `plan.md`; do not choose yolo vs corps. |
| `xflow:ralph` | Keep a concrete task moving through implementation, verification, review feedback, and self-healing repair. |
| `xflow:yolo` | Run the lite delivery path against an existing plan. |
| `xflow:corps` | Run heavy product/multi-agent delivery through `xflow corps`, then verify `corps_proof.json`. |
| `xflow:handoff` | Refresh durable project handoff. |
| `xflow:aha` | Persist durable lessons into `AHA.md`. |

## Non-Negotiable Invariants

- `.xflow/GOAL.md` is stronger than a thread-only Codex goal only when every
  delivery entry reads it as direction context and reports alignment.
- `xflow:plan` is plan-only and track-neutral.
- `yolo` and `corps` reuse the current plan.
- TDD runs as `tdd-red -> execute -> tdd-green`.
- `I6c.tdd.quality_review` must run after green proof.
- `A5.archive.commit_push_close` publishes before `A6.pr.create`.
- `xmem` remains outside the xflow namespace.

## Copy-Paste Setup Snippet

Use this in project-level agent instructions:

```text
Use openflow as the workflow source of truth. Start with `xflow guide`, then run
`xflow goal set "<project direction>" --project-root .`, `xflow doctor --project-root .`,
`xflow goal audit --project-root . --json`, and `xflow workflow validate yolo --project-root .`.
For implementation, use `xflow:plan` first, then `xflow:yolo` or `xflow:corps`
without re-planning. Preserve the split TDD order: tdd-red before execute,
tdd-green after execute, with I6c quality proof.
```
