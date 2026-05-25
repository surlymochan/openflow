# OpenFlow Handoff

This is a public handoff template for repository continuity. It should not
contain personal paths, private customer data, secrets, unpublished adoption
evidence, or maintainer-only release state.

## Current State

- Project: `openflow`
- Runtime CLI: `xflow`
- Status: public extraction of the openflow workflow runtime.
- Archive discipline: keep verification, handoff refresh, commit/push/close, and
  PR creation ordered and evidence-backed.
- Next action: run verification and benchmark commands before making release
  claims.

## 操作入口

```bash
npm install
npm run drift:scan
npm run verify
npm run skill:sync
npm run skill:diff
npm run pack:check
npm run release:local
xflow workflow validate workflows/yolo.yaml
xflow workflow validate workflows/corps.yaml
xflow corps archive
xflow serve
node bin/xflow.js score --json
node bin/xflow.js compare openspec --json
node bin/xflow.js compare superpowers --json
node bin/xflow.js compare gstack --json
```

## 近期风险

- Keep public claims scoped to the benchmark scenario and disclosed rubric.
- Do not publish local `.as-xflow/`, `.claude/`, raw adoption evidence, secret
  scan reports, or generated benchmark state.
- Re-run package and secret scans after any release-surface change.
- Installed skill sync wrappers are `xflow/scripts/sync_installed_xflow_skill.sh`
  and `xflow/scripts/check_installed_xflow_skill_sync.sh`.
