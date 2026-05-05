# PMO Execution-Agent Receipt Protocol

Execution agents report project-native work back to PMO by submitting one receipt through the MCP tool `submit_agentic_os_receipt`. PMO records only PMO-owned ledger state and pointer refs. It does not execute downstream mutations, inspect raw logs, or turn a blocked receipt into green verification.

## Callable Path

1. Get current context and expected receipt obligations with `pmo_macro` or `get_agentic_os_context_packet`.
2. Execute the accepted downstream action in the owning project toolchain.
3. Submit a receipt with `submit_agentic_os_receipt`.
4. Query state with `reconcile_program_state`.

`submit_agentic_os_receipt` wraps the lower-level `record_program_receipt` tool. The wrapper enforces that `executionAgentRef` matches the authenticated actor and preserves the passive PMO boundary.

## Required Receipt Shape

Execution agents should send the normal `submit_agentic_os_receipt` request fields plus the `executionReceipt` metadata object:

```json
{
  "portfolioId": "portfolio://default",
  "programId": "program://agentic-os",
  "projectIds": ["project://program-manager-mcp"],
  "agenticOsRunRef": "run://agentic-os/pmo-agent-004-smoke",
  "executionAgentRef": "actor://agents/executor-a",
  "governance": {
    "trustRootRef": "trust-root://control-plane/oidc-jwt",
    "retentionPolicyRef": "policy://retention/pmo-phase-5-default",
    "piiHandlingPolicyRefs": ["policy://pii/no-inline-sensitive-data"]
  },
  "flightPlanId": "flightplan://program-action/record-receipt",
  "flightPlanHash": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "flightPlanStateVersionHash": "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "proposedActionId": "action://program-action/record-receipt",
  "receiptRequirementId": "receipt://program-action/record-receipt",
  "receiptType": "tracker_update_receipt",
  "idempotencyKey": "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  "observedAt": "2026-05-03T12:09:00Z",
  "observedStateRefs": ["tracker://program-manager-mcp/PMO-502"],
  "evidenceRefs": ["evidence://receipt/required"],
  "artifactRefs": ["artifact://receipt/record-receipt"],
  "verificationMethod": "adapter_observed_state",
  "summary": "Executor observed the tracker receipt.",
  "receiptDigest": "sha256:...",
  "executionReceipt": {
    "projectId": "project://program-manager-mcp",
    "integrationRef": "integration://agentic-os/shared-flow",
    "sourceRef": "git://program-manager-mcp/commit/0123456789abcdef",
    "affectedRefs": [
      "integration://agentic-os/shared-flow",
      "tracker://program-manager-mcp/PMO-502"
    ],
    "testsRun": [
      {
        "testRef": "test://program-manager-mcp/pmo-agent-004-smoke",
        "status": "pass",
        "evidenceRefs": ["evidence://receipt/required"]
      }
    ],
    "blockers": []
  },
  "traceId": "trace://pmo-agent-004/receipt-smoke",
  "correlationId": "corr://pmo-agent-004/receipt-smoke"
}
```

`receiptDigest` is the canonical sha256 state hash over `evidenceRefs`, `flightPlanHash`, `flightPlanId`, `observedAt`, `observedStateRefs`, `proposedActionId`, `receiptRequirementId`, and `receiptType`. Do not hash raw logs or inline evidence.

## Field Rules

`projectId`: owning project ref for the downstream action. If `projectIds` is supplied, it must include this value.

`integrationRef`: shared-flow or integration object the work belongs to. It must also appear in `executionReceipt.affectedRefs`.

`sourceRef`: commit or immutable project ref for the executed change, for example `git://project-slug/commit/<sha>`.

`testsRun`: pointer-only test evidence. Use `status: "blocked"` or `"not_run"` when tests could not run; do not fabricate a pass.

`evidenceRefs` and `artifactRefs`: pointers only. Never inline logs, screenshots, provider transcripts, secrets, raw database rows, or session data.

`blockers`: durable blocker pointers with evidence. Non-empty blockers mean the receipt is not green proof even if PMO accepts the ledger event.

`affectedRefs`: all PMO refs whose state changed or whose evidence is now relevant, including the integration ref, tracker refs, contract refs, artifact refs, or project refs.

## Receipt States

PMO distinguishes receipt states at two layers:

- `expected`: an expected receipt obligation exists in PMO from a flight plan.
- `observed`: a submitted receipt was recorded in the PMO ledger.
- `missing`: reconciliation shows `missingCount > 0` for an expected receipt.
- `stale`: submission is blocked with `receipt-stale-flight-plan` when hashes do not match the expected obligation.
- `blocked`: submission returns `status: "blocked"` for authz, digest, evidence, stale-plan, actor mismatch, or policy failures.
- `conflicting`: reconciliation reports `status: "conflicting"` when accepted receipt refs are not supported by target refs or adapter observations.

Only `accepted` receipts produce `observedReceipt`, `actionLedgerEntry`, and `reconcileStatus` ledger records. Blocked submissions return evidence-backed warnings and do not create green verification.

## Smoke Proof

The focused smoke test is `control-plane/packages/program-manager/tests/execution-agent-receipt-protocol-smoke.test.js`. It submits a sample execution-agent receipt through `submit_agentic_os_receipt`, then queries PMO with `reconcile_program_state` and verifies the satisfied ledger state. It also proves stale-plan blocking and conflicting reconciliation behavior.
