# Contributing to evalid

Thanks for helping. evalid is an executable delivery workflow for AI
coding agents: YAML phases made of small deterministic atoms, red/green TDD
proof gates checked by code, and the `xflow` CLI. Contributions that keep
the gates deterministic — checked by code, not by prose — are the ones that
fit this project best.

## Dev setup

Requires Node.js ≥ 22.5 (for `node:sqlite`) and Python 3 (atoms are small
Python scripts).

```bash
git clone https://github.com/surlymochan/evalid.git
cd evalid
npm ci && npm test          # full suite; each test file also runs standalone
node bin/xflow.js quickstart
node bin/xflow.js doctor --project-root .
```

## What a good PR looks like

- **One change per PR**, with a test. Gate/atom changes belong in
  `test/gate-atoms.test.js` / `test/tdd-proof.test.js` (or the closest
  existing test file); CLI changes in `test/cli-usability.test.js`;
  benchmark-harness changes in `bench/swebench/` with a stdlib-only
  Python test next to them (see `bench/swebench/test_diff_filter.py`).
- Tests must not depend on your machine: no real agent CLIs, no network,
  no Playwright browsers unless the test already requires them. Use the
  fixtures under `test/fixtures/` and temp dirs.
- Run the suite before pushing; CI runs the same `npm test`.
- If you change a workflow or atom, check for drift:
  `npm run drift:scan`.
- Keep the README's claims honest: benchmark numbers in the README come
  from `bench/` with the methodology recorded there. Do not add a claim
  you have not measured.

## AI assistance

Using an AI coding agent to write a contribution is fine — this project
exists for exactly that workflow. Please:

- Say so in the PR description (one line is enough) and name the tool.
- Make sure a human has read the full diff and run the tests before
  opening the PR. You are responsible for what you submit.
- Never tick a checklist item or make a statement in the PR template
  that is not true of the actual work.

## Reporting bugs

Open an issue with the template: include `xflow doctor --project-root .`
output, your Node/Python versions, and the smallest workflow or command
that reproduces the problem. Security issues: please use GitHub's private
vulnerability reporting instead of a public issue.

By contributing you agree that your contributions are licensed under the
MIT License.
