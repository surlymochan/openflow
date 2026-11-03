"""Build official SWE-bench predictions from bench patches.

SWE-bench consumes one JSON object per line with exactly these fields:

    {"instance_id": ..., "model_name_or_path": ..., "model_patch": ...}

``run.py`` uses this module in two ways:

* while a matrix is running, each completed patch is upserted into the
  per-arm predictions file at generation time; and
* with ``run.py --export-predictions``, patches already saved under a raw
  results tree are rebuilt through exactly the same code path.

In both cases the patch goes through :func:`diff_filter.strip_excluded_sections`
again, even though the live runner already excludes evidence paths at diff
time.  That second pass is intentional: it makes saved patches safe to export
and keeps the live and replay paths byte-for-byte consistent.
"""
from __future__ import annotations

import gzip
import json
from pathlib import Path
from typing import Iterable, Mapping, Sequence

import diff_filter

FIELDS = ("instance_id", "model_name_or_path", "model_patch")

# Pi records provider-qualified model ids in run records.  Official
# submissions from the pilot used the public model label below, so keep that
# spelling stable instead of leaking the runner's internal provider path.
PUBLIC_MODEL_LABELS = {
    "deepseek/deepseek-flash": "deepseek-v4.1-flash(pi)",
    "deepseek-flash": "deepseek-v4.1-flash(pi)",
}


def public_model_label(model: str) -> str:
    """Return the public predictions label for one recorded model id."""
    return PUBLIC_MODEL_LABELS.get(model, model)


def model_name_or_path(
    arm: str,
    models: Iterable[str] = (),
    model_label: str | None = None,
) -> str:
    """Return ``<arm>+<model>`` in the form used by the pilot predictions."""
    if not arm or not arm.strip():
        raise ValueError("arm must not be empty")
    if model_label is not None:
        label = model_label.strip()
        if not label:
            raise ValueError("model_label must not be empty")
        return f"{arm}+{label}"

    labels = [public_model_label(model) for model in models if model]
    if not labels:
        raise ValueError(
            "cannot build model_name_or_path without a recorded model; "
            "pass model_label explicitly"
        )
    # dict.fromkeys preserves order while removing duplicate labels after
    # provider-id -> public-label normalization.
    return f"{arm}+" + "+".join(dict.fromkeys(labels))


def validate_prediction(prediction: Mapping[str, object]) -> dict[str, str]:
    """Validate and return a prediction with exactly the official fields."""
    if tuple(prediction.keys()) != FIELDS:
        raise ValueError(f"prediction fields must be exactly {FIELDS}")
    out = {}
    for field in FIELDS:
        value = prediction[field]
        if not isinstance(value, str):
            raise TypeError(f"prediction field {field} must be a string")
        out[field] = value
    if not out["instance_id"]:
        raise ValueError("instance_id must not be empty")
    if not out["model_name_or_path"]:
        raise ValueError("model_name_or_path must not be empty")
    return out


def make_prediction(
    instance_id: str,
    arm: str,
    model_patch: str,
    models: Iterable[str] = (),
    model_label: str | None = None,
) -> dict[str, str]:
    """Build one validated, evidence-filtered official prediction."""
    if not isinstance(model_patch, str):
        raise TypeError("model_patch must be a string")
    return validate_prediction(
        {
            "instance_id": instance_id,
            "model_name_or_path": model_name_or_path(arm, models, model_label),
            "model_patch": diff_filter.strip_excluded_sections(model_patch),
        }
    )


def prediction_filename(arm: str, rep: int = 1) -> str:
    """Per-arm predictions filename; rep 1 keeps the pilot's filename."""
    if rep < 1:
        raise ValueError("rep must be >= 1")
    suffix = "" if rep == 1 else f"-r{rep}"
    return f"preds-{arm}{suffix}-filtered.jsonl"


def dump_prediction(prediction: Mapping[str, object]) -> str:
    """Serialize exactly as the pilot converter did (one JSONL line)."""
    return json.dumps(validate_prediction(prediction)) + "\n"


def append_prediction(path: Path, prediction: Mapping[str, object]) -> Path:
    """Append one prediction, creating its parent directory if needed."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fh:
        fh.write(dump_prediction(prediction))
    return path


def upsert_prediction(path: Path, prediction: Mapping[str, object]) -> Path:
    """Insert or replace the prediction for one instance in a JSONL file.

    The live runner is resumable and a cell can be regenerated after a
    harness error or an interrupted run.  Keying by instance_id (the file is
    already per arm and per rep) keeps that regeneration from creating a
    duplicate official submission line.
    """
    pred = validate_prediction(prediction)
    path.parent.mkdir(parents=True, exist_ok=True)
    rows = []
    replaced = False
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            row = validate_prediction(json.loads(line))
            if row["instance_id"] == pred["instance_id"]:
                if not replaced:
                    rows.append(pred)
                    replaced = True
                # Drop any older duplicate for the same instance.
                continue
            rows.append(row)
    if not replaced:
        rows.append(pred)
    path.write_text("".join(dump_prediction(row) for row in rows), encoding="utf-8")
    return path


def load_saved_patch(cell_dir: Path) -> str:
    """Load ``solution.diff`` or ``solution.diff.gz`` from one saved cell."""
    plain = cell_dir / "solution.diff"
    if plain.exists():
        return plain.read_text(errors="replace")
    gz = cell_dir / "solution.diff.gz"
    if gz.exists():
        return gzip.decompress(gz.read_bytes()).decode(errors="replace")
    raise FileNotFoundError(f"no solution.diff or solution.diff.gz in {cell_dir}")


def saved_predictions(
    raw_root: Path,
    arm: str,
    model_label: str,
    rep: int = 1,
) -> list[dict[str, str]]:
    """Build predictions for one arm from a saved raw results tree."""
    arm_root = raw_root / arm
    if not arm_root.is_dir():
        raise FileNotFoundError(f"saved raw arm directory not found: {arm_root}")

    predictions = []
    seen = set()
    for instance_dir in sorted(p for p in arm_root.iterdir() if p.is_dir()):
        instance_id = instance_dir.name
        if instance_id in seen:
            raise ValueError(f"duplicate instance_id in saved predictions: {instance_id}")
        seen.add(instance_id)
        patch = load_saved_patch(instance_dir / f"r{rep}")
        predictions.append(
            make_prediction(instance_id, arm, patch, model_label=model_label)
        )
    return predictions


def write_saved_predictions(
    raw_root: Path,
    predictions_dir: Path,
    arms: Sequence[str],
    model_label: str,
    rep: int = 1,
) -> dict[str, Path]:
    """Write one official predictions JSONL per saved arm.

    Existing per-arm files for the requested arms are overwritten with a
    deterministic, instance-sorted export.  Other files in the directory are
    left alone.
    """
    predictions_dir.mkdir(parents=True, exist_ok=True)
    outputs = {}
    for arm in arms:
        preds = saved_predictions(raw_root, arm, model_label, rep=rep)
        path = predictions_dir / prediction_filename(arm, rep)
        path.write_text("".join(dump_prediction(p) for p in preds), encoding="utf-8")
        outputs[arm] = path
    return outputs
