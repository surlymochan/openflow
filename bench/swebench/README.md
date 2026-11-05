# SWE-bench Verified head-to-head (real GitHub issues)

_Naming note: these results were measured before the rename, when the tools were called OpenFlow and openswarm. Product names in this document have been unified to the current names (evalid and swrm); versions and all figures are the original measurements._

Real-task companion to the synthetic `bench/e2e/` benchmark, whose 8 small tasks were too easy (the plain agent passed 24/24). Within each comparison, every arm uses the same agent harness and the same model, so the workflow is the only variable. Success = the official SWE-bench FAIL_TO_PASS and PASS_TO_PASS tests all pass after the agent exits.

## Results

### Scope

Six real GitHub issues from the "1-4 hours" bucket: `pylint-dev__pylint-8898`, `pytest-dev__pytest-10356`, `pytest-dev__pytest-5787`, `pytest-dev__pytest-6197`, `sympy__sympy-14248` and `sympy__sympy-17630`. n = 1 run per (arm, instance) cell. Arms are compared only on the same model, never mixed within one instance. On MiniMax-M3.1-Flash-Preview the plan's usage cap was hit mid-matrix; evalid and swrm have no run that finished cleanly, so the MiniMax table compares only baseline and superpowers, on the 4 instances where both finished cleanly.

### DeepSeek (deepseek-flash), all 4 arms

Model: deepseek-flash (DeepSeek-V4.1-Flash) via Pi; all 4 arms on all 6 instances; n=1 per cell; regraded with per-run TMPDIR

| Arm | Resolved (official tests) | Median wall-clock (IQR) | Median $ per task (deepseek) | Total $ all runs (deepseek) | Median tokens in+out | Median tokens incl. cache | n |
| --- | --- | --- | --- | --- | --- | --- | --- |
| baseline | **3/6 (50%)** | 124 s (110–175) | $0.0234 | $0.16 | 78,779 | 1,214,048 | 6 |
| superpowers | **2/6 (33%)** | 154 s (136–340) | $0.0285 | $0.31 | 85,122 | 1,468,328 | 6 |
| evalid | **4/6 (67%)** | 230 s (200–266) | $0.0412 | $0.23 | 105,793 | 3,148,993 | 6 |
| swrm | **5/6 (83%)** | 228 s (187–254) | $0.0377 | $0.21 | 105,651 | 1,661,664 | 6 |

Same token counts at other list prices (computed, not billed):

| Arm | Claude Sonnet 5 list price (computed): median / total | GPT-6.1 Sol list price (computed): median / total |
| --- | --- | --- |
| baseline | $0.514 / $4.08 | $0.410 / $3.08 |
| superpowers | $0.626 / $9.87 | $0.506 / $6.62 |
| evalid | $1.108 / $6.33 | $0.803 / $4.54 |
| swrm | $0.820 / $4.68 | $0.665 / $3.73 |

Per instance (resolved / runs):

| Instance | baseline | superpowers | evalid | swrm |
| --- | --- | --- | --- | --- |
| `pylint-dev__pylint-8898` | 0/1 | 0/1 | 1/1 | 1/1 |
| `pytest-dev__pytest-10356` | 0/1 | 0/1 | 0/1 | 0/1 |
| `pytest-dev__pytest-5787` | 1/1 | 1/1 | 1/1 | 1/1 |
| `pytest-dev__pytest-6197` | 1/1 | 1/1 | 1/1 | 1/1 |
| `sympy__sympy-14248` | 1/1 | 0/1 | 1/1 | 1/1 |
| `sympy__sympy-17630` | 0/1 | 0/1 | 0/1 | 1/1 |

Timed out (20 min cap): baseline 0, superpowers 0, evalid 0, swrm 0
Guard blocks: baseline 1, superpowers 1, evalid 2, swrm 0
Rate-limit (429) retries inside Pi: baseline 0 in 0 runs; superpowers 0 in 0 runs; evalid 0 in 0 runs; swrm 0 in 0 runs
Runs whose last model call ended in an error: baseline 0; superpowers 0; evalid 0; swrm 0
Harness errors excluded from n: 0

### MiniMax-M3.1-Flash-Preview, baseline vs superpowers only

Model: MiniMax-M3.1-Flash-Preview via Pi; baseline vs superpowers only, on the 4 instances where both finished cleanly; evalid and swrm have no clean MiniMax run (usage cap); n=1 per cell; regraded with per-run TMPDIR

| Arm | Resolved (official tests) | Median wall-clock (IQR) | Median $ per task (minimax) | Total $ all runs (minimax) | Median tokens in+out | Median tokens incl. cache | n |
| --- | --- | --- | --- | --- | --- | --- | --- |
| baseline | **3/4 (75%)** | 845 s (436–1201) | $0.1467 | $0.60 | 63,081 | 1,787,144 | 4 |
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
| `pytest-dev__pytest-5787` | 1/1 | 0/1 |
| `sympy__sympy-14248` | 1/1 | 1/1 |
| `sympy__sympy-17630` | 1/1 | 1/1 |

Timed out (20 min cap): baseline 2, superpowers 1
Guard blocks: baseline 1, superpowers 1
Rate-limit (429) retries inside Pi: baseline 2 in 2 runs; superpowers 4 in 4 runs
Runs whose last model call ended in an error: baseline 0; superpowers 0
Harness errors excluded from n: 0
Excluded as incomplete: 6 runs

## Regrade (2026-10-18)

The first published tables (2026-10-18 00:5x) undercounted pytest. All concurrent grades shared `/tmp/pytest-of-<user>`; pytest's temp-dir cleanup raced between runs, so PASS_TO_PASS tests errored in setup no matter what the patch did. The harness now gives every grade its own `TMPDIR` (and `PYTEST_DEBUG_TEMPROOT`). All saved patches were regraded (`regrade.py`; no new agent runs).

Evidence: with the empty patch, `pytest-6197` PASS_TO_PASS went from 2/145 to 145/145 and `pytest-5787` from 58/123 to 123/123. Changes on DeepSeek: `pytest-5787` and `pytest-6197` became resolved for all four arms. Changes on the MiniMax table: baseline `pytest-5787` became resolved. sympy and pylint results did not change.

Second regrade detail: on `pytest-10356` and `pytest-5787`, evalid's `solution.diff` also contained about 900–1,200 workflow-evidence files under `specs/changes/` (up to 6.8 MB); `git apply` rejected the whole patch, so those two cells were graded unpatched at first. They were regraded with the `specs/` file sections removed (the harness already excludes `.xflow/` the same way): `pytest-5787` resolved, `pytest-10356` not. Record: `results/regrade-deepseek-openflow-nospecs.jsonl`.

Records: `results/runs-deepseek-regraded.jsonl`, `results/regrade-*.jsonl` and `results/raw-deepseek/<arm>/<instance>/r1/regrade/`. The 6.8 MB diff is now stored as `solution.diff.gz` with `solution.diff.sha256`.

Reproduce the regrade:

```
.venv/bin/python regrade.py --runs results/runs-deepseek.jsonl --raw $PWD/results/raw-deepseek --out $PWD/results/regrade-deepseek.jsonl --label deepseek --jobs 3
python3 apply_regrade.py --runs results/runs-deepseek.jsonl --regrade results/regrade-deepseek.jsonl --regrade results/regrade-deepseek-openflow-nospecs.jsonl --out results/runs-deepseek-regraded.jsonl
.venv/bin/python report.py results/runs-deepseek-regraded.jsonl <same flags as before>
```

For MiniMax: regrade `--only-repos pytest-dev/pytest` into `results/regrade-minimax-pytest.jsonl`, the table's sympy cells into `results/regrade-minimax-sympy.jsonl`, `apply_regrade` into `results/runs-minimax-regraded.jsonl`, then `report.py` on that.

## Discarded and rerun runs

Runs were discarded because of harness bugs, not outcomes, and rerun:

- First DeepSeek launch passed a relative results path, so every grade failed to apply the test patch; all cells were discarded and rerun.
- swrm's executor did not receive the DeepSeek key (the harness stripped it), so the executor never ran; all 6 swrm cells were rerun.
- evalid on `pylint-dev__pylint-8898` crashed the runner on a non-UTF-8 file in the diff; rerun.
- swrm on `pylint-dev__pylint-8898` read earlier runs' official test patch and grades from the results directory (contamination); discarded and rerun once with all earlier results made unreadable. The rerun resolved without touching them.

Set-aside records are in `results/aside/`.

## Leak review

The automatic leak scan in `report.py` flags tool calls that mention upstream hosts, package caches or other results. Each hit was read by hand (script: tool-call command + first 300 chars of its result).

- Network (`pip download`, `curl`/`urlopen` to github.com, raw.githubusercontent.com, api.github.com, pypi.org): every attempt failed (proxy 127.0.0.1:9, `PIP_NO_INDEX`, or Pi guard). No content came back.
- `site-packages/<pkg>` lookups: no system copy found; no content.
- `~/.cache/uv`: agents on the three pytest instances read newer pytest releases (6.2.5, 7.4.4, 8.4.2) unpacked in the shared uv cache. Newer releases can contain the upstream fix. `pytest-5787` and `pytest-6197` were resolved by all arms, and newer pytest sources were readable in the uv cache, so those two resolves cannot be ruled out as influenced by it. This is tracked in the optimization backlog issues. It is a known gap: the uv cache was not locked during runs. Same gap applies to the MiniMax runs.
- `bench-swe/results`: swrm / `pylint-dev__pylint-8898` (first DeepSeek attempt) read the MiniMax runs' official `test.patch`, `grade.json` and the baseline `solution.diff`; that run resolved, was discarded (moved to `results/aside/`) and rerun once with every earlier result dir and file chmod 000; the rerun touched no result files and resolved again (114 s), and the table uses the rerun. superpowers / `sympy__sympy-14248` grepped `results/*.jsonl` and saw another run's metadata (resolved flag, diff line count), no patch; that run did not resolve and was kept. swrm / `pytest-dev__pytest-5787` listed file names in `results/raw`; no content read, not resolved, kept.

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

Round 3 (issue #5 P2-2, set for the next rerun; no counted runs yet): the set grows to 15 — the compared 6, the other 6 round-2 instances, plus 3 drawn from the "15 min - 1 hour" bucket (the harder buckets hold no more instances of these repos): sorted candidate ids (49, excluding the round-2 and round-1 sets), pooled shuffle with the house seed 20261017, first 3. The next full round runs 15 instances × `--reps 3`, i.e. n = 45 runs per arm. The 3 additions still need the gold-patch check (`harness/validate.py`) in the bench environment before their first counted run; the Results tables above remain the 6-instance round.

| id | repo | difficulty |
| --- | --- | --- |
| sympy__sympy-15599 | sympy | 15 min - 1 hour |
| sympy__sympy-19040 | sympy | 15 min - 1 hour |
| sympy__sympy-24213 | sympy | 15 min - 1 hour |

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
| evalid 0.2.1 (npm tarball sha256 `49d17f9af87c04a85fe4fb4395da7b64249da65a5701fe22f1f44600e171b03f`) | `xflow` on PATH, `xflow init --project-root`, and an `AGENTS.md` project entry (Pi loads `AGENTS.md` from the working directory; this is the Pi counterpart of the Cursor project rule used in `bench/e2e/`). The install commit is excluded from the solution diff. Plus "Use the installed workflow tool for this change." |
| swrm (new opt-in `--backend pi`) | A planner Pi call (5-minute cap) reads `SKILL.md` and the task and writes an executor task file and one check command; then `openswarm run --backend pi --no-worktree --verify <check>` runs the executor with the rest of the 20 minutes. A small shim (`harness/pi_shim.sh`) sends swrm's Pi call through the same wrapper. `--no-worktree` is used because the editable install points at the checkout, so tests run in a separate worktree would import the unmodified code; each run already has its own checkout. |
| oh-my-openagent v5.1.35 (`0777686`) | Not run. It is an OpenCode plugin with its own provider logins; it cannot be routed through the Pi wrapper that every arm must use, and paid APIs were out of scope. |

## Cost

- Token counts come from Pi's `message_end` usage events (input, output, cache read, cache write). Dollar figures multiply them by `prices.json`.
- MiniMax sells MiniMax-M3.1-Flash-Preview only in subscription plans and publishes no per-token price for it, so the table uses the MiniMax-M3 Standard list price ($0.30 input, $1.20 output, $0.06 cache read per 1M tokens, <=512k input) from https://platform.minimax.io/docs/pricing/overview, fetched 2026-10-17. The actual runs were billed to a subscription plan.
- DeepSeek rows use DeepSeek's own list price (off-peak: $0.15 cache-miss input, $0.60 output, $0.003 cache-hit input per 1M tokens; the runs were on a Sunday, off-peak all day; https://api-docs.deepseek.com/quick_start/pricing, fetched 2026-10-18).
- The same token counts are also priced at Claude Sonnet 5 and GPT-6.1 Sol list prices. Those columns are computed, not billed.

## Caveats

- Both models are fast, cheap models; resolve rates say little about stronger models.
- n = 1 run on 6 instances (not 3 repeats on 12); differences of one or two resolved runs are within noise.
- After the regrade, `pytest-5787` and `pytest-6197` were resolved by all four arms; `pytest-10356` is unresolved by every arm.
- The subscription plan's rate limit (HTTP 429) was hit during the runs; Pi retries automatically. Retries add wall-clock time; `tables.md` reports how many retries each arm saw.
- The superpowers and evalid integrations are prompt/context equivalents of their Pi or Cursor entry points, not the packages' own loaders, because the wrapper disables Pi extensions.

## Layout

| Path | Contents |
| --- | --- |
| `run.py` | Matrix runner, resumable; also exports saved patches as official predictions |
| `harness/predictions.py` | Official SWE-bench predictions builder/writer (live and saved-patch paths) |
| `harness/swe_env.py` | Checkout, env, grading |
| `harness/arms.py` | Arms |
| `harness/pi_shim.sh` | Shim for swrm's Pi call |
| `harness/validate.py` | Gold-patch check |
| `report.py` | summary.json, tables.md, leak scan |
| `regrade.py` | Regrade saved patches with per-run `TMPDIR` |
| `apply_regrade.py` | Merge regrade records into run records |
| `prices.json` | Token prices |
| `instances.json` | Instance ids |
| `results/runs.jsonl` | One record per run |
| `results/runs-deepseek.jsonl` | One record per DeepSeek run |
| `results/runs-*-regraded.jsonl` | Merged run records after regrade |
| `results/regrade-*.jsonl` | Per-model regrade records |
| `results/raw/<arm>/<instance>/r<n>/` | Prompts, Pi event logs with streaming fragments removed, solution.diff, grade/ |
| `results/raw-deepseek/<arm>/<instance>/r<n>/` | Prompts, Pi event logs, solution.diff, grade/ for DeepSeek (`solution.diff.gz` + `solution.diff.sha256` for diffs over 5 MB) |
| `results/raw-deepseek/<arm>/<instance>/r<n>/regrade/` | Regrade logs and grades for DeepSeek |
| `results/deepseek/` | summary.json, tables.md, leak scan for the DeepSeek matrix |
| `results/minimax/` | summary.json, tables.md and `validity.jsonl` for the MiniMax subset |
| `results/aside/` | Runs discarded for harness bugs or contamination |
| `validity.py` | MiniMax run-validity classifier |

Host paths are replaced by placeholders such as `<run>/` and `<bench>/`.

## Official predictions

`run.py` emits SWE-bench's official predictions format while a matrix runs:
each completed cell's patch is written to a per-arm JSONL whose lines have exactly
`instance_id`, `model_name_or_path` and `model_patch`, with the patch passed
through the evidence filter again before writing. The default output
directory is paired with the raw tree (`results/raw` → `results/predictions`,
`results/raw-deepseek` → `results/predictions-deepseek`); `--predictions-dir`
overrides it. Rep 1 files are named `preds-<arm>-filtered.jsonl`; later reps
get a `-r<n>` suffix so instance ids stay unique per file.

`model_name_or_path` is `<arm>+<public model label>`. Pi's recorded
`deepseek/deepseek-flash` id maps to the pilot's public label
`deepseek-v4.1-flash(pi)`; pass `--prediction-model '<label>'` to set the
label explicitly (required when rebuilding saved patches, whose raw tree
carries no model record).

Saved patches can be rebuilt through the same code path without running any
models (plain and gzipped `solution.diff` files are both handled):

```
python3 run.py --export-predictions --arms baseline,superpowers,openflow,openswarm \
  --raw-root $PWD/results/raw-deepseek \
  --predictions-dir $PWD/results/predictions-deepseek \
  --prediction-model "deepseek-v4.1-flash(pi)"
```

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
