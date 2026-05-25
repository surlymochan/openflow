import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, extname } from 'node:path';

import { loadPlaywright } from './playwright-runtime.js';

const PLATFORM_PROFILES = {
  ios_phone: {
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
    waitMs: 300,
  },
  android_phone: {
    viewport: { width: 412, height: 915 },
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2.625,
    waitMs: 300,
  },
  mobile_h5: {
    viewport: { width: 393, height: 852 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
    waitMs: 250,
  },
};

function resolvePlatformProfile(platformProfile) {
  if (typeof platformProfile !== 'string') return null;
  return PLATFORM_PROFILES[platformProfile] || null;
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function deriveStateScreenshotPath(basePath, stateId, index) {
  const ext = extname(basePath);
  const suffix = `${stateId || `state-${index + 1}`}`.replace(/[^a-z0-9_-]+/gi, '-');
  if (!ext) return `${basePath}-${suffix}`;
  return `${basePath.slice(0, -ext.length)}-${suffix}${ext}`;
}

function normalizeCaptureStates(captureStates) {
  if (!Array.isArray(captureStates)) return [];
  return captureStates
    .filter((state) => state && typeof state === 'object')
    .map((state, index) => ({
      id: typeof state.id === 'string' && state.id.trim() ? state.id.trim() : `state-${index + 1}`,
      label: typeof state.label === 'string' && state.label.trim() ? state.label.trim() : null,
      hover_selector: typeof state.hover_selector === 'string' ? state.hover_selector : null,
      click_selector: typeof state.click_selector === 'string' ? state.click_selector : null,
      focus_selector: typeof state.focus_selector === 'string' ? state.focus_selector : null,
      swipe_selector: typeof state.swipe_selector === 'string' ? state.swipe_selector : null,
      swipe_direction: typeof state.swipe_direction === 'string' ? state.swipe_direction : null,
      swipe_distance: Number.isFinite(Number(state.swipe_distance)) ? Number(state.swipe_distance) : null,
      drag_selector: typeof state.drag_selector === 'string' ? state.drag_selector : null,
      drag_to_selector: typeof state.drag_to_selector === 'string' ? state.drag_to_selector : null,
      drag_dx: Number.isFinite(Number(state.drag_dx)) ? Number(state.drag_dx) : null,
      drag_dy: Number.isFinite(Number(state.drag_dy)) ? Number(state.drag_dy) : null,
      scroll_selector: typeof state.scroll_selector === 'string' ? state.scroll_selector : null,
      scroll_dx: Number.isFinite(Number(state.scroll_dx)) ? Number(state.scroll_dx) : null,
      scroll_dy: Number.isFinite(Number(state.scroll_dy)) ? Number(state.scroll_dy) : null,
      press_key: typeof state.press_key === 'string' ? state.press_key : null,
      wait_ms: Number.isFinite(Number(state.wait_ms)) ? Number(state.wait_ms) : null,
      expect_visual_change: state.expect_visual_change !== false,
      min_pixel_diff_ratio: Number.isFinite(Number(state.min_pixel_diff_ratio)) ? Number(state.min_pixel_diff_ratio) : null,
      reference_image: typeof state.reference_image === 'string' ? state.reference_image : null,
      priority_score: Number.isFinite(Number(state.priority_score)) ? Number(state.priority_score) : 100,
      priority_reason: typeof state.priority_reason === 'string' ? state.priority_reason : 'manual',
      source: typeof state.source === 'string' ? state.source : 'manual',
      workbench_state_type: typeof state.workbench_state_type === 'string' && state.workbench_state_type.trim()
        ? state.workbench_state_type.trim()
        : null,
      state_tags: Array.isArray(state.state_tags)
        ? state.state_tags.filter((tag) => typeof tag === 'string' && tag.trim()).map((tag) => tag.trim())
        : [],
      component_family: typeof state.component_family === 'string' && state.component_family.trim()
        ? state.component_family.trim()
        : null,
      state_variant: typeof state.state_variant === 'string' && state.state_variant.trim()
        ? state.state_variant.trim()
        : null,
      expect_motion: state.expect_motion === true,
      sample_frames: Number.isFinite(Number(state.sample_frames)) ? Number(state.sample_frames) : 0,
      frame_interval_ms: Number.isFinite(Number(state.frame_interval_ms)) ? Number(state.frame_interval_ms) : null,
      min_motion_changed_frames: Number.isFinite(Number(state.min_motion_changed_frames)) ? Number(state.min_motion_changed_frames) : null,
      actions: Array.isArray(state.actions) ? state.actions : [],
    }));
}

async function captureViewportMetrics(page) {
  return page.evaluate(() => {
    function envInset(name) {
      const probe = document.createElement('div');
      probe.style.position = 'fixed';
      probe.style.pointerEvents = 'none';
      probe.style.opacity = '0';
      probe.style.paddingTop = name === 'top' ? 'env(safe-area-inset-top)' : '0px';
      probe.style.paddingBottom = name === 'bottom' ? 'env(safe-area-inset-bottom)' : '0px';
      document.body.appendChild(probe);
      const computed = window.getComputedStyle(probe);
      const raw = name === 'top' ? computed.paddingTop : computed.paddingBottom;
      probe.remove();
      const parsed = Number.parseFloat(raw || '0');
      return Number.isFinite(parsed) ? parsed : 0;
    }

    const vv = window.visualViewport;
    const innerHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const innerWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const visualHeight = vv?.height || innerHeight;
    const visualWidth = vv?.width || innerWidth;
    const offsetTop = vv?.offsetTop || 0;
    const offsetLeft = vv?.offsetLeft || 0;
    const keyboardInsetBottom = Math.max(0, innerHeight - (visualHeight + offsetTop));

    return {
      safe_area_top: envInset('top'),
      safe_area_bottom: envInset('bottom'),
      visual_viewport_height: Number(visualHeight),
      visual_viewport_width: Number(visualWidth),
      visual_viewport_offset_top: Number(offsetTop),
      visual_viewport_offset_left: Number(offsetLeft),
      keyboard_inset_bottom: Number(keyboardInsetBottom),
    };
  });
}

function inferWorkbenchStateMetadata({ label = '', attributes = {} } = {}) {
  const text = `${label} ${attributes['aria-label'] || ''} ${attributes['data-state-target'] || ''}`.trim().toLowerCase();
  const stateTags = [];
  let workbenchStateType = null;
  let priorityReason = null;
  let priorityBonus = 0;

  if (attributes['aria-expanded'] === 'true' || /detail|open detail|drawer|expand|show more|more/.test(text)) {
    workbenchStateType = 'detail_open';
    priorityReason = 'primary-detail-open';
    priorityBonus += 22;
    stateTags.push('detail', 'open');
  }

  if (/filter|filters|refine|segment/.test(text)) {
    if (!workbenchStateType) workbenchStateType = 'active_filter';
    if (!priorityReason) priorityReason = 'primary-filter-active';
    priorityBonus += 18;
    stateTags.push('filters');
  }

  if (/select all|bulk|multi-select|batch/.test(text)) {
    workbenchStateType = 'bulk_select_mode';
    priorityReason = 'primary-bulk-select';
    priorityBonus += 20;
    stateTags.push('bulk-select');
  } else if (/select|selected|row|item|card/.test(text)) {
    if (!workbenchStateType) workbenchStateType = 'selected_item';
    if (!priorityReason) priorityReason = 'primary-selected-item';
    priorityBonus += 14;
    stateTags.push('selection');
  }

  return {
    workbench_state_type: workbenchStateType,
    state_tags: Array.from(new Set(stateTags)),
    priority_reason: priorityReason,
    priority_bonus: priorityBonus,
  };
}

async function discoverCaptureStates(page, limit = 4) {
  const discovered = await page.evaluate((maxStates) => {
    function selectorFor(element) {
      if (element.id) return `#${element.id}`;
      if (element.getAttribute('data-state-target')) return `[data-state-target="${element.getAttribute('data-state-target')}"]`;
      if (element.getAttribute('data-panel')) return `[data-panel="${element.getAttribute('data-panel')}"]`;
      if (element.getAttribute('aria-controls')) return `[aria-controls="${element.getAttribute('aria-controls')}"]`;
      return null;
    }

    function inferComponentFamily(element) {
      const panel = element.closest('[data-panel]')?.getAttribute('data-panel');
      if (panel === 'toolbar') return 'toolbar_controls';
      if (panel === 'list') return 'list_rows';
      if (panel === 'detail') return 'detail_blocks';
      return panel ? `${panel}_controls` : null;
    }

    function basePriority(element) {
      let score = 40;
      if (element.hasAttribute('aria-expanded')) score += 30;
      if (element.hasAttribute('data-state-target')) score += 24;
      if (element.hasAttribute('aria-controls')) score += 20;
      if (element.tagName.toLowerCase() === 'summary') score += 22;
      if (element.id) score += 10;
      if (element.getAttribute('data-panel') === 'toolbar') score += 14;
      const text = (element.textContent || element.getAttribute('aria-label') || '').trim().toLowerCase();
      if (/detail|open|expand|more|filter|select|show/.test(text)) score += 18;
      if (/row|item|card/.test(text)) score += 8;
      if ((element.textContent || '').trim()) score += 6;
      return score;
    }

    const candidates = Array.from(document.querySelectorAll('button,[role="button"],summary,[aria-expanded],[data-state-target]'));
    const states = [];
    for (const element of candidates) {
      if (states.length >= maxStates) break;
      const selector = selectorFor(element);
      if (!selector) continue;
      const label = (element.textContent || element.getAttribute('aria-label') || element.id || element.tagName || '').trim().slice(0, 32) || 'interactive';
      const baseScore = basePriority(element);
      const attrs = {};
      for (const name of element.getAttributeNames()) attrs[name] = element.getAttribute(name);
      const semantic = (() => {
        const text = `${label} ${attrs['aria-label'] || ''} ${attrs['data-state-target'] || ''}`.trim().toLowerCase();
        const stateTags = [];
        let workbenchStateType = null;
        let priorityReason = null;
        let priorityBonus = 0;
        if (attrs['aria-expanded'] === 'true' || /detail|open detail|drawer|expand|show more|more/.test(text)) {
          workbenchStateType = 'detail_open';
          priorityReason = 'primary-detail-open';
          priorityBonus += 22;
          stateTags.push('detail', 'open');
        }
        if (/filter|filters|refine|segment/.test(text)) {
          if (!workbenchStateType) workbenchStateType = 'active_filter';
          if (!priorityReason) priorityReason = 'primary-filter-active';
          priorityBonus += 18;
          stateTags.push('filters');
        }
        if (/select all|bulk|multi-select|batch/.test(text)) {
          workbenchStateType = 'bulk_select_mode';
          priorityReason = 'primary-bulk-select';
          priorityBonus += 20;
          stateTags.push('bulk-select');
        } else if (/select|selected|row|item|card/.test(text)) {
          if (!workbenchStateType) workbenchStateType = 'selected_item';
          if (!priorityReason) priorityReason = 'primary-selected-item';
          priorityBonus += 14;
          stateTags.push('selection');
        }
        return {
          workbench_state_type: workbenchStateType,
          state_tags: Array.from(new Set(stateTags)),
          priority_reason: priorityReason,
          priority_bonus: priorityBonus,
        };
      })();
      states.push({
        id: `auto-hover-${states.length + 1}`,
        label: `hover:${label}`,
        hover_selector: selector,
        wait_ms: 80,
        priority_score: baseScore + semantic.priority_bonus,
        priority_reason: semantic.priority_reason || 'interactive-hover-candidate',
        source: 'auto_discovered',
        workbench_state_type: semantic.workbench_state_type,
        state_tags: semantic.state_tags,
        component_family: inferComponentFamily(element),
        state_variant: 'hover',
      });
      if (states.length >= maxStates) break;
      states.push({
        id: `auto-click-${states.length + 1}`,
        label: `click:${label}`,
        click_selector: selector,
        wait_ms: 120,
        priority_score: baseScore + 8 + semantic.priority_bonus,
        priority_reason: semantic.priority_reason || 'interactive-click-candidate',
        source: 'auto_discovered',
        workbench_state_type: semantic.workbench_state_type,
        state_tags: semantic.state_tags,
        component_family: inferComponentFamily(element),
        state_variant: 'active',
      });
    }
    return states
      .sort((left, right) => (right.priority_score || 0) - (left.priority_score || 0))
      .slice(0, maxStates);
  }, Number.isFinite(Number(limit)) ? Number(limit) : 4);
  return normalizeCaptureStates(discovered);
}

async function applyCaptureState(page, state = {}) {
  const actions = [];
  if (state.hover_selector) actions.push({ type: 'hover', selector: state.hover_selector });
  if (state.click_selector) actions.push({ type: 'click', selector: state.click_selector });
  if (state.focus_selector) actions.push({ type: 'focus', selector: state.focus_selector });
  if (state.swipe_selector) {
    actions.push({
      type: 'swipe',
      selector: state.swipe_selector,
      direction: state.swipe_direction || 'up',
      distance: state.swipe_distance,
    });
  }
  if (state.drag_selector) {
    actions.push({
      type: 'drag',
      selector: state.drag_selector,
      to_selector: state.drag_to_selector || null,
      dx: state.drag_dx,
      dy: state.drag_dy,
    });
  }
  if (state.scroll_selector || Number.isFinite(state.scroll_dx) || Number.isFinite(state.scroll_dy)) {
    actions.push({
      type: 'scroll',
      selector: state.scroll_selector || null,
      dx: state.scroll_dx,
      dy: state.scroll_dy,
    });
  }
  if (state.press_key) actions.push({ type: 'press', key: state.press_key });
  if (Array.isArray(state.actions)) actions.push(...state.actions);

  for (const action of actions) {
    if (!action || typeof action !== 'object') continue;
    switch (action.type) {
      case 'hover':
        if (typeof action.selector === 'string') await page.locator(action.selector).first().hover();
        break;
      case 'click':
        if (typeof action.selector === 'string') await page.locator(action.selector).first().click();
        break;
      case 'focus':
        if (typeof action.selector === 'string') await page.locator(action.selector).first().focus();
        break;
      case 'swipe': {
        if (typeof action.selector === 'string') {
          const locator = page.locator(action.selector).first();
          const box = await locator.boundingBox();
          if (box) {
            const centerX = box.x + (box.width / 2);
            const centerY = box.y + (box.height / 2);
            const distance = Number.isFinite(Number(action.distance))
              ? Number(action.distance)
              : Math.max(48, Math.min(box.width, box.height) * 0.6);
            let endX = centerX;
            let endY = centerY;
            switch ((action.direction || 'up').toLowerCase()) {
              case 'down':
                endY += distance;
                break;
              case 'left':
                endX -= distance;
                break;
              case 'right':
                endX += distance;
                break;
              case 'up':
              default:
                endY -= distance;
                break;
            }
            await page.mouse.move(centerX, centerY);
            await page.mouse.down();
            await page.mouse.move(endX, endY, { steps: 8 });
            await page.mouse.up();
          }
        }
        break;
      }
      case 'drag': {
        if (typeof action.selector === 'string') {
          const locator = page.locator(action.selector).first();
          const fromBox = await locator.boundingBox();
          if (fromBox) {
            const startX = fromBox.x + (fromBox.width / 2);
            const startY = fromBox.y + (fromBox.height / 2);
            let endX = startX + (Number.isFinite(Number(action.dx)) ? Number(action.dx) : 0);
            let endY = startY + (Number.isFinite(Number(action.dy)) ? Number(action.dy) : 0);
            if (typeof action.to_selector === 'string') {
              const targetBox = await page.locator(action.to_selector).first().boundingBox();
              if (targetBox) {
                endX = targetBox.x + (targetBox.width / 2);
                endY = targetBox.y + (targetBox.height / 2);
              }
            }
            await page.mouse.move(startX, startY);
            await page.mouse.down();
            await page.mouse.move(endX, endY, { steps: 10 });
            await page.mouse.up();
          }
        }
        break;
      }
      case 'scroll':
        if (typeof action.selector === 'string') {
          const locator = page.locator(action.selector).first();
          await locator.evaluate((element, payload) => {
            element.scrollBy(payload.dx || 0, payload.dy || 0);
          }, {
            dx: Number.isFinite(Number(action.dx)) ? Number(action.dx) : 0,
            dy: Number.isFinite(Number(action.dy)) ? Number(action.dy) : 0,
          });
        } else {
          await page.mouse.wheel(
            Number.isFinite(Number(action.dx)) ? Number(action.dx) : 0,
            Number.isFinite(Number(action.dy)) ? Number(action.dy) : 0,
          );
        }
        break;
      case 'press':
        if (typeof action.key === 'string') await page.keyboard.press(action.key);
        break;
      default:
        break;
    }
    if (Number.isFinite(Number(action.wait_ms)) && Number(action.wait_ms) > 0) {
      await page.waitForTimeout(Number(action.wait_ms));
    }
  }

  if (Number.isFinite(state.wait_ms) && state.wait_ms > 0) {
    await page.waitForTimeout(state.wait_ms);
  }
}

function deriveFrameScreenshotPath(basePath, stateId, frameIndex) {
  const ext = extname(basePath);
  const suffix = `${stateId || 'state'}-frame-${frameIndex + 1}`.replace(/[^a-z0-9_-]+/gi, '-');
  if (!ext) return `${basePath}-${suffix}`;
  return `${basePath.slice(0, -ext.length)}-${suffix}${ext}`;
}

async function captureNodes(page, { panelAttr, panelSelector, stateId = null, stateLabel = null }) {
  const effectivePanelSelector = panelSelector || `[${panelAttr}]`;
  const nodes = await page.evaluate(({ attr, selector, captureStateId, captureStateLabel }) => {
    function captureStyleSummary(element) {
      const computed = window.getComputedStyle(element);
      return {
        fontSize: computed.fontSize,
        lineHeight: computed.lineHeight,
        borderWidth: computed.borderWidth,
        borderRadius: computed.borderRadius,
        boxShadow: computed.boxShadow,
        paddingTop: computed.paddingTop,
        paddingBottom: computed.paddingBottom,
        paddingLeft: computed.paddingLeft,
        paddingRight: computed.paddingRight,
      };
    }

    const elements = Array.from(document.querySelectorAll(selector));
    return elements.map((element) => {
      const rect = element.getBoundingClientRect();
      const styles = window.getComputedStyle(element);
      const panelId = element.getAttribute(attr) || element.id || null;
      const attrs = {};
      for (const name of element.getAttributeNames()) attrs[name] = element.getAttribute(name);
      const tag = element.tagName.toLowerCase();
      const selectorHint = panelId ? `${tag}[${attr}="${panelId}"]` : tag;
      const iconElements = Array.from(element.querySelectorAll('svg, [data-icon], i, .icon, [class*="icon"]'));
      const rowElements = Array.from(element.querySelectorAll('[data-row],[role="row"],li,tr'));
      const controlElements = Array.from(element.querySelectorAll('button,input,select,textarea,[role="button"],[aria-expanded]'));
      const directChildren = Array.from(element.children || []);
      const iconRects = iconElements
        .map((icon) => {
          const iconRect = icon.getBoundingClientRect();
          return iconRect.width > 0 && iconRect.height > 0 ? { width: iconRect.width, height: iconRect.height } : null;
        })
        .filter(Boolean);
      const rowRects = rowElements
        .map((row) => {
          const rowRect = row.getBoundingClientRect();
          return rowRect.width > 0 && rowRect.height > 0 ? { width: rowRect.width, height: rowRect.height } : null;
        })
        .filter(Boolean);
      const controlRects = controlElements
        .map((control) => {
          const controlRect = control.getBoundingClientRect();
          return controlRect.width > 0 && controlRect.height > 0 ? { width: controlRect.width, height: controlRect.height } : null;
        })
        .filter(Boolean);
      const floatingPrimaryActionPresent = controlElements.some((control) => {
        const controlRect = control.getBoundingClientRect();
        if (!(controlRect.width > 0 && controlRect.height > 0)) return false;
        const computed = window.getComputedStyle(control);
        const radius = Number.parseFloat(computed.borderRadius || '0') || 0;
        const isRoundish = radius >= Math.min(controlRect.width, controlRect.height) * 0.3;
        const inBottomRight = (controlRect.left + controlRect.width / 2) >= window.innerWidth * 0.55
          && (controlRect.top + controlRect.height / 2) >= window.innerHeight * 0.55;
        const sizeOk = controlRect.width >= 40 && controlRect.width <= 96 && controlRect.height >= 40 && controlRect.height <= 96;
        const position = (computed.position || '').toLowerCase();
        const floatingPosition = ['fixed', 'absolute', 'sticky'].includes(position);
        return isRoundish && inBottomRight && sizeOk && floatingPosition;
      });
      const segmentedControls = Array.from(element.querySelectorAll('[role="tab"],[aria-selected],[data-active],[data-segment],[data-segmented-control]'));
      const segmentedActiveStatePresent = segmentedControls.length >= 2 && segmentedControls.some((control) => {
        const className = typeof control.className === 'string' ? control.className.toLowerCase() : '';
        return control.getAttribute('aria-selected') === 'true'
          || control.getAttribute('aria-current') === 'page'
          || control.getAttribute('aria-current') === 'true'
          || control.getAttribute('data-active') === 'true'
          || /\b(active|selected|current)\b/.test(className);
      });
      const childRects = directChildren
        .map((child) => child.getBoundingClientRect())
        .filter((childRect) => childRect.width > 0 && childRect.height > 0)
        .sort((left, right) => left.top - right.top);
      const bottomSheetHandlePresent = directChildren.some((child) => {
        const childRect = child.getBoundingClientRect();
        if (!(childRect.width > 0 && childRect.height > 0)) return false;
        const centered = Math.abs((childRect.left + (childRect.width / 2)) - (rect.left + (rect.width / 2))) <= Math.max(24, rect.width * 0.2);
        const nearTop = (childRect.top - rect.top) <= 48;
        return centered && nearTop && childRect.width >= 24 && childRect.width <= 120 && childRect.height >= 2 && childRect.height <= 12;
      });
      const activeTabPresent = controlElements.some((control) => {
        const className = typeof control.className === 'string' ? control.className.toLowerCase() : '';
        return control.getAttribute('aria-selected') === 'true'
          || control.getAttribute('aria-current') === 'page'
          || control.getAttribute('aria-current') === 'true'
          || control.getAttribute('data-active') === 'true'
          || /\b(active|selected|current)\b/.test(className);
      });
      const area = rect.width * rect.height;
      const iconDensity = area > 0 ? (iconRects.length / area) * 10000 : 0;
      const controlDensity = area > 0 ? (controlRects.length / area) * 10000 : 0;
      const className = typeof element.className === 'string' ? element.className.toLowerCase() : '';
      const loadingNodes = Array.from(element.querySelectorAll('[aria-busy="true"],[data-loading],[class*="loading"],[class*="spinner"],[role="progressbar"],[role="status"]'));
      const skeletonNodes = Array.from(element.querySelectorAll('[data-skeleton],[class*="skeleton"],[class*="shimmer"],[class*="placeholder"]'));
      const errorNodes = Array.from(element.querySelectorAll('[role="alert"],[aria-invalid="true"],[data-error],[class*="error"],[class*="danger"]'));
      const searchNodes = Array.from(element.querySelectorAll('input[type="search"],[role="searchbox"],[data-search],[aria-label*="search" i]'));
      const panelName = (panelId || '').toLowerCase();
      const textContent = (element.textContent || '').trim().toLowerCase();
      const loadingStatePresent = loadingNodes.length > 0
        || panelName.includes('loading')
        || /\bloading\b|\bsyncing\b|\bfetching\b/.test(textContent)
        || element.getAttribute('aria-busy') === 'true';
      const skeletonStatePresent = skeletonNodes.length > 0
        || panelName.includes('skeleton')
        || /\bshimmer\b|\bplaceholder\b/.test(className);
      const errorStatePresent = errorNodes.length > 0
        || panelName.includes('error')
        || /\berror\b|\bfailed\b|\bretry\b|\bproblem\b/.test(textContent);
      const searchActivePresent = searchNodes.some((searchNode) => {
        const activeElement = document.activeElement;
        const value = typeof searchNode.value === 'string' ? searchNode.value.trim() : '';
        return activeElement === searchNode
          || value.length > 0
          || searchNode.getAttribute('aria-expanded') === 'true'
          || searchNode.closest('[aria-expanded="true"]');
      });
      const detailBlockGaps = [];
      for (let i = 1; i < childRects.length; i += 1) {
        const gap = childRects[i].top - childRects[i - 1].bottom;
        if (gap > 0) detailBlockGaps.push(gap);
      }
      const toolbarControlStyles = controlElements.map((control) => captureStyleSummary(control));
      const listRowStyles = rowElements.map((row) => captureStyleSummary(row));
      const detailBlockStyles = directChildren.map((child) => captureStyleSummary(child));
      return {
        panel_id: panelId,
        selector: selectorHint,
        capture_state_id: captureStateId,
        capture_state_label: captureStateLabel,
        attributes: attrs,
        boundingClientRect: {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        },
        descendantMetrics: {
          icon_count: iconRects.length,
          icon_density: Number(iconDensity.toFixed(4)),
          icon_rects: iconRects,
          row_rects: rowRects,
          control_count: controlRects.length,
          control_density: Number(controlDensity.toFixed(4)),
          control_rects: controlRects,
          detail_block_gaps: detailBlockGaps.map((gap) => Number(gap.toFixed(2))),
          bottom_sheet_handle_present: bottomSheetHandlePresent,
          active_tab_present: activeTabPresent,
          floating_primary_action_present: floatingPrimaryActionPresent,
          segmented_control_active_present: segmentedActiveStatePresent,
          loading_state_present: loadingStatePresent,
          skeleton_state_present: skeletonStatePresent,
          error_state_present: errorStatePresent,
          search_active_present: searchActivePresent,
          search_bar_present: searchNodes.length > 0 || panelName.includes('search'),
          toolbar_control_styles: toolbarControlStyles,
          list_row_styles: listRowStyles,
          detail_block_styles: detailBlockStyles,
        },
        computedStyle: {
          fontFamily: styles.fontFamily,
          fontWeight: styles.fontWeight,
          fontSize: styles.fontSize,
          lineHeight: styles.lineHeight,
          letterSpacing: styles.letterSpacing,
          color: styles.color,
          backgroundColor: styles.backgroundColor,
          borderColor: styles.borderColor,
          borderWidth: styles.borderWidth,
          borderStyle: styles.borderStyle,
          borderRadius: styles.borderRadius,
          borderTopLeftRadius: styles.borderTopLeftRadius,
          borderTopRightRadius: styles.borderTopRightRadius,
          borderBottomLeftRadius: styles.borderBottomLeftRadius,
          borderBottomRightRadius: styles.borderBottomRightRadius,
          boxShadow: styles.boxShadow,
          transitionDuration: styles.transitionDuration,
          transitionTimingFunction: styles.transitionTimingFunction,
          animationDuration: styles.animationDuration,
          paddingTop: styles.paddingTop,
          paddingRight: styles.paddingRight,
          paddingBottom: styles.paddingBottom,
          paddingLeft: styles.paddingLeft,
          marginTop: styles.marginTop,
          marginRight: styles.marginRight,
          marginBottom: styles.marginBottom,
          marginLeft: styles.marginLeft,
          rowGap: styles.rowGap,
          columnGap: styles.columnGap,
          gap: styles.gap,
        },
      };
    });
  }, { attr: panelAttr, selector: effectivePanelSelector, captureStateId: stateId, captureStateLabel: stateLabel });
  return { nodes, effectivePanelSelector };
}

export async function capturePageEvidence({
  url,
  screenshotPath,
  snapshotPath,
  width = 1440,
  height = 900,
  waitMs = 250,
  platformProfile = null,
  panelAttr = 'data-panel',
  panelSelector,
  captureStates = [],
  autoDiscoverStates = false,
  stateLimit = 4,
}) {
  if (!url) throw new Error('url is required for capturePageEvidence');
  if (!screenshotPath) throw new Error('screenshotPath is required for capturePageEvidence');
  if (!snapshotPath) throw new Error('snapshotPath is required for capturePageEvidence');

  const playwright = await loadPlaywright();
  const browser = await playwright.chromium.launch({ headless: true });
  try {
    const profile = resolvePlatformProfile(platformProfile);
    const openPage = async () => {
      const page = await browser.newPage({
        viewport: {
          width: toNumber(width, profile?.viewport?.width ?? 1440),
          height: toNumber(height, profile?.viewport?.height ?? 900),
        },
        userAgent: profile?.userAgent,
        isMobile: profile?.isMobile === true,
        hasTouch: profile?.hasTouch === true,
        deviceScaleFactor: profile?.deviceScaleFactor,
      });
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      const effectiveWaitMs = toNumber(waitMs, profile?.waitMs ?? 0);
      if (effectiveWaitMs > 0) await page.waitForTimeout(effectiveWaitMs);
      return page;
    };

    const page = await openPage();
    const { nodes, effectivePanelSelector } = await captureNodes(page, { panelAttr, panelSelector });
    const viewportMetrics = await captureViewportMetrics(page);

    mkdirSync(dirname(screenshotPath), { recursive: true });
    mkdirSync(dirname(snapshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: false });
    await page.close();

    const normalizedStates = normalizeCaptureStates(captureStates);
    let discoveredStates = [];
    if (autoDiscoverStates) {
      const discoveryPage = await openPage();
      try {
        discoveredStates = await discoverCaptureStates(discoveryPage, stateLimit);
      } finally {
        await discoveryPage.close();
      }
    }
    const effectiveStates = [...normalizedStates];
    for (const discovered of discoveredStates) {
      if (!effectiveStates.some((state) => state.id === discovered.id)) effectiveStates.push(discovered);
    }
    effectiveStates.sort((left, right) => (right.priority_score || 0) - (left.priority_score || 0));
    const stateSnapshots = [];
    for (let index = 0; index < effectiveStates.length; index += 1) {
      const state = effectiveStates[index];
      const statePage = await openPage();
      await applyCaptureState(statePage, state);
      const stateCapture = await captureNodes(statePage, {
        panelAttr,
        panelSelector,
        stateId: state.id,
        stateLabel: state.label,
      });
      const stateScreenshotPath = deriveStateScreenshotPath(screenshotPath, state.id, index);
      mkdirSync(dirname(stateScreenshotPath), { recursive: true });
      await statePage.screenshot({ path: stateScreenshotPath, fullPage: false });
      const frameScreenshotFiles = [];
      const sampleFrames = Number.isFinite(Number(state.sample_frames)) ? Math.max(0, Number(state.sample_frames)) : 0;
      const frameIntervalMs = Number.isFinite(Number(state.frame_interval_ms)) ? Number(state.frame_interval_ms) : 40;
      for (let frameIndex = 0; frameIndex < sampleFrames; frameIndex += 1) {
        if (frameIntervalMs > 0) await statePage.waitForTimeout(frameIntervalMs);
        const frameScreenshotPath = deriveFrameScreenshotPath(screenshotPath, state.id, frameIndex);
        mkdirSync(dirname(frameScreenshotPath), { recursive: true });
        await statePage.screenshot({ path: frameScreenshotPath, fullPage: false });
        frameScreenshotFiles.push(frameScreenshotPath);
      }
      await statePage.close();
      stateSnapshots.push({
        id: state.id,
        label: state.label,
        expect_visual_change: state.expect_visual_change,
        min_pixel_diff_ratio: state.min_pixel_diff_ratio,
        reference_image: state.reference_image,
        priority_score: state.priority_score,
        priority_reason: state.priority_reason,
        source: state.source,
        workbench_state_type: state.workbench_state_type,
        state_tags: state.state_tags,
        component_family: state.component_family,
        state_variant: state.state_variant,
        expect_motion: state.expect_motion === true,
        min_motion_changed_frames: Number.isFinite(Number(state.min_motion_changed_frames)) ? Number(state.min_motion_changed_frames) : null,
        frame_screenshot_files: frameScreenshotFiles,
        screenshot_file: stateScreenshotPath,
        nodes_captured: stateCapture.nodes.length,
        nodes: stateCapture.nodes,
      });
    }

    const snapshot = {
      url,
      panel_attr: panelAttr,
      panel_selector: effectivePanelSelector,
      viewport: {
        width: toNumber(width, profile?.viewport?.width ?? 1440),
        height: toNumber(height, profile?.viewport?.height ?? 900),
      },
      platform_profile: typeof platformProfile === 'string' ? platformProfile : null,
      viewport_metrics: viewportMetrics,
      nodes,
      states: stateSnapshots.map((state) => ({
        id: state.id,
        label: state.label,
        expect_visual_change: state.expect_visual_change,
        min_pixel_diff_ratio: state.min_pixel_diff_ratio,
        reference_image: state.reference_image,
        priority_score: state.priority_score,
        priority_reason: state.priority_reason,
        source: state.source,
        workbench_state_type: state.workbench_state_type,
        state_tags: state.state_tags,
        component_family: state.component_family,
        state_variant: state.state_variant,
        expect_motion: state.expect_motion === true,
        min_motion_changed_frames: state.min_motion_changed_frames,
        frame_screenshot_files: state.frame_screenshot_files,
        screenshot_file: state.screenshot_file,
        nodes: state.nodes,
      })),
    };
    writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
    return {
      screenshot_file: screenshotPath,
      snapshot_file: snapshotPath,
      nodes_captured: nodes.length,
      platform_profile: typeof platformProfile === 'string' ? platformProfile : null,
      panel_attr: panelAttr,
      panel_selector: effectivePanelSelector,
      viewport_metrics: viewportMetrics,
      states: stateSnapshots.map((state) => ({
        id: state.id,
        label: state.label,
        expect_visual_change: state.expect_visual_change,
        min_pixel_diff_ratio: state.min_pixel_diff_ratio,
        reference_image: state.reference_image,
        priority_score: state.priority_score,
        priority_reason: state.priority_reason,
        source: state.source,
        workbench_state_type: state.workbench_state_type,
        state_tags: state.state_tags,
        component_family: state.component_family,
        state_variant: state.state_variant,
        expect_motion: state.expect_motion,
        min_motion_changed_frames: state.min_motion_changed_frames,
        frame_screenshot_files: state.frame_screenshot_files,
        screenshot_file: state.screenshot_file,
        nodes_captured: state.nodes_captured,
      })),
      snapshot,
    };
  } finally {
    await browser.close();
  }
}
