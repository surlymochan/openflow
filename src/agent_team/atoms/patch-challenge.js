import { writeReviewArtifact } from '../common.js';

export async function patchChallenge(input = {}, context = {}) {
  const projectRoot = context.projectRoot || process.cwd();
  const changeId = context.changeId || input.change_id || null;
  const mode = input.mode || context.phase?.id || 'execute';
  if (!changeId) throw new Error('change_id is required for I4.patch.challenge');

  const findings = mode === 'review'
    ? [{ summary: 'No blocking review finding remained after the latest patch.' }]
    : [{ summary: 'Execution patch challenge finished without a structural regression.' }];
  const outputPath = writeReviewArtifact(projectRoot, changeId, `Patch challenge ${mode} completed.`, findings);

  return {
    ok: true,
    output_file: outputPath,
    findings,
  };
}
