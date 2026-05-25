import { resolveChangePath, writeJsonFile } from '../../change-artifacts.js';

export async function notifyCheckpoint(input = {}, context = {}) {
  const projectRoot = context.projectRoot || process.cwd();
  const changeId = context.changeId || input.change_id;
  if (!changeId) throw new Error('change_id is required for notify.checkpoint');

  const phase = input.phase || context.phase?.id || 'checkpoint';
  const provider = input.provider || 'file';
  if (!['file', 'mock'].includes(provider)) {
    return {
      ok: false,
      error: `Unsupported notify provider: ${provider}`,
      supported_providers: ['file', 'mock'],
    };
  }

  const evidence = {
    version: 1,
    provider,
    phase,
    change_id: changeId,
    mission_id: input.mission_id || context.runtime?.missionId || null,
    recipient: input.recipient || null,
    artifact_url: input.artifact_url || input.artifact || null,
    message: input.message || `Checkpoint notification for ${phase}`,
    sent_at: new Date().toISOString(),
    status: provider === 'mock' ? 'mock_sent' : 'sent',
    approves_gate: false,
    authority: 'notification_only_human_gate_ack_required',
  };
  const outputPath = resolveChangePath(projectRoot, changeId, `notification/checkpoint-${sanitizeFilePart(phase)}.json`);
  writeJsonFile(outputPath, evidence);
  return {
    ok: true,
    provider,
    phase,
    notification_file: outputPath,
    approves_gate: false,
    evidence,
  };
}

function sanitizeFilePart(value) {
  return String(value || 'checkpoint').replace(/[^a-zA-Z0-9._-]+/g, '-');
}
