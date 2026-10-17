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
Leak scan (tool calls touching upstream mirrors, dataset or other results): {'baseline/pytest-dev__pytest-10356/r1': ['.cache/uv'], 'baseline/pytest-dev__pytest-5787/r1': ['.cache/uv'], 'baseline/sympy__sympy-14248/r1': ['api.github.com', 'site-packages/sympy'], 'baseline/pytest-dev__pytest-6197/r1': ['.cache/uv', 'pip download'], 'baseline/pylint-dev__pylint-8898/r1': ['.cache/pip', '.cache/uv', 'pip download', 'raw.githubusercontent.com', 'site-packages/pylint'], 'superpowers/sympy__sympy-14248/r1': ['.cache/uv', 'bench-swe/results', 'pip download', 'site-packages/sympy'], 'superpowers/pytest-dev__pytest-10356/r1': ['.cache/pip', '.cache/uv'], 'superpowers/pytest-dev__pytest-6197/r1': ['.cache/uv', 'pip download'], 'openflow/sympy__sympy-14248/r1': ['raw.githubusercontent.com'], 'openflow/sympy__sympy-17630/r1': ['site-packages/sympy'], 'openflow/pytest-dev__pytest-10356/r1': ['.cache/uv'], 'openflow/pytest-dev__pytest-6197/r1': ['.cache/uv', 'pip download', 'pypi.org'], 'openswarm/sympy__sympy-17630/r1': ['raw.githubusercontent.com'], 'openswarm/pytest-dev__pytest-10356/r1': ['raw.githubusercontent.com'], 'openswarm/pytest-dev__pytest-5787/r1': ['.cache/uv', 'bench-swe/results', 'github.com/pytest-dev'], 'openswarm/pytest-dev__pytest-6197/r1': ['.cache/uv', 'pip download']}
