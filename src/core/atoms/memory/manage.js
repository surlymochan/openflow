import { createMemoryItem, listMemoryItems, resolveMemoryMissionId } from '../../memory-state.js';
import { mutateStore, readStore, resolveDataFile } from '../../state-store.js';

export async function memoryItemManage(input = {}, context = {}) {
  const projectRoot = context.projectRoot || process.cwd();
  const missionId = resolveMemoryMissionId(input, context);
  const dataFile = resolveDataFile({ projectRoot, explicitPath: input.data_file || null });
  const action = input.action || 'create';

  if (action === 'list') {
    const state = await readStore(dataFile);
    return {
      ok: true,
      items: listMemoryItems(state, { ...input, mission_id: missionId }),
    };
  }

  const item = await mutateStore(
    (state) => createMemoryItem(state, { ...input, mission_id: missionId }),
    dataFile,
  );

  return {
    ok: true,
    item,
  };
}
