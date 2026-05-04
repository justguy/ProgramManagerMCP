# Phase 4 Acceptance Proof

Phase 4 adds Agentic OS integration and operational hardening while preserving the Program Manager boundary: PMO returns context, plans, receipt obligations, ledgers, and reconciliation evidence, but execution agents still perform downstream work outside PMO.

## Evidence

| Requirement | Proof |
| --- | --- |
| Agentic OS consumes PMO context packets and cp-graph refs. | `get_agentic_os_context_packet` composes `query_program_context` output, cp-graph refs, governance refs, and optional proposal-only `plan_program_action` receipt obligations. Covered by `program-tools.test.js`. |
| Execution agents submit PMO receipts. | `submit_agentic_os_receipt` strips Agentic OS wrapper metadata and routes receipt validation through `record_program_receipt`. Covered by `program-tools.test.js`. |
| PMO stays passive. | Context packets expose `executionBoundary: pmo_passive_analyst_execution_agent_performs_side_effects`; receipts record ledger state only. Covered by `program-tools.test.js` and existing boundary tests. |
| Trust-root and actor scope are enforced. | Agentic OS receipt submission blocks mismatched `executionAgentRef` vs authenticated actor and keeps trust-root evidence/policy refs in the envelope. Covered by `program-tool-authz.test.js`. |
| Tenant/portfolio/project isolation remains enforced. | Existing authz tests cover cross-portfolio and execution-agent project scope denial across public PMO tools. |
| Retention/PII/redaction policies are carried. | Agentic OS governance requires `retentionPolicyRef`, accepts PII policy refs, and includes them in redaction policy summaries without inline sensitive payloads. |
| OpenTelemetry-style evidence exists. | `pmo:otel-smoke` emits redaction-safe trace/correlation spans for replay/report checks and degraded/circuit adapter behavior. |
| Replay/report regeneration remain operational. | `pmo:replay-smoke`, `pmo:report-regenerate`, and `pmo:doctor` pass against the updated pinned fixture. |
| End-to-end operational smoke passes. | `pmo:phase4-smoke` runs context packet -> simulated external executor receipt -> PMO reconciliation -> telemetry evidence. |

## Verification

Run from `control-plane/packages/program-manager`:

```sh
npm run typecheck
npm test
npm run pmo:doctor
npm run pmo:report-regenerate
npm run pmo:replay-smoke
npm run pmo:otel-smoke
npm run pmo:phase4-smoke
```

Latest local verification passed:

- `npm run typecheck`
- `npm test`: 60 passed, 1 skipped
- `npm run pmo:doctor`
- `npm run pmo:report-regenerate`
- `npm run pmo:replay-smoke`
- `npm run pmo:otel-smoke`
- `npm run pmo:phase4-smoke`
