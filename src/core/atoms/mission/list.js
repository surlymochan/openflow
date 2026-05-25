import { listMissions } from '../../mission-state.js';
import { readStore, resolveDataFile } from '../../state-store.js';

export async function missionList(input = {}, context = {}) {
  const projectRoot = context.projectRoot || process.cwd();
  const dataFile = resolveDataFile({ projectRoot, explicitPath: input.data_file || null });
  const state = await readStore(dataFile);

  return {
    ok: true,
    data_file: dataFile,
    missions: listMissions(state),
  };
}
