import { resolveBoundMissionId } from '../../bindings.js';
import { failPhaseRunSession, findPhaseRunSession } from '../../mission-state.js';
import { mutateStore, resolveDataFile } from '../../state-store.js';

export async function phaseRunFail(input = {}, context = {}) {
  const projectRoot = context.projectRoot || process.cwd();
  const dataFile = resolveDataFile({ projectRoot, explicitPath: input.data_file || null });
  const missionId = resolveBoundMissionId({
    projectRoot,
    changeId: context.changeId || null,
    missionId: input.mission_id || null,
    runtimeMissionId: context.runtime?.missionId || null,
  });

  if (!missionId) {
    throw new Error('mission_id is required for D3d.phase_run.fail');
  }

  const sessionId = input.session_id || context.runtime?.phaseRunSessionId || null;

  const result = await mutateStore((state) => {
    const session = sessionId ? findPhaseRunSession(state, missionId, sessionId) : findPhaseRunSession(state, missionId);
    if (!session) {
      throw new Error(`No phase run session found for mission ${missionId}`);
    }

    const failed = failPhaseRunSession(state, missionId, session.session_id, {
      summary: input.summary || input.stop_reason || 'phase_run_failed',
      detail: input.detail || null,
    });
    return { session: failed };
  }, dataFile);

  return {
    ok: true,
    data_file: dataFile,
    mission_id: missionId,
    session: result.session,
  };
}
