# Superpowers Comparison

Use this page when someone asks whether xflow should exist if Superpowers-style
agent skills already cover planning, TDD, debugging, review, and branch
finishing.

## Verdict

Superpowers is excellent as an agent-behavior methodology. It is lightweight,
portable, and good at making the model behave like a careful engineer.

xflow is better when the claim must survive outside one conversation: executable
workflow data, repo-local state, machine-readable proof, cross-tool handoff, and
launch readiness gates.

```text
Superpowers = behavior discipline
xflow = workflow runtime plus audit evidence
```

## Scorecard

Overall, xflow wins for repo-local team delivery and public launch scrutiny:
`91/100` versus `78/100`. Superpowers still wins on overall lightweight feel,
but xflow now ties it on explicit behavior-discipline coverage.

| Dimension | Weight | Superpowers | xflow | Winner |
| --- | ---: | ---: | ---: | --- |
| Agent behavior shaping | 15 | 15 | 15 | Tie |
| TDD and debugging discipline | 15 | 14 | 15 | xflow |
| Repo-local evidence | 20 | 9 | 19 | xflow |
| Cross-tool handoff | 15 | 10 | 14 | xflow |
| Workflow execution | 20 | 12 | 18 | xflow |
| Launch readiness | 15 | 6 | 10 | xflow |

The scores are deliberately evidence-linked rather than vibe-only. The
machine-readable scorecard includes `evidence_refs` per dimension, pointing to
surfaces such as `xflow coach bugfix`, `xflow coach tdd`, `xflow coach debug`, `xflow coach red`, `xflow coach green`, `xflow coach verify`, `xflow coach qa`, `xflow coach ship`, `workflows/yolo.yaml`,
`workflows/corps.yaml`, `test/tdd-proof.test.js`, `xflow goal audit --json`,
`xflow launch audit --json`, and `npm run release:pack`.

Machine-readable form:

```bash
xflow compare superpowers --json
```

## When Superpowers Wins

- A developer wants lightweight behavior coaching without adopting a workflow
  runtime.
- The task is a normal code change where planning, TDD, debugging, and review
  prompts are enough.
- The team values minimal setup over durable repo evidence.

## When xflow Wins

- The work needs a persistent project goal, not only thread-local intent.
- A reviewer needs proof artifacts, not only a well-written final answer.
- A team wants yolo/corps tracks, archive ordering, handoff, and launch gates.
- The team wants named coaching entrypoints such as `xflow coach bugfix`,
  `xflow coach feature`, `xflow coach review`, `xflow coach tdd`,
  `xflow coach debug`, `xflow coach red`, `xflow coach green`,
  `xflow coach verify`, `xflow coach qa`, and
  `xflow coach ship`.
- A public launch claim must be backed by commands such as:

```bash
xflow compare superpowers --json
xflow launch dossier
xflow score --json
xflow workflow validate yolo
xflow workflow validate corps
npm run release:pack
```

## Objective Judgment

xflow should not claim that Superpowers is obsolete. Superpowers remains better
for low-friction model behavior shaping. xflow's stronger claim is narrower and
more defensible: it turns that discipline into repo-owned workflow evidence
that survives handoff, review, release, and public launch scrutiny.
