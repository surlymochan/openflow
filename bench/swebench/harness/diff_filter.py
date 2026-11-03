"""Keep workflow evidence out of solution patches (issue #5, P0-2).

OpenFlow runs write their evidence under ``specs/`` (and ``.xflow/`` /
``.as-xflow/``). When a run happens inside a graded checkout, that evidence
must never become part of the solution patch: on the SWE-bench instances it
added ~900-1,200 files (up to 6.8 MB) and made ``git apply`` reject the
patch. ``run.py`` excludes these paths at ``git diff`` time; the strip
function below is a second, independent guard for patches that were
produced any other way (and for regrading saved patches).
"""
from __future__ import annotations

# Top-level paths that hold run evidence, not solution code.
EXCLUDED_PATHS = (".xflow", ".as-xflow", "specs")


def pathspec_args() -> list[str]:
    """Git pathspec arguments selecting everything except evidence paths."""
    return [".", *[f":(exclude){p}" for p in EXCLUDED_PATHS]]


def _section_paths(header: str) -> tuple[str, str]:
    """Extract the a/ and b/ paths from a ``diff --git`` header line."""
    rest = header[len("diff --git "):]
    a, _, b = rest.partition(" b/")
    return a.removeprefix("a/"), b.strip()


def _is_excluded(path: str) -> bool:
    return any(path == p or path.startswith(p + "/") for p in EXCLUDED_PATHS)


def strip_excluded_sections(diff_text: str) -> str:
    """Remove every per-file diff section whose path is an evidence path."""
    out: list[str] = []
    keep = True
    for line in diff_text.splitlines(keepends=True):
        if line.startswith("diff --git "):
            a, b = _section_paths(line.rstrip("\n"))
            keep = not (_is_excluded(a) or _is_excluded(b))
        if keep:
            out.append(line)
    return "".join(out)
