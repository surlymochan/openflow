import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { cpus, platform, release } from 'node:os';

function commandOutput(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) return '';
  return (result.stdout || '').trim();
}

function cpuModel() {
  try {
    const info = readFileSync('/proc/cpuinfo', 'utf8');
    const line = info.split('\n').find((entry) => entry.startsWith('model name'));
    if (line) return line.split(':').slice(1).join(':').trim();
  } catch {
    // fall through
  }
  return cpus()[0]?.model || 'unknown';
}

function osName() {
  try {
    const text = readFileSync('/etc/os-release', 'utf8');
    const match = text.match(/^PRETTY_NAME="?(.*?)"?$/m);
    if (match) return match[1];
  } catch {
    // fall through
  }
  return platform();
}

export function collectEnvironment({ repoRoot, superpowersDir }) {
  return {
    date: new Date().toISOString(),
    cpuModel: cpuModel(),
    cores: cpus().length,
    os: osName(),
    platform: platform(),
    kernel: release(),
    node: process.version,
    nodePath: process.execPath,
    python: commandOutput('python3', ['--version']),
    openflowCommit: commandOutput('git', ['rev-parse', 'HEAD'], repoRoot),
    openflowBranch: commandOutput('git', ['rev-parse', '--abbrev-ref', 'HEAD'], repoRoot),
    superpowersDir,
    superpowersCommit: commandOutput('git', ['rev-parse', 'HEAD'], superpowersDir),
    superpowersTag: commandOutput('git', ['describe', '--tags', '--exact-match', 'HEAD'], superpowersDir),
  };
}
