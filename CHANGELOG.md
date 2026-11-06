# Changelog

All notable changes to this project are documented here. Detailed notes live in
[RELEASE_NOTES.md](RELEASE_NOTES.md).

## [Unreleased]

### Added
- **Per-process read cache for the review gates (issue #5, P1-2 follow-up to #34)**: one gate run used to read the same source file several times — I6c for symbols, implementation sources and test review, J6 for spec alignment and then test follow once per changed code file. Both gates now read through a per-process cache keyed by the P1-3 stat anchor (size, mtime_ns, inode): each unchanged file is read from disk once per run and served from memory on later reads, while a changed file is re-read instead of served stale (a mid-read change is retried once, like the seal's `read_with_anchor`). J6 keeps its self-contained copy of the cache and does not import tdd_lib. Both proofs report `read_cache` (`disk_reads` / `cache_hits`) so the skipped re-reads are observable. No verdict logic changed; the token acceptance still needs a benchmark-environment rerun — no performance numbers are claimed here.
- **Stat-anchored gate verification (issue #5, P1-3)**: the TDD seal now records a stat anchor (size, mtime_ns, inode) per sealed file alongside its sha256 — tree anchors and snapshot-copy anchors in the proof's snapshot scope, bound into the proof like the scope itself. Proof validation (I6b) and the CR review seal partition (J6) stat-check first and re-read + re-hash only files whose anchor moved, instead of re-reading every sealed file on every gate pass; proofs sealed before the anchors existed fall back to the full re-read. Validation reports `reread_files` / `reread_count` and the seal partition reports `stat_checked`, so the skipped re-reads are observable. The token acceptance (median tokens incl. cache ≤ 2.0M) still needs a benchmark-environment rerun — no performance numbers are claimed here.

## [0.5.0] - 2026-11-06

### Added
- **CR review seal partition (issue #5, P1-2)**: the J6 review proof (`cr/review-0.json`) now splits the changed files into `sealed_unchanged` (bytes still identical to the green TDD proof's sealed hashes) and `seal_drifted`, with a `reread_count`. The yolo skill's verify-consistency guidance uses the partition so the review pass re-reads only drifted files instead of everything the gate already verified. Reporting only — verdicts are unchanged, and without a green seal the partition is `null` and everything is re-read.
- **Bench Verified set extended to 15 instances (issue #5, P2-2)**: `bench/swebench/instances.json` grows from 12 to 15, adding sympy-15599, sympy-19040 and sympy-24213, and a structural validation of the instance set (`bench/swebench/test_instances.py`) now runs in CI. Gold-patch checks for the three new instances stay pending the benchmark environment.
- **Bench report aggregates median (IQR) (issue #5, P2-1)**: `bench/swebench/report.py` now aggregates per-arm wall-clock, token and cost results with q1/median/q3 and presents them as median (IQR); reps isolation and the aggregation itself are pinned by `bench/swebench/test_reps_report.py`. Live multi-rep runs stay pending the benchmark environment.
- **P0-2 acceptance pinned against saved pre-fix patches (issue #5, P0-2)**: regression tests in `bench/swebench/test_diff_filter.py` run the saved pre-fix patches through the evidence filter (`specs/`, `.xflow/`, `.as-xflow/` excluded from solution patches). The saved 9.7 MB evidence-laden patch filters down to 4.3 KB, and every saved patch lands under the 200 KB acceptance line.

## [0.4.1] - 2026-11-06

### Fixed
- **TDD gate counts skipped/todo tests again on Node 24**: the gate parsed skip/todo counts only from the TAP reporter's `# skipped / # todo` summary lines, but Node 24's built-in runner defaults to the spec reporter when piped, whose summary lines carry a `ℹ` marker — an all-skipped/todo run exited 0, parsed as zero skips, and was waved through as green. The parser now reads the runner's summary block in both reporter formats (anchored to the summary lines, gated on the full node signature), and fails closed: a node summary whose gate counts cannot be fully parsed classifies as `counts_unknown` and is rejected by proof validation (`tests_counts_unknown`) instead of reading as zero skipped.

### Added
- **Phase cost evidence on every run (issue #5 P1-1)**: the per-phase timing/token report (`src/core/phase-cost.js`, landed in 0.3.0) now also rides on the `workflow_failed` execution-log event — a run that stops mid-way still reports where its time and tokens went — and is persisted as a standalone artifact at `.as-xflow/phase-cost.json` on both completion and failure, so the breakdown is readable without mining the ndjson execution log. Acceptance rerun on the SWE-bench cells stays pending the benchmark environment; the accounting structure (phase sum vs wall clock within 5%) is covered by `test/phase-cost.test.js`.

## [0.4.0] - 2026-11-04

### Changed
- **Overhead cut 1 (v0.4 F2, issue #5 P1-2/P1-4)**: the lite (yolo) track seals the TDD red proof immediately after `plan` — the issue/branch ceremony no longer sits between planning and red-proof, and the planning pass now authors the failing test, so plan and red share one agent pass. `xflow workflow run --title "..."` also derives the change id from the title when the branch cannot provide one (previously a hard stop on `main` that pushed agents into manual atom-by-atom driving). TDD snapshots are scoped: inside a git work tree I6a seals only the files that differ from HEAD plus the files the test command names, and I6b materializes the rest from the recorded HEAD at replay — on the SWE-bench sympy tree the sealed manifest drops from 1,543 files / 164 KB to the changed files only (2 files / 197 B for a one-file change), and the snapshot copy from 26.9 MB to ~51 KB. Proofs sealed before this change keep verifying (the scope joins the binding only when present).

### Added
- **CR gate `J6.cr.review` wired into the verify stage (v0.4 F1)**: closes the v0.3.0 known gap where J6 was registered and unit-tested but no workflow phase invoked it. The yolo `verify-consistency` phase and the corps `qa` phase now run J6 on every change — after the spec-delta review, before the stage flips to verify — and declare its verdict record `specs/changes/<change_id>/cr/review-0.json` as a required artifact. A failing verdict (spec misalignment, changed code with no test follow, net assertion decrease, blown loop budget) stops the workflow at verify instead of waving the change through to archive. Orchestration evidence: `test/cr-review-wiring.test.js` drives the real yolo verify phase through `WorkflowExecutor` against a git fixture — an aligned, tested change passes with a verdict record, and an untested change is stopped at the phase.
- **SWE-bench predictions emitted directly by `run.py` (v0.4 F3)**: the bench harness no longer relies on a one-off converter outside the repo. A stdlib-only `bench/swebench/harness/predictions.py` builds records with exactly `instance_id`, `model_name_or_path`, `model_patch`, re-applies the P0-2 evidence filter (`specs/`, `.xflow/`, `.as-xflow/`) on both paths, and upserts per-arm files so resumable reruns never duplicate lines; `run.py --export-predictions` rebuilds the same files from saved patches with no model calls. Regression: all four pilot arms rebuilt through the new path are byte-identical to the hand-converted pilot files (`cmp` = 0 across 24 instances), and the largest openflow-arm patch stays at 9,650 bytes, well under the 200 KB line.
- **`xflow init` writes the project `.gitignore` (v0.4 F4)**: init now creates or merges `.gitignore` entries for evalid local state (`.as-xflow/`, `specs/changes/`), appending only the entries that are missing and never modifying existing lines; `.xflow/` stays tracked on purpose (`GOAL.md` is a reviewable project document). Re-running `init --force` tops up projects initialized before v0.4. Closes the v0.3.0 known gap.

## [0.3.1] - 2026-11-04

### Changed
- **Renamed: OpenFlow → evalid.** The repository is now `surlymochan/evalid` (old links redirect) and the npm package is now `evalid`. Same code and behaviour as 0.3.0; the rename matches the repositioned first screen — a runtime verification layer for coding agents ("Claimed ≠ verified"). The `xflow` CLI name is unchanged in this release.

## [0.3.0] - 2026-11-04

### Added
- **SPEC clarification gate `J4d.spec_clarify.gate`** (#11): blocks ambiguous specs before the loop starts. Flags MUST clauses with no quantified anchor, missing WHEN/THEN scenarios, vague wording (EN/CN tables) and TBD/placeholder text; every finding carries an answerable clarification question. Available as `xflow spec clarify` and wired into the yolo/corps proposal-consistency stage.
- **Code review gate `J6.cr.review`** (#10): deterministic review checks — spec alignment (zero alignment fails), test-follow (untested changes fail unless `cr_allow_untested` is declared in status), net assertion decrease fails, test files may not be edited to force green, and a loop budget (default 10 files / 400 lines; warn over budget, fail at 2x).
- **Test gate v2 checks in `I6c`** (#12): rejects expected values sourced from the implementation itself, dead-callback assertions, and self-comparison tautologies. Adds per-phase cost accounting (`src/core/phase-cost.js`): wall-clock and token spend per phase, flagged when it diverges from total wall-clock by more than 5%.

### Fixed
- **Benchmark evidence no longer leaks into solution patches** (#8): `run.py` now excludes `specs/` when generating `solution.diff`, with a second filter in the harness (regrade strips it from old patches too). A real openflow-arm patch shrank from 17.0 MB to 24 KB — 99.9% of it was evidence files, not code.
- **Per-run uv cache** (#8): `UV_CACHE_DIR` is set per run instead of sharing one cache across benchmark arms.
- **CI runner pinned to `ubuntu-24.04`** (#9): Playwright 1.59.1 does not support chromium on ubuntu 26.04, which silently killed the verify job.

### Docs
- Added `CONTRIBUTING.md` and issue/PR templates (#8, #11, #10). Workflow manual atom count updated 83 → 85.

### Known gaps
- `J6.cr.review` is registered and tested but not yet wired into the yolo/corps verify stage (planned for v0.4).
- `xflow init` does not yet add OpenFlow artefacts to the user project's `.gitignore` (planned for v0.4).

## [0.2.2] - 2026-10-18

### Docs
- Added the SWE-bench Verified results to the README and `bench/swebench/`: 6 hard sympy, pytest and pylint instances on DeepSeek-V4.1-Flash (`deepseek-flash`), n=1 per cell.
- Corrected the first published results after a pytest temp-directory race in grading: `pytest-5787` and `pytest-6197` became resolved for all arms; `pytest-10356` is unresolved by every arm. See the [regrade notes](bench/swebench/README.md#regrade-2026-10-18).
- Linked the [optimization backlog issue #5](https://github.com/surlymochan/openflow/issues/5).

No CLI or gate changes in this release.

## [0.2.1] - 2026-10-17

### Changed
- TDD proofs are bound to a tree snapshot. `I6b` recomputes the binding and re-runs the recorded command. Green also checks that snapshotted test files still match disk.
- Red and green must run the same test, or green must be a superset. Skip, todo, and focused tests do not count. Import-only or empty failures do not count as red. Type-only assertions fail when they are the only assertions.
- `J4b` fails when the same subject has contradictory `MUST`/`SHALL` verb/value clauses.
- `self.assert*`, `pytest.raises`, and bare `assert` count as assertions.
- `tdd_mode` `refactor` and `docs` (status.json or `--tdd-mode`) are the exemption path for an honest refactor or a docs-only diff. Misuse fails.

## [0.2.0] - 2026-10-17 (relaunch)

### Added
- Policy overlay execution mode: `xflow policy validate`, plus policy, notify, storage, plugin and
  experience-digest atoms.
- `xflow intake recommend` for adaptive yolo/corps track selection.
- `xflow profile show|set` for execution profiles.
- `xflow compare super-assistant`.
- `docs/assets/demo.gif`, recorded from a real CLI run, and a README rewrite.
- `CHANGELOG.md`.

### Changed
- The npm package is now named `@surlymochan/openflow`, because the unscoped `openflow` name is taken. The CLI is still `xflow`.
- `package.json` adds repository/homepage/bugs/keywords/author, `engines.node >= 22.5` and public `publishConfig`.
- The `xflow serve` fallback message no longer links to an unpublished repository.

### Fixed
- `agent_invoke` no longer crashes with an uncaught `EPIPE` when an agent CLI exits before reading its stdin prompt. This fixes an intermittent `heavy-atoms` test failure.

## [0.1.0] - 2026-05-25

### Added
- First public extraction:
  - YAML workflows (`yolo`, `corps`) validated against the atom registry.
  - Red/green TDD proof gates and a test-quality review.
  - Handoff and AHA state, archive ordering, and the `xflow` CLI.
- Adapters: `xflow adapter import-file` and `xflow adapter github-issue`.
