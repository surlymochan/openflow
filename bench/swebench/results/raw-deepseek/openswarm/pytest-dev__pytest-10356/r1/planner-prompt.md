You are the planner in an openswarm workflow. Read the skill and the engineering task.
Write one self-contained task file for an executor that has none of this conversation.

Write that file, and only that file, to:
<run>/10180038/openswarm/pytest-dev__pytest-10356/r1/planner/executor-task.md

The file must include the goal, the files or areas to change, constraints, and acceptance criteria.
Also write a single shell command that checks the change (for example a pytest invocation of the
relevant existing test file, run from the repository root with <run>/10180038/openswarm/pytest-dev__pytest-10356/r1/venv/bin/python) to:
<run>/10180038/openswarm/pytest-dev__pytest-10356/r1/planner/verify.txt

The repository is <run>/10180038/openswarm/pytest-dev__pytest-10356/r1/repo. Do not modify any file inside the repository. Do not commit. The executor starts from a clean worktree.

## openswarm skill

---
name: openswarm
description: Claude plans, Codex / OpenCode Go / DeepSeek execute. Use when work involves writing or changing code across files, batch refactors, migrations, test writing, or the user says "let Codex do it", "dispatch", "swarm", "openswarm", or wants to save Claude quota. Auto-discovers the latest GPT / OpenCode Go / DeepSeek models and reasoning efforts, reads live quotas and plan tiers on every side, routes each task to the most economical capable model, runs it in an isolated git worktree with a hard time budget, streams progress/risk/stall alerts, and reports on a schedule instead of running forever. Integrates with dynamic Workflow scripts and agent teams.
---

# openswarm

**Division of labour:** Claude decomposes work, writes acceptance criteria, reviews, and integrates.
Executors write code: **Codex** (main), **OpenCode Go** (cheap/mechanical, non-GPT second opinions, overflow, >272k context), and **DeepSeek** (metered last resort).
Claude Pro is the tightest quota here, so keep Claude's own tokens for planning and review and send the typing to executors.

CLI: `~/.claude/skills/openswarm/bin/openswarm` (alias it as `XS` in your commands). Runtime data lives in `~/.claude/openswarm/`.

## 0. Preflight (once per session, and again before any big fan-out)

```bash
XS=~/.claude/skills/openswarm/bin/openswarm
$XS status --refresh
```
This shows plans, quota windows (used %, reset time, burn pace), the live model catalogue with tiers, open breakers, the **recommended concurrency** and the **Claude review mode**.

If the Claude line says `STALE` and a usage tool is available in your client (for example Claude Desktop's `get_usage`), call it. When it returns plan percentages, record them:
`$XS ingest-claude --five-hour <pct> --seven-day <pct>`. The statusline hook refreshes this automatically in terminal sessions.

## 1. Decompose: one task = one profile

For each unit of work, write a self-contained prompt with goal, files or areas, constraints, **acceptance criteria**, and the test command. Executors start with no context from this conversation. Then classify it:

| field | values | guidance |
|---|---|---|
| `--type` | impl, refactor, debug, test, docs, mechanical, migration, format, rename, review, research | review/audit routes to a non-GPT family for an independent opinion |
| `--difficulty` | 1–5 | 1 rename or format · 2 small, well-specified · 3 normal feature · 4 cross-module or tricky · 5 hardest debugging or design-heavy |
| `--context-tokens` | approx | >220k makes the router prefer 1M-context backends |
| `--budget-minutes` | wall clock | **hard stop**; the executor's whole process tree is killed when it runs out. Default 40 |

Tasks that will run in parallel must touch disjoint files, or you will get merge conflicts.
Make a task smaller rather than raising its difficulty.

To check a routing decision without running anything: `$XS route --type impl --difficulty 3`. The output includes backend, model, effort, reasons, fallbacks, `claude_review` and `concurrency`.

## 2. Run

**One short task (finishes in under about 8 minutes)**, in the foreground:
```bash
$XS run --cwd <repo> --type impl --difficulty 3 --budget-minutes 15 --title "..." --task-file /tmp/task.md
```

**Always pass `--verify '<test command>'`** when the task has a test command. Executors run in a sandbox that can block
local port binding, network, or keychain access, so they often report `partial` for purely environmental reasons.
openswarm commits the executor's edit first, then runs the verify command on the host in that committed worktree (suites that refuse dirty trees pass); its exit code wins
(`partial`→`done` when it passes, `done`→`partial` when it fails) and is recorded in `result.verify`.
Gitignored dependency dirs (`node_modules`, `.venv`, `venv`; override with `workspace.link_dirs` in policy) are
symlinked from the base repo into the worktree and never committed, so imports resolve. Worktrees are created
beside the base repo (`.openswarm-wt-<repo>-<id>`) so committed relative links to sibling repos keep resolving
(`workspace.sibling_worktrees: false` restores the central `~/.claude/openswarm/worktrees`). Verify also runs when an
executor hit its budget but left changes; that case ends `partial` for the planner to review, never `done`.

**Anything longer, or several tasks:** detach, then monitor with events. Never sit in a blind wait.
```bash
$XS run --detach --cwd <repo> ... --verify '<test cmd>' --task-file /tmp/task.md     # prints {"id": ...}
```
Then use the **Monitor** tool. For a batch, one Monitor covers every run (`openswarm watch <id1> <id2> ...`, each line
labelled with the run title); for a single run:
```
Monitor(command: "~/.claude/skills/openswarm/bin/openswarm watch <id> --label <short>", timeout_ms: 1800000,
        description: "openswarm <short>: progress, risk, stalls")
```
`watch` prints one line per actionable event:
`MSG` (executor progress) · `RISK[...]` (dangerous shell command: push, rm outside the worktree, secret prints, sudo or services, publish; add patterns with `--risk '<regex>'`) · `STALL` (no events for 10 minutes) · `HEARTBEAT` (every 15 minutes) · `BUDGET` · `ERROR` · `ATTEMPT` (fallback switched backend) · `DONE` / `EXITED` (terminal).
It exits by itself with `WATCH-EXPIRED` after 28 minutes. **Re-arm** it with `--from-end` only if the run is still worth watching.

How to react:
- `MSG`: check it against the task scope. If the executor is drifting, `$XS stop <id>`, tighten the prompt, and re-dispatch.
- `RISK`: check it now. If it is out of bounds, stop the run. Codex reports commands before they run; opencode reports them only after they finish.
- `STALL`: look at the last command (`$XS runs`) and decide whether to keep waiting or stop.
- `DONE`: read `~/.claude/openswarm/runs/<id>/result.json`.

The user gets updates, not a stream. Relay progress in one line per meaningful event. Send a push notification only when the user needs to decide something, something really fails, or a phase finishes.

## 3. Scheduled reporting, never endless

- Every run has a hard `--budget-minutes`. Every watch has `--max-minutes`. Nothing runs open-ended.
- For multi-hour batches, check in on a schedule instead of polling. Use **ScheduleWakeup** (inside `/loop`) or a cron-style scheduled task that runs:
  ```bash
  $XS report --since-minutes 60
  ```
  It prints a one-screen digest: quota headroom on all four sides, active runs (with ⚠ for runner dead, idle over 10 minutes, or over budget), runs finished in the window with commits, and an `attention` list. Relay the digest. Act on the `attention` items. Stop scheduling once there are no active runs.
- `$XS runs [--active] [--json]` gives a per-run snapshot. `$XS ledger` shows history.

## 4. Results and integration

A finished run gives you `status`, `result` (`summary`, `files_changed`, `tests`, `followups`), `branch` (`openswarm/<id>`), `commit`, `diffstat`, `patch`, and `attempts` (backend, model, effort, seconds, error class, quota before and after).
- The executor worked in `~/.claude/openswarm/worktrees/...` based on `HEAD`. **Uncommitted changes in the main tree are not visible to it**, and `workspace.note` warns about this. Commit or stash before dispatching.
- Review according to `claude_review`:
  - `full`: read the patch and the touched code, and run the tests.
  - `light` (default on Claude Pro): read the diffstat and the hunks, and trust the executor's test report unless it says tests were not run.
  - `delegate` (Claude is at 80% or more of its quota): dispatch a `--type review` task, which goes to a non-GPT model, and only spot-check its findings yourself.
- Integrate with `git merge --no-ff openswarm/<id>` or `git cherry-pick <commit>`. **After integrating a batch, run one
  combined suite on the base checkout** covering every touched area: each run's `verify` only proves that run in
  isolation, and tasks can break each other or untouched callers (a stricter check in one run broke an existing
  test and a non-browser client that no single verify covered).
- `--verify-baseline`: when the suite already has known failures, add this flag. On a failing verify openswarm reruns
  the command on the run's base commit and passes the run only if it introduced no new failing test
  (`result.verify.baseline.new_failures`). Without it, a repo with pre-existing failures can never verify green.
- `--verify` paths: write them relative to the repo; absolute paths into the base repo are rewritten to the worktree. If something needs fixing, send a follow-up task instead of hand-editing large amounts.
- `status` = `partial`/`failed`/`budget_exceeded`/`stopped`: read `followups` and the tail of `attempts[-1]`. Then either split the task, raise the difficulty one step, or take the small remainder yourself.

## 5. Dynamic Workflow integration (parallel fan-out)

**Cost note (measured):** a 3-task workflow (3 haiku dispatchers + 3 Claude reviewers) spent ~295k Claude subagent tokens on trivial tasks. On Claude Pro, prefer the **main-loop pattern** for ≤5 tasks: `run --detach` each task, then one `Monitor` per run, then review in the main loop. Use the Workflow template when there are many tasks, a long batch, or the user explicitly wants workflow orchestration, and pass `"review": "delegate"` when Claude quota is tight.

When the user has opted into workflows, use `templates/openswarm-workflow.js` and pass it through `script` with args:
```json
{"repo": "/abs/repo", "maxParallel": <concurrency.codex from status>, "review": "<claude_review>",
 "tasks": [{"id": "t1", "title": "...", "prompt": "...", "type": "impl", "difficulty": 3, "budgetMinutes": 30}]}
```
Thin **haiku** dispatchers start each task, watch it until DONE, and stop it on dangerous RISK lines. Codex and the other executors do the coding. Claude review agents check each commit against its criteria while the other tasks are still running (pipeline, no barrier). The workflow returns a verdict per task. The main loop then merges accepted branches and re-dispatches `fix` items.
Workflow features you keep: phases, pipeline and parallel, resume (`resumeFromRunId`), budgets. Use `isolation: 'worktree'` only for agents that edit files themselves. openswarm already isolates executors.

## 6. Agent teams

In a team, make teammates **thin openswarm dispatchers**: each teammate owns a set of tasks, runs `openswarm run --detach` and `watch`, and reports a result per task. Keep one Claude teammate as the **reviewer or integrator**. Teammates must not run tasks that touch the same files at the same time. Use `$XS status` concurrency as the team-wide cap on executor runs in flight.

## 7. Routing rules (what `route` does)

- Order by type: review/audit → ocgo, then codex, then deepseek. Mechanical work at difficulty ≤2 → ocgo first. Everything else → codex, then ocgo, then deepseek.
- Difficulty sets tier and effort: 1 fast/low · 2 fast/medium · 3 balanced/medium · 4 balanced/high · 5 deep/high.
  - Codex tiers come from the live model descriptions: frontier = deep, workhorse = balanced, fast/affordable = fast. Legacy models are deprioritised.
  - OpenCode Go tiers are price terciles; within a tier the newest model wins.
- Quota adjustments:
  - Any window ≥95%: that backend is skipped.
  - ≥85%: difficulty ≤3 spills to other backends; harder tasks stay with effort −1.
  - Burn pace >1.25× of an even rate: effort −1.
  - Window resets within 24h with <60% used: effort +1, to use the quota before it expires.
- Codex `ultra` effort is never used. It self-delegates and blows budgets.
- Rate-limit errors open a 30-minute breaker for that model or limit and fall back to the next backend in the same worktree (reset first). Fallback is disabled when you force `--backend`.
- OpenCode Go: plan auto-detected (Go unless spend proves Plus). Per-model caps come from the docs table in `policy.json` (5h = 20%, 7d = 50%, 30d = 100% of the monthly cap). It only sees `opencode run` spend, not OpenCode Go traffic that goes through other clients or proxies.
- DeepSeek is used only when its balance is above the floor (¥10).
- `cursor` is opt-in. Routing never selects it unless `routing.default_order` lists `cursor`, or the run passes `--backend cursor`. The model is `--model` or `cursor.default_model` (`grok-4.7-high`). The run's `result.json` and ledger entry record `usage` (`inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens`) and wall-clock `seconds`. Quota for Cursor is unknown, so it does not affect the other backends' windows.
- `pi` is opt-in the same way (`--backend pi`, or list `pi` in `routing.default_order`). It runs `pi -p --mode json --tools read,bash,edit,write,grep,find,ls` in the worktree; `OPENSWARM_PI_BIN` may name a wrapper with the same flags. `--model` or `pi.default_model` picks the model, otherwise Pi's own default. `usage` (`input`, `output`, `cacheRead`, `cacheWrite`) is summed from Pi's `message_end` events. Quota is unknown.

Override anything in `~/.claude/openswarm/policy.local.json`, deep-merged over `policy.json`: thresholds, the difficulty map, exclude patterns, plan, model caps.

## 8. Safety
- **Credentials.** openswarm never reads another tool's auth file unless you opt in (`local_sources.codex_auth_plan`,
  `local_sources.claude_account_plan`). Prefer `OPENSWARM_CODEX_PLAN` / `OPENSWARM_CLAUDE_PLAN` and `DEEPSEEK_API_KEY`.
  See README "What openswarm reads on your machine".

- Executors get `workspace-write` sandbox (Codex) or edit/bash permission scoped to the worktree (opencode, `external_directory: deny`). They never commit; openswarm commits on the `openswarm/<id>` branch. Nothing is pushed.
- Do not put secrets in task prompts. Prompts and diffs go to the executor's model provider. Each backend's data boundary is listed in `backends/*.json`.
- `$XS stop <id>` kills the executor's process tree. The runner still finalizes, so partial work is committed and can be inspected.

## Files

- `bin/openswarm`: CLI (probe, status, route, run, watch, runs, report, stop, ingest-claude, ledger)
- `policy.json`: defaults · `backends/*.json`: harness manifests (x-agents style) · `templates/openswarm-workflow.js`: Workflow template · `tests/test_route.py`: routing scenarios
- `~/.claude/openswarm/`: `state.json`, `quota-claude.json`, `ledger.jsonl`, `breakers.json`, `runs/<id>/` (task, events, result, patch), `worktrees/`


## engineering task

Resolve the GitHub issue below in the pytest-dev/pytest repository, checked out in the current directory (<run>/10180038/openswarm/pytest-dev__pytest-10356/r1/repo).

The Python environment for this checkout is <run>/10180038/openswarm/pytest-dev__pytest-10356/r1/venv/bin/python (first on PATH as `python`); the project is installed in it in editable mode. Run tests with: <run>/10180038/openswarm/pytest-dev__pytest-10356/r1/venv/bin/python -m pytest -rA <test file>

Edit the non-test source files so the issue is resolved, keeping behaviour the issue does not ask to change.

<issue>
Consider MRO when obtaining marks for classes
When using pytest markers in two baseclasses `Foo` and `Bar`, inheriting from both of those baseclasses will lose the markers of one of those classes. This behavior is present in pytest 3-6, and I think it may as well have been intended. I am still filing it as a bug because I am not sure if this edge case was ever explicitly considered.

If it is widely understood that all markers are part of a single attribute, I guess you could say that this is just expected behavior as per MRO. However, I'd argue that it would be more intuitive to attempt to merge marker values into one, possibly deduplicating marker names by MRO.

```python
import itertools
import pytest

class BaseMeta(type):
    @property
    def pytestmark(self):
        return (
            getattr(self, "_pytestmark", []) +
            list(itertools.chain.from_iterable(getattr(x, "_pytestmark", []) for x in self.__mro__))
        )

    @pytestmark.setter
    def pytestmark(self, value):
        self._pytestmark = value


class Base(object):
    # Without this metaclass, foo and bar markers override each other, and test_dings
    # will only have one marker
    # With the metaclass, test_dings will have both
    __metaclass__ = BaseMeta

@pytest.mark.foo
class Foo(Base):
    pass


@pytest.mark.bar
class Bar(Base):
    pass

class TestDings(Foo, Bar):
    def test_dings(self):
        # This test should have both markers, foo and bar.
        # In practice markers are resolved using MRO (so foo wins), unless the
        # metaclass is applied
        pass
```

I'd expect `foo` and `bar` to be markers for `test_dings`, but this only actually is the case with this metaclass.

Please note that the repro case is Python 2/3 compatible excluding how metaclasses are added to `Base` (this needs to be taken care of to repro this issue on pytest 6)
Consider MRO when obtaining marks for classes
When using pytest markers in two baseclasses `Foo` and `Bar`, inheriting from both of those baseclasses will lose the markers of one of those classes. This behavior is present in pytest 3-6, and I think it may as well have been intended. I am still filing it as a bug because I am not sure if this edge case was ever explicitly considered.

If it is widely understood that all markers are part of a single attribute, I guess you could say that this is just expected behavior as per MRO. However, I'd argue that it would be more intuitive to attempt to merge marker values into one, possibly deduplicating marker names by MRO.

```python
import itertools
import pytest

class BaseMeta(type):
    @property
    def pytestmark(self):
        return (
            getattr(self, "_pytestmark", []) +
            list(itertools.chain.from_iterable(getattr(x, "_pytestmark", []) for x in self.__mro__))
        )

    @pytestmark.setter
    def pytestmark(self, value):
        self._pytestmark = value


class Base(object):
    # Without this metaclass, foo and bar markers override each other, and test_dings
    # will only have one marker
    # With the metaclass, test_dings will have both
    __metaclass__ = BaseMeta

@pytest.mark.foo
class Foo(Base):
    pass


@pytest.mark.bar
class Bar(Base):
    pass

class TestDings(Foo, Bar):
    def test_dings(self):
        # This test should have both markers, foo and bar.
        # In practice markers are resolved using MRO (so foo wins), unless the
        # metaclass is applied
        pass
```

I'd expect `foo` and `bar` to be markers for `test_dings`, but this only actually is the case with this metaclass.

Please note that the repro case is Python 2/3 compatible excluding how metaclasses are added to `Base` (this needs to be taken care of to repro this issue on pytest 6)
Fix missing marks when inheritance from multiple classes

<!--
Thanks for submitting a PR, your contribution is really appreciated!

Here is a quick checklist that should be present in PRs.

- [] Include documentation when adding new features.
- [ ] Include new tests or update existing tests when applicable.
- [X] Allow maintainers to push and squash when merging my commits. Please uncheck this if you prefer to squash the commits yourself.

If this change fixes an issue, please:

- [x] Add text like ``closes #XYZW`` to the PR description and/or commits (where ``XYZW`` is the issue number). See the [github docs](https://help.github.com/en/github/managing-your-work-on-github/linking-a-pull-request-to-an-issue#linking-a-pull-request-to-an-issue-using-a-keyword) for more information.

Unless your change is trivial or a small documentation fix (e.g., a typo or reword of a small section) please:

- [x] Create a new changelog file in the `changelog` folder, with a name like `<ISSUE NUMBER>.<TYPE>.rst`. See [changelog/README.rst](https://github.com/pytest-dev/pytest/blob/main/changelog/README.rst) for details.

  Write sentences in the **past or present tense**, examples:

  * *Improved verbose diff output with sequences.*
  * *Terminal summary statistics now use multiple colors.*

  Also make sure to end the sentence with a `.`.

- [x] Add yourself to `AUTHORS` in alphabetical order.
-->
</issue>

Implement it; run the relevant tests.
