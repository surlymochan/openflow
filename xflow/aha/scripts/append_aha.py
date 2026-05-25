#!/usr/bin/env python3
import argparse
from datetime import date
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Append a structured aha entry to the canonical root AHA.md.",
    )
    parser.add_argument("--project-root", default=".", help="Project root containing AHA.md.")
    parser.add_argument("--title", required=True, help="Short aha title.")
    parser.add_argument("--insight", required=True, help="Core insight.")
    parser.add_argument("--why", required=True, help="Why this matters.")
    parser.add_argument("--action", required=True, help="Required workflow/design action.")
    parser.add_argument("--evidence", action="append", default=[], help="Evidence anchor. Can be repeated.")
    return parser.parse_args()


def ensure_header(path: Path) -> None:
    if path.exists():
        return
    path.write_text("# AHA\n\n## Active Ahas\n", encoding="utf-8")


def main() -> int:
    args = parse_args()
    root = Path(args.project_root).expanduser().resolve()
    aha_path = root / "AHA.md"
    ensure_header(aha_path)

    entry_lines = [
        "",
        f"### {date.today().isoformat()} — {args.title.strip()}",
        f"- Insight: {args.insight.strip()}",
        f"- Why It Matters: {args.why.strip()}",
        f"- Action: {args.action.strip()}",
    ]
    if args.evidence:
        entry_lines.append("- Evidence:")
        for item in args.evidence:
            entry_lines.append(f"  - {item.strip()}")

    with aha_path.open("a", encoding="utf-8") as handle:
        handle.write("\n".join(entry_lines) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
