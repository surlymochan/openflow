"""Per-run environment isolation for agent subprocesses (issue #5, P0-3).

Agents used to inherit the shared ``~/.cache/uv``. Newer upstream releases
cached there can already contain the fix being evaluated, which leaks the
answer into a run. Every agent (and the harness's own env build) now gets a
``UV_CACHE_DIR`` inside its own per-run directory: the cache starts empty
for each run and disappears with the run directory. Combined with
``UV_OFFLINE=1`` (see ``arms.NO_NET_ENV``) an agent can neither read the
shared cache nor download anything into its private one.
"""
from __future__ import annotations

from pathlib import Path


def per_run_uv_cache(venv) -> str:
    """The uv cache directory for one run, derived from its venv location.

    The venv lives inside the per-run directory (``<rundir>/venv``), so its
    parent is unique per run, arm and repeat.
    """
    return str(Path(venv).parent / "uv-cache")


def with_uv_cache(env: dict, venv) -> dict:
    """Return a copy of ``env`` with ``UV_CACHE_DIR`` pointed at the per-run cache."""
    out = dict(env)
    out["UV_CACHE_DIR"] = per_run_uv_cache(venv)
    return out
