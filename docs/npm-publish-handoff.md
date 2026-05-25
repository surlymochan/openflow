# npm Publish Handoff

Date: 2026-05-23

Use this page for the final irreversible public publish step. Everything here
is intentionally explicit because `npm publish --access public` changes public
distribution state.

## Current Verified State

- Package: `as-xflow@0.1.0`
- Registry name status: available in `xflow package preflight --check-registry --check-auth --json`
- Current machine auth: blocked by `npm whoami` with `ENEEDAUTH`
- Adoption gate: `xflow adoption validate --json` passes with
  `docs/adoption/as-xflow-release-hardening.md`
- Splash gate: `xflow release status --json` still reports
  `third_party_adoption` alongside `published_package`; use
  `xflow adoption brief --name <third-party-project> --source <public-pr-or-external-repo> --track yolo`
  to generate the outbound ask, then
  `xflow adoption trial --name <third-party-project> --source <public-pr-or-external-repo> --track yolo`
  before asking an external team to create reviewable evidence.
- Launch gate: `xflow launch audit --strict --json` still lists only
  `published_package`

Do not claim public installability until the registry reports `as-xflow@0.1.0`.

## Auth Recovery

```bash
npm login
npm whoami
xflow package status --json
xflow package preflight --check-registry --check-auth --json
```

The preflight must report:

- `ok: true`
- `registry_status: "available"` for a first publish
- a non-empty `npm_identity`
- no `registry already contains as-xflow@0.1.0` issue
- `next_actions` containing `run_pre_publish_gate` as the next release-owner
  command

## Final Publish Sequence

Run from the repository root after npm auth is restored:

```bash
npm run release:pack
npm run publish:check
xflow release status --json
xflow adoption brief --name <third-party-project> --source <public-pr-or-external-repo> --track yolo
xflow adoption trial --name <third-party-project> --source <public-pr-or-external-repo> --track yolo
xflow adoption validate --json
xflow goal audit --json
xflow package status --json
xflow package preflight --check-registry --check-auth --json
xflow launch audit --pre-publish --strict --json
npm publish --access public
xflow package audit --check-registry --json
xflow launch audit --strict --json
```

The real publish is allowed only after the pre-publish launch audit is green.
After publish, the strict launch audit is allowed to become green only when
`xflow package audit --check-registry --json` confirms the public registry
returns the expected name and version.

## Stop Conditions

- `npm whoami` fails: restore npm auth first.
- Registry already contains `as-xflow@0.1.0`: do not republish; bump version or
  verify ownership before continuing.
- `xflow package preflight --check-registry --check-auth --json` fails: follow
  its `next_actions` before retrying or publishing.
- `npm run release:pack` fails: fix local quality before publishing.
- `xflow adoption validate --json` fails: restore a non-fixture adoption record.
- `xflow launch audit --pre-publish --strict --json` fails: do not publish.
- `xflow package audit --check-registry --json` fails after publish: follow its
  `next_actions`; do not claim public installability until it passes.
- `npm publish --dry-run --access public` includes test fixtures, Python caches,
  local `.as-xflow/` state, or secrets: fix package inclusion before publishing.
