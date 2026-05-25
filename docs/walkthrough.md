# Walkthrough

This walkthrough is the public demo script for evaluating xflow without reading the implementation.

## 1. Install Or Use Source

Global package path after publish:

```bash
npm install -g openflow
```

Source checkout path:

```bash
git clone <repo-url> openflow
cd openflow
npm install
```

## 2. Initialize A Clean Project

```bash
xflow guide
xflow init --project-root .
xflow doctor --project-root .
xflow workflow validate yolo --project-root .
```

## 3. Run A Spec Check

```bash
xflow adapter import-file --project-root . --input docs/fixtures/tracker-item.json --json
xflow spec delta --project-root . --change-id <change-id>
```

Expected output:

```text
specs/changes/<change-id>/spec_delta_review.json
specs/changes/<change-id>/spec_delta_review.md
```

## 4. Compare Against Reference Systems

```bash
xflow compare superpowers
xflow compare super-assistant
xflow compare codex-goal
xflow compare openspec
xflow compare gstack
xflow compare spec-kit
xflow score
```

## 5. Prove Release Readiness

```bash
npm run release:pack
npm run publish:check
```

## What The Demo Proves

- xflow can initialize without copying internal workflow files into the consumer project
- workflow data validates before execution
- spec delta review is an artifact, not just prose
- external tracker context can enter xflow through a thin adapter while repo-local artifacts own workflow truth
- TDD proof and test-quality gates are part of the delivery loop
- release packaging is checked before public claims

## What The Demo Does Not Prove

- npm ownership, until the real package is published
- deep bidirectional integration maturity for every tracker, beyond the generic import-file and GitHub issue adapters
- semantic superiority over every spec-kit extension, until the benchmark uses the same brownfield feature
