import { resolveBoundMissionId } from '../../bindings.js';
import { completePhaseRunSession, findPhaseRunSession } from '../../mission-state.js';
import { mutateStore, resolveDataFile } from '../../state-store.js';

export async function phaseRunComplete(input = {}, context = {}) {
  const projectRoot = context.projectRoot || process.cwd();
  const dataFile = resolveDataFile({ projectRoot, explicitPath: input.data_file || null });
  const missionId = resolveBoundMissionId({
    projectRoot,
    changeId: context.changeId || null,
    missionId: input.mission_id || null,
    runtimeMissionId: context.runtime?.missionId || null,
  });

  if (!missionId) {
    throw new Error('mission_id is required for D3c.phase_run.complete');
  }

  const sessionId = input.session_id || context.runtime?.phaseRunSessionId || null;

  const result = await mutateStore((state) => {
    const session = sessionId ? findPhaseRunSession(state, missionId, sessionId) : findPhaseRunSession(state, missionId);
    if (!session) {
      throw new Error(`No phase run session found for mission ${missionId}`);
    }

    const completed = completePhaseRunSession(state, missionId, session.session_id, {
      phase_run_id: input.phase_run_id || context.runtime?.phaseRunId || session.phase_run_id || null,
      status: input.status || 'completed',
      stop_reason: input.stop_reason || null,
      completed_at: input.completed_at || null,
    });
    return { session: completed };
  }, dataFile);

  return {
    ok: true,
    data_file: dataFile,
    mission_id: missionId,
    session: result.session,
  };
}
