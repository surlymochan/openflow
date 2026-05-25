# Product Spec

## Purpose

- What the product exists to do.

## Core User Journeys

- Primary journey:

## Scope Boundaries

- In scope:
- Out of scope:

## Accepted Behavior

- Durable product requirements land here after archive.


## Change: timeline-analytics

Source: `specs/changes/timeline-analytics/merge-product.md`
Archived: 2026-04-16T15:52:04Z

- Control-plane mission timeline now has a derived analytics endpoint:
  - `GET /api/missions/:missionId/timeline/analytics`
  - returns event totals, event kind distribution, time range, rerun status/mode counts, operator action kind/status counts, phase run counts, and phase run session derived-status counts.
- Operators can explicitly acknowledge a recovered orphan rerun:
  - `POST /api/missions/:missionId/reruns/:rerunId` with `{"action":"acknowledge-orphan"}`
  - only `orphaned` reruns are eligible.
  - acknowledged orphan reruns remain auditable in mission detail as `canceled` and include a `rerun_orphan_acknowledge` operator action.
  - acknowledged orphan runs are removed from active run summary and `.as-xflow/active-runs.json`.
