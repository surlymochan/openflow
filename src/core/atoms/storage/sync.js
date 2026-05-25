import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { resolveChangePath, writeJsonFile } from '../../change-artifacts.js';

export async function storageSync(input = {}, context = {}) {
  const projectRoot = context.projectRoot || process.cwd();
  const changeId = context.changeId || input.change_id;
  if (!changeId) throw new Error('change_id is required for storage.sync');

  const provider = input.provider || 'file';
  const direction = input.direction || 'import';
  if (!['file', 'mock'].includes(provider)) {
    return { ok: false, error: `Unsupported storage provider: ${provider}` };
  }
  if (!['import', 'export'].includes(direction)) {
    return { ok: false, error: `Unsupported storage direction: ${direction}` };
  }

  const source = input.source ? resolve(projectRoot, input.source) : null;
  const target = resolve(projectRoot, '.xflow', 'storage', normalizeStoragePath(input.target || 'artifact.json'));
  let copied = false;
  if (provider === 'file' && direction === 'import') {
    if (!source || !existsSync(source)) {
      return { ok: false, error: `storage source not found: ${source || '(missing)'}` };
    }
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
    copied = true;
  }

  const evidence = {
    version: 1,
    provider,
    direction,
    source,
    target,
    copied,
    generated_at: new Date().toISOString(),
  };
  const outputPath = resolveChangePath(projectRoot, changeId, `storage/${provider}-${direction}.json`);
  writeJsonFile(outputPath, evidence);
  return {
    ok: true,
    storage_sync_file: outputPath,
    storage_target: target,
    evidence,
  };
}

function normalizeStoragePath(value) {
  return String(value || 'artifact.json')
    .replace(/^\.+/, '')
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\/+/, '');
}
