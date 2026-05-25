# Corps Operator Guide

Use this page when `xflow:corps` feels too large to start. The short version:
corps is the heavy track for product/UI risk, not a replacement for yolo.

## Verdict

Use corps when the work needs governed product proof:

- new user-facing product surface or interaction pattern
- competitor-led UI or visual fidelity matters
- multiple agents should propose, critique, or repair
- completion must be accepted from artifacts instead of chat summary

Do not use corps for ordinary backend, docs, or infrastructure changes. Use
`xflow:yolo` for that path.

## First-Time Sequence

```bash
xflow corps --explain
xflow goal show --json
xflow goal audit --json
xflow corps --title "<product or UI change>" --change-type frontend --change-id <change-id> --dry-run --json
xflow corps --title "<product or UI change>" --change-type frontend --change-id <change-id>
xflow proof --track corps --change-id <change-id>
```

The dry run explains the proof contract. The real run is not complete until
`xflow proof --track corps` writes `corps_proof.json` with `ok=true`.

## Proof Contract

Corps completion requires all of this:

- `specs/changes/<change-id>/corps_proof.json` reports `ok=true`
- the built-in governed corps workflow manifest is used
- hash-linked execution logs contain every canonical phase, atom, and gate
  witness
- required product, visual, QA, and archive artifacts exist
- no `stub`, `task_queued`, or `pencil_stubbed` runtime fallback appears
- the operator confirms the proof aligns with `.xflow/GOAL.md`

## Competitor-Led UI Inputs

Competitor-led UI requires a primary reference surface and exactly one benchmark
evidence path before execution:

```bash
xflow corps \
  --title "Competitor-aligned workbench" \
  --change-type frontend \
  --change-id competitor-workbench \
  --competitor-product "<name>" \
  --primary-reference-surface primary_workspace \
  --capture-url http://127.0.0.1:4174/ \
  --reference-image refs/competitor-main.png
```

Use `--reference-scenarios-json <path>` instead of `--capture-url` plus
`--reference-image` when the benchmark scenarios are already frozen.

## Common Failure Meanings

| Issue | Meaning |
| --- | --- |
| `competitor_led_ui_requires_benchmark_input` | The entry detected competitor-led UI but cannot prove visual comparison without benchmark evidence. |
| `competitor_led_ui_requires_primary_reference_surface` | The entry cannot tell which surface anchors the comparison. |
| `stub runtime fallback` | A required heavy agent runtime was unavailable or unauthenticated, so completion is not claimable. |

## Human Role

The conversation AI should not manually emulate corps. It represents the human
operator: clarify requirements, acknowledge human gates when needed, and inspect
`corps_proof.json` before accepting completion.
