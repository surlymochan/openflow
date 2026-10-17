"""Arms for the SWE-bench Verified head-to-head. Every model call goes through run_pi.sh
(Pi coding agent + the one MiniMax model configured there), so the workflow is the only variable."""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import time
from pathlib import Path

import swe_env as E

RUN_PI = os.environ.get("RUN_PI", "<pi>/run_pi.sh")
DEPS = Path(os.environ.get("BENCH_DEPS", "<agents>/gity/bench-deps"))
SUPERPOWERS = DEPS / "superpowers"
OPENFLOW_PREFIX = E.ROOT / "deps" / "openflow-prefix"
OPENFLOW_TGZ = E.ROOT / "deps" / "surlymochan-openflow-0.2.1.tgz"
OPENSWARM_DIR = Path(os.environ.get("OPENSWARM_DIR", "<openswarm>"))
NODE22_BIN = "<node22>/bin"
CAP_S = 20 * 60
GIT = E.GIT

# Dead-end proxy (port 9 = discard) plus offline installer flags: the agent's shell gets no
# package-index or general web access, while the model API host stays reachable via no_proxy.
NO_NET_ENV = {
    "http_proxy": "http://127.0.0.1:9",
    "https_proxy": "http://127.0.0.1:9",
    "HTTP_PROXY": "http://127.0.0.1:9",
    "HTTPS_PROXY": "http://127.0.0.1:9",
    "ALL_PROXY": "http://127.0.0.1:9",
    "all_proxy": "http://127.0.0.1:9",
    "no_proxy": "api.minimaxi.com,api.deepseek.com,localhost,127.0.0.1",
    "NO_PROXY": "api.minimaxi.com,api.deepseek.com,localhost,127.0.0.1",
    "PIP_NO_INDEX": "1",
    "UV_OFFLINE": "1",
    "PIP_DISABLE_PIP_VERSION_CHECK": "1",
}

TAIL = "Implement it; run the relevant tests."


def base_prompt(inst, repo: Path, venv: Path) -> str:
    return (
        f"Resolve the GitHub issue below in the {inst['repo']} repository, checked out in the current "
        f"directory ({repo}).\n\n"
        f"The Python environment for this checkout is {venv}/bin/python (first on PATH as `python`); "
        f"the project is installed in it in editable mode. Run tests with: {E.visible_command(inst, venv)}\n\n"
        "Edit the non-test source files so the issue is resolved, keeping behaviour the issue does not ask to change.\n\n"
        f"<issue>\n{inst['problem_statement'].strip()}\n</issue>\n\n{TAIL}"
    )


# ---- privacy gate mirror (same patterns as run_pi.sh) so a refusal is caught before a run
_PATS = [r"(sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|xox[abp]-[A-Za-z0-9-]{10,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,})",
         r"-----BEGIN [A-Z ]*PRIVATE KEY-----", r"(?i)(password|passwd|密码)\s*[:=：]\s*\S+",
         r"(8/29|8月29|八月二十九|体检|病历|诊断|就医|用药|健康状况|银行卡|信用卡|卡号|CVV)"]


def gate_hits(t: str) -> list[str]:
    bad = [p for p in _PATS if re.search(p, t)]
    for m in re.finditer(r"(?:\d[ -]?){13,19}", t):
        d = [int(c) for c in m.group() if c.isdigit()]
        s = sum(x if i % 2 == len(d) % 2 else (x * 2 - 9 if x * 2 > 9 else x * 2) for i, x in enumerate(d))
        if s % 10 == 0:
            bad.append("card-like:" + m.group())
    return bad


def pi_events_usage(path: Path) -> dict:
    u = {"input": 0, "output": 0, "cache_read": 0, "cache_write": 0, "turns": 0, "tool_calls": 0, "errors": []}
    if not path or not path.exists():
        return u
    for line in path.open(errors="replace"):
        try:
            e = json.loads(line)
        except Exception:
            continue
        if e.get("type") == "tool_execution_start":
            u["tool_calls"] += 1
        if e.get("type") == "message_end":
            m = e.get("message") or {}
            if m.get("role") != "assistant":
                continue
            u["turns"] += 1
            us = m.get("usage") or {}
            u["input"] += us.get("input", 0) or 0
            u["output"] += us.get("output", 0) or 0
            u["cache_read"] += us.get("cacheRead", 0) or 0
            u["cache_write"] += us.get("cacheWrite", 0) or 0
            if m.get("stopReason") == "error" or m.get("errorMessage"):
                u["errors"].append((m.get("errorMessage") or "error")[:300])
    return u


def run_pi(task_id: str, workdir: Path, prompt: str, events: Path, timeout: int, env_extra: dict | None = None,
           label: str = "agent") -> dict:
    events.mkdir(parents=True, exist_ok=True)
    pf = events / f"{label}-prompt.md"
    pf.write_text(prompt)
    env = dict(os.environ)
    env.pop("VIRTUAL_ENV", None)
    env.update(env_extra or {})
    t0 = time.time()
    p = subprocess.run([RUN_PI, "--task-id", task_id, "--rw", "--workdir", str(workdir), "--timeout", str(int(timeout)),
                        "--effort", "medium", "--prompt-file", str(pf)],
                       env=env, text=True, capture_output=True, stdin=subprocess.DEVNULL)
    wall = time.time() - t0
    rec = None
    for line in reversed(p.stdout.strip().splitlines()):
        try:
            rec = json.loads(line)
            break
        except Exception:
            continue
    (events / f"{label}-run_pi.stderr.txt").write_text(p.stderr[-5000:])
    out = {"label": label, "rc": p.returncode, "wall_s": round(wall, 1), "record": rec}
    if rec and rec.get("events_file"):
        src = Path(rec["events_file"])
        if src.exists():
            shutil.copy(src, events / f"{label}-events.jsonl")
        out["usage"] = pi_events_usage(events / f"{label}-events.jsonl")
    else:
        out["usage"] = pi_events_usage(None)
    return out


def path_env(venv: Path, *extra: str) -> dict:
    """PATH for the agent's shell plus NO_NET_ENV.

    The agent must work fully offline: it must not download newer upstream releases (which may
    already contain the fix being evaluated) or otherwise reach the package index / web, while
    the model API host stays reachable through no_proxy.
    """
    env = {"PATH": ":".join([f"{venv}/bin", *extra, os.environ["PATH"]])}
    env.update(NO_NET_ENV)
    return env


# ---------------------------------------------------------------- arms

def arm_baseline(inst, repo, venv, events, tid):
    return [run_pi(tid, repo, base_prompt(inst, repo, venv), events, CAP_S, path_env(venv))]


def _frontmatter(text):
    m = re.match(r"^---\n([\s\S]*?)\n---\n", text)
    meta = {}
    if m:
        for line in m.group(1).splitlines():
            if ":" in line and not line.startswith(" "):
                k, v = line.split(":", 1)
                meta[k.strip()] = v.strip().strip('"').strip("'")
    return meta, (text[m.end():] if m else text).strip()


def superpowers_context() -> str:
    """What superpowers v7.0.0's Pi package puts in front of the model: Pi's native skill list for
    the package's skills dir (resources_discover) and the using-superpowers bootstrap message
    (.pi/extensions/superpowers.ts). run_pi.sh runs with --no-extensions --no-skills, so the same
    text is placed at the top of the prompt instead."""
    tag = subprocess.run(["git", "-C", str(SUPERPOWERS), "describe", "--tags", "--exact-match"],
                         capture_output=True, text=True).stdout.strip()
    if tag != "v7.0.0":
        raise SystemExit(f"superpowers checkout is {tag!r}, expected v7.0.0")
    ext = (SUPERPOWERS / ".pi" / "extensions" / "superpowers.ts").read_text()
    mapping = re.search(r"function piToolMapping\(\): string \{\n\treturn `([\s\S]*?)`;\n\}", ext).group(1)
    mapping = mapping.replace("\\`", "`")
    lines = ["The following skills provide specialized instructions for specific tasks.",
             "Use the read tool to load a skill's file when the task matches its description.",
             "When a skill file references a relative path, resolve it against the skill directory (parent of SKILL.md / dirname of the path) and use that absolute path in tool commands.",
             "", "<available_skills>"]
    esc = lambda s: s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;").replace("'", "&apos;")
    for sk in sorted((SUPERPOWERS / "skills").glob("*/SKILL.md")):
        meta, _ = _frontmatter(sk.read_text())
        lines += ["  <skill>", f"    <name>{esc(meta.get('name', sk.parent.name))}</name>",
                  f"    <description>{esc(meta.get('description', ''))}</description>",
                  f"    <location>{sk}</location>", "  </skill>"]
    lines.append("</available_skills>")
    _, body = _frontmatter((SUPERPOWERS / "skills" / "using-superpowers" / "SKILL.md").read_text())
    boot = ("<EXTREMELY_IMPORTANT>\nsuperpowers:using-superpowers bootstrap for pi\n\nYou have superpowers.\n\n"
            "The using-superpowers skill content is included below and is already loaded for this Pi session. "
            "Follow it now. Do not try to load using-superpowers again.\n\n"
            f"{body}\n\n{mapping}\n</EXTREMELY_IMPORTANT>")
    return "\n".join(lines) + "\n\n" + boot


def arm_superpowers(inst, repo, venv, events, tid):
    prompt = superpowers_context() + "\n\n" + base_prompt(inst, repo, venv) + "\nUse the installed skills for this change."
    return [run_pi(tid, repo, prompt, events, CAP_S, path_env(venv))]


AGENTS_MD = """# OpenFlow project entry

Use openflow as the workflow source of truth. The tooling matrix for this install is `{matrix}`
(Generic CLI Agent row: `xflow assess --json`).
Start with `xflow guide`, then run
`xflow goal set "<project direction>" --project-root .`, `xflow doctor --project-root .`,
`xflow goal audit --project-root . --json`, and `xflow workflow validate yolo --project-root .`.
For implementation, use `xflow:plan` first, then `xflow:yolo` or `xflow:corps`
without re-planning. Preserve the split TDD order: tdd-red before execute,
tdd-green after execute, with I6c quality proof.
Skill entry docs from this install: `{skills}`.
`xflow` is on PATH. Local contract: `.as-xflow/config.json`.
"""


def arm_openflow(inst, repo, venv, events, tid):
    pkg = OPENFLOW_PREFIX / "lib" / "node_modules" / "@surlymochan" / "openflow"
    version = json.loads((pkg / "package.json").read_text())["version"]
    if version != "0.2.1":
        raise SystemExit(f"openflow install is {version}, expected 0.2.1")
    env = path_env(venv, f"{OPENFLOW_PREFIX}/bin", NODE22_BIN)
    full_env = dict(os.environ, **env)
    E.sh(["xflow", "init", "--project-root", str(repo)], env=full_env)
    (repo / "AGENTS.md").write_text(AGENTS_MD.format(matrix=pkg / "docs" / "tooling-matrix.md", skills=pkg / "xflow"))
    E.sh(GIT + ["add", "-A"], cwd=repo)
    E.sh(GIT + ["commit", "-q", "-m", "Install OpenFlow project entry", "--no-verify"], cwd=repo)
    (events / "measure-from.txt").write_text(E.sh(GIT + ["rev-parse", "HEAD"], cwd=repo).stdout.strip())
    (events / "tool-version.json").write_text(json.dumps({"name": "openflow", "version": version,
                                                          "tarball_sha256": "49d17f9af87c04a85fe4fb4395da7b64249da65a5701fe22f1f44600e171b03f"}))
    prompt = base_prompt(inst, repo, venv) + "\nUse the installed workflow tool for this change."
    return [run_pi(tid, repo, prompt, events, CAP_S, env)]


PLANNER = """You are the planner in an openswarm workflow. Read the skill and the engineering task.
Write one self-contained task file for an executor that has none of this conversation.

Write that file, and only that file, to:
{task_file}

The file must include the goal, the files or areas to change, constraints, and acceptance criteria.
Also write a single shell command that checks the change (for example a pytest invocation of the
relevant existing test file, run from the repository root with {python}) to:
{verify_file}

The repository is {repo}. Do not modify any file inside the repository. Do not commit. The executor starts from a clean worktree.

## openswarm skill

{skill}

## engineering task

{task}
"""


def arm_openswarm(inst, repo, venv, events, tid):
    rundir = repo.parent
    pdir = rundir / "planner"
    pdir.mkdir(exist_ok=True)
    task_file, verify_file = pdir / "executor-task.md", pdir / "verify.txt"
    commit = E.sh(["git", "-C", str(OPENSWARM_DIR), "rev-parse", "HEAD"]).stdout.strip()
    (events / "tool-version.json").write_text(json.dumps({"name": "openswarm", "commit": commit, "backend": "pi"}))
    t0 = time.time()
    plan = PLANNER.format(task_file=task_file, verify_file=verify_file, python=f"{venv}/bin/python", repo=repo,
                          skill=(OPENSWARM_DIR / "SKILL.md").read_text(), task=base_prompt(inst, repo, venv))
    calls = [run_pi(tid + "-plan", rundir, plan, events, 300, path_env(venv), label="planner")]
    if task_file.exists():
        shutil.copy(task_file, events / "executor-task.md")
    if verify_file.exists():
        shutil.copy(verify_file, events / "verify.txt")
    E.sh(GIT + ["reset", "-q", "--hard", "HEAD"], cwd=repo)
    E.sh(GIT + ["clean", "-qfdx", "-e", ".venv"], cwd=repo)
    if not task_file.exists() or not task_file.read_text().strip():
        calls[0]["note"] = "planner did not write the task file"
        return calls
    remaining = CAP_S - (time.time() - t0)
    budget_min = max(1, int(remaining // 60) - 1)
    home = events / "openswarm-home"
    home.mkdir(exist_ok=True)
    shim = Path(__file__).resolve().parent / "pi_shim.sh"
    env = dict(os.environ, **path_env(venv), OPENSWARM_HOME=str(home), OPENSWARM_PI_BIN=str(shim),
               SHIM_TASK_ID=tid + "-exec", SHIM_EVENTS=str(events), SHIM_TIMEOUT=str(budget_min * 60 + 30))
    # Keep DEEPSEEK_API_KEY: openswarm is forced to --backend pi, so the Pi wrapper run_pi.sh it calls through the shim needs it and cannot route to its own deepseek backend.
    for k in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GOOGLE_API_KEY", "GEMINI_API_KEY"):
        env.pop(k, None)
    cmd = ["python3", str(OPENSWARM_DIR / "bin" / "openswarm"), "run", "--backend", "pi", "--cwd", str(repo),
           "--task-file", str(task_file), "--title", inst["instance_id"], "--budget-minutes", str(budget_min),
           "--no-worktree"]
    verify = verify_file.read_text().strip().splitlines()[0].strip() if verify_file.exists() and verify_file.read_text().strip() else ""
    if verify:
        cmd += ["--verify", verify]
    t1 = time.time()
    p = subprocess.run(cmd, env=env, text=True, capture_output=True, stdin=subprocess.DEVNULL, timeout=CAP_S + 120)
    (events / "openswarm-stdout.txt").write_text(p.stdout)
    (events / "openswarm.err").write_text(p.stderr[-8000:])
    ex = {"label": "executor", "rc": p.returncode, "wall_s": round(time.time() - t1, 1), "record": None}
    usage = pi_events_usage(None)
    for f in sorted(events.glob("executor-*-events.jsonl")):
        u = pi_events_usage(f)
        for k in ("input", "output", "cache_read", "cache_write", "turns", "tool_calls"):
            usage[k] += u[k]
        usage["errors"] += u["errors"]
    ex["usage"] = usage
    # merge the openswarm branch back so grading sees the executor's commit
    branches = E.sh(GIT + ["for-each-ref", "--format=%(refname:short)", "refs/heads/openswarm/"], cwd=repo).stdout.split()
    ex["branches"] = branches
    for b in branches:
        m = E.sh(GIT + ["merge", "-q", "--no-edit", b], cwd=repo, check=False)
        ex.setdefault("merge", []).append({"branch": b, "rc": m.returncode})
    return calls + [ex]


ARMS = {"baseline": arm_baseline, "superpowers": arm_superpowers, "openflow": arm_openflow, "openswarm": arm_openswarm}
