# Changelog

All notable changes to this project are documented here. Detailed notes live in
[RELEASE_NOTES.md](RELEASE_NOTES.md).

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
