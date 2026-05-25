# Architecture Spec

## System Shape

- Major modules and boundaries.

## Data Flow

- Main request / event / state flow.

## Technical Constraints

- Durable invariants and constraints.

## Notes

- Long-lived architecture decisions land here after archive.


## Change: timeline-analytics

Source: `specs/changes/timeline-analytics/merge-architecture.md`
Archived: 2026-04-16T15:52:04Z

- Timeline analytics remain derived data. `src/server.js` computes analytics from `getMissionDetail(...).timeline` and does not persist a second summary model.
- Active workflow run cleanup is centralized around the in-memory `activeWorkflowRuns` map plus `.as-xflow/active-runs.json` persistence. Orphan acknowledge deletes the matching active run entry, rewrites touched project roots, and updates the rerun record with `acknowledged_at` audit metadata.
- Rerun history is never physically deleted as part of orphan cleanup. Audit state stays in `reruns` and `operator_actions`; only the active-run control surface is cleared.


## Change: handoff-current-state

Source: `specs/changes/handoff-current-state/merge-architecture.md`
Archived: 2026-04-16T16:09:18Z

- Root handoff current-state facts are now generated from local status and git state by `xflow/handoff/scripts/scaffold_handoff.py`.
- The generated handoff block is intentionally narrow: it does not synthesize a full Context Pack and does not query GitHub for merge state. It reduces drift for high-risk execution metadata while preserving human-authored durable context.
