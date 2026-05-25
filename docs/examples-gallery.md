# Examples Gallery

This page collects the smallest reviewable examples that prove xflow's public
claims without requiring a private tracker, npm publish, or a production repo.

Use it as an evaluator map: start with the clean local smoke, then move to the
workflow path that matches the change type.

## 1. Clean Project Adoption Smoke

Best for: first-time evaluators, CI, package reviewers.

```bash
xflow demo clean
```

What it proves:

- a brand-new project can initialize xflow without copying internal workflow files
- `.xflow/GOAL.md` becomes a durable project artifact and passes goal audit
- doctor and `workflow validate yolo` pass against the clean consumer project

Reference docs:

- `docs/demo-proof.md`
- `docs/adoption/openflow-release-hardening.md`
- `docs/adoption/README.md`

## 2. Goal To yolo

Best for: backend, docs, infra, and small UI changes.

```bash
xflow init --project-root .
xflow goal set "Ship the next verified change" --project-root .
xflow goal audit --project-root . --json
xflow workflow validate yolo --project-root .
```

What it proves:

- `.xflow/GOAL.md` is a durable project artifact, not a thread-only reminder
- `xflow:goal` is useful when yolo uses it as direction context
- the lite workflow is executable data with TDD and archive gates

Reference docs:

- `docs/goal-vs-codex.md`
- `docs/launch-demo.md`
- `docs/walkthrough.md`

## 3. Goal To corps Proof

Best for: product, UI, competitor-led, or multi-agent work.

```bash
xflow goal show --json
xflow goal audit --json
xflow corps --explain --json
```

What it proves:

- corps is governed by a proof contract instead of a loose prompt chain
- visual benchmark, no-stub runtime witnesses, and final proof review are named
- goal alignment remains visible before and after heavy-track work

Reference docs:

- `docs/corps-operator-guide.md`
- `docs/launch-demo.md`
- `docs/quality-assessment.md`

## 4. External Tracker Import

Best for: teams that already use GitHub Issues, Jira, Linear, or another tracker.

```bash
xflow adapter import-file --input docs/fixtures/tracker-item.json --project-root .
```

What it proves:

- external systems can supply context without owning xflow workflow truth
- local change artifacts stay reviewable inside the repository
- adapter work can be tested without live service credentials

Reference docs:

- `docs/integrations.md`
- `docs/public-benchmark.md`
- `docs/fixtures/tracker-item.json`

## 5. Release Gate

Best for: maintainers preparing a public launch.

```bash
xflow launch dossier
xflow launch audit --pre-publish --strict --json
xflow package preflight --check-registry --check-auth --json
```

What it proves:

- score, goal, adoption, package, and launch claims are audited together
- the irreversible npm publish step is blocked until identity and registry
  evidence are present
- missing surfaces are explicit rather than buried in prose

Reference docs:

- `docs/launch-dossier.md`
- `docs/public-release.md`
- `docs/npm-publish-handoff.md`
