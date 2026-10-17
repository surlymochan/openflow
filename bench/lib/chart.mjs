function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function barHeight(rate, plotHeight) {
  if (rate == null || Number.isNaN(rate)) return 0;
  return Math.max(0, Math.min(plotHeight, rate * plotHeight));
}

/**
 * Grouped bars: detection rate and false-positive rate per arm.
 * White background so the chart stays readable on light and dark GitHub.
 */
export function renderChart(arms) {
  const width = 840;
  const height = 460;
  const margin = { top: 64, right: 32, bottom: 108, left: 64 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const groupWidth = plotWidth / Math.max(arms.length, 1);
  const barWidth = Math.min(46, groupWidth * 0.28);
  const gap = 10;
  const colors = { detection: '#1d4e89', falsePositive: '#b45309' };
  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">`);
  parts.push('<rect width="100%" height="100%" fill="#ffffff"/>');
  parts.push('<text x="32" y="32" fill="#172026" font-family="ui-sans-serif, system-ui, sans-serif" font-size="18" font-weight="700">Detection rate and false-positive rate</text>');
  parts.push('<text x="32" y="52" fill="#44515c" font-family="ui-sans-serif, system-ui, sans-serif" font-size="12">Detection: faulty scenarios judged REJECT. False positive: honest scenarios judged REJECT.</text>');

  const originY = margin.top + plotHeight;
  for (const tick of [0, 0.25, 0.5, 0.75, 1]) {
    const y = originY - tick * plotHeight;
    parts.push(`<line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" stroke="#d0d7de" stroke-width="1"/>`);
    parts.push(`<text x="${margin.left - 8}" y="${y + 4}" text-anchor="end" fill="#172026" font-family="ui-sans-serif, system-ui, sans-serif" font-size="11">${Math.round(tick * 100)}%</text>`);
  }
  parts.push(`<line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${originY}" stroke="#172026" stroke-width="1.5"/>`);
  parts.push(`<line x1="${margin.left}" y1="${originY}" x2="${width - margin.right}" y2="${originY}" stroke="#172026" stroke-width="1.5"/>`);

  arms.forEach((arm, index) => {
    const center = margin.left + groupWidth * index + groupWidth / 2;
    const detectionX = center - barWidth - gap / 2;
    const falseX = center + gap / 2;
    const detectionH = barHeight(arm.detection, plotHeight);
    const falseH = barHeight(arm.falsePositive, plotHeight);
    parts.push(`<rect x="${detectionX}" y="${originY - detectionH}" width="${barWidth}" height="${detectionH}" fill="${colors.detection}"/>`);
    parts.push(`<rect x="${falseX}" y="${originY - falseH}" width="${barWidth}" height="${falseH}" fill="${colors.falsePositive}"/>`);
    const detectionLabel = arm.detection == null ? 'n/a' : `${(arm.detection * 100).toFixed(1)}%`;
    const falseLabel = arm.falsePositive == null ? 'n/a' : `${(arm.falsePositive * 100).toFixed(1)}%`;
    parts.push(`<text x="${detectionX + barWidth / 2}" y="${originY - detectionH - 6}" text-anchor="middle" fill="#172026" font-family="ui-sans-serif, system-ui, sans-serif" font-size="11">${detectionLabel}</text>`);
    parts.push(`<text x="${falseX + barWidth / 2}" y="${originY - falseH - 6}" text-anchor="middle" fill="#172026" font-family="ui-sans-serif, system-ui, sans-serif" font-size="11">${falseLabel}</text>`);
    parts.push(`<text x="${center}" y="${originY + 22}" text-anchor="middle" fill="#172026" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13" font-weight="700">${escapeXml(arm.name)}</text>`);
    parts.push(`<text x="${center}" y="${originY + 40}" text-anchor="middle" fill="#44515c" font-family="ui-sans-serif, system-ui, sans-serif" font-size="11">${escapeXml(arm.detail || '')}</text>`);
  });

  const legendY = height - 28;
  parts.push(`<rect x="32" y="${legendY - 10}" width="14" height="14" fill="${colors.detection}"/>`);
  parts.push(`<text x="52" y="${legendY + 2}" fill="#172026" font-family="ui-sans-serif, system-ui, sans-serif" font-size="12">Detection rate</text>`);
  parts.push(`<rect x="180" y="${legendY - 10}" width="14" height="14" fill="${colors.falsePositive}"/>`);
  parts.push(`<text x="200" y="${legendY + 2}" fill="#172026" font-family="ui-sans-serif, system-ui, sans-serif" font-size="12">False-positive rate</text>`);
  parts.push('</svg>');
  return `${parts.join('\n')}\n`;
}
