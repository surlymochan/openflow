# Release Notes

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
