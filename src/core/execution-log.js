import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildLogEntryHash, validateExecutionLogChain } from './workflow-integrity.js';

function nowIso() {
  return new Date().toISOString();
}

let appendQueue = Promise.resolve();

export function resolveExecutionLogPath(projectRoot = process.cwd()) {
  return resolve(projectRoot, '.as-xflow', 'logs', 'execution.ndjson');
}

export async function appendExecutionLog(projectRoot, entry = {}) {
  const append = appendQueue.then(
    () => appendExecutionLogUnlocked(projectRoot, entry),
    () => appendExecutionLogUnlocked(projectRoot, entry),
  );
  appendQueue = append.catch(() => {});
  return append;
}

async function appendExecutionLogUnlocked(projectRoot, entry = {}) {
  const file = resolveExecutionLogPath(projectRoot);
  await mkdir(dirname(file), { recursive: true });
  const previousHash = await readLastEntryHash(file);
  const payload = {
    timestamp: nowIso(),
    ...entry,
    prev_hash: previousHash,
  };
  payload.entry_hash = buildLogEntryHash(payload);
  await appendFile(file, `${JSON.stringify(payload)}\n`, 'utf8');
  return file;
}

export function appendExecutionLogSync(projectRoot, entry = {}) {
  const file = resolveExecutionLogPath(projectRoot);
  mkdirSync(dirname(file), { recursive: true });
  const previousHash = readLastEntryHashSync(file);
  const payload = {
    timestamp: nowIso(),
    ...entry,
    prev_hash: previousHash,
  };
  payload.entry_hash = buildLogEntryHash(payload);
  appendFileSync(file, `${JSON.stringify(payload)}\n`, 'utf8');
  return file;
}

export async function readExecutionLog(projectRoot, options = {}) {
  const file = resolveExecutionLogPath(projectRoot);
  const limit = Math.max(1, Number(options.limit || 20));

  try {
    const raw = await readFile(file, 'utf8');
    const chronological = raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return { kind: 'invalid_log_line', raw: line };
        }
      });
    const chain = validateExecutionLogChain(chronological);
    const entries = chronological.slice(-limit).reverse();

    return { file, entries, entries_chronological: chronological, chain };
  } catch {
    return { file, entries: [], entries_chronological: [], chain: { ok: true, issues: [], entries_checked: 0 } };
  }
}

async function readLastEntryHash(file) {
  try {
    const raw = await readFile(file, 'utf8');
    return lastEntryHashFromRaw(raw);
  } catch {
    return null;
  }
}

function readLastEntryHashSync(file) {
  try {
    const raw = readFileSync(file, 'utf8');
    return lastEntryHashFromRaw(raw);
  } catch {
    return null;
  }
}

function lastEntryHashFromRaw(raw) {
  const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const entry = JSON.parse(lines[index]);
      if (entry.entry_hash) return entry.entry_hash;
    } catch {
      return null;
    }
  }
  return null;
}
