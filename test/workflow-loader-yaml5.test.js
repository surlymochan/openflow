/**
 * Workflow Loader — js-yaml 5 migration pins
 *
 * js-yaml 4.1.1 -> 5.5.0 (see CHANGELOG [Unreleased]). Verified item by item
 * before the upgrade; these tests pin the outcome so a future yaml change
 * fails loudly instead of silently changing workflow parsing:
 *
 * 1. Both shipped workflows (yolo/corps) parse identically under v4 and v5
 *    (deep-equal, checked 2026-11-07 against the v4/v5 parsers directly).
 * 2. YAML 1.2 scalar resolution is unchanged: `on`/`yes` stay strings,
 *    `017` stays decimal 17, `0o17` stays octal 15, `1:30` stays a string,
 *    anchors/aliases still resolve. (Pinning YAML11_SCHEMA instead would
 *    flip all of these: on/yes -> true, 017 -> 15, 1:30 -> 90 — verified.)
 * 3. The one real break: v5's CORE_SCHEMA default no longer resolves the
 *    `<<` merge key. The loader rejects a literal `<<` key with an
 *    actionable error instead of letting it surface as a confusing
 *    schema-validation failure.
 * 4. Empty input: v4 returned `undefined` (schema validation then failed
 *    with "must be object"); v5 throws "expected a document, but the input
 *    is empty" directly. Either way the loader throws; the message is better.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as yaml from 'js-yaml';
import { load } from '../src/core/workflow-loader.js';

function withTempWorkflow(content) {
  const dir = mkdtempSync(join(tmpdir(), 'evalid-yaml5-'));
  const path = join(dir, 'probe.yaml');
  writeFileSync(path, content, 'utf8');
  return { dir, path };
}

describe('js-yaml 5: merge keys are rejected with an actionable error', () => {
  test('a workflow using << fails naming the merge key, not schema validation', () => {
    const { dir, path } = withTempWorkflow(
      'name: merge-key-probe\n' +
      'version: 1\n' +
      'description: probe\n' +
      'track: lite\n' +
      'phases:\n' +
      '  - id: probe\n' +
      '    label: probe\n' +
      '    catalog_ref: 1\n' +
      '    required: true\n' +
      '    atoms:\n' +
      '      - id: B3.status.transition\n' +
      '        with:\n' +
      '          <<: { to_stage: "plan" }\n' +
      '          extra: 1\n'
    );
    try {
      assert.throws(
        () => load(path, { skipRuntimeChecks: true }),
        /merge key.*<<.*no longer resolves.*Inline the merged mapping/s
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a merge key nested inside a phase gate is caught too', () => {
    const { dir, path } = withTempWorkflow(
      'name: merge-key-probe\n' +
      'version: 1\n' +
      'description: probe\n' +
      'track: lite\n' +
      'phases:\n' +
      '  - id: probe\n' +
      '    label: probe\n' +
      '    catalog_ref: 1\n' +
      '    required: true\n' +
      '    atoms:\n' +
      '      - id: B3.status.transition\n' +
      '    gate:\n' +
      '      type: deterministic\n' +
      '      atom: E6.gate.local_precheck\n' +
      '      with:\n' +
      '        <<: { phase: "pre-openissue" }\n'
    );
    try {
      assert.throws(
        () => load(path, { skipRuntimeChecks: true }),
        /merge key.*<</
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('js-yaml 5: empty input throws instead of reaching schema validation', () => {
  test('an empty workflow file throws a document error', () => {
    const { dir, path } = withTempWorkflow('');
    try {
      assert.throws(
        () => load(path, { skipRuntimeChecks: true }),
        /expected a document, but the input is empty/
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a comment-only workflow file throws the same way', () => {
    const { dir, path } = withTempWorkflow('# just a comment\n');
    try {
      assert.throws(
        () => load(path, { skipRuntimeChecks: true }),
        /expected a document, but the input is empty/
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('js-yaml 5: scalar resolution matches v4 for workflow content', () => {
  test('YAML 1.1 boolean words stay strings (no YAML11_SCHEMA flip)', () => {
    assert.deepEqual(yaml.load('a: on\nb: yes\nc: n\nd: Off\n'), {
      a: 'on', b: 'yes', c: 'n', d: 'Off',
    });
  });

  test('numbers keep v4 values: 017 is decimal 17, 0o17 is octal 15', () => {
    assert.deepEqual(yaml.load('a: 017\nb: 0o17\n'), { a: 17, b: 15 });
  });

  test('sexagesimal-looking scalars stay strings; anchors still resolve', () => {
    assert.equal(yaml.load('a: 1:30\n').a, '1:30');
    assert.deepEqual(yaml.load('a: &x 5\nb: *x\n'), { a: 5, b: 5 });
  });
});
