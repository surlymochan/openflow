import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = process.cwd();

describe('package entry point', () => {
  test('package.json main resolves to a file that exists', async () => {
    const { default: packageJson } = await import('../package.json', {
      with: { type: 'json' },
    });
    assert.equal(typeof packageJson.main, 'string');
    assert.ok(
      existsSync(resolve(REPO_ROOT, packageJson.main)),
      `package.json main "${packageJson.main}" does not exist on disk`,
    );
  });

  test('importing the package main exposes the server starter', async () => {
    const entry = await import('../src/index.js');
    assert.equal(typeof entry.default, 'function');
    assert.equal(typeof entry.startServer, 'function');
    assert.equal(entry.default, entry.startServer);
  });
});
