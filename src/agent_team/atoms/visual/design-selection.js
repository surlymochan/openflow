import { synthesizePhaseArtifact } from '../../common.js';
import { readJsonFile, resolveChangePath } from '../../../core/change-artifacts.js';

export async function visualDesignSelection(input = {}, context = {}) {
  const projectRoot = context.projectRoot || process.cwd();
  const changeId = context.changeId || input.change_id || null;
  const synthesis = readJsonFile(resolveChangePath(projectRoot, changeId, 'visual_direction_synthesis.json'), {}) || {};
  const visualDirection = synthesis.visual_direction_synthesis || {};
  const directions = Array.isArray(visualDirection.directions) ? visualDirection.directions : [];
  const selected = directions.find((direction) => direction.id === visualDirection.recommended_direction) || directions[0] || null;
  return synthesizePhaseArtifact(input, context, {
    phase: 'design_selection',
    summary: 'A winning high-aesthetic direction and fallback candidate were selected.',
    extraEnvelope: {
      design_selection: {
        status: selected ? 'selected' : 'needs_input',
        selected_direction: selected,
        fallback_direction: directions.find((direction) => direction.id !== selected?.id) || null,
        selection_rule: 'Prefer reference-faithful product credibility before decorative novelty.',
      },
    },
  });
}
