You are an execution agent dispatched by a planning agent. Complete the task below.

Rules:
- Work only inside the current directory (<run>/10180046/openswarm/pylint-dev__pylint-8898/r1/repo). It is a dedicated git worktree; do NOT commit, push, or switch branches.
- Keep changes minimal and focused on the task; match the surrounding code style.
- Run the most relevant tests/linters if they exist and report the outcome honestly.
- If something blocks you, stop and report status "partial" or "failed" with the reason; do not fake success.

TASK:
# Task: stop `regexp_csv` options from splitting commas inside regex quantifiers

## Repository and environment

- Repository: `<run>/10180046/openswarm/pylint-dev__pylint-8898/r1/repo`
- Always run commands from the repository root.
- Python: `<run>/10180046/openswarm/pylint-dev__pylint-8898/r1/venv/bin/python`
- The project is installed in editable mode in that virtual environment.
- The worktree is clean when you start. Do not commit.

## Background / bug

Options declared with type `"regexp_csv"` (for example `bad-names-rgxs`) are
parsed by `pylint/config/argument.py:_regexp_csv_transfomer`, which currently
uses the generic comma splitter `pylint_utils._check_csv`. That splitter splits
on every comma, so a valid regex such as `(foo{1,3})` becomes `(foo{1` and
`3})`. The second fragment is not a valid regex, and pylint crashes while
parsing its configuration:

```ini
[tool.pylint.basic]
bad-names-rgxs = "(foo{1,3})"
```

The expected behaviour is that a comma inside a regex quantifier (`{m,n}`)
stays part of the regex, while commas outside quantifiers continue to separate
multiple regex values.

## Files to change (source only)

1. `pylint/utils/utils.py`
   - Add imports:
     - `from collections import deque`
     - extend `from collections.abc import Sequence` to
       `from collections.abc import Iterable, Sequence`
   - Add a new helper next to `_check_csv`:

     ```python
     def _check_regexp_csv(value: list[str] | tuple[str] | str) -> Iterable[str]:
         r"""Split a comma-separated list of regexps, taking care to avoid splitting
         a regex employing a comma as quantifier, as in `\d{1,2}`."""
         if isinstance(value, (list, tuple)):
             yield from value
         else:
             # None is a sentinel value here
             regexps: deque[deque[str] | None] = deque([None])
             open_braces = False
             for char in value:
                 if char == "{":
                     open_braces = True
                 elif char == "}" and open_braces:
                     open_braces = False

                 if char == "," and not open_braces:
                     regexps.append(None)
                 elif regexps[-1] is None:
                     regexps.pop()
                     regexps.append(deque([char]))
                 else:
                     regexps[-1].append(char)
             yield from ("".join(regexp).strip() for regexp in regexps if regexp is not None)
     ```

2. `pylint/utils/__init__.py`
   - Import `_check_regexp_csv` from `pylint.utils.utils` (next to
     `_check_csv`).
   - Add `"_check_regexp_csv"` to `__all__`.

3. `pylint/config/argument.py`
   - In `_regexp_csv_transfomer`, replace the `_csv_transformer(value)` call
     with `pylint_utils._check_regexp_csv(value)`. The rest of the function
     (compiling each resulting pattern through `_regex_transformer`) must stay
     unchanged so invalid regexes still produce the existing
     `argparse.ArgumentTypeError` message.

Do not change `_csv_transformer`, `_glob_paths_csv_transformer`, or
`_regexp_paths_csv_transfomer`: only regex-list options need the
quantifier-aware splitter.

## Constraints

- Edit non-test source files only. Do **not** modify any file under `tests/`.
  The existing `tests/config/test_config.py::test_csv_regex_error` still
  asserts the old broken behaviour; it is intentionally stale and will be
  replaced by the evaluation's updated tests. Do not “fix” the source to make
  that stale assertion pass.
- Keep all existing behaviour for options that are not `regexp_csv`.
- Keep invalid-regex error reporting intact.
- Do not commit, push, or open a PR/issue.
- Do not touch files outside the repository.

## Acceptance criteria

After the change:

1. `list(_check_regexp_csv("foo")) == ["foo"]`
2. `list(_check_regexp_csv("foo,bar")) == ["foo", "bar"]`
3. `list(_check_regexp_csv("foo, bar")) == ["foo", "bar"]`
4. `list(_check_regexp_csv("foo, bar{1,3}")) == ["foo", "bar{1,3}"]`
5. `list(_check_regexp_csv("(foo{1,3})")) == ["(foo{1,3})"]`
6. `_regexp_csv_transfomer("(foo{1,3})")` returns one compiled pattern with
   `pattern == "(foo{1,3})"`.
7. Running pylint with `--bad-names-rgx=(foo{1,3})` no longer crashes and
   stores exactly `[re.compile("(foo{1,3})")]` in
   `linter.config.bad_names_rgxs`.
8. An invalid regex such as `(foo{1,}` is still rejected with
   `argparse.ArgumentTypeError` / the usual pylint error message.
9. The relevant existing tests pass, excluding only the stale
   `test_csv_regex_error` (use the command from `planner/verify.txt`).

## Verification command

The exact command is in:

`<run>/10180046/openswarm/pylint-dev__pylint-8898/r1/planner/verify.txt`

Run it from the repository root and report the real output summary.


When finished, your FINAL message must be ONLY a JSON object (no prose, no code fence) with keys:
status ("done"|"partial"|"failed"), summary (string), files_changed (array of paths), tests (string), followups (array of strings).

After you finish, the planner runs this acceptance command on the host, outside your sandbox: `cd <run>/10180046/openswarm/pylint-dev__pylint-8898/r1/repo && <run>/10180046/openswarm/pylint-dev__pylint-8898/r1/venv/bin/python -m pytest -rA tests/config/test_config.py tests/utils/unittest_utils.py -k "not test_csv_regex_error" && <run>/10180046/openswarm/pylint-dev__pylint-8898/r1/venv/bin/python -c 'import argparse, re, pytest; from pylint.config.argument import _regexp_csv_transfomer; from pylint.utils import _check_regexp_csv; from pylint.testutils._run import _Run as Run; cases=[("foo",["foo"]),("foo,bar",["foo","bar"]),("foo, bar",["foo","bar"]),("foo, bar{1,3}",["foo","bar{1,3}"]),("(foo{1,3})",["(foo{1,3})"]),("a{1,2},b{3,4}",["a{1,2}","b{3,4}"])]; assert all(list(_check_regexp_csv(s))==e for s,e in cases); assert [p.pattern for p in _regexp_csv_transfomer("(foo{1,3})")]==["(foo{1,3})"]; r=Run(["tests/regrtest_data/empty.py","--bad-names-rgx=(foo{1,3})"],exit=False); assert [p.pattern for p in r.linter.config.bad_names_rgxs]==["(foo{1,3})"]; exec("with pytest.raises(argparse.ArgumentTypeError):\n    _regexp_csv_transfomer(\"(foo{1,}, foo{1,3}})\")")'`. If your sandbox blocks running it (ports, network, missing deps), say so in `tests` instead of treating it as a code failure.
