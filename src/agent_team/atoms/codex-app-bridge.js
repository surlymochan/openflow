export async function codexAppBridge(input = {}, context = {}) {
  return {
    ok: true,
    bridge: 'local-codex',
    phase: input.phase || context.phase?.id || null,
    message: 'Codex app bridge placeholder completed locally.',
  };
}
