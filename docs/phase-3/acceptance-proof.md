# Phase 3 Acceptance Proof

Generated: 2026-05-04

## Scope

Phase 3 closes expected-vs-observed receipt tracking and deterministic reconciliation for Program Manager MCP. `record_program_receipt` records PMO-internal receipt evidence only after validating authorization, plan freshness, verifier identity, required evidence, idempotency, and observed adapter state. `reconcile_program_state` compares expected receipts, observed receipts, due policy, adapter health, and adapter-observed state to produce deterministic findings and proposal-only recovery actions. Neither tool executes downstream tracker, Hoplon, decision, evidence, or adapter mutations.

## Acceptance Evidence

| Requirement | Evidence |
| --- | --- |
| Expected receipts, observed receipts, action-ledger entries, and reconciliation records are typed and queryable. | `receipt-ledger.test.js` validates the exported schemas and proves graph repository queries by flight plan, action, actor, contract, project, evidence ref, and reconciliation status. |
| Receipt recording accepts a valid observed receipt exactly once. | `program-tools.test.js` calls `record_program_receipt` with matching plan hash, state hash, verifier, evidence refs, idempotency key, digest, signature digest, and adapter-observed state, then asserts one observed receipt, one action-ledger entry, one reconcile record, and one audit event. |
| Duplicate receipt submissions are idempotent-safe. | The same test repeats the accepted request with the same idempotency key and asserts `accepted: false`, `reason: "duplicate_idempotency_key"`, and no second observed receipt. |
| Authorization rejects unauthorized actors. | `program-tools.test.js` submits a receipt from an execution actor without the required project grant and asserts `record_program_receipt` rejects before recording ledger state. |
| Forged or incomplete receipts are rejected. | `program-tools.test.js` rejects tampered digest payloads, missing required evidence refs, mismatched signature digests, and missing or mismatched operator attestations. |
| Stale flight-plan receipts cannot satisfy obligations. | `program-tools.test.js` changes the submitted `flightPlanStateVersionHash` and asserts stale-plan rejection without ledger mutation. |
| Due policy distinguishes in-flight, late, lost, and stuck receipts. | `program-tools.test.js` runs `reconcile_program_state` with future, recently overdue, expired, and unhealthy-adapter receipts and asserts deterministic statuses for each case. |
| Reconciliation shows accepted and missing receipts together. | `program-tools.test.js` records one accepted receipt, leaves another expected receipt missing, and asserts `reconcile_program_state` reports satisfied, lost, and stuck records in one reconciliation pass. |
| Desynchronization findings include evidence refs and proposed next actions. | `program-tools.test.js` asserts conflict and missing-receipt findings include expected/observed receipt refs, contract/action refs, evidence refs, severity, and proposal-only compensating plan actions. |
| Conflicting observed state is detected without downstream mutation. | `program-tools.test.js` records a receipt whose observed state conflicts with the adapter's current read state and asserts a `receipt_state_conflict` finding with `compensatingPlanProposals`; repository tests confirm PMO event records remain append-only. |

## Verification Commands

```text
TPF_LLM_TOOL=codex tpf npm run typecheck
PASS: tsc -p tsconfig.json --noEmit

TPF_LLM_TOOL=codex tpf npm run generate:schemas
PASS: shared schema bundle generation completed.

TPF_LLM_TOOL=codex tpf node --test --test-reporter spec tests/program-tools.test.js
PASS: 17 tests, including receipt validation, authz rejection, duplicate/idempotency handling, stale flight-plan rejection, due-policy reconciliation, and conflict findings.

TPF_LLM_TOOL=codex tpf node --test tests/receipt-ledger.test.js
PASS: receipt-ledger schemas and repository query behavior.

TPF_LLM_TOOL=codex tpf npm test
PASS: 55 tests, 54 pass, 1 skipped, 0 fail.
```

## Result

Phase 3 receipt ledger, validation, reconciliation, due-policy, and desynchronization behavior is implemented and covered by reproducible tests. PMO writes are limited to internal receipt, reconciliation, action-ledger, and audit records; all external remediation remains proposal-only for later approval and execution.
