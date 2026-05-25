import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { competitorContractValidate } from '../src/core/atoms/gate/competitor-contract-validate.js';

function makeProjectRoot() {
  const root = mkdtempSync(join(tmpdir(), 'as-xflow-competitor-gate-'));
  mkdirSync(resolve(root, 'specs', 'changes', 'chg-competitor-gate'), { recursive: true });
  return root;
}

function cleanupProjectRoot(root) {
  rmSync(root, { recursive: true, force: true });
}

describe('competitor reconstruction gate', () => {
  function writeSupportingArtifacts(projectRoot) {
    writeFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-competitor-gate', 'reference_surface_lock.json'), JSON.stringify({
      reference_surface_lock: {
        status: 'locked',
        primary_reference_surface: 'primary_workspace',
      },
    }, null, 2));
    writeFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-competitor-gate', 'reconstruction_pack.json'), JSON.stringify({
      reconstruction_pack: {
        status: 'ready',
        surface_map: [{ surface_id: 'primary_workspace' }],
        layout_map: { regions: [{ id: 'workspace' }] },
        component_inventory: [{ id: 'workspace_component' }],
        component_blueprint: [{ id: 'workspace_list_row_1', module: 'workspace', primitive_role: 'list_row' }],
        state_inventory: [{ id: 'review_state' }],
        visual_token_map: { color_roles: ['surface'] },
        reference_intermediate_model: { reference_dom_regions: [{ id: 'workspace' }], relationship_graph: [{ id: 'workspace_order' }] },
      },
    }, null, 2));
    writeFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-competitor-gate', 'generation_contract.json'), JSON.stringify({
      generation_contract: {
        status: 'ready',
        layout_constraints: { required_regions: ['workspace'] },
        component_constraints: {
          required_families: ['workbench_region'],
          component_blueprint: [{ id: 'workspace_list_row_1', module: 'workspace', primitive_role: 'list_row' }],
          staged_generation: { stages: [{ id: 'primary_focus', target_component_ids: ['workspace_list_row_1'] }] },
        },
        state_constraints: { required_states: ['review'] },
        visual_constraints: {
          token_contract: { color_roles: { surface: '#ffffff' } },
          geometry_hints: { alignment_rules: ['align repeated primitives'] },
          token_hints: { typography_roles: ['list_body'] },
        },
        repair_policy: { mode: 'component_target_only' },
      },
    }, null, 2));
  }

  test('rejects placeholder competitor contract artifacts', async () => {
    const projectRoot = makeProjectRoot();
    try {
      writeFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-competitor-gate', 'competitor_reconstruction_review.json'), JSON.stringify({
        competitor_reconstruction_contract: {
          status: 'frozen',
          competitor_product: 'required',
          target_surfaces: [],
          primary_reference_surface: '',
          supporting_reference_surfaces: [],
          required_modules: [],
          primary_journeys: [],
          business_logic_invariants: [],
          decomposition_requirements: {
            surface_map_required: true,
            layout_map_required: true,
            component_inventory_required: true,
            state_inventory_required: true,
            visual_token_map_required: true,
            reference_intermediate_model_required: true,
          },
        },
      }, null, 2));

      const result = await competitorContractValidate({}, {
        projectRoot,
        changeId: 'chg-competitor-gate',
      });

      assert.equal(result.ok, false);
      assert.ok(result.issues.includes('competitor_product_unspecified'));
      assert.ok(result.issues.includes('required_modules_missing'));
      assert.ok(result.issues.includes('primary_journeys_missing'));
      assert.ok(result.issues.includes('reference_surface_lock_missing'));
      assert.ok(result.issues.includes('generation_contract_missing'));
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('accepts a frozen competitor contract with explicit surfaces and journeys', async () => {
    const projectRoot = makeProjectRoot();
    try {
      writeSupportingArtifacts(projectRoot);
      writeFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-competitor-gate', 'competitor_reconstruction_review.json'), JSON.stringify({
        competitor_reconstruction_contract: {
          status: 'frozen',
          competitor_product: 'CompetitorX',
          target_surfaces: ['primary_workspace', 'detail_drawer'],
          primary_reference_surface: 'primary_workspace',
          supporting_reference_surfaces: ['detail_drawer'],
          required_modules: ['navigation', 'workspace', 'detail'],
          primary_journeys: ['create_to_review', 'review_to_complete'],
          business_logic_invariants: ['domain_invariant_a'],
          decomposition_requirements: {
            surface_map_required: true,
            layout_map_required: true,
            component_inventory_required: true,
            state_inventory_required: true,
            visual_token_map_required: true,
            reference_intermediate_model_required: true,
          },
        },
      }, null, 2));

      const result = await competitorContractValidate({}, {
        projectRoot,
        changeId: 'chg-competitor-gate',
      });

      assert.equal(result.ok, true);
      assert.deepEqual(result.issues, []);
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });

  test('rejects contracts that add undeclared product-specific shape', async () => {
    const projectRoot = makeProjectRoot();
    try {
      writeFileSync(resolve(projectRoot, 'specs', 'changes', 'chg-competitor-gate', 'competitor_reconstruction_review.json'), JSON.stringify({
        competitor_reconstruction_contract: {
          status: 'frozen',
          competitor_product: 'CompetitorX',
          target_surfaces: ['primary_workspace', 'detail_drawer'],
          primary_reference_surface: 'primary_workspace',
          supporting_reference_surfaces: ['detail_drawer'],
          required_modules: ['navigation', 'workspace', 'detail'],
          primary_journeys: ['create_to_review', 'review_to_complete'],
          business_logic_invariants: ['domain_invariant_a'],
          decomposition_requirements: {
            surface_map_required: true,
            layout_map_required: true,
            component_inventory_required: true,
            state_inventory_required: true,
            visual_token_map_required: true,
            reference_intermediate_model_required: true,
          },
          gtd_rule: 'inbox_first',
        },
      }, null, 2));

      const result = await competitorContractValidate({}, {
        projectRoot,
        changeId: 'chg-competitor-gate',
      });

      assert.equal(result.ok, false);
      assert.ok(result.issues.includes('competitor_reconstruction_contract_schema_invalid'));
    } finally {
      cleanupProjectRoot(projectRoot);
    }
  });
});
