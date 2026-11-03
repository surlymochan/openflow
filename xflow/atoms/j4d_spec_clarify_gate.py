#!/usr/bin/env python3
"""
J4d.spec_clarify.gate - Deterministic SPEC clarification gate.

Runs BEFORE the implementation loop (proposal-consistency stage). J4a checks
that spec files are structurally consistent and J4b reviews the delta after
the fact; neither asks whether the spec is clear enough to implement from.
This gate scans the change's spec documents for ambiguity that predictably
turns into extra implementation loops, and for every finding emits a concrete
clarification question that a human or agent can answer directly:

  1. unquantified_normative - a MUST/SHALL (or Chinese normative) statement
     with no measurable anchor (number, unit, literal, comparison, or a
     normative return/be/equal clause as parsed by tdd_lib).
  2. missing_when_then      - a Scenario block without a WHEN trigger or a
     THEN observable outcome.
  3. vague_term             - a vague quality word (EN + CN) that the same
     line does not quantify.
  4. unresolved_placeholder - TBD/TODO/<placeholder>/Chinese pending markers
     left inside a requirement.

False-positive control is the design constraint: fenced code is ignored,
prohibitions (MUST NOT ...) are exempt from (1) because absence is testable,
a vague word quantified on the same line is not reported, a line already
flagged by (1) is not double-flagged by (3), and pronoun/acronym guessing is
deliberately NOT implemented. Output is structured JSON plus a markdown
checklist (spec_clarify.json / spec_clarify.md in the change dir).
"""
import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import tdd_lib

GENERATED_FILES = {"spec_delta_review.md", "spec_clarify.md"}

# --- measurable anchors -----------------------------------------------------
DIGIT = re.compile(r"\d")
LITERAL = re.compile(r"`[^`]+`|\"[^\"]+\"|'[^']+'")
COMPARISON = re.compile(
    r"(>=|<=|==|>|<|\bat least\b|\bat most\b|\bno more than\b|\bwithin\b|"
    r"不超过|不低于|至少|至多|以内|以上|以下)",
    re.IGNORECASE,
)

# --- normative markers ------------------------------------------------------
NORMATIVE_EN = re.compile(r"\b(MUST|SHALL)\b")
NORMATIVE_CN = re.compile(r"(必须|应当|须确保|须)")
PROHIBITION = re.compile(r"\b(MUST|SHALL)\s+NOT\b|禁止|不得", re.IGNORECASE)

# Quality / abstract words that make a normative statement untestable when
# nothing on the line pins them down.
QUALITY_WORDS = [
    "fast", "quickly", "slow", "responsive", "efficient", "scalable",
    "reliable", "robust", "stable", "secure", "flexible", "intuitive",
    "user-friendly", "seamless", "performant", "high-performance",
    "low-latency", "real-time",
    "快速", "高效", "低延迟", "高性能", "稳定", "可靠", "灵活", "实时", "友好",
]
ABSTRACT_VERBS = re.compile(
    r"\b(handle|support|ensure|provide|manage|process)\b", re.IGNORECASE
)
ABSTRACT_NOUNS = [
    "errors", "performance", "security", "scalability", "reliability",
    "load", "traffic",
]

# --- vague terms (category 3) ----------------------------------------------
VAGUE_TERMS = {
    # performance dimension -> threshold question
    "fast": "perf", "quickly": "perf", "slow": "perf", "slowly": "perf",
    "responsive": "perf", "efficient": "perf", "efficiently": "perf",
    "low-latency": "perf", "high-performance": "perf",
    "快速": "perf", "高效": "perf", "低延迟": "perf", "高性能": "perf",
    "及时": "perf", "尽快": "perf",
    # quality dimension -> criterion question
    "properly": "criterion", "appropriate": "criterion",
    "appropriately": "criterion", "reasonable": "criterion",
    "reasonably": "criterion", "user-friendly": "criterion",
    "intuitive": "criterion", "robust": "criterion", "seamless": "criterion",
    "adequate": "criterion", "sufficient": "criterion", "flexible": "criterion",
    "合理": "criterion", "适当": "criterion", "妥善": "criterion",
    "友好": "criterion", "易用": "criterion", "良好": "criterion",
    "足够": "criterion", "灵活": "criterion", "稳定": "criterion",
    "可靠": "criterion",
    # scale dimension -> capacity question
    "scalable": "scale", "large-scale": "scale",
    "可扩展": "scale",
}

PLACEHOLDERS = [
    (re.compile(r"\bTBD\b|\bTODO\b|\bXXX\b|\?\?\?"), "placeholder"),
    (re.compile(r"<[a-z][a-z0-9_-]*>"), "placeholder"),
    (re.compile(r"待定|待补充|待确认|未定|后续再定"), "placeholder"),
]

SCENARIO_START = re.compile(
    r"^\s*(?:#{1,4}\s*)?(?:Scenario|场景)(?=[\s:：]|$)\s*[:：]?\s*(.*)$",
    re.IGNORECASE,
)
HEADING = re.compile(r"^\s*#{1,4}\s+")
WHEN = re.compile(r"\bWHEN\b|当[^。；\n]{0,60}时")
THEN = re.compile(r"\bTHEN\b|则|期望结果|预期结果")


CONCRETE_CLAUSE_VALUES = {"true", "false", "null", "none", "nil"}


def has_anchor(line: str, clauses: list[dict], line_number: int) -> bool:
    if DIGIT.search(line) or LITERAL.search(line) or COMPARISON.search(line):
        return True
    # A normative clause (MUST return/be/equal <value>) is only an anchor when
    # its value is concrete. "MUST be fast" parses as a clause with value
    # "fast" in tdd_lib, but a vague value pins nothing down.
    vague_values = {t.lower() for t in VAGUE_TERMS} | {w.lower() for w in QUALITY_WORDS}
    for clause in clauses:
        if clause["line"] != line_number:
            continue
        value = clause["value"]
        if DIGIT.search(value) or value in CONCRETE_CLAUSE_VALUES or value not in vague_values:
            return True
    return False


def question_for_dimension(dimension: str, term: str, excerpt: str) -> str:
    if dimension == "perf":
        return (
            f"「{term}」的验收阈值是多少？请给数值+单位（如 p95 ≤ N ms）、"
            f"测量方法与负载条件（并发/数据量），原文：{excerpt}"
        )
    if dimension == "scale":
        return (
            f"「{term}」的目标规模是多少？请给并发量、数据量或增长率的"
            f"具体数值与验证方式，原文：{excerpt}"
        )
    return (
        f"「{term}」的判定标准是什么？请给可测的验收条件"
        f"（数值、枚举或明确的通过/失败判据），原文：{excerpt}"
    )


def strip_code_blocks(text: str) -> list[str]:
    """Return lines with fenced code blocks blanked out (line numbers kept)."""
    out = []
    in_fence = False
    for line in text.splitlines():
        if line.strip().startswith("```"):
            in_fence = not in_fence
            out.append("")
            continue
        out.append("" if in_fence else line)
    return out


def scan_file(path: Path, display: str) -> list[dict]:
    text = path.read_text(encoding="utf-8")
    lines = strip_code_blocks(text)
    clauses = tdd_lib.normative_clauses(text, display)
    findings: list[dict] = []

    def add(category, line_no, excerpt, question, term=None):
        findings.append({
            "id": f"{display}:{line_no}:{category}",
            "category": category,
            "severity": "blocker",
            "file": display,
            "line": line_no,
            "excerpt": excerpt.strip()[:200],
            "term": term,
            "question": question,
        })

    normative_lines: set[int] = set()

    # Categories 1, 3, 4 - line level.
    for idx, raw in enumerate(lines, start=1):
        line = raw.strip()
        if not line or HEADING.match(raw):
            continue
        is_normative = bool(NORMATIVE_EN.search(line) or NORMATIVE_CN.search(line))
        anchored = has_anchor(line, clauses, idx)

        if is_normative and not PROHIBITION.search(line):
            quality_hit = next(
                (w for w in QUALITY_WORDS if w.lower() in line.lower()), None
            )
            abstract_hit = bool(
                ABSTRACT_VERBS.search(line)
                and any(n in line.lower() for n in ABSTRACT_NOUNS)
            )
            if not anchored and (quality_hit or abstract_hit):
                term = quality_hit or "unquantified"
                dimension = VAGUE_TERMS.get(term.lower(), "criterion") if quality_hit else "criterion"
                add(
                    "unquantified_normative", idx, line,
                    question_for_dimension(dimension, term, line[:80]),
                    term=term,
                )
                normative_lines.add(idx)

        # Vague terms: skip lines already flagged as normative, and lines
        # where the same line quantifies the claim.
        if idx not in normative_lines and not anchored:
            lowered = line.lower()
            for term, dimension in VAGUE_TERMS.items():
                if term in lowered:
                    add(
                        "vague_term", idx, line,
                        question_for_dimension(dimension, term, line[:80]),
                        term=term,
                    )
                    break

        for pattern, _kind in PLACEHOLDERS:
            match = pattern.search(line)
            if match:
                add(
                    "unresolved_placeholder", idx, line,
                    f"「{match.group(0)}」尚未定值：它的最终取值/定义是什么、"
                    f"由谁在开工前定？原文：{line[:80]}",
                    term=match.group(0),
                )
                break

    # Category 2 - scenario blocks.
    idx = 0
    while idx < len(lines):
        match = SCENARIO_START.match(lines[idx])
        if not match:
            idx += 1
            continue
        title = (match.group(1) or "").strip() or "(untitled)"
        start = idx
        block = [lines[idx]]
        idx += 1
        while idx < len(lines) and not SCENARIO_START.match(lines[idx]) and not HEADING.match(lines[idx]):
            block.append(lines[idx])
            idx += 1
        block_text = "\n".join(block)
        missing = []
        if not WHEN.search(block_text):
            missing.append("WHEN（触发条件）")
        if not THEN.search(block_text):
            missing.append("THEN（可观察的期望结果）")
        if missing:
            add(
                "missing_when_then", start + 1, lines[start],
                f"场景「{title}」缺 {' 和 '.join(missing)}：触发条件是什么？"
                f"触发后可观察的期望结果是什么（状态码/输出/副作用）？",
                term=title,
            )

    return findings


def collect_change_files(change_dir: Path) -> list[Path]:
    files: list[Path] = []
    for name in ["proposal.md", "plan.md"]:
        candidate = change_dir / name
        if candidate.exists():
            files.append(candidate)
    for candidate in sorted(change_dir.rglob("*.md")):
        if candidate.name in GENERATED_FILES:
            continue
        if candidate not in files:
            files.append(candidate)
    return files


def render_markdown(report: dict) -> str:
    lines = [
        "# Spec Clarification Gate",
        "",
        f"- Change: `{report['change_id']}`",
        f"- Verdict: `{report['verdict']}`",
        f"- Findings: {report['summary']['findings']}",
        "",
        "## Clarification questions (answer in the spec before the implementation loop)",
        "",
    ]
    if report["clarification_questions"]:
        lines.extend(
            f"- [ ] ({f['category']} {f['file']}:{f['line']}) {f['question']}"
            for f in report["findings"]
        )
    else:
        lines.append("- None - the spec is clear enough to implement from.")
    return "\n".join(lines).rstrip() + "\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", default=".")
    parser.add_argument("--change-id", default="")
    parser.add_argument(
        "--file", action="append", dest="files", default=[],
        help="Scan this spec file directly (repeatable); overrides change-dir scan",
    )
    args = parser.parse_args()

    project_root = Path(args.project_root).resolve()
    change_dir = project_root / "specs" / "changes" / args.change_id if args.change_id else None

    targets: list[tuple[Path, str]] = []
    if args.files:
        for raw in args.files:
            path = Path(raw)
            if not path.is_absolute():
                path = project_root / raw
            targets.append((path, raw))
    elif change_dir is not None:
        for path in collect_change_files(change_dir):
            targets.append((path, str(path.relative_to(project_root))))

    findings: list[dict] = []
    scanned: list[str] = []
    for path, display in targets:
        if not path.exists():
            findings.append({
                "id": f"{display}:0:missing_input",
                "category": "missing_input",
                "severity": "blocker",
                "file": display,
                "line": 0,
                "excerpt": "",
                "term": None,
                "question": f"规格文件 {display} 不存在：先补齐 spec 再过澄清门禁。",
            })
            continue
        scanned.append(display)
        findings.extend(scan_file(path, display))

    by_category: dict[str, int] = {}
    for finding in findings:
        by_category[finding["category"]] = by_category.get(finding["category"], 0) + 1

    report = {
        "ok": len(findings) == 0,
        "gate": "J4d.spec_clarify.gate",
        "verdict": "pass" if not findings else "needs_clarification",
        "change_id": args.change_id,
        "files_scanned": scanned,
        "summary": {
            "findings": len(findings),
            "by_category": by_category,
            "questions": len(findings),
        },
        "findings": findings,
        "clarification_questions": [f["question"] for f in findings],
        "advice": (
            "Answer every clarification question in the spec, then re-run this "
            "gate before entering the implementation loop."
            if findings else "Spec is clear enough to implement from."
        ),
        "recorded_at": datetime.now(timezone.utc).isoformat(),
    }

    if change_dir is not None and not args.files:
        change_dir.mkdir(parents=True, exist_ok=True)
        (change_dir / "spec_clarify.json").write_text(
            json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        (change_dir / "spec_clarify.md").write_text(render_markdown(report), encoding="utf-8")

    print(json.dumps(report, indent=2, ensure_ascii=False))
    sys.exit(0 if report["ok"] else 1)


if __name__ == "__main__":
    main()
