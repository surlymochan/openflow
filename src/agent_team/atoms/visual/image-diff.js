import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname } from 'node:path';

import { loadPlaywright } from './playwright-runtime.js';

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function fileToDataUrl(filePath) {
  const extension = extname(filePath).toLowerCase();
  const mimeType = extension === '.svg'
    ? 'image/svg+xml'
    : extension === '.png'
      ? 'image/png'
      : extension === '.jpg' || extension === '.jpeg'
        ? 'image/jpeg'
        : extension === '.webp'
          ? 'image/webp'
          : 'application/octet-stream';
  const encoded = readFileSync(filePath).toString('base64');
  return `data:${mimeType};base64,${encoded}`;
}

export async function computeImageDiffMetrics({
  referencePath,
  candidatePath,
  pixelThreshold = 16,
  blockRows = 12,
  blockCols = 12,
  heatmapOutputPath = null,
}) {
  if (!referencePath) throw new Error('referencePath is required for computeImageDiffMetrics');
  if (!candidatePath) throw new Error('candidatePath is required for computeImageDiffMetrics');

  const playwright = await loadPlaywright();
  const browser = await playwright.chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 64, height: 64 } });
    await page.setContent('<html><body></body></html>');
    const metrics = await page.evaluate(async ({ referenceUrl, candidateUrl, pixelThresholdValue, blockRowsValue, blockColsValue }) => {
      const loadImage = (src) => new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
        image.src = src;
      });

      const [referenceImage, candidateImage] = await Promise.all([
        loadImage(referenceUrl),
        loadImage(candidateUrl),
      ]);

      const width = Math.max(referenceImage.naturalWidth, candidateImage.naturalWidth);
      const height = Math.max(referenceImage.naturalHeight, candidateImage.naturalHeight);
      const makeImageData = (image) => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        context.clearRect(0, 0, width, height);
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, width, height).data;
      };

      const referenceData = makeImageData(referenceImage);
      const candidateData = makeImageData(candidateImage);
      const totalPixels = width * height;
      const blockChanged = new Array(blockRowsValue * blockColsValue).fill(false);
      const blockChangeCounts = new Array(blockRowsValue * blockColsValue).fill(0);
      let changedPixels = 0;
      let luminanceSquaredError = 0;

      for (let pixelIndex = 0; pixelIndex < totalPixels; pixelIndex += 1) {
        const base = pixelIndex * 4;
        const redDiff = Math.abs(referenceData[base] - candidateData[base]);
        const greenDiff = Math.abs(referenceData[base + 1] - candidateData[base + 1]);
        const blueDiff = Math.abs(referenceData[base + 2] - candidateData[base + 2]);
        const alphaDiff = Math.abs(referenceData[base + 3] - candidateData[base + 3]);
        const maxChannelDiff = Math.max(redDiff, greenDiff, blueDiff, alphaDiff);
        if (maxChannelDiff > pixelThresholdValue) {
          changedPixels += 1;
          const x = pixelIndex % width;
          const y = Math.floor(pixelIndex / width);
          const blockX = Math.min(blockColsValue - 1, Math.floor((x / Math.max(width, 1)) * blockColsValue));
          const blockY = Math.min(blockRowsValue - 1, Math.floor((y / Math.max(height, 1)) * blockRowsValue));
          const blockIndex = (blockY * blockColsValue) + blockX;
          blockChanged[blockIndex] = true;
          blockChangeCounts[blockIndex] += 1;
        }

        const referenceLuminance = (0.2126 * referenceData[base]) + (0.7152 * referenceData[base + 1]) + (0.0722 * referenceData[base + 2]);
        const candidateLuminance = (0.2126 * candidateData[base]) + (0.7152 * candidateData[base + 1]) + (0.0722 * candidateData[base + 2]);
        const luminanceDiff = referenceLuminance - candidateLuminance;
        luminanceSquaredError += luminanceDiff * luminanceDiff;
      }

      const changedBlocks = blockChanged.filter(Boolean).length;
      const pixelDiffRatio = totalPixels > 0 ? changedPixels / totalPixels : 0;
      const layoutShiftScore = blockChanged.length > 0 ? changedBlocks / blockChanged.length : 0;
      const rmse = totalPixels > 0 ? Math.sqrt(luminanceSquaredError / totalPixels) / 255 : 0;
      const structuralSimilarity = Math.max(0, 1 - rmse);
      const hotspots = blockChangeCounts
        .map((changedCount, index) => {
          const row = Math.floor(index / blockColsValue);
          const col = index % blockColsValue;
          const blockWidth = width / blockColsValue;
          const blockHeight = height / blockRowsValue;
          return {
            row,
            col,
            changed_pixels: changedCount,
            changed_ratio: totalPixels > 0 ? changedCount / totalPixels : 0,
            x: Math.round(col * blockWidth),
            y: Math.round(row * blockHeight),
            width: Math.round(blockWidth),
            height: Math.round(blockHeight),
          };
        })
        .filter((entry) => entry.changed_pixels > 0)
        .sort((left, right) => right.changed_pixels - left.changed_pixels)
        .slice(0, 8);

      const heatmapCanvas = document.createElement('canvas');
      heatmapCanvas.width = width;
      heatmapCanvas.height = height;
      const heatmapContext = heatmapCanvas.getContext('2d');
      heatmapContext.clearRect(0, 0, width, height);
      heatmapContext.drawImage(candidateImage, 0, 0);
      const maxChangedCount = Math.max(...blockChangeCounts, 0);
      for (let row = 0; row < blockRowsValue; row += 1) {
        for (let col = 0; col < blockColsValue; col += 1) {
          const index = (row * blockColsValue) + col;
          const changedCount = blockChangeCounts[index];
          if (changedCount <= 0 || maxChangedCount <= 0) continue;
          const intensity = changedCount / maxChangedCount;
          const x = (col / blockColsValue) * width;
          const y = (row / blockRowsValue) * height;
          const blockWidth = width / blockColsValue;
          const blockHeight = height / blockRowsValue;
          heatmapContext.fillStyle = `rgba(255, 0, 0, ${Math.max(0.12, intensity * 0.65)})`;
          heatmapContext.fillRect(x, y, blockWidth, blockHeight);
          heatmapContext.strokeStyle = 'rgba(255,255,255,0.2)';
          heatmapContext.lineWidth = 1;
          heatmapContext.strokeRect(x, y, blockWidth, blockHeight);
        }
      }
      const heatmapDataUrl = heatmapCanvas.toDataURL('image/png');

      return {
        width,
        height,
        changed_pixels: changedPixels,
        total_pixels: totalPixels,
        changed_blocks: changedBlocks,
        total_blocks: blockChanged.length,
        pixel_diff_ratio: pixelDiffRatio,
        layout_shift_score: layoutShiftScore,
        structural_similarity: structuralSimilarity,
        hotspots,
        heatmap_png_base64: heatmapDataUrl.replace(/^data:image\/png;base64,/, ''),
      };
    }, {
      referenceUrl: fileToDataUrl(referencePath),
      candidateUrl: fileToDataUrl(candidatePath),
      pixelThresholdValue: toNumber(pixelThreshold, 16),
      blockRowsValue: toNumber(blockRows, 12),
      blockColsValue: toNumber(blockCols, 12),
    });

    const result = {
      ...metrics,
      heatmap_file: null,
    };
    if (heatmapOutputPath && typeof heatmapOutputPath === 'string') {
      mkdirSync(dirname(heatmapOutputPath), { recursive: true });
      writeFileSync(heatmapOutputPath, Buffer.from(metrics.heatmap_png_base64, 'base64'));
      result.heatmap_file = heatmapOutputPath;
    }
    delete result.heatmap_png_base64;
    return result;
  } finally {
    await browser.close();
  }
}
