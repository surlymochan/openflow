import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = process.cwd();

describe('workflow manual and handoff currentness', () => {
  test('workflow manual reflects current atom count and yolo gates', () => {
    const registry = JSON.parse(readFileSync(resolve(REPO_ROOT, 'atoms', 'registry.json'), 'utf8'));
    const atomCount = Object.keys(registry.atoms).length;
    const manual = readFileSync(resolve(REPO_ROOT, 'docs', 'workflow-manual.md'), 'utf8');

    assert.equal(atomCount, 83);
    assert.match(manual, /83 atoms/);
    assert.doesNotMatch(manual, /82 atoms/);
    assert.doesNotMatch(manual, /76 atoms/);
    assert.doesNotMatch(manual, /65 atoms/);
    assert.doesNotMatch(manual, /64 atoms/);
    assert.doesNotMatch(manual, /63 atoms/);
    assert.match(manual, /E6 pre-openissue/);
    const legacyPartialGate = ['pre-openissue', 'partial'].join('-');
    assert.doesNotMatch(manual, new RegExp(legacyPartialGate));
  });

  test('root workflow spec avoids retired partial pre-openissue gate literal', () => {
    const workflowSpec = readFileSync(resolve(REPO_ROOT, 'specs', 'workflow.md'), 'utf8');
    const legacyPartialGate = ['pre-openissue', 'partial'].join('-');

    assert.doesNotMatch(workflowSpec, new RegExp(legacyPartialGate));
  });

  test('workflow manual documents current archive ownership and H atom count', () => {
    const manual = readFileSync(resolve(REPO_ROOT, 'docs', 'workflow-manual.md'), 'utf8');

    assert.match(manual, /K1 \+ K6 \+ K3 \+ K4 \+ A5 commit\/push\/close \+ A6 PR/);
    assert.doesNotMatch(manual, /K2 \+ K6 \+ K3 \+ K4 \+ A6 PR \+ A5/);
    assert.doesNotMatch(manual, /A6 PR \+ A5 \+ K5/);
    assert.doesNotMatch(manual, /K2 @ archive/);
    assert.match(manual, /H\s+│ Human[\s\S]*mixed\s+19/);
    assert.match(manual, /H5b visual\.review\.aggregate/);
    assert.match(manual, /H6d visual\.aesthetic_review/);
    assert.match(manual, /design_system_pack\.json/);
    assert.match(manual, /allowed primitives/);
  });

  test('workflow manual and corps skill document the formal benchmark input contract', () => {
    const manual = readFileSync(resolve(REPO_ROOT, 'docs', 'workflow-manual.md'), 'utf8');
    const corpsSkill = readFileSync(resolve(REPO_ROOT, 'xflow', 'corps', 'SKILL.md'), 'utf8');

    assert.match(manual, /reference_scenarios_json/);
    assert.match(manual, /capture_url \+ reference_image/);
    assert.match(manual, /visual_benchmark_input_contract_missing/);
    assert.match(manual, /visual_token_contract/);
    assert.match(manual, /observed_visual_tokens/);
    assert.match(manual, /visual_benchmark_token_checks_unresolved/);
    assert.match(corpsSkill, /exactly one benchmark evidence path/);
    assert.match(corpsSkill, /capture_url \+ reference_image/);
    assert.match(corpsSkill, /xflow visual capture-page-evidence/);
    assert.match(corpsSkill, /visual_token_contract/);
    assert.match(corpsSkill, /observed_visual_tokens/);
  });

  test('handoff splits focus into operation entrypoints and recent risks', () => {
    const handoff = readFileSync(resolve(REPO_ROOT, 'HANDOFF.md'), 'utf8');

    assert.doesNotMatch(handoff, /^## Current Focus$/m);
    assert.match(handoff, /^## 操作入口$/m);
    assert.match(handoff, /^## 近期风险$/m);
    assert.match(handoff, /npm run release:local/);
    assert.match(handoff, /corps archive/);
  });
});
