import { ingestEvent } from '../../mission-state.js';
import { mutateStore, resolveDataFile } from '../../state-store.js';
import { resolveBoundMissionId } from '../../bindings.js';

export async function eventIngest(input = {}, context = {}) {
  const projectRoot = context.projectRoot || process.cwd();
  const dataFile = resolveDataFile({ projectRoot, explicitPath: input.data_file || null });
  const missionId = resolveBoundMissionId({
    projectRoot,
    changeId: context.changeId || null,
    missionId: input.mission_id || null,
    runtimeMissionId: context.runtime?.missionId || null,
  });

  if (!missionId) {
    throw new Error('mission_id is required for D4.event.ingest');
  }

  const result = await mutateStore(
    (state) => ingestEvent(state, { ...input, mission_id: missionId }),
    dataFile,
  );

  return {
    ok: true,
    data_file: dataFile,
    mission_id: missionId,
    ...result,
  };
}
