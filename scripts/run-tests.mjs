import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = process.cwd();
const requestedFiles = process.argv.slice(2);
const testFiles = requestedFiles.length > 0
  ? requestedFiles
  : readdirSync(resolve(repoRoot, 'test'))
    .filter((name) => name.endsWith('.test.js'))
    .sort()
    .map((name) => `test/${name}`);

for (const testFile of testFiles) {
  const result = spawnSync(process.execPath, [testFile], {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
