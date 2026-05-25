# openflow Reviewer Guide

Use this guide when reviewing an xflow-driven change in an issue, PR, or handoff.
For team rollout policy, pair this with [Team Adoption Operating Model](./team-adoption.md).

## What To Check First

1. `HANDOFF.md` current-state block names the active change, stage, verification state, archive state, and next action.
2. `specs/changes/<change-id>/proposal.md` and `plan.md` match the PR scope.
3. `verify_proof.json` or the PR body names the verification commands and outcomes.
4. TDD proof includes a failing red command before implementation, a passing green/refactor command after implementation, and an `I6c` quality proof.
5. `AHA.md` records durable lessons when the change exposed a reusable workflow insight.
6. Archive order keeps publish/commit/push/close in `A5.archive.commit_push_close` before `A6.pr.create`.

## Required Reviewer Questions

- Did the implementation stay inside the frozen proposal and plan?
- Did the workflow data, docs, and tests move together?
- Did `I6b.tdd.proof_validate` accept red/green semantics, and did `I6c.tdd.quality_review` reject empty/snapshot-only/mock-heavy tests?
- Did `npm run drift:scan` pass when active workflow or skill surfaces changed?
- Did `npm run skill:diff` pass after skill source changes?
- Is any local-machine assumption documented or moved into `.as-xflow/config.json`?
- Does the PR identify the operator, implementer, reviewer, and release owner when it is part of a team rollout?

## Accept / Request Changes

Accept when the implementation, workflow artifacts, verification proof, and handoff agree.

Request changes when any of these are true:

- The PR changes workflow behavior without schema or test coverage.
- The PR changes public skill surfaces without `npm run skill:diff` evidence.
- The PR adds prose workflow steps without matching workflow YAML or atom registry updates.
- The PR claims archive completion while local status, issue state, or git history disagrees.

## Reviewer Shortcuts

```bash
xflow doctor
xflow score
npm run drift:scan
npm run skill:diff
```
