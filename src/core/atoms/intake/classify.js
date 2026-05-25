import { resolveChangePath, writeJsonFile } from '../../change-artifacts.js';

export async function intakeClassify(input = {}, context = {}) {
  const projectRoot = context.projectRoot || process.cwd();
  const changeId = context.changeId || input.change_id || null;
  if (!changeId) throw new Error('change_id is required for G2.intake.classify');
  const classification = {
    change_type: context.input?.change_type || input.change_type || 'backend',
    risk_level: input.risk_level || 'medium',
    ui_heavy: Boolean(input.ui_heavy || ['frontend', 'full-stack'].includes(context.input?.change_type || '')),
  };
  const outputPath = resolveChangePath(projectRoot, changeId, 'intake_classification.json');
  writeJsonFile(outputPath, classification);
  return { ok: true, output_file: outputPath, classification };
}
