# Task: make pytest consider the full MRO when collecting class marks

## Repository / environment

- Repository root: the pytest checkout you are working in. In this run it is
  `<run>/10180038/openswarm/pytest-dev__pytest-10356/r1/repo`.
- Python: `<run>/10180038/openswarm/pytest-dev__pytest-10356/r1/venv/bin/python`
  (the project is installed there in editable mode).
- Start from a clean worktree. Do not commit, push, or change anything outside the checkout.

## Goal

Fix the bug where a test class that inherits from multiple base classes only receives
the `pytestmark` marks of the first base class selected by normal attribute lookup.
All marks from the entire class method resolution order (MRO) must be merged, so that
this works:

```python
import pytest

class Base:
    pass

@pytest.mark.foo
class Foo(Base):
    pass

@pytest.mark.bar
class Bar(Base):
    pass

class TestDings(Foo, Bar):
    def test_dings(self):
        pass
```

`test_dings` must have both the `foo` and `bar` marks, regardless of whether the test
class is declared as `TestDings(Foo, Bar)` or `TestDings(Bar, Foo)`.

The existing behavior must be preserved: marks from base classes are still inherited,
marks on a class are still inherited by its subclasses, function/module marks are
unchanged, and marks must not leak into sibling classes that do not inherit from the
marked class.

## Files / area to change

Only non-test source changes are required:

- `src/_pytest/mark/structures.py`
  - `get_unpacked_marks`
  - `store_mark`
  - the module imports, if an extra standard-library import is needed.
- Optionally add a changelog fragment such as `changelog/10356.bugfix.rst`
  (for example: `Fixed missing marks when inheriting from multiple classes.`).
  Do not change tests, `AUTHORS`, or unrelated source files.

## Required implementation

In `src/_pytest/mark/structures.py`:

1. Extend `get_unpacked_marks` with a keyword-only `consider_mro: bool = True`
   parameter.
2. When `consider_mro` is true:
   - First obtain the object's own/effective marks using
     `get_unpacked_marks(obj, consider_mro=False)`.
   - If `obj` is a class, additionally collect
     `get_unpacked_marks(base, consider_mro=False)` for every base in
     `obj.__mro__[1:]`, in MRO order, and chain those results after the first list.
     Use `itertools.chain`.
3. When `consider_mro` is false, keep the previous behavior exactly:
   `mark_list = getattr(obj, "pytestmark", [])`, wrap non-list values in a list,
   and pass the result through `normalize_mark_list`.
4. Update `store_mark` so it stores a newly applied mark using
   `get_unpacked_marks(obj, consider_mro=False)`. This prevents decorating one class
   from recursively folding the whole parent MRO into that class's own attribute.
5. Keep the public call sites in `src/_pytest/python.py` working unchanged; they call
   `get_unpacked_marks` with the default (MRO-aware) behavior. Do not change test files.

A suitable implementation shape is:

```python
def get_unpacked_marks(
    obj: Union[object, type],
    *,
    consider_mro: bool = True,
) -> Iterable[Mark]:
    """Obtain the unpacked marks that are stored on an object."""
    if consider_mro:
        mark_list = get_unpacked_marks(obj, consider_mro=False)
        if inspect.isclass(obj):
            mro = obj.__mro__[1:]
            mark_list = itertools.chain(
                mark_list,
                *(get_unpacked_marks(base, consider_mro=False) for base in mro),
            )
    else:
        mark_list = getattr(obj, "pytestmark", [])
        if not isinstance(mark_list, list):
            mark_list = [mark_list]
    return normalize_mark_list(mark_list)
```

and in `store_mark`:

```python
obj.pytestmark = [*get_unpacked_marks(obj, consider_mro=False), mark]
```

Add `import itertools` near the other standard-library imports if it is not already
present. The final code must remain valid for the Python version used by this checkout
(Python 3.9) and follow the repository's existing typing/style conventions.

## Constraints

- Do not modify anything under `testing/`; the hidden regression tests cover this fix.
- Do not change unrelated behavior, public APIs, or existing test expectations.
- Do not commit, push, open PRs/issues, or access the network.
- Use the provided virtualenv Python for all checks.
- Keep the worktree limited to the source plus an optional changelog fragment.

## Acceptance criteria

1. The multiple-inheritance example above yields both `foo` and `bar` on the test
   method for both base-class orderings.
2. Existing single-inheritance merging still works:
   `@pytest.mark.a Base`, `@pytest.mark.b Base2(Base)`, decorated `Test1(Base2)` gives
   `a`, `b`, and the class's own mark; a method-level mark still takes precedence for
   `get_closest_marker`.
3. Existing isolation still works: decorating `TestSub(TestBase)` does not add that
   mark to an unmarked sibling `TestOtherSub(TestBase)`.
4. Module-level and function-level marks behave as before.
5. The full `testing/test_mark.py` suite passes, and the inline multiple-inheritance
   assertion in `planner/verify.txt` passes.

## Verification

Run the single command stored in
`<run>/10180038/openswarm/pytest-dev__pytest-10356/r1/planner/verify.txt`.
It exercises the multiple-inheritance repro directly and then runs the relevant existing
test file with `-rA`. The command must exit with status 0.
