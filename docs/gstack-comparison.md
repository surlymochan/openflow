# Gstack Comparison

Use this page when someone asks whether xflow still adds value if a team already
likes Garry Tan's `gstack` workflow for Codex or Claude Code.

Primary references:

- [gstack official site](https://gstack.lol/)
- [garrytan/gstack AGENTS.md](https://github.com/garrytan/gstack/blob/main/AGENTS.md)

## Verdict

gstack is excellent at turning one coding agent into a role-based software team
with named commands, browser QA, and release rituals.

xflow is better when the workflow truth itself must live in the repository:
versioned workflow YAML, durable project goal alignment, explicit handoff/AHA
artifacts, machine-checkable proof, and launch-readiness gates.

```text
gstack = host-level specialist command system
xflow = repo-owned workflow runtime plus audit evidence
```

## Scorecard

Overall, xflow wins for repo-owned delivery rigor and public claim scrutiny:
`96/100` versus `80/100`. xflow now ties gstack on the role-shaped command surface
it set out to close, and browser-centered QA flow is also effectively a tie.

| Dimension | Weight | gstack | xflow | Winner |
| --- | ---: | ---: | ---: | --- |
| Role specialization | 15 | 15 | 15 | Tie |
| Browser QA and sprint commands | 15 | 15 | 15 | Tie |
| Repo-owned workflow state | 15 | 9 | 15 | xflow |
| Goal alignment and project memory | 15 | 10 | 15 | xflow |
| Release gates and public readiness | 15 | 10 | 14 | xflow |
| Cross-tool host support | 10 | 9 | 11 | xflow |
| Auditability and handoff | 15 | 12 | 14 | xflow |

Machine-readable form:

```bash
xflow compare gstack --json
```

## When Gstack Wins

- A team wants named slash-command roles more than repo-owned workflow data.
- The main pain is browser QA, release ritual, or specialist prompting on top of
  an existing host.
- The workflow should stay mostly host-native and lightweight.

## When xflow Wins

- Workflow order, gates, and proof must be checked into the repository.
- The team wants `.xflow/GOAL.md` to survive thread changes and be consumed by
  yolo, corps, Ralph, handoff, and takein.
- The team wants named QA and host commands instead of shell-script spelunking:
  `xflow qa review`, `xflow qa ship`, `xflow qa benchmark`, `xflow host status`,
  `xflow host sync`, `xflow host diff`.
- The team wants explicit named roles inside the repo runtime:
  `xflow role developer`, `xflow role reviewer`, `xflow role qa`,
  `xflow role release`, `xflow role product`.
- Public claims must be backed by local commands such as:

```bash
xflow compare gstack --json
xflow qa review --url http://127.0.0.1:3000 --platform-profile mobile_h5 --json
xflow qa ship --url http://127.0.0.1:3000 --platform-profile mobile_h5 --json
xflow qa benchmark --url http://127.0.0.1:3000 --platform-profile mobile_h5 --json
xflow role qa --json
xflow host status --json
xflow goal audit --json
xflow launch audit --strict --json
xflow package preflight --check-registry --check-auth --json
xflow adoption validate --json
npm run release:pack
```

## Fair Boundary

xflow should not pretend gstack is weak. Official gstack materials strongly
emphasize role-specialist commands, browser QA, and a release loop for Codex
and Claude Code. xflow's defensible claim is different: those behaviors become
more durable when the workflow state, handoff artifacts, QA capture defaults,
and launch gates are stored in repo-owned files instead of living mainly in
host-installed commands.
