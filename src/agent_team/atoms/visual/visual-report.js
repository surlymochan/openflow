import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toHref(projectRoot, reportPath, filePath) {
  if (!filePath || typeof filePath !== 'string') return null;
  try {
    const absolute = isAbsolute(filePath) ? filePath : resolve(projectRoot, filePath);
    return relative(dirname(reportPath), absolute).replaceAll('\\', '/');
  } catch {
    return null;
  }
}

function badge(status) {
  const color = status === 'pass' ? '#166534' : '#991b1b';
  const background = status === 'pass' ? '#dcfce7' : '#fee2e2';
  return `<span style="display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;background:${background};color:${color};font:600 12px/1.2 Inter,system-ui,sans-serif">${escapeHtml(status || 'unknown')}</span>`;
}

function renderCheckList(title, checks = []) {
  if (!Array.isArray(checks) || checks.length === 0) return '';
  return `
    <section>
      <h4>${escapeHtml(title)}</h4>
      <ul class="check-list">
        ${checks.map((check) => `
          <li>
            ${badge(check?.status)}
            <code>${escapeHtml(check?.id || 'check')}</code>
            ${check?.detail ? `<span>${escapeHtml(check.detail)}</span>` : ''}
          </li>
        `).join('')}
      </ul>
    </section>
  `;
}

function renderHotspots(hotspots = []) {
  if (!Array.isArray(hotspots) || hotspots.length === 0) return '';
  return `
    <section>
      <h4>Hotspots</h4>
      <table class="hotspot-table">
        <thead>
          <tr><th>Block</th><th>Changed</th><th>Ratio</th><th>Rect</th></tr>
        </thead>
        <tbody>
          ${hotspots.map((spot) => `
            <tr>
              <td>r${escapeHtml(spot?.row)} c${escapeHtml(spot?.col)}</td>
              <td>${escapeHtml(spot?.changed_pixels)}</td>
              <td>${typeof spot?.changed_ratio === 'number' ? spot.changed_ratio.toFixed(4) : '-'}</td>
              <td>${escapeHtml(`${spot?.x ?? 0},${spot?.y ?? 0} ${spot?.width ?? 0}x${spot?.height ?? 0}`)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </section>
  `;
}

function renderScenarioCard(projectRoot, reportPath, scenario = {}) {
  const referenceHref = toHref(projectRoot, reportPath, scenario.reference_image);
  const screenshotHref = toHref(projectRoot, reportPath, scenario.screenshot_image);
  const heatmapHref = toHref(projectRoot, reportPath, scenario.diff_metrics?.heatmap_file);
  const metricValues = scenario.diff_metrics?.values || {};
  return `
    <article class="scenario-card">
      <header class="scenario-header">
        <div>
          <h3>${escapeHtml(scenario.id || 'scenario')}</h3>
          <p>${escapeHtml(`${scenario.platform_profile || 'unprofiled'} · ${scenario.viewport?.width || '?'}x${scenario.viewport?.height || '?'}`)}</p>
        </div>
        ${badge(scenario.status)}
      </header>
      <section class="metric-strip">
        <div><label>SSIM</label><strong>${typeof metricValues.structural_similarity === 'number' ? metricValues.structural_similarity.toFixed(4) : '-'}</strong></div>
        <div><label>Layout shift</label><strong>${typeof metricValues.layout_shift_score === 'number' ? metricValues.layout_shift_score.toFixed(4) : '-'}</strong></div>
        <div><label>Pixel diff</label><strong>${typeof metricValues.pixel_diff_ratio === 'number' ? metricValues.pixel_diff_ratio.toFixed(4) : '-'}</strong></div>
      </section>
      <section class="image-grid">
        ${referenceHref ? `<figure><figcaption>Reference</figcaption><img src="${escapeHtml(referenceHref)}" alt="reference"></figure>` : ''}
        ${screenshotHref ? `<figure><figcaption>Candidate</figcaption><img src="${escapeHtml(screenshotHref)}" alt="candidate"></figure>` : ''}
        ${heatmapHref ? `<figure><figcaption>Heatmap</figcaption><img src="${escapeHtml(heatmapHref)}" alt="heatmap"></figure>` : ''}
      </section>
      ${renderHotspots(scenario.diff_metrics?.hotspots)}
      ${renderCheckList('Structure checks', scenario.structure_checks)}
      ${renderCheckList('Token checks', scenario.token_checks)}
      ${renderCheckList('State checks', scenario.state_transition_checks)}
      ${renderCheckList('Motion checks', scenario.motion_transition_checks)}
      ${renderCheckList('State contract checks', scenario.state_contract_checks)}
      ${renderCheckList('State family checks', scenario.state_family_checks)}
    </article>
  `;
}

function renderPage({ title, summary, body }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <style>
      :root { color-scheme: light dark; }
      body { margin: 0; font: 14px/1.5 Inter, system-ui, sans-serif; background: #0b1020; color: #e5ecff; }
      .shell { max-width: 1440px; margin: 0 auto; padding: 24px; }
      .hero { display: grid; gap: 12px; margin-bottom: 24px; }
      .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
      .summary-card, .scenario-card { background: rgba(15, 23, 42, 0.88); border: 1px solid rgba(148, 163, 184, 0.18); border-radius: 14px; padding: 16px; }
      .summary-card label, .metric-strip label { display: block; color: #93a4c3; font-size: 12px; margin-bottom: 4px; }
      .summary-card strong, .metric-strip strong { font-size: 18px; }
      .scenario-stack { display: grid; gap: 18px; }
      .scenario-header { display: flex; justify-content: space-between; gap: 12px; align-items: start; }
      .scenario-header h3 { margin: 0; font-size: 20px; }
      .scenario-header p { margin: 4px 0 0; color: #93a4c3; }
      .metric-strip { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; margin: 16px 0; }
      .image-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; margin-bottom: 16px; }
      figure { margin: 0; background: rgba(2, 6, 23, 0.7); border-radius: 12px; overflow: hidden; border: 1px solid rgba(148, 163, 184, 0.12); }
      figcaption { padding: 8px 10px; color: #c6d2ea; border-bottom: 1px solid rgba(148, 163, 184, 0.12); }
      img { display: block; width: 100%; height: auto; background: #fff; }
      h4 { margin: 16px 0 8px; font-size: 14px; color: #c6d2ea; }
      .check-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
      .check-list li { display: grid; gap: 6px; padding: 10px 12px; border-radius: 10px; background: rgba(30, 41, 59, 0.55); }
      .check-list code { color: #bfdbfe; }
      .hotspot-table { width: 100%; border-collapse: collapse; font-size: 12px; }
      .hotspot-table th, .hotspot-table td { text-align: left; padding: 8px 10px; border-bottom: 1px solid rgba(148, 163, 184, 0.14); }
      .prose { color: #cbd5e1; }
      a { color: #93c5fd; }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="hero">
        <h1 style="margin:0;font-size:28px">${escapeHtml(title)}</h1>
        <div class="prose">${summary}</div>
      </section>
      ${body}
    </main>
  </body>
</html>`;
}

export function renderVisualCompareReport({
  projectRoot,
  outputPath,
  title,
  summary,
  scenarios = [],
}) {
  const cards = scenarios.map((scenario) => renderScenarioCard(projectRoot, outputPath, scenario)).join('');
  const html = renderPage({
    title,
    summary,
    body: `<section class="scenario-stack">${cards}</section>`,
  });
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, html);
  return {
    output_file: outputPath,
    scenarios: scenarios.length,
  };
}

export function renderVisualBenchmarkReport({
  projectRoot,
  outputPath,
  artifact,
}) {
  const scenarios = Array.isArray(artifact?.scenarios) ? artifact.scenarios : [];
  const summary = `
    <div class="summary">
      <div class="summary-card"><label>Competitor</label><strong>${escapeHtml(artifact?.competitor_product || 'unknown')}</strong></div>
      <div class="summary-card"><label>Benchmark mode</label><strong>${escapeHtml(artifact?.benchmark_mode || 'unknown')}</strong></div>
      <div class="summary-card"><label>Input mode</label><strong>${escapeHtml(artifact?.benchmark_input_mode || 'unknown')}</strong></div>
      <div class="summary-card"><label>Matrix status</label><strong>${escapeHtml(artifact?.matrix_status || 'n/a')}</strong></div>
      <div class="summary-card"><label>Scenarios</label><strong>${scenarios.length}</strong></div>
      <div class="summary-card"><label>Modules</label><strong>${escapeHtml((artifact?.required_modules || []).join(', ') || 'none')}</strong></div>
    </div>
  `;
  return renderVisualCompareReport({
    projectRoot,
    outputPath,
    title: `${artifact?.competitor_product || 'Competitor'} visual benchmark`,
    summary,
    scenarios,
  });
}
