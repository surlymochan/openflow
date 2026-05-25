import { resolveBoundMissionId } from '../../bindings.js';
import { findPhaseRunSession, persistPhaseRun } from '../../mission-state.js';
import { mutateStore, resolveDataFile } from '../../state-store.js';

export async function phaseRunPersist(input = {}, context = {}) {
  const projectRoot = context.projectRoot || process.cwd();
  const dataFile = resolveDataFile({ projectRoot, explicitPath: input.data_file || null });
  const missionId = resolveBoundMissionId({
    projectRoot,
    changeId: context.changeId || null,
    missionId: input.mission_id || null,
    runtimeMissionId: context.runtime?.missionId || null,
  });

  if (!missionId) {
    throw new Error('mission_id is required for D3b.phase_run.persist');
  }

  const payload = {
    ...input,
    session_id: input.session_id || context.runtime?.phaseRunSessionId || null,
    phase_run_id: input.phase_run_id || context.runtime?.phaseRunId || null,
  };

  const result = await mutateStore((state) => {
    const phaseRun = persistPhaseRun(state, missionId, payload);
    const session = findPhaseRunSession(state, missionId, payload.session_id || null);
    return { phaseRun, session };
  }, dataFile);

  return {
    ok: true,
    data_file: dataFile,
    mission_id: missionId,
    phase_run_id: result.phaseRun.phase_run_id,
    phase_run: result.phaseRun,
    session: result.session,
  };
}
