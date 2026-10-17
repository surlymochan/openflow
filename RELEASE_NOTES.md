# Release Notes

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
