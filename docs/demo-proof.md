# openflow Demo Proof

This page defines what an external evaluator should run before trusting xflow claims.

## Clean Project Adoption

From an empty temporary project:

```bash
npm install -g openflow
xflow demo clean
xflow guide
xflow assess
xflow demo launch
xflow init --project-root .
xflow goal set "Ship the next verified change" --project-root .
xflow goal audit --project-root . --json
xflow doctor --project-root .
xflow workflow validate yolo --project-root .
```

Expected result:

- `.as-xflow/config.json` exists
- `.xflow/GOAL.md` exists and `xflow goal audit --json` passes
- doctor exits successfully
- `yolo` validates through project-local config
- no internal workflow files need to be copied into the consumer project

The repository CI runs this same path by creating a minimal temporary `package.json` on the fly.
For source checkout evaluation before npm publication, run `node bin/xflow.js
demo clean` from this repository; it creates the temporary project, runs the
same init/goal/doctor/yolo validation smoke, and cleans up automatically.

## Source Checkout Release Proof

From the openflow repository:

```bash
npm run release:pack
```

This proves:

- full test suite passes
- active-surface drift scan passes
- installed xflow skill matches source
- package dry-run includes the runtime, docs, workflows, and skills
- package dry-run excludes local config, test fixtures, Python caches, and Finder metadata

## TDD Proof Demonstration

A real yolo run must produce:

```text
specs/changes/<change-id>/tdd/red-0.json
specs/changes/<change-id>/tdd/green-0.json
specs/changes/<change-id>/tdd/quality-0.json
```

The required semantics are:

- `red-0.json` records a failing raw test command before implementation
- `green-0.json` records a passing raw test command after implementation
- `quality-0.json` rejects code changes without meaningful changed tests
- quality review rejects empty assertions, snapshot-only tests, and mock-heavy tests without real assertions

## Competitive Claim Gate

Before claiming a new competitive advantage, run:

```bash
xflow score
xflow goal audit --json
xflow corps --explain --json
xflow compare superpowers
xflow compare super-assistant
xflow compare openspec
xflow compare gstack
xflow compare spec-kit
xflow adapter import-file --input docs/fixtures/tracker-item.json --json
xflow spec delta --change-id <change-id>
npm run drift:scan
npm run release:pack
npm run publish:check
```

The claim is not durable unless it is backed by:

- a user-facing command
- a durable doc page
- workflow or atom evidence where relevant
- a test that fails if the evidence disappears

## Corps Capture-Url Proof

For competitor-led UI work, the heavy-track benchmark contract now supports two
formal evidence paths. One of them is the phase-local capture path:

```bash
xflow corps \
  --title "Competitor-aligned workbench" \
  --change-type frontend \
  --change-id competitor-workbench \
  --competitor-product CompetitorX \
  --required-modules workspace \
  --required-modules detail \
  --capture-url http://127.0.0.1:4174/ \
  --reference-image refs/competitor-main.png \
  --dry-run \
  --json
```

What must be true before calling the run complete:

- `H6.visual.benchmark` records `benchmark_input_mode: "capture_url"`
- `visual_benchmark.json` is `reference_backed`
- the captured scenario resolves both `reference_image` and `screenshot_image`
- `xflow proof --track corps --change-id <id>` returns `ok=true`

## Minimal Example

Use the clean project adoption block above as the canonical minimal example.
Use [docs/launch-demo.md](./launch-demo.md) when the evaluator wants the public
goal-to-yolo and goal-to-corps proof story instead of only the minimal install
smoke.
