# Pencil Draft — {{phase_label}}

## Mission
Turn the already-selected design direction and winning layout into a single concrete Pencil draft.

## Context
- **Change ID**: {{change_id}}
- **Artifact Directory**: {{artifact_dir}}
- **Primary Output**: `{{expected_artifact}}`

## Required Upstream Inputs
Before drawing, read these files when they exist in `{{artifact_dir}}`:
1. `design_contract.json`
2. `competitor_reconstruction_review.json`
3. `reference_surface_lock.json`
4. `reconstruction_pack.json`
5. `generation_contract.json`
6. `design_system_pack.json`
7. `image_reference_set.json`
8. `visual_direction_synthesis.json`
9. `layout_competition.json`
10. `design_selection.json`
11. `ux_design_brief.json`
12. `pencil_generation_plan.json` (when already prepared)

## Execution Rules
1. Build exactly one winning desktop/product surface, not multiple alternatives.
2. Follow the selected direction, winning layout, generation contract, and UX brief literally when they are present.
3. Generate in stages: shell first, then primary focus components, then supporting components, then local polish.
4. Treat `component_blueprint` and `staged_generation` as execution instructions, not optional context.
5. Keep the composition product-like and implementation-ready; avoid decorative exploration loops.
6. Prefer one primary frame/workbench with the key panels, controls, and hierarchy already laid out.
7. Treat the primary reference surface lock as the source of truth; supporting surfaces may only refine, not replace, the locked skeleton.
8. Keep naming and structure readable for downstream refinement and benchmark comparison.
9. Treat `visual_constraints.aesthetic_standard` as a hard quality bar, not a mood-board suggestion.
10. When `visual_constraints.image_reference_generation` is enabled, read `image_reference_set.json` and use its materialized GPT/image-model reference artifacts as high-aesthetic targets, then translate them into editable Pencil primitives; do not ship bitmap mockups as the implementation.
11. Read `design_system_pack.json` as a hard design-system contract: allowed primitives, required states, token policy, preview loop, and commercial/open practice sources must shape the draft.
12. Pencil is the editable assembly/refinement surface. It is not sufficient by itself for high-aesthetic UI unless the design-system pack, image-reference, and benchmark evidence also converge.

## Output
- Save the Pencil file to: `{{expected_artifact}}`
- Also write any required supporting outputs:
{{auxiliary_outputs}}

## Stop Condition
Finish when the draft clearly reflects the frozen direction/layout and is ready for review or refinement.
