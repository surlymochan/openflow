#!/usr/bin/env python3
import argparse
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="List the canonical lookback sources for a project.",
    )
    parser.add_argument(
        "--project-root",
        default=".",
        help="Project root containing HANDOFF.md, optional AHA.md, and docs/plans.",
    )
    return parser.parse_args()


def top_design_docs(plans_dir: Path, limit: int = 8) -> list[Path]:
    if not plans_dir.exists():
        return []
    docs = sorted(
        [path for path in plans_dir.glob("*.md") if path.is_file()],
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    return docs[:limit]


def main() -> int:
    args = parse_args()
    root = Path(args.project_root).expanduser().resolve()
    handoff = root / "HANDOFF.md"
    aha = root / "AHA.md"
    plans = root / "docs" / "plans"

    print(f"PROJECT_ROOT: {root}")
    print(f"HANDOFF: {'present' if handoff.exists() else 'missing'} {handoff}")
    print(f"AHA: {'present' if aha.exists() else 'missing'} {aha}")
    print("DESIGN_DOCS:")
    for doc in top_design_docs(plans):
        print(f"- {doc}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
