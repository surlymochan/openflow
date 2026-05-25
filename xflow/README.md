# xflow

Project-facing skill family for `openflow`, an executable delivery workflow runtime for AI coding agents.

Start here:

```bash
xflow guide
xflow assess
xflow demo clean
xflow demo launch
xflow launch audit
xflow adoption kit --name first-team --source first-tracker --track yolo
xflow adoption init --name first-team --source first-tracker --track yolo
xflow adoption validate --json
xflow package audit --check-registry --json
xflow init --project-root .
xflow goal set "Ship the next verified change" --project-root .
xflow goal audit --project-root . --json
xflow doctor --project-root .
xflow workflow validate yolo --project-root .
```

Core entry points:

- `xflow:takein` - load `HANDOFF.md`, `AHA.md`, and local git state before acting.
- `xflow:goal` - set, inspect, or audit the project direction anchor in `.xflow/GOAL.md`; CLI users can run `xflow goal set` and `xflow goal audit`.
- `xflow:plan` - track-neutral planning only; produces `plan.md`.
- `xflow:ralph` - conversation-native Ralph/autopilot loop for verified completion and feedback repair.
- `xflow:yolo` - lite execution track for backend, docs, infra, and small UI changes.
- `xflow:corps` - heavy execution track for product/UI and multi-agent delivery.

Supporting entry points:

- `xflow:handoff` - refresh project handoff context.
- `xflow:lookback` - re-check durable project context before acting.
- `xflow:aha` - append durable insights to `AHA.md`.

Adjacent project:

- `xmem` - separate shared-memory skill family, now hosted in `as-xmem`.

Public docs:

- `README.md`
- `docs/quickstart.md`
- `docs/corps-operator-guide.md`
- `docs/install-upgrade.md`
- `docs/tooling-matrix.md`
- `docs/demo-proof.md`
- `docs/examples-gallery.md`
- `docs/public-benchmark.md`
- `docs/quality-assessment.md`
- `docs/launch-demo.md`
- `docs/launch-dossier.md`
- `docs/adoption/README.md`
- `docs/goal-vs-codex.md`
- `docs/walkthrough.md`
- `docs/openspec-migration.md`
- `docs/spec-kit-benchmark.md`
- `docs/integrations.md`
- `docs/public-release.md`
- `RELEASE_NOTES.md`
- `docs/fixtures/tracker-item.json`
- `docs/compatibility.md`
- `docs/methodology.md`
- `docs/reviewer-guide.md`
- `docs/team-adoption.md`
- `docs/competitive-benchmark.md`

Executable sources:

- `workflows/yolo.yaml`
- `workflows/corps.yaml`
- `atoms/registry.json`
- `specs/workflow.md`
