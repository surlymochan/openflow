# Release Notes

## 0.1.0 - Public Readiness Candidate

This release turns `as-xflow` from a local skill/workflow repo into a package-ready workflow runtime for AI coding agents.

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
