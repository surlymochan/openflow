import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function loadHeldoutScenarios(dir) {
  if (!existsSync(dir)) return [];
  const rows = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = join(dir, entry.name, 'scenario.json');
    if (!existsSync(file)) continue;
    const scenario = JSON.parse(readFileSync(file, 'utf8'));
    if (!scenario.id) scenario.id = entry.name;
    scenario.set = 'heldout';
    rows.push(scenario);
  }
  rows.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return rows;
}

export function selectScenarios({ originals, heldoutDir, set = 'all', only = '' }) {
  if (!['original', 'heldout', 'all'].includes(set)) {
    throw new Error(`Unknown scenario set ${set}`);
  }
  const original = originals.map((scenario) => ({ ...scenario, set: 'original' }));
  const heldout = loadHeldoutScenarios(heldoutDir);
  let chosen = set === 'original' ? original : (set === 'heldout' ? heldout : [...original, ...heldout]);
  const ids = String(only || '').split(',').map((item) => item.trim()).filter(Boolean);
  if (ids.length) {
    const wanted = new Set(ids);
    chosen = chosen.filter((scenario) => wanted.has(scenario.id));
    const found = new Set(chosen.map((scenario) => scenario.id));
    const missing = ids.filter((id) => !found.has(id));
    if (missing.length) throw new Error(`Unknown scenario id: ${missing.join(', ')}`);
  }
  return { original, heldout, chosen };
}
