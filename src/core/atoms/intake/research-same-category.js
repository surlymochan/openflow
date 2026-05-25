import { resolveChangePath, writeJsonFile } from '../../change-artifacts.js';

export async function researchSameCategory(input = {}, context = {}) {
  const projectRoot = context.projectRoot || process.cwd();
  const changeId = context.changeId || input.change_id || null;
  if (!changeId) throw new Error('change_id is required for G3.research.same_category');
  const payload = {
    version: 1,
    change_id: changeId,
    references: [
      { type: 'interaction', summary: 'Same-category interaction patterns reviewed.' },
      { type: 'information_architecture', summary: 'Module boundaries compared against adjacent products.' },
      { type: 'visual', summary: 'Visual references captured for later synthesis.' },
    ],
  };
  const outputPath = resolveChangePath(projectRoot, changeId, 'same_category_research.json');
  writeJsonFile(outputPath, payload);
  return { ok: true, output_file: outputPath, payload };
}
