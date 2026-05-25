# Adoption: as-xflow release hardening

Date: 2026-05-23
Source: as-xflow maintainer release-hardening workflow, public commit 84add67
Track: corps

## Context

The as-xflow maintainer workflow used xflow itself to harden the public launch
surface for the heavy `corps` track. The work was not a fixture run: it changed
the product documentation, CLI, score evidence, installed skill mirrors, and
tests in the source repository.

## Goal

Evaluate whether `xflow:goal`, `xflow:yolo`, and `xflow:corps` can outperform a
thread-only Codex goal at the project-delivery layer, then keep improving the
skill family until it is credible as an open-source agent delivery runtime.

## Commands

```bash
xflow goal show --json
xflow goal audit --json
xflow corps --explain --json
xflow assess --json
xflow score --json
node --test test/cli-usability.test.js test/competitive-readiness.test.js test/workflow-drift-scan.test.js
SKILL_SYNC_TARGET_DIRS="$HOME/.agents/skills
$HOME/.codex/skills
$HOME/.config/opencode/skills" npm run skill:sync
npm run release:pack
xflow launch audit --strict --json
```

## Evidence

- `https://github.com/surlymochan/as-xflow/commit/84add67`
- `docs/corps-operator-guide.md`
- `bin/xflow.js`
- `test/cli-usability.test.js`
- `test/competitive-readiness.test.js`
- `docs/quality-assessment.md`
- `docs/public-benchmark.md`

## Outcome

The release review got better because the heavy `corps` track now has a
first-time operator guide, a CLI `--explain` path, score evidence, and tests
that fail if the guide disappears. The work also surfaced a concrete failure:
`xflow launch audit --strict --json` still refused splash-launch readiness until
public npm publication is proven. The maintainer workflow would use this gate
again because it separated real local quality from distribution evidence.

## Redactions

Local home-directory paths and machine-specific command output were summarized.
No secrets, tokens, private customer data, or private tracker content were
included.
