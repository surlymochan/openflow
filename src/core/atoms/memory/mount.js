import { buildMemoryMount, resolveMemoryMissionId } from '../../memory-state.js';
import { readStore, resolveDataFile } from '../../state-store.js';

export async function memoryMount(input = {}, context = {}) {
  const projectRoot = context.projectRoot || process.cwd();
  const missionId = resolveMemoryMissionId(input, context);
  const dataFile = resolveDataFile({ projectRoot, explicitPath: input.data_file || null });
  const state = await readStore(dataFile);
  return {
    ok: true,
    mount: buildMemoryMount(state, { ...input, mission_id: missionId }),
  };
}
