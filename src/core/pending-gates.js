import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

function nowIso() {
  return new Date().toISOString();
}

export function resolvePendingGatesDir(projectRoot = process.cwd()) {
  return resolve(projectRoot, '.as-xflow', 'pending-gates');
}

function readGateFile(filePath) {
  try {
    const payload = JSON.parse(readFileSync(filePath, 'utf8'));
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}

export function listPendingGates(projectRoot = process.cwd()) {
  const dir = resolvePendingGatesDir(projectRoot);
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir)
    .filter((entry) => entry.endsWith('.json'))
    .map((entry) => {
      const gate = readGateFile(resolve(dir, entry));
      return gate ? { ...gate, gate_file: resolve(dir, entry) } : null;
    })
    .filter((gate) => gate && gate.status !== 'approved')
    .sort((left, right) => String(right.created_at || '').localeCompare(String(left.created_at || '')));
}

export function readPendingGate(projectRoot = process.cwd(), phase) {
  const gateFile = resolve(resolvePendingGatesDir(projectRoot), `${phase}.json`);
  if (!existsSync(gateFile)) {
    return null;
  }
  const gate = readGateFile(gateFile);
  return gate ? { ...gate, gate_file: gateFile } : null;
}

export function ackPendingGate(projectRoot = process.cwd(), phase, options = {}) {
  const gateFile = resolve(resolvePendingGatesDir(projectRoot), `${phase}.json`);
  if (!existsSync(gateFile)) {
    throw new Error(`Pending gate not found: ${gateFile}`);
  }

  const pending = readGateFile(gateFile);
  if (!pending) {
    throw new Error(`Pending gate is invalid JSON: ${gateFile}`);
  }

  mkdirSync(resolvePendingGatesDir(projectRoot), { recursive: true });
  const approved = {
    ...pending,
    status: 'approved',
    approved_at: nowIso(),
    approved_by: options.approved_by || options.approvedBy || 'control-plane',
  };
  writeFileSync(gateFile, `${JSON.stringify(approved, null, 2)}\n`, 'utf8');
  return { ...approved, gate_file: gateFile };
}
