import { createMission } from '../../mission-state.js';
import { mutateStore, resolveDataFile } from '../../state-store.js';

export async function missionCreate(input = {}, context = {}) {
  const projectRoot = context.projectRoot || process.cwd();
  const dataFile = resolveDataFile({ projectRoot, explicitPath: input.data_file || null });
  const result = await mutateStore(
    (state) => createMission(state, { ...input, change_id: context.changeId || null }),
    dataFile,
  );

  return {
    ok: true,
    data_file: dataFile,
    mission_id: result.mission.mission_id,
    mission: result.mission,
    replay_event: result.replay_event,
  };
}
