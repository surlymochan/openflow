# Pencil Refine — {{phase_label}}

## Mission
Refine the existing Pencil draft using the latest review and benchmark evidence, without reopening the design direction.

## Context
- **Change ID**: {{change_id}}
- **Artifact Directory**: {{artifact_dir}}
- **Primary Output**: `{{expected_artifact}}`

## Required Inputs
Read these files when they exist in `{{artifact_dir}}`:
1. `pencil_output.pen`
2. `llm_design_review.json`
3. `visual_benchmark.json`
4. `benchmark_repair_plan.json`
5. `generation_contract.json`
6. `design_system_pack.json`
7. `image_reference_set.json`
8. `design_selection.json`
9. `ux_design_brief.json`
10. `pencil_refine_targets.json` (when already prepared)

## Execution Rules
0. Fast path: if `benchmark_repair_plan.json` says `status: "not_needed"` and `visual_benchmark.json` shows every scenario passing, preserve the existing draft, do not inspect or rewrite component internals, and save the current Pencil file to the primary output as an explicit no-op refinement.
1. Start from the existing Pencil draft instead of recreating the surface from scratch.
2. Apply only the changes needed to address review findings, benchmark deltas, repair-plan hotspots, and hierarchy issues.
3. Treat each repair target as component-local work; preserve non-target components unless a target explicitly includes them.
4. Respect refine scopes from `pencil_refine_targets.json` when present:
   - `allow_big_change`: geometry, hierarchy, and local structure may change inside the target bounds.
   - `micro_tune_only`: only tokens, spacing, copy rhythm, and small alignment nudges may change.
   - `freeze`: do not visually or structurally alter these components in this pass.
5. Preserve the selected layout and product logic unless the review evidence clearly requires adjustment.
6. Use the generation contract and locked primary reference surface to keep refinement convergent.
7. Keep refinement focused and convergent; avoid opening new stylistic branches or whole-page redraws.
8. Preserve the high-aesthetic contract from `generation_contract.json`; fixes that improve similarity but damage hierarchy, typography rhythm, density, or interaction polish are regressions.
9. If `image_reference_set.json` is present, refine toward its material quality and component rhythm while keeping the product surface editable and benchmarkable.
10. Keep refinements inside `design_system_pack.json`: do not invent primitives, omit required states, or bypass the preview/proof loop to make a local visual fix easier.

## Output
- Save the refined Pencil file to: `{{expected_artifact}}`
- Also write any required supporting outputs:
{{auxiliary_outputs}}

## Stop Condition
Finish when the draft is materially improved against the review evidence and ready for design acceptance.
