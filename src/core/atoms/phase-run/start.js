import { resolveBoundMissionId } from '../../bindings.js';
import { startPhaseRunSession } from '../../mission-state.js';
import { mutateStore, resolveDataFile } from '../../state-store.js';

export async function phaseRunStart(input = {}, context = {}) {
  const projectRoot = context.projectRoot || process.cwd();
  const dataFile = resolveDataFile({ projectRoot, explicitPath: input.data_file || null });
  const missionId = resolveBoundMissionId({
    projectRoot,
    changeId: context.changeId || null,
    missionId: input.mission_id || null,
    runtimeMissionId: context.runtime?.missionId || null,
  });

  if (!missionId) {
    throw new Error('mission_id is required for D3a.phase_run.start');
  }

  const session = await mutateStore(
    (state) => startPhaseRunSession(state, missionId, input),
    dataFile,
  );

  return {
    ok: true,
    data_file: dataFile,
    mission_id: missionId,
    session,
  };
}
