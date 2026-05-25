#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path
from typing import Any

sys.path.append(str(Path(__file__).resolve().parents[2] / "scripts"))

from common import assert_stage_transition_allowed, assert_status_transition_allowed, load_status  # noqa: E402
from doctor import run_doctor_checks  # noqa: E402


BASE_ARTIFACTS = ("proposal.md", "plan.md", "tasks.md", "status.json")


def check(name: str, ok: bool, detail: str, *, severity: str = "error", value: Any | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "name": name,
        "ok": ok,
        "detail": detail,
        "severity": severity,
    }
    if value is not None:
        payload["value"] = value
    return payload


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run deterministic Superflow Yolo gate checks before entering the next workflow phase.",
    )
    parser.add_argument("--project-root", default=".", help="Project root containing specs/changes.")
    parser.add_argument("--change-id", required=True, help="Superflow change id.")
    parser.add_argument(
        "--phase",
        required=True,
        choices=["pre-openissue", "post-openissue", "pre-exec", "pre-archive"],
        help="Named Yolo gate to validate.",
    )
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON output.")
    return parser.parse_args()


def run_yolo_gate(project_root: str | Path, change_id: str, phase: str) -> dict[str, Any]:
    status_path, status = load_status(project_root, change_id)
    project_root_path = Path(project_root).expanduser().resolve()
    change_root = project_root_path / "specs" / "changes" / change_id
    change_type = status.get("change_type", "backend")
    issue_doc_path = change_root / "issue.md"
    checks: list[dict[str, Any]] = []

    checks.append(
        check(
            "status-file",
            status_path.exists(),
            f"Loaded status file {status_path}" if status_path.exists() else f"Missing status file {status_path}",
            value=str(status_path),
        )
    )

    for artifact in BASE_ARTIFACTS:
        artifact_path = change_root / artifact
        checks.append(
            check(
                f"artifact-{artifact}",
                artifact_path.exists(),
                f"Found {artifact}" if artifact_path.exists() else f"Missing required artifact {artifact}",
                value=str(artifact_path),
            )
        )

    checks.append(
        check(
            "artifact-issue-md",
            issue_doc_path.exists(),
            "Found issue.md" if issue_doc_path.exists() else "Missing required issue.md",
            value=str(issue_doc_path),
        )
    )

    needs_design = change_type in {"frontend", "full-stack"}
    if needs_design:
        design_path = change_root / "design.md"
        checks.append(
            check(
                "artifact-design-md",
                design_path.exists(),
                "Found design.md for UI-bearing change" if design_path.exists() else "Missing design.md for frontend/full-stack change",
                value=str(design_path),
            )
        )
        checks.append(
            check(
                "design-alignment-not-rejected",
                status.get("design_aligned") != "no",
                "design_aligned is not rejected" if status.get("design_aligned") != "no" else "design_aligned=no blocks further Yolo progression",
                value=status.get("design_aligned"),
            )
        )

    current_stage = status.get("current_stage")
    status_value = status.get("status")
    verification_status = status.get("verification_status")
    archival_status = status.get("archival_status")
    repo = status.get("target_repo")
    issue_number = status.get("issue_number")
    branch_name = status.get("branch_name")
    checkout_path = status.get("checkout_path")
    issue_title = status.get("issue_title") or status.get("title")
    issue_body = issue_doc_path.read_text(encoding="utf-8") if issue_doc_path.exists() else None
    checkout_exists = bool(checkout_path) and Path(checkout_path).expanduser().exists()

    if phase == "pre-openissue":
        stage_ok = True
        status_ok = True
        try:
            assert_stage_transition_allowed(current_stage, "plan", current_status=status_value)
        except SystemExit as exc:
            stage_ok = False
            stage_detail = str(exc)
        else:
            stage_detail = f"current_stage={current_stage} can advance to plan/openissue"
        try:
            assert_status_transition_allowed(status_value, "active")
        except SystemExit as exc:
            status_ok = False
            status_detail = str(exc)
        else:
            status_detail = f"status={status_value} can advance to active"
        checks.append(
            check(
                "stage-ready-for-openissue",
                stage_ok,
                stage_detail,
                value=current_stage,
            )
        )
        checks.append(check("status-ready-for-openissue", status_ok, status_detail, value=status_value))
        checks.append(
            check(
                "archival-not-finished",
                archival_status != "archived",
                "Change is not archived yet" if archival_status != "archived" else "Change is already archived",
                value=archival_status,
            )
        )
        checks.append(check("issue-title-present", bool(issue_title), "Issue title is present" if issue_title else "Issue title is required before openissue", value=issue_title))
        checks.append(check("issue-body-present", bool(issue_body and issue_body.strip()), "issue.md has body content" if issue_body and issue_body.strip() else "issue.md must contain body content before openissue", value=str(issue_doc_path)))
    elif phase == "post-openissue":
        checks.extend(
            [
                check("status-target-repo", bool(repo), "target_repo recorded" if repo else "target_repo missing after openissue", value=repo),
                check("status-issue-number", bool(issue_number), "issue_number recorded" if issue_number else "issue_number missing after openissue", value=issue_number),
                check("status-branch-name", bool(branch_name), "branch_name recorded" if branch_name else "branch_name missing after openissue", value=branch_name),
                check("status-checkout-path", bool(checkout_path), "checkout_path recorded" if checkout_path else "checkout_path missing after openissue", value=checkout_path),
                check("issue-title-present", bool(issue_title), "Issue title is present" if issue_title else "Issue title is required", value=issue_title),
                check("issue-body-present", bool(issue_body and issue_body.strip()), "issue.md has body content" if issue_body and issue_body.strip() else "issue.md must contain body content", value=str(issue_doc_path)),
                check("checkout-path-exists", checkout_exists, "checkout_path exists" if checkout_exists else "checkout_path must point to an existing checkout", value=checkout_path),
            ]
        )
    elif phase == "pre-exec":
        stage_ok = True
        status_ok = True
        try:
            assert_stage_transition_allowed(current_stage, "tdd", current_status=status_value)
        except SystemExit as exc:
            stage_ok = False
            stage_detail = str(exc)
        else:
            stage_detail = f"current_stage={current_stage} can advance to tdd/exec"
        try:
            assert_status_transition_allowed(status_value, "active")
        except SystemExit as exc:
            status_ok = False
            status_detail = str(exc)
        else:
            status_detail = f"status={status_value} can advance/remain active"
        checks.extend(
            [
                check("status-target-repo", bool(repo), "target_repo recorded" if repo else "target_repo missing before exec", value=repo),
                check("status-issue-number", bool(issue_number), "issue_number recorded" if issue_number else "issue_number missing before exec", value=issue_number),
                check("status-branch-name", bool(branch_name), "branch_name recorded" if branch_name else "branch_name missing before exec", value=branch_name),
                check("status-checkout-path", bool(checkout_path), "checkout_path recorded" if checkout_path else "checkout_path missing before exec", value=checkout_path),
                check("issue-title-present", bool(issue_title), "Issue title is present" if issue_title else "Issue title is required", value=issue_title),
                check("checkout-path-exists", checkout_exists, "checkout_path exists" if checkout_exists else "checkout_path must point to an existing checkout", value=checkout_path),
                check(
                    "stage-ready-for-exec",
                    stage_ok,
                    stage_detail,
                    value=current_stage,
                ),
                check("status-ready-for-exec", status_ok, status_detail, value=status_value),
                check(
                    "status-not-archived",
                    archival_status != "archived",
                    "Change is not archived yet" if archival_status != "archived" else "Change is already archived",
                    value=archival_status,
                ),
            ]
        )
    elif phase == "pre-archive":
        stage_ok = True
        status_done_ok = True
        try:
            assert_stage_transition_allowed(
                current_stage,
                "archive",
                current_status=status_value,
                allow_terminal_status_override=("done", "blocked"),
            )
        except SystemExit as exc:
            stage_ok = False
            stage_detail = str(exc)
        else:
            stage_detail = f"current_stage={current_stage} / status={status_value} can advance to archive"
        try:
            if status_value == "blocked":
                assert_status_transition_allowed(status_value, "blocked", allow_terminal_status_override=("blocked",))
            elif status_value == "done":
                assert_status_transition_allowed(status_value, "done", allow_terminal_status_override=("done",))
            else:
                assert_status_transition_allowed(status_value, "done")
        except SystemExit as exc:
            status_done_ok = False
            status_done_detail = str(exc)
        else:
            status_done_detail = f"status={status_value} can advance/finalize for archive"
        checks.extend(
            [
                check("status-target-repo", bool(repo), "target_repo recorded" if repo else "target_repo missing before archive", value=repo),
                check("status-issue-number", bool(issue_number), "issue_number recorded" if issue_number else "issue_number missing before archive", value=issue_number),
                check("status-branch-name", bool(branch_name), "branch_name recorded" if branch_name else "branch_name missing before archive", value=branch_name),
                check("status-checkout-path", bool(checkout_path), "checkout_path recorded" if checkout_path else "checkout_path missing before archive", value=checkout_path),
                check(
                    "verification-ready",
                    verification_status == "passed" or status_value == "blocked",
                    "Verification is passed or change is blocked" if (verification_status == "passed" or status_value == "blocked") else "verification_status must be passed before archive unless change is blocked",
                    value={"status": status_value, "verification_status": verification_status},
                ),
                check(
                    "stage-ready-for-archive",
                    stage_ok,
                    stage_detail,
                    value={"current_stage": current_stage, "status": status_value},
                ),
                check("status-ready-for-archive", status_done_ok, status_done_detail, value=status_value),
            ]
        )

    doctor_phases = {"post-openissue", "pre-exec", "pre-archive"}
    doctor_should_run = phase in doctor_phases and all([repo, issue_number, branch_name, checkout_path])
    if doctor_should_run:
        doctor_result = run_doctor_checks(
            project_root=project_root_path,
            change_id=change_id,
            repo=repo,
            issue_number=int(issue_number),
            branch_name=branch_name,
            checkout_path_override=checkout_path,
        )
        checks.append(
            check(
                "doctor-gate",
                doctor_result["ok"],
                "doctor checks passed" if doctor_result["ok"] else "doctor checks failed",
                value={"hard_failures": doctor_result["hard_failures"], "warnings": doctor_result["warnings"]},
            )
        )
    elif phase in doctor_phases:
        checks.append(
            check(
                "doctor-gate",
                False,
                "doctor prerequisites missing from status.json",
                value={
                    "target_repo": repo,
                    "issue_number": issue_number,
                    "branch_name": branch_name,
                    "checkout_path": checkout_path,
                },
            )
        )

    ok = all(item["ok"] or item["severity"] == "warn" for item in checks)
    hard_failures = [item for item in checks if not item["ok"] and item["severity"] != "warn"]
    warnings = [item for item in checks if not item["ok"] and item["severity"] == "warn"]
    return {
        "change_id": change_id,
        "phase": phase,
        "ok": ok,
        "hard_failures": len(hard_failures),
        "warnings": len(warnings),
        "checks": checks,
    }


def main() -> int:
    args = parse_args()
    result = run_yolo_gate(args.project_root, args.change_id, args.phase)
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(f"Yolo gate: {result['phase']} for {result['change_id']}")
        for item in result["checks"]:
            prefix = "PASS" if item["ok"] else ("WARN" if item["severity"] == "warn" else "FAIL")
            print(f"[{prefix}] {item['name']}: {item['detail']}")
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
