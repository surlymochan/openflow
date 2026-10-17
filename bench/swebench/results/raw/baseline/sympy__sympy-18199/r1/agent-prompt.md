Resolve the GitHub issue below in the sympy/sympy repository, checked out in the current directory (<run>/10172331/baseline/sympy__sympy-18199/r1/repo).

The Python environment for this checkout is <run>/10172331/baseline/sympy__sympy-18199/r1/venv/bin/python (first on PATH as `python`); the project is installed in it in editable mode. Run tests with: <run>/10172331/baseline/sympy__sympy-18199/r1/venv/bin/python bin/test -C <test file>   (or <run>/10172331/baseline/sympy__sympy-18199/r1/venv/bin/python -m pytest <test file>)

Edit the non-test source files so the issue is resolved, keeping behaviour the issue does not ask to change.

<issue>
nthroot_mod function misses one root of x = 0 mod p.
When in the equation x**n = a mod p , when a % p == 0. Then x = 0 mod p is also a root of this equation. But right now `nthroot_mod` does not check for this condition. `nthroot_mod(17*17, 5 , 17)` has a root `0 mod 17`. But it does not return it.
</issue>

Implement it; run the relevant tests.