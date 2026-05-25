import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

function pickNodes(snapshot) {
  if (Array.isArray(snapshot)) return snapshot;
  const collected = [];
  if (Array.isArray(snapshot?.nodes)) collected.push(...snapshot.nodes);
  if (Array.isArray(snapshot?.states)) {
    for (const state of snapshot.states) {
      if (Array.isArray(state?.nodes)) collected.push(...state.nodes);
    }
  }
  if (collected.length > 0) return collected;
  if (Array.isArray(snapshot?.dom_snapshot?.nodes)) return snapshot.dom_snapshot.nodes;
  if (Array.isArray(snapshot?.snapshot?.nodes)) return snapshot.snapshot.nodes;
  return [];
}

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeColor(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed || null;
}

function toDurationMs(value) {
  if (typeof value !== 'string') return [];
  return value
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .flatMap((entry) => {
      if (!entry || entry === '0s' || entry === '0ms') return [0];
      if (entry.endsWith('ms')) {
        const parsed = Number.parseFloat(entry.slice(0, -2));
        return Number.isFinite(parsed) ? [parsed] : [];
      }
      if (entry.endsWith('s')) {
        const parsed = Number.parseFloat(entry.slice(0, -1));
        return Number.isFinite(parsed) ? [parsed * 1000] : [];
      }
      return [];
    });
}

function toStringList(value) {
  if (typeof value !== 'string') return [];
  const entries = [];
  let current = '';
  let depth = 0;
  for (const char of value) {
    if (char === '(') depth += 1;
    if (char === ')') depth = Math.max(0, depth - 1);
    if (char === ',' && depth === 0) {
      const normalized = current.trim().toLowerCase();
      if (normalized) entries.push(normalized);
      current = '';
      continue;
    }
    current += char;
  }
  const normalized = current.trim().toLowerCase();
  if (normalized) entries.push(normalized);
  return entries;
}

function pushUnique(list, value) {
  if (value === null || value === undefined) return;
  if (!list.includes(value)) list.push(value);
}

function summarizeFamilyStyles(entries = []) {
  const textSizes = [];
  const lineHeights = [];
  const radiusValues = [];
  const borderWidths = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    pushUnique(textSizes, toNumber(entry.fontSize));
    pushUnique(lineHeights, toNumber(entry.lineHeight));
    pushUnique(radiusValues, toNumber(entry.borderRadius));
    pushUnique(borderWidths, toNumber(entry.borderWidth));
  }
  return {
    text_sizes: textSizes.sort((a, b) => a - b),
    line_heights: lineHeights.sort((a, b) => a - b),
    radius_values: radiusValues.sort((a, b) => a - b),
    border_widths: borderWidths.sort((a, b) => a - b),
  };
}

function classifyBorderWeight(value) {
  if (!Number.isFinite(value) || value <= 0) return null;
  if (value <= 1) return 'hairline';
  if (value <= 2) return 'regular';
  return 'strong';
}

function classifyShadowStrength(signature) {
  if (typeof signature !== 'string' || !signature.trim()) return null;
  const numbers = signature.match(/-?\d*\.?\d+/g)?.map(Number.parseFloat).filter(Number.isFinite) || [];
  const alphaMatch = signature.match(/rgba?\([^)]*,\s*([0-9.]+)\s*\)$/);
  const alpha = alphaMatch ? Number.parseFloat(alphaMatch[1]) : 1;
  const blur = numbers.length >= 3 ? Math.abs(numbers[2]) : 0;
  const spread = numbers.length >= 4 ? Math.abs(numbers[3]) : 0;
  const score = (blur + spread) * (Number.isFinite(alpha) ? alpha : 1);
  if (score <= 4) return 'subtle';
  if (score <= 12) return 'medium';
  return 'strong';
}

function median(values = []) {
  const normalized = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (normalized.length === 0) return null;
  const middle = Math.floor(normalized.length / 2);
  if (normalized.length % 2 === 1) return normalized[middle];
  return (normalized[middle - 1] + normalized[middle]) / 2;
}

function detectPlatformPhysicsProfiles({
  platformProfile,
  transitionDurations,
  transitionTimingFunctions,
  componentSemantics,
  touchTargetSizes,
  safeAreaTopInset,
  safeAreaBottomInset,
}) {
  const profiles = [];
  const meaningfulDurations = transitionDurations.filter((value) => Number.isFinite(value) && value > 0);
  const durationMedian = median(meaningfulDurations);
  const semantics = new Set(componentSemantics);
  const timings = transitionTimingFunctions.map((entry) => entry.toLowerCase());
  const hasBezier = timings.some((entry) => entry.includes('cubic-bezier'));
  const hasEaseFamily = timings.some((entry) => entry.includes('ease'));
  const maxTouch = touchTargetSizes.length > 0 ? Math.max(...touchTargetSizes) : null;
  const hasSafeArea = Number.isFinite(safeAreaTopInset) && safeAreaTopInset > 0
    || Number.isFinite(safeAreaBottomInset) && safeAreaBottomInset > 0;

  if (
    platformProfile === 'ios_phone'
    && maxTouch !== null && maxTouch >= 44
    && (
      (durationMedian !== null && durationMedian >= 180 && durationMedian <= 460)
      || hasBezier
      || hasEaseFamily
    )
    && (semantics.has('bottom_sheet') || semantics.has('tab_bar') || semantics.has('segmented_control') || hasSafeArea)
  ) {
    profiles.push('ios_spring');
  }

  if (
    platformProfile === 'android_phone'
    && maxTouch !== null && maxTouch >= 40
    && (
      (durationMedian !== null && durationMedian >= 90 && durationMedian <= 280)
      || hasBezier
      || hasEaseFamily
    )
    && (semantics.has('floating_primary_action') || semantics.has('tab_bar') || semantics.has('pull_to_refresh_indicator'))
  ) {
    profiles.push('android_ripple');
  }

  if (
    platformProfile === 'mobile_h5'
    && maxTouch !== null && maxTouch >= 40
    && (
      (durationMedian !== null && durationMedian >= 100 && durationMedian <= 320)
      || timings.some((entry) => entry !== 'linear')
    )
  ) {
    profiles.push('mobile_h5_smooth');
  }

  return profiles.sort();
}

export function exportVisualTokensFromSnapshot(snapshot) {
  const nodes = pickNodes(snapshot);
  const viewportMetrics = snapshot?.viewport_metrics && typeof snapshot.viewport_metrics === 'object'
    ? snapshot.viewport_metrics
    : {};
  const fontFamilies = [];
  const fontWeights = [];
  const textSizes = [];
  const lineHeights = [];
  const letterSpacings = [];
  const radiusValues = [];
  const spacingValues = [];
  const borderWidths = [];
  const borderStyles = [];
  const shadowSignatures = [];
  const borderWeightTiers = [];
  const shadowStrengthTiers = [];
  const iconDensityValues = [];
  const iconSizeValues = [];
  const touchTargetSizes = [];
  let bottomSheetHandlePresent = false;
  let tabbarActiveStatePresent = false;
  let floatingPrimaryActionPresent = false;
  let segmentedControlActivePresent = false;
  let loadingStatePresent = false;
  let skeletonStatePresent = false;
  let errorStatePresent = false;
  let searchActivePresent = false;
  const transitionDurations = [];
  const transitionTimingFunctions = [];
  const animationDurations = [];
  const listRowHeights = [];
  const toolbarControlDensityValues = [];
  const detailBlockSpacingValues = [];
  const toolbarControlStyleEntries = [];
  const listRowStyleEntries = [];
  const detailBlockStyleEntries = [];
  const colorRoles = {};
  const componentSemantics = new Set();

  for (const node of nodes) {
    const styles = node?.computedStyle;
    if (!styles || typeof styles !== 'object') continue;

    const fontFamily = typeof styles.fontFamily === 'string' ? styles.fontFamily.trim() : null;
    if (fontFamily) {
      fontFamily.split(',')
        .map((entry) => entry.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean)
        .forEach((entry) => pushUnique(fontFamilies, entry));
    }

    pushUnique(fontWeights, toNumber(styles.fontWeight));
    pushUnique(textSizes, toNumber(styles.fontSize));
    pushUnique(lineHeights, toNumber(styles.lineHeight));
    pushUnique(letterSpacings, toNumber(styles.letterSpacing));

    for (const key of ['borderRadius', 'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius']) {
      pushUnique(radiusValues, toNumber(styles[key]));
    }

    pushUnique(borderWidths, toNumber(styles.borderWidth));
    pushUnique(borderWeightTiers, classifyBorderWeight(toNumber(styles.borderWidth)));
    if (typeof styles.borderStyle === 'string') {
      const normalizedBorderStyle = styles.borderStyle.trim().toLowerCase();
      if (normalizedBorderStyle && normalizedBorderStyle !== 'none') pushUnique(borderStyles, normalizedBorderStyle);
    }
    if (typeof styles.boxShadow === 'string') {
      const normalizedShadow = styles.boxShadow.trim().toLowerCase();
      if (normalizedShadow && normalizedShadow !== 'none') {
        pushUnique(shadowSignatures, normalizedShadow);
        pushUnique(shadowStrengthTiers, classifyShadowStrength(normalizedShadow));
      }
    }
    for (const duration of toDurationMs(styles.transitionDuration)) pushUnique(transitionDurations, duration);
    for (const timingFn of toStringList(styles.transitionTimingFunction)) pushUnique(transitionTimingFunctions, timingFn);
    for (const duration of toDurationMs(styles.animationDuration)) pushUnique(animationDurations, duration);

    for (const key of ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'rowGap', 'columnGap', 'gap']) {
      pushUnique(spacingValues, toNumber(styles[key]));
    }

    const panelId = typeof node.panel_id === 'string' ? node.panel_id : null;
    const backgroundColor = normalizeColor(styles.backgroundColor);
    const textColor = normalizeColor(styles.color);
    const borderColor = normalizeColor(styles.borderColor);

    if (!colorRoles.canvas && panelId === 'main' && backgroundColor) colorRoles.canvas = backgroundColor;
    if (!colorRoles.surface && panelId && ['sidebar', 'detail', 'list', 'filters', 'toolbar'].includes(panelId) && backgroundColor) {
      colorRoles.surface = backgroundColor;
    }
    if (!colorRoles.text_primary && textColor) colorRoles.text_primary = textColor;
    if (!colorRoles.border_subtle && borderColor && borderColor !== 'rgba(0, 0, 0, 0)' && borderColor !== 'transparent') {
      colorRoles.border_subtle = borderColor;
    }
    if (!colorRoles.accent && backgroundColor && panelId && ['accent', 'cta', 'primary-action'].includes(panelId)) {
      colorRoles.accent = backgroundColor;
    }
    if (panelId && ['sheet', 'bottom_sheet'].includes(panelId)) componentSemantics.add('bottom_sheet');
    if (panelId && ['bottom_bar', 'tabbar', 'tab_bar'].includes(panelId)) componentSemantics.add('tab_bar');
    if (panelId && ['primary_action', 'fab'].includes(panelId)) componentSemantics.add('floating_primary_action');
    if (panelId && ['filters', 'segments', 'segmented'].includes(panelId)) componentSemantics.add('segmented_control');
    if (panelId && ['search', 'search_bar'].includes(panelId)) componentSemantics.add('search_bar');
    if (panelId && ['snackbar', 'toast'].includes(panelId)) componentSemantics.add('snackbar');
    if (panelId && ['refresh', 'refresh_indicator', 'pull_to_refresh'].includes(panelId)) componentSemantics.add('pull_to_refresh_indicator');
    if (panelId && ['loading', 'loading_state', 'progress'].includes(panelId)) componentSemantics.add('loading_state');
    if (panelId && ['skeleton', 'skeleton_state'].includes(panelId)) componentSemantics.add('skeleton_state');
    if (panelId && ['error', 'error_state'].includes(panelId)) componentSemantics.add('error_state');
    if (panelId && ['search_active', 'search_results'].includes(panelId)) componentSemantics.add('search_active');

    const iconDensity = toNumber(node?.descendantMetrics?.icon_density);
    pushUnique(iconDensityValues, iconDensity);
    if (Array.isArray(node?.descendantMetrics?.icon_rects)) {
      for (const rect of node.descendantMetrics.icon_rects) {
        const width = toNumber(rect?.width);
        const height = toNumber(rect?.height);
        pushUnique(iconSizeValues, width);
        pushUnique(iconSizeValues, height);
      }
    }
    if (Array.isArray(node?.descendantMetrics?.row_rects)) {
      for (const rect of node.descendantMetrics.row_rects) {
        pushUnique(listRowHeights, toNumber(rect?.height));
      }
    }
    if (Array.isArray(node?.descendantMetrics?.toolbar_control_styles)) {
      toolbarControlStyleEntries.push(...node.descendantMetrics.toolbar_control_styles);
    }
    if (Array.isArray(node?.descendantMetrics?.list_row_styles)) {
      listRowStyleEntries.push(...node.descendantMetrics.list_row_styles);
    }
    if (Array.isArray(node?.descendantMetrics?.detail_block_styles)) {
      detailBlockStyleEntries.push(...node.descendantMetrics.detail_block_styles);
    }
    const controlDensity = toNumber(node?.descendantMetrics?.control_density);
    if (node?.panel_id === 'toolbar') pushUnique(toolbarControlDensityValues, controlDensity);
    if (Array.isArray(node?.descendantMetrics?.control_rects)) {
      for (const rect of node.descendantMetrics.control_rects) {
        const width = toNumber(rect?.width);
        const height = toNumber(rect?.height);
        if (Number.isFinite(width) && Number.isFinite(height)) pushUnique(touchTargetSizes, Math.min(width, height));
      }
    }
    if (node?.descendantMetrics?.bottom_sheet_handle_present === true) bottomSheetHandlePresent = true;
    if (node?.descendantMetrics?.active_tab_present === true) tabbarActiveStatePresent = true;
    if (node?.descendantMetrics?.floating_primary_action_present === true) floatingPrimaryActionPresent = true;
    if (node?.descendantMetrics?.segmented_control_active_present === true) segmentedControlActivePresent = true;
    if (node?.descendantMetrics?.loading_state_present === true) loadingStatePresent = true;
    if (node?.descendantMetrics?.skeleton_state_present === true) skeletonStatePresent = true;
    if (node?.descendantMetrics?.error_state_present === true) errorStatePresent = true;
    if (node?.descendantMetrics?.search_active_present === true) searchActivePresent = true;
    if (node?.descendantMetrics?.bottom_sheet_handle_present === true) componentSemantics.add('bottom_sheet');
    if (node?.descendantMetrics?.active_tab_present === true) componentSemantics.add('tab_bar');
    if (node?.descendantMetrics?.floating_primary_action_present === true) componentSemantics.add('floating_primary_action');
    if (node?.descendantMetrics?.segmented_control_active_present === true) componentSemantics.add('segmented_control');
    if (node?.descendantMetrics?.search_bar_present === true) componentSemantics.add('search_bar');
    if (node?.descendantMetrics?.loading_state_present === true) componentSemantics.add('loading_state');
    if (node?.descendantMetrics?.skeleton_state_present === true) componentSemantics.add('skeleton_state');
    if (node?.descendantMetrics?.error_state_present === true) componentSemantics.add('error_state');
    if (node?.descendantMetrics?.search_active_present === true) componentSemantics.add('search_active');
    if (Array.isArray(node?.descendantMetrics?.detail_block_gaps)) {
      for (const gap of node.descendantMetrics.detail_block_gaps) {
        if (node?.panel_id === 'detail') pushUnique(detailBlockSpacingValues, toNumber(gap));
      }
    }
  }

  const safeAreaTopInset = toNumber(viewportMetrics.safe_area_top);
  const safeAreaBottomInset = toNumber(viewportMetrics.safe_area_bottom);
  const platformPhysicsProfiles = detectPlatformPhysicsProfiles({
    platformProfile: typeof snapshot?.platform_profile === 'string' ? snapshot.platform_profile : null,
    transitionDurations,
    transitionTimingFunctions,
    componentSemantics: Array.from(componentSemantics),
    touchTargetSizes,
    safeAreaTopInset,
    safeAreaBottomInset,
  });

  return {
    observed_visual_tokens: {
      font_families: fontFamilies,
      font_weights: fontWeights.sort((a, b) => a - b),
      text_sizes: textSizes.sort((a, b) => a - b),
      line_heights: lineHeights.sort((a, b) => a - b),
      letter_spacings: letterSpacings.sort((a, b) => a - b),
      radius_values: radiusValues.sort((a, b) => a - b),
      border_widths: borderWidths.sort((a, b) => a - b),
      border_styles: borderStyles.sort(),
      border_weight_tiers: borderWeightTiers.sort(),
      shadow_signatures: shadowSignatures.sort(),
      shadow_strength_tiers: shadowStrengthTiers.sort(),
      touch_target_sizes: touchTargetSizes.sort((a, b) => a - b),
      safe_area_top_inset: toNumber(viewportMetrics.safe_area_top),
      safe_area_bottom_inset: toNumber(viewportMetrics.safe_area_bottom),
      keyboard_inset_bottom: toNumber(viewportMetrics.keyboard_inset_bottom),
      bottom_sheet_handle_present: bottomSheetHandlePresent,
      tabbar_active_state_present: tabbarActiveStatePresent,
      floating_primary_action_present: floatingPrimaryActionPresent,
      segmented_control_active_state_present: segmentedControlActivePresent,
      loading_state_present: loadingStatePresent,
      skeleton_state_present: skeletonStatePresent,
      error_state_present: errorStatePresent,
      search_active_present: searchActivePresent,
      component_semantics: Array.from(componentSemantics).sort(),
      platform_physics_profiles: platformPhysicsProfiles,
      transition_durations: transitionDurations.sort((a, b) => a - b),
      transition_timing_functions: transitionTimingFunctions.sort(),
      animation_durations: animationDurations.sort((a, b) => a - b),
      icon_density_values: iconDensityValues.sort((a, b) => a - b),
      icon_size_values: iconSizeValues.sort((a, b) => a - b),
      list_row_heights: listRowHeights.sort((a, b) => a - b),
      toolbar_control_density_values: toolbarControlDensityValues.sort((a, b) => a - b),
      detail_block_spacing_values: detailBlockSpacingValues.sort((a, b) => a - b),
      component_family_consistency: {
        toolbar_controls: summarizeFamilyStyles(toolbarControlStyleEntries),
        list_rows: summarizeFamilyStyles(listRowStyleEntries),
        detail_blocks: summarizeFamilyStyles(detailBlockStyleEntries),
      },
      color_roles: colorRoles,
      spacing_values: spacingValues.sort((a, b) => a - b),
    },
    input_nodes: nodes.length,
  };
}

export function exportVisualTokensToFile({ inputPath, outputPath }) {
  const snapshot = JSON.parse(readFileSync(inputPath, 'utf8'));
  const payload = exportVisualTokensFromSnapshot(snapshot);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(payload, null, 2));
  return payload;
}
