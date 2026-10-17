Resolve the GitHub issue below in the sympy/sympy repository, checked out in the current directory (<run>/10172331/baseline/sympy__sympy-16597/r1/repo).

The Python environment for this checkout is <run>/10172331/baseline/sympy__sympy-16597/r1/venv/bin/python (first on PATH as `python`); the project is installed in it in editable mode. Run tests with: <run>/10172331/baseline/sympy__sympy-16597/r1/venv/bin/python bin/test -C <test file>   (or <run>/10172331/baseline/sympy__sympy-16597/r1/venv/bin/python -m pytest <test file>)

Edit the non-test source files so the issue is resolved, keeping behaviour the issue does not ask to change.

<issue>
a.is_even does not imply a.is_finite
I'm not sure what the right answer is here:
```julia
In [1]: m = Symbol('m', even=True)                                                                                                             

In [2]: m.is_finite                                                                                                                            

In [3]: print(m.is_finite)                                                                                                                     
None
```
I would expect that a number should be finite before it can be even.
</issue>

Implement it; run the relevant tests.