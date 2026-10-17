Model: MiniMax-M3.1-Flash-Preview via Pi; baseline vs superpowers only, on the 4 instances where both finished cleanly; openflow and openswarm have no clean MiniMax run (usage cap); n=1 per cell; regraded with per-run TMPDIR

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
Leak scan (tool calls touching upstream mirrors, dataset or other results): {'baseline/pytest-dev__pytest-5787/r1': ['github.com/pytest-dev'], 'baseline/pytest-dev__pytest-6197/r1': ['.cache/uv', 'pip download'], 'baseline/pylint-dev__pylint-4551/r1': ['pip download'], 'baseline/pylint-dev__pylint-8898/r1': ['github.com/pylint-dev', 'pip download'], 'superpowers/sympy__sympy-12489/r1': ['github.com/sympy'], 'superpowers/pytest-dev__pytest-6197/r1': ['.cache/pip', '.cache/uv', 'pip download'], 'superpowers/pylint-dev__pylint-8898/r1': ['github.com/pylint-dev', 'pypi.org', 'raw.githubusercontent.com'], 'openflow/sympy__sympy-14248/r1': ['pip download']}
Excluded as incomplete: 6 runs
