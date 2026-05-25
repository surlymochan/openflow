# Adoption: OpenFlow release hardening

Date: 2026-05-25
Source: OpenFlow maintainer release-hardening workflow, public commit 9344633
Track: corps

## Context

The OpenFlow maintainer workflow used xflow itself to extract and harden the
public launch surface for the heavy `corps` track. The work was not a fixture
run: it produced a public source repository, documentation, CLI evidence,
workflow checks, benchmark reporting, and CI verification.

## Goal

Evaluate whether `xflow:goal`, `xflow:yolo`, and `xflow:corps` can provide a
credible open-source project-delivery layer, then keep the public boundary
honest about what is proven locally versus what still needs external adoption
or npm registry proof.

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

- `https://github.com/surlymochan/openflow/commit/9344633`
- `docs/corps-operator-guide.md`
- `bin/xflow.js`
- `test/cli-usability.test.js`
- `test/competitive-readiness.test.js`
- `docs/quality-assessment.md`
- `docs/public-benchmark.md`

## Outcome

The release review got better because the public extraction has a first-time
operator guide, a CLI `--explain` path, score evidence, CI, and tests that fail
if core launch documentation disappears. The workflow also kept claim safety
explicit: source-checkout quality can be proven now, while npm publication and
third-party adoption claims require separate evidence. A future release owner
would use this gate again because it separates local quality from distribution
and ecosystem evidence.

## Redactions

Local home-directory paths and machine-specific command output were summarized.
No secrets, tokens, private customer data, or private tracker content were
included.
