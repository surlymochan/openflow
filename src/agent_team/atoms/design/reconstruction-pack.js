import { resolveChangePath, writeJsonFile } from '../../../core/change-artifacts.js';

function list(inputValue) {
  return Array.isArray(inputValue) ? inputValue.filter(Boolean) : [];
}

function titleize(value) {
  return String(value || '')
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function inferComponentFamily(moduleName) {
  if (moduleName.includes('detail')) return 'detail_region';
  if (moduleName.includes('calendar')) return 'planner_region';
  if (moduleName.includes('nav') || moduleName.includes('sidebar')) return 'navigation_region';
  return 'workbench_region';
}

function blueprintTemplatesForModule(moduleName) {
  if (moduleName.includes('calendar')) {
    return [
      { primitive_role: 'toolbar_group', hierarchy_role: 'supporting', density_tier: 'compact', geometry_profile: 'horizontal_controls', token_profile: 'toolbar_controls' },
      { primitive_role: 'grid_header', hierarchy_role: 'supporting', density_tier: 'compact', geometry_profile: 'calendar_header', token_profile: 'header_labels' },
      { primitive_role: 'grid_cell', hierarchy_role: 'primary', density_tier: 'dense', geometry_profile: 'calendar_cell', token_profile: 'calendar_surface' },
      { primitive_role: 'status_chip', hierarchy_role: 'primary', density_tier: 'dense', geometry_profile: 'chip_inline', token_profile: 'event_chip' },
      { primitive_role: 'selection_badge', hierarchy_role: 'supporting', density_tier: 'compact', geometry_profile: 'badge_compact', token_profile: 'selection_badge' },
    ];
  }
  if (moduleName.includes('detail')) {
    return [
      { primitive_role: 'panel_header', hierarchy_role: 'supporting', density_tier: 'compact', geometry_profile: 'panel_header', token_profile: 'section_heading' },
      { primitive_role: 'text_block', hierarchy_role: 'primary', density_tier: 'comfortable', geometry_profile: 'stacked_fields', token_profile: 'detail_fields' },
      { primitive_role: 'meta_line', hierarchy_role: 'supporting', density_tier: 'compact', geometry_profile: 'meta_row', token_profile: 'detail_meta' },
      { primitive_role: 'input_block', hierarchy_role: 'primary', density_tier: 'comfortable', geometry_profile: 'form_stack', token_profile: 'detail_inputs' },
    ];
  }
  return [
    { primitive_role: 'toolbar_group', hierarchy_role: 'supporting', density_tier: 'compact', geometry_profile: 'horizontal_controls', token_profile: 'toolbar_controls' },
    { primitive_role: 'input_block', hierarchy_role: 'supporting', density_tier: 'compact', geometry_profile: 'quick_add_row', token_profile: 'quick_add' },
    { primitive_role: 'list_row', hierarchy_role: 'primary', density_tier: 'dense', geometry_profile: 'row_compact', token_profile: 'list_row_surface' },
    { primitive_role: 'selection_badge', hierarchy_role: 'supporting', density_tier: 'compact', geometry_profile: 'checkbox_compact', token_profile: 'selection_badge' },
    { primitive_role: 'meta_line', hierarchy_role: 'supporting', density_tier: 'compact', geometry_profile: 'meta_row', token_profile: 'meta_text' },
  ];
}

function buildComponentBlueprint(requiredModules, primaryJourneys) {
  return requiredModules.flatMap((moduleName, moduleIndex) => {
    const templates = blueprintTemplatesForModule(moduleName);
    return templates.map((template, templateIndex) => ({
      id: `${moduleName}_${template.primitive_role}_${templateIndex + 1}`,
      component_id: `${moduleName}_workbench_component`,
      module: moduleName,
      primitive_role: template.primitive_role,
      hierarchy_role: template.hierarchy_role,
      density_tier: template.density_tier,
      geometry_profile: template.geometry_profile,
      token_profile: template.token_profile,
      build_priority: template.hierarchy_role === 'primary' ? 'high' : 'medium',
      expected_states: primaryJourneys.map((journey) => `${journey}_state`),
      geometry_hints: {
        alignment_axis: template.primitive_role === 'toolbar_group' ? 'horizontal' : 'vertical',
        width_behavior: template.primitive_role === 'grid_cell' ? 'fractional' : template.primitive_role === 'list_row' ? 'fill_parent' : 'intrinsic_or_fill',
        height_density: template.density_tier,
        padding_role: template.primitive_role === 'list_row' ? 'row_padding' : template.primitive_role === 'grid_cell' ? 'cell_padding' : 'control_padding',
      },
      token_hints: {
        typography_role: template.primitive_role === 'list_row' ? 'list_body' : template.primitive_role === 'grid_header' ? 'section_label' : 'detail_meta',
        emphasis_role: template.hierarchy_role,
        radius_role: template.primitive_role === 'status_chip' ? 'chip_radius' : template.primitive_role === 'input_block' ? 'control_radius' : 'surface_radius',
        spacing_role: template.primitive_role === 'meta_line' ? 'meta_gap' : 'component_gap',
      },
      local_relationships: [
        templateIndex > 0 ? { type: 'follows', target: `${moduleName}_${templates[templateIndex - 1].primitive_role}_${templateIndex}` } : null,
        { type: 'belongs_to', target: `${moduleName}_workbench_component` },
      ].filter(Boolean),
      stage_bucket: moduleIndex === 0 ? (template.hierarchy_role === 'primary' ? 'primary_focus' : 'shell') : (template.hierarchy_role === 'primary' ? 'secondary_focus' : 'polish'),
      repair_handles: [
        `${template.primitive_role}_geometry`,
        `${template.primitive_role}_tokens`,
      ],
    }));
  });
}

function buildRelationshipGraph(layoutRegions, componentBlueprint) {
  const regionEdges = layoutRegions.map((region, index) => ({
    id: `${region.id}_region_order`,
    type: 'region_order',
    source: region.id,
    target: index === 0 ? null : layoutRegions[index - 1].id,
    detail: index === 0 ? 'leading_region' : 'follows_previous_region',
  }));

  const componentEdges = componentBlueprint.flatMap((component) => [
    {
      id: `${component.id}_belongs_to`,
      type: 'belongs_to_region',
      source: component.id,
      target: component.module,
      detail: component.hierarchy_role,
    },
    ...component.local_relationships.map((relationship, index) => ({
      id: `${component.id}_local_${index + 1}`,
      type: relationship.type,
      source: component.id,
      target: relationship.target,
      detail: component.stage_bucket,
    })),
  ]);

  return [...regionEdges, ...componentEdges];
}

export async function reconstructionPack(input = {}, context = {}) {
  const projectRoot = context.projectRoot || process.cwd();
  const changeId = context.changeId || input.change_id || null;
  if (!changeId) throw new Error('change_id is required for H2e.design.reconstruction_pack');

  const targetSurfaces = list(input.target_surfaces);
  const requiredModules = list(input.required_modules);
  const primaryJourneys = list(input.primary_journeys);
  const businessLogicInvariants = list(input.business_logic_invariants);
  const primaryReferenceSurface = typeof input.primary_reference_surface === 'string' && input.primary_reference_surface.trim()
    ? input.primary_reference_surface.trim()
    : (targetSurfaces[0] || null);

  const surfaceMap = targetSurfaces.map((surface, index) => ({
    surface_id: surface,
    priority: surface === primaryReferenceSurface ? 'primary' : 'supporting',
    role: surface === primaryReferenceSurface ? 'reference_anchor' : 'support_surface',
    target_modules: requiredModules,
    target_journeys: primaryJourneys,
    target_states: primaryJourneys.map((journey) => `${journey}_state`),
    order: index + 1,
  }));

  const layoutRegions = requiredModules.map((moduleName, index) => ({
    id: moduleName,
    role: 'required_region',
    relative_position: index === 0 ? 'leading' : index === requiredModules.length - 1 ? 'trailing' : 'center',
    required_presence: true,
    target_modules: [moduleName],
  }));

  const componentInventory = requiredModules.map((moduleName) => ({
    id: `${moduleName}_workbench_component`,
    role: moduleName,
    family: inferComponentFamily(moduleName),
    density: 'match_reference',
    required_states: primaryJourneys.map((journey) => `${journey}_state`),
  }));
  const componentBlueprint = buildComponentBlueprint(requiredModules, primaryJourneys);
  const relationshipGraph = buildRelationshipGraph(layoutRegions, componentBlueprint);

  const stateInventory = primaryJourneys.map((journey) => ({
    id: `${journey}_state`,
    semantic_state: journey,
    trigger: 'primary_journey',
    target_components: requiredModules,
  }));

  const visualTokenMap = {
    typography_roles: ['display', 'section_label', 'list_body', 'detail_meta'],
    spacing_roles: ['panel_gap', 'card_padding', 'toolbar_gap'],
    color_roles: ['surface', 'surface_emphasis', 'text_primary', 'text_muted', 'accent'],
    elevation_roles: ['base', 'raised', 'interactive'],
    anti_drift_rules: [
      'Do not invent new panel families not present in the reference surface lock.',
      'Do not swap primary and supporting surfaces during generation.',
    ],
  };

  const referenceIntermediateModel = {
    reference_dom_regions: surfaceMap.map((surface, index) => ({
      id: `${surface.surface_id}_region`,
      source_surface: surface.surface_id,
      semantic_role: surface.role,
      expected_order: index + 1,
    })),
    reference_component_roles: componentInventory.map((component) => ({
      component_id: component.id,
      family: component.family,
      semantic_role: component.role,
    })),
    reference_component_blueprint: componentBlueprint.map((component) => ({
      component_id: component.id,
      primitive_role: component.primitive_role,
      hierarchy_role: component.hierarchy_role,
      geometry_profile: component.geometry_profile,
      token_profile: component.token_profile,
    })),
    reference_state_matrix: stateInventory.map((state) => ({
      state_id: state.id,
      semantic_state: state.semantic_state,
      target_components: state.target_components,
    })),
    relationship_graph: relationshipGraph,
    reference_token_summary: {
      visual_token_roles: visualTokenMap,
      protected_invariants: businessLogicInvariants,
    },
  };

  const payload = {
    version: 1,
    phase: 'reconstruction_pack',
    change_id: changeId,
    generated_at: new Date().toISOString(),
    status: 'ready',
    summary: 'Structured competitor decomposition pack prepared for generation-time use.',
    reconstruction_pack: {
      status: 'ready',
      primary_reference_surface: primaryReferenceSurface,
      surface_map: surfaceMap,
      layout_map: {
        regions: layoutRegions,
        anchors: layoutRegions.map((region, index) => ({
          id: `${region.id}_anchor`,
          anchor_role: region.role,
          relative_to: index === 0 ? null : layoutRegions[index - 1].id,
        })),
      },
      component_inventory: componentInventory,
      component_blueprint: componentBlueprint,
      state_inventory: stateInventory,
      visual_token_map: visualTokenMap,
      reference_intermediate_model: referenceIntermediateModel,
      decomposition_summary: `Prepared ${surfaceMap.length} surfaces, ${layoutRegions.length} layout regions, ${componentInventory.length} component families, ${componentBlueprint.length} component primitives, and ${stateInventory.length} primary states.`,
      decomposition_labels: requiredModules.map((moduleName) => titleize(moduleName)),
    },
  };

  const artifactPath = resolveChangePath(projectRoot, changeId, 'reconstruction_pack.json');
  writeJsonFile(artifactPath, payload);
  return {
    ok: Boolean(primaryReferenceSurface) && surfaceMap.length > 0 && componentInventory.length > 0,
    status: 'ready',
    output_file: artifactPath,
    payload,
  };
}

export default reconstructionPack;
