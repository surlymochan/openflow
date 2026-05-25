import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

function normalizeAttributes(node = {}, panelAttr = 'data-panel') {
  if (node.attributes && typeof node.attributes === 'object' && !Array.isArray(node.attributes)) {
    return node.attributes;
  }
  if (node.attrs && typeof node.attrs === 'object' && !Array.isArray(node.attrs)) {
    return node.attrs;
  }
  if (Array.isArray(node.attributes)) {
    return Object.fromEntries(node.attributes
      .map((entry) => Array.isArray(entry) ? entry : [entry?.name, entry?.value])
      .filter(([name]) => typeof name === 'string'));
  }
  if (Array.isArray(node.attribute_list)) {
    return Object.fromEntries(node.attribute_list
      .map((entry) => [entry?.name, entry?.value])
      .filter(([name]) => typeof name === 'string'));
  }
  if (node.dataset && typeof node.dataset === 'object' && !Array.isArray(node.dataset)) {
    const datasetEntries = Object.entries(node.dataset).map(([key, value]) => [`data-${key.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)}`, value]);
    return Object.fromEntries(datasetEntries);
  }
  return panelAttr in node ? { [panelAttr]: node[panelAttr] } : {};
}

function resolvePanelId(node = {}, panelAttr = 'data-panel') {
  if (typeof node.panel_id === 'string' && node.panel_id.trim()) return node.panel_id.trim();
  const attributes = normalizeAttributes(node, panelAttr);
  if (typeof attributes[panelAttr] === 'string' && attributes[panelAttr].trim()) return attributes[panelAttr].trim();
  if (typeof node.id === 'string' && node.id.trim()) return node.id.trim();
  return null;
}

function normalizeRect(node = {}) {
  if (node.boundingClientRect && typeof node.boundingClientRect === 'object') {
    const rect = node.boundingClientRect;
    if (Number.isFinite(rect.left) && Number.isFinite(rect.top) && Number.isFinite(rect.width) && Number.isFinite(rect.height)) {
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    }
  }
  if (node.rect && typeof node.rect === 'object') {
    const rect = node.rect;
    if (Number.isFinite(rect.left) && Number.isFinite(rect.top) && Number.isFinite(rect.width) && Number.isFinite(rect.height)) {
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    }
  }
  if (node.box && typeof node.box === 'object') {
    const box = node.box;
    if (Number.isFinite(box.x) && Number.isFinite(box.y) && Number.isFinite(box.width) && Number.isFinite(box.height)) {
      return { left: box.x, top: box.y, width: box.width, height: box.height };
    }
  }
  if (Number.isFinite(node.left) && Number.isFinite(node.top) && Number.isFinite(node.width) && Number.isFinite(node.height)) {
    return { left: node.left, top: node.top, width: node.width, height: node.height };
  }
  return null;
}

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

export function exportDomRectsFromSnapshot(snapshot, options = {}) {
  const panelAttr = options.panelAttr || 'data-panel';
  const nodes = pickNodes(snapshot);
  const byPanelId = new Map();

  for (const node of nodes) {
    const panelId = resolvePanelId(node, panelAttr);
    const rect = normalizeRect(node);
    if (!panelId || !rect) continue;
    if (!(rect.width > 0 && rect.height > 0)) continue;
    const area = rect.width * rect.height;
    const selector = typeof node.selector === 'string' ? node.selector : null;
    const candidate = {
      panel_id: panelId,
      selector,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      _area: area,
    };
    const current = byPanelId.get(panelId);
    if (!current || candidate._area > current._area) {
      byPanelId.set(panelId, candidate);
    }
  }

  const domRects = Array.from(byPanelId.values())
    .sort((left, right) => {
      if (left.left !== right.left) return left.left - right.left;
      if (left.top !== right.top) return left.top - right.top;
      return left.panel_id.localeCompare(right.panel_id);
    })
    .map(({ _area, ...entry }) => entry);

  return {
    dom_rects: domRects,
    panel_attr: panelAttr,
    input_nodes: nodes.length,
    extracted_panels: domRects.length,
  };
}

export function exportDomRectsToFile({ inputPath, outputPath, panelAttr = 'data-panel' }) {
  const snapshot = JSON.parse(readFileSync(inputPath, 'utf8'));
  const payload = exportDomRectsFromSnapshot(snapshot, { panelAttr });
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(payload, null, 2));
  return payload;
}

export function resolveCliPath(projectRoot, maybeRelativePath) {
  return resolve(projectRoot, maybeRelativePath);
}
