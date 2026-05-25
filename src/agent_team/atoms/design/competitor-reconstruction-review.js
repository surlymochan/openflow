import { synthesizePhaseArtifact } from '../../common.js';

export async function competitorReconstructionReview(input = {}, context = {}) {
  const targetSurfaces = Array.isArray(input.target_surfaces) ? input.target_surfaces : [];
  const requiredModules = Array.isArray(input.required_modules) ? input.required_modules : [];
  const primaryJourneys = Array.isArray(input.primary_journeys) ? input.primary_journeys : [];
  const businessLogicInvariants = Array.isArray(input.business_logic_invariants) ? input.business_logic_invariants : [];
  const primaryReferenceSurface = typeof input.primary_reference_surface === 'string' && input.primary_reference_surface.trim()
    ? input.primary_reference_surface.trim()
    : (targetSurfaces[0] || null);
  const supportingReferenceSurfaces = targetSurfaces.filter((surface) => surface && surface !== primaryReferenceSurface);

  return synthesizePhaseArtifact(input, context, {
    phase: 'competitor_reconstruction_review',
    summary: 'Competitor reconstruction contract was frozen with a locked primary reference surface, explicit decomposition scope, and business-logic invariants.',
    findings: [
      { summary: 'Competitor product, target surfaces, and a single primary reference surface were named explicitly.' },
      { summary: 'Required modules and IA were mapped beyond a single visible page slice and prepared for structured decomposition.' },
      { summary: 'Primary journeys and business-logic invariants were frozen before visual execution and benchmark repair.' },
    ],
    extraEnvelope: {
      competitor_reconstruction_contract: {
        status: 'frozen',
        competitor_product: input.competitor_product || 'required',
        target_surfaces: targetSurfaces,
        primary_reference_surface: primaryReferenceSurface,
        supporting_reference_surfaces: supportingReferenceSurfaces,
        required_modules: requiredModules,
        primary_journeys: primaryJourneys,
        business_logic_invariants: businessLogicInvariants,
        decomposition_requirements: {
          surface_map_required: true,
          layout_map_required: true,
          component_inventory_required: true,
          state_inventory_required: true,
          visual_token_map_required: true,
          reference_intermediate_model_required: true,
        },
      },
    },
  });
}

export default competitorReconstructionReview;
