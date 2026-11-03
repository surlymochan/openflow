import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const REPO_ROOT = process.cwd();
const V2_CODES = ['expected_value_from_implementation', 'assertion_in_dead_callback', 'self_comparison_assertion'];

function analyze(content, impl = null) {
  const script = [
    'import sys, json',
    "sys.path.insert(0, 'xflow/atoms')",
    'import tdd_lib',
    'payload = json.load(sys.stdin)',
    "findings = tdd_lib.analyze_test(payload['content'], implementation_sources=payload.get('impl'))",
    'print(json.dumps(findings))',
  ].join('\n');
  const result = spawnSync('python3', ['-c', script], {
    cwd: REPO_ROOT,
    input: JSON.stringify({ content, impl }),
    encoding: 'utf8',
    timeout: 20000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function codes(findings) {
  return findings.map((finding) => finding.code);
}

describe('I6c gate v2: expected value taken from the implementation', () => {
  test('flags a JS test asserting against an imported implementation constant', () => {
    const impl = [
      'export const MAX_RETRIES = 5;',
      'export function getRetries() { return MAX_RETRIES; }',
      '',
    ].join('\n');
    const content = [
      "import assert from 'node:assert/strict';",
      "import { getRetries, MAX_RETRIES } from '../src/config.js';",
      'assert.equal(getRetries(), MAX_RETRIES);',
      '',
    ].join('\n');
    const findings = analyze(content, [impl]);
    assert.ok(codes(findings).includes('expected_value_from_implementation'));
    assert.equal(findings.find((f) => f.code === 'expected_value_from_implementation').symbol, 'MAX_RETRIES');
  });

  test('flags a Python test asserting against an implementation constant', () => {
    const impl = 'TIMEOUT_SECONDS = 30\n';
    const content = [
      'from client import TIMEOUT_SECONDS, build_client',
      '',
      'client = build_client()',
      'assert client.timeout == TIMEOUT_SECONDS',
      '',
    ].join('\n');
    const findings = analyze(content, [impl]);
    assert.ok(codes(findings).includes('expected_value_from_implementation'));
  });

  test('passes when the test pins an independent literal (the value impl happens to return)', () => {
    const impl = 'export function answer() { return 42; }\n';
    const content = [
      "import assert from 'node:assert/strict';",
      "import { answer } from '../src/feature.js';",
      'assert.equal(answer(), 42);',
      '',
    ].join('\n');
    const findings = analyze(content, [impl]);
    assert.deepEqual(codes(findings).filter((code) => V2_CODES.includes(code)), []);
  });

  test('passes when the test defines its own constant with the same name', () => {
    const impl = 'export const MAX_RETRIES = 5;\n';
    const content = [
      "import assert from 'node:assert/strict';",
      'const MAX_RETRIES = 3;',
      'assert.equal(getRetries(), MAX_RETRIES);',
      '',
    ].join('\n');
    const findings = analyze(content, [impl]);
    assert.deepEqual(codes(findings).filter((code) => V2_CODES.includes(code)), []);
  });

  test('passes when the implementation constant is only used as test input, not as the expectation', () => {
    const impl = 'export const MAX_RETRIES = 5;\n';
    const content = [
      "import assert from 'node:assert/strict';",
      "import { MAX_RETRIES } from '../src/config.js';",
      'const request = buildRequest(MAX_RETRIES);',
      'assert.equal(request.attempts, 3);',
      '',
    ].join('\n');
    const findings = analyze(content, [impl]);
    assert.deepEqual(codes(findings).filter((code) => V2_CODES.includes(code)), []);
  });
});

describe('I6c gate v2: assertions in dead callbacks', () => {
  test('flags a JS arrow callback whose assertions are never referenced again', () => {
    const content = [
      "import assert from 'node:assert/strict';",
      'const onData = (chunk) => {',
      "  assert.equal(chunk, 'x');",
      '};',
      'assert.equal(answer(), 42);',
      '',
    ].join('\n');
    const findings = analyze(content);
    assert.ok(codes(findings).includes('assertion_in_dead_callback'));
    assert.equal(findings.find((f) => f.code === 'assertion_in_dead_callback').symbol, 'onData');
  });

  test('flags a Python helper whose assertions are never called', () => {
    const content = [
      'def check_result():',
      '    assert compute() == 3',
      '',
      'def test_main():',
      '    assert compute() == 3',
      '',
    ].join('\n');
    const findings = analyze(content);
    assert.ok(codes(findings).includes('assertion_in_dead_callback'));
  });

  test('passes when the callback is registered with an emitter', () => {
    const content = [
      "import assert from 'node:assert/strict';",
      'const onData = (chunk) => {',
      "  assert.equal(chunk, 'x');",
      '};',
      "emitter.on('data', onData);",
      'assert.equal(answer(), 42);',
      '',
    ].join('\n');
    const findings = analyze(content);
    assert.deepEqual(codes(findings).filter((code) => V2_CODES.includes(code)), []);
  });

  test('passes for anonymous framework callbacks (the normal test shape)', () => {
    const content = [
      "import test from 'node:test';",
      "import assert from 'node:assert/strict';",
      "test('adds', () => { assert.equal(add(1, 1), 2); });",
      '',
    ].join('\n');
    const findings = analyze(content);
    assert.deepEqual(codes(findings).filter((code) => V2_CODES.includes(code)), []);
  });

  test('passes for Python test functions and exported JS helpers', () => {
    const py = analyze([
      'def test_compute():',
      '    assert compute() == 3',
      '',
    ].join('\n'));
    assert.deepEqual(codes(py).filter((code) => V2_CODES.includes(code)), []);

    const js = analyze([
      'export function checkIt() {',
      '  assert.equal(run(), 7);',
      '}',
      'assert.equal(answer(), 42);',
      '',
    ].join('\n'));
    assert.deepEqual(codes(js).filter((code) => V2_CODES.includes(code)), []);
  });
});

describe('I6c gate v2: self-comparison assertions', () => {
  test('flags assert.equal(x, x) and expect(x).toBe(x)', () => {
    const js = analyze([
      "import assert from 'node:assert/strict';",
      'assert.equal(state.count, state.count);',
      '',
    ].join('\n'));
    assert.ok(codes(js).includes('self_comparison_assertion'));

    const expectStyle = analyze('expect(total).toBe(total);\n');
    assert.ok(codes(expectStyle).includes('self_comparison_assertion'));
  });

  test('passes for comparisons of distinct expressions', () => {
    const findings = analyze([
      "import assert from 'node:assert/strict';",
      'assert.equal(state.count, expectedCount);',
      'expect(total).toBe(computedTotal);',
      '',
    ].join('\n'));
    assert.deepEqual(codes(findings).filter((code) => V2_CODES.includes(code)), []);
  });
});
