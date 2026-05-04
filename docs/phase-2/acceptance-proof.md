# Phase 2 Acceptance Proof

Generated: 2026-05-04

## Scope

Phase 2 closes deterministic PMO flight-plan planning. `plan_program_action` creates a proposal-only plan that identifies affected scope, approval gates, evidence obligations, expected receipts, TTL/revalidation requirements, and loop-suppression outcomes. The PMO planner does not execute tracker, Hoplon, decision, evidence, or other downstream writes.

## Acceptance Evidence

| Requirement | Evidence |
| --- | --- |
| Same inputs produce the same deterministic flight plan and `flightPlanHash`. | `program-tools.test.js` calls `plan_program_action` repeatedly with the same proposed change/context anchor and asserts matching `flightPlanHash` and `stateVersionHash`. |
| Advisory output is excluded from `flightPlanHash`. | The same test compares planner output with and without `includeAdvisoryPane` and asserts unchanged `flightPlanHash` and `stateVersionHash`; the advisory pane is labeled `excludedFromDeterministicHash: true`. |
| Unsatisfied HITL approval gates appear as hard blocks. | The fixture impact assessment produces an unsatisfied `authority://portfolio/default/tier1-operator` approval; planner output returns `status: "blocked"` with a blocking approval obligation. |
| Missing or stale evidence blocks or warns according to policy. | Evidence obligations are promoted into blocking/warning planner obligations by policy/status, with warnings emitted for missing or stale evidence. |
| Tracker and decision actions remain proposals only. | `proposedExternalActions` carry `status: "proposed"`, idempotency keys, evidence policy refs, approval refs, expected receipt requirement ids, and causation metadata; no downstream write method is exposed or invoked. |
| Expected receipts carry revalidation and verifier data. | `expectedReceipts` include `flightPlanId`, `flightPlanHash`, `flightPlanStateVersionHash`, trace/correlation ids, idempotency key, scope refs, verifier, required evidence refs, and expected status. |
| Circular propagation is suppressed deterministically. | `program-tools.test.js` replays a repeated `(adapterId, targetRef, actionType)` edge and asserts no proposed action or expected receipt is emitted, while a suppressed proposal and warning remain visible. |
| Expired or stale plans require revalidation before receipts can satisfy obligations. | Planner output includes `expiresAt` plus `revalidation.requiredBeforeReceiptSatisfaction: true` and lists state hash, context anchor, adapter manifest versions, and planner rule versions as stale-plan inputs. |

## Verification Commands

```text
TPF_LLM_TOOL=codex tpf npm run typecheck
PASS: tsc -p tsconfig.json --noEmit

TPF_LLM_TOOL=codex tpf npm run generate:schemas
PASS: shared schema bundle generation completed.

TPF_LLM_TOOL=codex tpf node --test tests/program-tools.test.js
PASS: 12 tests, including plan_program_action determinism, advisory exclusion, receipt obligations, and propagation suppression.

TPF_LLM_TOOL=codex tpf npm test
PASS: 48 tests, 47 pass, 1 skipped, 0 fail.
```

## Result

Phase 2 planner behavior is implemented and covered by reproducible tests. Receipt recording and reconciliation remain out of scope for Phase 3.
