# End-to-end task-completion harness

Shared runner for the OpenFlow and openswarm benchmarks. Each cell is one task, one workflow arm, and one repeat. The model is local `cursor-agent` with model `grok-4.7-high` on every arm that actually calls a model.

Three numbers are recorded per cell:

- wall-clock seconds for the arm
- tokens from cursor-agent `result.usage` (`inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens`), summed over every cursor-agent invocation that arm makes
- success: the working tree after the arm exits passes hidden acceptance tests the agent never sees

## Layout

| Path | Role |
| --- | --- |
| `tasks/<id>/repo/` | Small project. The harness git-inits a fresh copy. |
| `tasks/<id>/TASK.md` | Issue-style description. It names the visible test command and does not quote the hidden cases. |
| `tasks/<id>/hidden/` | Acceptance tests. At least four assertions plus one regression. |
| `tasks/<id>/solution.patch` | Reference fix, outside `repo/`. |
| `tasks/<id>/meta.json` | Language, difficulty, visible command, hidden command. |
| `arms/<arm>.sh` | `arms/<arm>.sh <workdir> <task.md> <events-dir>` |
| `run.py` | Matrix runner. Resumable jsonl. |
| `report.py` | Per-arm and per-task summary, CSV, SVG. |
| `validate_tasks.py` | Reference-solution check. No model. |

Eight tasks: four JavaScript (`node --test`) and four Python (`unittest`).

| id | language | kind |
| --- | --- | --- |
| `pagination-off-by-one` | JavaScript | page window starts one page too late |
| `lru-eviction` | JavaScript | reads do not refresh LRU order |
| `semver-compare` | JavaScript | comparison stops at the major number |
| `path-normalise` | JavaScript | `..` is not collapsed |
| `date-range-parse` | Python | end date is exclusive |
| `csv-quoting` | Python | commas, quotes, and newlines are not quoted |
| `retry-backoff` | Python | no retry and no backoff |
| `config-deep-merge` | Python | nested dicts are replaced wholesale |

## How a cell runs

1. Copy `repo/` to `tmp/<stamp>-<task>-<arm>-r<n>/repo`. Copy `TASK.md` next to that directory, not inside it, and not beside `hidden/`.
2. `git init` and commit `baseline` (identity is passed with `git -c`, not by editing git config).
3. Run the arm with stdin `/dev/null`, a 20 minute timeout, and a private events directory under `results/raw/`.
4. Diff the worktree against the baseline commit (or against `measure-from.txt` when the arm committed tool install files first).
5. Run the visible test command.
6. Copy `hidden/` into `<workdir>/_hidden_acceptance/` and run the hidden command. Success is that exit code.

The prompt is the text of `TASK.md` plus one shared line, `Implement it; run the visible tests.` Superpowers adds `Use the installed skills for this change.` OpenFlow adds `Use the installed workflow tool for this change.` Baseline adds nothing else. The prompt does not mention `hidden/`.

Raw cursor-agent streams are `results/raw/<run>/agent-*.jsonl`. Openswarm also stores `executor-usage.json` and `openswarm-result.json`.

## Arms

Every model call uses the same binary invocation:

```text
cursor-agent -p --trust --force --model grok-4.7-high --output-format stream-json -- <prompt>
```

stdin is `/dev/null`. The shared function is `arms/common.sh` (`cursor_invoke`).

| Arm | What is different |
| --- | --- |
| `baseline` | That invocation and the shared prompt. |
| `superpowers` | `--plugin-dir` set to the pinned checkout `<superpowers-dir>` (tag `v7.0.0`). The arm refuses any other tag. One extra prompt line. |
| `openflow` | `npm install` of `$OPENFLOW_TGZ` into a prefix **outside** the repo, `xflow` on `PATH`, `xflow init --project-root`, and a Cursor project rule `.cursor/rules/openflow.mdc` that points at the installed `docs/tooling-matrix.md` and the `xflow/` skill docs. That is the Cursor entry in `docs/tooling-matrix.md` and `docs/compatibility.md`: a project rule, `.as-xflow/config.json`, not a copy of the workflow prose. Node >= 22.5 is required (`$HOME/.local/node22/bin/node` on this machine). The install commit is excluded from the solution diff via `measure-from.txt`. |
| `openswarm` | A planner `cursor-agent` call receives `TASK.md` and `$OPENSWARM_DIR/SKILL.md` and must write only `events/executor-task.md`. The repo is reset to `HEAD`. Then `bin/openswarm run --backend cursor --model grok-4.7-high --cwd <repo> --task-file <f> --verify <visible cmd> --budget-minutes 15`. The arm merges `openswarm/<id>` back. `$OPENSWARM_HOME` is the events directory for that cell. Provider API keys are unset before `openswarm` so its probe does not call DeepSeek or similar. |
| `omo` | Not executed. See `arms/omo.md`. `run.py` writes a skipped row and does not call a model. |

### Superpowers plugin check

`--plugin-dir` works headless on cursor-agent `2026.10.16-e3cb207`. No install fallback was required.

Checked on 2026-10-17 with the same flags as the arm, plus `--plugin-dir <superpowers-dir>`, prompt `Reply with exactly the word pong. Do not use tools and do not edit files.` Session `ce53ee8a-7403-4fb3-837f-c82660c4ec57` returned `pong`.

The debug log (`bench-work/tmp/cursor-agent-logs-1000/session-2026-10-17T12-09-40-980Z-433324-1.log`) recorded the plugin name Superpowers and:

```text
[hooks] sessionStart additional_context received {"length":3405}
```

Running `hooks/session-start` with `CURSOR_PLUGIN_ROOT` set to that checkout prints `additional_context` of the same length, 3405 characters, and the body is the `using-superpowers` skill. The stream-json `result.usage` on that call was `inputTokens` 10677, `outputTokens` 158, `cacheReadTokens` 5888, `cacheWriteTokens` 0, which is consistent with the skill text being in the prompt rather than only registered on disk.

### Openswarm tokens

`result.json` has top-level `usage` and the same object on `attempts[].meta.usage` (the cursor backend writes the four `result.usage` fields). The arm keeps the per-attempt objects and does not also add the top-level copy. Session ids are read from the executor event log when the result does not carry one. Planner usage comes from `agent-1.jsonl` the same way as baseline.

## Runner

```bash
python3 run.py \
  --arms baseline,superpowers,openflow,openswarm \
  --tasks all \
  --repeats 3 \
  --concurrency 4 \
  --out results/e2e-2026-10-17.jsonl
```

Environment variables for a full matrix:

- `OPENFLOW_TGZ` — local tarball of `@surlymochan/openflow`
- `OPENSWARM_DIR` — openswarm checkout (this tree's `release/xswarm` once the cursor backend is the one you want to measure)
- `SUPERPOWERS_DIR` — optional override; default is the v7.0.0 checkout above

A row already in the jsonl for the same `(task, arm, repeat)` is skipped. Delete that line to retry a cell. Per-run timeout is 20 minutes. The openswarm executor budget of 15 minutes sits inside that cap, so planner time counts against it.

`report.py` reads the jsonl and writes, next to it or under `--out-dir`:

- `summary.md` — success x/n and percent, median wall seconds with IQR / min / max, median input, output, cache read, and total tokens with IQR, per arm, per task, and per task×arm
- `scores.csv` — the same figures
- `chart.svg` — white background, three panels (success %, median minutes, median total tokens). Whiskers on the two median panels are the IQR (q1 to q3).

Skipped `omo` rows are stored and then omitted from the aggregates.

Token total is `inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens`. The CLI sets `inputTokens` to `max(input - cacheRead - cacheWrite, 0)` before it emits `result.usage`, so adding the four fields reconstructs the full count instead of double-counting cache.

## Validate, then one smoke

```bash
python3 validate_tasks.py
python3 -m unittest tests.test_harness -v
```

`validate_tasks.py` checks, with no model, that the original repo passes the visible tests and fails the hidden tests, and that `solution.patch` passes both.

The unit test drives `run.py` through a fake `cursor-agent` that fixes pagination and prints a `result.usage` line. It checks that hidden tests are absent while the agent runs, that tokens and the session id are recorded, that a second invocation skips the finished cell, and that the SVG is a white three-panel chart.

One real smoke is in `results/e2e-2026-10-17-smoke.jsonl` (report under `results/smoke-report/`). It is baseline × `pagination-off-by-one` × 1 repeat, not the matrix. On 2026-10-17 it finished in 43.6s, exit 0, one cursor-agent call, session `14c64f47-ed34-4666-8b63-7d4f638f26e9`, hidden tests passed after the agent exited, and `result.usage` was input 12960, output 1780, cache read 90496, cache write 0. The only tracked change was the page-start index in `src/paginate.js`. Do not tune tasks from this row.

## Fairness

- Same model flag and the same cursor-agent flags on every real call. Superpowers only adds `--plugin-dir`. Openswarm's executor is cursor-agent with those flags; `--model grok-4.7-high` is passed into `openswarm run` so the policy default cannot drift.
- Same task text. The only prompt difference is the one neutral line on superpowers and openflow.
- Same hidden tests, applied only after the arm exits, from outside the workspace copy.
- Repeats are independent fresh copies. Concurrency does not share a worktree or an `OPENSWARM_HOME`.
- Do not edit tasks, hidden tests, or the reference patches after looking at model results. `validate_tasks.py` is the only acceptance check for the tasks themselves.
- Tool install (OpenFlow prefix, project rule, `xflow init`) is not scored as the agent's diff. The rule text is the documented Cursor snippet, not a benchmark-authored strategy.

## Limitations

- The filesystem is not sandboxed. `--force` can read paths outside the workdir, including `tasks/<id>/hidden/` and `solution.patch`, if the model goes looking. The harness keeps those files out of the copy and out of the prompt. It does not add flags the spec did not list.
- `result.usage` is whatever cursor-agent puts on the final result event. In this CLI build that object is replaced on each `turnEnded`, so a multi-turn invocation contributes its last reported usage, not a sum of turns. Turns are not emitted as separate usage events. Cells that time out before a result event record zeros and `missing_usage: true`.
- The reported model string may be a display name (`Grok 4.7 256K High`). The controlled variable is the flag `grok-4.7-high`, stored as `model`.
- OpenFlow needs a local tarball and Node >= 22.5. The system `node` on this machine is v20. The arm prepends a Node 22.5+ binary when it can find one.
- Openswarm's 15 minute executor budget is inside the 20 minute cell timeout.
- `omo` cannot be scored with a Cursor subscription. See `arms/omo.md`.
- Visible tests are partial on purpose. A green visible run is not success.

## Results (2026-10-17, first round)

Model `grok-4.7-high` through local `cursor-agent` 2026.10.16-e3cb207 for every arm. 8 tasks (4 JavaScript, 4 Python), hidden
acceptance tests applied only after the agent exits. Per-run cap 20 minutes. Concurrency 3 per batch.

| Arm | Success (hidden tests) | Median wall time (IQR) | Median total tokens (IQR) | Median input+output tokens | Runs killed at 20-min cap | n |
| --- | --- | --- | --- | --- | --- | --- |
| baseline (plain cursor-agent) | 24/24 (100%) | 55 s (46–132) | 105k (87k–113k) | 28k | 0 | 24 |
| superpowers v7.0.0 (`--plugin-dir`) | 24/24 (100%) | 187 s (121–299) | 312k (267k–436k) | 59k | 0 | 24 |
| openswarm (planner + `--backend cursor` executor) | 24/24 (100%) | 220 s (137–356) | 207k (191k–246k) | 64k | 0 | 24 |
| openflow 0.2.1 (installed + Cursor rule) | 11/12 (92%) | 985 s (920–1195) | 5.29M (5.07M–5.41M) ¹ | 233k ¹ | 3 | 12 ² |
| oh-my-openagent | not run (see `arms/omo.md`) | – | – | – | – | 0 |

Matched comparison (repeat 1 of every task, n = 8 per arm): baseline 8/8, 57 s, 104k tokens; superpowers 8/8, 154 s,
289k; openswarm 8/8, 218 s, 203k; openflow 8/8, 1008 s, 5.32M ¹ (2 of 8 hit the cap). `results/headline.json` has both views.

¹ Token medians only use runs that returned a usage event. A run killed at the cap has no usage event, so its tokens are
unknown, not zero; those runs used at least as many tokens as they had consumed when killed. Most of "total" is cache
reads (`cacheReadTokens`); input+output is shown separately.
² openflow ran 3 repeats on `config-deep-merge` and `csv-quoting` and 1 repeat on the other six tasks. Each openflow run took
15–20 minutes and about 5M tokens, so the remaining repeats were not run to save subscription quota. The openflow
batch ran after the other three arms had started (same concurrency); `baseline` runs overlapped it in time.

What this says, plainly:

- These 8 tasks are small. The plain baseline solved all of them, so success rate does not separate the arms here; time
  and tokens do. Every workflow layer costs more time and tokens than the plain agent on tasks this size.
- openflow's documented Cursor entry asks the agent to run the full ceremony (goal, doctor, plan, red/green proofs,
  quality review, verify). On these tasks that was the slowest and most expensive arm by a wide margin, and 3 of 12 runs
  were still working on the workflow when the 20-minute cap killed them (the code in all 3 already passed
  the hidden tests). One `csv-quoting` run failed the hidden tests.
- openswarm adds a planner call and a host-side verify; its overhead here is planner tokens plus executor start-up.
- oh-my-openagent runs inside OpenCode/senpi with its own provider logins. The only subscription on this machine is
  Cursor's, which OmO cannot use, so the OmO arm was not run. Estimated cost to run it with metered DeepSeek
  (`deepseek-v4-pro`, $0.66 / $1.98 per 1M in/out, cache-miss list price, 2026-10-17): using the measured openswarm
  median of about 53k input + 10k output tokens per task, 8 tasks × 3 repeats ≈ 1.3M input + 0.24M output ≈ **$1.3**
  (more if OmO's own prompts are larger). Not run because the rules for this benchmark exclude paid APIs.

Raw data: `results/e2e-2026-10-17*.jsonl` (one record per run; host paths replaced by placeholders) and
`results/usage/` (the `result` event of every cursor-agent call: usage, duration, session id). Full agent transcripts are
not published because they contain host environment details; they are kept by the maintainer.
