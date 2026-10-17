# Leak-scan review, DeepSeek matrix (hand acceptance)

The automatic leak scan in report.py flags tool calls that mention upstream hosts, package caches or other results. Each hit was read by hand (script: tool-call command + first 300 chars of its result).

- Network (`pip download`, `curl`/`urlopen` to github.com, raw.githubusercontent.com, api.github.com, pypi.org): every attempt failed (proxy 127.0.0.1:9, `PIP_NO_INDEX`, or Pi guard). No content came back.
- `site-packages/<pkg>` lookups: no system copy found; no content.
- `~/.cache/uv`: agents on the three pytest instances read newer pytest releases (6.2.5, 7.4.4, 8.4.2) unpacked in the shared uv cache. Newer releases can contain the upstream fix. No pytest instance was resolved by any arm on DeepSeek (0/12 cells across 10356, 5787, 6197 for every arm), so this did not produce a resolve. It is a known gap: the uv cache was not locked during runs. Same gap applies to the MiniMax runs.
- `bench-swe/results`:
  - openswarm / pylint-dev__pylint-8898 (first DeepSeek attempt) read the MiniMax runs' official `test.patch`, `grade.json` and the baseline `solution.diff`. That run resolved. It was discarded (moved to results/aside/) and rerun once with every earlier result dir and file chmod 000. The rerun touched no result files and resolved again (114 s). The table uses the rerun.
  - superpowers / sympy__sympy-14248 grepped results/*.jsonl and saw another run's metadata (resolved flag, diff line count), no patch. That run did not resolve; kept.
  - openswarm / pytest-dev__pytest-5787 listed file names in results/raw; no content read; not resolved; kept.
