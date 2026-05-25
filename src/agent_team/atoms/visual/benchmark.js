import { existsSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

import { readJsonFile, resolveChangePath, writeJsonFile } from '../../../core/change-artifacts.js';
import { computeImageDiffMetrics } from './image-diff.js';
import { exportDomRectsFromSnapshot } from './dom-rect-export.js';
import { capturePageEvidence } from './page-evidence-capture.js';
import { renderVisualBenchmarkReport } from './visual-report.js';
import { exportVisualTokensFromSnapshot } from './visual-token-export.js';

const DEFAULT_THRESHOLDS = {
  structural_similarity_min: 0.9,
  layout_shift_score_max: 0.08,
  pixel_diff_ratio_max: 0.12,
};

function resolveEvidencePath(projectRoot, filePath) {
  if (!filePath) return null;
  return isAbsolute(filePath) ? filePath : resolve(projectRoot, filePath);
}

function parseReferenceScenarios(input) {
  if (Array.isArray(input.reference_scenarios)) return input.reference_scenarios;
  const raw = input.reference_scenarios_json;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseObjectLike(value) {
  if (!value) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function parseArrayLike(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseViewportVariants(input = {}) {
  const raw = input.viewport_variants_json ?? input.viewport_variants;
  return parseArrayLike(raw)
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry, index) => ({
      id: typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : `viewport-${index + 1}`,
      viewport: parseObjectLike(entry.viewport) || (entry.viewport && typeof entry.viewport === 'object' ? entry.viewport : null),
      platform_profile: typeof entry.platform_profile === 'string' ? entry.platform_profile : null,
      reference_image: typeof entry.reference_image === 'string' ? entry.reference_image : null,
      capture_states: parseArrayLike(entry.capture_states_json).length > 0 ? parseArrayLike(entry.capture_states_json) : (Array.isArray(entry.capture_states) ? entry.capture_states : []),
    }));
}

function buildImplicitReferenceScenarios(input = {}) {
  if (!input.capture_url || !input.reference_image) return [];
  const viewportVariants = parseViewportVariants(input);
  if (viewportVariants.length > 0) {
    return viewportVariants.map((variant, index) => ({
      id: variant.id || `captured-viewport-${index + 1}`,
      viewport: variant.viewport || parseObjectLike(input.viewport) || {
        width: Number.isFinite(Number(input.width)) ? Number(input.width) : 1440,
        height: Number.isFinite(Number(input.height)) ? Number(input.height) : 900,
      },
      capture_url: input.capture_url,
      platform_profile: variant.platform_profile || input.platform_profile || null,
      reference_image: variant.reference_image || input.reference_image,
      layout_contract: parseObjectLike(input.layout_contract) || parseObjectLike(input.layout_contract_json) || null,
      visual_token_contract: parseObjectLike(input.visual_token_contract) || parseObjectLike(input.visual_token_contract_json) || null,
      structure_checks: Array.isArray(input.structure_checks) ? input.structure_checks : [],
      capture_states: variant.capture_states.length > 0
        ? variant.capture_states
        : (parseArrayLike(input.capture_states_json).length > 0 ? parseArrayLike(input.capture_states_json) : (Array.isArray(input.capture_states) ? input.capture_states : [])),
      auto_discover_states: input.auto_discover_states === true,
      state_limit: Number.isFinite(Number(input.state_limit)) ? Number(input.state_limit) : null,
      panel_attr: input.panel_attr || 'data-panel',
      panel_selector: input.panel_selector || null,
      wait_ms: Number.isFinite(Number(input.wait_ms)) ? Number(input.wait_ms) : 250,
    }));
  }
  return [
    {
      id: input.capture_id || 'captured-main',
      viewport: parseObjectLike(input.viewport) || {
        width: Number.isFinite(Number(input.width)) ? Number(input.width) : 1440,
        height: Number.isFinite(Number(input.height)) ? Number(input.height) : 900,
      },
      capture_url: input.capture_url,
      platform_profile: input.platform_profile || null,
      reference_image: input.reference_image,
      layout_contract: parseObjectLike(input.layout_contract) || parseObjectLike(input.layout_contract_json) || null,
      visual_token_contract: parseObjectLike(input.visual_token_contract) || parseObjectLike(input.visual_token_contract_json) || null,
      structure_checks: Array.isArray(input.structure_checks) ? input.structure_checks : [],
      capture_states: parseArrayLike(input.capture_states_json).length > 0 ? parseArrayLike(input.capture_states_json) : (Array.isArray(input.capture_states) ? input.capture_states : []),
      auto_discover_states: input.auto_discover_states === true,
      state_limit: Number.isFinite(Number(input.state_limit)) ? Number(input.state_limit) : null,
      panel_attr: input.panel_attr || 'data-panel',
      panel_selector: input.panel_selector || null,
      wait_ms: Number.isFinite(Number(input.wait_ms)) ? Number(input.wait_ms) : 250,
    },
  ];
}

function determineBenchmarkInputMode(input = {}, explicitReferences = [], implicitReferences = []) {
  if (explicitReferences.length > 0) return 'reference_scenarios';
  if (implicitReferences.length > 0) return 'capture_url';
  return 'missing';
}

function loadGenerationDefaults(projectRoot, changeId) {
  if (!changeId) return {};
  const generationArtifact = readJsonFile(resolveChangePath(projectRoot, changeId, 'generation_contract.json'), null);
  const reconstructionArtifact = readJsonFile(resolveChangePath(projectRoot, changeId, 'reconstruction_pack.json'), null);
  const generationContract = generationArtifact?.generation_contract || null;
  const reconstructionPack = reconstructionArtifact?.reconstruction_pack || null;
  if (!generationContract && !reconstructionPack) return {};

  const requiredRegions = Array.isArray(generationContract?.layout_constraints?.required_regions)
    ? generationContract.layout_constraints.required_regions
    : Array.isArray(reconstructionPack?.layout_map?.regions)
      ? reconstructionPack.layout_map.regions.map((region) => region?.id).filter(Boolean)
      : [];
  const anchorRules = Array.isArray(reconstructionPack?.layout_map?.anchors)
    ? reconstructionPack.layout_map.anchors
      .filter((anchor) => anchor?.id && anchor?.relative_to)
      .map((anchor) => ({
        id: anchor.id,
        from: anchor.id.replace(/_anchor$/, ''),
        to: anchor.relative_to,
        relation: 'right_of',
      }))
    : [];

  const layoutContract = requiredRegions.length > 0
    ? {
        expected_columns: requiredRegions.length,
        required_panels: requiredRegions,
        anchor_relations: anchorRules,
        min_main_width: 480,
      }
    : null;

  const visualTokenContract = generationContract?.visual_constraints?.token_contract || null;
  return {
    layout_contract: layoutContract,
    visual_token_contract: visualTokenContract,
  };
}

function applyGenerationDefaults(scenario = {}, defaults = {}) {
  const hasLayoutEvidence = Boolean(
    scenario.capture_url
    || scenario.observed_layout
    || scenario.layout_observations,
  );
  const hasTokenEvidence = Boolean(
    scenario.capture_url
    || scenario.observed_visual_tokens,
  );
  return {
    ...scenario,
    layout_contract: scenario.layout_contract || (hasLayoutEvidence ? defaults.layout_contract : null) || null,
    visual_token_contract: scenario.visual_token_contract || (hasTokenEvidence ? defaults.visual_token_contract : null) || null,
  };
}

function normalizeStructureChecks(checks) {
  if (!Array.isArray(checks)) return [];
  return checks.map((check, index) => {
    const status = check?.status || (check?.passed === true ? 'pass' : 'needs_follow_up');
    return {
      id: check?.id || `structure-check-${index + 1}`,
      status,
      detail: check?.detail || null,
    };
  });
}

function makeStructureCheck(id, passed, detail) {
  return {
    id,
    status: passed ? 'pass' : 'needs_follow_up',
    detail,
  };
}

function normalizeStringList(values) {
  if (!Array.isArray(values)) return [];
  return values
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => value.trim().toLowerCase());
}

function normalizeNumberList(values) {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
}

function numericSpread(values) {
  const normalized = normalizeNumberList(values);
  if (normalized.length === 0) return null;
  return Math.max(...normalized) - Math.min(...normalized);
}

function normalizeColorValue(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  if (/^#[0-9a-f]{3}$/.test(trimmed)) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
  }
  if (/^#[0-9a-f]{6}$/.test(trimmed)) return trimmed;
  const rgbMatch = trimmed.match(/^rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    const [, r, g, b] = rgbMatch;
    const channels = [r, g, b].map((channel) => {
      const valueNumber = Math.max(0, Math.min(255, Number(channel)));
      return valueNumber.toString(16).padStart(2, '0');
    });
    return `#${channels.join('')}`;
  }
  return trimmed;
}

function normalizeColorMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, color]) => [key, normalizeColorValue(color)])
      .filter(([, color]) => Boolean(color)),
  );
}

function makeTokenCheck(id, passed, detail) {
  return {
    id,
    status: passed ? 'pass' : 'needs_follow_up',
    detail,
  };
}

function normalizeViewportMetrics(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const safeAreaTop = Number(value.safe_area_top);
  const safeAreaBottom = Number(value.safe_area_bottom);
  const keyboardInsetBottom = Number(value.keyboard_inset_bottom);
  return {
    safe_area_top: Number.isFinite(safeAreaTop) ? safeAreaTop : null,
    safe_area_bottom: Number.isFinite(safeAreaBottom) ? safeAreaBottom : null,
    keyboard_inset_bottom: Number.isFinite(keyboardInsetBottom) ? keyboardInsetBottom : null,
  };
}

function makeStateContractCheck(id, passed, detail) {
  return {
    id,
    status: passed ? 'pass' : 'needs_follow_up',
    detail,
  };
}

function makeMatrixCheck(id, passed, detail) {
  return {
    id,
    status: passed ? 'pass' : 'needs_follow_up',
    detail,
  };
}

function evaluateVisualTokenContract(contract = {}, observed = {}) {
  if (!contract || typeof contract !== 'object') return [];
  const checks = [];

  const requiredFonts = normalizeStringList(contract.font_families_required);
  const observedFonts = normalizeStringList(observed.font_families);
  if (requiredFonts.length > 0) {
    const missing = requiredFonts.filter((font) => !observedFonts.includes(font));
    checks.push(makeTokenCheck(
      'token-font-families',
      missing.length === 0,
      missing.length === 0
        ? `required fonts present: ${requiredFonts.join(', ')}`
        : `missing fonts: ${missing.join(', ')}; observed ${observedFonts.join(', ') || 'none'}`,
    ));
  }

  const requiredWeights = normalizeNumberList(contract.font_weights_required);
  const observedWeights = normalizeNumberList(observed.font_weights);
  if (requiredWeights.length > 0) {
    const missing = requiredWeights.filter((weight) => !observedWeights.includes(weight));
    checks.push(makeTokenCheck(
      'token-font-weights',
      missing.length === 0,
      missing.length === 0
        ? `required weights present: ${requiredWeights.join(', ')}`
        : `missing weights: ${missing.join(', ')}; observed ${observedWeights.join(', ') || 'none'}`,
    ));
  }

  const textSizes = normalizeNumberList(observed.text_sizes);
  if (contract.text_size_range && typeof contract.text_size_range === 'object') {
    const min = Number(contract.text_size_range.min);
    const max = Number(contract.text_size_range.max);
    const observedMin = textSizes.length > 0 ? Math.min(...textSizes) : null;
    const observedMax = textSizes.length > 0 ? Math.max(...textSizes) : null;
    const passed = observedMin !== null
      && observedMax !== null
      && (!Number.isFinite(min) || observedMin >= min)
      && (!Number.isFinite(max) || observedMax <= max);
    checks.push(makeTokenCheck(
      'token-text-size-range',
      passed,
      `expected min/max within ${Number.isFinite(min) ? min : '-inf'}..${Number.isFinite(max) ? max : '+inf'}, observed ${observedMin ?? 'missing'}..${observedMax ?? 'missing'}`,
    ));
  }

  const lineHeights = normalizeNumberList(observed.line_heights);
  if (contract.line_height_range && typeof contract.line_height_range === 'object') {
    const min = Number(contract.line_height_range.min);
    const max = Number(contract.line_height_range.max);
    const observedMin = lineHeights.length > 0 ? Math.min(...lineHeights) : null;
    const observedMax = lineHeights.length > 0 ? Math.max(...lineHeights) : null;
    const passed = observedMin !== null
      && observedMax !== null
      && (!Number.isFinite(min) || observedMin >= min)
      && (!Number.isFinite(max) || observedMax <= max);
    checks.push(makeTokenCheck(
      'token-line-height-range',
      passed,
      `expected min/max within ${Number.isFinite(min) ? min : '-inf'}..${Number.isFinite(max) ? max : '+inf'}, observed ${observedMin ?? 'missing'}..${observedMax ?? 'missing'}`,
    ));
  }

  const letterSpacings = normalizeNumberList(observed.letter_spacings);
  if (contract.letter_spacing_range && typeof contract.letter_spacing_range === 'object') {
    const min = Number(contract.letter_spacing_range.min);
    const max = Number(contract.letter_spacing_range.max);
    const observedMin = letterSpacings.length > 0 ? Math.min(...letterSpacings) : null;
    const observedMax = letterSpacings.length > 0 ? Math.max(...letterSpacings) : null;
    const passed = observedMin !== null
      && observedMax !== null
      && (!Number.isFinite(min) || observedMin >= min)
      && (!Number.isFinite(max) || observedMax <= max);
    checks.push(makeTokenCheck(
      'token-letter-spacing-range',
      passed,
      `expected min/max within ${Number.isFinite(min) ? min : '-inf'}..${Number.isFinite(max) ? max : '+inf'}, observed ${observedMin ?? 'missing'}..${observedMax ?? 'missing'}`,
    ));
  }

  const radiusValues = normalizeNumberList(observed.radius_values);
  if (contract.radius_range && typeof contract.radius_range === 'object') {
    const min = Number(contract.radius_range.min);
    const max = Number(contract.radius_range.max);
    const observedMin = radiusValues.length > 0 ? Math.min(...radiusValues) : null;
    const observedMax = radiusValues.length > 0 ? Math.max(...radiusValues) : null;
    const passed = observedMin !== null
      && observedMax !== null
      && (!Number.isFinite(min) || observedMin >= min)
      && (!Number.isFinite(max) || observedMax <= max);
    checks.push(makeTokenCheck(
      'token-radius-range',
      passed,
      `expected min/max within ${Number.isFinite(min) ? min : '-inf'}..${Number.isFinite(max) ? max : '+inf'}, observed ${observedMin ?? 'missing'}..${observedMax ?? 'missing'}`,
    ));
  }

  const borderWidths = normalizeNumberList(observed.border_widths);
  if (contract.border_width_range && typeof contract.border_width_range === 'object') {
    const min = Number(contract.border_width_range.min);
    const max = Number(contract.border_width_range.max);
    const observedMin = borderWidths.length > 0 ? Math.min(...borderWidths) : null;
    const observedMax = borderWidths.length > 0 ? Math.max(...borderWidths) : null;
    const passed = observedMin !== null
      && observedMax !== null
      && (!Number.isFinite(min) || observedMin >= min)
      && (!Number.isFinite(max) || observedMax <= max);
    checks.push(makeTokenCheck(
      'token-border-width-range',
      passed,
      `expected min/max within ${Number.isFinite(min) ? min : '-inf'}..${Number.isFinite(max) ? max : '+inf'}, observed ${observedMin ?? 'missing'}..${observedMax ?? 'missing'}`,
    ));
  }

  const requiredBorderStyles = normalizeStringList(contract.border_styles_required);
  const observedBorderStyles = normalizeStringList(observed.border_styles);
  if (requiredBorderStyles.length > 0) {
    const missing = requiredBorderStyles.filter((style) => !observedBorderStyles.includes(style));
    checks.push(makeTokenCheck(
      'token-border-styles',
      missing.length === 0,
      missing.length === 0
        ? `required border styles present: ${requiredBorderStyles.join(', ')}`
        : `missing border styles: ${missing.join(', ')}; observed ${observedBorderStyles.join(', ') || 'none'}`,
    ));
  }

  const requiredColors = normalizeColorMap(contract.color_roles);
  const observedColors = normalizeColorMap(observed.color_roles);
  if (Object.keys(requiredColors).length > 0) {
    const mismatches = Object.entries(requiredColors)
      .filter(([role, color]) => observedColors[role] !== color)
      .map(([role, color]) => `${role}: expected ${color}, observed ${observedColors[role] || 'missing'}`);
    checks.push(makeTokenCheck(
      'token-color-roles',
      mismatches.length === 0,
      mismatches.length === 0
        ? `required color roles matched: ${Object.keys(requiredColors).join(', ')}`
        : mismatches.join('; '),
    ));
  }

  const spacingValues = normalizeNumberList(observed.spacing_values);
  if (contract.spacing_scale && typeof contract.spacing_scale === 'object') {
    const base = Number(contract.spacing_scale.base);
    const allowedMultipliers = normalizeNumberList(contract.spacing_scale.allowed_multipliers);
    const tolerance = Number.isFinite(Number(contract.spacing_scale.tolerance))
      ? Number(contract.spacing_scale.tolerance)
      : 0.5;
    const invalidValues = !Number.isFinite(base) || base <= 0
      ? spacingValues
      : spacingValues.filter((value) => {
          if (value === 0) return false;
          if (allowedMultipliers.length === 0) return false;
          return !allowedMultipliers.some((multiplier) => Math.abs(value - (base * multiplier)) <= tolerance);
        });
    checks.push(makeTokenCheck(
      'token-spacing-scale',
      Number.isFinite(base) && base > 0 && invalidValues.length === 0,
      !Number.isFinite(base) || base <= 0
        ? 'spacing base missing or invalid'
        : invalidValues.length === 0
          ? `spacing values fit base ${base} with multipliers ${allowedMultipliers.join(', ')}`
          : `invalid spacing values: ${invalidValues.join(', ')}`,
    ));
  }

  const requiredShadowSignatures = normalizeStringList(contract.shadow_signatures_required);
  const observedShadowSignatures = normalizeStringList(observed.shadow_signatures);
  if (requiredShadowSignatures.length > 0) {
    const missing = requiredShadowSignatures.filter((signature) => !observedShadowSignatures.includes(signature));
    checks.push(makeTokenCheck(
      'token-shadow-signatures',
      missing.length === 0,
      missing.length === 0
        ? `required shadow signatures present: ${requiredShadowSignatures.join(', ')}`
        : `missing shadow signatures: ${missing.join(', ')}; observed ${observedShadowSignatures.join(', ') || 'none'}`,
    ));
  }

  const iconDensityValues = normalizeNumberList(observed.icon_density_values);
  if (contract.icon_density_range && typeof contract.icon_density_range === 'object') {
    const min = Number(contract.icon_density_range.min);
    const max = Number(contract.icon_density_range.max);
    const observedMin = iconDensityValues.length > 0 ? Math.min(...iconDensityValues) : null;
    const observedMax = iconDensityValues.length > 0 ? Math.max(...iconDensityValues) : null;
    const passed = observedMin !== null
      && observedMax !== null
      && (!Number.isFinite(min) || observedMin >= min)
      && (!Number.isFinite(max) || observedMax <= max);
    checks.push(makeTokenCheck(
      'token-icon-density-range',
      passed,
      `expected min/max within ${Number.isFinite(min) ? min : '-inf'}..${Number.isFinite(max) ? max : '+inf'}, observed ${observedMin ?? 'missing'}..${observedMax ?? 'missing'}`,
    ));
  }

  const iconSizeValues = normalizeNumberList(observed.icon_size_values);
  if (contract.icon_size_range && typeof contract.icon_size_range === 'object') {
    const min = Number(contract.icon_size_range.min);
    const max = Number(contract.icon_size_range.max);
    const observedMin = iconSizeValues.length > 0 ? Math.min(...iconSizeValues) : null;
    const observedMax = iconSizeValues.length > 0 ? Math.max(...iconSizeValues) : null;
    const passed = observedMin !== null
      && observedMax !== null
      && (!Number.isFinite(min) || observedMin >= min)
      && (!Number.isFinite(max) || observedMax <= max);
    checks.push(makeTokenCheck(
      'token-icon-size-range',
      passed,
      `expected min/max within ${Number.isFinite(min) ? min : '-inf'}..${Number.isFinite(max) ? max : '+inf'}, observed ${observedMin ?? 'missing'}..${observedMax ?? 'missing'}`,
    ));
  }

  const touchTargetSizes = normalizeNumberList(observed.touch_target_sizes);
  if (Number.isFinite(Number(contract.min_touch_target_size))) {
    const minTouchTarget = Number(contract.min_touch_target_size);
    const observedMin = touchTargetSizes.length > 0 ? Math.min(...touchTargetSizes) : null;
    checks.push(makeTokenCheck(
      'token-min-touch-target-size',
      observedMin !== null && observedMin >= minTouchTarget,
      `expected min touch target >= ${minTouchTarget}, observed ${observedMin ?? 'missing'}`,
    ));
  }

  if (contract.bottom_sheet_handle_required === true) {
    checks.push(makeTokenCheck(
      'token-bottom-sheet-handle',
      observed.bottom_sheet_handle_present === true,
      `expected bottom sheet handle present, observed ${observed.bottom_sheet_handle_present === true ? 'present' : 'missing'}`,
    ));
  }

  if (contract.tabbar_active_state_required === true) {
    checks.push(makeTokenCheck(
      'token-tabbar-active-state',
      observed.tabbar_active_state_present === true,
      `expected active tab state present, observed ${observed.tabbar_active_state_present === true ? 'present' : 'missing'}`,
    ));
  }

  if (contract.floating_primary_action_required === true) {
    checks.push(makeTokenCheck(
      'token-floating-primary-action',
      observed.floating_primary_action_present === true,
      `expected floating primary action present, observed ${observed.floating_primary_action_present === true ? 'present' : 'missing'}`,
    ));
  }

  if (contract.segmented_control_active_state_required === true) {
    checks.push(makeTokenCheck(
      'token-segmented-control-active-state',
      observed.segmented_control_active_state_present === true,
      `expected segmented control active state present, observed ${observed.segmented_control_active_state_present === true ? 'present' : 'missing'}`,
    ));
  }

  const requiredSemantics = normalizeStringList(contract.required_component_semantics);
  const observedSemantics = normalizeStringList(observed.component_semantics);
  if (requiredSemantics.length > 0) {
    const missing = requiredSemantics.filter((semantic) => !observedSemantics.includes(semantic));
    checks.push(makeTokenCheck(
      'token-component-semantics',
      missing.length === 0,
      missing.length === 0
        ? `required component semantics present: ${requiredSemantics.join(', ')}`
        : `missing component semantics: ${missing.join(', ')}; observed ${observedSemantics.join(', ') || 'none'}`,
    ));
  }

  const requiredPlatformPhysicsProfiles = normalizeStringList(contract.required_platform_physics_profiles);
  const observedPlatformPhysicsProfiles = normalizeStringList(observed.platform_physics_profiles);
  if (requiredPlatformPhysicsProfiles.length > 0) {
    const missing = requiredPlatformPhysicsProfiles.filter((profile) => !observedPlatformPhysicsProfiles.includes(profile));
    checks.push(makeTokenCheck(
      'token-platform-physics-profiles',
      missing.length === 0,
      missing.length === 0
        ? `required platform physics profiles present: ${requiredPlatformPhysicsProfiles.join(', ')}`
        : `missing platform physics profiles: ${missing.join(', ')}; observed ${observedPlatformPhysicsProfiles.join(', ') || 'none'}`,
    ));
  }

  const listRowHeights = normalizeNumberList(observed.list_row_heights);
  if (contract.list_row_height_range && typeof contract.list_row_height_range === 'object') {
    const min = Number(contract.list_row_height_range.min);
    const max = Number(contract.list_row_height_range.max);
    const observedMin = listRowHeights.length > 0 ? Math.min(...listRowHeights) : null;
    const observedMax = listRowHeights.length > 0 ? Math.max(...listRowHeights) : null;
    const passed = observedMin !== null
      && observedMax !== null
      && (!Number.isFinite(min) || observedMin >= min)
      && (!Number.isFinite(max) || observedMax <= max);
    checks.push(makeTokenCheck(
      'token-list-row-height-range',
      passed,
      `expected min/max within ${Number.isFinite(min) ? min : '-inf'}..${Number.isFinite(max) ? max : '+inf'}, observed ${observedMin ?? 'missing'}..${observedMax ?? 'missing'}`,
    ));
  }

  const toolbarControlDensityValues = normalizeNumberList(observed.toolbar_control_density_values);
  if (contract.toolbar_control_density_range && typeof contract.toolbar_control_density_range === 'object') {
    const min = Number(contract.toolbar_control_density_range.min);
    const max = Number(contract.toolbar_control_density_range.max);
    const observedMin = toolbarControlDensityValues.length > 0 ? Math.min(...toolbarControlDensityValues) : null;
    const observedMax = toolbarControlDensityValues.length > 0 ? Math.max(...toolbarControlDensityValues) : null;
    const passed = observedMin !== null
      && observedMax !== null
      && (!Number.isFinite(min) || observedMin >= min)
      && (!Number.isFinite(max) || observedMax <= max);
    checks.push(makeTokenCheck(
      'token-toolbar-control-density-range',
      passed,
      `expected min/max within ${Number.isFinite(min) ? min : '-inf'}..${Number.isFinite(max) ? max : '+inf'}, observed ${observedMin ?? 'missing'}..${observedMax ?? 'missing'}`,
    ));
  }

  const detailBlockSpacingValues = normalizeNumberList(observed.detail_block_spacing_values);
  if (contract.detail_block_spacing_scale && typeof contract.detail_block_spacing_scale === 'object') {
    const base = Number(contract.detail_block_spacing_scale.base);
    const allowedMultipliers = normalizeNumberList(contract.detail_block_spacing_scale.allowed_multipliers);
    const tolerance = Number.isFinite(Number(contract.detail_block_spacing_scale.tolerance))
      ? Number(contract.detail_block_spacing_scale.tolerance)
      : 0.5;
    const invalidValues = !Number.isFinite(base) || base <= 0
      ? detailBlockSpacingValues
      : detailBlockSpacingValues.filter((value) => {
          if (allowedMultipliers.length === 0) return false;
          return !allowedMultipliers.some((multiplier) => Math.abs(value - (base * multiplier)) <= tolerance);
        });
    checks.push(makeTokenCheck(
      'token-detail-block-spacing-scale',
      Number.isFinite(base) && base > 0 && invalidValues.length === 0 && detailBlockSpacingValues.length > 0,
      !Number.isFinite(base) || base <= 0
        ? 'detail block spacing base missing or invalid'
        : invalidValues.length === 0
          ? `detail block spacing fits base ${base} with multipliers ${allowedMultipliers.join(', ')}`
          : `invalid detail block spacing values: ${invalidValues.join(', ')}`,
    ));
  }

  const familyConsistencyContract = contract.component_family_consistency;
  const observedFamilies = observed.component_family_consistency && typeof observed.component_family_consistency === 'object'
    ? observed.component_family_consistency
    : {};
  if (familyConsistencyContract && typeof familyConsistencyContract === 'object') {
    for (const [familyName, familyRules] of Object.entries(familyConsistencyContract)) {
      if (!familyRules || typeof familyRules !== 'object') continue;
      const observedFamily = observedFamilies[familyName] && typeof observedFamilies[familyName] === 'object'
        ? observedFamilies[familyName]
        : {};
      const dimensions = [
        ['max_text_size_delta', 'text_sizes', 'text-size'],
        ['max_line_height_delta', 'line_heights', 'line-height'],
        ['max_radius_delta', 'radius_values', 'radius'],
        ['max_border_width_delta', 'border_widths', 'border-width'],
      ];
      for (const [ruleField, observedField, label] of dimensions) {
        if (!Number.isFinite(Number(familyRules[ruleField]))) continue;
        const maxDelta = Number(familyRules[ruleField]);
        const spread = numericSpread(observedFamily[observedField]);
        checks.push(makeTokenCheck(
          `token-family-${familyName}-${label}-consistency`,
          spread !== null && spread <= maxDelta,
          spread === null
            ? `${familyName} missing ${observedField}`
            : `${familyName} ${label} spread ${spread} (max ${maxDelta})`,
        ));
      }
    }
  }

  const requiredBorderWeightTiers = normalizeStringList(contract.border_weight_tiers_required);
  const observedBorderWeightTiers = normalizeStringList(observed.border_weight_tiers);
  if (requiredBorderWeightTiers.length > 0) {
    const missing = requiredBorderWeightTiers.filter((tier) => !observedBorderWeightTiers.includes(tier));
    checks.push(makeTokenCheck(
      'token-border-weight-tiers',
      missing.length === 0,
      missing.length === 0
        ? `required border weight tiers present: ${requiredBorderWeightTiers.join(', ')}`
        : `missing border weight tiers: ${missing.join(', ')}; observed ${observedBorderWeightTiers.join(', ') || 'none'}`,
    ));
  }

  const requiredShadowStrengthTiers = normalizeStringList(contract.shadow_strength_tiers_required);
  const observedShadowStrengthTiers = normalizeStringList(observed.shadow_strength_tiers);
  if (requiredShadowStrengthTiers.length > 0) {
    const missing = requiredShadowStrengthTiers.filter((tier) => !observedShadowStrengthTiers.includes(tier));
    checks.push(makeTokenCheck(
      'token-shadow-strength-tiers',
      missing.length === 0,
      missing.length === 0
        ? `required shadow strength tiers present: ${requiredShadowStrengthTiers.join(', ')}`
        : `missing shadow strength tiers: ${missing.join(', ')}; observed ${observedShadowStrengthTiers.join(', ') || 'none'}`,
    ));
  }

  return checks;
}

function normalizeObservedLayout(observedLayout, layoutObservations) {
  if (observedLayout && typeof observedLayout === 'object') {
    return observedLayout;
  }
  const panels = normalizeObservedPanels(layoutObservations);
  if (panels.length === 0) return null;
  const columnTracks = new Map();
  for (const panel of panels) {
    if (!panel?.id || !Number.isFinite(panel.width) || !Number.isFinite(panel.x)) continue;
    const trackKey = `${Math.round(panel.x)}:${Math.round(panel.width)}`;
    const current = columnTracks.get(trackKey);
    if (!current || panel.height > current.height || (panel.height === current.height && panel.y > current.y)) {
      columnTracks.set(trackKey, panel);
    }
  }
  const columns = Array.from(columnTracks.values())
    .sort((left, right) => {
      const leftX = Number.isFinite(left?.x) ? left.x : Number.POSITIVE_INFINITY;
      const rightX = Number.isFinite(right?.x) ? right.x : Number.POSITIVE_INFINITY;
      return leftX - rightX;
    })
    .map((panel) => ({
      id: panel.id,
      width: panel.width,
    }));
  return columns.length > 0 ? { columns } : null;
}

function normalizeObservedPanels(layoutObservations) {
  const panels = Array.isArray(layoutObservations?.panels) ? layoutObservations.panels : [];
  const regions = Array.isArray(layoutObservations?.regions) ? layoutObservations.regions : [];
  const domRects = Array.isArray(layoutObservations?.dom_rects) ? layoutObservations.dom_rects : [];
  const normalizedPanels = panels
    .filter((panel) =>
      panel
      && panel.id
      && Number.isFinite(panel.width)
      && Number.isFinite(panel.height)
      && Number.isFinite(panel.x))
    .map((panel) => ({
      id: panel.id,
      x: panel.x,
      y: Number.isFinite(panel.y) ? panel.y : 0,
      width: panel.width,
      height: panel.height,
      right: panel.x + panel.width,
      bottom: (Number.isFinite(panel.y) ? panel.y : 0) + panel.height,
    }));
  const normalizedRegions = regions
    .filter((region) =>
      region
      && region.id
      && Number.isFinite(region.left)
      && Number.isFinite(region.top)
      && Number.isFinite(region.right)
      && Number.isFinite(region.bottom)
      && region.right > region.left
      && region.bottom > region.top)
    .map((region) => ({
      id: region.id,
      x: region.left,
      y: region.top,
      width: region.right - region.left,
      height: region.bottom - region.top,
      right: region.right,
      bottom: region.bottom,
    }));
  const normalizedDomRects = domRects
    .filter((entry) =>
      entry
      && (entry.panel_id || entry.id)
      && Number.isFinite(entry.left)
      && Number.isFinite(entry.top)
      && Number.isFinite(entry.width)
      && Number.isFinite(entry.height)
      && entry.width > 0
      && entry.height > 0)
    .map((entry) => ({
      id: entry.panel_id || entry.id,
      x: entry.left,
      y: entry.top,
      width: entry.width,
      height: entry.height,
      right: entry.left + entry.width,
      bottom: entry.top + entry.height,
    }));
  if (normalizedPanels.length > 0) return normalizedPanels;
  if (normalizedRegions.length > 0) return normalizedRegions;
  return normalizedDomRects;
}

const WORKSPACE_PATTERN_EXPANSIONS = {
  header_with_split_workspace: [
    { id: 'pattern-header-above-main', from: 'header', to: 'main', relation: 'above', gap_max: 120 },
    { id: 'pattern-header-above-sidebar', from: 'header', to: 'sidebar', relation: 'above', gap_max: 24 },
    { id: 'pattern-header-aligned-left-sidebar', from: 'header', to: 'sidebar', relation: 'aligned_left', tolerance: 24 },
  ],
  sidebar_docked_left: [
    { id: 'pattern-sidebar-left-of-main', from: 'sidebar', to: 'main', relation: 'left_of', gap_max: 0 },
    { id: 'pattern-sidebar-aligned-top-main', from: 'sidebar', to: 'main', relation: 'aligned_top', tolerance: 0 },
  ],
  filters_above_list: [
    { id: 'pattern-filters-above-list', from: 'filters', to: 'list', relation: 'above', gap_max: 24 },
    { id: 'pattern-filters-aligned-left-list', from: 'filters', to: 'list', relation: 'aligned_left', tolerance: 24 },
  ],
  list_detail_master_detail: [
    { id: 'pattern-list-left-of-detail', from: 'list', to: 'detail', relation: 'left_of', gap_max: 0 },
    { id: 'pattern-list-aligned-top-detail', from: 'list', to: 'detail', relation: 'aligned_top', tolerance: 24 },
  ],
  detail_docked_right: [
    { id: 'pattern-detail-right-of-main', from: 'detail', to: 'main', relation: 'right_of', gap_max: 0 },
    { id: 'pattern-detail-aligned-top-main', from: 'detail', to: 'main', relation: 'aligned_top', tolerance: 0 },
  ],
  toolbar_over_workspace: [
    { id: 'pattern-toolbar-above-main', from: 'toolbar', to: 'main', relation: 'above', gap_max: 24 },
    { id: 'pattern-toolbar-aligned-left-main', from: 'toolbar', to: 'main', relation: 'aligned_left', tolerance: 24 },
  ],
  compact_top_nav: [
    { id: 'pattern-compact-top-nav-above-main', from: 'header', to: 'main', relation: 'above', gap_max: 16 },
    { id: 'pattern-compact-top-nav-aligned-left-main', from: 'header', to: 'main', relation: 'aligned_left', tolerance: 16 },
  ],
  bottom_tabbar_docked: [
    { id: 'pattern-bottom-tabbar-below-main', from: 'bottom_bar', to: 'main', relation: 'below', gap_max: 0 },
    { id: 'pattern-bottom-tabbar-aligned-left-main', from: 'bottom_bar', to: 'main', relation: 'aligned_left', tolerance: 16 },
  ],
  bottom_sheet_over_content: [
    { id: 'pattern-bottom-sheet-below-main-top', from: 'sheet', to: 'header', relation: 'below', gap_min: 0 },
    { id: 'pattern-bottom-sheet-aligned-left-main', from: 'sheet', to: 'main', relation: 'aligned_left', tolerance: 16 },
  ],
};

function expandAnchorRelations(layoutContract = {}) {
  if (!layoutContract || typeof layoutContract !== 'object') return [];
  const explicitRelations = Array.isArray(layoutContract.anchor_relations) ? layoutContract.anchor_relations : [];
  const workspacePatterns = Array.isArray(layoutContract.workspace_patterns) ? layoutContract.workspace_patterns : [];
  const expandedPatternRelations = workspacePatterns.flatMap((pattern) => WORKSPACE_PATTERN_EXPANSIONS[pattern] || []);
  const byId = new Map();
  for (const relation of [...expandedPatternRelations, ...explicitRelations]) {
    const relationId = relation?.id || `${relation?.from || 'unknown'}-${relation?.relation || 'relation'}-${relation?.to || 'unknown'}`;
    byId.set(relationId, { ...relation, id: relationId });
  }
  return Array.from(byId.values());
}

function evaluateLayoutContract(layoutContract = {}, observedLayout = {}, observedPanels = [], viewport = null, viewportMetrics = {}) {
  if (!layoutContract || typeof layoutContract !== 'object') return [];
  const normalizedObservedLayout = observedLayout && typeof observedLayout === 'object' ? observedLayout : {};
  const columns = Array.isArray(normalizedObservedLayout.columns) ? normalizedObservedLayout.columns : [];
  const checks = [];

  if (Number.isFinite(layoutContract.expected_columns)) {
    checks.push(makeStructureCheck(
      'layout-column-count',
      columns.length === layoutContract.expected_columns,
      `expected ${layoutContract.expected_columns}, observed ${columns.length}`,
    ));
  }

  if (Array.isArray(layoutContract.required_panels) && layoutContract.required_panels.length > 0) {
    const observedIds = columns.map((column) => column?.id).filter(Boolean);
    const filteredObservedIds = observedIds.filter((id) => layoutContract.required_panels.includes(id));
    checks.push(makeStructureCheck(
      'layout-panel-order',
      JSON.stringify(filteredObservedIds) === JSON.stringify(layoutContract.required_panels),
      `expected ${layoutContract.required_panels.join(' > ')}, observed ${filteredObservedIds.join(' > ') || 'none'}`,
    ));
  }

  const widthRequirements = [
    ['min_sidebar_width', 'sidebar'],
    ['min_main_width', layoutContract.main_panel_id || 'main'],
    ['min_detail_width', 'detail'],
  ];
  for (const [field, panelId] of widthRequirements) {
    if (!Number.isFinite(layoutContract[field])) continue;
    const fallbackPanelId = field === 'min_main_width'
      ? (Array.isArray(layoutContract.required_panels) ? layoutContract.required_panels[0] : null)
      : null;
    const column = columns.find((entry) => entry?.id === panelId)
      || columns.find((entry) => fallbackPanelId && entry?.id === fallbackPanelId)
      || (field === 'min_main_width' ? columns[0] : null);
    const observedWidth = Number.isFinite(column?.width) ? column.width : null;
    checks.push(makeStructureCheck(
      field === 'min_main_width' ? 'layout-main-width' : `layout-${panelId}-width`,
      observedWidth !== null && observedWidth >= layoutContract[field],
      `expected >= ${layoutContract[field]}, observed ${observedWidth ?? 'missing'}${column?.id ? ` via ${column.id}` : ''}`,
    ));
  }

  const topSafeAreaPanels = Array.isArray(layoutContract.safe_area_top_panels) ? layoutContract.safe_area_top_panels : [];
  const bottomSafeAreaPanels = Array.isArray(layoutContract.safe_area_bottom_panels) ? layoutContract.safe_area_bottom_panels : [];
  const keyboardAwarePanels = Array.isArray(layoutContract.keyboard_aware_panels) ? layoutContract.keyboard_aware_panels : [];
  const thumbReachPanels = Array.isArray(layoutContract.thumb_reach_primary_action_panels)
    ? layoutContract.thumb_reach_primary_action_panels
    : [];
  const viewportHeight = Number(viewport?.height);
  const safeAreaTolerance = Number.isFinite(Number(layoutContract.safe_area_tolerance))
    ? Number(layoutContract.safe_area_tolerance)
    : 0;
  const keyboardClearanceMin = Number.isFinite(Number(layoutContract.keyboard_clearance_min))
    ? Number(layoutContract.keyboard_clearance_min)
    : 0;
  const thumbReachZone = layoutContract.thumb_reach_zone && typeof layoutContract.thumb_reach_zone === 'object'
    ? layoutContract.thumb_reach_zone
    : {};
  const thumbReachMinRatio = Number.isFinite(Number(thumbReachZone.min_y_ratio)) ? Number(thumbReachZone.min_y_ratio) : 0.55;
  const thumbReachMaxRatio = Number.isFinite(Number(thumbReachZone.max_y_ratio)) ? Number(thumbReachZone.max_y_ratio) : 0.95;
  const metrics = normalizeViewportMetrics(viewportMetrics);

  for (const panelId of topSafeAreaPanels) {
    const panel = observedPanels.find((entry) => entry?.id === panelId);
    const safeTop = metrics.safe_area_top;
    checks.push(makeStructureCheck(
      `layout-safe-area-top-${panelId}`,
      Boolean(panel) && Number.isFinite(safeTop) && panel.y >= (safeTop - safeAreaTolerance),
      !panel
        ? `missing observed panel ${panelId}`
        : !Number.isFinite(safeTop)
          ? 'safe area top metric missing'
          : `expected ${panelId} y >= ${safeTop - safeAreaTolerance}, observed ${panel.y}`,
    ));
  }

  for (const panelId of bottomSafeAreaPanels) {
    const panel = observedPanels.find((entry) => entry?.id === panelId);
    const safeBottom = metrics.safe_area_bottom;
    const bottomGap = panel && Number.isFinite(viewportHeight) ? viewportHeight - panel.bottom : null;
    checks.push(makeStructureCheck(
      `layout-safe-area-bottom-${panelId}`,
      Boolean(panel) && Number.isFinite(safeBottom) && Number.isFinite(bottomGap) && bottomGap >= (safeBottom - safeAreaTolerance),
      !panel
        ? `missing observed panel ${panelId}`
        : !Number.isFinite(safeBottom) || !Number.isFinite(bottomGap)
          ? 'safe area bottom metric missing'
          : `expected ${panelId} bottom gap >= ${safeBottom - safeAreaTolerance}, observed ${bottomGap}`,
    ));
  }

  for (const panelId of keyboardAwarePanels) {
    const panel = observedPanels.find((entry) => entry?.id === panelId);
    const keyboardInset = metrics.keyboard_inset_bottom;
    const visibleBottom = Number.isFinite(viewportHeight) && Number.isFinite(keyboardInset)
      ? viewportHeight - keyboardInset
      : null;
    const clearance = panel && Number.isFinite(visibleBottom) ? visibleBottom - panel.bottom : null;
    checks.push(makeStructureCheck(
      `layout-keyboard-clearance-${panelId}`,
      Boolean(panel) && Number.isFinite(clearance) && clearance >= keyboardClearanceMin,
      !panel
        ? `missing observed panel ${panelId}`
        : !Number.isFinite(clearance)
          ? 'keyboard inset metric missing'
          : `expected ${panelId} clearance above keyboard >= ${keyboardClearanceMin}, observed ${clearance}`,
    ));
  }

  for (const panelId of thumbReachPanels) {
    const panel = observedPanels.find((entry) => entry?.id === panelId);
    const centerRatio = panel && Number.isFinite(viewportHeight) && viewportHeight > 0
      ? ((panel.y + panel.bottom) / 2) / viewportHeight
      : null;
    checks.push(makeStructureCheck(
      `layout-thumb-reach-${panelId}`,
      Boolean(panel) && Number.isFinite(centerRatio) && centerRatio >= thumbReachMinRatio && centerRatio <= thumbReachMaxRatio,
      !panel
        ? `missing observed panel ${panelId}`
        : !Number.isFinite(centerRatio)
          ? 'viewport height missing'
          : `expected ${panelId} center ratio within ${thumbReachMinRatio}..${thumbReachMaxRatio}, observed ${Number(centerRatio.toFixed(3))}`,
    ));
  }

  return checks;
}

function evaluateAlignmentGrid(layoutContract = {}, observedPanels = []) {
  if (!layoutContract || typeof layoutContract !== 'object') return [];
  const step = Number(layoutContract.alignment_grid_step);
  if (!Number.isFinite(step) || step <= 0) return [];
  const tolerance = Number.isFinite(Number(layoutContract.alignment_grid_tolerance))
    ? Number(layoutContract.alignment_grid_tolerance)
    : 1;
  const allowedPanels = Array.isArray(layoutContract.alignment_grid_panels) && layoutContract.alignment_grid_panels.length > 0
    ? new Set(layoutContract.alignment_grid_panels)
    : null;

  return observedPanels
    .filter((panel) => !allowedPanels || allowedPanels.has(panel.id))
    .map((panel) => {
      const xDelta = Math.min(panel.x % step, step - (panel.x % step || 0));
      const yDelta = Math.min(panel.y % step, step - (panel.y % step || 0));
      const passed = xDelta <= tolerance && yDelta <= tolerance;
      return makeStructureCheck(
        `layout-grid-alignment-${panel.id}`,
        passed,
        `expected ${panel.id} on ${step}px grid (+/- ${tolerance}), observed xΔ=${Number(xDelta.toFixed(2))}, yΔ=${Number(yDelta.toFixed(2))}`,
      );
    });
}

function evaluateAnchorRelations(layoutContract = {}, observedPanels = []) {
  if (!layoutContract || typeof layoutContract !== 'object') return [];
  const relations = expandAnchorRelations(layoutContract);
  if (relations.length === 0) return [];

  return relations.map((relation, index) => {
    const from = observedPanels.find((panel) => panel.id === relation?.from);
    const to = observedPanels.find((panel) => panel.id === relation?.to);
    const relationId = relation?.id || `anchor-relation-${index + 1}`;
    if (!from || !to) {
      return makeStructureCheck(
        relationId,
        false,
        `missing observed panels for ${relation?.from || 'unknown'} -> ${relation?.to || 'unknown'}`,
      );
    }

    let passed = false;
    let detail = null;
    switch (relation?.relation) {
      case 'left_of': {
        const gap = to.x - from.right;
        passed = from.right <= to.x;
        if (passed && Number.isFinite(relation.gap_min)) passed = gap >= relation.gap_min;
        if (passed && Number.isFinite(relation.gap_max)) passed = gap <= relation.gap_max;
        detail = `expected ${from.id} left_of ${to.id}, observed gap ${gap}`;
        break;
      }
      case 'right_of': {
        const gap = from.x - to.right;
        passed = from.x >= to.right;
        if (passed && Number.isFinite(relation.gap_min)) passed = gap >= relation.gap_min;
        if (passed && Number.isFinite(relation.gap_max)) passed = gap <= relation.gap_max;
        detail = `expected ${from.id} right_of ${to.id}, observed gap ${gap}`;
        break;
      }
      case 'above': {
        const gap = to.y - from.bottom;
        passed = from.bottom <= to.y;
        if (passed && Number.isFinite(relation.gap_min)) passed = gap >= relation.gap_min;
        if (passed && Number.isFinite(relation.gap_max)) passed = gap <= relation.gap_max;
        detail = `expected ${from.id} above ${to.id}, observed gap ${gap}`;
        break;
      }
      case 'below': {
        const gap = from.y - to.bottom;
        passed = from.y >= to.bottom;
        if (passed && Number.isFinite(relation.gap_min)) passed = gap >= relation.gap_min;
        if (passed && Number.isFinite(relation.gap_max)) passed = gap <= relation.gap_max;
        detail = `expected ${from.id} below ${to.id}, observed gap ${gap}`;
        break;
      }
      case 'aligned_top': {
        const delta = Math.abs(from.y - to.y);
        passed = Number.isFinite(relation.tolerance) ? delta <= relation.tolerance : delta === 0;
        detail = `expected ${from.id} aligned_top ${to.id}, observed delta ${delta}`;
        break;
      }
      case 'aligned_left': {
        const delta = Math.abs(from.x - to.x);
        passed = Number.isFinite(relation.tolerance) ? delta <= relation.tolerance : delta === 0;
        detail = `expected ${from.id} aligned_left ${to.id}, observed delta ${delta}`;
        break;
      }
      default: {
        passed = false;
        detail = `unsupported relation ${relation?.relation || 'unknown'}`;
      }
    }

    return makeStructureCheck(relationId, passed, detail);
  });
}

function evaluateDiffMetrics(metrics) {
  if (!metrics || typeof metrics !== 'object') {
    return {
      status: 'needs_follow_up',
      issues: ['diff_metrics_missing'],
      values: null,
      thresholds: { ...DEFAULT_THRESHOLDS },
    };
  }

  const thresholds = {
    structural_similarity_min: metrics.thresholds?.structural_similarity_min ?? DEFAULT_THRESHOLDS.structural_similarity_min,
    layout_shift_score_max: metrics.thresholds?.layout_shift_score_max ?? DEFAULT_THRESHOLDS.layout_shift_score_max,
    pixel_diff_ratio_max: metrics.thresholds?.pixel_diff_ratio_max ?? DEFAULT_THRESHOLDS.pixel_diff_ratio_max,
  };

  const values = {
    structural_similarity: Number.isFinite(metrics.structural_similarity) ? metrics.structural_similarity : null,
    layout_shift_score: Number.isFinite(metrics.layout_shift_score) ? metrics.layout_shift_score : null,
    pixel_diff_ratio: Number.isFinite(metrics.pixel_diff_ratio) ? metrics.pixel_diff_ratio : null,
  };

  const issues = [];
  const observed = Object.values(values).some((value) => value !== null);
  if (!observed) issues.push('diff_metrics_unusable');
  if (values.structural_similarity !== null && values.structural_similarity < thresholds.structural_similarity_min) {
    issues.push('structural_similarity_below_threshold');
  }
  if (values.layout_shift_score !== null && values.layout_shift_score > thresholds.layout_shift_score_max) {
    issues.push('layout_shift_score_above_threshold');
  }
  if (values.pixel_diff_ratio !== null && values.pixel_diff_ratio > thresholds.pixel_diff_ratio_max) {
    issues.push('pixel_diff_ratio_above_threshold');
  }

  return {
    status: issues.length === 0 ? 'pass' : 'needs_follow_up',
    issues,
    values,
    thresholds,
    hotspots: Array.isArray(metrics.hotspots) ? metrics.hotspots : [],
    heatmap_file: typeof metrics.heatmap_file === 'string' ? metrics.heatmap_file : null,
  };
}

async function resolveScenarioDiffMetrics(projectRoot, scenario = {}, options = {}) {
  if (scenario.diff_metrics && typeof scenario.diff_metrics === 'object') {
    return scenario.diff_metrics;
  }
  const referencePath = resolveEvidencePath(projectRoot, scenario.reference_image);
  const screenshotPath = resolveEvidencePath(projectRoot, scenario.screenshot_image);
  if (!referencePath || !screenshotPath) return null;
  if (!existsSync(referencePath) || !existsSync(screenshotPath)) return null;
  const computed = await computeImageDiffMetrics({
    referencePath,
    candidatePath: screenshotPath,
    pixelThreshold: scenario.diff_pixel_threshold,
    blockRows: scenario.diff_block_rows,
    blockCols: scenario.diff_block_cols,
    heatmapOutputPath: options.heatmapOutputPath || null,
  });
  return {
    structural_similarity: computed.structural_similarity,
    layout_shift_score: computed.layout_shift_score,
    pixel_diff_ratio: computed.pixel_diff_ratio,
    thresholds: scenario.diff_thresholds && typeof scenario.diff_thresholds === 'object' ? scenario.diff_thresholds : undefined,
    hotspots: computed.hotspots,
    heatmap_file: computed.heatmap_file,
  };
}

async function evaluateStateTransitions(projectRoot, scenario = {}) {
  const baseScreenshotPath = resolveEvidencePath(projectRoot, scenario.screenshot_image);
  if (!baseScreenshotPath || !existsSync(baseScreenshotPath)) return [];
  const stateEvidence = Array.isArray(scenario.state_evidence) ? scenario.state_evidence : [];
  const checks = [];

  for (const state of stateEvidence) {
    if (state?.expect_visual_change === false) continue;
    const stateScreenshotPath = resolveEvidencePath(projectRoot, state.screenshot_image);
    if (!stateScreenshotPath || !existsSync(stateScreenshotPath)) {
      checks.push(makeStructureCheck(`state-transition-${state?.id || 'unknown'}`, false, 'state screenshot missing'));
      continue;
    }
    const referenceStatePath = state.reference_image ? resolveEvidencePath(projectRoot, state.reference_image) : null;
    const comparisonPath = referenceStatePath || baseScreenshotPath;
    if (!comparisonPath || !existsSync(comparisonPath)) {
      checks.push(makeStructureCheck(`state-transition-${state?.id || 'unknown'}`, false, 'state reference image missing'));
      continue;
    }
    const diff = await computeImageDiffMetrics({
      referencePath: comparisonPath,
      candidatePath: stateScreenshotPath,
    });
    const minPixelDiffRatio = Number.isFinite(Number(state.min_pixel_diff_ratio)) ? Number(state.min_pixel_diff_ratio) : 0.002;
    const passed = referenceStatePath
      ? diff.pixel_diff_ratio <= Math.max(minPixelDiffRatio, 0.12)
      : (diff.pixel_diff_ratio >= minPixelDiffRatio || diff.layout_shift_score > 0);
    checks.push({
      id: `state-transition-${state.id}`,
      status: passed ? 'pass' : 'needs_follow_up',
      detail: referenceStatePath
        ? `expected ${state.id} to align with reference state, observed pixel_diff_ratio=${diff.pixel_diff_ratio.toFixed(4)}, layout_shift_score=${diff.layout_shift_score.toFixed(4)}`
        : `expected visual change from base for ${state.id}, observed pixel_diff_ratio=${diff.pixel_diff_ratio.toFixed(4)}, layout_shift_score=${diff.layout_shift_score.toFixed(4)}`,
      diff_metrics: {
        pixel_diff_ratio: diff.pixel_diff_ratio,
        layout_shift_score: diff.layout_shift_score,
        structural_similarity: diff.structural_similarity,
      },
      compared_to: referenceStatePath ? 'reference_state' : 'base_state',
    });
  }

  return checks;
}

async function evaluateMotionTransitions(projectRoot, scenario = {}) {
  const baseScreenshotPath = resolveEvidencePath(projectRoot, scenario.screenshot_image);
  if (!baseScreenshotPath || !existsSync(baseScreenshotPath)) return [];
  const stateEvidence = Array.isArray(scenario.state_evidence) ? scenario.state_evidence : [];
  const checks = [];

  for (const state of stateEvidence) {
    const frameImages = Array.isArray(state?.frame_screenshot_images) ? state.frame_screenshot_images : [];
    if (frameImages.length === 0 && state?.expect_motion !== true) continue;
    const comparisonPath = state.reference_image ? resolveEvidencePath(projectRoot, state.reference_image) : baseScreenshotPath;
    if (!comparisonPath || !existsSync(comparisonPath)) {
      checks.push(makeStateContractCheck(`motion-transition-${state?.id || 'unknown'}`, false, 'motion reference image missing'));
      continue;
    }
    const diffs = [];
    for (const frameImage of frameImages) {
      const framePath = resolveEvidencePath(projectRoot, frameImage);
      if (!framePath || !existsSync(framePath)) continue;
      const diff = await computeImageDiffMetrics({
        referencePath: comparisonPath,
        candidatePath: framePath,
      });
      diffs.push(diff);
    }
    const changedFrames = diffs.filter((diff) => diff.pixel_diff_ratio >= 0.002 || diff.layout_shift_score > 0).length;
    const minChangedFrames = Number.isFinite(Number(state?.min_motion_changed_frames))
      ? Number(state.min_motion_changed_frames)
      : (frameImages.length > 0 ? 1 : 0);
    const passed = frameImages.length > 0 && changedFrames >= minChangedFrames;
    checks.push({
      id: `motion-transition-${state.id}`,
      status: passed ? 'pass' : 'needs_follow_up',
      detail: `expected changed frames >= ${minChangedFrames}, observed ${changedFrames}/${frameImages.length}`,
      motion_profile: {
        sampled_frames: frameImages.length,
        changed_frames: changedFrames,
        peak_pixel_diff_ratio: diffs.length > 0 ? Math.max(...diffs.map((diff) => diff.pixel_diff_ratio)) : null,
        peak_layout_shift_score: diffs.length > 0 ? Math.max(...diffs.map((diff) => diff.layout_shift_score)) : null,
      },
    });
  }

  return checks;
}

function evaluateStateContract(scenario = {}) {
  const contract = scenario?.state_contract;
  if (!contract || typeof contract !== 'object') return [];
  const stateEvidence = Array.isArray(scenario.state_evidence) ? scenario.state_evidence : [];
  const checks = [];
  const requiredWorkbenchStates = normalizeStringList(contract.required_workbench_states);
  const observedWorkbenchStates = normalizeStringList(stateEvidence.map((state) => state?.workbench_state_type));
  if (requiredWorkbenchStates.length > 0) {
    const missing = requiredWorkbenchStates.filter((stateType) => !observedWorkbenchStates.includes(stateType));
    checks.push(makeStateContractCheck(
      'state-contract-required-workbench-states',
      missing.length === 0,
      missing.length === 0
        ? `required workbench states present: ${requiredWorkbenchStates.join(', ')}`
        : `missing workbench states: ${missing.join(', ')}; observed ${observedWorkbenchStates.join(', ') || 'none'}`,
    ));
  }
  return checks;
}

function evaluateStateFamilyConsistency(scenario = {}, stateTransitionChecks = []) {
  const contract = scenario?.state_family_contract;
  if (!contract || typeof contract !== 'object') return [];
  const stateEvidence = Array.isArray(scenario.state_evidence) ? scenario.state_evidence : [];
  const checkByStateId = new Map(
    stateTransitionChecks.map((check) => [String(check?.id || '').replace(/^state-transition-/, ''), check]),
  );
  const checks = [];

  for (const [familyName, familyRules] of Object.entries(contract)) {
    if (!familyRules || typeof familyRules !== 'object') continue;
    const familyStates = stateEvidence.filter((state) => state?.component_family === familyName);
    const observedVariants = normalizeStringList(familyStates.map((state) => state?.state_variant));
    const requiredVariants = normalizeStringList(familyRules.required_variants);
    if (requiredVariants.length > 0) {
      const missingVariants = requiredVariants.filter((variant) => !observedVariants.includes(variant));
      checks.push(makeStateContractCheck(
        `state-family-${familyName}-required-variants`,
        missingVariants.length === 0,
        missingVariants.length === 0
          ? `required variants present: ${requiredVariants.join(', ')}`
          : `missing variants: ${missingVariants.join(', ')}; observed ${observedVariants.join(', ') || 'none'}`,
      ));
    }

    const diffs = familyStates
      .map((state) => checkByStateId.get(state.id)?.diff_metrics)
      .filter((metrics) => metrics && typeof metrics === 'object');
    const pixelDiffValues = normalizeNumberList(diffs.map((metrics) => metrics.pixel_diff_ratio));
    const layoutShiftValues = normalizeNumberList(diffs.map((metrics) => metrics.layout_shift_score));
    const stateTokens = familyStates
      .map((state) => state?.state_visual_tokens)
      .filter((tokens) => tokens && typeof tokens === 'object');
    const distinctSurfaceColors = new Set(
      stateTokens
        .map((tokens) => normalizeColorValue(tokens?.color_roles?.surface))
        .filter(Boolean),
    );
    const distinctShadowStrengthTiers = new Set(
      stateTokens
        .flatMap((tokens) => normalizeStringList(tokens?.shadow_strength_tiers)),
    );
    const distinctTimingFunctions = new Set(
      stateTokens
        .flatMap((tokens) => normalizeStringList(tokens?.transition_timing_functions)),
    );
    const radiusValues = normalizeNumberList(
      stateTokens.flatMap((tokens) => Array.isArray(tokens?.radius_values) ? tokens.radius_values : []),
    );
    const borderWidthValues = normalizeNumberList(
      stateTokens.flatMap((tokens) => Array.isArray(tokens?.border_widths) ? tokens.border_widths : []),
    );
    const transitionDurationValues = normalizeNumberList(
      stateTokens.flatMap((tokens) => Array.isArray(tokens?.transition_durations) ? tokens.transition_durations : []),
    );
    const animationDurationValues = normalizeNumberList(
      stateTokens.flatMap((tokens) => Array.isArray(tokens?.animation_durations) ? tokens.animation_durations : []),
    );

    if (Number.isFinite(Number(familyRules.max_pixel_diff_spread))) {
      const spread = numericSpread(pixelDiffValues);
      const maxSpread = Number(familyRules.max_pixel_diff_spread);
      checks.push(makeStateContractCheck(
        `state-family-${familyName}-pixel-diff-spread`,
        spread !== null && spread <= maxSpread,
        spread === null ? `${familyName} missing pixel diff evidence` : `${familyName} pixel diff spread ${spread} (max ${maxSpread})`,
      ));
    }
    if (Number.isFinite(Number(familyRules.max_layout_shift_spread))) {
      const spread = numericSpread(layoutShiftValues);
      const maxSpread = Number(familyRules.max_layout_shift_spread);
      checks.push(makeStateContractCheck(
        `state-family-${familyName}-layout-shift-spread`,
        spread !== null && spread <= maxSpread,
        spread === null ? `${familyName} missing layout shift evidence` : `${familyName} layout shift spread ${spread} (max ${maxSpread})`,
      ));
    }
    if (Number.isFinite(Number(familyRules.min_distinct_surface_colors))) {
      const minDistinct = Number(familyRules.min_distinct_surface_colors);
      checks.push(makeStateContractCheck(
        `state-family-${familyName}-surface-colors`,
        distinctSurfaceColors.size >= minDistinct,
        `${familyName} distinct surface colors ${distinctSurfaceColors.size} (min ${minDistinct})`,
      ));
    }
    if (Number.isFinite(Number(familyRules.min_distinct_shadow_strength_tiers))) {
      const minDistinct = Number(familyRules.min_distinct_shadow_strength_tiers);
      checks.push(makeStateContractCheck(
        `state-family-${familyName}-shadow-strength-tiers`,
        distinctShadowStrengthTiers.size >= minDistinct,
        `${familyName} distinct shadow strength tiers ${distinctShadowStrengthTiers.size} (min ${minDistinct})`,
      ));
    }
    if (Array.isArray(familyRules.required_timing_functions) && familyRules.required_timing_functions.length > 0) {
      const requiredTimingFunctions = normalizeStringList(familyRules.required_timing_functions);
      const missingTimingFunctions = requiredTimingFunctions.filter((fn) => !distinctTimingFunctions.has(fn));
      checks.push(makeStateContractCheck(
        `state-family-${familyName}-timing-functions`,
        missingTimingFunctions.length === 0,
        missingTimingFunctions.length === 0
          ? `required timing functions present: ${requiredTimingFunctions.join(', ')}`
          : `missing timing functions: ${missingTimingFunctions.join(', ')}; observed ${Array.from(distinctTimingFunctions).join(', ') || 'none'}`,
      ));
    }
    if (Number.isFinite(Number(familyRules.max_radius_spread))) {
      const spread = numericSpread(radiusValues);
      const maxSpread = Number(familyRules.max_radius_spread);
      checks.push(makeStateContractCheck(
        `state-family-${familyName}-radius-spread`,
        spread !== null && spread <= maxSpread,
        spread === null ? `${familyName} missing radius token evidence` : `${familyName} radius spread ${spread} (max ${maxSpread})`,
      ));
    }
    if (Number.isFinite(Number(familyRules.max_border_width_spread))) {
      const spread = numericSpread(borderWidthValues);
      const maxSpread = Number(familyRules.max_border_width_spread);
      checks.push(makeStateContractCheck(
        `state-family-${familyName}-border-width-spread`,
        spread !== null && spread <= maxSpread,
        spread === null ? `${familyName} missing border width token evidence` : `${familyName} border width spread ${spread} (max ${maxSpread})`,
      ));
    }
    if (Number.isFinite(Number(familyRules.max_transition_duration_spread))) {
      const spread = numericSpread(transitionDurationValues);
      const maxSpread = Number(familyRules.max_transition_duration_spread);
      checks.push(makeStateContractCheck(
        `state-family-${familyName}-transition-duration-spread`,
        spread !== null && spread <= maxSpread,
        spread === null ? `${familyName} missing transition duration evidence` : `${familyName} transition duration spread ${spread}ms (max ${maxSpread}ms)`,
      ));
    }
    if (Number.isFinite(Number(familyRules.max_animation_duration_spread))) {
      const spread = numericSpread(animationDurationValues);
      const maxSpread = Number(familyRules.max_animation_duration_spread);
      checks.push(makeStateContractCheck(
        `state-family-${familyName}-animation-duration-spread`,
        spread !== null && spread <= maxSpread,
        spread === null ? `${familyName} missing animation duration evidence` : `${familyName} animation duration spread ${spread}ms (max ${maxSpread}ms)`,
      ));
    }
  }

  return checks;
}

function evaluateBenchmarkMatrix(contract = {}, scenarios = []) {
  if (!contract || typeof contract !== 'object') return [];
  const checks = [];
  const scenarioIds = normalizeStringList(scenarios.map((scenario) => scenario?.id));
  const requiredScenarioIds = normalizeStringList(contract.required_scenario_ids);
  const requiredPlatformProfiles = normalizeStringList(contract.required_platform_profiles);
  if (requiredScenarioIds.length > 0) {
    const missing = requiredScenarioIds.filter((id) => !scenarioIds.includes(id));
    checks.push(makeMatrixCheck(
      'matrix-required-scenarios',
      missing.length === 0,
      missing.length === 0
        ? `required scenarios present: ${requiredScenarioIds.join(', ')}`
        : `missing scenarios: ${missing.join(', ')}; observed ${scenarioIds.join(', ') || 'none'}`,
    ));
  }

  if (requiredPlatformProfiles.length > 0) {
    const observedProfiles = normalizeStringList(scenarios.map((scenario) => scenario?.platform_profile));
    const missing = requiredPlatformProfiles.filter((profile) => !observedProfiles.includes(profile));
    checks.push(makeMatrixCheck(
      'matrix-required-platform-profiles',
      missing.length === 0,
      missing.length === 0
        ? `required platform profiles present: ${requiredPlatformProfiles.join(', ')}`
        : `missing platform profiles: ${missing.join(', ')}; observed ${observedProfiles.join(', ') || 'none'}`,
    ));
  }

  const requiredStateVariants = normalizeStringList(contract.required_state_variants);
  if (requiredStateVariants.length > 0) {
    const observedVariants = normalizeStringList(
      scenarios.flatMap((scenario) => Array.isArray(scenario?.state_evidence) ? scenario.state_evidence.map((state) => state?.state_variant) : []),
    );
    const missing = requiredStateVariants.filter((variant) => !observedVariants.includes(variant));
    checks.push(makeMatrixCheck(
      'matrix-required-state-variants',
      missing.length === 0,
      missing.length === 0
        ? `required state variants present: ${requiredStateVariants.join(', ')}`
        : `missing state variants: ${missing.join(', ')}; observed ${observedVariants.join(', ') || 'none'}`,
    ));
  }

  if (Number.isFinite(Number(contract.max_average_pixel_diff_ratio))) {
    const values = scenarios
      .map((scenario) => Number(scenario?.diff_metrics?.values?.pixel_diff_ratio))
      .filter((value) => Number.isFinite(value));
    const average = values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    const maxAverage = Number(contract.max_average_pixel_diff_ratio);
    checks.push(makeMatrixCheck(
      'matrix-average-pixel-diff-ratio',
      average !== null && average <= maxAverage,
      average === null ? 'missing scenario diff metrics' : `average pixel diff ratio ${average} (max ${maxAverage})`,
    ));
  }

  return checks;
}

async function materializeScenarioCapture(projectRoot, changeId, scenario = {}, index) {
  if (!scenario.capture_url) return scenario;
  const scenarioId = scenario.id || `scenario-${index + 1}`;
  const screenshotPath = scenario.screenshot_image
    ? resolveEvidencePath(projectRoot, scenario.screenshot_image)
    : resolve(projectRoot, 'output', 'playwright', `${changeId}-${scenarioId}.png`);
  const snapshotPath = resolve(projectRoot, '.as-xflow', `${changeId}-${scenarioId}-snapshot.json`);
  const capture = await capturePageEvidence({
    url: scenario.capture_url,
    snapshotPath,
    screenshotPath,
    width: scenario.viewport?.width,
    height: scenario.viewport?.height,
    waitMs: scenario.wait_ms,
    platformProfile: scenario.platform_profile || null,
    panelAttr: scenario.panel_attr || 'data-panel',
    panelSelector: scenario.panel_selector || null,
    captureStates: Array.isArray(scenario.capture_states) ? scenario.capture_states : [],
    autoDiscoverStates: scenario.auto_discover_states === true,
    stateLimit: Number.isFinite(Number(scenario.state_limit)) ? Number(scenario.state_limit) : 4,
  });
  const domRects = exportDomRectsFromSnapshot(capture.snapshot, { panelAttr: scenario.panel_attr || 'data-panel' });
  const visualTokens = exportVisualTokensFromSnapshot(capture.snapshot);
  return {
    ...scenario,
    capture_url: scenario.capture_url,
    screenshot_image: relative(projectRoot, capture.screenshot_file),
    layout_observations: {
      ...(scenario.layout_observations && typeof scenario.layout_observations === 'object' ? scenario.layout_observations : {}),
      dom_rects: domRects.dom_rects,
    },
    observed_visual_tokens: scenario.observed_visual_tokens || visualTokens.observed_visual_tokens,
    viewport_metrics: scenario.viewport_metrics || capture.snapshot?.viewport_metrics || null,
    platform_profile: scenario.platform_profile || capture.snapshot?.platform_profile || null,
    state_evidence: Array.isArray(capture.states)
      ? capture.states.map((state) => ({
          id: state.id,
          label: state.label || null,
          screenshot_image: relative(projectRoot, state.screenshot_file),
          nodes_captured: state.nodes_captured,
          expect_visual_change: state.expect_visual_change !== false,
          min_pixel_diff_ratio: Number.isFinite(Number(state.min_pixel_diff_ratio)) ? Number(state.min_pixel_diff_ratio) : null,
          reference_image: state.reference_image || null,
          priority_score: Number.isFinite(Number(state.priority_score)) ? Number(state.priority_score) : null,
          priority_reason: state.priority_reason || null,
          source: state.source || null,
          workbench_state_type: state.workbench_state_type || null,
          state_tags: Array.isArray(state.state_tags) ? state.state_tags : [],
          component_family: state.component_family || null,
          state_variant: state.state_variant || null,
          state_visual_tokens: state.nodes ? exportVisualTokensFromSnapshot({ nodes: state.nodes }).observed_visual_tokens : null,
          expect_motion: state.expect_motion === true,
          min_motion_changed_frames: Number.isFinite(Number(state.min_motion_changed_frames)) ? Number(state.min_motion_changed_frames) : null,
          frame_screenshot_images: Array.isArray(state.frame_screenshot_files) ? state.frame_screenshot_files.map((filePath) => relative(projectRoot, filePath)) : [],
        }))
      : [],
  };
}

async function normalizeScenario(projectRoot, scenario = {}, index) {
  const changeId = scenario.change_id_hint || 'unknown-change';
  const materializedScenario = await materializeScenarioCapture(projectRoot, changeId, scenario, index);
  scenario = materializedScenario;
  const referencePath = resolveEvidencePath(projectRoot, scenario.reference_image);
  const screenshotPath = resolveEvidencePath(projectRoot, scenario.screenshot_image);
  const observedLayout = normalizeObservedLayout(scenario.observed_layout, scenario.layout_observations);
  const observedPanels = normalizeObservedPanels(scenario.layout_observations);
  const viewportMetrics = normalizeViewportMetrics(scenario.viewport_metrics || scenario.observed_visual_tokens || {});
  const layoutDerivedChecks = evaluateLayoutContract(scenario.layout_contract, observedLayout, observedPanels, scenario.viewport, viewportMetrics);
  const anchorDerivedChecks = evaluateAnchorRelations(scenario.layout_contract, observedPanels);
  const alignmentGridChecks = evaluateAlignmentGrid(scenario.layout_contract, observedPanels);
  const structureChecks = [
    ...normalizeStructureChecks(scenario.structure_checks),
    ...layoutDerivedChecks,
    ...anchorDerivedChecks,
    ...alignmentGridChecks,
  ];
  const scenarioHeatmapPath = scenario.screenshot_image
    ? resolve(projectRoot, 'output', 'playwright', `${changeId}-${scenario.id || `scenario-${index + 1}`}-heatmap.png`)
    : null;
  const diffMetrics = evaluateDiffMetrics(await resolveScenarioDiffMetrics(projectRoot, scenario, {
    heatmapOutputPath: scenarioHeatmapPath,
  }));
  const tokenChecks = evaluateVisualTokenContract(scenario.visual_token_contract, scenario.observed_visual_tokens);
  const stateTransitionChecks = await evaluateStateTransitions(projectRoot, scenario);
  const motionTransitionChecks = await evaluateMotionTransitions(projectRoot, scenario);
  const stateContractChecks = evaluateStateContract(scenario);
  const stateFamilyChecks = evaluateStateFamilyConsistency(scenario, stateTransitionChecks);
  const blockers = [];

  const evidence = {
    reference_image_exists: Boolean(referencePath && existsSync(referencePath)),
    screenshot_image_exists: Boolean(screenshotPath && existsSync(screenshotPath)),
  };
  if (!evidence.reference_image_exists) blockers.push('reference_image_missing');
  if (!evidence.screenshot_image_exists) blockers.push('screenshot_image_missing');
  if (diffMetrics.status !== 'pass') blockers.push(...diffMetrics.issues);
  if (structureChecks.some((check) => check.status !== 'pass')) blockers.push('structure_checks_unresolved');
  if (tokenChecks.some((check) => check.status !== 'pass')) blockers.push('token_checks_unresolved');
  if (stateTransitionChecks.some((check) => check.status !== 'pass')) blockers.push('state_transition_checks_unresolved');
  if (motionTransitionChecks.some((check) => check.status !== 'pass')) blockers.push('motion_transition_checks_unresolved');
  if (stateContractChecks.some((check) => check.status !== 'pass')) blockers.push('state_contract_unresolved');
  if (stateFamilyChecks.some((check) => check.status !== 'pass')) blockers.push('state_family_checks_unresolved');

  const explicitStatus = scenario.status || null;
  const computedStatus = blockers.length === 0 ? 'pass' : 'needs_follow_up';

  return {
    id: scenario.id || `scenario-${index + 1}`,
    viewport: scenario.viewport || null,
    platform_profile: scenario.platform_profile || null,
    reference_image: scenario.reference_image || null,
    screenshot_image: scenario.screenshot_image || null,
    diff_metrics: diffMetrics,
    structure_checks: structureChecks,
    token_checks: tokenChecks,
    state_transition_checks: stateTransitionChecks,
    motion_transition_checks: motionTransitionChecks,
    state_contract_checks: stateContractChecks,
    state_family_checks: stateFamilyChecks,
    layout_contract: scenario.layout_contract || null,
    state_contract: scenario.state_contract || null,
    state_family_contract: scenario.state_family_contract || null,
    visual_token_contract: scenario.visual_token_contract || null,
    observed_layout: observedLayout,
    layout_observations: scenario.layout_observations || null,
    observed_visual_tokens: scenario.observed_visual_tokens || null,
    viewport_metrics: Object.keys(viewportMetrics).length > 0 ? viewportMetrics : null,
    state_evidence: Array.isArray(scenario.state_evidence) ? scenario.state_evidence : [],
    screenshot_evidence_mode: scenario.capture_url ? 'captured_page' : 'reference_backed',
    evidence,
    status: explicitStatus === 'pass' && computedStatus !== 'pass' ? 'needs_follow_up' : (explicitStatus || computedStatus),
    blockers,
  };
}

export async function visualBenchmark(input = {}, context = {}) {
  const projectRoot = context.projectRoot || process.cwd();
  const changeId = context.changeId || input.change_id || null;
  if (!changeId) throw new Error('change_id is required for H6.visual.benchmark');
  const outputPath = resolveChangePath(projectRoot, changeId, 'visual_benchmark.json');
  const references = parseReferenceScenarios(input);
  const implicitReferences = buildImplicitReferenceScenarios(input);
  const generationDefaults = loadGenerationDefaults(projectRoot, changeId);
  const effectiveReferences = (references.length > 0 ? references : implicitReferences)
    .map((scenario) => applyGenerationDefaults(scenario, generationDefaults));
  const inputMode = determineBenchmarkInputMode(input, references, implicitReferences);
  const competitorProduct = input.competitor_product || null;
  const requiredModules = Array.isArray(input.required_modules) ? input.required_modules : [];
  const benchmarkMatrixContract = parseObjectLike(input.benchmark_matrix_contract) || parseObjectLike(input.benchmark_matrix_contract_json) || null;
  const scenarios = effectiveReferences.length > 0
    ? await Promise.all(effectiveReferences.map((scenario, index) => normalizeScenario(projectRoot, { ...scenario, change_id_hint: changeId }, index)))
    : [
        {
          id: 'desktop-reference-missing',
          screenshot_evidence_mode: 'metadata_only',
          status: 'needs_follow_up',
          blocker: 'reference_screenshot_required',
        },
      ];
  const matrixChecks = evaluateBenchmarkMatrix(benchmarkMatrixContract, scenarios);
  const payload = {
    version: 1,
    benchmark_mode: effectiveReferences.length > 0 ? 'reference_backed' : 'placeholder',
    benchmark_input_mode: inputMode,
    competitor_product: competitorProduct,
    required_modules: requiredModules,
    benchmark_matrix_contract: benchmarkMatrixContract,
    matrix_checks: matrixChecks,
    scenarios,
    report_file: null,
  };
  if (matrixChecks.some((check) => check.status !== 'pass')) {
    payload.matrix_status = 'needs_follow_up';
  } else {
    payload.matrix_status = 'pass';
  }
  if (effectiveReferences.length > 0) {
    const reportPath = resolveChangePath(projectRoot, changeId, 'visual_benchmark_report.html');
    renderVisualBenchmarkReport({
      projectRoot,
      outputPath: reportPath,
      artifact: payload,
    });
    payload.report_file = reportPath;
  }
  writeJsonFile(outputPath, payload);
  const scenariosPass = scenarios.every((scenario) => scenario.status === 'pass');
  const matrixPass = payload.matrix_status !== 'needs_follow_up';
  return {
    ok: true,
    status: effectiveReferences.length > 0 && scenariosPass && matrixPass ? 'pass' : 'needs_follow_up',
    output_file: outputPath,
    report_file: payload.report_file,
    payload,
  };
}
