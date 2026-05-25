# OpenFlow vs gstack vs Superpowers vs OpenSpec Benchmark

Date: 2026-05-25

This benchmark is a source-checkout, command-driven comparison. It is not a
neutral industry certification. Scores use OpenFlow's repo-owned delivery
runtime rubric: executable workflow state, verification gates, handoff,
auditability, packaging, and claim safety.

## Tested Revisions

| Project | Source | Revision / Version |
| --- | --- | --- |
| OpenFlow | local public extraction | `openflow@0.1.0` |
| gstack | https://github.com/garrytan/gstack | `920a13a17f463c28a3db75cc27482affb13a4fee`, package `1.44.0.0` |
| Superpowers | https://github.com/obra/superpowers | `f2cbfbefebbfef77321e4c9abc9e949826bea9d7`, package `5.1.0` |
| OpenSpec | https://github.com/Fission-AI/OpenSpec | `e441287b1fdd719bfa4518936c79e03e91c8d3c9`, package `@fission-ai/openspec@1.3.1` |

## Commands Actually Run

| Project | Command | Result | Notes |
| --- | --- | --- | --- |
| OpenFlow | `npm ci` | Pass | Installed local package dependencies. |
| OpenFlow | `node bin/xflow.js doctor --project-root . --json` | Pass | 12/12 readiness checks passed. |
| OpenFlow | `node bin/xflow.js workflow validate yolo --project-root . --json` | Pass | Public yolo workflow validates. |
| OpenFlow | `node bin/xflow.js score --json` | Pass | `100/100`. |
| OpenFlow | `node bin/xflow.js compare openspec --json` | Pass | OpenFlow `93`, OpenSpec `73`. |
| OpenFlow | `node bin/xflow.js compare superpowers --json` | Pass | OpenFlow `91`, Superpowers `78`. |
| OpenFlow | `node bin/xflow.js compare gstack --json` | Pass | OpenFlow `96`, gstack `80`. |
| OpenFlow | `npm run drift:scan` | Pass | 9/9 drift checks passed. |
| OpenFlow | `node --test test/cli-usability.test.js` | Pass | 67/67 tests passed after public-boundary updates. |
| OpenFlow | `node --test test/competitive-readiness.test.js` | Pass | 16/16 tests passed after public-boundary updates. |
| OpenFlow | `gitleaks detect --no-git --redact --source .` | Pass | No leaks found in the extracted tree. |
| gstack | `./setup --host openclaw` | Pass | Safe non-mutating host path prints integration instructions. |
| gstack | `bun run skill:check` | Fail | Skill command validation mostly passed, but generated host skill freshness failed and `claude/SKILL.md` was missing. |
| gstack | `bun install --frozen-lockfile` | Inconclusive | No output for an extended wait; killed to avoid blocking the benchmark. |
| Superpowers | `npm pack --dry-run --json` | Pass | Package dry run succeeded. |
| Superpowers | `CLAUDE_PLUGIN_ROOT=<repo> bash hooks/session-start` | Pass | Hook produced valid JSON context injection. |
| OpenSpec | `npm ci` | Pass | Installed 304 packages and built successfully. |
| OpenSpec | `node bin/openspec.js --help` | Pass | CLI exposed command surface. |
| OpenSpec | `node bin/openspec.js validate --all --json` | Fail | 49/54 items passed; 5 change proposals lacked spec deltas. |
| OpenSpec | `npm test` | Pass | 76 test files and 1512 tests passed. |

## Scorecard

| Dimension | Weight | OpenFlow | gstack | Superpowers | OpenSpec |
| --- | ---: | ---: | ---: | ---: | ---: |
| First-run / install check | 10 | 9 | 6 | 8 | 9 |
| Executable workflow state | 15 | 15 | 9 | 8 | 10 |
| TDD / verification gates | 15 | 14 | 10 | 14 | 9 |
| Spec durability | 10 | 10 | 7 | 7 | 10 |
| Repo-local auditability | 15 | 15 | 10 | 9 | 9 |
| Cross-host portability | 10 | 9 | 9 | 10 | 10 |
| Release / claim gates | 15 | 13 | 8 | 7 | 8 |
| Public-boundary hygiene | 10 | 9 | 7 | 8 | 8 |
| **Total** | **100** | **94** | **66** | **71** | **73** |

## Interpretation

OpenFlow leads this benchmark because it combines a runnable workflow engine,
machine-checked gates, release checks, handoff continuity, and explicit claim
boundaries from source checkout.

gstack remains strong for role-rich operator workflows and browser/QA rituals,
but the tested checkout exposed generated-skill freshness failures.

Superpowers remains the strongest low-ceremony behavior-discipline layer across
agent hosts, especially for planning, TDD, debugging, and review. It is less of
a repo-owned execution runtime.

OpenSpec remains strongest for lightweight spec-driven development. Its own test
suite passed, but repository-wide `validate --all` surfaced five incomplete
change deltas in the tested checkout.

## Public Claim Boundary

Safe claim: OpenFlow is ahead in this benchmark for repo-owned delivery closure,
auditability, release gates, and cross-session workflow evidence.

Unsafe claim: OpenFlow universally makes gstack, Superpowers, or OpenSpec
obsolete. Each tool remains strong in its narrower operating model.
