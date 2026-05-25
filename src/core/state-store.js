import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const DEFAULT_STATE = {
  version: 1,
  missions: [],
  tasks: [],
  events: [],
  memories: [],
  gate_decisions: [],
  interventions: [],
  phase_runs: [],
  phase_run_sessions: [],
  reruns: [],
  operator_actions: [],
  mission_controls: [],
};

const mutationQueue = new Map();
const SNAPSHOT_RETENTION_LIMIT = 200;

function sqlitePathFor(requestedPath) {
  if (requestedPath.endsWith('.sqlite') || requestedPath.endsWith('.db')) {
    return requestedPath;
  }
  if (requestedPath.endsWith('.json')) {
    return requestedPath.replace(/\.json$/u, '.sqlite');
  }
  return `${requestedPath}.sqlite`;
}

function nowIso() {
  return new Date().toISOString();
}

function mergeState(parsed = {}) {
  return {
    ...structuredClone(DEFAULT_STATE),
    ...parsed,
    missions: parsed.missions ?? [],
    tasks: parsed.tasks ?? [],
    events: parsed.events ?? [],
    memories: parsed.memories ?? [],
    gate_decisions: parsed.gate_decisions ?? [],
    interventions: parsed.interventions ?? [],
    phase_runs: parsed.phase_runs ?? [],
    phase_run_sessions: parsed.phase_run_sessions ?? [],
    reruns: parsed.reruns ?? [],
    operator_actions: parsed.operator_actions ?? [],
    mission_controls: parsed.mission_controls ?? [],
  };
}

function openStateDatabase(file) {
  const database = new DatabaseSync(file);
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS current_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      state_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS state_snapshots (
      snapshot_id INTEGER PRIMARY KEY AUTOINCREMENT,
      state_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  return database;
}

function readCurrentStateRow(database) {
  return database.prepare('SELECT state_json FROM current_state WHERE id = 1').get() || null;
}

function writeStateSnapshot(database, state, timestamp = nowIso()) {
  const serialized = JSON.stringify(state, null, 2);
  database.prepare(`
    INSERT INTO current_state (id, state_json, updated_at)
    VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      state_json = excluded.state_json,
      updated_at = excluded.updated_at
  `).run(serialized, timestamp);
  database.prepare('INSERT INTO state_snapshots (state_json, created_at) VALUES (?, ?)').run(serialized, timestamp);
  database.prepare(`
    DELETE FROM state_snapshots
    WHERE snapshot_id NOT IN (
      SELECT snapshot_id
      FROM state_snapshots
      ORDER BY snapshot_id DESC
      LIMIT ?
    )
  `).run(SNAPSHOT_RETENTION_LIMIT);
  database.prepare(`
    INSERT INTO meta (key, value)
    VALUES ('store_backend', 'sqlite')
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run();
}

function initializeDatabase(file) {
  const database = openStateDatabase(file);
  try {
    if (!readCurrentStateRow(database)) {
      writeStateSnapshot(database, structuredClone(DEFAULT_STATE));
    }
  } finally {
    database.close();
  }
}

export function resolveDataFile({ projectRoot = process.cwd(), explicitPath = null } = {}) {
  const requested = explicitPath || process.env.AS_XFLOW_DATA_FILE || resolve(projectRoot, '.as-xflow', 'state.sqlite');
  return sqlitePathFor(requested);
}

export async function ensureStore(dataFile = resolveDataFile()) {
  const file = resolveDataFile({ explicitPath: dataFile });
  await mkdir(dirname(file), { recursive: true });
  initializeDatabase(file);
  return file;
}

export async function readStore(dataFile = resolveDataFile()) {
  const file = await ensureStore(dataFile);
  const database = openStateDatabase(file);
  try {
    const row = readCurrentStateRow(database);
    if (!row) {
      return structuredClone(DEFAULT_STATE);
    }
    const parsed = row.state_json.trim() ? JSON.parse(row.state_json) : structuredClone(DEFAULT_STATE);
    return mergeState(parsed);
  } finally {
    database.close();
  }
}

export async function writeStore(state, dataFile = resolveDataFile()) {
  const file = await ensureStore(dataFile);
  const database = openStateDatabase(file);
  try {
    database.exec('BEGIN IMMEDIATE');
    writeStateSnapshot(database, state);
    database.exec('COMMIT');
  } catch (error) {
    try {
      database.exec('ROLLBACK');
    } catch {
      // Ignore rollback failures; the original error is the useful one.
    }
    throw error;
  } finally {
    database.close();
  }
}

export async function mutateStore(mutator, dataFile = resolveDataFile()) {
  const file = resolveDataFile({ explicitPath: dataFile });
  const previous = mutationQueue.get(file) ?? Promise.resolve();
  const current = previous.then(async () => {
    await ensureStore(file);
    const database = openStateDatabase(file);
    try {
      database.exec('BEGIN IMMEDIATE');
      const row = readCurrentStateRow(database);
      const parsed = row?.state_json?.trim() ? JSON.parse(row.state_json) : structuredClone(DEFAULT_STATE);
      const state = mergeState(parsed);
      const result = await mutator(state);
      writeStateSnapshot(database, state);
      database.exec('COMMIT');
      return result;
    } catch (error) {
      try {
        database.exec('ROLLBACK');
      } catch {
        // Ignore rollback failures; the original error is the useful one.
      }
      throw error;
    } finally {
      database.close();
    }
  });

  mutationQueue.set(file, current);

  try {
    return await current;
  } finally {
    if (mutationQueue.get(file) === current) {
      mutationQueue.delete(file);
    }
  }
}
