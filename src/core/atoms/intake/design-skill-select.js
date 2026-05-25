import { resolveChangePath, writeJsonFile } from '../../change-artifacts.js';

export async function designSkillSelect(input = {}, context = {}) {
  const projectRoot = context.projectRoot || process.cwd();
  const changeId = context.changeId || input.change_id || null;
  if (!changeId) throw new Error('change_id is required for G4.design_skill.select');
  const payload = {
    version: 1,
    change_id: changeId,
    selected_skill: input.skill || 'design-contract-lite',
    rationale: input.rationale || 'Selected the default heavy-track design skill for consistent output.',
  };
  const outputPath = resolveChangePath(projectRoot, changeId, 'design_skill_selection.json');
  writeJsonFile(outputPath, payload);
  return { ok: true, output_file: outputPath, payload };
}
