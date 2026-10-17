You are an execution agent dispatched by a planning agent. Complete the task below.

Rules:
- Work only inside the current directory (<run>/10180038/openswarm/pytest-dev__pytest-6197/r1/repo). It is a dedicated git worktree; do NOT commit, push, or switch branches.
- Keep changes minimal and focused on the task; match the surrounding code style.
- Run the most relevant tests/linters if they exist and report the outcome honestly.
- If something blocks you, stop and report status "partial" or "failed" with the reason; do not fake success.

TASK:
# Task: fix pytest #6197 — do not eagerly import unrelated package `__init__.py` files

## Environment

- Repository: `<run>/10180038/openswarm/pytest-dev__pytest-6197/r1/repo`
- Python: `<run>/10180038/openswarm/pytest-dev__pytest-6197/r1/venv/bin/python`
- The project is installed editable in that venv. Run commands from the repository root.
- Start from the clean worktree; do not commit.

## Symptom

After the 5.2.3 collection changes, running `pytest` in a directory that contains a package imports that package's `__init__.py` even when the package has no test files and its `__init__.py` does not match `python_files`.

Minimal reproduction:

```sh
mkdir foobar
echo 'assert False' > foobar/__init__.py
echo 'def test_ok(): pass' > test_ok.py
pytest
```

On the broken tree this reports `ERROR collecting foobar/__init__.py` and exits with a collection error. In pytest 5.2.2 this passed because `foobar/__init__.py` was not imported.

## Root cause

`Package.collect()` in `src/_pytest/python.py` starts with:

```python
    def collect(self):
        self._mount_obj_if_needed()
        this_path = self.fspath.dirpath()
        ...
```

The `Session` collector creates a `Package` node for package directories encountered while scanning, so this eager `_mount_obj_if_needed()` imports every discovered package's `__init__.py`, even when that package contributes no collected tests.

## Required change

Only in `src/_pytest/python.py`, in `Package.collect()`:

- Remove the eager `self._mount_obj_if_needed()` call.
- Leave the rest of `Package.collect()` unchanged.

Do **not**:

- remove the `_mount_obj_if_needed` method itself;
- remove its use from the `PyobjMixin.obj` property — lazy loading when the object is actually needed is intended;
- remove `+ ["__init__.py"]` from `pytest_collect_file` — that matching is needed so package collectors are created for nested packages;
- change `Session` package discovery in `src/_pytest/main.py`;
- modify files under `testing/` or add tests;
- commit, push, or use the network.

## Behavior that must be preserved

- `__init__.py` is still collected as a `Module` when it matches `python_files` (for example `python_files = *.py`), including when it is passed explicitly as an argument.
- A package that contains test modules still imports its `__init__.py` when those tests are set up/run, so genuine errors in a real package's initializer still surface.
- Nested-package collection, package-scoped fixtures, and duplicate-path handling remain unchanged.

## Acceptance criteria

1. The reproduction above passes (`test_ok.py` runs, exit status 0) and no `ERROR collecting foobar/__init__.py` is printed.
2. A directory containing only a package whose `__init__.py` raises/asserts does not produce a collection error; it reports no tests collected.
3. `__init__.py` files matching `python_files` are still collected, and explicitly passing `pkg/__init__.py` still works.
4. `testing/test_collection.py` passes on a fresh temp root: expected result on this checkout is `71 passed, 1 xfailed`.
5. Relevant package-collection tests in `testing/python/collect.py` (for example `test_package_collection_infinite_recursion`, `test_package_collection_init_given_as_argument`, `test_package_with_modules`, and `test_package_ordering`) still pass.

## Verification

Use the command written in `planner/verify.txt`. It first runs the regression reproduction, then runs `testing/test_collection.py`.

Note: in this sandbox the default `/tmp/pytest-of-box` contains stale read-only garbage that makes `testdir` fail during cleanup. The verification command therefore gives pytest a freshly created `TMPDIR`; do the same if running the test file manually.


When finished, your FINAL message must be ONLY a JSON object (no prose, no code fence) with keys:
status ("done"|"partial"|"failed"), summary (string), files_changed (array of paths), tests (string), followups (array of strings).

After you finish, the planner runs this acceptance command on the host, outside your sandbox: `tmp=$(mktemp -d) && mkdir "$tmp/foobar" && printf 'assert False\n' > "$tmp/foobar/__init__.py" && printf 'def test_ok(): pass\n' > "$tmp/test_ok.py" && (cd "$tmp" && TMPDIR="$tmp" <run>/10180038/openswarm/pytest-dev__pytest-6197/r1/venv/bin/python -m pytest -q) && tmp=$(mktemp -d) && TMPDIR="$tmp" <run>/10180038/openswarm/pytest-dev__pytest-6197/r1/venv/bin/python -m pytest -rA testing/test_collection.py`. If your sandbox blocks running it (ports, network, missing deps), say so in `tests` instead of treating it as a code failure.
