import { getMissionDetail } from '../../mission-state.js';
import { resolveBoundMissionId } from '../../bindings.js';
import { readStore, resolveDataFile } from '../../state-store.js';

export async function missionShow(input = {}, context = {}) {
  const projectRoot = context.projectRoot || process.cwd();
  const dataFile = resolveDataFile({ projectRoot, explicitPath: input.data_file || null });
  const missionId = resolveBoundMissionId({
    projectRoot,
    changeId: context.changeId || null,
    missionId: input.mission_id || null,
    runtimeMissionId: context.runtime?.missionId || null,
  });

  if (!missionId) {
    throw new Error('mission_id is required for D2b.mission.show');
  }

  const state = await readStore(dataFile);
  return {
    ok: true,
    data_file: dataFile,
    mission_id: missionId,
    detail: getMissionDetail(state, missionId),
  };
}
