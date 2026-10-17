# Fix MatrixSymbol difference printing

## Repository and environment

- Repository root: `<run>/10180038/openswarm/sympy__sympy-14248/r1/repo`
- Python: `<run>/10180038/openswarm/sympy__sympy-14248/r1/venv/bin/python`
- SymPy is installed in editable mode from this checkout.
- Run all commands from the repository root.
- Only edit the non-test source files listed below. Do not modify tests, do not commit, and do not push.

## Goal

Make differences of matrix expressions print like ordinary differences instead of as a sum with a `(-1)` coefficient.

The issue example is:

```python
from sympy import *
A = MatrixSymbol('A', 2, 2)
B = MatrixSymbol('B', 2, 2)
print(A - A*B - B)
pprint(A - A*B - B)
latex(A - A*B - B)
```

The matrix expression internally has `MatAdd` terms such as `MatMul(-1, B)` and
`MatMul(-1, A, B)`. The printers currently expose the leading `-1`; they should
render those terms with a unary minus and join subsequent negative terms with
` - ` instead of ` + `.

Because `MatAdd` arguments have their existing canonical order, the expected
output for the example in this checkout is:

```text
-B - A*B + A
-B - A⋅B + A          # pretty/unicode; ASCII pretty uses '*'
'-B - A B + A'        # latex() returns this string
```

Do not change `MatAdd`/`MatMul` construction, canonicalization, ordering, or any
other matrix behavior. This is a printer-only fix.

## Files and methods to change

### 1. `sympy/printing/str.py`

Update `StrPrinter._print_MatMul` so a negative numeric coefficient is emitted
as a leading unary minus. `_keep_coeff` is already imported in this module.

```python
    def _print_MatMul(self, expr):
        c, m = expr.as_coeff_mmul()
        if c.is_number and c < 0:
            expr = _keep_coeff(-c, m)
            sign = "-"
        else:
            sign = ""

        return sign + '*'.join(
            [self.parenthesize(arg, precedence(expr)) for arg in expr.args]
        )
```

Update `StrPrinter._print_MatAdd` to inspect each printed term and use the same
sign-aware assembly as scalar `Add` printing:

```python
    def _print_MatAdd(self, expr):
        terms = [self.parenthesize(arg, precedence(expr))
             for arg in expr.args]
        l = []
        for t in terms:
            if t.startswith('-'):
                sign = "-"
                t = t[1:]
            else:
                sign = "+"
            l.extend([sign, t])
        sign = l.pop(0)
        if sign == '+':
            sign = ""
        return sign + ' '.join(l)
```

### 2. `sympy/printing/pretty/pretty.py`

Update only `PrettyPrinter._print_MatAdd`. A negative term is already printed
with a leading minus by the pretty `MatMul` printer, so just join it with a
space; positive terms are joined with ` + `. `S`, `_coeff_isneg`, `prettyForm`,
and `stringPict` are already imported.

```python
    def _print_MatAdd(self, expr):
        s = None
        for item in expr.args:
            pform = self._print(item)
            if s is None:
                s = pform     # First element
            else:
                coeff = item.as_coeff_mmul()[0]
                if _coeff_isneg(S(coeff)):
                    s = prettyForm(*stringPict.next(s, ' '))
                    pform = self._print(item)
                else:
                    s = prettyForm(*stringPict.next(s, ' + '))
                s = prettyForm(*stringPict.next(s, pform))

        return s
```

### 3. `sympy/printing/latex.py`

Update `LatexPrinter._print_MatAdd` with the same sign-aware join:

```python
    def _print_MatAdd(self, expr):
        terms = [self._print(t) for t in expr.args]
        l = []
        for t in terms:
            if t.startswith('-'):
                sign = "-"
                t = t[1:]
            else:
                sign = "+"
            l.extend([sign, t])
        sign = l.pop(0)
        if sign == '+':
            sign = ""
        return sign + ' '.join(l)
```

Update `LatexPrinter._print_MatMul` so a leading negative numeric coefficient is
factored out and printed as a unary minus. This removes the erroneous `-1 `
prefix for terms such as `-A`:

```python
    def _print_MatMul(self, expr):
        from sympy import Add, MatAdd, HadamardProduct, MatMul, Mul

        def parens(x):
            if isinstance(x, (Add, MatAdd, HadamardProduct)):
                return r"\left(%s\right)" % self._print(x)
            return self._print(x)

        if isinstance(expr, MatMul) and expr.args[0].is_Number and expr.args[0] < 0:
            expr = Mul(-1*expr.args[0], MatMul(*expr.args[1:]))
            return '-' + ' '.join(map(parens, expr.args))
        else:
            return ' '.join(map(parens, expr.args))
```

## Constraints

- Do not edit any file under a `tests/` directory or any `test_*.py` file.
- The existing `test_MatrixElement_printing` expectations in the old checkout
  contain the pre-fix output (for example `(-1)*B + A`). Those stale assertions
  are intentionally superseded by this issue; do not weaken the source fix in
  order to keep them passing.
- Do not change matrix expression canonicalization, sorting, or evaluation.
- Keep the change limited to the three printer modules above.

## Acceptance criteria

After the change, this must succeed from the repository root:

```bash
<run>/10180038/openswarm/sympy__sympy-14248/r1/venv/bin/python -c "from sympy import MatrixSymbol, latex, pretty, sstr; A=MatrixSymbol('A',3,3); B=MatrixSymbol('B',3,3); C=MatrixSymbol('C',3,3); assert sstr(A-A*B-B) == '-B - A*B + A'; assert sstr(A*B-(A+B)) == '-(A + B) + A*B'; assert pretty(-A*B*C) == '-A*B*C'; assert pretty(A-B) == '-B + A'; assert pretty(A*B*C-A*B-B*C) == '-A*B -B*C + A*B*C'; assert latex(-A) == '-A'; assert latex(A-A*B-B) == '-B - A B + A'; assert latex(-A*B-A*B*C-B) == '-B - A B - A B C'; print('matrix printing checks passed')"
```

The following existing targeted regression tests must also still pass:

```bash
<run>/10180038/openswarm/sympy__sympy-14248/r1/venv/bin/python -m pytest -q \
  sympy/printing/tests/test_str.py::test_MatMul_MatAdd \
  sympy/printing/tests/test_latex.py::test_matAdd \
  sympy/printing/tests/test_latex.py::test_matMul
```

Expected behavior for the original issue example is exactly:

- `str(A - A*B - B) == "-B - A*B + A"`
- `pretty(A - A*B - B)` contains a unary minus for each negative term, not `+ -`
- `latex(A - A*B - B) == "-B - A B + A"`

Report which files changed and paste the actual command output summary.
