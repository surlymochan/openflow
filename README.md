# OpenFlow

[![CI](https://github.com/surlymochan/openflow/actions/workflows/ci.yml/badge.svg)](https://github.com/surlymochan/openflow/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@surlymochan/openflow?label=npm)](https://www.npmjs.com/package/@surlymochan/openflow)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![node >= 22.5](https://img.shields.io/badge/node-%E2%89%A522.5-informational)

**Executable delivery workflow for AI coding agents.**

## Benchmarks: OpenFlow vs superpowers (2026-10-17)

For the synthetic and evidence-check results below, the same model (`grok-4.7-high` via local `cursor-agent`) and same
harness are used for every arm; the SWE-bench block uses DeepSeek via Pi. Pinned: OpenFlow 0.2.1,
[superpowers](https://github.com/obra/superpowers) v7.0.0 (`bb92a77`). Scripts, raw results and methodology:
[`bench/`](bench/README.md) and [`bench/e2e/`](bench/e2e/README.md). Losses are shown as measured.

**Real GitHub issues (SWE-bench Verified), 2026-10-18.** Six hard instances from sympy, pytest and pylint; success
means the official FAIL_TO_PASS and PASS_TO_PASS tests all pass. Every arm runs on the Pi coding agent with
DeepSeek-V4.1-Flash (`deepseek-flash`), n=1 per cell, 20-minute cap; details and commands are in
[`bench/swebench/`](bench/swebench/README.md).

| Arm | Resolved (official tests) | Median wall-clock (IQR) | Median $ per task (DeepSeek list price) | Total $ (all runs) | n |
| --- | --- | --- | --- | --- | --- |
| Plain agent (baseline) | 3/6 (50%) | 124 s (110–175) | $0.0234 | $0.16 | 6 |
| superpowers v7.0.0 | 2/6 (33%) | 154 s (136–340) | $0.0285 | $0.31 | 6 |
| OpenFlow 0.2.1 | 4/6 (67%) | 230 s (200–266) | $0.0412 | $0.23 | 6 |
| openswarm (Pi executor) | 5/6 (83%) | 228 s (187–254) | $0.0377 | $0.21 | 6 |

**Caveats:** n=1 on 6 instances, so one or two resolves are within noise. The two workflow tools took about 1.8x the
baseline's median wall-clock and cost 76% (OpenFlow) / 61% (openswarm) more per task. The first published table undercounted
pytest because of a shared temp-dir race in grading; it is now fixed and regraded
([regrade notes](bench/swebench/README.md#regrade-2026-10-18)). On the MiniMax-M3.1-Flash-Preview subset, baseline
resolved 3/4 and superpowers 2/4; OpenFlow had no clean MiniMax run because the plan's usage cap was hit.

Raw per-run records and logs: [`bench/swebench/results/`](bench/swebench/results/). Optimization backlog from these
results: [#5](https://github.com/surlymochan/openflow/issues/5).

**Synthetic end-to-end tasks.** 8 small real tasks (4 JS, 4 Python), hidden acceptance tests applied only after the agent exits, 20-minute cap per run.

| Arm | Success (hidden tests) | Median wall time (IQR) | Median tokens: total / input+output | n |
| --- | --- | --- | --- | --- |
| Plain agent (baseline) | 24/24 (100%) | 55 s (46–132) | 105k / 28k | 24 |
| superpowers v7.0.0 | 24/24 (100%) | 187 s (121–299) | 312k / 59k | 24 |
| OpenFlow 0.2.1 | 11/12 (92%) | 985 s (920–1195) | 5.29M / 233k ¹ | 12 ² |

On tasks this small the plain agent already succeeds every time, and OpenFlow's full ceremony is the slowest and most
token-hungry arm. 3 of 12 OpenFlow runs hit the 20-minute cap while still running the workflow; their code already passed.
¹ Tokens counted only for runs that reported usage (not the 3 capped runs). Most of "total" is cache reads.
² 3 repeats on 2 tasks, 1 on the other 6, to save quota. Matched repeat-1 view (n=8 each): baseline 8/8, 57 s, 104k; superpowers 8/8, 154 s, 289k; OpenFlow 8/8, 1008 s, 5.32M.

**Catching fake TDD / verification evidence.** 36 scripted episodes: 25 faulty (red proof recorded after the fix, forged
proofs, skipped tests, weak or wrong assertions, contradictory specs, …) and 11 honest ones. Of these, 12 are a held-out set written after the fixes.

| Checker | Faulty caught | Honest wrongly rejected | Cost per check |
| --- | --- | --- | --- |
| OpenFlow 0.2.1 gates (deterministic code) | 22/25 (88%): original 16/17, held-out 6/8 | 0/11 | ~0.1–0.2 s, no model tokens |
| superpowers v7.0.0 skills + LLM judge | 25/25 (100%) | 1/11 | one agent call per check |
| LLM judge, no skills | 25/25 (100%) ³ | 0/11 | one agent call per check |
| OpenFlow 0.2.0 (before this benchmark, original 24 only) | 10/17 (59%) | 3/7 | – |

An LLM reviewer that is explicitly asked to audit an episode, and is allowed to rerun the tests, caught more than OpenFlow's static gates did.
OpenFlow's gates are deterministic and cost no model calls, but they still miss plausible-but-wrong expected values,
assertions in callbacks that never run, and behavior changes hidden inside a declared refactor.
³ 1 of the 11 honest runs timed out and counts as incorrect. LLM arms used 1 run per scenario.

Prompt-based workflows *ask* an agent to write the failing test first, run the suite and keep notes. OpenFlow
*checks* that it did. Workflows are YAML phases made of small deterministic "atoms". Gates are code: a
red/green TDD proof, a test-quality review, artifact checks, and archive ordering. The `xflow` CLI runs the
same workflows from Codex, Claude Code, Cursor, OpenCode, Gemini or a plain terminal.

![OpenFlow demo: a red proof must fail, a green proof must pass, and a faked red proof is rejected](docs/assets/demo.gif)

<sub>Recorded from a real run of the CLI in an empty project. The last two commands show an agent "recording" a
red proof after the fix, and the gate rejecting it.</sub>

## Why

Agent workflow kits are good at shaping behaviour, but the checks only live in prose. Agents skip the red
step, write tests that assert nothing, lose context between sessions, and open PRs before verification has
finished. OpenFlow adds a harder layer underneath:

- **Workflow as data.** `workflows/yolo.yaml` and `workflows/corps.yaml` are validated against an atom registry before they run.
- **TDD proof checked by code.**
  - `I6a` snapshots the tree and binds the command, exit code, output hash, and failure class. `I6b` recomputes that binding and re-runs the command on the snapshot. A hand-edited proof does not pass unless that snapshot really exits as claimed.
  - Red and green must target the same test, or green must be a superset of the red test. Skipped, todo, and focused tests do not count as red or green.
  - `I6c.tdd.quality_review` rejects code changes that have:
    - no meaningful test changes,
    - empty assertions,
    - snapshot-only tests,
    - mock-heavy tests without real assertions,
    - only a type or existence assertion (`typeof`, `!== undefined`).
  - `tdd_mode` in `status.json` (or `--tdd-mode`) may be `red-green` (default), `refactor`, or `docs`. Refactor requires the existing tests to pass before and after, with no assertion removed. Docs allows a non-code diff and does not require a red proof. Declaring docs while changing code, or refactor while deleting assertions, fails.
- **Context that survives sessions.**
  - The `.xflow/GOAL.md` project anchor.
  - `HANDOFF.md` and `AHA.md`.
  - Per-change `status.json` and proof files under `specs/changes/<id>/`.
- **Executable finish.** Verify → archive → commit/push → PR ordering is a tested atom, not a checklist.

## Features

- **YAML workflows, validated before they run** — phases are data (`workflows/*.yaml`), checked against an atom registry before execution.
- **Red/green TDD proof gates enforced by code** — proofs bind the command, exit code and output hash, and are re-verified on a snapshot; hand-edited or faked proofs are rejected, and skipped, todo or focused tests do not count.
- **Automatic test-quality review** — changes with no meaningful test changes, empty assertions, snapshot-only tests or mock-heavy tests without real assertions are rejected.
- **Context that survives sessions** — `.xflow/GOAL.md`, `HANDOFF.md` and per-change `status.json` carry state across sessions and agents.
- **Executable finish line** — verify → archive → commit/push → PR ordering is a tested workflow atom, not a prose checklist.
- **One CLI for multiple agents** — the `xflow` CLI drives Codex, Claude Code and Cursor from the same workflow files.

## 3 Minute Start

Requires Node.js ≥ 22.5 (for `node:sqlite`) and Python 3 (atoms are small Python scripts).

```bash
npm install -g @surlymochan/openflow     # installs the `xflow` CLI
cd your-project
xflow init --project-root .               # writes .as-xflow/config.json
xflow goal set "Ship the next verified change" --project-root .
xflow goal audit --project-root . --json
xflow doctor --project-root .
xflow workflow validate yolo --project-root .
xflow guide                               # the delivery loop in one screen
```

For a source checkout:

```bash
git clone https://github.com/surlymochan/openflow.git
cd openflow
npm ci && npm test
node bin/xflow.js quickstart
node bin/xflow.js evaluate
node bin/xflow.js compare codex-goal
node bin/xflow.js launch copy
```

## Run a change

```bash
git checkout -b feat/example-change
xflow workflow run yolo \
  --title "Example change" --change-type backend \
  --tdd-red-command  "npm test -- --grep new-behavior" \
  --tdd-green-command "npm test"
```

The lite track runs `tdd-red -> execute -> tdd-green -> verify -> archive` and stops at human or LLM gates. Every
phase leaves evidence in `specs/changes/<change-id>/`. Add `--dry-run` to print the phases, atoms and gates
first.

You can also run a single gate directly, as in the demo:

```bash
xflow atom run I6a.tdd.run --change-id my-change --phase red   --test-command "npm test"
xflow atom run I6a.tdd.run --change-id my-change --phase green --test-command "npm test"
xflow atom run I6b.tdd.proof_validate --change-id my-change --phase red
```

## Evaluate it

```bash
xflow quickstart        # copy-paste-safe first-run commands
xflow evaluate          # one-shot brief: quality score, comparisons, blockers, next actions
xflow assess            # scorecard for goal, yolo, corps and the skill family
xflow score             # competitive readiness score with evidence per dimension
xflow demo launch       # goal -> yolo and goal -> corps proof paths
xflow launch dossier    # one-page narrative backed by the same audit
xflow launch copy       # claim-safe announcement copy plus forbidden phrases
xflow release status    # the single next release blocker
```

<details>
<summary>Release-owner gates (fail until real adoption / npm evidence exists)</summary>

```bash
xflow adoption trial --name <team-or-project> --source <tracker-or-pr> --track yolo
xflow adoption status --json
xflow package preflight --check-registry --check-auth --json
xflow package audit --check-registry --json
xflow launch audit --pre-publish --strict --json
```

</details>

## Choose a track

| Track | Use when | Entry |
| --- | --- | --- |
| `goal` | You want a project-level direction anchor that later work reads and audits | `xflow goal set`, `xflow goal audit` |
| `plan` | You only need a reusable implementation plan | `xflow:plan` skill |
| `yolo` | Backend, docs, infra, small UI; low ceremony | `xflow workflow run yolo` |
| `corps` | Product/UI-heavy or multi-agent work with governed proof | `xflow corps --explain`, then `xflow corps` and `xflow proof --track corps` |
| `ralph` | Keep implementing, verifying and repairing until the completion evidence is clean | `xflow:ralph` skill |

Not sure which one fits? Run `xflow intake recommend --change-id <id> --title "<title>" --description "<text>"`.

## How it fits together

```
workflows/*.yaml ──validate──► atoms/registry.json ──► xflow/atoms/*.py   (deterministic steps)
        │                                                    │
        ▼                                                    ▼
  xflow workflow run ──► gates: deterministic | artifact-verify | human | llm
        │
        ▼
  specs/changes/<id>/   status.json · tdd/red-0.json · tdd/green-0.json · quality-0.json · logs/*.ndjson
```

- `bin/xflow.js`: the CLI. `src/`: workflow loader, runner, policy overlays, scoring.
- `xflow/`: the portable skill family (`xflow:plan`, `xflow:yolo`, `xflow:corps`, `xflow:ralph`, …) for agent hosts.
- `schemas/`: JSON schemas for workflows, proofs and policy overlays.

## Compared with other tools

OpenFlow aims to complement prompt-level workflow kits and spec tools, not replace them. `xflow compare
<superpowers|openspec|gstack|spec-kit|codex-goal>` prints a side-by-side with sources.

<details>
<summary>Full capability table</summary>

| Surface | OpenFlow Position |
| --- | --- |
| Goal alignment | Project-level `.xflow/GOAL.md` that yolo, corps, Ralph, handoff, and takein consume |
| One-shot evaluation | `xflow evaluate` combines quality score, Codex goal / Superpowers / Super-Assistant comparison, ordinary and splash launch blockers, release-owner status, claim boundaries, next actions, and first-run path |
| Quality assessment | `xflow assess` gives a public scorecard for goal, yolo, corps, and the skill family |
| Launch demo | `xflow demo launch` shows goal -> yolo and goal -> corps proof paths |
| Launch audit | `xflow launch audit` separates ready engine and adoption evidence from missing registry proof |
| Launch dossier | `xflow launch dossier` prints the one-page public narrative backed by the same audit payload |
| Launch claims | `xflow launch claims` separates what can be said publicly now from claims blocked by missing evidence |
| Launch copy | `xflow launch copy` generates claim-safe announcement copy and forbidden phrases from the same evidence |
| Package status | `xflow package status` gives a non-failing publish/install status summary |
| Package audit | `xflow package audit` validates public npm registry evidence before splash-launch claims |
| Release status | `xflow release status` gives the release owner one focused blocker, next action, package status, and handoff doc |
| Adoption status | `xflow adoption status` gives a non-failing ordinary/splash adoption blocker summary |
| Adoption trial | `xflow adoption trial` gives external teams the exact commands and evidence checklist before a trial packet is written |
| Publish handoff | `docs/npm-publish-handoff.md` records the exact auth, preflight, publish, and post-publish gates |
| TDD | Executable red/green proof plus quality review |
| Workflow | YAML phases validated against atom registry |
| Spec migration | OpenSpec mapping report plus deterministic `spec_delta_review.json` |
| Local closure | Doctor, drift scan, release pack, archive ordering |
| Team handoff | `HANDOFF.md`, `AHA.md`, reviewer guide |
| Team adoption | Role model, CI boundary, PR acceptance, release ownership |
| Cross-tool use | Plain CLI and skill docs for Codex, Claude Code, Cursor, OpenCode, Gemini |
| Competitive proof | `xflow compare codex-goal`, `xflow compare superpowers`, `xflow compare super-assistant`, `xflow compare openspec`, `xflow compare gstack`, `xflow compare spec-kit`, benchmark docs |
| Adoption proof | Minimal clean project runs in CI, plus public adoption-record templates |

</details>

## Docs

<details>
<summary>All guides</summary>

- [Quickstart](docs/quickstart.md)
- [Install and upgrade](docs/install-upgrade.md)
- [Tooling matrix](docs/tooling-matrix.md)
- [Compatibility notes](docs/compatibility.md)
- [Demo proof](docs/demo-proof.md)
- [Examples gallery](docs/examples-gallery.md)
- [Public benchmark](docs/public-benchmark.md)
- [Quality assessment](docs/quality-assessment.md)
- [Launch demo](docs/launch-demo.md)
- [Launch dossier](docs/launch-dossier.md)
- [Corps operator guide](docs/corps-operator-guide.md)
- [Superpowers comparison](docs/superpowers-comparison.md)
- [Super-Assistant comparison](docs/super-assistant-comparison.md)
- [Adoption evidence template](docs/adoption/README.md)
- [Maintainer adoption record](docs/adoption/openflow-release-hardening.md)
- [xflow Goal vs Codex native goal](docs/goal-vs-codex.md)
- [Walkthrough](docs/walkthrough.md)
- [OpenSpec migration](docs/openspec-migration.md)
- [spec-kit benchmark](docs/spec-kit-benchmark.md)
- [Integration matrix](docs/integrations.md)
- [Public release gate](docs/public-release.md)
- [npm publish handoff](docs/npm-publish-handoff.md)
- [Release notes](RELEASE_NOTES.md)
- [Adapter fixture](docs/fixtures/tracker-item.json)
- [Methodology](docs/methodology.md)
- [Reviewer guide](docs/reviewer-guide.md)
- [Team adoption operating model](docs/team-adoption.md)
- [Competitive benchmark](docs/competitive-benchmark.md)
- [2026-05-25 benchmark report](docs/benchmark-openflow-vs-gstack-superpowers-openspec-2026-05-25.md)

</details>

## Development

```bash
npm ci
npx playwright install chromium   # browser-evidence tests
npm test                          # 270+ tests
npm run drift:scan                # docs/skill/workflow drift checks
npm run pack:check                # what would be published
```

Contributions are welcome: open an issue describing the workflow problem first, then a PR with tests. Keep
claims in docs tied to a command that reproduces them.

## License

[MIT](LICENSE)
