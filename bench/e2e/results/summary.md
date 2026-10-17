# End-to-end task completion

## Environment

- Date: 2026-10-17T12:20:16.509195+00:00
- OS: Linux-6.12.94+-x86_64-with-glibc2.41
- CPU: Intel(R) Xeon(R) Processor (8 cores)
- Python: 3.13.5
- Node: v22.23.3
- cursor-agent: 2026.10.16-e3cb207
- superpowers: bb92a77741419a4ab5f06e711a283343f1ada0c3 (<superpowers-dir>)
- openflow: 58b5a3fa0899f6e639454f0e4a7247dec98f6986 tarball=None
- openswarm: a48255a9cebafc48b0a7cdd39b6590a7dc193496 (<openswarm-dir>)
- Model flag: grok-4.7-high
- cursor-agent flags: -p --trust --force --model grok-4.7-high --output-format stream-json
- Per-run timeout: 1200s
- Command: `/usr/bin/python3 run.py --arms baseline,superpowers,openswarm --tasks all --repeats 3 --concurrency 3 --out results/e2e-2026-10-17.jsonl`

## Per arm

| arm | success | wall_s | input tokens | output tokens | cache read | total tokens |
| --- | --- | --- | --- | --- | --- | --- |
| baseline | 24/24 (100.0%) | median 54.7, IQR 86.7 (q1 45.7, q3 132.4), min 24.9, max 262.1 | median 25494, IQR 22072 (q1 13071, q3 35143), min 73, max 52115 | median 2550, IQR 3450 (q1 1893, q3 5342), min 255, max 10520 | median 73280, IQR 13664 (q1 68736, q3 82400), min 24448, max 99200 | median 104700, IQR 25315 (q1 87344, q3 112659), min 24776, max 144387 |
| superpowers | 24/24 (100.0%) | median 186.9, IQR 178.0 (q1 120.7, q3 298.6), min 89.9, max 766.6 | median 50893, IQR 27145 (q1 39967, q3 67112), min 1867, max 117181 | median 7935, IQR 6352 (q1 5347, q3 11699), min 547, max 18511 | median 249984, IQR 178144 (q1 209184, q3 387328), min 104960, max 910976 | median 311922, IQR 169108 (q1 267209, q3 436318), min 107374, max 1042008 |
| openflow | 11/12 (91.7%) | median 985.3, IQR 275.5 (q1 919.5, q3 1195.0), min 774.2, max 1201.0 | median 187857, IQR 56824 (q1 147069, q3 203893), min 0, max 261464 | median 37704, IQR 6994 (q1 33430, q3 40424), min 0, max 43160 | median 5061504, IQR 744192 (q1 4465792, q3 5209984), min 0, max 5839744 | median 5248352, IQR 638293 (q1 4761920, q3 5400213), min 0, max 6078903 |
| openswarm | 24/24 (100.0%) | median 219.7, IQR 219.8 (q1 136.6, q3 356.4), min 89.1, max 687.1 | median 52562, IQR 29960 (q1 43475, q3 73434), min 29881, max 147871 | median 9954, IQR 10581 (q1 6139, q3 16720), min 3757, max 33664 | median 146880, IQR 44128 (q1 135264, q3 179392), min 65664, max 338304 | median 207194, IQR 54839 (q1 191056, q3 245895), min 167773, max 519839 |

## Per task

| task | success | wall_s | total tokens |
| --- | --- | --- | --- |
| config-deep-merge | 12/12 (100.0%) | median 200.6, IQR 286.4 (q1 151.7, q3 438.2), min 73.7, max 947.7 | median 269892, IQR 1355109 (q1 179859, q3 1534968), min 92182, max 5341360 |
| csv-quoting | 11/12 (91.7%) | median 377.3, IQR 540.8 (q1 230.2, q3 771.0), min 152.3, max 1201.0 | median 325376, IQR 238096 (q1 131644, q3 369740), min 0, max 552868 |
| date-range-parse | 10/10 (100.0%) | median 117.9, IQR 80.6 (q1 54.1, q3 134.7), min 31.0, max 1193.2 | median 217686, IQR 140340 (q1 125366, q3 265706), min 85531, max 1963284 |
| lru-eviction | 10/10 (100.0%) | median 215.5, IQR 135.5 (q1 87.5, q3 223.1), min 49.7, max 1200.3 | median 245207, IQR 302142 (q1 124083, q3 426225), min 105701, max 534034 |
| pagination-off-by-one | 10/10 (100.0%) | median 101.4, IQR 60.8 (q1 49.1, q3 109.9), min 24.9, max 1074.3 | median 194792, IQR 154628 (q1 108757, q3 263385), min 84263, max 5458153 |
| path-normalise | 10/10 (100.0%) | median 125.6, IQR 111.6 (q1 72.7, q3 184.3), min 54.4, max 833.9 | median 219155, IQR 130977 (q1 124143, q3 255120), min 88890, max 5248352 |
| retry-backoff | 10/10 (100.0%) | median 190.1, IQR 217.8 (q1 73.2, q3 291.0), min 46.9, max 907.0 | median 232664, IQR 418169 (q1 127276, q3 545446), min 87276, max 6078903 |
| semver-compare | 10/10 (100.0%) | median 370.8, IQR 150.1 (q1 273.2, q3 423.3), min 132.3, max 941.1 | median 190604, IQR 207066 (q1 110990, q3 318056), min 24776, max 5400213 |

## Per task and arm

| task | arm | n | success | median wall_s | median total tokens |
| --- | --- | --- | --- | --- | --- |
| config-deep-merge | baseline | 3 | 3/3 (100.0%) | 95.5 | 134639 |
| config-deep-merge | openflow | 3 | 3/3 (100.0%) | 923.7 | 5172189 |
| config-deep-merge | openswarm | 3 | 3/3 (100.0%) | 220.5 | 198590 |
| config-deep-merge | superpowers | 3 | 3/3 (100.0%) | 180.7 | 315783 |
| csv-quoting | baseline | 3 | 3/3 (100.0%) | 205.9 | 130822 |
| csv-quoting | openflow | 3 | 2/3 (66.7%) | 1200.4 | 0 |
| csv-quoting | openswarm | 3 | 3/3 (100.0%) | 434.9 | 375899 |
| csv-quoting | superpowers | 3 | 3/3 (100.0%) | 314.8 | 342692 |
| date-range-parse | baseline | 3 | 3/3 (100.0%) | 41.0 | 87367 |
| date-range-parse | openflow | 1 | 1/1 (100.0%) | 1193.2 | 1963284 |
| date-range-parse | openswarm | 3 | 3/3 (100.0%) | 127.1 | 206379 |
| date-range-parse | superpowers | 3 | 3/3 (100.0%) | 113.5 | 274662 |
| lru-eviction | baseline | 3 | 3/3 (100.0%) | 51.2 | 106086 |
| lru-eviction | openflow | 1 | 1/1 (100.0%) | 1200.3 | — |
| lru-eviction | openswarm | 3 | 3/3 (100.0%) | 219.0 | 245207 |
| lru-eviction | superpowers | 3 | 3/3 (100.0%) | 215.2 | 428651 |
| pagination-off-by-one | baseline | 3 | 3/3 (100.0%) | 31.9 | 85292 |
| pagination-off-by-one | openflow | 1 | 1/1 (100.0%) | 1074.3 | 5458153 |
| pagination-off-by-one | openswarm | 3 | 3/3 (100.0%) | 93.4 | 181576 |
| pagination-off-by-one | superpowers | 3 | 3/3 (100.0%) | 109.9 | 267655 |
| path-normalise | baseline | 3 | 3/3 (100.0%) | 60.6 | 109087 |
| path-normalise | openflow | 1 | 1/1 (100.0%) | 833.9 | 5248352 |
| path-normalise | openswarm | 3 | 3/3 (100.0%) | 196.1 | 195966 |
| path-normalise | superpowers | 3 | 3/3 (100.0%) | 121.2 | 257845 |
| retry-backoff | baseline | 3 | 3/3 (100.0%) | 53.9 | 88119 |
| retry-backoff | openflow | 1 | 1/1 (100.0%) | 907.0 | 6078903 |
| retry-backoff | openswarm | 3 | 3/3 (100.0%) | 245.7 | 199457 |
| retry-backoff | superpowers | 3 | 3/3 (100.0%) | 295.9 | 630861 |
| semver-compare | baseline | 3 | 3/3 (100.0%) | 148.6 | 102468 |
| semver-compare | openflow | 1 | 1/1 (100.0%) | 941.1 | 5400213 |
| semver-compare | openswarm | 3 | 3/3 (100.0%) | 372.9 | 198959 |
| semver-compare | superpowers | 3 | 3/3 (100.0%) | 398.5 | 341421 |

Skipped arms (omo) are omitted. n is the number of finished, non-skipped runs in the group.
Token totals add input, output, cache read and cache write. cursor-agent reports inputTokens with cache tokens already removed.
