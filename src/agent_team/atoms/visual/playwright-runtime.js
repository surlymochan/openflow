export async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Playwright is required for visual capture/diff but is unavailable: ${reason}`);
  }
}
