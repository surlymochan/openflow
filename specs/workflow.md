# Canonical Phase Catalog

This is the single source of truth for all workflow phases in as-xflow.

Both `workflows/yolo.yaml` and `workflows/corps.yaml` are **subsets** of this catalog.
No workflow may define a phase not listed here. Phase IDs here are authoritative.

## Rules

- Phase order within each workflow is the workflow file's responsibility.
- Every phase must declare its atom list, artifacts, and gate type.
- `lite` track phases may not invoke `heavy` atoms (enforced by the loader).
- Phase granularity is kept at maximum — no folding — because gate rerun
  granularity is one phase. Folding two phases loses independent retry.
- `xflow:plan` is the only planning entry point. It writes `plan.md` only and
  must not create `tasks.md` or decide track routing.
- For research-heavy or long-running changes, `findings.md` and `progress.md`
  may accompany `plan.md` as optional working notes. They are auxiliary
  artifacts, not source of truth.
- When a change shifts workflow semantics or capability boundaries, record the
  durable delta in `merge-workflow.md` with an explicit capability section.
- `set-in-progress` and `execute` should only run once `doctor` reports
  `branch-worktree-ready` for the linked branch and checkout.
- For `as-xflow`, phase `openissue` files the issue into the explicitly configured tracker repo, not the current code repo.
- For `as-xflow`, `openissue` issue title/body must be Chinese.

---

## Phase Catalog (27 phases)

### Front-end / Intake

| # | ID | Source | Description |
|---|----|--------|-------------|
| 01 | `change-init` | yolo | Scaffold `specs/changes/<change_id>/` + optional mission.create for corps binding |
| 02 | `explore` | agentos | Same-category evidence: competitor patterns, IA, interaction + visual references |
| 03 | `brainstorm` | both | Generate multiple plausible product paths from available evidence |
| 04 | `risk_review` | agentos | Identify uncertainties that would change scope, validation, autonomy, or implementation |
| 05 | `clarify` | agentos | Ask only questions that still materially change the path (driven by ambiguity) |
| 06 | `proposal` | both | Converge one believable primary journey and module split (= yolo proposal-freeze) |
| 07 | `proposal-consistency-check` | yolo | Diff frozen proposal against `specs/*`, `AHA.md`, `DESIGN.md` — deterministic structural scan |

### Design

| # | ID | Source | Description |
|---|----|--------|-------------|
| 08 | `design_contract_freeze` | agentos heavy | Lock journey, module boundaries, visual direction, acceptance bar |
| 09 | `design-check-lite` | yolo | Optional DESIGN.md sanity: Reference Anchors, Beauty Contract, Layout Premise sections present |
| 10 | `visual_direction_synthesis` | agentos heavy | Generate + compare multiple visual directions against frozen contract and design-system practice pack |
| 11 | `layout_competition` | agentos heavy | Compare multiple materially different first-fold compositions |
| 12 | `design_selection` | agentos heavy | Freeze winner + runner-up + rationale + Pencil handoff |
| 13 | `ux_design_brief` | agentos | Translate frozen contract + selected direction into design brief |
| 14 | `pencil_draft` | agentos heavy | Create first editable `.pen` artifact through strict `agent_invoke` / Pencil runtime |
| 15 | `llm_design_review` | agentos heavy | Review product logic, UX taste, continuity, same-category fit |
| 16 | `pencil_refine` | agentos heavy | Apply targeted refinements through strict `agent_invoke` / Pencil runtime |
| 17 | `design_accept` | agentos | Approve or reject design against frozen contract + Pencil attestation |

### Plan

| # | ID | Source | Description |
|---|----|--------|-------------|
| 18 | `plan` | both | Turn accepted scope/design into a reusable `plan.md` |

### Issue / Branch Lifecycle

| # | ID | Source | Description |
|---|----|--------|-------------|
| 19 | `openissue` | yolo | `workspace-private` 中文 issue + code-branch linkage + project context discovery |
| 20 | `set-in-progress` | yolo | Move linked issue/project item to In Progress |

### Execution

| # | ID | Source | Description |
|---|----|--------|-------------|
| 21 | `tdd` | yolo | Red → green → refactor with structured proof capture |
| 22 | `execute` | both | Implement artifact on linked branch within frozen scope |

### Verification / Review

| # | ID | Source | Description |
|---|----|--------|-------------|
| 23 | `verify-consistency` | yolo | Impl vs proposal/plan/specs/AHA.md structural drift check |
| 24 | `review` | agentos | Adversarial code review + patch-challenge |
| 25 | `qa` | agentos | Behavior + visual verification, screenshot-backed for strict UI work |
| 26 | `gate_final` | agentos | Mirror frozen contract; decide pass / fail / needs-human |

### Archive

| # | ID | Source | Description |
|---|----|--------|-------------|
| 27 | `archive` | yolo | Artifact completeness check + merge snippets + commit + push + close issue + project Done |

---

## Workflow Subsets

### yolo (lite, 12 phases)

```
01 change-init
03 brainstorm
09 design-check-lite  (optional, skip for backend/docs/infra)
06 proposal
07 proposal-consistency-check
18 plan
19 openissue
20 set-in-progress
21 tdd
22 execute
23 verify-consistency
27 archive
```

### corps (heavy, 26 phases — skips 09 because 08 is the full contract)

```
01 change-init
02 explore
03 brainstorm
04 risk_review
05 clarify
06 proposal
07 proposal-consistency-check
08 design_contract_freeze
10 visual_direction_synthesis
11 layout_competition
12 design_selection
13 ux_design_brief
14 pencil_draft
15 llm_design_review
16 pencil_refine
17 design_accept
18 plan
19 openissue
20 set-in-progress
21 tdd
22 execute
24 review
25 qa
26 gate_final
27 archive
```


## Change: timeline-analytics

Source: `specs/changes/timeline-analytics/merge-workflow.md`
Archived: 2026-04-16T15:52:04Z

- `xflow:yolo` openissue handoff writes `current_stage=openissue`, and the canonical status machine must allow `openissue -> tdd` so `set-in-progress` can enter execution without manual status repair.
- `verify-consistency` must record `current_stage=verify` before archive. `pre-archive` only accepts a stage that can advance to `archive`, so the workflow data must include `B3.status.transition --to-stage verify`.
- The yolo workflow definition, status transition table, and workflow-loader tests are treated as one contract: changing one requires updating the others in the same change.


## Change: handoff-current-state

Source: `specs/changes/handoff-current-state/merge-workflow.md`
Archived: 2026-04-16T16:09:18Z

- `K3.handoff.refresh` / `scaffold_handoff.py --refresh --change-id <id>` now updates a managed Current State block in `HANDOFF.md` instead of returning without touching existing files.
- The managed block is bounded by `<!-- xflow:handoff-current:start -->` and `<!-- xflow:handoff-current:end -->`; repeated refreshes replace the block idempotently.
- The block records git branch, change id, stage/status, verification status, archival status, issue reference, and next action from `status.json`. It intentionally omits commit hash because committing a file that records its own current HEAD makes that value stale immediately.
- Refresh preserves the rest of `HANDOFF.md`; only the `## Current State` section or existing managed block is replaced.


## Change: archive-staging-guard

Source: `specs/changes/archive-staging-guard/merge-workflow.md`
Archived: 2026-04-16T16:29:24Z

- `A5.archive.commit_push_close` must refuse archive publish when `git diff --name-only` reports unstaged tracked files. Intended implementation/test changes must be staged before archive so the close-out commit cannot silently contain only handoff/spec updates.
- The dirty-worktree guard runs before terminal archive state is written to `status.json`; a rejected publish must leave the change in its pre-archive stage/status so the operator can stage or clean files and rerun safely.
- Ignored change workspaces under `specs/changes/` remain excluded from archive commits; the guard is specifically about tracked worktree changes.


## Change: openissue-preserve-frozen-docs

Source: `specs/changes/openissue-preserve-frozen-docs/merge-workflow.md`
Archived: 2026-04-16T16:36:34Z

- The plan phase is track-neutral. `xflow:plan` produces `plan.md` only and must not choose yolo versus corps.
- If yolo or corps starts without a preexisting plan, it may create one inline once and then reuse it. If a current plan already exists, it should be reused.
- Openissue may still update issue/branch/status metadata after branch creation, but it must not erase frozen scope, risks, tasks, or verification commands from change artifacts.


## Change: yolo-archive-phase-order

Source: `specs/changes/yolo-archive-phase-order/merge-workflow.md`
Archived: 2026-04-16T16:44:09Z

- The yolo archive phase treats `A5.archive.commit_push_close` as the single full archive publisher: it merges `merge-*.md` snippets, writes terminal archive status, refreshes final handoff state, commits, pushes, and closes the linked issue when configured.
- `K2.merge_snippets.apply`, `K5.archive.publish`, and a follow-up terminal `B3.status.transition` must not run in the yolo archive phase before/after A5 because they duplicate A5 side effects and can make archive non-idempotent.
- `A6.pr.create` runs after A5 so the PR is opened from a branch that already contains the archive commit.


## Change: yolo-archive-e2e-mocks

Source: `specs/changes/yolo-archive-e2e-mocks/merge-workflow.md`
Archived: 2026-04-16T16:54:59Z

- Yolo archive ordering is now covered by an offline e2e that loads the real `workflows/yolo.yaml` archive phase and replaces archive/publish atoms with local mock JS implementations.
- The mock A5 writes `.as-xflow/mock-archive-publish.json`; mock A6 fails unless it can read that archive publish marker. The test also asserts execution log order, so A6-before-A5 regressions fail without requiring GitHub CLI or network access.


## Change: skill-sync-wrapper-handoff-verify

Source: `specs/changes/skill-sync-wrapper-handoff-verify/merge-workflow.md`
Archived: 2026-04-16T17:14:18Z

- `xflow/scripts/sync_installed_xflow_skill.sh` is the repo-owned safe entrypoint for refreshing the installed `xflow` skill from as-xflow. It invokes the shared skillhub sync with as-xflow as `SKILLHUB` and as-skillhub `skills/` as an extra source so prune can still resolve unrelated managed skills.
- `K3.handoff.refresh` now updates a managed `## Latest Verified Commands` block from `specs/changes/<change-id>/verify_proof.json`, replacing stale manual command claims while preserving the rest of `HANDOFF.md`.
- `J1.tests.run` removes its orchestration-layer `CHANGE_ID` from child verification commands. Verification commands that intentionally need a change id should set it explicitly in the command itself.


## Change: sync-release-checklist-handoff-slim

Source: `specs/changes/sync-release-checklist-handoff-slim/merge-workflow.md`
Archived: 2026-04-16T17:22:53Z

- Local xflow skill release is now exposed through package scripts: `npm run skill:sync` runs the safe installed-skill sync wrapper, and `npm run release:local` runs repository verification before syncing the installed `xflow` skill.
- The workflow manual's local release checklist is the canonical human-facing sequence for local release: run `npm run verify`, then `npm run skill:sync`, or use `npm run release:local`.
- `HANDOFF.md` should stay concise: keep managed current-state and latest-verification blocks plus active commands and first-check files; avoid retaining old completed-change execution logs or stale next-step prose.


## Change: manual-corps-archive-handoff-focus

Source: `specs/changes/manual-corps-archive-handoff-focus/merge-workflow.md`
Archived: 2026-04-16T17:32:23Z

- `workflows/corps.yaml` now uses the same archive publish boundary as yolo: `K1.artifacts.complete_check`, `K6.aha.merge`, `K3.handoff.refresh`, `K4.mem.lesson_persist`, `A5.archive.commit_push_close --push --close-issue`, then `A6.pr.create`.
- The corps archive phase must not run `K2.merge_snippets.apply`, `K5.archive.publish`, `A4.project.set_status`, or a terminal `B3.status.transition` around A5; those duplicate A5 publish/terminal close-out side effects.
- `docs/workflow-manual.md` is covered by currentness tests for registry atom count, yolo gate names, archive ordering, and H atom count. Manual drift should fail locally instead of surfacing during real archive.
- `HANDOFF.md` current focus should be structured as `操作入口` and `近期风险`, not a mixed freeform `Current Focus` section.


## Change: drop-legacy-preopenissue-partial

Source: `specs/changes/drop-legacy-preopenissue-partial/merge-workflow.md`
Archived: 2026-04-16T17:37:57Z

- The legacy partial pre-openissue yolo gate name is no longer accepted in workflow-loader gate currentness checks. The active gate name is `pre-openissue`.
- Currentness tests avoid embedding the legacy gate literal directly, so grep-based drift checks can confirm the old name is absent from workflow/manual/test/spec entry points.


## Change: active-surface-drift-scan

Source: `specs/changes/active-surface-drift-scan/merge-workflow.md`
Archived: 2026-04-16T17:55:20Z

- `npm run drift:scan` is the targeted active-surface drift scan for xflow workflow currentness. It runs `test/workflow-drift-scan.test.js` and is included in the normal `npm test` path.
- The scan distinguishes active narrative/code surfaces from historical `specs/changes/**` audit artifacts. Retired gate literals, stale atom counts, and old archive-order phrases should be checked in active surfaces without rewriting historical change records.
- Release verification should run `npm run drift:scan` for fast feedback before the broader `npm run verify` / `npm run release:local` path.


## Change: takein-skill-drift-currentness

Source: `specs/changes/takein-skill-drift-currentness/merge-workflow.md`
Archived: 2026-04-16T18:03:00Z

- `xflow:takein` treats `npm run drift:scan` as a lightweight repo-state preflight when the project exposes that script; for as-xflow it is required before substantial implementation in a new thread.
- Active xflow skill docs are part of the workflow currentness surface. The drift scan checks that the primary skill docs reflect the current registry atom count instead of stale catalog totals.


## Change: split-subskill-phase-currentness

Source: `specs/changes/split-subskill-phase-currentness/merge-workflow.md`
Archived: 2026-04-16T18:12:56Z

- Split subskill documentation should describe coverage by canonical phase names, not local step numbers or ad hoc numeric ranges. Use `change-init` through `archive`, `set-in-progress` through `verify-consistency`, and the shared `xflow:plan` contract for planning.
- `npm run drift:scan` checks active split subskill docs for retired local numeric range phrases so yolo phase coverage stays aligned with `specs/workflow.md`.


## Change: archive-atom-boundary-currentness

Source: `specs/changes/archive-atom-boundary-currentness/merge-workflow.md`
Archived: 2026-04-16T18:20:32Z

- K2 and K5 are standalone archive helpers, not the workflow archive publish path. `K2.merge_snippets.apply` is the merge-snippets-only helper; `K5.archive.publish` is a terminal status helper.
- Workflow archive publish ownership remains with `A5.archive.commit_push_close`; active registry descriptions and atom docstrings should not describe K5 as the final archive publisher.
- `npm run drift:scan` covers the K2/K5 registry and docstring boundary so this responsibility split stays current.


## Change: archive-runtime-boundary-guards

Source: `specs/changes/archive-runtime-boundary-guards/merge-workflow.md`
Archived: 2026-04-16T18:31:20Z

- `archive_change.py` reports its runtime boundary mode explicitly: `Mode: merge-snippets-only` for K2-style snippet merges and `Mode: full-publish` for A5-style archive publishing.
- Merge-snippets-only archive runtime must not mutate terminal archive status; full publish owns terminal `archive` / `done` / `archived` state and final handoff refresh.


## Change: skill-sync-diff-command

Source: `specs/changes/skill-sync-diff-command/merge-workflow.md`
Archived: 2026-04-16T18:37:35Z

- `npm run skill:diff` is the canonical read-only installed `xflow` skill drift check after local release sync.
- The installed `xflow` skill may retain `.skillhub-source` as source metadata; any other diff between repo `xflow/` and `~/.agents/skills/xflow` is unexpected drift.


## Change: xflow-cli-executable-bit

Source: `specs/changes/xflow-cli-executable-bit/merge-workflow.md`
Archived: 2026-04-16T18:48:58Z

- `bin/xflow.js` is an executable CLI entry point and must retain executable mode (`100755`) so npm global bin links such as `/opt/homebrew/bin/xflow` can run the CLI directly.
- The canonical smoke proof for the global CLI entry is `which xflow`, `xflow --help`, and `xflow workflow validate workflows/yolo.yaml`.


## Change: global-cli-currentness

Source: `specs/changes/global-cli-currentness/merge-workflow.md`
Archived: 2026-04-16T18:55:56Z

- `HANDOFF.md` should present the global `xflow` CLI as the normal operator entrypoint now that `bin/xflow.js` is executable and npm-linked.
- Keep direct `node bin/xflow.js` subprocess calls available inside tests where avoiding dependence on the user's PATH is useful, but do not describe the project handoff as if `xflow` is unavailable by default.
- Currentness tests cover `package.json` `bin.xflow`, the executable bit on `bin/xflow.js`, and handoff commands such as `xflow workflow validate workflows/yolo.yaml` and `xflow serve`.


## Change: serve-help-no-start

Source: `specs/changes/serve-help-no-start/merge-workflow.md`
Archived: 2026-04-16T19:02:13Z

- `xflow serve --help` and `xflow serve -h` must print serve-specific help and exit without starting the HTTP control plane.
- The CLI serve help regression test uses a timeout and asserts no server-listening output, preventing help lookups from leaving a process on port 8787.


## Change: cli-subcommand-help

Source: `specs/changes/cli-subcommand-help/merge-workflow.md`
Archived: 2026-04-16T19:11:49Z

## cli-subcommand-help

- `xflow workflow --help`, `xflow atom --help`, and `xflow gate --help` print command-specific usage and exit 0 instead of reporting unknown subcommands.
- Subcommand help accepts `--help`, `-h`, and `help` consistently across `workflow`, `atom`, `gate`, and `serve`.


## Change: stable-node-test-runner

Source: `specs/changes/stable-node-test-runner/merge-workflow.md`
Archived: 2026-04-16T19:19:48Z

## stable-node-test-runner

- Local release uses a serial Node test runner: `npm test` runs `node --test --test-concurrency=1 test/**/*.test.js`.
- The serial runner avoids Node v23.11.0 default-concurrency worker IPC flake observed as `Unable to deserialize cloned data due to invalid or unsupported version` while preserving the existing `npm run verify` and `npm run release:local` entrypoints.
- `test/release-checklist.test.js` locks the package script so release verification cannot silently drift back to the flaky default concurrency path.
