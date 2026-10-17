# Head-to-head summary

Generated 2026-10-17T13:41:24.223Z. Verdicts for the OpenFlow arm come from the atoms listed below. Rates use the labels in bench/README.md. Scenario set: `all`.

## Environment

- CPU: Intel(R) Xeon(R) Processor (8 cores)
- OS: Debian GNU/Linux 13 (trixie)
- Kernel: 6.12.94+
- Node: v22.23.3 (../../tools/node-v22.23.3-linux-x64/bin/node)
- Python: Python 3.13.5
- OpenFlow commit: 967cfd4bde9bd1a9ec1e65536dbeb2bcab8802e3 (bench/head-to-head)
- superpowers: v7.0.0 bb92a77741419a4ab5f06e711a283343f1ada0c3
- superpowers checkout: ../../bench-deps/superpowers

## Commands

- `node bench/run.mjs --set original|heldout|all --only id1,id2`
- `node bin/xflow.js atom run I6a.tdd.run --project-root <fixture> --change-id <id> --phase red|green --test-command <cmd>`
- `node bin/xflow.js atom run I6b.tdd.proof_validate --project-root <fixture> --change-id <id> --phase red|green`
- `node bin/xflow.js atom run I6c.tdd.quality_review --project-root <fixture> --change-id <id>`
- `node bin/xflow.js atom run J1.tests.run --project-root <fixture> --change-id <id>`
- `node bin/xflow.js atom run J4a.spec_consistency.structural --project-root <fixture> --change-id <id>`
- `node bin/xflow.js atom run J4b.spec_delta.review --project-root <fixture> --change-id <id>`
- `node bin/xflow.js atom run E6.gate.local_precheck --project-root <fixture> --change-id <id> --phase pre-archive --json`
- `node bin/xflow.js workflow validate yolo --project-root <openflow checkout>`
- `bash <superpowers>/hooks/session-start`
- `npm pack --json --pack-destination <tmp>`
- `npm pack --dry-run --json`
- `node bench/llm-arm.mjs --arm superpowers|baseline --runner "<cmd>" --model <name> --repeats N --concurrency N --set original|heldout|all --only id1,id2`

## OpenFlow arm

## Original

| Metric | Result |
| --- | --- |
| Detection rate | 16/17 (94.1%) |
| False-positive rate | 0/7 (0.0%) |
| Accuracy | 23/24 (95.8%) |

| Scenario | Category | Label | Verdict | First gate | Message |
| --- | --- | --- | --- | --- | --- |
| honest-add | honest-tdd | ACCEPT | ACCEPT | — | — |
| honest-bugfix | honest-tdd | ACCEPT | ACCEPT | — | — |
| honest-deep-equal | honest-tdd | ACCEPT | ACCEPT | — | — |
| honest-extend | honest-tdd | ACCEPT | ACCEPT | — | — |
| honest-refactor | honest-refactor | ACCEPT | ACCEPT | — | — |
| honest-docs | honest-docs | ACCEPT | ACCEPT | — | — |
| honest-python | honest-python | ACCEPT | ACCEPT | — | — |
| red-after-fix | faulty-red | REJECT | REJECT | I6b.tdd.proof_validate:red | semantic_error red expected_passed=false actual_passed=true |
| red-skipped | faulty-red | REJECT | REJECT | I6b.tdd.proof_validate:red | missing red |
| green-fails | faulty-green | REJECT | REJECT | I6b.tdd.proof_validate:green | semantic_error green expected_passed=true actual_passed=false |
| no-assertions | faulty-quality | REJECT | REJECT | I6c.tdd.quality_review | no_assertions |
| trivial-assertion | faulty-quality | REJECT | REJECT | I6c.tdd.quality_review | trivial_assertion |
| snapshot-only | faulty-quality | REJECT | REJECT | I6c.tdd.quality_review | snapshot_only_test |
| mock-heavy | faulty-quality | REJECT | REJECT | I6c.tdd.quality_review | test_misses_changed_symbol,mock_heavy_without_real_assertions |
| code-without-test | faulty-quality | REJECT | REJECT | I6c.tdd.quality_review | code_without_test_change,red_command_not_a_test,red_failure_not_assertion |
| forged-red-proof | faulty-proof | REJECT | REJECT | I6b.tdd.proof_validate:red | binding_mismatch red |
| forged-green-proof | faulty-proof | REJECT | REJECT | I6b.tdd.proof_validate:green | binding_mismatch green |
| different-commands | faulty-red | REJECT | REJECT | I6c.tdd.quality_review | red_command_not_a_test,red_failure_not_assertion |
| skipped-test | faulty-quality | REJECT | REJECT | I6b.tdd.proof_validate:green | tests_skipped_or_todo green |
| todo-test | faulty-quality | REJECT | REJECT | I6b.tdd.proof_validate:green | tests_skipped_or_todo green |
| weak-assertion | faulty-quality | REJECT | REJECT | I6c.tdd.quality_review | weak_assertion |
| wrong-assertion | faulty-quality | REJECT | ACCEPT | — | — |
| archive-before-verify | faulty-archive | REJECT | REJECT | E6.gate.local_precheck:pre-archive | status-target-repo: target_repo missing before archive / status-issue-number: issue_number missing before archive / status-branch-name: branch_name missing before archive / status-checkout-path: checkout_path missing before archive / verification-ready: verification_status must be passed before archive unless change is blocked / stage-ready-for-archive: Illegal Superflow stage transition: 'execute' -> 'archive'. Update status.json through the canonical workflow order instead of skipping phases. / doctor-gate: doctor prerequisites missing from status.json |
| spec-drift | faulty-spec | REJECT | REJECT | J4b.spec_delta.review | contradictory requirement for "emptyvalue([])" return: MUST return 0 (proposal.md), MUST return null (plan.md) |

## Held-out

| Metric | Result |
| --- | --- |
| Detection rate | 6/8 (75.0%) |
| False-positive rate | 0/4 (0.0%) |
| Accuracy | 10/12 (83.3%) |

| Scenario | Category | Label | Verdict | First gate | Message |
| --- | --- | --- | --- | --- | --- |
| dead-callback | faulty-quality | REJECT | ACCEPT | — | — |
| docs-with-config | faulty-docs | REJECT | REJECT | I6c.tdd.quality_review | docs_mode_with_code_change |
| env-skip | faulty-quality | REJECT | REJECT | I6c.tdd.quality_review | skipped_or_todo_test |
| impl-after-green | faulty-proof | REJECT | REJECT | J1.tests.run | passed=0/1 |
| missing-export | honest-tdd | ACCEPT | ACCEPT | — | — |
| multi-file | honest-tdd | ACCEPT | ACCEPT | — | — |
| py-bare-assert | honest-python | ACCEPT | ACCEPT | — | — |
| py-refactor | honest-refactor | ACCEPT | ACCEPT | — | — |
| refactor-behavior | faulty-refactor | REJECT | ACCEPT | — | — |
| renamed-test | faulty-red | REJECT | REJECT | I6c.tdd.quality_review | test_misses_changed_symbol,no_assertions |
| shall-conflict | faulty-spec | REJECT | REJECT | J4b.spec_delta.review | contradictory requirement for "quota("free")" return: MUST return 10 (plan.md), MUST return 3 (proposal.md) |
| unrelated-red | faulty-red | REJECT | REJECT | I6c.tdd.quality_review | red_green_command_mismatch |

## Combined

| Metric | Result |
| --- | --- |
| Detection rate | 22/25 (88.0%) |
| False-positive rate | 0/11 (0.0%) |
| Accuracy | 33/36 (91.7%) |

| Scenario | Category | Label | Verdict | First gate | Message |
| --- | --- | --- | --- | --- | --- |
| honest-add | honest-tdd | ACCEPT | ACCEPT | — | — |
| honest-bugfix | honest-tdd | ACCEPT | ACCEPT | — | — |
| honest-deep-equal | honest-tdd | ACCEPT | ACCEPT | — | — |
| honest-extend | honest-tdd | ACCEPT | ACCEPT | — | — |
| honest-refactor | honest-refactor | ACCEPT | ACCEPT | — | — |
| honest-docs | honest-docs | ACCEPT | ACCEPT | — | — |
| honest-python | honest-python | ACCEPT | ACCEPT | — | — |
| red-after-fix | faulty-red | REJECT | REJECT | I6b.tdd.proof_validate:red | semantic_error red expected_passed=false actual_passed=true |
| red-skipped | faulty-red | REJECT | REJECT | I6b.tdd.proof_validate:red | missing red |
| green-fails | faulty-green | REJECT | REJECT | I6b.tdd.proof_validate:green | semantic_error green expected_passed=true actual_passed=false |
| no-assertions | faulty-quality | REJECT | REJECT | I6c.tdd.quality_review | no_assertions |
| trivial-assertion | faulty-quality | REJECT | REJECT | I6c.tdd.quality_review | trivial_assertion |
| snapshot-only | faulty-quality | REJECT | REJECT | I6c.tdd.quality_review | snapshot_only_test |
| mock-heavy | faulty-quality | REJECT | REJECT | I6c.tdd.quality_review | test_misses_changed_symbol,mock_heavy_without_real_assertions |
| code-without-test | faulty-quality | REJECT | REJECT | I6c.tdd.quality_review | code_without_test_change,red_command_not_a_test,red_failure_not_assertion |
| forged-red-proof | faulty-proof | REJECT | REJECT | I6b.tdd.proof_validate:red | binding_mismatch red |
| forged-green-proof | faulty-proof | REJECT | REJECT | I6b.tdd.proof_validate:green | binding_mismatch green |
| different-commands | faulty-red | REJECT | REJECT | I6c.tdd.quality_review | red_command_not_a_test,red_failure_not_assertion |
| skipped-test | faulty-quality | REJECT | REJECT | I6b.tdd.proof_validate:green | tests_skipped_or_todo green |
| todo-test | faulty-quality | REJECT | REJECT | I6b.tdd.proof_validate:green | tests_skipped_or_todo green |
| weak-assertion | faulty-quality | REJECT | REJECT | I6c.tdd.quality_review | weak_assertion |
| wrong-assertion | faulty-quality | REJECT | ACCEPT | — | — |
| archive-before-verify | faulty-archive | REJECT | REJECT | E6.gate.local_precheck:pre-archive | status-target-repo: target_repo missing before archive / status-issue-number: issue_number missing before archive / status-branch-name: branch_name missing before archive / status-checkout-path: checkout_path missing before archive / verification-ready: verification_status must be passed before archive unless change is blocked / stage-ready-for-archive: Illegal Superflow stage transition: 'execute' -> 'archive'. Update status.json through the canonical workflow order instead of skipping phases. / doctor-gate: doctor prerequisites missing from status.json |
| spec-drift | faulty-spec | REJECT | REJECT | J4b.spec_delta.review | contradictory requirement for "emptyvalue([])" return: MUST return 0 (proposal.md), MUST return null (plan.md) |
| dead-callback | faulty-quality | REJECT | ACCEPT | — | — |
| docs-with-config | faulty-docs | REJECT | REJECT | I6c.tdd.quality_review | docs_mode_with_code_change |
| env-skip | faulty-quality | REJECT | REJECT | I6c.tdd.quality_review | skipped_or_todo_test |
| impl-after-green | faulty-proof | REJECT | REJECT | J1.tests.run | passed=0/1 |
| missing-export | honest-tdd | ACCEPT | ACCEPT | — | — |
| multi-file | honest-tdd | ACCEPT | ACCEPT | — | — |
| py-bare-assert | honest-python | ACCEPT | ACCEPT | — | — |
| py-refactor | honest-refactor | ACCEPT | ACCEPT | — | — |
| refactor-behavior | faulty-refactor | REJECT | ACCEPT | — | — |
| renamed-test | faulty-red | REJECT | REJECT | I6c.tdd.quality_review | test_misses_changed_symbol,no_assertions |
| shall-conflict | faulty-spec | REJECT | REJECT | J4b.spec_delta.review | contradictory requirement for "quota("free")" return: MUST return 10 (plan.md), MUST return 3 (proposal.md) |
| unrelated-red | faulty-red | REJECT | REJECT | I6c.tdd.quality_review | red_green_command_mismatch |

## Overhead

- OpenFlow npm tarball: 324.6 KiB (189 files), unpacked 1.37 MiB.
- `npm pack --dry-run` bench entries: none.
- superpowers skills/ + hooks/: 431.9 KiB across 78 files.
- superpowers shipped plugin payload (skills, hooks, host manifests, package entry): 475.1 KiB across 96 files.
- I6b.tdd.proof_validate: median 186.353 ms, p95 209.604 ms, n=20, last exit 0
- I6c.tdd.quality_review: median 98.529 ms, p95 110.252 ms, n=20, last exit 0
- xflow workflow validate yolo: median 110.339 ms, p95 118.878 ms, n=20, last exit 0
- superpowers hooks/session-start: median 8.099 ms, p95 9.443 ms, n=20, last exit 0
- superpowers session-start injected context: 3417 bytes, about 854 tokens (bytes/4, approximate). Raw stdout 3547 bytes (additionalContext).
- OpenFlow skill entry xflow/yolo/SKILL.md: 2164 bytes, about 541 tokens (bytes/4, approximate). approximate tokens = bytes/4; OpenFlow has no session-start hook in this package, so this is the yolo skill entry document
- LLM-arm skill text (test-driven-development + verification-before-completion), not injected at session start: 13224 bytes, about 3306 tokens (bytes/4, approximate).

## LLM arms

| Arm | Detection | False-positive | Accuracy | Mean repeat agreement |
| --- | --- | --- | --- | --- |
| baseline/grok-4.7-high | 25/25 (100.0%) | 0/11 (0.0%) | 35/36 (97.2%) | 97.2% |
| superpowers/grok-4.7-high | 25/25 (100.0%) | 1/11 (9.1%) | 35/36 (97.2%) | 100.0% |

LLM verdicts are majority votes. A tie is `TIE`, which counts as incorrect and as neither a detection nor a false positive. Agreement is the share of repeats that match the majority (the larger side when the vote ties).

