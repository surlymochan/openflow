import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv from 'ajv';

import { readJsonFile, resolveChangePath } from '../../change-artifacts.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const CONTRACT_SCHEMA = JSON.parse(readFileSync(
  resolve(__dirname, '../../../../schemas/competitor-reconstruction-contract.schema.json'),
  'utf8',
));
const ajv = new Ajv({ allErrors: true });
const validateContractSchema = ajv.compile(CONTRACT_SCHEMA);

function ensureNonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
}

function loadArtifact(projectRoot, changeId, filename) {
  return readJsonFile(resolveChangePath(projectRoot, changeId, filename), null);
}

export async function competitorContractValidate(input = {}, context = {}) {
  const projectRoot = context.projectRoot || process.cwd();
  const changeId = context.changeId || input.change_id || null;
  if (!changeId) {
    throw new Error('change_id is required for H2c.design.competitor_contract_validate');
  }

  const artifactPath = resolveChangePath(projectRoot, changeId, 'competitor_reconstruction_review.json');
  const artifact = readJsonFile(artifactPath, null);
  const contract = artifact?.competitor_reconstruction_contract || null;
  const referenceLockArtifact = loadArtifact(projectRoot, changeId, 'reference_surface_lock.json');
  const reconstructionPackArtifact = loadArtifact(projectRoot, changeId, 'reconstruction_pack.json');
  const generationContractArtifact = loadArtifact(projectRoot, changeId, 'generation_contract.json');
  const referenceLock = referenceLockArtifact?.reference_surface_lock || null;
  const reconstructionPack = reconstructionPackArtifact?.reconstruction_pack || null;
  const generationContract = generationContractArtifact?.generation_contract || null;
  const issues = [];

  if (!artifact) issues.push('competitor_reconstruction_review_missing');
  if (!contract) issues.push('competitor_reconstruction_contract_missing');
  if (contract && !validateContractSchema(contract)) {
    issues.push('competitor_reconstruction_contract_schema_invalid');
  }
  if (contract?.status !== 'frozen') issues.push('competitor_reconstruction_contract_not_frozen');
  if (!contract?.competitor_product || contract.competitor_product === 'required') issues.push('competitor_product_unspecified');
  if (!ensureNonEmptyArray(contract?.target_surfaces)) issues.push('target_surfaces_missing');
  if (!contract?.primary_reference_surface || !contract.target_surfaces?.includes(contract.primary_reference_surface)) {
    issues.push('primary_reference_surface_missing');
  }
  if (!ensureNonEmptyArray(contract?.required_modules)) issues.push('required_modules_missing');
  if (!ensureNonEmptyArray(contract?.primary_journeys)) issues.push('primary_journeys_missing');
  if (!ensureNonEmptyArray(contract?.business_logic_invariants)) issues.push('business_logic_invariants_missing');
  if (!contract?.decomposition_requirements || typeof contract.decomposition_requirements !== 'object') {
    issues.push('decomposition_requirements_missing');
  }

  if (!referenceLock) issues.push('reference_surface_lock_missing');
  if (referenceLock?.status !== 'locked') issues.push('reference_surface_lock_not_locked');
  if (referenceLock?.primary_reference_surface !== contract?.primary_reference_surface) {
    issues.push('reference_surface_lock_mismatch');
  }

  if (!reconstructionPack) issues.push('reconstruction_pack_missing');
  if (reconstructionPack?.status !== 'ready') issues.push('reconstruction_pack_not_ready');
  if (!ensureNonEmptyArray(reconstructionPack?.surface_map)) issues.push('reconstruction_pack_surface_map_missing');
  if (!ensureNonEmptyArray(reconstructionPack?.layout_map?.regions)) issues.push('reconstruction_pack_layout_map_missing');
  if (!ensureNonEmptyArray(reconstructionPack?.component_inventory)) issues.push('reconstruction_pack_component_inventory_missing');
  if (!ensureNonEmptyArray(reconstructionPack?.component_blueprint)) issues.push('reconstruction_pack_component_blueprint_missing');
  if (!ensureNonEmptyArray(reconstructionPack?.state_inventory)) issues.push('reconstruction_pack_state_inventory_missing');
  if (!reconstructionPack?.visual_token_map || typeof reconstructionPack.visual_token_map !== 'object') {
    issues.push('reconstruction_pack_visual_token_map_missing');
  }
  if (!reconstructionPack?.reference_intermediate_model || typeof reconstructionPack.reference_intermediate_model !== 'object') {
    issues.push('reconstruction_pack_reference_intermediate_model_missing');
  }

  if (!generationContract) issues.push('generation_contract_missing');
  if (generationContract?.status !== 'ready') issues.push('generation_contract_not_ready');
  if (!generationContract?.layout_constraints || typeof generationContract.layout_constraints !== 'object') {
    issues.push('generation_contract_layout_constraints_missing');
  }
  if (!generationContract?.component_constraints || typeof generationContract.component_constraints !== 'object') {
    issues.push('generation_contract_component_constraints_missing');
  }
  if (!ensureNonEmptyArray(generationContract?.component_constraints?.component_blueprint)) {
    issues.push('generation_contract_component_blueprint_missing');
  }
  if (!ensureNonEmptyArray(generationContract?.component_constraints?.staged_generation?.stages)) {
    issues.push('generation_contract_staged_generation_missing');
  }
  if (!generationContract?.state_constraints || typeof generationContract.state_constraints !== 'object') {
    issues.push('generation_contract_state_constraints_missing');
  }
  if (!generationContract?.visual_constraints || typeof generationContract.visual_constraints !== 'object') {
    issues.push('generation_contract_visual_constraints_missing');
  }
  if (!generationContract?.visual_constraints?.geometry_hints || typeof generationContract.visual_constraints.geometry_hints !== 'object') {
    issues.push('generation_contract_geometry_hints_missing');
  }
  if (!generationContract?.visual_constraints?.token_hints || typeof generationContract.visual_constraints.token_hints !== 'object') {
    issues.push('generation_contract_token_hints_missing');
  }
  if (!generationContract?.repair_policy || typeof generationContract.repair_policy !== 'object') {
    issues.push('generation_contract_repair_policy_missing');
  }

  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? 'accepted' : 'needs_human',
    artifact_file: artifactPath,
    issues,
  };
}

export default competitorContractValidate;
