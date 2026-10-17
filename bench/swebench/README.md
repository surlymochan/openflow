# SWE-bench Verified head-to-head (real GitHub issues)

Real-task companion to the synthetic `bench/e2e/` benchmark, whose 8 small tasks were too easy (the plain agent passed 24/24). Within each comparison, every arm uses the same agent harness and the same model, so the workflow is the only variable. Success = the official SWE-bench FAIL_TO_PASS and PASS_TO_PASS tests all pass after the agent exits.

## Results

### Scope

Six real GitHub issues from the 1-4 hour and >4 hour buckets: `pylint-dev__pylint-8898`, `pytest-dev__pytest-10356`, `pytest-dev__pytest-5787`, `pytest-dev__pytest-6197`, `sympy__sympy-14248` and `sympy__sympy-17630`. n = 1 run per (arm, instance) cell. Arms are compared only on the same model, never mixed within one instance. On MiniMax-M3.1-Flash-Preview the plan's usage cap was hit mid-matrix; openflow and openswarm have no run that finished cleanly, so the MiniMax table compares only baseline and superpowers, on the 4 instances where both finished cleanly.

### DeepSeek (deepseek-flash), all 4 arms

Model: deepseek-flash (DeepSeek-V4.1-Flash) via Pi; all 4 arms on all 6 instances; n=1 per cell

| Arm | Resolved (official tests) | Median wall-clock (IQR) | Median $ per task (deepseek) | Total $ all runs (deepseek) | Median tokens in+out | Median tokens incl. cache | n |
| --- | --- | --- | --- | --- | --- | --- | --- |
| baseline | **1/6 (17%)** | 124 s (110–175) | $0.0234 | $0.16 | 78,779 | 1,214,048 | 6 |
| superpowers | **0/6 (0%)** | 154 s (136–340) | $0.0285 | $0.31 | 85,122 | 1,468,328 | 6 |
| openflow | **2/6 (33%)** | 230 s (200–266) | $0.0412 | $0.23 | 105,793 | 3,148,993 | 6 |
| openswarm | **3/6 (50%)** | 228 s (187–254) | $0.0377 | $0.21 | 105,651 | 1,661,664 | 6 |

Same token counts at other list prices (computed, not billed):

| Arm | Claude Sonnet 5 list price (computed): median / total | GPT-6.1 Sol list price (computed): median / total |
| --- | --- | --- |
| baseline | $0.514 / $4.08 | $0.410 / $3.08 |
| superpowers | $0.626 / $9.87 | $0.506 / $6.62 |
| openflow | $1.108 / $6.33 | $0.803 / $4.54 |
| openswarm | $0.820 / $4.68 | $0.665 / $3.73 |

Per instance (resolved / runs):

| Instance | baseline | superpowers | openflow | openswarm |
| --- | --- | --- | --- | --- |
| `pylint-dev__pylint-8898` | 0/1 | 0/1 | 1/1 | 1/1 |
| `pytest-dev__pytest-10356` | 0/1 | 0/1 | 0/1 | 0/1 |
| `pytest-dev__pytest-5787` | 0/1 | 0/1 | 0/1 | 0/1 |
| `pytest-dev__pytest-6197` | 0/1 | 0/1 | 0/1 | 0/1 |
| `sympy__sympy-14248` | 1/1 | 0/1 | 1/1 | 1/1 |
| `sympy__sympy-17630` | 0/1 | 0/1 | 0/1 | 1/1 |

Timed out (20 min cap): baseline 0, superpowers 0, openflow 0, openswarm 0
Guard blocks: baseline 1, superpowers 1, openflow 2, openswarm 0
Rate-limit (429) retries inside Pi: baseline 0 in 0 runs; superpowers 0 in 0 runs; openflow 0 in 0 runs; openswarm 0 in 0 runs
Runs whose last model call ended in an error: baseline 0; superpowers 0; openflow 0; openswarm 0
Harness errors excluded from n: 0

### MiniMax-M3.1-Flash-Preview, baseline vs superpowers only

Model: MiniMax-M3.1-Flash-Preview via Pi; baseline vs superpowers only, on the 4 instances where both finished cleanly; openflow and openswarm have no clean MiniMax run (usage cap); n=1 per cell

| Arm | Resolved (official tests) | Median wall-clock (IQR) | Median $ per task (minimax) | Total $ all runs (minimax) | Median tokens in+out | Median tokens incl. cache | n |
| --- | --- | --- | --- | --- | --- | --- | --- |
| baseline | **2/4 (50%)** | 845 s (436–1201) | $0.1467 | $0.60 | 63,081 | 1,787,144 | 4 |
| superpowers | **2/4 (50%)** | 561 s (448–797) | $0.1174 | $0.47 | 66,548 | 1,417,802 | 4 |

Same token counts at other list prices (computed, not billed):

| Arm | Claude Sonnet 5 list price (computed): median / total | GPT-6.1 Sol list price (computed): median / total |
| --- | --- | --- |
| baseline | $0.688 / $2.83 | $0.516 / $2.13 |
| superpowers | $0.546 / $2.16 | $0.412 / $1.60 |

Per instance (resolved / runs):

| Instance | baseline | superpowers |
| --- | --- | --- |
| `pytest-dev__pytest-10356` | 0/1 | 0/1 |
| `pytest-dev__pytest-5787` | 0/1 | 0/1 |
| `sympy__sympy-14248` | 1/1 | 1/1 |
| `sympy__sympy-17630` | 1/1 | 1/1 |

Timed out (20 min cap): baseline 2, superpowers 1
Guard blocks: baseline 1, superpowers 1
Rate-limit (429) retries inside Pi: baseline 2 in 2 runs; superpowers 4 in 4 runs
Runs whose last model call ended in an error: baseline 0; superpowers 0
Harness errors excluded from n: 0
Excluded as incomplete: 6 runs

## Discarded and rerun runs

Runs were discarded because of harness bugs, not outcomes, and rerun:

- First DeepSeek launch passed a relative results path, so every grade failed to apply the test patch; all cells were discarded and rerun.
- openswarm's executor did not receive the DeepSeek key (the harness stripped it), so the executor never ran; all 6 openswarm cells were rerun.
- openflow on `pylint-dev__pylint-8898` crashed the runner on a non-UTF-8 file in the diff; rerun.
- openswarm on `pylint-dev__pylint-8898` read earlier runs' official test patch and grades from the results directory (contamination); discarded and rerun once with all earlier results made unreadable. The rerun resolved without touching them.

Set-aside records are in `results/aside/`.

## Leak review

The automatic leak scan in `report.py` flags tool calls that mention upstream hosts, package caches or other results. Each hit was read by hand (script: tool-call command + first 300 chars of its result).

- Network (`pip download`, `curl`/`urlopen` to github.com, raw.githubusercontent.com, api.github.com, pypi.org): every attempt failed (proxy 127.0.0.1:9, `PIP_NO_INDEX`, or Pi guard). No content came back.
- `site-packages/<pkg>` lookups: no system copy found; no content.
- `~/.cache/uv`: agents on the three pytest instances read newer pytest releases (6.2.5, 7.4.4, 8.4.2) unpacked in the shared uv cache. Newer releases can contain the upstream fix. No pytest instance was resolved by any arm on DeepSeek (0/12 cells across 10356, 5787, 6197 for every arm), so this did not produce a resolve. It is a known gap: the uv cache was not locked during runs. Same gap applies to the MiniMax runs.
- `bench-swe/results`: openswarm / `pylint-dev__pylint-8898` (first DeepSeek attempt) read the MiniMax runs' official `test.patch`, `grade.json` and the baseline `solution.diff`; that run resolved, was discarded (moved to `results/aside/`) and rerun once with every earlier result dir and file chmod 000; the rerun touched no result files and resolved again (114 s), and the table uses the rerun. superpowers / `sympy__sympy-14248` grepped `results/*.jsonl` and saw another run's metadata (resolved flag, diff line count), no patch; that run did not resolve and was kept. openswarm / `pytest-dev__pytest-5787` listed file names in `results/raw`; no content read, not resolved, kept.

## Tasks

Dataset `princeton-nlp/SWE-bench_Verified`, Hugging Face revision `c104f840cc67f8b6eec6f759ebc8b2693d585d4a`, split `test`. Instance ids are in `instances.json`.

Round 1: a seeded shuffle (seed 20261017) over the "<15 min fix" and "15 min - 1 hour" buckets of sympy, pytest and pylint gave 12 instances. The plain agent resolved 12/12 on its first pass, so by the rule fixed in advance (replace the set if the baseline solves more than 80%) the set was replaced. Round-1 records: `results/round1-easy-baseline.jsonl`.

Round 2 (used for every arm): all 12 Verified instances of sympy, pytest and pylint in the "1-4 hours" and ">4 hours" buckets. All 12 pass the gold-patch check (`harness/validate.py`: the empty patch is not resolved, the gold patch is). Only 6 of the 12 are counted in the Results section: the MiniMax usage cap stopped the matrix on the six instances that were already in progress, and the other 6 have no counted runs.

| id | repo | difficulty |
| --- | --- | --- |
| sympy__sympy-12489 | sympy | 1-4 hours |
| sympy__sympy-13852 | sympy | 1-4 hours |
| sympy__sympy-13878 | sympy | 1-4 hours |
| sympy__sympy-14248 | sympy | 1-4 hours |
| sympy__sympy-16597 | sympy | 1-4 hours |
| sympy__sympy-17630 | sympy | 1-4 hours |
| sympy__sympy-18199 | sympy | >4 hours |
| pytest-dev__pytest-10356 | pytest | 1-4 hours |
| pytest-dev__pytest-5787 | pytest | 1-4 hours |
| pytest-dev__pytest-6197 | pytest | 1-4 hours |
| pylint-dev__pylint-4551 | pylint | 1-4 hours |
| pylint-dev__pylint-8898 | pylint | 1-4 hours |

## Environment (no Docker)

- Per run: the tree at `base_commit` is extracted with `git archive` and committed as a single `baseline` commit with no history, so the upstream fix is not in the git objects.
- Per run: a fresh `uv` venv with the Python version, pinned packages and install command from the `swebench` package 3.0.17 (`MAP_REPO_VERSION_TO_SPECS`); the project is installed editable.
- While agents run, the upstream mirrors and the dataset file are made unreadable (mode 000); the runner keeps the rows in memory.
- The agent's shell has no package-index or web access: proxy variables point at a closed local port and `PIP_NO_INDEX`/`UV_OFFLINE` are set; only the model API host is exempt. An earlier pass without this block was discarded because agents tried `pip download` of newer releases and fetched files from GitHub (`results/excluded-network-open.jsonl`, not counted).
- `report.py` scans every tool call for markers such as mirror paths, the dataset file, PyPI, GitHub or `pip download` and prints the hits.

## Grading

After the agent exits: test files touched by the official `test_patch` are restored, the `test_patch` is applied, the official test directives run with the official log parser from `swebench`, and the run counts as resolved only if every FAIL_TO_PASS and PASS_TO_PASS test passes. The agent never sees these tests or the gold patch. Code: `harness/swe_env.py` (`grade`).

## Model and harness

- All model calls go through one wrapper script around the Pi coding agent (Pi 0.73.1), with model `MiniMax-M3.1-Flash-Preview` or `deepseek-flash` (served as DeepSeek-V4.1-Flash), effort `medium`, tools read, bash, edit, write, grep, find, ls. The wrapper adds the same short safety preamble to every prompt and blocks pushes, credential reads and similar commands.
- 20-minute wall-clock cap per run.
- Shared prompt: repository path, Python path, how to run tests, the issue text, and "Implement it; run the relevant tests." (`harness/arms.py`, `base_prompt`).

## Arms

| Arm | What differs |
| --- | --- |
| baseline | The shared prompt only. |
| superpowers v7.0.0 (`bb92a77`) | superpowers ships a Pi package that registers its `skills/` directory and injects the `using-superpowers` bootstrap at session start. The wrapper runs Pi with extensions and skill discovery off, so the arm puts the same two pieces of text at the top of the prompt: Pi's own `<available_skills>` list for the 15 superpowers skills (name, description, path) and the bootstrap message built exactly as `.pi/extensions/superpowers.ts` builds it. Plus the line "Use the installed skills for this change." |
| openflow 0.2.1 (npm tarball sha256 `49d17f9af87c04a85fe4fb4395da7b64249da65a5701fe22f1f44600e171b03f`) | `xflow` on PATH, `xflow init --project-root`, and an `AGENTS.md` project entry (Pi loads `AGENTS.md` from the working directory; this is the Pi counterpart of the Cursor project rule used in `bench/e2e/`). The install commit is excluded from the solution diff. Plus "Use the installed workflow tool for this change." |
| openswarm (new opt-in `--backend pi`) | A planner Pi call (5-minute cap) reads `SKILL.md` and the task and writes an executor task file and one check command; then `openswarm run --backend pi --no-worktree --verify <check>` runs the executor with the rest of the 20 minutes. A small shim (`harness/pi_shim.sh`) sends openswarm's Pi call through the same wrapper. `--no-worktree` is used because the editable install points at the checkout, so tests run in a separate worktree would import the unmodified code; each run already has its own checkout. |
| oh-my-openagent v5.1.35 (`0777686`) | Not run. It is an OpenCode plugin with its own provider logins; it cannot be routed through the Pi wrapper that every arm must use, and paid APIs were out of scope. |

## Cost

- Token counts come from Pi's `message_end` usage events (input, output, cache read, cache write). Dollar figures multiply them by `prices.json`.
- MiniMax sells MiniMax-M3.1-Flash-Preview only in subscription plans and publishes no per-token price for it, so the table uses the MiniMax-M3 Standard list price ($0.30 input, $1.20 output, $0.06 cache read per 1M tokens, <=512k input) from https://platform.minimax.io/docs/pricing/overview, fetched 2026-10-17. The actual runs were billed to a subscription plan.
- DeepSeek rows use DeepSeek's own list price (off-peak: $0.15 cache-miss input, $0.60 output, $0.003 cache-hit input per 1M tokens; the runs were on a Sunday, off-peak all day; https://api-docs.deepseek.com/quick_start/pricing, fetched 2026-10-18).
- The same token counts are also priced at Claude Sonnet 5 and GPT-6.1 Sol list prices. Those columns are computed, not billed.

## Caveats

- The model is a fast preview model; absolute resolve rates are low and say little about other models.
- n = 1 run on 6 instances (not 3 repeats on 12); differences of one or two resolved runs are within noise.
- The subscription plan's rate limit (HTTP 429) was hit during the runs; Pi retries automatically. Retries add wall-clock time; `tables.md` reports how many retries each arm saw.
- The superpowers and openflow integrations are prompt/context equivalents of their Pi or Cursor entry points, not the packages' own loaders, because the wrapper disables Pi extensions.

## Layout

| Path | Contents |
| --- | --- |
| `run.py` | Matrix runner, resumable |
| `harness/swe_env.py` | Checkout, env, grading |
| `harness/arms.py` | Arms |
| `harness/pi_shim.sh` | Shim for openswarm's Pi call |
| `harness/validate.py` | Gold-patch check |
| `report.py` | summary.json, tables.md, leak scan |
| `prices.json` | Token prices |
| `instances.json` | Instance ids |
| `results/runs.jsonl` | One record per run |
| `results/runs-deepseek.jsonl` | One record per DeepSeek run |
| `results/raw/<arm>/<instance>/r<n>/` | Prompts, Pi event logs with streaming fragments removed, solution.diff, grade/ |
| `results/raw-deepseek/<arm>/<instance>/r<n>/` | Prompts, Pi event logs, solution.diff, grade/ for DeepSeek |
| `results/deepseek/` | summary.json, tables.md, leak scan for the DeepSeek matrix |
| `results/minimax/` | summary.json, tables.md and `validity.jsonl` for the MiniMax subset |
| `results/aside/` | Runs discarded for harness bugs or contamination |
| `validity.py` | MiniMax run-validity classifier |

Host paths are replaced by placeholders such as `<run>/` and `<bench>/`.

## Reproduce

```
uv venv .venv -p 3.12 && uv pip install --python .venv/bin/python pandas pyarrow "swebench==3.0.17"
# fetch data/verified.parquet at the pinned revision and mirror the three repos into repos/
.venv/bin/python harness/validate.py <instance ids>
.venv/bin/python run.py --arms baseline,superpowers,openflow,openswarm --reps 3 --jobs 6
.venv/bin/python report.py results/runs.jsonl

# DeepSeek matrix (the wrapper's default provider is deepseek).
# --only: pylint-dev__pylint-8898,pytest-dev__pytest-10356,pytest-dev__pytest-5787,pytest-dev__pytest-6197,sympy__sympy-14248,sympy__sympy-17630
.venv/bin/python run.py --arms baseline,superpowers,openflow,openswarm --reps 1 --jobs 6 --only <the 6 ids> --out $PWD/results/runs-deepseek.jsonl --raw-root $PWD/results/raw-deepseek --label ds
.venv/bin/python report.py results/runs-deepseek.jsonl --out results/deepseek --raw results/raw-deepseek --price deepseek --model-label "<label>"

# MiniMax subset: classify validity, then report only the 4 instances where both arms finished cleanly.
python3 validity.py --runs results/runs.jsonl --pi-log <wrapper log> --raw results/raw --out results/minimax/validity.jsonl --expected-arms baseline,superpowers,openflow,openswarm --expected-instances <the 6 ids>
.venv/bin/python report.py results/runs.jsonl --out results/minimax --price minimax --only-instances pytest-dev__pytest-10356,pytest-dev__pytest-5787,sympy__sympy-14248,sympy__sympy-17630 --exclude results/minimax/validity.jsonl --model-label "<label>"
```
