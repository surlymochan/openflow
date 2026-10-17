# Task: Fix BlockMatrix products containing ZeroMatrix blocks

Repository root: `<run>/10180038/openswarm/sympy__sympy-17630/r1/repo`

Python environment (already installed editable):
`<run>/10180038/openswarm/sympy__sympy-17630/r1/venv/bin/python`

## Goal

Fix the failure when multiplying a `BlockMatrix` that contains `ZeroMatrix`
blocks more than once. After the fix:

```python
from sympy import MatrixSymbol, ZeroMatrix, BlockMatrix, block_collapse

a = MatrixSymbol('a', 2, 2)
z = ZeroMatrix(2, 2)
b = BlockMatrix([[a, z], [z, z]])

block_collapse(b * b)      # Matrix([[a**2, 0], [0, 0]])
block_collapse(b * b * b)  # Matrix([[a**3, 0], [0, 0]])
```

must both work, and block entries produced by `_blockmul` must remain matrix
objects (`ZeroMatrix`), not the scalar `Zero`.

## Root cause

In `sympy/matrices/expressions/matexpr.py`, `get_postprocessor` always builds
the final matrix expression as:

```python
return mat_class(cls._from_args(nonmatrices), *matrices).doit(deep=False)
```

For `Add`, `cls._from_args([])` is the scalar `S.Zero`. Therefore an `Add`
whose args are only matrix terms is postprocessed as `MatAdd(0, *matrices)`.
When all matrix terms are `ZeroMatrix`, `MatAdd(...).doit()` collapses the sum
to scalar `Zero` instead of a `ZeroMatrix`. Block matrix multiplication then
stores scalar zeros in the resulting blocks, and the next multiplication fails
when it accesses `.cols` on those blocks.

## Files / area to change

Change only this source file:

- `sympy/matrices/expressions/matexpr.py`

Specifically, in `get_postprocessor`, handle the matrix-only `Add` case by
constructing `MatAdd` directly from the matrix terms, without injecting the
scalar `Add` identity. The required final part of the function should become:

```python
        if mat_class == MatAdd:
            return mat_class(*matrices).doit(deep=False)
        return mat_class(cls._from_args(nonmatrices), *matrices).doit(deep=False)
```

Keep the `Mul` path unchanged. Do not change `BlockMatrix._blockmul` or
`BlockMatrix.__new__`; the postprocessor fix addresses the actual cause.

## Constraints

- Do not modify test files.
- Do not make unrelated refactors or broad changes.
- Preserve the existing behaviour for `Add` involving non-matrix terms and for
  `Mul`.
- Do not commit, push, or create branches/PRs/issues; work only in the provided
  checkout and leave the changes uncommitted.
- No network access is needed.

## Acceptance criteria

1. `Add(ZeroMatrix(2, 2), ZeroMatrix(2, 2))` is still a matrix
   (`is_ZeroMatrix` is true), not scalar `Zero`.
2. `b._blockmul(b)` succeeds and every block except the top-left nonzero block
   satisfies `.is_ZeroMatrix`.
3. `block_collapse(b * b) == BlockMatrix([[a**2, z], [z, z]])`.
4. `block_collapse(b * b * b) == BlockMatrix([[a**3, z], [z, z]])`.
5. The existing blockmatrix/matexpr tests relevant to `Add` and
   `BlockMatrix` still pass.
6. In the final report, list exactly which files changed and which commands
   were run, with real pass/fail output summaries. Do not claim a command was
   run unless it was actually run.
