# Integration Matrix

openflow keeps integrations thin: external systems may supply issues, docs, CI, or project state, but workflow truth remains in local YAML, atoms, and change artifacts.

## Integration Surfaces

| Surface | Current xflow Entry | Purpose | Status |
| --- | --- | --- | --- |
| GitHub Issues | `xflow adapter github-issue --repo owner/name --issue <number>` plus `openissue` atoms | Import issue context and create/patch issue state without coupling workflow truth to GitHub. | Implemented |
| GitHub PR | `A6.pr.create` after `A5.archive.commit_push_close` | Open review after archive commit and push. | Implemented |
| GitHub Actions | `.github/workflows/ci.yml` | Test, drift scan, package readiness, and minimal external adoption proof. | Implemented |
| Jira | `xflow adapter import-file --input jira-item.json` | Keep Jira as an issue source, not workflow source of truth. | Adapter seam implemented |
| Linear | `xflow adapter import-file --input linear-item.json` | Same as Jira: issue metadata can map into proposal/status artifacts. | Adapter seam implemented |
| Confluence | `docs/integrations.md` contract | Durable docs can link to Confluence, but root specs stay in repo. | Documented |
| CI Guard / Release Gate | `npm run release:pack`, `npm run publish:check`, `xflow adoption validate --json`, `xflow package preflight --check-registry --check-auth --json`, and `xflow package audit --check-registry --json` | Block public claims until local proof, package proof, registry proof, and real adoption evidence are green. | Implemented |
| gstack | `xflow compare gstack` and `docs/gstack-comparison.md` | Keep the comparison fair: gstack wins role-specialist host commands and browser QA; xflow wins repo-owned workflow truth, proof, and launch gates. | Implemented |
| Superpowers | `xflow compare superpowers` and `docs/superpowers-comparison.md` | Keep the comparison fair: Superpowers wins lightweight behavior guidance; xflow wins repo-local workflow evidence and launch gates. | Implemented |
| Super-Assistant | `xflow compare super-assistant` and `docs/super-assistant-comparison.md` | Keep the comparison fair: Super-Assistant wins raw enterprise connector breadth; xflow wins policy-overlay runtime, atomized provider seams, and structured proof. | Implemented |
| OpenSpec | `xflow spec openspec-map` | Map OpenSpec projects into xflow without moving files. | Implemented |
| spec-kit | `xflow compare spec-kit` and `docs/spec-kit-benchmark.md` | Keep a repeatable benchmark path against spec-kit-style delivery. | Implemented |

## Integration Rules

- External trackers may own discussion, not workflow state.
- Repo files own specs, workflow order, gates, proof, handoff, and archive history.
- Every integration must have a command, doc, or artifact path that can be checked locally.
- Do not add a new integration claim unless `test/competitive-readiness.test.js` or a focused test protects it.

## Minimum Adapter Contract

Every future adapter should expose:

- source system name
- source item id or URL
- mapped `change_id`
- created or updated local artifact paths
- verification command
- failure mode that leaves local specs untouched

The current built-in adapter commands satisfy this contract:

```bash
xflow adapter import-file --input docs/fixtures/tracker-item.json --json
xflow adapter github-issue --repo owner/name --issue 123 --project-root .
```

## Why This Matters Against spec-kit

spec-kit is strong because it has visible extensions and integrations. xflow's answer is not to move workflow truth into every integration; it is to make integration adapters explicit, local, and testable while keeping the executable workflow core stable.
