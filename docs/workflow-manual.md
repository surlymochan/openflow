# openflow Workflow Manual

> 版本：2026-04-17 · 适用于 openflow main 分支

---

## 目录

1. [架构概览](#1-架构概览)
2. [两条 track](#2-两条-track)
3. [28-phase 规范目录](#3-28-phase-规范目录)
4. [Yolo Workflow（lite）](#4-yolo-workflowlite)
5. [Corps Workflow（heavy）](#5-corps-workflowheavy)
6. [Gate 类型](#6-gate-类型)
7. [原子分组参考](#7-原子分组参考)
8. [状态机](#8-状态机)
9. [CLI 参考](#9-cli-参考)
10. [本地 Release Checklist](#10-本地-release-checklist)
11. [环境变量](#11-环境变量)
12. [常见问题](#12-常见问题)

---

## 1. 架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│  L2  CLI / Skill 入口                                           │
│                                                                 │
│  xflow:plan          xflow:yolo    xflow:corps              │
│  xflow:handoff  xflow:takein  xflow:lookback                │
│  xflow:aha                                                   │
└────────────────────────────┬────────────────────────────────────┘
                             │  yolo: xflow workflow run <yaml>
                             │  corps: xflow corps + xflow proof
┌────────────────────────────▼────────────────────────────────────┐
│  L1  Workflow 定义                                              │
│                                                                 │
│  workflows/yolo.yaml      (lite,  12 phases, no HTTP)           │
│  workflows/corps.yaml     (heavy, 28 phases, needs HTTP)        │
│  atoms/registry.json      (atom ID → 实现文件)                  │
│  schemas/workflow.schema.json                                   │
│  schemas/competitor-reconstruction-contract.schema.json         │
│  schemas/visual-benchmark.schema.json                           │
│  schemas/llm-design-review-aggregate.schema.json                │
│                                                                 │
│  src/core/workflow-loader.js   ← YAML解析 + AJV schema校验      │
│  src/core/workflow-executor.js ← phase迭代 + atom分发 + gate路由 │
└────────────────────────────┬────────────────────────────────────┘
                             │  atom dispatch
┌────────────────────────────▼────────────────────────────────────┐
│  L0  原子组件（76 atoms，每个只有一处实现）                       │
│                                                                 │
│  xflow/atoms/*.py          A/B/C/E6/H1/I6/J/K  (lite)      │
│  src/core/atoms/**/*.js        D/E/F/G/E3/E4/E7    (heavy)     │
│  src/agent_team/atoms/**/*.js  H2-H6d/I1-I5/J5     (heavy)     │
└─────────────────────────────────────────────────────────────────┘
```

**单一 executor**：所有 workflow 共用同一个 `workflow-executor.js`。YAML 差异只在于 phase 列表和 atom 配置，不在执行引擎。

共享记忆族已拆到独立的 `as-xmem` 项目，不参与 workflow track 划分。

---

## 2. 两条 track

```
                    ┌──────────────┬──────────────────────────┐
                    │    yolo      │          corps            │
                    ├──────────────┼──────────────────────────┤
  track             │ lite         │ heavy                     │
  phases            │ 12           │ 26                        │
  HTTP server       │ 不需要       │ 必须（port 8787）          │
  GitHub CLI (gh)   │ 必须         │ 必须                      │
  Pencil            │ 不需要       │ 必须                      │
  设计循环          │ 仅 lite gate  │ 完整 8-phase 设计环       │
  多 agent          │ 否           │ 是（I1.team.run）         │
  mission DB        │ 否           │ 是（SQLite state.sqlite） │
  适用场景          │ 后端/文档/    │ 新用户界面/视觉设计/       │
                    │ 基础设施/    │ 多模块产品/正式评审         │
                    │ 小 UI 修改   │                           │
                    └──────────────┴──────────────────────────┘
```

---

## 3. 28-phase 规范目录

这是两条 workflow 共用的完整 phase 目录。任何 workflow YAML 只能从这里取 phase，不得自行定义。

```
  ┌─────────────────────────────── Intake ──────────────────────────────────┐
  │ 01  change-init          scaffold 变更目录 + 可选 mission 绑定           │
  │ 02  explore              同类竞品调研（corps）                            │
  │ 03  brainstorm           多路径方案生成                                  │
  │ 04  risk_review          结构化不确定性识别（corps）                      │
  │ 05  clarify              驱动性问题澄清（corps）                          │
  │ 06  proposal             收敛一条主路径，锁定范围                         │
  │ 07  proposal-consistency 确定性漂移扫描：proposal vs specs/AHA.md        │
  └──────────────────────────────────────────────────────────────────────────┘

  ┌─────────────────────────────── Design ──────────────────────────────────┐
  │ 08  design_contract_freeze    锁定 journey/模块/视觉/验收基线（corps）    │
  │ 09  competitor_reconstruction_review 冻结竞品模块/主链路/业务逻辑红线      │
  │     + 主参考面锁定 + structured reconstruction pack + generation contract  │
  │ 10  visual_direction_synthesis 多方向视觉生成与对比（corps heavy）         │
  │ 11  layout_competition        首屏多布局竞争（corps heavy）                │
  │ 12  design_selection          冻结获胜方案 + Pencil 交接（corps heavy）   │
  │ 13  ux_design_brief           翻译 contract → design brief（corps）       │
  │ 14  pencil_draft              真实 Pencil/agent_invoke 生成 .pen         │
  │ 15  llm_design_review         advisory benchmark + 视觉/逻辑评审           │
  │ 16  pencil_refine             真实 Pencil/agent_invoke 聚焦修订           │
  │ 17  llm_design_recheck        修订后严格 benchmark 复检                    │
  │ 18  design_accept             验收设计 + Pencil attestation（corps）      │
  └──────────────────────────────────────────────────────────────────────────┘

  ┌─────────────────────────────── Plan ────────────────────────────────────┐
  │ 19  plan                      实现路径规划 + plan.md（复用优先）          │
  └──────────────────────────────────────────────────────────────────────────┘

  ┌──────────────────────────── Issue / Branch ─────────────────────────────┐
  │ 20  openissue           configured issue route + branch + 关联          │
  │ 21  set-in-progress     project item → In Progress                      │
  └──────────────────────────────────────────────────────────────────────────┘

  ┌─────────────────────────────── Execute ─────────────────────────────────┐
  │ 21  tdd                 red → green → refactor + 结构化 proof 文件       │
  │ 22  execute             在锁定范围内实现                                  │
  └──────────────────────────────────────────────────────────────────────────┘

  ┌──────────────────────────── Verify / Review ────────────────────────────┐
  │ 23  verify-consistency  impl vs proposal/plan/specs/AHA.md 漂移检查      │
  │ 24  review              对抗性代码评审 + patch-challenge（corps）          │
  │ 25  qa                  行为 + 视觉验证，截图支持（corps）                 │
  │ 26  gate_final          镜像 frozen contract，pass/fail/needs-human       │
  └──────────────────────────────────────────────────────────────────────────┘

  ┌─────────────────────────────── Archive ─────────────────────────────────┐
  │ 27  archive             artifact 检查 + merge snippets + commit + push   │
  │                         + close issue + project Done                    │
  └──────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Yolo Workflow（lite）

### 调用

```bash
CHANGE_ID=<id> xflow workflow run workflows/yolo.yaml
```

### Phase 流程图

```
 用户输入
    │
    ▼
┌──────────────────────┐
│  01  change-init     │  atoms: B1 scaffold + B2b status.write + B7 bind
│  gate: deterministic │◄─── E6 pre-openissue
└──────────┬───────────┘
           │ pass
    ▼
┌──────────────────────┐
│  03  brainstorm      │  atoms: B3 transition
│  gate: human ⏸       │◄─── 等待 xflow gate ack brainstorm
└──────────┬───────────┘
           │ ack
    ▼
┌──────────────────────┐  条件：仅 change_type = frontend
│  09  design-check    │  atoms: H1 lite_gate + B3 transition        [可选]
│  gate: deterministic │◄─── H1 检查 DESIGN.md 是否有必要 section
└──────────┬───────────┘
           │
    ▼
┌──────────────────────┐
│  06  proposal        │  atoms: B3 transition
│  gate: artifact-verify│◄─── 检查 proposal.md 是否存在
└──────────┬───────────┘
           │ exist
    ▼
┌──────────────────────┐
│  07  proposal-check  │  atoms: J4a structural + B3 transition
│  gate: deterministic │◄─── J4a 扫描 proposal vs specs 漂移
└──────────┬───────────┘
           │ pass
    ▼
┌──────────────────────┐
│  18  plan            │  atoms: B3 transition
│  gate: artifact-verify│◄─── 检查 plan.md
└──────────┬───────────┘
           │ exist
    ▼
┌──────────────────────┐
│  19  openissue       │  atoms: A1 issue + A2 branch + B2b status
│  gate: deterministic │◄─── E6 post-openissue
└──────────┬───────────┘
           │ pass
    ▼
┌──────────────────────┐
│  20  set-in-progress │  atoms: A4 project status + A3 doctor
│  gate: deterministic │◄─── E6 pre-exec
└──────────┬───────────┘
           │ pass
    ▼
┌──────────────────────┐
│  21a tdd-red         │  atoms: I6a(red) + I6b(red)
│  21b tdd-green       │  atoms: I6a(green) + I6b(green) + I6c quality
│  gate: artifact-verify│◄─── red 必须失败；green/refactor 必须通过
└──────────┬───────────┘
           │ exist
    ▼
┌──────────────────────┐
│  22  execute         │  atoms: B3 transition
│  gate: human ⏸       │◄─── 等待 xflow gate ack execute
└──────────┬───────────┘
           │ ack
    ▼
┌──────────────────────┐
│  23  verify-consist. │  atoms: J1 tests.run + J4a structural + J4b delta
│  gate: deterministic │◄─── J4a 漂移扫描 + J4b spec delta review
└──────────┬───────────┘
           │ pass
    ▼
┌──────────────────────┐
│  27  archive         │  atoms: K1 + K6 + K3 + K4 + A5 commit/push/close + A6 PR
│  gate: deterministic │◄─── E6 pre-archive
└──────────┬───────────┘
           │ pass
    ▼
  完成 ✓
```

### 关键产物

```
specs/changes/<change_id>/
├── status.json          (B2b + B3 维护，贯穿全程)
├── proposal.md          (gate: artifact-verify @ phase 06)
├── plan.md              (gate: artifact-verify @ phase 18)
├── findings.md          (optional, research-heavy changes)
├── progress.md          (optional, long-running changes)
├── tdd/
│   ├── red-0.json       (I6a/I6b @ phase 21a, passed:false)
│   ├── green-0.json     (I6a/I6b @ phase 21b, passed:true)
│   └── quality-0.json   (I6c @ phase 21b, test quality review)
├── merge-product.md     (A5 @ archive)
├── merge-architecture.md
└── merge-workflow.md
```

---

## 5. Corps Workflow（heavy）

### 调用

```bash
# 需要先启动 HTTP server
xflow serve --port 8787 &
CHANGE_ID=<id> xflow workflow run workflows/corps.yaml
```

### Phase 流程图

```
 用户输入
    │
    ▼
┌──────────────────┐
│ 01 change-init   │  B1 + D1 mission.create + B7 bind + B2b
│ gate: artifact   │◄── status.json 存在
└────────┬─────────┘
         │
    ▼
┌──────────────────┐
│ 02 explore       │  G3 research + G2 classify + D3a + I1.team + D3c
│ gate: llm-judge  │◄── LLM 评审 explore.json 质量
└────────┬─────────┘
         │
    ▼
┌──────────────────┐
│ 03 brainstorm    │  D3a + I1.team + D3c
│ gate: llm-judge  │◄── LLM 评审 brainstorm.json
└────────┬─────────┘
         │
    ▼
┌──────────────────┐
│ 04 risk_review   │  D3a + I1.team + D3c
│ gate: llm-judge  │◄── LLM 评审 risk_review.json
└────────┬─────────┘
         │
    ▼
┌──────────────────┐
│ 05 clarify       │  D3a + I1.team + D3c
│ gate: human ⏸    │◄── 人工确认澄清结果
└────────┬─────────┘
         │ ack
    ▼
┌──────────────────┐
│ 06 proposal      │  D3a + I1.team + J5 evidence + E4 payload + D3c + B3
│ gate: artifact   │◄── proposal.md + proposal.json 存在
└────────┬─────────┘
         │
    ▼
┌──────────────────┐
│ 07 prop-check    │  J4a structural
│ gate: determin.  │◄── 确定性漂移扫描
└────────┬─────────┘
         │
    ▼
┌──────────────────────────────────────────────────────────┐
│              设计循环（phases 08–17）                      │
│                                                          │
│  08 design_contract_freeze  G4 + H2                      │
│     gate: artifact  ◄── design_contract.json             │
│           │                                              │
│  09 competitor_reconstruction_review  H2b                │
│     gate: artifact  ◄── competitor_reconstruction_review │
│           │                                              │
│  10 visual_direction_synthesis  H3a                      │
│     gate: llm-judge                                      │
│           │                                              │
│  11 layout_competition  H3b                              │
│     gate: llm-judge                                      │
│           │                                              │
│  12 design_selection  H3c                                │
│     gate: human ⏸  ◄── 人工选定方向                       │
│           │                                              │
│  13 ux_design_brief  D3a + I1.team + D3c                 │
│     gate: artifact  ◄── ux_design_brief.json             │
│           │                                              │
│  14 pencil_draft  H4a                                    │
│     gate: artifact  ◄── pencil_output.pen                │
│           │                                              │
│  15 llm_design_review  H5 + H6 + H5b                     │
│     gate: deterministic(advisory) ◄── H6b validate       │
│           │                                              │
│  16 pencil_refine  H6c + H4b                             │
│     gate: artifact  ◄── benchmark_repair_plan + .pen     │
│           │                                              │
│  17 llm_design_recheck  H5 + H6 + H5b + H6d              │
│     gate: deterministic  ◄── benchmark + aesthetic_review │
│     gate: deterministic(strict) ◄── H6b validate         │
│           │                                              │
│  18 design_accept  H4c                                   │
│     gate: human ⏸  ◄── 人工验收 + attestation             │
└──────────────────────────┬───────────────────────────────┘
                           │
    ▼
┌──────────────────┐
│ 18 plan          │  D3a + I1.team + E4 + D3c
│ gate: artifact   │◄── plan.json + plan.md
└────────┬─────────┘
         │
    ▼
┌──────────────────┐
│ 19 openissue     │  A1 + A2 + B2b
│ gate: determin.  │◄── E6 post-openissue
└────────┬─────────┘
         │
    ▼
┌──────────────────┐
│ 20 set-in-prog   │  A4 + A3 doctor
│ gate: determin.  │◄── E6 pre-exec
└────────┬─────────┘
         │
    ▼
┌──────────────────┐
│ 21a tdd-red      │  I6a(red) + I6b(red)
│ 22 execute       │  implementation happens here
│ 21b tdd-green    │  I6a(green) + I6b(green) + I6c quality
│ gate: artifact   │◄── red-0.json + green-0.json + quality-0.json
└────────┬─────────┘
         │
    ▼
┌──────────────────┐
│ 22 execute       │  I2 dispatch + I4 patch.challenge
│ gate: artifact   │◄── execute artifacts 存在
└────────┬─────────┘
         │
    ▼
┌──────────────────┐
│ 24 review        │  I4 patch.challenge(review) + J5 evidence
│ gate: llm-judge  │◄── LLM 评审 review.json
└────────┬─────────┘
         │
    ▼
┌──────────────────┐
│ 25 qa            │  J1 tests + H5 visual(qa) + E5 artifact + J5 evidence
│ gate: artifact   │◄── qa_acceptance.json
└────────┬─────────┘
         │
    ▼
┌──────────────────┐
│ 26 gate_final    │  J5 evidence + E3 workbench + K1 complete_check
│ gate: human ⏸    │◄── 最终人工放行（gate_final.json 含 recommendation）
└────────┬─────────┘
         │ ack
    ▼
┌──────────────────┐
│ 27 archive       │  K1 + K6 + K3 + K4 + A5 commit/push/close + A6 PR
│ gate: determin.  │◄── E6 pre-archive
└────────┬─────────┘
         │
    ▼
  完成 ✓
```

### 关键产物

```
specs/changes/<change_id>/
├── status.json
├── explore.json
├── brainstorm.json
├── risk_review.json
├── clarify.json
├── proposal.md + proposal.json
├── design_contract.json
├── competitor_reconstruction_review.json
├── reference_surface_lock.json
├── reconstruction_pack.json
├── generation_contract.json
├── design_system_pack.json
├── image_reference_set.json
├── visual_direction_synthesis.json
├── layout_competition.json
├── design_selection.json
├── ux_design_brief.json
├── pencil_output.pen
├── pencil_output.attestation.json
├── plan.md + plan.json
├── findings.md           (optional, research-heavy changes)
├── progress.md           (optional, long-running changes)
├── tdd/
│   ├── red-0.json
│   └── green-0.json
├── review.json
├── qa_acceptance.json
├── gate_final.json           ← E3.gate.workbench 输出，含 recommendation
├── evidence/
│   └── gate_final.json
├── merge-product.md
├── merge-architecture.md
├── merge-workflow.md
└── merge-design.md
```

---

## 6. Gate 类型

每个 phase 结束时执行一个 gate，决定是否推进。

```
┌─────────────────────┬──────────────────────────────────────────────────────┐
│  gate 类型           │  行为                                                │
├─────────────────────┼──────────────────────────────────────────────────────┤
│  skip               │  无条件通过，直接进下一 phase                          │
│                     │                                                      │
│  deterministic      │  调用 E6.gate.local_precheck (yolo_gate.py)          │
│                     │  脚本检查 artifact 存在性 + status.json 字段           │
│                     │  结果：pass / fail（fail → on_fail 策略）              │
│                     │                                                      │
│  artifact-verify    │  executor 直接检查 YAML 中声明的 artifacts 路径        │
│                     │  所有 optional:false 的文件必须存在                    │
│                     │  结果：pass / fail                                    │
│                     │                                                      │
│  llm-judge          │  yolo: 返回 needs_human（无 HTTP server）              │
│                     │  corps: 发起 phase-run，LLM 判断                      │
│                     │  结果：pass / fail / needs_human                      │
│                     │                                                      │
│  human              │  写 .as-xflow/pending-gates/<phase>.json              │
│                     │  workflow 停止，等待人工 ack                           │
│                     │  恢复：xflow gate ack <phase>                         │
│                     │  结果：approved（ack 后）/ pending（未 ack）            │
└─────────────────────┴──────────────────────────────────────────────────────┘

on_fail 策略：
  stop                 → 打印阻断原因，退出非零，workflow 暂停
  advance-with-warning → 记录警告，继续推进（用于 TDD 等容错场景）
```

### Human Gate 生命周期

```
  phase 执行完毕
       │
       ▼
  写 .as-xflow/pending-gates/<phase>.json
  { status: "pending", created_at: "..." }
       │
       ▼
  workflow 退出（exit code 1）
  输出：Human gate: phase "<phase>" — ack to proceed

  用户检查后 ────────────────────────────────►
                                              │
                               xflow gate ack <phase>
                                              │
                                              ▼
                              .as-xflow/pending-gates/<phase>.json
                              { status: "approved" }
                                              │
  重新运行：                                   │
  xflow workflow run <yaml> ◄─────────────────┘
       │
       ▼
  executor 读 pending-gates/<phase>.json
  status = "approved" → 跳过该 phase，继续下一 phase
```

---

## 7. 原子分组参考

### 速记口诀

```
A 管 GitHub   B 管本地状态   C 管个人记忆（不透明）
D 管数据库    E 管 gate 引擎  F 管 mission 记忆
G 管调研      H 管设计循环    I 管执行
J 管验证      K 管收尾归档
```

### 各组职责详解

```
┌────┬──────────────────────────────────────────────────────────────────────┐
│ 组 │ 全称          一句话定位                         track   数量         │
├────┼──────────────────────────────────────────────────────────────────────┤
│ A  │ Actions on    操 GitHub 表面：开 issue、建分支、  lite    6            │
│    │ GitHub        推代码、开 PR、关 issue                                  │
│    │               唯一和远程 repo 交互的一组                               │
│    ├──────────────────────────────────────────────────────────────────────┤
│    │ A1 issue.create_or_patch     创建或更新 issue                         │
│    │ A2 branch.create_and_link    创建分支并关联 issue                      │
│    │ A3 repo.doctor               repo/branch/checkout/issue 就绪检查       │
│    │ A4 project.set_status        GitHub Project 状态列                    │
│    │ A5 archive.commit_push_close commit+push+close issue                 │
│    │ A6 pr.create                 创建 PR                                  │
├────┼──────────────────────────────────────────────────────────────────────┤
│ B  │ Build /       变更"行政"组：建目录、读写            lite    9            │
│    │ Bookkeeping   status.json、记录 stage 转换                            │
│    ├──────────────────────────────────────────────────────────────────────┤
│    │ B1 change.scaffold           初始化 specs/changes/<id>/               │
│    │ B2/B2b status.read/write     读写 status.json                         │
│    │ B3 status.transition         stage/status 合法转换（脚本强制校验）      │
│    │ B4 handoff.scaffold_or_refresh  刷新 HANDOFF.md                       │
│    │ B5 aha.append                写 AHA.md 条目                            │
│    │ B6/B6b takein/lookback       摘要读取                                  │
│    │ B7 change_mission.bind       ★ 唯一写 bindings.json（yolo↔corps 耦合点）│
├────┼──────────────────────────────────────────────────────────────────────┤
│ C  │ Cli-use-      个人记忆，刻意设计成不透明              lite    1            │
│    │ memory        其他原子不能碰 cli-use-memory 目录                       │
│    ├──────────────────────────────────────────────────────────────────────┤
│    │ C1 mem        全部子命令透传给 mem.sh（1889 行，原样保留）               │
├────┼──────────────────────────────────────────────────────────────────────┤
│ D  │ Database /    操 SQLite state.sqlite：创建 mission、 heavy   9         │
│    │ Mission       记录 phase-run。corps 专属，yolo 不用                    │
│    ├──────────────────────────────────────────────────────────────────────┤
│    │ D1 mission.create            创建 mission 行                           │
│    │ D2/D2b mission.list/show     查询 mission 状态                         │
│    │ D3a/b/c/d phase_run.*        phase-run 生命周期（start/persist/complete/fail）│
│    │ D4 event.ingest              惰性事件入库                              │
│    │ D5 intervention.create       创建人工干预记录                           │
│    │ D6 mission.diagnostics       诊断 mission 健康状态                     │
├────┼──────────────────────────────────────────────────────────────────────┤
│ E  │ Engine        workflow 状态管理 + gate 路由           heavy+lite 7     │
│    │               E6 是最重要的：所有 deterministic gate                   │
│    │               的唯一真值来源                                           │
│    ├──────────────────────────────────────────────────────────────────────┤
│    │ E1 workflow.state_load       读 workflow-state.json                   │
│    │ E2 workflow.guard            gate token + 命令执行                    │
│    │ E3 gate.workbench            合成 gate_final.json（verdict 在产物里）  │
│    │ E4 gate.payload_from_phase_run  从 phase-run 提取 gate payload        │
│    │ E5 artifact.verify           artifact manifest 检查                   │
│    │ E6 gate.local_precheck       ★ 所有 deterministic gate 唯一实现（lite）│
│    │ E7 workflow.advance          推进 workflow cursor                      │
├────┼──────────────────────────────────────────────────────────────────────┤
│ F  │ Foreign       给当前 mission 挂载/审批记忆条目         heavy   2        │
│    │ memory        corps 专属                                              │
│    ├──────────────────────────────────────────────────────────────────────┤
│    │ F1 memory_item.manage        列出/审批/拒绝记忆条目                    │
│    │ F2 memory.mount              挂载记忆到当前 mission                    │
├────┼──────────────────────────────────────────────────────────────────────┤
│ G  │ Gather        收集竞品数据、分类需求、选设计技能        heavy   4        │
│    │               corps 的 explore/clarify 阶段用                         │
│    ├──────────────────────────────────────────────────────────────────────┤
│    │ G1 intake.preview_or_refine  预览或细化需求蓝图                        │
│    │ G2 intake.classify           分类：功能/视觉/基础设施                  │
│    │ G3 research.same_category    同类竞品调研                              │
│    │ G4 design_skill.select       选择设计技能路径                          │
├────┼──────────────────────────────────────────────────────────────────────┤
│ H  │ Human         设计循环，lite 和 heavy 不重叠            mixed   19      │
│    │ interface /   H1 是 lite 的 DESIGN.md 检查                            │
│    │ Design        H2–H6 是 corps 的完整设计环                             │
│    ├──────────────────────────────────────────────────────────────────────┤
│    │ H1 design.lite_gate          DESIGN.md 卫生检查（lite）                │
│    │ H2 design.contract_freeze    锁定设计合约（heavy）                      │
│    │ H2b/d/e/f competitor/generation 竞品复刻合同/主参考/拆解包/生成约束     │
│    │ H3a/b/c visual.*             视觉方向合成/布局竞争/方案选定             │
│    │ H4a/b/c pencil.*             draft/refine/accept + attestation        │
│    │ H5 visual.review             多模态视觉评审                            │
│    │ H5b visual.review.aggregate  聚合并行视觉评审结果                       │
│    │ H6 visual.benchmark          视觉基准促进校准                          │
│    │ H6c visual.benchmark_repair_plan  unresolved benchmark → repair loop    │
│    │ H6d visual.aesthetic_review  高审美合同 + image reference + Pencil 边界 │
├────┼──────────────────────────────────────────────────────────────────────┤
│ I  │ Implementation 执行。重型的走 corps，I6 是              heavy+lite 6   │
│    │               yolo 也用的 TDD proof 记录                              │
│    ├──────────────────────────────────────────────────────────────────────┤
│    │ I1 team.run                  多 agent 团队执行（heavy）                │
│    │ I2 phase_run.dispatch        派发执行任务                             │
│    │ I4 patch.challenge           对抗性 patch 评审                        │
│    │ I5 codex.app_bridge          Codex 应用桥接                           │
│    │ I6a tdd.run                  运行测试命令 + 写 proof（lite）            │
│    │ I6b tdd.proof_validate       校验 proof schema + red/green 语义（lite）│
│    │ I6c tdd.quality_review       校验测试变更质量和 code/test 配对（lite） │
├────┼──────────────────────────────────────────────────────────────────────┤
│ J  │ Judge /       验证层：确定性测试 + 漂移扫描 + 证据收集   mixed   3      │
│    │ Verify                                                               │
│    ├──────────────────────────────────────────────────────────────────────┤
│    │ J1 tests.run                 运行 plan.md 中的验证命令（lite）          │
│    │ J4a spec_consistency.struct  确定性漂移扫描：impl vs proposal/specs    │
│    │ J4b spec_delta.review        生成 proposal/plan/tasks/spec delta 摘要  │
│    │ J4c openspec.migration_map   生成 OpenSpec → xflow 迁移映射报告       │
│    │ J5 gate.evidence_collect     收集证据包（heavy）                       │
├────┼──────────────────────────────────────────────────────────────────────┤
│ K  │ Knit /        归档收尾：合并产物、持久化经验、关闭变更    lite    6      │
│    │ Archive                                                              │
│    ├──────────────────────────────────────────────────────────────────────┤
│    │ K1 artifacts.complete_check  验证必要 artifact 齐全                   │
│    │ K2 merge_snippets.apply      standalone merge-*.md → root specs       │
│    │ K3 handoff.refresh           刷新 HANDOFF.md                          │
│    │ K4 mem.lesson_persist        持久化 lesson → cli-use-memory           │
│    │ K5 archive.publish           standalone 终态记录（workflow archive 不用）│
│    │ K6 aha.merge                 merge AHA 条目到 root AHA.md             │
└────┴──────────────────────────────────────────────────────────────────────┘
```

---

## 8. 状态机

### status.json — `status` 字段

```
   draft ──────────────► active ──────────────► done
     │                     │                     ▲
     │                     ▼                     │
     └────────────────► blocked ─────────────────┘

  draft   : change-init 创建时的初始状态
  active  : openissue 完成后转入
  blocked : 遇到阻断性问题
  done    : archive 完成后终态（不可逆）
```

### status.json — `current_stage` 字段

```
change-init
     │
     ├──► design-check (仅 frontend)
     │
     ▼
brainstorm ──► proposal-freeze ──► proposal-consistency-check
                                             │
                                             ▼
                                            plan
                                             │
                                             ▼
                                          openissue
                                             │
                                             ▼
                                            tdd
                                             │
                                             ▼
                                          execute
                                             │
                                             ▼
                                           verify
                                             │
                                             ▼
                                          archive  (终态)
```

合法转换由 `common.py:record_stage_transition()` 强制校验，不允许跳跃。

---

## 9. CLI 参考

```
xflow workflow run <yaml>          运行 workflow（从当前或上次断点续）
xflow workflow run <yaml> --dry-run  只解析打印，不执行
xflow workflow validate <yaml>     校验 YAML schema + atom registry（只作 preflight）
xflow corps --title <title>        corps 重型流程唯一执行入口（需带竞品/模块/主链路合同）
xflow proof --track corps          校验执行日志 + artifacts，并写 corps_proof.json
xflow gate ack <phase>             确认 human gate，允许 workflow 继续
xflow atom list                    列出所有已注册原子
xflow atom show <id>               显示原子详情（track/type/schema）
xflow atom run <id> [--with ...]   单独执行一个原子
xflow serve [--port 8787]          启动 HTTP server（corps 必须）
```

### workflow run 常用参数

```bash
# 基本
CHANGE_ID=my-feature xflow workflow run workflows/yolo.yaml

# 使用独立 project root（测试/隔离场景）
CHANGE_ID=my-feature XFLOW_PROJECT_ROOT=/path/to/project xflow workflow run workflows/yolo.yaml

# corps（需要先启动 server）
xflow serve &
xflow corps --title "my feature" --change-type frontend --change-id my-feature
xflow proof --track corps --change-id my-feature

# 竞品复刻型 corps（benchmark contract 为正式二选一）
xflow corps \
  --title "Competitor-aligned product workbench" \
  --change-type frontend \
  --change-id competitor-workbench \
  --competitor-product CompetitorX \
  --required-modules navigation \
  --required-modules workspace \
  --required-modules detail \
  --target-surfaces primary_workspace \
  --target-surfaces detail_drawer \
  --primary-journeys create_to_review \
  --primary-journeys review_to_complete \
  --business-logic-invariants domain_invariant_a \
  --reference-scenarios-json '[{"id":"desktop-main","viewport":{"width":1440,"height":900},"reference_image":"refs/competitor-main.png","screenshot_image":"output/main.png","diff_metrics":{"structural_similarity":0.94},"layout_contract":{"workspace_patterns":["header_with_split_workspace","filters_above_list","list_detail_master_detail"],"expected_columns":2,"required_panels":["list","detail"]},"layout_observations":{"dom_rects":[{"panel_id":"header","selector":"[data-panel=header]","left":0,"top":0,"width":1440,"height":64},{"panel_id":"filters","selector":"[data-panel=filters]","left":0,"top":64,"width":920,"height":56},{"panel_id":"list","selector":"[data-panel=list]","left":0,"top":120,"width":920,"height":780},{"panel_id":"detail","selector":"[data-panel=detail]","left":920,"top":120,"width":520,"height":780},{"panel_id":"main","selector":"[data-panel=main]","left":0,"top":120,"width":920,"height":780}]}}]'

# 或者改走 capture_url + reference_image 这条正式路径，
# 让 H6.visual.benchmark 在 phase 内自动抓页面证据
xflow corps \
  --title "Competitor-aligned product workbench" \
  --change-type frontend \
  --change-id competitor-workbench \
  --competitor-product CompetitorX \
  --primary-reference-surface desktop_primary_workspace \
  --required-modules workspace \
  --required-modules detail \
  --capture-url http://127.0.0.1:4174/ \
  --reference-image refs/competitor-main.png
```

对于 `corps` 来说，这两条 benchmark 输入路径是正式 contract，而不是推荐项：

- `reference_scenarios_json`
- `capture_url + reference_image`
- `primary_reference_surface`
- 当 `corps` 入口识别到 competitor-led UI 语义时，这条 benchmark contract 不再只是推荐项，而会变成默认强制项；缺少证据路径时入口直接 fail fast
- 在进入视觉生成前，workflow 还会冻结 `reference_surface_lock.json`、`reconstruction_pack.json`、`generation_contract.json`
- `reconstruction_pack.json` 不应只停留在模块级；现在还会沉淀 `component_blueprint` 和 `relationship_graph`，用一组通用 UI primitive 临时拆解当前参考面，而不是依赖一套产品专名百科
- `generation_contract.json` 现在会把这些 primitive 编译成 `staged_generation`、`geometry_hints`、`token_hints` 与 `repair_policy`，供 `pencil_draft` / `pencil_refine` 直接消费

如果 `visual_benchmark.json` 没声明自己来自这两条路径之一，`H6b.visual.benchmark_validate` 会直接返回 `visual_benchmark_input_contract_missing`。
如果 `primary_reference_surface` 缺失，`corps` 入口会在 competitor-led strict mode 下直接拒绝继续。

如果目标是竞品级商业化还原，除了布局合同，也应补上视觉 token 合同：

- `visual_token_contract`
- `observed_visual_tokens`

目前 benchmark 支持进入 deterministic gate 的 token 维度包括：

- `font_families_required`
- `font_weights_required`
- `text_size_range`
- `min_touch_target_size`
- `bottom_sheet_handle_required`
- `tabbar_active_state_required`
- `floating_primary_action_required`
- `segmented_control_active_state_required`
- `icon_density_range`
- `icon_size_range`

当 benchmark 首轮仍然 unresolved 时，`corps` 现在会自动进入 repair loop：

- `llm_design_review` 用 advisory gate 记录问题而不直接终止
- `benchmark_repair_plan.json` 从 diff / hotspots / missing checks 自动生成聚焦修复任务
- repair plan 不再只是 page-level 建议，而会下沉为 component-local `repair_targets`
- `pencil_draft` 现在按 shell -> primary_focus -> secondary_focus -> polish 的 staged generation 写出首版生成意图
- `pencil_refine` 消费 repair plan 修订设计，并且只改 repair targets；未命中的组件应默认保留，不再整页重抹
- `llm_design_recheck` 再做一次严格 benchmark gate，并由 `H6d.visual.aesthetic_review` 检查高审美合同、`image_reference_set.json` 真实产物、Pencil 边界和 benchmark 结果
- `line_height_range`
- `letter_spacing_range`
- `radius_range`
- `border_width_range`
- `border_styles_required`
- `border_weight_tiers_required`
- `color_roles`
- `shadow_signatures_required`
- `shadow_strength_tiers_required`
- `spacing_scale`
- `list_row_height_range`
- `toolbar_control_density_range`
- `detail_block_spacing_scale`
- `component_family_consistency`

### 高审美 UI 合同

`corps` 不再把 Pencil 当作唯一的审美来源。Pencil 的职责是生成和修订可编辑产品表面；高审美目标应由 `generation_contract.json` 中的 `visual_constraints.aesthetic_standard` 和 `visual_constraints.image_reference_generation` 明确表达，再由 `H6d.visual.aesthetic_review` 验收。

默认合同要求：

- `aesthetic_standard.level = high`
- 维度覆盖 composition、hierarchy、typography、color/material、density/spacing、interaction-state polish
- `design_system_pack.json` 必须 materialize 一份通用设计系统实践包，把 Lovable 式 React/component/design-system 约束、Open Design/Open CoDesign 式本地 artifact preview/refine loop、OpenUI 式组件白名单/结构化生成思想编译为可验证合同
- `design_system_pack.json` 必须声明 practice sources、allowed primitives、required states、token policy、preview loop；缺失 loading/empty/error/selected/hover/focus 等状态会被 H6d 判为未吸收
- image reference 使用 `gpt_image_v2_style_reference` 这类宿主配置的图像生成能力产出参考帧、组件密度 sheet、状态 polish sheet，并落成 `image_reference_set.json`
- `image_reference_set.json` 必须列出 `primary_surface_reference_frame`、`component_density_sheet`、`state_polish_sheet`，且每个条目都指向真实存在的 reference artifact
- Pencil 输出必须保持 editable，不能用 bitmap mockup 替代 DOM/Pencil 可验证产物
- benchmark 场景必须全 pass，且 aesthetic score 达到 `min_accept_score`

`capture-page-evidence` 与 `export-visual-tokens` 会从页面 snapshot 半自动抽取：

- `font_families`
- `font_weights`
- `text_sizes`
- `icon_density_values`
- `icon_size_values`
- `line_heights`
- `letter_spacings`
- `radius_values`
- `border_widths`
- `border_styles`
- `border_weight_tiers`
- `color_roles`
- `shadow_signatures`
- `shadow_strength_tiers`
- `list_row_heights`
- `toolbar_control_density_values`
- `detail_block_spacing_values`
- `component_family_consistency`

其中 `component_family_consistency` 适合拿来约束同类控件别“长得像亲戚但不是一家人”，例如：

- `toolbar_controls.max_text_size_delta`
- `toolbar_controls.max_radius_delta`
- `list_rows.max_line_height_delta`
- `detail_blocks.max_border_width_delta`

如果目标 surface 是移动端（iOS / Android / H5），现在至少已经有两层更像移动端的基础验收：

- 触控目标：`min_touch_target_size`
- 移动端布局模式：`compact_top_nav`、`bottom_tabbar_docked`、`bottom_sheet_over_content`
- 移动端硬门：`safe_area_top_panels`、`safe_area_bottom_panels`、`keyboard_aware_panels`
- 移动端交互人体工学：`thumb_reach_primary_action_panels`、`bottom_sheet_handle_required`、`tabbar_active_state_required`、`floating_primary_action_required`、`segmented_control_active_state_required`
- 手势态采样：`capture_states_json` 里可声明 `swipe_selector`、`drag_selector`、`drag_to_selector`、`scroll_selector`
- 多帧动效采样：state 可声明 `expect_motion`、`sample_frames`、`frame_interval_ms`、`min_motion_changed_frames`
- 多视口 baseline：可用 `viewport_variants_json` 扩展 `capture_url` 路径，或声明 `benchmark_matrix_contract` 来要求多个 scenario / state variant 一起过线
- 平台原生物理感：`visual_token_contract.required_platform_physics_profiles` 可要求 `ios_spring`、`android_ripple`、`mobile_h5_smooth`
- richer semantic detection: `observed_visual_tokens.component_semantics` 现在可自动识别 `loading_state`、`skeleton_state`、`error_state`、`search_active`
- HTML compare viewer: `H6.visual.benchmark` 会写 `visual_benchmark_report.html`；CLI 也可用 `xflow visual render-report` 或在 `capture-page-evidence` / `diff-images` 上加 `--report-output`

如果目标页面是典型工作台，而不是单一静态页，也可以补上：

- `state_contract.required_workbench_states`

当前支持进入 gate 的标准工作台态类型包括：

- `detail_open`
- `active_filter`
- `selected_item`
- `bulk_select_mode`

这时 benchmark 会生成 `state_contract_checks`；缺失要求态时，`H6b.visual.benchmark_validate` 会返回：

- `visual_benchmark_state_contract_checks_missing`
- `visual_benchmark_state_contract_checks_unresolved`

如果还要进一步约束“同一类组件在 hover / active / selected 等状态下是不是同一套语言”，可以补：

- `state_family_contract`

例如：

- `toolbar_controls.required_variants`
- `toolbar_controls.max_pixel_diff_spread`
- `toolbar_controls.max_layout_shift_spread`
- `toolbar_controls.min_distinct_surface_colors`
- `toolbar_controls.min_distinct_shadow_strength_tiers`
- `toolbar_controls.required_timing_functions`
- `toolbar_controls.max_radius_spread`
- `toolbar_controls.max_border_width_spread`
- `toolbar_controls.max_transition_duration_spread`
- `toolbar_controls.max_animation_duration_spread`

这时 benchmark 会生成 `state_family_checks`，缺失或漂移过大时会返回：

- `visual_benchmark_state_family_checks_missing`
- `visual_benchmark_state_family_checks_unresolved`

状态证据里也可以带 `state_visual_tokens`，用于表达 hover / active / selected 态下的颜色、阴影、圆角、边框、transition/animation token；`capture_url` 路径下 benchmark 会自动从每个 state 的 snapshot 节点里抽出这批 token。
- `spacing_values`

对于交互型产品，还可以在采集阶段显式声明多状态采样：

- `capture_states_json`
- `auto_discover_states`
- `state_limit`

每个 state 是一段通用动作定义，例如：

```json
[
  { "id": "hover-row", "hover_selector": "[data-row=\"r1\"]", "wait_ms": 80 },
  { "id": "detail-open", "click_selector": "[data-open-detail]", "wait_ms": 120 }
]
```

`capture-page-evidence` 会额外产出每个 state 的 screenshot，并把对应节点并入 snapshot；`H6.visual.benchmark` 在 `capture_url + reference_image` 路径下也会保留 `state_evidence`，供后续 benchmark/proof 使用。

当 `state_evidence` 存在时，benchmark 还会自动生成 `state_transition_checks`，默认要求这些状态相对基态存在可见 diff；否则 `H6b.visual.benchmark_validate` 会返回：

- `visual_benchmark_state_transition_checks_missing`
- `visual_benchmark_state_transition_checks_unresolved`

如果某个状态有明确竞品参考态图，也可以直接在 state 上补 `reference_image`。这时 `state_transition_checks` 会优先拿该状态截图去对比对应参考态，而不是只和基态比较。

自动发现的 state 会附带：

- `priority_score`
- `priority_reason`
- `source=auto_discovered`

这样后续可以优先消费更接近主链路的候选态，而不是把所有 hover/click 都等价看待。

除了 panel 级结构和 state 级 diff，benchmark 现在也支持更细的组件节奏 token：

- `list_row_height_range`
- `toolbar_control_density_range`
- `detail_block_spacing_scale`

对应的自动抽取值是：

- `list_row_heights`
- `toolbar_control_density_values`
- `detail_block_spacing_values`

如果需要检查工作台的对齐节奏，还可以在 `layout_contract` 里补：

- `alignment_grid_step`
- `alignment_grid_tolerance`
- `alignment_grid_panels`

这会自动生成 `layout-grid-alignment-*` 结构检查，用来判断关键面板是否落在统一栅格上。

对应场景会自动生成 `token_checks`。只要声明了 `visual_token_contract`，但 `token_checks` 缺失或 unresolved，`H6b.visual.benchmark_validate` 会分别返回：

- `visual_benchmark_token_checks_missing`
- `visual_benchmark_token_checks_unresolved`

如果已经有页面 DOM 快照 JSON，可以先用 CLI 导出 `dom_rects`：

```bash
xflow visual export-dom-rects \
  --project-root /path/to/project \
  --input fixtures/dom-snapshot.json \
  --output .as-xflow/dom-rects.json \
  --json
```

也可以直接抓页面证据，再算真实图像差异：

```bash
xflow visual capture-page-evidence \
  --url http://127.0.0.1:4174/ \
  --snapshot-output .as-xflow/page-snapshot.json \
  --screenshot-output output/playwright/page-evidence.png \
  --dom-rects-output .as-xflow/dom-rects.json \
  --visual-tokens-output .as-xflow/visual-tokens.json \
  --capture-states-json '[{"id":"hover-row","hover_selector":"[data-row=\"r1\"]","wait_ms":80}]' \
  --auto-discover-states \
  --state-limit 4 \
  --reference refs/competitor-main.png \
  --width 1440 \
  --height 900 \
  --json
```

如果只想从已有 snapshot 单独导出视觉 token，可以用：

```bash
xflow visual export-visual-tokens \
  --project-root /path/to/project \
  --input fixtures/dom-snapshot.json \
  --output .as-xflow/visual-tokens.json \
  --json
```

如果只想单独算图像差异，仍然可以用：

```bash
xflow visual diff-images \
  --reference refs/competitor-main.png \
  --candidate output/playwright/page-evidence.png \
  --json
```

对 `xflow:corps` 来说，对话里的 AI 不应绕过脚本自行完成流程；它只代表人类做前期需求澄清、human gate 确认，以及最后检查 `corps_proof.json` 是否 `ok=true`。

---

## 10. 本地 Release Checklist

本地 release 的目标是先证明仓库正确，再刷新安装版 `xflow` skill。不要直接手写 `SKILLHUB=... skills_sync.sh xflow`；使用仓库内受测入口，避免 prune 掉 as-skillhub 管理的其他 skills。

```bash
npm run drift:scan
npm run verify
npm run skill:sync
npm run skill:diff
npm run release:pack
```

`npm run drift:scan` 是 targeted active-surface 漂移扫描，用于快速确认根文档、规范、workflow YAML、skill 文档和必要测试入口没有回退到旧 gate、旧 atom 数量或旧 archive 顺序；历史 `specs/changes/**` 不属于 active surface。

等价的一步命令：

```bash
npm run release:local
```

`npm run skill:sync` 调用：

```bash
sh xflow/scripts/sync_installed_xflow_skill.sh
```

该脚本默认从 openflow 同步 `xflow/`，并把 as-skillhub `skills/` 作为额外 source 传给 shared sync，使安装目录中的其他 managed skills 仍可被 prune 阶段正确解析。

`npm run skill:diff` 调用：

```bash
sh xflow/scripts/check_installed_xflow_skill_sync.sh
```

该脚本只读检查仓库 `xflow/` 与安装目录 `~/.codex/skills/xflow` 是否同步，并允许安装目录保留 `.skillhub-source` 作为来源元数据。若 `~/.codex/skills` 不存在，可通过 `XFLOW_INSTALLED_SKILL_DIR` 显式指向其他安装目录。

`npm run release:pack` 在 verify、drift scan 和 skill diff 之后执行 `npm pack --dry-run`。包内容由 `package.json.files` 和 `.npmignore` 共同约束，必须排除本地 agent 配置、测试目录、`__pycache__` 和 `.pyc`。

---

## 11. 环境变量

```
┌──────────────────────┬─────────────────────────────────────────────────────┐
│ 变量                  │ 说明                                                │
├──────────────────────┼─────────────────────────────────────────────────────┤
│ CHANGE_ID            │ 必须。变更标识符，用于定位 specs/changes/<id>/        │
│ XFLOW_PROJECT_ROOT   │ 可选。覆盖默认的 process.cwd() 作为项目根目录         │
│ PORT                 │ 可选。HTTP server 端口，默认 8787                     │
│ AGENTOS_HTTP         │ 可选。设置为 1 表示 HTTP server 可用（影响 httpAvailable()） │
│ AS_XFLOW_HTTP        │ 同上，二选一均可                                      │
└──────────────────────┴─────────────────────────────────────────────────────┘
```

---

## 12. 常见问题

### workflow 停在 human gate 怎么恢复？

```bash
# 查看当前挂起的 gate
ls .as-xflow/pending-gates/

# 确认 gate
xflow gate ack <phase-id>

# 重新运行（从断点续）
CHANGE_ID=<id> xflow workflow run workflows/yolo.yaml
```

### atom 报 `load_status()` 错误

`load_status(project_root, change_id)` 返回 `(Path, dict)` tuple，不是单独的 dict。
```python
# 错误
status = load_status(root, change_id)
status.update(fields)   # AttributeError: 'tuple' has no attribute 'update'

# 正确
path, status = load_status(root, change_id)
status.update(fields)
save_status(path, status)
```

### artifact-verify gate 失败

检查对应 artifact 文件是否已写入正确路径：
```bash
ls specs/changes/<change_id>/
# 确认 proposal.md / plan.md 等文件存在
```

### 多个测试互相污染状态

并发测试时必须用独立的 `XFLOW_PROJECT_ROOT`：
```javascript
const projectRoot = mkdtempSync(join(tmpdir(), 'xflow-test-'));
spawnSync('node', ['bin/xflow.js', 'workflow', 'run', yaml], {
  env: { ...process.env, CHANGE_ID: 'test-1', XFLOW_PROJECT_ROOT: projectRoot }
});
```

### corps workflow 的 llm-judge gate 一直返回 needs_human

在没有 HTTP server 的情况下，`llm-judge` 默认退化为 `needs_human`。
确认 HTTP server 已启动：
```bash
curl http://localhost:8787/api/health   # 应返回 {"ok":true}
```
