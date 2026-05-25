import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { visualBenchmarkValidate } from '../src/core/atoms/gate/visual-benchmark-validate.js';

function makeProjectRoot() {
  const root = mkdtempSync(join(tmpdir(), 'as-xflow-visual-benchmark-'));
  mkdirSync(resolve(root, 'specs', 'changes', 'chg-visual-benchmark'), { recursive: true });
  return root;
}

function cleanupProjectRoot(root) {
  rmSync(root, { recursive: true, force: true });
}

describe('visual benchmark gate', () => {
  test('rejects incomplete reference-backed benchmark artifacts', async () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'refs'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'refs', 'ticktick-main.png'), 'ref');
      writeFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-visual-benchmark', 'visual_benchmark.json'), JSON.stringify({
        benchmark_mode: 'reference_backed',
        benchmark_input_mode: 'missing',
        competitor_product: 'TickTick',
        required_modules: ['tasks'],
        scenarios: [
          {
            id: 'desktop-main',
            viewport: { width: 1440, height: 900 },
            status: 'needs_follow_up',
          },
        ],
      }, null, 2));

      const result = await visualBenchmarkValidate({}, {
        projectRoot,
        changeId: 'chg-visual-benchmark',
      });

      assert.equal(result.ok, false);
      assert.ok(result.issues.includes('visual_benchmark_reference_image_missing'));
      assert.ok(result.issues.includes('visual_benchmark_screenshot_image_missing'));
      assert.ok(result.issues.includes('visual_benchmark_input_contract_missing'));
      assert.ok(result.issues.includes('visual_benchmark_diff_metrics_missing'));
      assert.ok(result.issues.includes('visual_benchmark_structure_checks_missing'));
      assert.ok(result.issues.includes('visual_benchmark_has_unresolved_scenarios'));
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('advisory mode keeps unresolved benchmark artifacts non-blocking while preserving issues', async () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'refs'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'refs', 'ticktick-main.png'), 'ref');
      writeFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-visual-benchmark', 'visual_benchmark.json'), JSON.stringify({
        benchmark_mode: 'reference_backed',
        benchmark_input_mode: 'missing',
        competitor_product: 'TickTick',
        required_modules: ['tasks'],
        scenarios: [
          {
            id: 'desktop-main',
            viewport: { width: 1440, height: 900 },
            status: 'needs_follow_up',
          },
        ],
      }, null, 2));

      const result = await visualBenchmarkValidate({ mode: 'advisory' }, {
        projectRoot,
        changeId: 'chg-visual-benchmark',
      });

      assert.equal(result.ok, true);
      assert.equal(result.status, 'needs_human');
      assert.equal(result.advisory, true);
      assert.ok(result.issues.includes('visual_benchmark_has_unresolved_scenarios'));
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('rejects self-referential benchmark scenarios that compare an image to itself', async () => {
      const projectRoot = makeProjectRoot();
      try {
      mkdirSync(resolve(projectRoot, 'refs'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'refs', 'self.png'), 'same-image');
      writeFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-visual-benchmark', 'visual_benchmark.json'), JSON.stringify({
        version: 1,
        benchmark_mode: 'reference_backed',
        benchmark_input_mode: 'reference_scenarios',
        competitor_product: 'Smallville',
        required_modules: ['town', 'agents'],
        scenarios: [
          {
            id: 'self-reference',
            viewport: { width: 1440, height: 900 },
            reference_image: 'refs/self.png',
            screenshot_image: 'refs/self.png',
            diff_metrics: {
              status: 'pass',
              values: { structural_similarity: 1, layout_shift_score: 0, pixel_diff_ratio: 0 },
            },
            structure_checks: [{ id: 'has-town', status: 'pass' }],
            screenshot_evidence_mode: 'reference_backed',
            status: 'pass',
          },
        ],
      }, null, 2));

      const result = await visualBenchmarkValidate({}, {
        projectRoot,
        changeId: 'chg-visual-benchmark',
      });

      assert.equal(result.ok, false);
      assert.ok(result.issues.includes('visual_benchmark_self_referential_scenario'));
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('rejects benchmark scenarios whose reference and screenshot files have identical content', async () => {
      const projectRoot = makeProjectRoot();
      try {
      mkdirSync(resolve(projectRoot, 'refs'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'output'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'refs', 'reference.png'), 'same-image-bytes');
      writeFileSync(resolve(projectRoot, 'output', 'candidate.png'), 'same-image-bytes');
      writeFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-visual-benchmark', 'visual_benchmark.json'), JSON.stringify({
        version: 1,
        benchmark_mode: 'reference_backed',
        benchmark_input_mode: 'reference_scenarios',
        competitor_product: 'Smallville',
        required_modules: ['town', 'agents'],
        scenarios: [
          {
            id: 'copied-reference',
            viewport: { width: 1440, height: 900 },
            reference_image: 'refs/reference.png',
            screenshot_image: 'output/candidate.png',
            diff_metrics: {
              status: 'pass',
              values: { structural_similarity: 1, layout_shift_score: 0, pixel_diff_ratio: 0 },
            },
            structure_checks: [{ id: 'has-town', status: 'pass' }],
            screenshot_evidence_mode: 'reference_backed',
            status: 'pass',
          },
        ],
      }, null, 2));

      const result = await visualBenchmarkValidate({}, {
        projectRoot,
        changeId: 'chg-visual-benchmark',
      });

      assert.equal(result.ok, false);
      assert.ok(result.issues.includes('visual_benchmark_self_referential_scenario'));
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('accepts a complete reference-backed benchmark artifact', async () => {
      const projectRoot = makeProjectRoot();
      try {
      mkdirSync(resolve(projectRoot, 'refs'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'output'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'refs', 'ticktick-main.png'), 'ref');
      writeFileSync(resolve(projectRoot, 'refs', 'ticktick-detail.png'), 'ref');
      writeFileSync(resolve(projectRoot, 'output', 'ticktick-main.png'), 'shot');
      writeFileSync(resolve(projectRoot, 'output', 'ticktick-detail.png'), 'shot');
      writeFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-visual-benchmark', 'visual_benchmark.json'), JSON.stringify({
        version: 1,
        benchmark_mode: 'reference_backed',
        benchmark_input_mode: 'reference_scenarios',
        competitor_product: 'TickTick',
        required_modules: ['tasks', 'calendar', 'detail', 'filters'],
        scenarios: [
          {
            id: 'desktop-main',
            viewport: { width: 1440, height: 900 },
            reference_image: 'refs/ticktick-main.png',
            screenshot_image: 'output/ticktick-main.png',
            diff_metrics: {
              status: 'pass',
              values: { structural_similarity: 0.94, layout_shift_score: 0.03 },
              thresholds: { structural_similarity_min: 0.9, layout_shift_score_max: 0.08, pixel_diff_ratio_max: 0.12 },
            },
            structure_checks: [{ id: 'three-column-layout', status: 'pass' }],
            screenshot_evidence_mode: 'reference_backed',
            status: 'pass',
          },
          {
            id: 'detail-panel',
            viewport: { width: 1440, height: 900 },
            reference_image: 'refs/ticktick-detail.png',
            screenshot_image: 'output/ticktick-detail.png',
            diff_metrics: {
              status: 'pass',
              values: { structural_similarity: 0.92, layout_shift_score: 0.04 },
              thresholds: { structural_similarity_min: 0.9, layout_shift_score_max: 0.08, pixel_diff_ratio_max: 0.12 },
            },
            structure_checks: [{ id: 'right-detail-panel', status: 'pass' }],
            screenshot_evidence_mode: 'reference_backed',
            status: 'pass',
          },
        ],
      }, null, 2));

      const result = await visualBenchmarkValidate({}, {
        projectRoot,
        changeId: 'chg-visual-benchmark',
      });

      assert.equal(result.ok, true);
      assert.deepEqual(result.issues, []);
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('accepts desktop product workbench platform profiles', async () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'refs'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'output'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'refs', 'workbench.png'), 'ref');
      writeFileSync(resolve(projectRoot, 'output', 'workbench.png'), 'shot');
      writeFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-visual-benchmark', 'visual_benchmark.json'), JSON.stringify({
        version: 1,
        benchmark_mode: 'reference_backed',
        benchmark_input_mode: 'reference_scenarios',
        competitor_product: 'Desktop Workbench',
        required_modules: ['workspace'],
        benchmark_matrix_contract: {
          required_platform_profiles: ['desktop_product_workbench']
        },
        matrix_checks: [{ id: 'platform-profile', status: 'pass' }],
        matrix_status: 'pass',
        scenarios: [
          {
            id: 'desktop-main',
            viewport: { width: 1440, height: 900 },
            platform_profile: 'desktop_product_workbench',
            reference_image: 'refs/workbench.png',
            screenshot_image: 'output/workbench.png',
            diff_metrics: {
              status: 'pass',
              values: { structural_similarity: 1, layout_shift_score: 0, pixel_diff_ratio: 0 },
              thresholds: { structural_similarity_min: 0.9, layout_shift_score_max: 0.08, pixel_diff_ratio_max: 0.12 },
            },
            structure_checks: [{ id: 'workbench-present', status: 'pass' }],
            screenshot_evidence_mode: 'reference_backed',
            status: 'pass',
            blockers: [],
          },
        ],
      }, null, 2));

      const result = await visualBenchmarkValidate({}, {
        projectRoot,
        changeId: 'chg-visual-benchmark',
      });

      assert.equal(result.ok, true);
      assert.deepEqual(result.issues, []);
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('rejects benchmark artifacts that point at a missing html report', async () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'refs'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'output'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'refs', 'ticktick-main.png'), 'ref');
      writeFileSync(resolve(projectRoot, 'output', 'ticktick-main.png'), 'shot');
      writeFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-visual-benchmark', 'visual_benchmark.json'), JSON.stringify({
        version: 1,
        benchmark_mode: 'reference_backed',
        benchmark_input_mode: 'reference_scenarios',
        competitor_product: 'CompetitorX',
        required_modules: ['workspace'],
        report_file: 'output/missing-report.html',
        scenarios: [
          {
            id: 'desktop-main',
            viewport: { width: 1440, height: 900 },
            reference_image: 'refs/ticktick-main.png',
            screenshot_image: 'output/ticktick-main.png',
            diff_metrics: {
              status: 'pass',
              values: { structural_similarity: 0.94, layout_shift_score: 0.03, pixel_diff_ratio: 0.02 },
              thresholds: { structural_similarity_min: 0.9, layout_shift_score_max: 0.08, pixel_diff_ratio_max: 0.12 },
            },
            structure_checks: [{ id: 'workspace-shell', status: 'pass' }],
            screenshot_evidence_mode: 'reference_backed',
            status: 'pass',
          },
        ],
      }, null, 2));

      const result = await visualBenchmarkValidate({}, {
        projectRoot,
        changeId: 'chg-visual-benchmark',
      });

      assert.equal(result.ok, false);
      assert.ok(result.issues.includes('visual_benchmark_report_unresolved'));
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('accepts benchmark artifacts that retain raw layout observations alongside normalized layout', async () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'refs'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'output'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'refs', 'competitor-main.png'), 'ref');
      writeFileSync(resolve(projectRoot, 'output', 'competitor-main.png'), 'shot');
      writeFileSync(resolve(projectRoot, 'output', 'competitor-main-detail-open.png'), 'shot');
      writeFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-visual-benchmark', 'visual_benchmark.json'), JSON.stringify({
        version: 1,
        benchmark_mode: 'reference_backed',
        benchmark_input_mode: 'reference_scenarios',
        competitor_product: 'CompetitorX',
        required_modules: ['navigation', 'workspace', 'detail'],
        scenarios: [
          {
            id: 'desktop-main',
            viewport: { width: 1440, height: 900 },
            reference_image: 'refs/competitor-main.png',
            screenshot_image: 'output/competitor-main.png',
            diff_metrics: {
              status: 'pass',
              values: { structural_similarity: 0.95, layout_shift_score: 0.02, pixel_diff_ratio: 0.04 },
              thresholds: { structural_similarity_min: 0.9, layout_shift_score_max: 0.08, pixel_diff_ratio_max: 0.12 },
            },
            layout_contract: {
              expected_columns: 3,
              required_panels: ['sidebar', 'main', 'detail'],
              min_sidebar_width: 220,
              min_main_width: 640,
              min_detail_width: 280
            },
            observed_layout: {
              columns: [
                { id: 'sidebar', width: 264 },
                { id: 'main', width: 852 },
                { id: 'detail', width: 324 }
              ]
            },
            layout_observations: {
              panels: [
                { id: 'sidebar', x: 0, width: 264, height: 900 },
                { id: 'main', x: 264, width: 852, height: 900 },
                { id: 'detail', x: 1116, width: 324, height: 900 }
              ]
            },
            structure_checks: [{ id: 'three-column-layout', status: 'pass' }],
            screenshot_evidence_mode: 'reference_backed',
            evidence: { reference_image_exists: true, screenshot_image_exists: true },
            status: 'pass',
            blockers: []
          }
        ],
      }, null, 2));

      const result = await visualBenchmarkValidate({}, {
        projectRoot,
        changeId: 'chg-visual-benchmark',
      });

      assert.equal(result.ok, true);
      assert.deepEqual(result.issues, []);
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('rejects auto-generated layout checks when observed layout breaks the contract', async () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'refs'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'output'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'refs', 'ticktick-main.png'), 'ref');
      writeFileSync(resolve(projectRoot, 'output', 'ticktick-main.png'), 'shot');
      writeFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-visual-benchmark', 'visual_benchmark.json'), JSON.stringify({
        benchmark_mode: 'reference_backed',
        benchmark_input_mode: 'reference_scenarios',
        competitor_product: 'TickTick',
        required_modules: ['tasks', 'calendar', 'detail', 'filters'],
        scenarios: [
          {
            id: 'desktop-main',
            viewport: { width: 1440, height: 900 },
            reference_image: 'refs/ticktick-main.png',
            screenshot_image: 'output/ticktick-main.png',
            diff_metrics: {
              status: 'pass',
              values: { structural_similarity: 0.94, layout_shift_score: 0.03 },
              thresholds: { structural_similarity_min: 0.9, layout_shift_score_max: 0.08, pixel_diff_ratio_max: 0.12 },
            },
            structure_checks: [
              { id: 'layout-column-count', status: 'pass' },
              { id: 'layout-panel-order', status: 'needs_follow_up' },
            ],
            status: 'needs_follow_up',
          },
        ],
      }, null, 2));

      const result = await visualBenchmarkValidate({}, {
        projectRoot,
        changeId: 'chg-visual-benchmark',
      });

      assert.equal(result.ok, false);
      assert.ok(result.issues.includes('visual_benchmark_structure_checks_unresolved'));
      assert.ok(result.issues.includes('visual_benchmark_has_unresolved_scenarios'));
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('rejects unresolved anchor relation checks when observed panels violate the contract', async () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'refs'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'output'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'refs', 'competitor-main.png'), 'ref');
      writeFileSync(resolve(projectRoot, 'output', 'competitor-main.png'), 'shot');
      writeFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-visual-benchmark', 'visual_benchmark.json'), JSON.stringify({
        version: 1,
        benchmark_mode: 'reference_backed',
        benchmark_input_mode: 'capture_url',
        competitor_product: 'CompetitorX',
        required_modules: ['navigation', 'workspace', 'detail'],
        scenarios: [
          {
            id: 'desktop-main',
            viewport: { width: 1440, height: 900 },
            reference_image: 'refs/competitor-main.png',
            screenshot_image: 'output/competitor-main.png',
            diff_metrics: {
              status: 'pass',
              values: { structural_similarity: 0.95, layout_shift_score: 0.02, pixel_diff_ratio: 0.04 },
              thresholds: { structural_similarity_min: 0.9, layout_shift_score_max: 0.08, pixel_diff_ratio_max: 0.12 }
            },
            layout_contract: {
              anchor_relations: [
                { id: 'detail-right-of-main', from: 'detail', to: 'main', relation: 'right_of', gap_max: 0 }
              ]
            },
            layout_observations: {
              panels: [
                { id: 'detail', x: 200, y: 0, width: 324, height: 900 },
                { id: 'main', x: 524, y: 0, width: 852, height: 900 }
              ]
            },
            structure_checks: [{ id: 'detail-right-of-main', status: 'needs_follow_up' }],
            screenshot_evidence_mode: 'reference_backed',
            status: 'needs_follow_up'
          }
        ]
      }, null, 2));

      const result = await visualBenchmarkValidate({}, {
        projectRoot,
        changeId: 'chg-visual-benchmark',
      });

      assert.equal(result.ok, false);
      assert.ok(result.issues.includes('visual_benchmark_structure_checks_unresolved'));
      assert.ok(result.issues.includes('visual_benchmark_has_unresolved_scenarios'));
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('accepts benchmark artifacts generated from workspace pattern checks', async () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'refs'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'output'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'refs', 'competitor-workspace.png'), 'ref');
      writeFileSync(resolve(projectRoot, 'output', 'competitor-workspace.png'), 'shot');
      writeFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-visual-benchmark', 'visual_benchmark.json'), JSON.stringify({
        version: 1,
        benchmark_mode: 'reference_backed',
        benchmark_input_mode: 'reference_scenarios',
        competitor_product: 'CompetitorX',
        required_modules: ['workspace', 'detail', 'toolbar'],
        scenarios: [
          {
            id: 'desktop-workspace',
            viewport: { width: 1440, height: 900 },
            reference_image: 'refs/competitor-workspace.png',
            screenshot_image: 'output/competitor-workspace.png',
            diff_metrics: {
              status: 'pass',
              values: { structural_similarity: 0.96, layout_shift_score: 0.02, pixel_diff_ratio: 0.04 },
              thresholds: { structural_similarity_min: 0.9, layout_shift_score_max: 0.08, pixel_diff_ratio_max: 0.12 }
            },
            layout_contract: {
              workspace_patterns: ['detail_docked_right', 'toolbar_over_workspace']
            },
            layout_observations: {
              regions: [
                { id: 'toolbar', left: 264, top: 0, right: 1116, bottom: 72 },
                { id: 'main', left: 264, top: 72, right: 1116, bottom: 900 },
                { id: 'detail', left: 1116, top: 72, right: 1440, bottom: 900 }
              ]
            },
            observed_layout: {
              columns: [
                { id: 'toolbar', width: 852 },
                { id: 'main', width: 852 },
                { id: 'detail', width: 324 }
              ]
            },
            structure_checks: [
              { id: 'pattern-detail-right-of-main', status: 'pass' },
              { id: 'pattern-detail-aligned-top-main', status: 'pass' },
              { id: 'pattern-toolbar-above-main', status: 'pass' },
              { id: 'pattern-toolbar-aligned-left-main', status: 'pass' }
            ],
            screenshot_evidence_mode: 'reference_backed',
            evidence: { reference_image_exists: true, screenshot_image_exists: true },
            status: 'pass',
            blockers: []
          }
        ]
      }, null, 2));

      const result = await visualBenchmarkValidate({}, {
        projectRoot,
        changeId: 'chg-visual-benchmark',
      });

      assert.equal(result.ok, true);
      assert.deepEqual(result.issues, []);
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('accepts benchmark artifacts generated from dom_rect-based workspace patterns', async () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'refs'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'output'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'refs', 'competitor-list-detail.png'), 'ref');
      writeFileSync(resolve(projectRoot, 'output', 'competitor-list-detail.png'), 'shot');
      writeFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-visual-benchmark', 'visual_benchmark.json'), JSON.stringify({
        version: 1,
        benchmark_mode: 'reference_backed',
        benchmark_input_mode: 'reference_scenarios',
        competitor_product: 'CompetitorX',
        required_modules: ['header', 'filters', 'list', 'detail'],
        scenarios: [
          {
            id: 'desktop-list-detail',
            viewport: { width: 1440, height: 900 },
            reference_image: 'refs/competitor-list-detail.png',
            screenshot_image: 'output/competitor-list-detail.png',
            diff_metrics: {
              status: 'pass',
              values: { structural_similarity: 0.95, layout_shift_score: 0.02, pixel_diff_ratio: 0.05 },
              thresholds: { structural_similarity_min: 0.9, layout_shift_score_max: 0.08, pixel_diff_ratio_max: 0.12 }
            },
            layout_contract: {
              workspace_patterns: ['header_with_split_workspace', 'filters_above_list', 'list_detail_master_detail']
            },
            layout_observations: {
              dom_rects: [
                { panel_id: 'header', left: 0, top: 0, width: 1440, height: 64 },
                { panel_id: 'filters', left: 0, top: 64, width: 920, height: 56 },
                { panel_id: 'sidebar', left: 0, top: 64, width: 280, height: 836 },
                { panel_id: 'list', left: 0, top: 120, width: 920, height: 780 },
                { panel_id: 'main', left: 0, top: 120, width: 920, height: 780 },
                { panel_id: 'detail', left: 920, top: 120, width: 520, height: 780 }
              ]
            },
            observed_layout: {
              columns: [
                { id: 'list', width: 920 },
                { id: 'detail', width: 520 }
              ]
            },
            structure_checks: [
              { id: 'pattern-header-above-main', status: 'pass' },
              { id: 'pattern-filters-above-list', status: 'pass' },
              { id: 'pattern-list-left-of-detail', status: 'pass' }
            ],
            screenshot_evidence_mode: 'reference_backed',
            evidence: { reference_image_exists: true, screenshot_image_exists: true },
            status: 'pass',
            blockers: []
          }
        ]
      }, null, 2));

      const result = await visualBenchmarkValidate({}, {
        projectRoot,
        changeId: 'chg-visual-benchmark',
      });

      assert.equal(result.ok, true);
      assert.deepEqual(result.issues, []);
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('rejects unresolved visual token checks when token contract is violated', async () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'refs'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'output'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'refs', 'competitor-main.png'), 'ref');
      writeFileSync(resolve(projectRoot, 'output', 'competitor-main.png'), 'shot');
      writeFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-visual-benchmark', 'visual_benchmark.json'), JSON.stringify({
        version: 1,
        benchmark_mode: 'reference_backed',
        benchmark_input_mode: 'reference_scenarios',
        competitor_product: 'CompetitorX',
        required_modules: ['workspace'],
        scenarios: [
          {
            id: 'desktop-main',
            viewport: { width: 1440, height: 900 },
            reference_image: 'refs/competitor-main.png',
            screenshot_image: 'output/competitor-main.png',
            diff_metrics: {
              status: 'pass',
              values: { structural_similarity: 0.95, layout_shift_score: 0.02, pixel_diff_ratio: 0.05 },
              thresholds: { structural_similarity_min: 0.9, layout_shift_score_max: 0.08, pixel_diff_ratio_max: 0.12 }
            },
            structure_checks: [{ id: 'workspace-shell', status: 'pass' }],
            visual_token_contract: {
              font_families_required: ['Inter'],
              icon_density_range: { min: 0.2, max: 1.2 },
              line_height_range: { min: 20, max: 28 },
              radius_range: { min: 0, max: 12 },
              border_styles_required: ['solid'],
              border_weight_tiers_required: ['hairline'],
              color_roles: { accent: '#4f7cff' }
            },
            observed_visual_tokens: {
              font_families: ['Arial'],
              icon_density_values: [1.8],
              line_heights: [18],
              radius_values: [20],
              border_styles: ['dashed'],
              border_weight_tiers: ['strong'],
              color_roles: { accent: '#ff5500' }
            },
            token_checks: [
              { id: 'token-font-families', status: 'needs_follow_up' },
              { id: 'token-icon-density-range', status: 'needs_follow_up' },
              { id: 'token-line-height-range', status: 'needs_follow_up' },
              { id: 'token-radius-range', status: 'needs_follow_up' },
              { id: 'token-border-styles', status: 'needs_follow_up' },
              { id: 'token-border-weight-tiers', status: 'needs_follow_up' },
              { id: 'token-color-roles', status: 'needs_follow_up' }
            ],
            screenshot_evidence_mode: 'reference_backed',
            evidence: { reference_image_exists: true, screenshot_image_exists: true },
            status: 'needs_follow_up',
            blockers: ['token_checks_unresolved']
          }
        ]
      }, null, 2));

      const result = await visualBenchmarkValidate({}, {
        projectRoot,
        changeId: 'chg-visual-benchmark',
      });

      assert.equal(result.ok, false);
      assert.ok(result.issues.includes('visual_benchmark_token_checks_unresolved'));
      assert.ok(result.issues.includes('visual_benchmark_has_unresolved_scenarios'));
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('accepts visual token-backed benchmark artifacts when token checks pass', async () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'refs'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'output'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'refs', 'competitor-main.png'), 'ref');
      writeFileSync(resolve(projectRoot, 'output', 'competitor-main.png'), 'shot');
      writeFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-visual-benchmark', 'visual_benchmark.json'), JSON.stringify({
        version: 1,
        benchmark_mode: 'reference_backed',
        benchmark_input_mode: 'reference_scenarios',
        competitor_product: 'CompetitorX',
        required_modules: ['workspace'],
        scenarios: [
          {
            id: 'desktop-main',
            viewport: { width: 1440, height: 900 },
            reference_image: 'refs/competitor-main.png',
            screenshot_image: 'output/competitor-main.png',
            diff_metrics: {
              status: 'pass',
              values: { structural_similarity: 0.96, layout_shift_score: 0.02, pixel_diff_ratio: 0.04 },
              thresholds: { structural_similarity_min: 0.9, layout_shift_score_max: 0.08, pixel_diff_ratio_max: 0.12 }
            },
            structure_checks: [{ id: 'workspace-shell', status: 'pass' }],
            visual_token_contract: {
              font_families_required: ['Inter'],
              font_weights_required: [400, 600],
              text_size_range: { min: 12, max: 32 },
              min_touch_target_size: 44,
              bottom_sheet_handle_required: true,
              tabbar_active_state_required: true,
              floating_primary_action_required: true,
              segmented_control_active_state_required: true,
              required_component_semantics: ['bottom_sheet', 'tab_bar', 'floating_primary_action', 'segmented_control'],
              icon_density_range: { min: 0, max: 2 },
              icon_size_range: { min: 16, max: 20 },
              line_height_range: { min: 20, max: 36 },
              letter_spacing_range: { min: 0, max: 0.5 },
              radius_range: { min: 0, max: 12 },
              border_width_range: { min: 0, max: 1 },
              border_styles_required: ['solid'],
              border_weight_tiers_required: ['hairline'],
              color_roles: { accent: '#4f7cff' },
              shadow_signatures_required: ['0px 12px 32px rgba(15, 23, 42, 0.12)'],
              shadow_strength_tiers_required: ['strong'],
              spacing_scale: { base: 4, allowed_multipliers: [2, 3, 4, 6], tolerance: 0.5 }
            },
            observed_visual_tokens: {
              font_families: ['Inter', 'PingFang SC'],
              font_weights: [400, 600],
              text_sizes: [12, 14, 16, 24, 32],
              touch_target_sizes: [44, 48],
              bottom_sheet_handle_present: true,
              tabbar_active_state_present: true,
              floating_primary_action_present: true,
              segmented_control_active_state_present: true,
              component_semantics: ['bottom_sheet', 'tab_bar', 'floating_primary_action', 'segmented_control'],
              icon_density_values: [0.4, 1.2],
              icon_size_values: [16, 20],
              line_heights: [20, 24, 32, 36],
              letter_spacings: [0, 0.2],
              radius_values: [0, 8, 12],
              border_widths: [0, 1],
              border_styles: ['solid'],
              border_weight_tiers: ['hairline'],
              color_roles: { accent: '#4f7cff' },
              shadow_signatures: ['0px 12px 32px rgba(15, 23, 42, 0.12)'],
              shadow_strength_tiers: ['strong'],
              spacing_values: [8, 12, 16, 24]
            },
            token_checks: [
              { id: 'token-font-families', status: 'pass' },
              { id: 'token-font-weights', status: 'pass' },
              { id: 'token-text-size-range', status: 'pass' },
              { id: 'token-min-touch-target-size', status: 'pass' },
              { id: 'token-bottom-sheet-handle', status: 'pass' },
              { id: 'token-tabbar-active-state', status: 'pass' },
              { id: 'token-floating-primary-action', status: 'pass' },
              { id: 'token-segmented-control-active-state', status: 'pass' },
              { id: 'token-component-semantics', status: 'pass' },
              { id: 'token-icon-density-range', status: 'pass' },
              { id: 'token-icon-size-range', status: 'pass' },
              { id: 'token-line-height-range', status: 'pass' },
              { id: 'token-letter-spacing-range', status: 'pass' },
              { id: 'token-radius-range', status: 'pass' },
              { id: 'token-border-width-range', status: 'pass' },
              { id: 'token-border-styles', status: 'pass' },
              { id: 'token-border-weight-tiers', status: 'pass' },
              { id: 'token-color-roles', status: 'pass' },
              { id: 'token-shadow-signatures', status: 'pass' },
              { id: 'token-shadow-strength-tiers', status: 'pass' },
              { id: 'token-spacing-scale', status: 'pass' }
            ],
            state_evidence: [
              {
                id: 'detail-open',
                screenshot_image: 'output/competitor-main-detail-open.png',
                nodes_captured: 3,
                expect_visual_change: true,
                min_pixel_diff_ratio: 0.002,
                reference_image: 'refs/competitor-main-detail-open.png',
                priority_score: 96,
                priority_reason: 'primary-detail-open',
                source: 'manual',
                workbench_state_type: 'detail_open',
                state_tags: ['detail', 'open']
              }
            ],
            state_transition_checks: [
              {
                id: 'state-transition-detail-open',
                status: 'pass',
                compared_to: 'reference_state',
                diff_metrics: {
                  structural_similarity: 0.92,
                  layout_shift_score: 0.04,
                  pixel_diff_ratio: 0.03
                }
              }
            ],
            motion_transition_checks: [],
            state_contract: {
              required_workbench_states: ['detail_open']
            },
            state_contract_checks: [
              {
                id: 'state-contract-required-workbench-states',
                status: 'pass',
                detail: 'required workbench states present: detail_open'
              }
            ],
            screenshot_evidence_mode: 'reference_backed',
            evidence: { reference_image_exists: true, screenshot_image_exists: true },
            status: 'pass',
            blockers: []
          }
        ],
        benchmark_matrix_contract: {
          required_scenario_ids: ['desktop-main'],
          max_average_pixel_diff_ratio: 0.05
        },
        matrix_checks: [
          { id: 'matrix-required-scenarios', status: 'pass' },
          { id: 'matrix-average-pixel-diff-ratio', status: 'pass' }
        ],
        matrix_status: 'pass'
      }, null, 2));

      const result = await visualBenchmarkValidate({}, {
        projectRoot,
        changeId: 'chg-visual-benchmark',
      });

      assert.equal(result.ok, true);
      assert.deepEqual(result.issues, []);
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('rejects unresolved workbench state contract checks when required states are missing', async () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'refs'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'output'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'refs', 'competitor-main.png'), 'ref');
      writeFileSync(resolve(projectRoot, 'output', 'competitor-main.png'), 'shot');
      writeFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-visual-benchmark', 'visual_benchmark.json'), JSON.stringify({
        version: 1,
        benchmark_mode: 'reference_backed',
        benchmark_input_mode: 'capture_url',
        competitor_product: 'CompetitorX',
        required_modules: ['workspace', 'detail'],
        scenarios: [
          {
            id: 'desktop-main',
            viewport: { width: 1440, height: 900 },
            reference_image: 'refs/competitor-main.png',
            screenshot_image: 'output/competitor-main.png',
            diff_metrics: {
              status: 'pass',
              values: { structural_similarity: 0.96, layout_shift_score: 0.02, pixel_diff_ratio: 0.04 },
              thresholds: { structural_similarity_min: 0.9, layout_shift_score_max: 0.08, pixel_diff_ratio_max: 0.12 }
            },
            structure_checks: [{ id: 'workspace-shell', status: 'pass' }],
            state_contract: {
              required_workbench_states: ['detail_open']
            },
            state_contract_checks: [
              { id: 'state-contract-required-workbench-states', status: 'needs_follow_up', detail: 'missing workbench states: detail_open; observed none' }
            ],
            screenshot_evidence_mode: 'reference_backed',
            evidence: { reference_image_exists: true, screenshot_image_exists: true },
            status: 'needs_follow_up',
            blockers: ['state_contract_unresolved']
          }
        ]
      }, null, 2));

      const result = await visualBenchmarkValidate({}, {
        projectRoot,
        changeId: 'chg-visual-benchmark',
      });

      assert.equal(result.ok, false);
      assert.ok(result.issues.includes('visual_benchmark_state_contract_checks_unresolved'));
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('rejects unresolved state family checks when component variants drift too far apart', async () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'refs'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'output'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'refs', 'competitor-main.png'), 'ref');
      writeFileSync(resolve(projectRoot, 'output', 'competitor-main.png'), 'shot');
      writeFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-visual-benchmark', 'visual_benchmark.json'), JSON.stringify({
        version: 1,
        benchmark_mode: 'reference_backed',
        benchmark_input_mode: 'reference_scenarios',
        competitor_product: 'CompetitorX',
        required_modules: ['toolbar'],
        scenarios: [
          {
            id: 'desktop-main',
            viewport: { width: 1440, height: 900 },
            reference_image: 'refs/competitor-main.png',
            screenshot_image: 'output/competitor-main.png',
            diff_metrics: {
              status: 'pass',
              values: { structural_similarity: 0.96, layout_shift_score: 0.02, pixel_diff_ratio: 0.04 },
              thresholds: { structural_similarity_min: 0.9, layout_shift_score_max: 0.08, pixel_diff_ratio_max: 0.12 }
            },
            structure_checks: [{ id: 'workspace-shell', status: 'pass' }],
            state_evidence: [
              {
                id: 'toolbar-hover',
                screenshot_image: 'output/competitor-main.png',
                nodes_captured: 1,
                component_family: 'toolbar_controls',
                state_variant: 'hover',
                state_visual_tokens: { color_roles: { surface: '#93c5fd' }, transition_durations: [120], transition_timing_functions: ['ease'], radius_values: [8], border_widths: [1] }
              },
              {
                id: 'toolbar-active',
                screenshot_image: 'output/competitor-main.png',
                nodes_captured: 1,
                component_family: 'toolbar_controls',
                state_variant: 'active',
                state_visual_tokens: { color_roles: { surface: '#60a5fa' }, transition_durations: [320], transition_timing_functions: ['linear'], radius_values: [12], border_widths: [3] }
              }
            ],
            state_transition_checks: [
              { id: 'state-transition-toolbar-hover', status: 'pass', diff_metrics: { structural_similarity: 0.95, layout_shift_score: 0.01, pixel_diff_ratio: 0.02 } },
              { id: 'state-transition-toolbar-active', status: 'pass', diff_metrics: { structural_similarity: 0.85, layout_shift_score: 0.08, pixel_diff_ratio: 0.18 } }
            ],
            state_family_contract: {
              toolbar_controls: {
                required_variants: ['hover', 'active'],
                max_pixel_diff_spread: 0.05,
                max_layout_shift_spread: 0.02,
                required_timing_functions: ['ease'],
                max_radius_spread: 1,
                max_transition_duration_spread: 50
              }
            },
            state_family_checks: [
              { id: 'state-family-toolbar_controls-required-variants', status: 'pass' },
              { id: 'state-family-toolbar_controls-pixel-diff-spread', status: 'needs_follow_up', detail: 'toolbar_controls pixel diff spread 0.16 (max 0.05)' },
              { id: 'state-family-toolbar_controls-radius-spread', status: 'needs_follow_up', detail: 'toolbar_controls radius spread 4 (max 1)' },
              { id: 'state-family-toolbar_controls-transition-duration-spread', status: 'needs_follow_up', detail: 'toolbar_controls transition duration spread 200ms (max 50ms)' }
            ],
            screenshot_evidence_mode: 'reference_backed',
            evidence: { reference_image_exists: true, screenshot_image_exists: true },
            status: 'needs_follow_up',
            blockers: ['state_family_checks_unresolved']
          }
        ]
      }, null, 2));

      const result = await visualBenchmarkValidate({}, {
        projectRoot,
        changeId: 'chg-visual-benchmark',
      });

      assert.equal(result.ok, false);
      assert.ok(result.issues.includes('visual_benchmark_state_family_checks_unresolved'));
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('rejects unresolved state transition checks when state evidence is present', async () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'refs'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'output'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'refs', 'competitor-main.png'), 'ref');
      writeFileSync(resolve(projectRoot, 'refs', 'competitor-main-detail-open.png'), 'ref');
      writeFileSync(resolve(projectRoot, 'output', 'competitor-main.png'), 'shot');
      writeFileSync(resolve(projectRoot, 'output', 'competitor-main-detail-open.png'), 'shot');
      writeFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-visual-benchmark', 'visual_benchmark.json'), JSON.stringify({
        version: 1,
        benchmark_mode: 'reference_backed',
        benchmark_input_mode: 'capture_url',
        competitor_product: 'CompetitorX',
        required_modules: ['workspace'],
        scenarios: [
          {
            id: 'desktop-main',
            viewport: { width: 1440, height: 900 },
            reference_image: 'refs/competitor-main.png',
            screenshot_image: 'output/competitor-main.png',
            diff_metrics: {
              status: 'pass',
              values: { structural_similarity: 0.96, layout_shift_score: 0.02, pixel_diff_ratio: 0.04 },
              thresholds: { structural_similarity_min: 0.9, layout_shift_score_max: 0.08, pixel_diff_ratio_max: 0.12 }
            },
            structure_checks: [{ id: 'workspace-shell', status: 'pass' }],
            state_evidence: [
              {
                id: 'detail-open',
                screenshot_image: 'output/competitor-main-detail-open.png',
                nodes_captured: 3,
                expect_visual_change: true,
                reference_image: 'refs/competitor-main-detail-open.png'
              }
            ],
            state_transition_checks: [
              { id: 'state-transition-detail-open', status: 'needs_follow_up', compared_to: 'reference_state' }
            ],
            screenshot_evidence_mode: 'reference_backed',
            evidence: { reference_image_exists: true, screenshot_image_exists: true },
            status: 'needs_follow_up',
            blockers: ['state_transition_checks_unresolved']
          }
        ]
      }, null, 2));

      const result = await visualBenchmarkValidate({}, {
        projectRoot,
        changeId: 'chg-visual-benchmark',
      });

      assert.equal(result.ok, false);
      assert.ok(result.issues.includes('visual_benchmark_state_transition_checks_unresolved'));
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('rejects benchmark artifacts that add undeclared product-case fields', async () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'refs'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'output'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'refs', 'ticktick-main.png'), 'ref');
      writeFileSync(resolve(projectRoot, 'output', 'ticktick-main.png'), 'shot');
      writeFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-visual-benchmark', 'visual_benchmark.json'), JSON.stringify({
        benchmark_mode: 'reference_backed',
        benchmark_input_mode: 'reference_scenarios',
        version: 1,
        competitor_product: 'CompetitorX',
        required_modules: ['workspace'],
        domain_mode: 'todo-only',
        scenarios: [
          {
            id: 'desktop-main',
            viewport: { width: 1440, height: 900 },
            reference_image: 'refs/ticktick-main.png',
            screenshot_image: 'output/ticktick-main.png',
            diff_metrics: {
              status: 'pass',
              values: { structural_similarity: 0.94, layout_shift_score: 0.03 },
              thresholds: { structural_similarity_min: 0.9, layout_shift_score_max: 0.08, pixel_diff_ratio_max: 0.12 }
            },
            structure_checks: [{ id: 'three-column-layout', status: 'pass', detail: null }],
            screenshot_evidence_mode: 'reference_backed',
            status: 'pass'
          }
        ]
      }, null, 2));

      const result = await visualBenchmarkValidate({}, {
        projectRoot,
        changeId: 'chg-visual-benchmark',
      });

      assert.equal(result.ok, false);
      assert.ok(result.issues.includes('visual_benchmark_schema_invalid'));
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('rejects diff_metrics payloads that add undeclared shape', async () => {
    const projectRoot = makeProjectRoot();
    try {
      mkdirSync(resolve(projectRoot, 'refs'), { recursive: true });
      mkdirSync(resolve(projectRoot, 'output'), { recursive: true });
      writeFileSync(resolve(projectRoot, 'refs', 'ticktick-main.png'), 'ref');
      writeFileSync(resolve(projectRoot, 'output', 'ticktick-main.png'), 'shot');
      writeFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-visual-benchmark', 'visual_benchmark.json'), JSON.stringify({
        version: 1,
        benchmark_mode: 'reference_backed',
        benchmark_input_mode: 'reference_scenarios',
        competitor_product: 'CompetitorX',
        required_modules: ['workspace'],
        scenarios: [
          {
            id: 'desktop-main',
            viewport: { width: 1440, height: 900 },
            reference_image: 'refs/ticktick-main.png',
            screenshot_image: 'output/ticktick-main.png',
            diff_metrics: {
              status: 'pass',
              values: { structural_similarity: 0.94 },
              thresholds: { structural_similarity_min: 0.9, layout_shift_score_max: 0.08, pixel_diff_ratio_max: 0.12 },
              domain_mode: 'todo-only'
            },
            structure_checks: [{ id: 'three-column-layout', status: 'pass', detail: null }],
            screenshot_evidence_mode: 'reference_backed',
            status: 'pass'
          }
        ]
      }, null, 2));

      const result = await visualBenchmarkValidate({}, {
        projectRoot,
        changeId: 'chg-visual-benchmark',
      });

      assert.equal(result.ok, false);
      assert.ok(result.issues.includes('visual_benchmark_schema_invalid'));
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });
});
