#!/usr/bin/env python3
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path


PRODUCT_TEMPLATE = """# Product Spec

## Purpose

- What the product exists to do.

## Core User Journeys

- Primary journey:

## Scope Boundaries

- In scope:
- Out of scope:

## Accepted Behavior

- Durable product requirements land here after archive.
"""


README_TEMPLATE = """# Specs

This directory is the single Superflow-owned root directory at the project root.

It has two layers:

- `specs/*.md` for durable project source-of-truth specs
- `specs/changes/<change-id>/` for per-change working artifacts

## Layout

```text
specs/
|-- README.md
|-- product.md
|-- architecture.md
|-- workflow.md
|-- ux.md                # optional (or use DESIGN.md)
|-- DESIGN.md            # optional design system
`-- changes/
    `-- <change-id>/
        |-- proposal.md
        |-- plan.md
        |-- findings.md         # optional research notes for long or uncertain changes
        |-- progress.md         # optional rolling status for long-running changes
        |-- status.json
        |-- design.md            # if frontend/UI change
        |-- merge-product.md     # optional
        |-- merge-architecture.md
        |-- merge-workflow.md    # workflow / capability delta
        |-- merge-ux.md
        `-- merge-design.md      # if design change
```

## Root specs vs change specs

Use root specs for durable truth:

- `product.md`
  - product goals
  - accepted behavior
  - scope boundaries
- `architecture.md`
  - system shape
  - module boundaries
  - technical invariants
- `workflow.md`
  - delivery rules
  - QA / review / release rules
- `ux.md` / `DESIGN.md`
  - visual tone
  - color system
  - typography
  - layout rules
  - component patterns

Use `specs/changes/<change-id>/` for change-scoped work:

- proposal
- plan
- findings / progress for long-running or research-heavy work
- design reasoning (if UI)
- machine-readable state
- explicit archive merge snippets

`xflow:plan` only writes `plan.md`. It does not create `tasks.md`.

## DESIGN.md

`DESIGN.md` is the canonical design system file.

It follows the format from Google Stitch / awesome-design-md.

Use it OR `specs/ux.md` — never both with overlapping content.

When a change involves UI:

1. Check if `DESIGN.md` exists
2. If not, create one from template
3. Run design-check in yolo workflow
4. Archive design decisions to Design Decisions Log

## Archive rule

Do not treat `proposal.md`, `plan.md`, or `design.md` as automatic sources for root spec updates.

When a change produces durable truth, write the exact durable facts into explicit merge files:

- `merge-product.md`
- `merge-architecture.md`
- `merge-workflow.md` (workflow / capability delta)
- `merge-ux.md`
- `merge-design.md`

Archive should prefer these explicit merge files over trying to summarize large documents.

This is intentional:

- it reduces accidental deletion of older truth
- it reduces under-summary or over-summary of the current change
- it keeps the durable root specs stable and auditable

## Status rule

`status.json` is the machine-readable state for the active change.

Use it to track:

- change type (backend | frontend | full-stack | infrastructure | docs)
- current stage
- verification state
- design alignment (if frontend)
- archival readiness
- next action

Do not use it as a replacement for the human-readable plan or proposal.
"""


ARCHITECTURE_TEMPLATE = """# Architecture Spec

## System Shape

- Major modules and boundaries.

## Data Flow

- Main request / event / state flow.

## Technical Constraints

- Durable invariants and constraints.

## Notes

- Long-lived architecture decisions land here after archive.
"""


WORKFLOW_TEMPLATE = """# Workflow Spec

## Primary Flow

```text
User Input
    |
    v
change-init
    |
    v
consistency-check
    |
    v
design-check (if frontend)
    |
    v
brainstorm (multiple-choice clarification)
    |
    v
proposal-freeze
    |
    v
plan (short confirmation)
    |
    v
tdd
    |
    v
execute
    |
    v
verify (adversarial + visual if UI)
    |
    v
archive
    |
    v
merge durable facts into root specs
```

## Rules

- Brainstorm uses multiple-choice clarification by default.
- Design-check runs for frontend/full-stack changes.
- Plan stays short enough to read fully before confirmation.
- TDD is the default execution method.
- Verify is separate from execute.
- Archive merges durable truth into root specs.
"""


UX_TEMPLATE = """# UX Spec

> Note: This file is deprecated. Use DESIGN.md instead.
> DESIGN.md follows the Google Stitch / awesome-design-md format.
> If this file exists, migrate content to DESIGN.md and remove this file.

## Legacy Content

Migrate the following to DESIGN.md:
- Visual tone → DESIGN.md Visual Tone
- Color system → DESIGN.md Color System
- Typography → DESIGN.md Typography
- Layout rules → DESIGN.md Layout & Spacing
- Component patterns → DESIGN.md Component Patterns
- Design decisions → DESIGN.md Design Decisions Log
"""


DESIGN_TEMPLATE = """# Design System

> This file follows the DESIGN.md format from Google Stitch / awesome-design-md.
> AI agents read this to generate consistent UI.

## Brand & Purpose

- Product: [what the product is]
- Audience: [who uses it]
- Core value: [one-line positioning]

## Visual Tone

- Primary tone: [minimal | maximalist | brutalist | editorial | organic | luxury | playful | industrial | retro-futuristic | dark-mode-first]
- Secondary tone: [optional refinement]
- Reference brand: [optional, e.g., "similar to Linear"]

## Color System

| Token | Value | Usage |
|-------|-------|-------|
| Background | | Primary page background |
| Surface | | Cards, panels, elevated surfaces |
| Primary | | Main brand color, key actions |
| Accent | | Highlights, links, focus states |
| Text | | Primary text content |
| Text Muted | | Secondary text, placeholders |
| Border | | Dividers, input borders |
| Success | | Positive states |
| Error | | Errors, destructive actions |
| Warning | | Caution states |

Define as CSS variables:

```css
:root {
  --color-background: ;
  --color-surface: ;
  --color-primary: ;
  --color-accent: ;
  --color-text: ;
  --color-text-muted: ;
  --color-border: ;
}
```

## Typography

| Role | Font | Weight | Size |
|------|------|--------|------|
| Display | | | |
| Heading | | | |
| Body | | | |
| Mono | | | |

## Layout & Spacing

- Density: [dense | balanced | sparse]
- Max width: [e.g., 1200px]
- Spacing base: [4px | 8px]

## Motion

- Animation level: [none | subtle | moderate | rich]
- Transition timing: [fast | normal | slow]

## Visual Details

- Border radius: [sharp | soft | round]
- Shadow level: [none | subtle | moderate | strong]
- Icon style: [outline | solid | minimal]

## Component Patterns

### Buttons
- Primary:
- Secondary:
- Ghost:

### Cards
- Border:
- Padding:
- Radius:

### Inputs
- Border:
- Focus:

### Navigation
- Style: [sidebar | topbar | tabs]

## Best For

- Ideal use cases:
- Avoid:

## Design Decisions Log

- [YYYY-MM-DD] [change-id]: [decision] — [reasoning]

---

## Quick Tone Reference

| Tone | Best For | Key Brands |
|------|----------|------------|
| Minimal Clean | Tools, dashboards | Linear, Vercel |
| Editorial Warm | Content, docs | Notion, Medium |
| Dark Cinematic | Media, AI tools | ElevenLabs, Cursor |
| Developer-First | Terminal, CLI | Ollama, Warp |
| Friendly Playful | Consumer apps | Lovable, Zapier |
| Enterprise Clean | B2B, infra | HashiCorp, MongoDB |
"""


PROPOSAL_TEMPLATE = """# Proposal

## Objective

-

## Chosen Path

-

## Rejected Paths

-

## In Scope

-

## Out of Scope

-

## Acceptance Intent

-

## Design Direction (if frontend)

- Visual tone:
- Key differentiator:
- Reference brand (if any):
"""


DESIGN_CHANGE_TEMPLATE = """# Design Direction

> This file captures design decisions for this change.
> Merge key decisions into DESIGN.md Design Decisions Log during archive.

## Visual Tone

- Chosen tone: [minimal | maximalist | brutalist | editorial | organic | luxury | playful | industrial | retro-futuristic | dark-mode-first]
- Reasoning:

## Key Design Decisions

1. [decision]: [reasoning]
2. [decision]: [reasoning]

## Colors (if changed)

- [color name]: [value] — [usage]

## Typography (if changed)

- [font change]: [reasoning]

## Components (if new)

- [component]: [style decision]

## Reference

- Similar to: [brand reference if any]

## Verification Checklist

- [ ] Matches DESIGN.md specifications
- [ ] Visual comparison done
- [ ] Design decisions documented for archive
"""


PLAN_TEMPLATE = """# Plan

## Target Outcome

-

## Chosen Path

-

## In Scope

-

## Out of Scope

-

## Task Slices

1.
2.
3.

## Verification Commands

```bash
# Fill in the smallest proof commands
```

## Design Alignment (if frontend)

- Visual tone:
- Key specifications to verify:

## Main Risk

-
"""


FINDINGS_TEMPLATE = """# Findings

## Questions Investigated

1.
2.
3.

## Evidence

- [ ] Evidence item

## Interim Conclusions

- 

## Open Questions

- 
"""


PROGRESS_TEMPLATE = """# Progress

## Current Focus

- 

## Completed

- [ ] 

## In Flight

- [ ] 

## Blockers

- 
"""


MERGE_WORKFLOW_TEMPLATE_PATH = Path(__file__).resolve().parents[2] / "archive" / "templates" / "merge-workflow.md"


def load_merge_workflow_template() -> str:
    if MERGE_WORKFLOW_TEMPLATE_PATH.exists():
        return MERGE_WORKFLOW_TEMPLATE_PATH.read_text(encoding="utf-8")
    return """# Workflow Delta

## Capability Delta

- 

## Behavior Changes

- 

## Constraints and Invariants

- 

## Migration Notes

- 
"""


TASKS_TEMPLATE = """# Tasks

- [ ] Slice 1
- [ ] Slice 2
- [ ] Slice 3
"""


STATUS_TEMPLATE = {
    "change_id": "",
    "title": "",
    "change_type": "backend",
    "status": "draft",
    "current_stage": "change-init",
    "verification_status": "not_run",
    "archival_status": "not_ready",
    "design_aligned": "na",
    "next_action": "Clarify the change through multiple-choice brainstorm.",
    "updated_at": "",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Initialize root specs/ and scaffold a Superflow change workspace.",
    )
    parser.add_argument(
        "--project-root",
        default=".",
        help="Project root where specs/ should be created.",
    )
    parser.add_argument(
        "--change-id",
        required=True,
        help="Short stable change identifier, e.g. add-dark-mode.",
    )
    parser.add_argument(
        "--title",
        default=None,
        help="Human-readable change title. Defaults to the change id.",
    )
    parser.add_argument(
        "--change-type",
        choices=["backend", "frontend", "full-stack", "infrastructure", "docs"],
        default="backend",
        help="Type of change. frontend/full-stack triggers design workflow.",
    )
    parser.add_argument(
        "--with-ux",
        action="store_true",
        help="Also create specs/ux.md if it does not exist.",
    )
    parser.add_argument(
        "--with-design",
        action="store_true",
        help="Also create DESIGN.md template if it does not exist.",
    )
    parser.add_argument(
        "--with-findings",
        action="store_true",
        help="Also create findings.md for research-heavy or uncertain changes.",
    )
    parser.add_argument(
        "--with-progress",
        action="store_true",
        help="Also create progress.md for long-running changes.",
    )
    parser.add_argument(
        "--with-workflow-merge",
        action="store_true",
        help="Also create merge-workflow.md for workflow/capability deltas.",
    )
    return parser.parse_args()


def ensure_text(path: Path, content: str) -> None:
    if not path.exists():
        path.write_text(content, encoding="utf-8")


def main() -> int:
    args = parse_args()
    project_root = Path(args.project_root).expanduser().resolve()
    specs_root = project_root / "specs"
    changes_root = specs_root / "changes"
    change_root = changes_root / args.change_id

    specs_root.mkdir(parents=True, exist_ok=True)
    changes_root.mkdir(parents=True, exist_ok=True)
    change_root.mkdir(parents=True, exist_ok=True)

    ensure_text(specs_root / "product.md", PRODUCT_TEMPLATE)
    ensure_text(specs_root / "README.md", README_TEMPLATE)
    ensure_text(specs_root / "architecture.md", ARCHITECTURE_TEMPLATE)
    ensure_text(specs_root / "workflow.md", WORKFLOW_TEMPLATE)

    if args.with_ux:
        ensure_text(specs_root / "ux.md", UX_TEMPLATE)

    if args.with_design:
        ensure_text(project_root / "DESIGN.md", DESIGN_TEMPLATE)

    ensure_text(change_root / "proposal.md", PROPOSAL_TEMPLATE)
    ensure_text(change_root / "plan.md", PLAN_TEMPLATE)
    if args.with_findings or args.change_type in ("frontend", "full-stack"):
        ensure_text(change_root / "findings.md", FINDINGS_TEMPLATE)
    if args.with_progress or args.change_type in ("frontend", "full-stack"):
        ensure_text(change_root / "progress.md", PROGRESS_TEMPLATE)
    ensure_text(change_root / "tasks.md", TASKS_TEMPLATE)
    if args.with_workflow_merge or args.change_type in ("frontend", "full-stack"):
        ensure_text(change_root / "merge-workflow.md", load_merge_workflow_template())

    # Create design.md for frontend/full-stack changes
    is_frontend = args.change_type in ("frontend", "full-stack")
    if is_frontend:
        ensure_text(change_root / "design.md", DESIGN_CHANGE_TEMPLATE)

    status = dict(STATUS_TEMPLATE)
    status["change_id"] = args.change_id
    status["title"] = args.title or args.change_id
    status["change_type"] = args.change_type
    status["design_aligned"] = "na" if not is_frontend else "pending"
    status["updated_at"] = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    status_path = change_root / "status.json"
    if not status_path.exists():
        status_path.write_text(json.dumps(status, indent=2) + "\n", encoding="utf-8")

    print(f"specs_root: {specs_root}")
    print(f"change_root: {change_root}")
    if is_frontend:
        print(f"design.md created for frontend change")
    if args.with_design:
        print(f"DESIGN.md template created at project root")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
