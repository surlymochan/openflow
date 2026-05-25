#!/usr/bin/env python3
import argparse
from pathlib import Path


SECTION_HEADERS = [
    "Current State",
    "Context Pack",
    "Project Background",
    "Architecture",
    "Current Objective",
    "Progress",
    "Open Problems",
    "Lessons Learned",
    "Recommendations",
    "Key Files",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract a compact digest from the canonical root HANDOFF.md and AHA.md.",
    )
    parser.add_argument(
        "--project-root",
        default=".",
        help="Project root containing HANDOFF.md and optional AHA.md.",
    )
    return parser.parse_args()


def extract_sections(text: str) -> list[tuple[str, list[str]]]:
    sections: list[tuple[str, list[str]]] = []
    current_name = "Preamble"
    current_lines: list[str] = []

    for line in text.splitlines():
        if line.startswith("## "):
            sections.append((current_name, current_lines))
            current_name = line[3:].strip()
            current_lines = []
            continue
        current_lines.append(line)

    sections.append((current_name, current_lines))
    return sections


def first_content_lines(lines: list[str], limit: int = 3) -> list[str]:
    content = [line.strip() for line in lines if line.strip()]
    return content[:limit]


def main() -> int:
    args = parse_args()
    project_root = Path(args.project_root).expanduser().resolve()
    handoff_path = project_root / "HANDOFF.md"
    aha_path = project_root / "AHA.md"
    if not handoff_path.exists():
      raise SystemExit(f"Missing canonical handoff: {handoff_path}")

    text = handoff_path.read_text(encoding="utf-8")
    sections = dict(extract_sections(text))

    print(f"HANDOFF: {handoff_path}")
    for name in SECTION_HEADERS:
        lines = sections.get(name)
        if not lines:
            continue
        digest = first_content_lines(lines)
        if not digest:
            continue
        print(f"\n[{name}]")
        for line in digest:
            print(line)

    if aha_path.exists():
        aha_lines = [line.strip() for line in aha_path.read_text(encoding="utf-8").splitlines() if line.strip()]
        digest = aha_lines[:12]
        if digest:
            print(f"\n[AHA] {aha_path}")
            for line in digest:
                print(line)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
