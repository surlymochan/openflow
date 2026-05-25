import { readJsonFile, resolveChangePath, writeJsonFile } from '../../../core/change-artifacts.js';

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function buildGenerationStages(componentBlueprint = []) {
  const stageBuckets = [
    { id: 'shell', description: 'Build the locked surface shell and region anchors first.' },
    { id: 'primary_focus', description: 'Build the most reference-sensitive primary primitives next.' },
    { id: 'secondary_focus', description: 'Add supporting primary primitives without widening scope.' },
    { id: 'polish', description: 'Apply local polish only after core structure and density are in place.' },
  ];
  return stageBuckets
    .map((stage, index) => {
      const components = componentBlueprint.filter((component) => component.stage_bucket === stage.id);
      return {
        id: stage.id,
        order: index + 1,
        description: stage.description,
        target_component_ids: components.map((component) => component.id),
        primary_geometry_profiles: unique(components.map((component) => component.geometry_profile)),
        primary_token_profiles: unique(components.map((component) => component.token_profile)),
      };
    })
    .filter((stage) => stage.target_component_ids.length > 0);
}

function buildPanelFocusSequence(componentBlueprint = [], generationStages = []) {
  const stageWeight = {
    shell: 1,
    primary_focus: 4,
    secondary_focus: 2,
    polish: 1,
  };
  const moduleScores = new Map();
  for (const component of componentBlueprint) {
    const weight = stageWeight[component.stage_bucket] || 1;
    const hierarchyBonus = component.hierarchy_role === 'primary' ? 2 : 0;
    moduleScores.set(component.module, (moduleScores.get(component.module) || 0) + weight + hierarchyBonus);
  }

  return [...moduleScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([module, score], index) => {
      const moduleComponents = componentBlueprint.filter((component) => component.module === module);
      const stageIds = generationStages
        .filter((stage) => (stage.target_component_ids || []).some((id) => moduleComponents.some((component) => component.id === id)))
        .map((stage) => stage.id);
      return {
        module,
        priority_order: index + 1,
        score,
        target_component_ids: moduleComponents.map((component) => component.id),
        dominant_primitive_roles: unique(moduleComponents.filter((component) => component.hierarchy_role === 'primary').map((component) => component.primitive_role)),
        stage_ids: stageIds,
        local_generation_rule: index === 0
          ? 'Finish the highest-risk panel skeleton and primary primitives before widening to other panels.'
          : 'Expand only after the earlier panel reaches stable density and hierarchy.',
      };
    });
}

function buildAestheticStandard(input = {}, pack = {}) {
  const requested = input.aesthetic_standard && typeof input.aesthetic_standard === 'object'
    ? input.aesthetic_standard
    : {};
  return {
    id: requested.id || 'high_aesthetic_product_surface',
    level: requested.level || 'high',
    min_accept_score: Number.isFinite(Number(requested.min_accept_score)) ? Number(requested.min_accept_score) : 0.88,
    dimensions: requested.dimensions || [
      'composition_balance',
      'information_hierarchy',
      'typography_rhythm',
      'color_material_control',
      'density_and_spacing',
      'interaction_state_polish',
    ],
    anti_patterns: requested.anti_patterns || [
      'generic_dashboard_spacing',
      'decorative_card_stacking',
      'poster_scale_typography_inside_tools',
      'one_note_palette',
      'floating_placeholder_panels',
      'unjustified_gradient_orbs',
    ],
    reference_mode: input.competitor_product || pack.primary_reference_surface
      ? 'reference_backed_high_aesthetic'
      : 'native_high_aesthetic',
  };
}

function buildImageReferenceGeneration(input = {}, primaryReferenceSurface = null) {
  const requested = input.image_reference_generation && typeof input.image_reference_generation === 'object'
    ? input.image_reference_generation
    : {};
  const enabled = requested.enabled !== false;
  const modelCapability = requested.model_capability
    || input.visual_generation_model
    || input.image_model
    || 'gpt_image_v2_style_reference';
  return {
    enabled,
    model_capability: modelCapability,
    role: 'generate high-aesthetic reference frames and component/style sheets before editable UI assembly',
    non_goals: [
      'do not ship bitmap mockups as the product implementation',
      'do not bypass DOM/code evidence, benchmark checks, or Pencil editability',
    ],
    required_outputs: [
      {
        id: 'primary_surface_reference_frame',
        purpose: `high-aesthetic frame for ${primaryReferenceSurface || 'the locked primary surface'}`,
      },
      {
        id: 'component_density_sheet',
        purpose: 'row, control, typography, icon, and spacing rhythm targets',
      },
      {
        id: 'state_polish_sheet',
        purpose: 'hover, selected, active, empty, loading, and error state treatment',
      },
    ],
    prompt_contract: [
      'Use the frozen layout decomposition and visual token contract as constraints.',
      'Optimize for product credibility, hierarchy, density, and material restraint.',
      'Return reference guidance that can be translated into editable Pencil/DOM primitives.',
    ],
    required_artifact: 'image_reference_set.json',
  };
}

function buildDesignSystemPack(input = {}, pack = {}, aestheticStandard = {}, imageReferenceGeneration = {}) {
  const requested = input.design_system_pack && typeof input.design_system_pack === 'object'
    ? input.design_system_pack
    : {};
  const componentFamilies = unique((Array.isArray(pack.component_inventory) ? pack.component_inventory : []).map((component) => component.family));
  const stateIds = unique((Array.isArray(pack.state_inventory) ? pack.state_inventory : []).map((state) => state.semantic_state));
  const requiredStates = unique([
    'default',
    'hover',
    'focus',
    'active',
    'selected',
    'disabled',
    'empty',
    'loading',
    'error',
    ...stateIds,
    ...(requested.component_policy?.required_states || []),
  ]);
  const allowedPrimitives = unique([
    'button',
    'input',
    'select',
    'tabs',
    'table',
    'list',
    'dialog',
    'sheet',
    'tooltip',
    'segmented_control',
    'calendar',
    'command_palette',
    'toast',
    ...componentFamilies,
    ...(requested.component_policy?.allowed_primitives || []),
  ]);

  return {
    version: 1,
    status: 'ready',
    profile: requested.profile || 'commercial_product_design_system_pack',
    summary: 'Generic corps design-system practice pack compiled from commercial and open generative-UI workflows.',
    practice_sources: [
      {
        id: 'lovable',
        adopted_practices: [
          'constrained modern web stack contract',
          'React component-library-first generation',
          'reusable design-system rules for tokens, components, and setup',
        ],
        non_goals: ['vendor runtime dependency', 'single hosted product lock-in'],
      },
      {
        id: 'open_design',
        adopted_practices: [
          'local-first artifact loop',
          'BYOK and swappable model/agent adapters',
          'skill plus design-system context as generation fuel',
        ],
        non_goals: ['copying any proprietary Claude Design UI shell'],
      },
      {
        id: 'open_codesign',
        adopted_practices: [
          'sandboxed preview before handoff',
          'region-level refinement instead of full re-prompting',
          'exportable artifacts with inline review affordances',
        ],
        non_goals: ['chat-only aesthetics without inspectable artifacts'],
      },
      {
        id: 'openui',
        adopted_practices: [
          'structured UI language mindset',
          'component whitelist drives generation prompts',
          'streaming-friendly UI contracts with typed component boundaries',
        ],
        non_goals: ['freeform untyped page generation as the default'],
      },
    ],
    stack_contract: {
      frontend: requested.stack_contract?.frontend || 'React/Vite/TypeScript-compatible editable UI output',
      styling: requested.stack_contract?.styling || 'Tailwind-style token rhythm with explicit design tokens',
      component_primitives: requested.stack_contract?.component_primitives || 'shadcn/Radix-style accessible primitives when no project design system is provided',
      portability: 'no mandatory vendor service; generated code and proof artifacts stay project-local',
    },
    component_policy: {
      allowed_primitives: allowedPrimitives,
      required_states: requiredStates,
      accessibility: [
        'keyboard reachable interactive controls',
        'visible focus state',
        'semantic labels for icon-only actions',
      ],
      generation_rule: 'Prompt, generate, and refine only through the allowed component primitives unless the change contract adds a scoped exception.',
    },
    visual_token_policy: {
      aesthetic_standard_id: aestheticStandard.id || 'high_aesthetic_product_surface',
      required_token_groups: [
        'color_roles',
        'typography_scale',
        'spacing_scale',
        'radius_range',
        'border_weight_tiers',
        'shadow_strength_tiers',
        'icon_density',
      ],
      anti_ai_slop_checks: aestheticStandard.anti_patterns || [],
    },
    preview_loop: {
      required_artifacts: [
        'image_reference_set.json',
        'visual_benchmark.json',
        'llm_design_review.json',
        'aesthetic_review.json',
      ],
      required_evidence: [
        'previewable editable artifact',
        'reference-backed screenshot or scenario evidence',
        'component/state coverage for loading, empty, error, selected, and hover/focus states',
      ],
      image_reference_required: imageReferenceGeneration.enabled !== false,
    },
    prompt_contract: [
      'Treat the design-system pack as a hard generation constraint, not optional inspiration.',
      'Prefer component-system consistency over novelty unless the change contract explicitly asks for expressive exploration.',
      'Refine by region/component/state; do not rewrite the whole surface for local visual issues.',
      'Keep all output editable, inspectable, and benchmarkable.',
    ],
  };
}

export async function generationContract(input = {}, context = {}) {
  const projectRoot = context.projectRoot || process.cwd();
  const changeId = context.changeId || input.change_id || null;
  if (!changeId) throw new Error('change_id is required for H2f.design.generation_contract');

  const reconstructionArtifact = readJsonFile(resolveChangePath(projectRoot, changeId, 'reconstruction_pack.json'), null);
  const referenceLockArtifact = readJsonFile(resolveChangePath(projectRoot, changeId, 'reference_surface_lock.json'), null);
  const pack = reconstructionArtifact?.reconstruction_pack || {};
  const lock = referenceLockArtifact?.reference_surface_lock || {};

  const layoutRegions = Array.isArray(pack.layout_map?.regions) ? pack.layout_map.regions : [];
  const componentInventory = Array.isArray(pack.component_inventory) ? pack.component_inventory : [];
  const componentBlueprint = Array.isArray(pack.component_blueprint) ? pack.component_blueprint : [];
  const stateInventory = Array.isArray(pack.state_inventory) ? pack.state_inventory : [];
  const primaryReferenceSurface = lock.primary_reference_surface || pack.primary_reference_surface || null;
  const generationStages = buildGenerationStages(componentBlueprint);
  const panelFocusSequence = buildPanelFocusSequence(componentBlueprint, generationStages);
  const aestheticStandard = buildAestheticStandard(input, pack);
  const imageReferenceGeneration = buildImageReferenceGeneration(input, primaryReferenceSurface);
  const designSystemPack = buildDesignSystemPack(input, pack, aestheticStandard, imageReferenceGeneration);

  const payload = {
    version: 1,
    phase: 'generation_contract',
    change_id: changeId,
    generated_at: new Date().toISOString(),
    status: 'ready',
    summary: 'Generation contract converted competitor decomposition into pre-generation constraints.',
    generation_contract: {
      status: 'ready',
      primary_reference_surface: primaryReferenceSurface,
      input_artifacts: [
        'competitor_reconstruction_review.json',
        'reference_surface_lock.json',
        'reconstruction_pack.json',
      ],
      layout_constraints: {
        required_regions: layoutRegions.map((region) => region.id),
        anchor_rules: unique((pack.layout_map?.anchors || []).map((anchor) => anchor.id)),
        composition_rules: [
          'Preserve region ordering implied by the primary reference surface.',
          'Do not introduce orphan regions outside the locked decomposition.',
        ],
      },
      component_constraints: {
        required_families: unique(componentInventory.map((component) => component.family)),
        mapping_rules: componentInventory.map((component) => ({
          component_id: component.id,
          semantic_role: component.role,
          required_states: component.required_states || [],
        })),
        component_blueprint: componentBlueprint.map((component) => ({
          id: component.id,
          module: component.module,
          primitive_role: component.primitive_role,
          hierarchy_role: component.hierarchy_role,
          density_tier: component.density_tier,
          geometry_profile: component.geometry_profile,
          token_profile: component.token_profile,
          stage_bucket: component.stage_bucket,
          repair_handles: component.repair_handles || [],
        })),
        staged_generation: {
          mode: 'component_local',
          preserve_unlisted_components: true,
          stages: generationStages,
        },
        panel_focus_sequence: panelFocusSequence,
      },
      state_constraints: {
        required_states: stateInventory.map((state) => state.semantic_state),
        state_family_contracts: stateInventory.map((state) => ({
          state_id: state.id,
          semantic_state: state.semantic_state,
          target_components: state.target_components || [],
        })),
      },
      visual_constraints: {
        aesthetic_standard: aestheticStandard,
        image_reference_generation: imageReferenceGeneration,
        design_system_pack: {
          required_artifact: 'design_system_pack.json',
          profile: designSystemPack.profile,
          practice_sources: designSystemPack.practice_sources.map((source) => source.id),
          component_policy: {
            allowed_primitives: designSystemPack.component_policy.allowed_primitives,
            required_states: designSystemPack.component_policy.required_states,
          },
        },
        pencil_role_boundary: {
          role: 'editable_surface_assembly_and_targeted_refinement',
          sufficient_alone_for_high_aesthetic: false,
          guidance: [
            'Pencil should assemble and refine editable product surfaces from the frozen contract and visual references.',
            'For high-aesthetic UI, use image-generation reference frames as taste and material targets, then verify through DOM/canvas benchmark evidence.',
          ],
        },
        token_contract: {
          color_roles: {
            surface: '#f7f8fb',
            text_primary: '#1f2733',
          },
          spacing_scale: {
            base: 4,
            allowed_multipliers: [1, 2, 3, 4, 6],
            tolerance: 1,
          },
          font_weights_required: [400],
          radius_range: { min: 0, max: 24 },
        },
        geometry_hints: {
          row_height_density: {
            compact: 'prefer 32-40px rhythm before decorative padding',
            dense: 'prefer 20-32px rhythm for repeated list/grid items',
            comfortable: 'use only where the reference truly expands interaction space',
          },
          alignment_rules: [
            'Align repeated primitives to a shared row or column rhythm before styling.',
            'Keep primary list/calendar primitives width-stable across siblings.',
          ],
          primitive_profiles: unique(componentBlueprint.map((component) => component.geometry_profile)).map((profile) => ({
            id: profile,
            source: 'component_blueprint',
          })),
        },
        token_hints: {
          primitive_token_profiles: unique(componentBlueprint.map((component) => component.token_profile)).map((profile) => ({
            id: profile,
            source: 'component_blueprint',
          })),
          typography_roles: unique(componentBlueprint.map((component) => component.token_hints?.typography_role)),
          spacing_roles: unique(componentBlueprint.map((component) => component.token_hints?.spacing_role)),
          emphasis_roles: unique(componentBlueprint.map((component) => component.token_hints?.emphasis_role)),
        },
        density_rules: [
          'Match reference workbench density before adding decorative whitespace.',
          'Preserve detail-vs-list hierarchy from the reference surface.',
          'Prefer component-local tightening over global scale changes.',
        ],
        anti_drift_rules: pack.visual_token_map?.anti_drift_rules || [],
      },
      repair_policy: {
        mode: 'component_target_only',
        preserve_unlisted_components: true,
        prohibit_whole_page_redraw: true,
      },
      downstream_inputs: {
        benchmark_seed: {
          required_modules: unique(componentInventory.map((component) => component.role)),
          target_surfaces: unique((pack.surface_map || []).map((surface) => surface.surface_id)),
          primary_reference_surface: primaryReferenceSurface,
          required_states: stateInventory.map((state) => state.semantic_state),
        },
        pencil_inputs: [
          'generation_contract.json',
          'design_system_pack.json',
          'reconstruction_pack.json',
          'reference_surface_lock.json',
        ],
        component_generation_plan: generationStages,
        panel_generation_priority: panelFocusSequence,
      },
    },
  };

  const artifactPath = resolveChangePath(projectRoot, changeId, 'generation_contract.json');
  writeJsonFile(resolveChangePath(projectRoot, changeId, 'design_system_pack.json'), designSystemPack);
  writeJsonFile(artifactPath, payload);
  return {
    ok: Boolean(primaryReferenceSurface) && layoutRegions.length > 0 && componentInventory.length > 0,
    status: 'ready',
    output_file: artifactPath,
    payload,
  };
}

export default generationContract;
