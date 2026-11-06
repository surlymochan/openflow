# Release Notes

## 0.5.2 - Bench grades stop silently zeroing; the 15-instance set is validated

Patch release. One bench-harness fix that removes a silent false-negative from grading, plus the P2-2 validation close-out from the issue #5 backlog. Both are pinned by tests and by a validation log, not by a live run.

**Absolute grade paths (#38).** `run.py` / `regrade.py` passed `--raw-root` / `--raw` through unresolved, but `swe_env.grade()` runs `git apply <test.patch>` with `cwd=<cell repo>`. With a relative raw root the patch path did not resolve from the repo cwd, so every cell failed grading with `test_patch did not apply` — and `run.py` recorded it as an ordinary `resolved: false`, a silent false-negative for the entire run. Found during the 2026-11-06 bench rebuild: the first MiniMax pilot went 4/4 on this error before diagnosis. `run.py` now resolves `--out` / `--raw-root` / `--predictions-dir` to absolute paths up front, `regrade.py` resolves `--raw`, and `grade()` also writes `grade.json` on the test_patch-apply early return (previously the failure path wrote nothing — exactly how this stayed invisible). No behavior change for absolute-path invocations. Test evidence (from the PR): `npm run verify` exit 0 (941 pass / 0 fail), including the swebench harness isolation test; the same patch regraded from a fresh tree with absolute paths applies cleanly and grades normally.

**P2-2 15-instance set validated (#39, issue #5 P2-2).** The 3 round-3 additions (sympy__sympy-15599, sympy__sympy-19040, sympy__sympy-24213) have passed the gold-patch check: `harness/validate.py` over all 15 ids in `instances.json` (fa7ea30) reports 15/15 ok:true with no errors (`bench-env/validate-15.log`, mtime 2026-11-06 19:35 UTC, after the instances.json commit). `round3_extension.pending_validation` is cleared to `[]`, the validated ids are recorded, and `test_instances.py` now pins the validated state instead of the pending state. Test evidence (local, this round): `python3 -m unittest test_instances test_diff_filter test_predictions test_reps_report test_validity` — 28 tests, all OK. The issue #5 P2-2 checkbox is ticked.

Acceptance debt, stated plainly: the bench-number acceptance for P1-2, P1-3, P2-1 and P2-3 — the wall-clock/token/resolved lines from issue #5 — still awaits the MiniMax full-matrix batch (15 instances × 4 arms × reps 3), which is running. No bench numbers are claimed in this release.

## 0.5.1 - Gates stop re-reading unchanged files; bench arms run at high effort

Patch release. Two gate cost improvements from the issue #5 backlog, both pinned by tests rather than by a live run, plus a bench-harness change.

**Stat-anchored gate verification (#34, issue #5 P1-3).** The TDD seal now records a stat anchor (size, mtime_ns, inode) per sealed file alongside its sha256. Proof validation (I6b) and the CR review seal partition (J6) stat-check first and re-read + re-hash only files whose anchor moved, instead of re-reading every sealed file on every gate pass; proofs sealed before the anchors existed fall back to the full re-read. Validation reports `reread_files` / `reread_count` and the seal partition reports `stat_checked`, so the skipped re-reads are observable. Test evidence (local): `test/tdd-proof.test.js` 22/22 — 4 new, including unchanged tree validating with `reread_count` 0 and anchor-less proofs still verifying by full re-read; `test/cr-review.test.js` 14/14 — 2 new, including anchors accepting unchanged files (`stat_checked` 2) and an edited file re-read and drifted (`stat_checked` 1, `reread_count` 1).

**Per-process read cache for the review gates (#35, issue #5 P1-2 follow-up).** Both gates now read through a per-process cache keyed by the P1-3 stat anchor: each unchanged file is read from disk once per run and served from memory on later reads, while a changed file is re-read instead of served stale (a mid-read change is retried once). This removes the repeated re-reads inside one gate run — I6c reading the same source file for symbols, implementation sources and test review, and J6's test follow re-reading every test file once per changed code file. Both proofs report `read_cache` (`disk_reads` / `cache_hits`). No verdict logic changed. Test evidence (local): `test/tdd-proof.test.js` 24/24 — 2 new, including a cache unit test (3 reads → 1 disk read + 2 hits) and the quality-review proof reporting `read_cache` {disk_reads: 2, cache_hits: 2}; `test/cr-review.test.js` 16/16 — 2 new, including one gate run reading each unchanged file from disk once ({disk_reads: 3, cache_hits: 1}) and a test file shared by two code files read from disk once ({disk_reads: 4, cache_hits: 3}).

**Bench arms run at high thinking effort (#36).** Both pi call sites in the SWE-bench harness (`harness/arms.py` `run_pi()` and `harness/pi_shim.sh`) now set `--effort high`, so all four arms run MiniMax at the same high thinking effort and the workflow remains the only variable. The archived DeepSeek tables were recorded with the settings of their time and are not affected.

Acceptance debt, stated plainly: the live-run acceptance for P1-2 and P1-3 — the wall-clock/token lines from issue #5, including median tokens incl. cache ≤ 2.0M — is still pending the benchmark environment, which is being rebuilt. No bench numbers are claimed in this release; what shipped is the mechanism and the tests that pin its behaviour.

## 0.5.0 - Review re-reads only drifted files; the bench set grows to 15

Minor release. One product change — the CR review now spends its re-reads only where the seal says bytes moved — plus three bench-hygiene landings from the issue #5 backlog, each pinned by tests rather than by a live run.

**Review re-reads only drifted files (#32, issue #5 P1-2).** The J6 review proof (`cr/review-0.json`) now carries a seal partition: every changed file is classified `sealed_unchanged` (bytes still identical to the green TDD proof's sealed hashes) or `seal_drifted`, with a `reread_count`. The yolo verify-consistency guidance consumes the partition, so the review pass re-reads only the drifted files instead of everything the gate already verified. This is reporting only — verdicts are unchanged, and without a green seal the partition is `null` and everything is re-read, exactly as before.

**The Verified bench set grows from 12 to 15 instances (#30, issue #5 P2-2).** `bench/swebench/instances.json` adds sympy-15599, sympy-19040 and sympy-24213, and a structural validation of the instance set (`bench/swebench/test_instances.py`) now runs in CI, so a malformed instance entry fails the build instead of a bench run. Gold-patch checks for the three new instances are pending the benchmark environment.

**Bench reports now aggregate as median (IQR) (#31, issue #5 P2-1).** `bench/swebench/report.py` aggregates per-arm wall-clock, token and cost results with q1/median/q3 and presents them in median (IQR) form. Reps isolation — repeat runs of the same cell never share grading state — and the aggregation itself are pinned by `bench/swebench/test_reps_report.py`.

**P0-2 acceptance is now pinned by regression tests (#29, issue #5 P0-2).** The evidence exclusion itself landed earlier (solution patches drop `specs/`, `.xflow/` and `.as-xflow/`); what was missing was a test that would notice if it regressed. `bench/swebench/test_diff_filter.py` now runs the saved pre-fix patches through the filter: the saved 9.7 MB evidence-laden patch comes out at 4.3 KB, and every saved patch lands under the 200 KB acceptance line.

Acceptance debt, stated plainly: the live-run acceptance for P1-2, P2-1 and P2-2 — multi-rep bench runs on the restored environment, including the wall-clock/token lines from issue #5 and gold checks for the new instances — is still pending the benchmark environment. No performance numbers are claimed in this release; what shipped is the reporting, the larger instance set, and the tests that pin their behaviour.

## 0.4.1 - Failed runs report phase costs; Node 24 test counts fail closed

Patch release. Two fixes, both about the gate trusting evidence it had not actually read.

**Failed runs now report where the time and tokens went (#22).** The per-phase cost report landed in 0.3.0 but only rode on successful runs. It now also rides on the `workflow_failed` execution-log event — a run that stops mid-way still reports its per-phase timing/token breakdown — and is persisted as a standalone artifact at `.as-xflow/phase-cost.json` on both completion and failure, so the breakdown is readable without mining the ndjson execution log. The accounting structure (phase sum vs wall clock within 5%) is covered by `test/phase-cost.test.js`. This lands item P1-1 from issue #5.

**TDD gate reads test counts correctly on Node 24, and fails closed when it cannot (#23).** The gate parsed skip/todo counts only from the TAP reporter's summary lines. Node 24's built-in runner defaults to the spec reporter when piped, whose summary lines carry a different marker — an all-skipped/todo run on Node 24 exited 0, parsed as zero skips, and was waved through as green. The parser now reads the runner's summary block in both reporter formats (TAP and spec), requires the full node signature before treating a block as a node summary, and anchors summary lines at line start so test names or program output cannot forge counts. When a detected node summary cannot be fully parsed, the run classifies as `counts_unknown` and proof validation rejects it (`tests_counts_unknown`) instead of reading unknown counts as zero. Measured against pinned captured outputs: the new count-parsing tests pass 9/9 under Node 22 and 9/9 under Node 24; the end-to-end TDD proof suite passes 18/18 under both (it was 17/18 on Node 24 before this fix).

With P1-1 landed here, the P0/P1 items tracked on the optimization backlog in #5 stand checked off as verified; the remaining longer-horizon items stay tracked there.

## 0.4.0 - CR gate wired in, overhead cut 1, predictions direct

**The CR gate now runs inside the pipeline (F1, #15).** In 0.3.0 `J6.cr.review` was registered and unit-tested but no workflow invoked it — the release notes said so, and this release closes that gap. The yolo `verify-consistency` phase and the corps `qa` phase run J6 on every change, after the spec-delta review and before the stage flips to verify, and the verdict record `cr/review-0.json` is a required artifact: a failing verdict stops the workflow instead of waving the change through to archive. The wiring is proven end-to-end, not just by unit tests: `test/cr-review-wiring.test.js` drives the real yolo verify phase through `WorkflowExecutor` against a git fixture — an aligned, tested change passes with a verdict record on disk, and a code change with no test follow is stopped at the phase with the `cr_code_without_test` finding.

**Overhead cut 1 (F2, #17).** The lite (yolo) track seals the TDD red proof immediately after `plan` — the issue/branch ceremony no longer sits between planning and red-proof, and the planning pass authors the failing test, so plan and red share one agent pass. `xflow workflow run --title "..."` derives the change id from the title when the branch cannot provide one. TDD snapshots are scoped: inside a git work tree, I6a seals only the files that differ from HEAD plus the files the test command names, and I6b materializes the rest from the recorded HEAD at replay. Offline measurements on the SWE-bench sympy tree: the sealed manifest drops from 1,543 files / 164 KB to the changed files only (2 files / 197 B for a one-file change), and the snapshot copy from 26.9 MB to ~51 KB. Proofs sealed before this change keep verifying.

Acceptance debt, stated plainly: the v0.4 acceptance line for F2 was a live rerun of the same 6 SWE-bench instances — wall-clock ≤ 1.3× the baseline median, total tokens ≤ 2.0M, resolved ≥ 4/6. The bench generation environment is not currently restored, so those three numbers are still owed; they are not claimed here. If the rerun misses the line when it lands, the remaining overhead work continues as v0.4.1 rather than being declared done.

**Predictions come straight out of `run.py` (F3, #16).** The official SWE-bench predictions format (`instance_id`, `model_name_or_path`, `model_patch`) is now produced by the bench harness itself, with the P0-2 evidence filter re-applied on both the live and replay paths — the one-off converter outside the repo is retired. Regression evidence: all four pilot arms rebuilt through `run.py --export-predictions` are byte-identical to the hand-converted pilot files (`cmp` = 0, 24 instances).

**`xflow init` writes `.gitignore` (F4, #18).** Init now creates or merges the project `.gitignore` for evalid local state (`.as-xflow/`, `specs/changes/`), appending only missing entries and never modifying existing lines — the first line of defense ahead of the diff filtering added in #8. This closes the second v0.3.0 known gap; both are now done.

## 0.3.1 - Renamed: OpenFlow → evalid

Same code as 0.3.0, new name and positioning. The project is now **evalid** — a runtime verification layer for coding agents: it seals each test run and replays it from a clean snapshot, so a claim only ships if the evidence replays green. Repository: `surlymochan/evalid` (old `openflow` links redirect); npm package: `evalid`. The `xflow` CLI name is unchanged in this release.

## 0.3.0 - Three-stage gates: SPEC, CR, Test

OpenFlow's gates now cover the three stages where agent work usually goes wrong, each with deterministic checks instead of another model's opinion.

**SPEC clarification gate (`J4d.spec_clarify.gate`, #11).** Ambiguity is cheapest before the loop starts. J4d blocks specs whose MUST clauses carry no quantified anchor (a clause whose value is itself a vague word does not count as anchored), scenarios without WHEN/THEN, vague wording in English or Chinese, and TBD/placeholder text. Every finding comes with a concrete question a human can answer. False-positive control is deliberate: MUST NOT clauses are exempt, already-quantified lines are not flagged, and code blocks and headings are not scanned. Ships as `xflow spec clarify` and in the yolo/corps proposal-consistency stage.

**Code review gate (`J6.cr.review`, #10).** A diff fails review when nothing in it aligns with the spec, when behaviour changes ship without tests (an explicit `cr_allow_untested` status marker is the only, auditable, exemption), when assertions decrease net, or when test files were edited to make a red run look green. A loop budget (default 10 files / 400 changed lines) warns over budget and fails at 2x. Known gap: J6 is registered in the atom registry (now 85 atoms) and covered by its own tests, but is not yet wired into the yolo/corps verify stage — that wiring is planned for v0.4.

**Test gate v2 (`I6c`, #12) and per-phase cost accounting.** I6c now also rejects tests whose expected value is computed from the implementation under test, assertions inside callbacks that never fire, and self-comparisons that are always true — each check ships with a passing counter-example so honest tests are not blocked. `src/core/phase-cost.js` records wall-clock and tokens per phase; a run whose phase sum diverges from total wall-clock by more than 5% is flagged `within_tolerance: false`, so cost claims stay auditable.

**Clean benchmark patches (#8).** The SWE-bench harness generated `solution.diff` with the whole `specs/` evidence tree inside: one real openflow-arm patch was 17.0 MB, of which 99.9% was evidence files. Generation now excludes `specs/`, a harness-side filter strips it as a second line of defence, and regrade applies the same filter to old patches. The same patch is now 24 KB. `UV_CACHE_DIR` is also per-run now, and the repo gained `CONTRIBUTING.md` plus issue/PR templates.

**CI fix (#9).** The verify job died at "Install Playwright" because `ubuntu-latest` had rolled to 26.04, which Playwright 1.59.1 does not support. The runner is pinned to `ubuntu-24.04`; upgrading Playwright itself is a separate, larger change.

Also known: `xflow init` does not yet write OpenFlow entries into the user project's `.gitignore` (planned for v0.4).

## 0.2.2 - Benchmark docs

No CLI or gate changes: this release only updates documentation. The README now leads with the SWE-bench Verified result on DeepSeek-V4.1-Flash: OpenFlow resolved 4/6 and the plain baseline resolved 3/6 (n=1 per cell). It also states the caveats: n=1 on 6 instances puts one or two resolves within noise, and the two workflow tools took about 1.8x the baseline's median wall-clock and cost 76% (OpenFlow) / 61% (openswarm) more per task. The first published table undercounted pytest because of a shared temp-dir race in grading; it is now fixed and regraded, with notes in [bench/swebench/README.md](bench/swebench/README.md#regrade-2026-10-18). The optimization backlog from these results is tracked in [issue #5](https://github.com/surlymochan/openflow/issues/5).

## 0.2.1 - Tighter TDD and spec gates

Proof files are no longer trusted as JSON alone. `I6a` records a snapshot and a digest over the command, exit code, output hash, failure class, and file hashes. `I6b` recomputes that digest and re-runs the command on the snapshot. An agent who can rewrite the tree can still produce a self-consistent failing snapshot; a hand edit of the proof cannot.

`I6c` requires red and green to target the same test (or a green superset), rejects skip/todo/only on the changed tests, and rejects a type-only assertion when it is the only assertion. A plausible but wrong expected value is still not decidable statically. `J4b` rejects contradictory `MUST`/`SHALL` values for the same subject.

`tdd_mode` may be `red-green` (default), `refactor`, or `docs`, via `status.json` or `--tdd-mode`. Refactor checks that existing tests pass before and after and that assertions were not removed. Docs checks that the diff stays off code and tests.

## 0.2.0 - Relaunch (first npm release)

OpenFlow is published to npm as **`@surlymochan/openflow`**. The CLI is still `xflow`. The unscoped
`openflow` name on npm belongs to an unrelated project.

### Highlights

- **Policy overlays.** `xflow policy validate` checks personal and team policy layered over the built-in
  workflows. Policy, notify, storage, plugin and experience-digest atoms ship with it.
- **Adaptive intake.** `xflow intake recommend` reads a demand profile (title, description, repo count) and
  recommends `yolo` or `corps` plus gate overlays. It writes `workflow_recommendation.json`.
- **Execution profiles.** `xflow profile show|set` handles personal and team execution modes and provider
  preferences.
- **Comparisons.** `xflow compare super-assistant` is new, next to the Superpowers, OpenSpec, gstack,
  spec-kit and Codex goal comparisons.
- **New README.** It covers the problem, a demo GIF recorded from a real run, a 3-minute start and
  single-gate usage (`xflow atom run I6a.tdd.run ...`).

### Packaging

- `package.json` now has `repository`, `homepage`, `bugs`, `keywords`, `author`,
  `engines.node >= 22.5` (`node:sqlite`) and `publishConfig.access = public`.
- Install docs and the CLI's copy-paste commands now use `npm install -g @surlymochan/openflow`.
- `xflow serve` no longer points to an unpublished server repository.
- Fixed an uncaught `EPIPE` in `agent_invoke` when an agent CLI exits without reading stdin.

### Verified for this release

- `npm test`: 275 passed, 1 skipped, 0 failed (Node 22, Playwright Chromium installed).
- `npm run drift:scan`: 9/9.
- `npm publish --dry-run`: `@surlymochan/openflow@0.2.0`, 187 files, about 321 kB.
- Clean install from the packed tarball into an empty project: `xflow init`, `goal set`, `doctor` and
  `workflow validate yolo` all pass.

## 0.1.0 - Public Readiness Candidate

This release turns `openflow` from a local skill/workflow repo into a package-ready workflow runtime for AI coding agents.

### Highlights

- CLI package entry: `xflow` is exposed through `bin/xflow.js`.
- First-run loop: `xflow guide`, `xflow demo clean`, `xflow init`, `xflow doctor`, and `xflow workflow validate yolo`.
- Executable workflow data: `workflows/yolo.yaml` and `workflows/corps.yaml` are schema-validated.
- TDD enforcement: red proof, green proof, and changed-test quality review are separate gates.
- Spec durability: `xflow spec delta` and `xflow spec openspec-map` create local review/migration artifacts.
- Competitive proof: `xflow score`, `xflow compare openspec`, and `xflow compare spec-kit`.
- Adapter entrypoints: `xflow adapter import-file` and `xflow adapter github-issue` import external tracker context into local change artifacts.
- Public release gate: `npm run publish:check` runs tests, drift scan, skill diff, package dry-run, and npm publish dry-run.

### Adapter Commands

```bash
xflow adapter import-file --input docs/fixtures/tracker-item.json --json
xflow adapter github-issue --repo owner/name --issue 123 --project-root .
```

Adapters are intentionally thin. They copy source context into `specs/changes/<change-id>/proposal.md` and `status.json`; they do not make GitHub, Linear, Jira, or any tracker the workflow source of truth.

### Required Proof Before Real Publish

```bash
npm run publish:check
xflow score
xflow compare openspec
xflow compare spec-kit
```

`npm publish --access public` is the only remaining registry-mutating step. It requires an authenticated npm session and should only run after the dry-run gate is green.
