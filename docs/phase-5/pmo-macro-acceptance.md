# PMO Macro Acceptance Proof

Generated: 2026-05-04

## Scope

Phase 5 exposes `pmo_macro` as the single public PMO macro dispatcher. Agent bootstrap help is exposed separately as `pmo_help`, and PMO-owned program/project records are managed through `manage_projects`. The integration lifecycle entrypoint is `manage_integrations`, so `ProgramManagerMcpGateway.listTools()` lists `pmo_help`, `manage_projects`, `manage_integrations`, and `pmo_macro`. Legacy PMO tool calls remain callable as compatibility contracts.

`manage_integrations` supports integration record lifecycle and participation operations:
`list`, `upsert`, `update`, `add_project`, `remove_project`, `retire`, `delete`.
`delete` is non-destructive retirement and keeps historical ledger artifacts/evidence references.

## Verified Controls

- Determinism: repeated macro invocations with the same request, state anchor, registry version, and macro version produce the same deterministic core and `stateVersionHash`.
- Relevant state sensitivity: macro hashes are derived from deterministic core refs, evidence refs, registry version, and action status, so state-changing PMO facts alter the hash.
- Advisory isolation: `advisoryPane` is marked `excludedFromDeterministicHash: true`; model-assisted text is not part of deterministic hash inputs.
- Portfolio isolation: repository macro fact reads and registry reads require portfolio scope and deny cross-portfolio data by default.
- Pointer-only output: macro envelopes carry refs and report artifacts; raw database rows, logs, provider transcripts, screenshots, scratchpads, and full diffs are omitted.
- Registry safety: editable registry writes allow only safe descriptive/configuration fields and reject downstream authority, side-effect posture, schema, hash-policy, evidence-policy, ID, and version changes.
- No downstream mutation: `pmo_macro` may propose, ledger through PMO-owned repository APIs, reconcile, report, and emit expected receipt refs; it does not call GitHub, LLM Tracker, Hoplon, Semantix, Guardrail, Phalanx, Serena, or adapter mutation APIs.
- Simulation boundary: impact simulation and drift remediation outputs are labeled non-persistent/proposed-only and do not update canonical PMO truth.

## Verification Commands

```sh
npm run generate:schemas
npm run typecheck
node --test tests/program-tools.test.js tests/pmo-macro-registry.test.js tests/program-manager-graph-repository.test.js tests/program-manager-graph-neo4j.test.js tests/program-manager-schemas.test.js tests/state-version-hash.test.js
npm test
```

## Residual Later-Phase Work

- Full flight-plan execution lifecycle remains outside `pmo_macro`; execution agents perform downstream mutations and submit receipts.
- Direct receipt ingestion remains available through existing PMO receipt APIs, not as hidden macro-side execution.
- Adapter-backed live Neo4j integration still depends on `PMO_NEO4J_URI` and remains skipped when unavailable.
