# Task: preserve chained exceptions in pytest report serialization

## Repository and environment

- Repository: `<run>/10180038/openswarm/pytest-dev__pytest-5787/r1/repo`
- Python: `<run>/10180038/openswarm/pytest-dev__pytest-5787/r1/venv/bin/python`
- The project is installed in editable mode in that virtualenv.
- Start from the clean checkout. Do not edit test files, docs, changelog, or any file outside the source area listed below.
- Do not push, open PRs/issues, or use network services. No commit is required from you.

## Goal

Make pytest's report serialization/deserialization preserve chained exceptions. When a report that
contains an `ExceptionChainRepr` is sent through `TestReport._to_json()` /
`TestReport._from_json()` (as pytest-xdist does when sending reports from workers to the
controller), the reconstructed `longrepr` must still contain the full exception chain:
the direct cause (`raise ... from ...`) and the implicit context (`raise` inside an `except`
block). Today only the newest exception's traceback survives the round trip, because the
serialized payload contains only the top-level `reprtraceback`/`reprcrash` and `_from_json`
always rebuilds a `ReprExceptionInfo`.

This must also work for `CollectReport`, since both report classes use the same `BaseReport`
serialization methods.

## Files to change

Only:

- `src/_pytest/reports.py`

Do not modify `testing/` files, `src/_pytest/_code/code.py`, or any other file. `ExceptionChainRepr`
already exists and is produced by `ExceptionInfo.getrepr()`; the missing piece is serialization.

## Current behavior to fix

In `src/_pytest/reports.py`, `BaseReport._to_json()` currently contains a local
`disassembled_report()` helper which only serializes:

- `longrepr.reprtraceback`
- `longrepr.reprcrash`
- `longrepr.sections`

`BaseReport._from_json()` then always constructs `ReprExceptionInfo`. The `chain` attribute of an
`ExceptionChainRepr` is never serialized, so every earlier exception is dropped.

## Required implementation

Refactor the existing serialization/deserialization logic into module-level helpers
`_report_to_json(report)` and `_report_kwargs_from_json(reportdict)` (this mirrors upstream pytest),
or implement an equivalent in the two methods. Preserve all existing behavior for ordinary
(non-chained) reports.

Requirements:

1. Import `ExceptionChainRepr` from `_pytest._code.code`.
2. When serializing a longrepr, add a `"chain"` entry:
   - `None` when the longrepr is an ordinary `ReprExceptionInfo`.
   - A list of `(serialized_reprtraceback, serialized_reprcrash, description)` tuples when the
     longrepr is an `ExceptionChainRepr`. Use `longrepr.chain` and preserve each description.
3. Reuse the existing representation-entry serialization rules (`ReprEntry` / `ReprEntryNative`,
   copying `__dict__`, converting nested objects with `__dict__` to dicts, stringifying
   `py.path.local`/`pathlib.Path` report attributes, and setting `result` to `None`).
4. When deserializing:
   - Rebuild `ReprTraceback` and `ReprFileLocation` objects for each chain entry.
   - If the `"chain"` value is non-empty, construct `ExceptionChainRepr(chain)`.
   - Otherwise construct the existing `ReprExceptionInfo(reprtraceback, reprcrash)`.
   - Re-add all sections to the reconstructed exception info object.
   - Use `reportdict["longrepr"].get("chain")` so old payloads without the key still deserialize.
   - Preserve the existing `_report_unserialization_failure` behavior for unknown entry types.
5. `reprcrash` may legitimately be `None` for a chained exception with no traceback. Serialize it
   as `None` and deserialize `None` back to `None`; do not call `.__dict__` or
   `ReprFileLocation(**None)` unconditionally.
6. Do not change how exception chains are *rendered*. `FormattedExcinfo.repr_excinfo` and
   `ExceptionChainRepr.toterminal` already work; only report transport must retain the data.

A suitable reference implementation for the helpers is:

```python
def _report_to_json(report):
    def serialize_repr_entry(entry):
        entry_data = {"type": type(entry).__name__, "data": entry.__dict__.copy()}
        for key, value in entry_data["data"].items():
            if hasattr(value, "__dict__"):
                entry_data["data"][key] = value.__dict__.copy()
        return entry_data

    def serialize_repr_traceback(reprtraceback):
        result = reprtraceback.__dict__.copy()
        result["reprentries"] = [
            serialize_repr_entry(x) for x in reprtraceback.reprentries
        ]
        return result

    def serialize_repr_crash(reprcrash):
        if reprcrash is not None:
            return reprcrash.__dict__.copy()
        return None

    def serialize_longrepr(rep):
        result = {
            "reprcrash": serialize_repr_crash(rep.longrepr.reprcrash),
            "reprtraceback": serialize_repr_traceback(rep.longrepr.reprtraceback),
            "sections": rep.longrepr.sections,
        }
        if isinstance(rep.longrepr, ExceptionChainRepr):
            result["chain"] = [
                (
                    serialize_repr_traceback(repr_traceback),
                    serialize_repr_crash(repr_crash),
                    description,
                )
                for repr_traceback, repr_crash, description in rep.longrepr.chain
            ]
        else:
            result["chain"] = None
        return result

    d = report.__dict__.copy()
    if hasattr(report.longrepr, "toterminal"):
        if hasattr(report.longrepr, "reprtraceback") and hasattr(
            report.longrepr, "reprcrash"
        ):
            d["longrepr"] = serialize_longrepr(report)
        else:
            d["longrepr"] = str(report.longrepr)
    else:
        d["longrepr"] = report.longrepr
    for name in d:
        if isinstance(d[name], (py.path.local, Path)):
            d[name] = str(d[name])
        elif name == "result":
            d[name] = None  # for now
    return d


def _report_kwargs_from_json(reportdict):
    def deserialize_repr_entry(entry_data):
        data = entry_data["data"]
        entry_type = entry_data["type"]
        if entry_type == "ReprEntry":
            reprfuncargs = None
            reprfileloc = None
            reprlocals = None
            if data["reprfuncargs"]:
                reprfuncargs = ReprFuncArgs(**data["reprfuncargs"])
            if data["reprfileloc"]:
                reprfileloc = ReprFileLocation(**data["reprfileloc"])
            if data["reprlocals"]:
                reprlocals = ReprLocals(data["reprlocals"]["lines"])
            reprentry = ReprEntry(
                lines=data["lines"],
                reprfuncargs=reprfuncargs,
                reprlocals=reprlocals,
                filelocrepr=reprfileloc,
                style=data["style"],
            )
        elif entry_type == "ReprEntryNative":
            reprentry = ReprEntryNative(data["lines"])
        else:
            _report_unserialization_failure(entry_type, TestReport, reportdict)
        return reprentry

    def deserialize_repr_traceback(repr_traceback_dict):
        repr_traceback_dict["reprentries"] = [
            deserialize_repr_entry(x) for x in repr_traceback_dict["reprentries"]
        ]
        return ReprTraceback(**repr_traceback_dict)

    def deserialize_repr_crash(repr_crash_dict):
        if repr_crash_dict is not None:
            return ReprFileLocation(**repr_crash_dict)
        return None

    longrepr = reportdict["longrepr"]
    if (
        longrepr
        and "reprcrash" in longrepr
        and "reprtraceback" in longrepr
    ):
        reprtraceback = deserialize_repr_traceback(longrepr["reprtraceback"])
        reprcrash = deserialize_repr_crash(longrepr["reprcrash"])
        chain_data = longrepr.get("chain")
        if chain_data:
            chain = [
                (
                    deserialize_repr_traceback(repr_traceback_data),
                    deserialize_repr_crash(repr_crash_data),
                    description,
                )
                for repr_traceback_data, repr_crash_data, description in chain_data
            ]
            exception_info = ExceptionChainRepr(chain)
        else:
            exception_info = ReprExceptionInfo(reprtraceback, reprcrash)

        for section in longrepr["sections"]:
            exception_info.addsection(*section)
        reportdict["longrepr"] = exception_info

    return reportdict
```

Then make `BaseReport._to_json()` return `_report_to_json(self)` and
`BaseReport._from_json()` return `cls(**_report_kwargs_from_json(reportdict))`.
You may keep the helper functions nested inside the methods if preferred, as long as the behavior
is equivalent.

## Acceptance criteria

1. `src/_pytest/reports.py` is the only source file changed.
2. A chained exception report round-trips as an `ExceptionChainRepr` for both `TestReport` and
   `CollectReport`, with all chain entries, their tracebacks, crash locations, and descriptions
   preserved.
3. `longrepr.sections` survive the round trip.
4. Ordinary single-exception reports still round-trip to `ReprExceptionInfo` with their
   `reprtraceback`, `reprcrash`, sections, and `longreprtext` unchanged.
5. Existing report serialization tests pass.
6. No test file is modified.

## Verification commands (run from the repository root)

Run the existing report suite:

```bash
cd <run>/10180038/openswarm/pytest-dev__pytest-5787/r1/repo
PYTHONDONTWRITEBYTECODE=1 <run>/10180038/openswarm/pytest-dev__pytest-5787/r1/venv/bin/python -m pytest -rA -p no:cacheprovider --basetemp=/tmp/pytest-5787-verify testing/test_reports.py
```

Then run the regression check in `planner/verify.txt` (it deliberately fails on the unfixed code
and must print `chained exception serialization OK` after the fix).
