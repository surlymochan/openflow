import { synthesizePhaseArtifact } from '../../common.js';
import { readJsonFile, resolveChangePath, writeJsonFile, writeTextFile } from '../../../core/change-artifacts.js';

function buildDirection(id, label, emphasis, aestheticStandard = {}, imageReference = {}, designSystemPack = {}) {
  const practiceSources = Array.isArray(designSystemPack.practice_sources)
    ? designSystemPack.practice_sources.map((source) => source.id).filter(Boolean)
    : [];
  return {
    id,
    label,
    emphasis,
    aesthetic_dimensions: aestheticStandard.dimensions || [],
    design_system_practices: practiceSources,
    image_reference_brief: imageReference.enabled === false ? null : {
      model_capability: imageReference.model_capability || 'gpt_image_v2_style_reference',
      prompt_focus: [
        `Create a high-aesthetic ${label.toLowerCase()} product UI reference frame.`,
        `Emphasize ${emphasis}.`,
        'Preserve the locked surface decomposition, hierarchy, and product credibility.',
        `Honor the design-system pack profile: ${designSystemPack.profile || 'commercial_product_design_system_pack'}.`,
        'Output should guide editable UI primitives, not replace implementation.',
      ],
    },
  };
}

function materializeImageReferenceSet(projectRoot, changeId, imageReference = {}, directions = [], designSystemPack = {}) {
  if (imageReference.enabled === false) return null;

  const requiredOutputs = Array.isArray(imageReference.required_outputs)
    ? imageReference.required_outputs
    : [];
  const references = requiredOutputs.map((output, index) => {
    const direction = directions[index % Math.max(directions.length, 1)] || directions[0] || {};
    const artifactPath = resolveChangePath(projectRoot, changeId, `image-references/${output.id}.md`);
    const lines = [
      `# ${output.id}`,
      '',
      `model_capability: ${imageReference.model_capability || 'gpt_image_v2_style_reference'}`,
      `purpose: ${output.purpose || ''}`,
      `direction: ${direction.label || 'Reference-faithful'}`,
      `design_system_profile: ${designSystemPack.profile || 'commercial_product_design_system_pack'}`,
      '',
      '## Prompt',
      '',
      ...(direction.image_reference_brief?.prompt_focus || [
        'Create a high-aesthetic product UI reference artifact from the frozen generation contract.',
        'Keep the result translatable into editable Pencil and DOM primitives.',
      ]).map((line) => `- ${line}`),
      '',
      '## Translation Contract',
      '',
      '- Use this as an aesthetic reference target, not as the shipped implementation.',
      '- Preserve the design-system component whitelist, token policy, and required state set.',
      '- Preserve editable UI primitives and benchmarkable DOM/canvas evidence downstream.',
    ];
    writeTextFile(artifactPath, lines.join('\n'));
    return {
      id: output.id,
      status: 'ready',
      kind: 'image_reference_brief',
      model_capability: imageReference.model_capability || 'gpt_image_v2_style_reference',
      artifact_path: `specs/changes/${changeId}/image-references/${output.id}.md`,
      purpose: output.purpose || null,
    };
  });

  const payload = {
    version: 1,
    phase: 'image_reference_generation',
    change_id: changeId,
    status: references.length >= 3 ? 'ready' : 'needs_refine',
    model_capability: imageReference.model_capability || 'gpt_image_v2_style_reference',
    references,
    translation_contract: {
      editable_target: 'Pencil and DOM primitives',
      bitmap_non_goal: true,
      benchmark_required: true,
    },
  };
  writeJsonFile(resolveChangePath(projectRoot, changeId, 'image_reference_set.json'), payload);
  return payload;
}

export async function visualDirectionSynthesis(input = {}, context = {}) {
  const projectRoot = context.projectRoot || process.cwd();
  const changeId = context.changeId || input.change_id || null;
  const generation = readJsonFile(resolveChangePath(projectRoot, changeId, 'generation_contract.json'), {})?.generation_contract || {};
  const designSystemPack = readJsonFile(resolveChangePath(projectRoot, changeId, 'design_system_pack.json'), {}) || {};
  const visualConstraints = generation.visual_constraints || {};
  const aestheticStandard = visualConstraints.aesthetic_standard || {};
  const imageReference = visualConstraints.image_reference_generation || {};
  const directions = [
    buildDirection('reference-faithful', 'Reference-faithful', 'reference structure, density, and material restraint', aestheticStandard, imageReference, designSystemPack),
    buildDirection('clarity-first', 'Clarity-first', 'information hierarchy and repeated-component rhythm', aestheticStandard, imageReference, designSystemPack),
    buildDirection('state-polish', 'State-polish', 'interaction states, affordance contrast, and motion readiness', aestheticStandard, imageReference, designSystemPack),
  ];
  const imageReferenceSet = materializeImageReferenceSet(projectRoot, changeId, imageReference, directions, designSystemPack);
  return synthesizePhaseArtifact(input, context, {
    phase: 'visual_direction_synthesis',
    summary: 'Multiple high-aesthetic visual directions were synthesized with image-reference prompts and product-surface constraints.',
    extraEnvelope: {
      visual_direction_synthesis: {
        status: 'ready',
        aesthetic_standard: aestheticStandard,
        image_reference_generation: imageReference,
        design_system_pack: {
          status: designSystemPack.status || 'missing',
          profile: designSystemPack.profile || null,
          practice_sources: (designSystemPack.practice_sources || []).map((source) => source.id),
        },
        image_reference_set: imageReferenceSet
          ? {
            status: imageReferenceSet.status,
            artifact: 'image_reference_set.json',
            reference_count: imageReferenceSet.references.length,
          }
          : null,
        directions,
        recommended_direction: directions[0].id,
      },
    },
  });
}
