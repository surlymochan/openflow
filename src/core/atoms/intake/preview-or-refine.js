import { resolveChangePath, writeJsonFile } from '../../change-artifacts.js';

export async function intakePreviewOrRefine(input = {}, context = {}) {
  const projectRoot = context.projectRoot || process.cwd();
  const changeId = context.changeId || input.change_id || null;
  if (!changeId) throw new Error('change_id is required for G1.intake.preview_or_refine');
  const mode = input.mode || 'preview';
  const outputPath = resolveChangePath(projectRoot, changeId, `intake_${mode}.json`);
  const payload = {
    version: 1,
    mode,
    change_id: changeId,
    summary: input.summary || context.input?.title || '',
    answers: input.answers || {},
    constraints: input.constraints || {},
  };
  writeJsonFile(outputPath, payload);
  return { ok: true, output_file: outputPath, payload };
}
