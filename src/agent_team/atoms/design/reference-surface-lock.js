import { resolveChangePath, writeJsonFile } from '../../../core/change-artifacts.js';

function list(inputValue) {
  return Array.isArray(inputValue) ? inputValue.filter(Boolean) : [];
}

export async function referenceSurfaceLock(input = {}, context = {}) {
  const projectRoot = context.projectRoot || process.cwd();
  const changeId = context.changeId || input.change_id || null;
  if (!changeId) throw new Error('change_id is required for H2d.design.reference_surface_lock');

  const targetSurfaces = list(input.target_surfaces);
  const requiredModules = list(input.required_modules);
  const primaryJourneys = list(input.primary_journeys);
  const primaryReferenceSurface = typeof input.primary_reference_surface === 'string' && input.primary_reference_surface.trim()
    ? input.primary_reference_surface.trim()
    : (targetSurfaces[0] || null);
  const supportingReferenceSurfaces = targetSurfaces.filter((surface) => surface && surface !== primaryReferenceSurface);
  const artifactPath = resolveChangePath(projectRoot, changeId, 'reference_surface_lock.json');

  const payload = {
    version: 1,
    phase: 'reference_surface_lock',
    change_id: changeId,
    generated_at: new Date().toISOString(),
    status: 'locked',
    summary: 'A single primary reference surface was locked before generation to prevent multi-reference drift.',
    reference_surface_lock: {
      status: 'locked',
      primary_reference_surface: primaryReferenceSurface,
      supporting_reference_surfaces: supportingReferenceSurfaces,
      focus_modules: requiredModules,
      focus_journeys: primaryJourneys,
      locking_rationale: primaryReferenceSurface
        ? `Generation should mirror ${primaryReferenceSurface} first and only borrow from supporting surfaces when explicitly needed.`
        : 'Primary reference surface is still missing and must be supplied before generation.',
    },
  };

  writeJsonFile(artifactPath, payload);
  return {
    ok: Boolean(primaryReferenceSurface),
    status: primaryReferenceSurface ? 'locked' : 'needs_human',
    output_file: artifactPath,
    payload,
  };
}

export default referenceSurfaceLock;
