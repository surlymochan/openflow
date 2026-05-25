import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import { resolveChangePath, writeJsonFile } from '../../change-artifacts.js';

export async function pluginRun(input = {}, context = {}) {
  const projectRoot = context.projectRoot || process.cwd();
  const changeId = context.changeId || input.change_id;
  if (!changeId) throw new Error('change_id is required for plugin.run');

  const type = input.type || 'script';
  const ref = input.ref || '';
  const dryRun = input.dry_run !== false;
  const payload = input.payload || {};
  const result = dryRun
    ? dryRunResult(type, ref, payload)
    : executePlugin({ type, ref, payload, projectRoot, timeoutMs: Number(input.timeout_ms || 60000) });

  const output = {
    version: 1,
    change_id: changeId,
    type,
    ref,
    dry_run: dryRun,
    generated_at: new Date().toISOString(),
    result,
  };
  const outputPath = resolveChangePath(projectRoot, changeId, `plugin/${sanitizeFilePart(type)}-${sanitizeFilePart(ref || 'plugin')}.json`);
  writeJsonFile(outputPath, output);
  return {
    ok: result.status !== 'error',
    plugin_result_file: outputPath,
    result,
  };
}

function dryRunResult(type, ref, payload) {
  if (!['script', 'webhook', 'agent', 'skill', 'interactive'].includes(type)) {
    return { status: 'error', error: `Unknown plugin type: ${type}` };
  }
  return {
    status: 'dry_run',
    type,
    ref,
    payload_preview: payload,
    message: 'Plugin execution was recorded without external side effects.',
  };
}

function executePlugin({ type, ref, payload, projectRoot, timeoutMs }) {
  if (type !== 'script') {
    return { status: 'error', error: `Non-dry-run ${type} plugins are not supported by the generic v1 provider` };
  }
  const scriptPath = resolve(projectRoot, ref);
  const started = Date.now();
  const result = spawnSync('bash', [scriptPath], {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: timeoutMs,
    env: {
      ...process.env,
      PAYLOAD: JSON.stringify(payload),
    },
  });
  return {
    status: result.status === 0 ? 'ok' : 'error',
    exit_code: result.status,
    duration_ms: Date.now() - started,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function sanitizeFilePart(value) {
  return String(value || 'plugin').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 80);
}
