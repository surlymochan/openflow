---
name: xflow:corps
description: "重型多 agent 全产品交付工作流。适用于复杂用户界面、设计闭环和多 agent 协作。可复用 xflow:plan 产物，或在缺少 plan 时先补一轮通用规划。"
---

# Superflow Corps

`xflow:corps` is the heavy execution track. Planning is shared with
`xflow:plan` and is not track-specific.

## Single entry rule

- Execute through `xflow corps --title "<title>" --change-type frontend --change-id <id>`.
- Use `xflow corps --explain` before a first run when the operator needs the
  compressed guide, proof contract, competitor-led inputs, and failure meanings.
- Do not manually simulate the heavy workflow in chat, by ad hoc shell steps, or by treating partial file checks as completion.
- `xflow workflow validate corps` is preflight only. It proves YAML shape, not workflow execution.
- Completion requires `specs/changes/${CHANGE_ID}/corps_proof.json` with `ok=true`.
- `corps_proof.json` must be backed by the built-in governed corps manifest, hash-linked execution-log records, `workflow_started`/`workflow_completed`, `phase_started`/`phase_completed` for every canonical phase, successful atom/gate witnesses, and zero `stub`, `task_queued`, or `pencil_stubbed` runtime fallback.
- Project-local workflow config may customize normal workflow aliases, but the governed `xflow corps` entry and `xflow proof --track corps` use the built-in corps workflow so the heavy path cannot be shortened through config.
- Heavy agent work must be issued by the workflow runtime/control plane and its `agent_invoke` task packages; the conversation AI should not improvise a parallel private workflow.
- The conversation AI represents the human operator: clarify requirements before execution, let the governed `corps` entry auto-approve scripted human gates, and inspect final proof before accepting success.

## Plan reuse rule

- Read project root `.xflow/GOAL.md` when present and use it as direction
  context only. Before executing, state how the product contract aligns with,
  narrows, or intentionally diverges from the project goal.
- Reuse `specs/changes/${CHANGE_ID}/plan.md` when it is current.
- If the plan is missing or still a scaffold placeholder, create it once before continuing.
- Planning stays track-neutral; do not re-run it just because the workflow is heavy-track.

## Optional long-run notes

For research-heavy or long-running changes, keep optional `findings.md` and
`progress.md` alongside the plan when they help the team stay aligned.
These notes are auxiliary; they do not replace `plan.md`.
If the change also affects workflow semantics, add a `merge-workflow.md`
stub with an explicit capability delta section.

## When to use corps

- New user-facing screen or interaction pattern
- Visual quality matters and needs Pencil + multimodal review
- Multiple agents should propose or critique
- The risk or scope requires formal sign-off

## Execution contract

The heavy workflow runs the same phase family as yolo, but with the full design
loop and heavy-track gates. The workflow YAML is the canonical source for atom
order and gates. The CLI entry owns the execution and proof boundary.

## Guardrails

- Keep planning track-neutral
- Reuse an existing plan when present
- Include goal alignment in the final proof review: `corps_proof.json ok=true`
  is necessary, but the operator still has to check whether the proof satisfies
  the project direction anchor.
- Confirm the linked branch and checkout are ready before moving into execution
- Do not expose deleted top-level utility skills as separate entry points
- For competitor-led UI work, freeze the competitor reconstruction contract before execution:
  - corps entry should treat competitor-led UI as strict mode by default, not as a best-effort hint: once competitor-led signals are present, benchmark evidence becomes mandatory before execution continues
  - name the competitor product and target surfaces explicitly
  - lock exactly one `primary_reference_surface`; supporting surfaces may refine but must not replace the primary anchor
  - map the required modules and IA, not just one visible page slice
  - record business-logic invariants that must not be violated
  - require exactly one benchmark evidence path for `H6.visual.benchmark`:
    - `reference_scenarios_json`, or
    - `capture_url + reference_image`
  - before visual generation, freeze the structured reconstruction artifacts:
    - `reference_surface_lock.json`
    - `reconstruction_pack.json`
    - `generation_contract.json`
    - `design_system_pack.json`
  - treat those artifacts as generation-time instructions, not just review evidence:
    - `reconstruction_pack.json` should expose page-local `component_blueprint` primitives and a `relationship_graph`
    - `generation_contract.json` should expose staged component generation (`shell`, `primary_focus`, `secondary_focus`, `polish`) plus `geometry_hints` / `token_hints`
    - `pencil_draft` should build by stage, not by whole-page freeform redraw
    - `benchmark_repair_plan.json` should downshift unresolved evidence into component-local `repair_targets`
    - `pencil_refine` should preserve non-target components by default and only modify named repair targets
    - `generation_contract.json` should include `visual_constraints.aesthetic_standard`, `image_reference_generation`, and `pencil_role_boundary`
    - `design_system_pack.json` should compile commercial/open UI generation practices into generic constraints: React/component-system stack defaults, component whitelist, required states, token policy, local preview/refine loop, and structured UI generation rules
    - `image_reference_set.json` must materialize the required image-reference outputs (`primary_surface_reference_frame`, `component_density_sheet`, `state_polish_sheet`) and every listed reference must point to an existing artifact
    - Pencil is the editable assembly/refinement layer, not the sole high-aesthetic engine; when the host has GPT/imagev2-style image generation available, use it to produce reference frames and component/state sheets, then translate those into editable UI and benchmark evidence
    - `H6d.visual.aesthetic_review` must accept the final recheck before design acceptance: high aesthetic contract present, design-system practice pack materialized, image reference artifacts materialized, Pencil boundary explicit, benchmark scenarios passing, and score at or above threshold
  - when fidelity needs to reach commercial-grade polish, add `visual_token_contract` and `observed_visual_tokens` so benchmark can emit deterministic `token_checks`
  - prefer token contracts that cover typography rhythm and surface treatment, not only font family and color: `line_height_range`, `letter_spacing_range`, `border_width_range`, `border_styles_required`, `shadow_signatures_required`
  - when the competitor surface depends on interaction states, pass `capture_states_json` on the `capture_url + reference_image` path so benchmark captures hover/open/selected variants instead of only the base frame
  - when the workbench has key semantic states such as detail-open, active-filter, selected-item, or bulk-select, add `state_contract.required_workbench_states` so benchmark emits deterministic `state_contract_checks` instead of treating all captured states as equally important
  - when dense commercial UI matters, include icon and surface-depth tokens such as `icon_density_range`, `icon_size_range`, `border_weight_tiers_required`, and `shadow_strength_tiers_required`
- for iOS / Android / H5 surfaces, do not reuse desktop-only acceptance by habit: add mobile-oriented checks such as `min_touch_target_size` and mobile workspace patterns like `compact_top_nav`, `bottom_tabbar_docked`, or `bottom_sheet_over_content`
- for iOS / Android / H5 surfaces, also add mobile-native hard gates when relevant: `safe_area_top_panels`, `safe_area_bottom_panels`, `keyboard_aware_panels`, `thumb_reach_primary_action_panels`, `bottom_sheet_handle_required`, and `tabbar_active_state_required`
- for iOS / Android / H5 surfaces, keep going past layout: add mobile component signals such as `floating_primary_action_required` and `segmented_control_active_state_required`, and sample gesture states with `swipe_selector`, `drag_selector`, or `scroll_selector` when the target interaction depends on motion rather than static chrome
- when the target fidelity depends on motion or platform transitions, do not stop at one end-state screenshot: add `expect_motion`, `sample_frames`, and `frame_interval_ms`, and use `benchmark_matrix_contract` / `viewport_variants_json` when the product needs multiple viewport baselines to count as “close enough”
  - when the goal is platform-native feel, add `required_platform_physics_profiles` such as `ios_spring`, `android_ripple`, or `mobile_h5_smooth` so benchmark checks motion language instead of only final pixels
  - when polish depends on same-family components staying visually consistent, add `component_family_consistency` checks for families such as `toolbar_controls`, `list_rows`, and `detail_blocks` instead of only checking global min/max ranges
  - when polish depends on interaction states using the same motion/contrast language, add `state_family_contract` so benchmark checks variant coverage and spread within families like `toolbar_controls`
  - when those state families also need token-level consistency, include `state_visual_tokens` or rely on the `capture_url` path so benchmark can enforce token rules such as surface-color distinctness, shadow-tier distinctness, timing-function coverage, transition-duration spread, radius spread, and border-width spread across variants
  - let `capture_url` auto-detect semantic product states like `loading_state`, `skeleton_state`, `error_state`, and `search_active` instead of silently skipping them from the proof bundle
  - when the surface has many interactive affordances, `auto_discover_states` can be used as a first-pass fallback to capture likely hover/click states without hand-authoring every selector
  - when visual rhythm matters, prefer adding `alignment_grid_step` / `alignment_grid_tolerance` so benchmark checks that major panels stay on a shared grid instead of only matching approximate widths
  - treat `xflow visual capture-page-evidence` as the helper entrypoint when pre-capturing screenshot, DOM snapshot, and `dom_rects` outside the phase
  - use `xflow visual render-report` or the benchmark-generated `visual_benchmark_report.html` when reviewers need a side-by-side compare viewer instead of raw JSON
  - unresolved benchmark evidence should converge through the scripted repair loop: advisory `llm_design_review` -> `benchmark_repair_plan.json` -> `pencil_refine` -> strict `llm_design_recheck`
  - reject "looks similar" acceptance without primary journey and cross-module proof
- Keep the pipeline generic: corps validates named competitors, product surfaces, journeys, and invariants, but it must not bake in any single business domain or product model.
- Domain rules belong in the current change contract, not in the workflow itself. A todo/GTD rule, trading rule, CRM rule, or editor rule should be expressed through `business_logic_invariants` for that change.
