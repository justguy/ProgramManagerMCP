# Cross-Project Shared-Flow Agent Handoffs

Generated: 2026-05-04

This document is paste-ready handoff material for agents working on `integration://agentic-os/shared-flow`. It coordinates the Hoplon producer, Phalanx consumer, Semantix consumer, and independent validator roles through Program Manager MCP without giving PMO downstream mutation authority.

## Canonical Refs

| Name | Ref |
| --- | --- |
| Portfolio | `portfolio://default` |
| Program | `program://agentic-os` |
| Shared flow | `integration://agentic-os/shared-flow` |
| Producer project | `project://hoplon` |
| Consumer project | `project://phalanx` |
| Consumer project | `project://semantix` |
| Receipt protocol docs | `docs/agent-pmo-onboarding/receipt-protocol.md`, `docs/agent-pmo-onboarding/execution-agent-receipt.schema.json`, `docs/agent-pmo-onboarding/examples/execution-agent-receipt.example.json` |

Use `projectIds: ["project://hoplon", "project://phalanx", "project://semantix"]` for shared-flow PMO calls unless a later PMO response returns a narrower or superseding scope.

## Execution Boundary

PMO is the shared memory, planning, evidence, and reconciliation layer. It may return context, impact simulation, proposed plans, expected receipt refs, warnings, artifact refs, and drift findings. It must not mutate Hoplon, Phalanx, Semantix, GitHub, LLM Tracker, code, fixtures, deployment state, or external systems.

Each project agent performs code, docs, tracker, test, and repository work only through that project's native tools and authorization path. Keep all PMO evidence pointer-only: use evidence refs, artifact refs, digest refs, commit refs, test command refs, tracker task refs, or receipt refs. Do not paste secrets, raw logs, screenshots, provider transcripts, hidden scratchpads, credentials, raw database rows, or full unbounded diffs into PMO.

If a PMO response includes receipt requirements, do not mark project work complete until project-native evidence exists and receipt state is submitted or reconciled through the active PMO receipt path. If a dedicated receipt tool is available, use the PMO-provided `receiptRequirementId`, idempotency key, evidence refs, artifact refs, observed state refs, and digest. If it is not available, follow the PMO-first instructions in `AGENTS.md` and reconcile missing receipt state with `pmo_macro` `macro://pmo/detect_drift`.

## Required PMO Calls

Every role starts with catch-up. Use role-specific `traceId` values and unique `correlationId` values per call.

```json
{
  "action": "invoke",
  "macroId": "macro://pmo/catch_me_up",
  "portfolioId": "portfolio://default",
  "programId": "program://agentic-os",
  "projectIds": ["project://hoplon", "project://phalanx", "project://semantix"],
  "input": {
    "targetRefs": ["integration://agentic-os/shared-flow"],
    "contextAnchor": {
      "role": "<producer|consumer-phalanx|consumer-semantix|validator>",
      "taskRef": "<project-native-task-ref>",
      "branch": "<current-branch>",
      "commit": "<current-commit>",
      "asOf": "<ISO-8601 timestamp>"
    }
  },
  "traceId": "trace://shared-flow/<role>/<task-id>",
  "correlationId": "corr://shared-flow/<role>/catch-up/<unique-suffix>"
}
```

Before changing shared contracts, readiness semantics, handoff payloads, evidence obligations, or orchestration behavior, simulate impact:

```json
{
  "action": "invoke",
  "macroId": "macro://pmo/simulate_impact",
  "portfolioId": "portfolio://default",
  "programId": "program://agentic-os",
  "projectIds": ["project://hoplon", "project://phalanx", "project://semantix"],
  "input": {
    "changeRef": "change://shared-flow/<role>/<task-id>",
    "changeKind": "hypothetical",
    "targetRefs": ["integration://agentic-os/shared-flow"],
    "traversalBudgetRef": "budget://pmo/macro/simulate-impact/default"
  },
  "traceId": "trace://shared-flow/<role>/<task-id>",
  "correlationId": "corr://shared-flow/<role>/simulate-impact/<unique-suffix>"
}
```

If blocked by stale evidence, missing readiness, or missing receipts, request a proposed unblock plan:

```json
{
  "action": "invoke",
  "macroId": "macro://pmo/propose_unblock_plan",
  "portfolioId": "portfolio://default",
  "programId": "program://agentic-os",
  "projectIds": ["project://hoplon", "project://phalanx", "project://semantix"],
  "input": {
    "targetRefs": ["integration://agentic-os/shared-flow"]
  },
  "traceId": "trace://shared-flow/<role>/<task-id>",
  "correlationId": "corr://shared-flow/<role>/propose-unblock/<unique-suffix>"
}
```

After project-native execution, reconcile pointer-only state:

```json
{
  "action": "invoke",
  "macroId": "macro://pmo/detect_drift",
  "portfolioId": "portfolio://default",
  "programId": "program://agentic-os",
  "projectIds": ["project://hoplon", "project://phalanx", "project://semantix"],
  "input": {
    "targetRefs": ["integration://agentic-os/shared-flow"]
  },
  "traceId": "trace://shared-flow/<role>/<task-id>",
  "correlationId": "corr://shared-flow/<role>/detect-drift/<unique-suffix>"
}
```

## Structured Blocker Clearance

Do not encode blocker closure conditions only in prose. PMO drift detection is deterministic and reads explicit coordination fields. When a blocker is waiting for another PMO record, include the dependency in `manage_integrations` under `integration.item.blockedOnRefs` and `integration.item.clearanceCriteria`.

Example:

```json
{
  "action": "record_blocker",
  "portfolioId": "portfolio://default",
  "programId": "program://agentic-os",
  "projectIds": ["project://hoplon", "project://phalanx", "project://semantix"],
  "integration": {
    "integrationPointId": "integration://agentic-os/shared-flow",
    "item": {
      "itemType": "blocker",
      "itemId": "blocker://shared-flow/waiting-for-hoplon-response",
      "status": "open",
      "blockedProjectId": "project://phalanx",
      "blockedOnRefs": ["response://hoplon/shared-flow-confirmation"],
      "clearanceCriteria": [
        {
          "ref": "response://hoplon/shared-flow-confirmation",
          "requiredStatus": "submitted"
        }
      ],
      "summary": "Blocked until the structured Hoplon response is submitted."
    }
  },
  "evidenceRefs": ["evidence://shared-flow/blocker/source"],
  "traceId": "trace://shared-flow/<role>/<task-id>",
  "correlationId": "corr://shared-flow/<role>/record-blocker/<unique-suffix>"
}
```

When `response://hoplon/shared-flow-confirmation` reaches `status: "submitted"`, `macro://pmo/detect_drift` will flag the blocker as stale if it remains open. PMO does not parse wording such as "waiting for Hoplon"; the structured refs are the contract.

## Producer Handoff: Hoplon

Paste the following into the Hoplon producer agent:

```text
You are the Hoplon producer agent for integration://agentic-os/shared-flow.

Ownership:
- Own producer-side Hoplon contract, authorization, snapshot, lock, gateway, and emitted handoff behavior for project://hoplon.
- Preserve the shared-flow contract consumed by project://phalanx and project://semantix.
- Do not edit Phalanx or Semantix code except through an explicitly assigned project-native task.

PMO refs:
- portfolioId: portfolio://default
- programId: program://agentic-os
- integrationRef: integration://agentic-os/shared-flow
- producerProjectRef: project://hoplon
- consumerProjectRefs: project://phalanx, project://semantix

Required startup:
1. Read the repo's AGENTS.md and this handoff.
2. Call program-manager.pmo_macro macro://pmo/catch_me_up for integration://agentic-os/shared-flow with projectIds ["project://hoplon", "project://phalanx", "project://semantix"].
3. Inspect PMO warnings, deterministicCore.objectModelRefs, evidenceRefs, artifactRefs, and redactionSummary before planning.
4. Read current local Hoplon branch, commit, tracker task state, and relevant contract files.

Execution boundary:
- Use Hoplon-native tools for code, tests, tracker updates, and repository changes.
- PMO is read/planning/reconciliation only and must not be used to mutate downstream systems.
- If changing shared contract shape, authz semantics, snapshot/lock behavior, or emitted evidence fields, call macro://pmo/simulate_impact before editing.

Evidence expectations:
- Produce pointer-only evidence refs for changed Hoplon files, commit or diff refs, relevant test command refs, tracker task refs, and any generated artifact refs.
- Include consumer-facing contract deltas in a bounded summary, not raw logs or hidden session context.
- If no shared contract changed, state that explicitly in the final project-native receipt/evidence summary.

Receipt obligations:
- If PMO returns expected receipt requirements, satisfy them using the active receipt path and PMO-provided receiptRequirementId/idempotency key.
- If the dedicated receipt path is unavailable, follow AGENTS.md and reconcile via macro://pmo/detect_drift with pointer refs only.
- Do not mark the Hoplon task complete while PMO reports unresolved producer receipt obligations.
```

## Consumer Handoff: Phalanx

Paste the following into the Phalanx consumer agent:

```text
You are the Phalanx consumer agent for integration://agentic-os/shared-flow.

Ownership:
- Own Phalanx-side consumption, orchestration, run-control, UI/API interpretation, and evidence handling for project://phalanx.
- Validate that producer outputs from project://hoplon remain consumable by Phalanx without changing Hoplon behavior directly.
- Do not edit Hoplon or Semantix code except through an explicitly assigned project-native task.

PMO refs:
- portfolioId: portfolio://default
- programId: program://agentic-os
- integrationRef: integration://agentic-os/shared-flow
- producerProjectRef: project://hoplon
- consumerProjectRef: project://phalanx
- peerConsumerProjectRef: project://semantix

Required startup:
1. Read the repo's AGENTS.md and this handoff.
2. Call program-manager.pmo_macro macro://pmo/catch_me_up for integration://agentic-os/shared-flow with projectIds ["project://hoplon", "project://phalanx", "project://semantix"].
3. Inspect PMO warnings, evidenceRefs, artifactRefs, and any missing readiness or receipt refs.
4. Read current local Phalanx branch, commit, tracker task state, and relevant shared-flow ingestion/orchestration files.

Execution boundary:
- Use Phalanx-native tools for code, tests, tracker updates, and repository changes.
- Treat PMO plans as proposed context, not execution authority.
- If changing consumer expectations, readiness checks, visible status semantics, or orchestration gates that depend on Hoplon or Semantix, call macro://pmo/simulate_impact before editing.

Evidence expectations:
- Produce pointer-only refs for Phalanx files changed, integration contract assertions, test command refs, tracker task refs, and run-control or UI evidence artifacts.
- Report whether Hoplon producer output was accepted, rejected, degraded, or unverified by Phalanx.
- Keep logs summarized and link only bounded evidence refs.

Receipt obligations:
- Submit or reconcile PMO receipt state for Phalanx-owned work when PMO emits receipt requirements.
- Include observed state refs for Phalanx readiness and any cross-project contract compatibility claim.
- Do not mark Phalanx work complete while PMO reports unresolved Phalanx receipt obligations.
```

## Consumer Handoff: Semantix

Paste the following into the Semantix consumer agent:

```text
You are the Semantix consumer agent for integration://agentic-os/shared-flow.

Ownership:
- Own Semantix-side validation, spec/readiness interpretation, semantic contract checks, and evidence handling for project://semantix.
- Validate that Hoplon producer outputs and Phalanx-facing flow state remain semantically compatible.
- Do not edit Hoplon or Phalanx code except through an explicitly assigned project-native task.

PMO refs:
- portfolioId: portfolio://default
- programId: program://agentic-os
- integrationRef: integration://agentic-os/shared-flow
- producerProjectRef: project://hoplon
- peerConsumerProjectRef: project://phalanx
- consumerProjectRef: project://semantix

Required startup:
1. Read the repo's AGENTS.md and this handoff.
2. Call program-manager.pmo_macro macro://pmo/catch_me_up for integration://agentic-os/shared-flow with projectIds ["project://hoplon", "project://phalanx", "project://semantix"].
3. Inspect PMO warnings, especially missing Semantix readiness or evidence receipt refs.
4. Read current local Semantix branch, commit, tracker task state, and relevant readiness/spec validation files.

Execution boundary:
- Use Semantix-native tools for code, tests, tracker updates, and repository changes.
- PMO may identify missing evidence or propose unblocks, but Semantix work must happen through Semantix-native tools.
- If changing semantic readiness criteria, spec lock expectations, validation status, or shared evidence requirements, call macro://pmo/simulate_impact before editing.

Evidence expectations:
- Produce pointer-only refs for Semantix files changed, readiness checks, spec validation artifacts, test command refs, and tracker task refs.
- Report semantic compatibility as accepted, rejected, degraded, or unverified.
- If readiness cannot be proven, report the blocker and required evidence refs rather than fabricating a pass.

Receipt obligations:
- Submit or reconcile PMO receipt state for Semantix-owned readiness evidence when required.
- Include observed state refs for semantic readiness and validation artifacts.
- Do not mark Semantix work complete while PMO reports unresolved Semantix readiness or receipt obligations.
```

## Validator Handoff

Paste the following into the independent validator agent:

```text
You are the independent validator for integration://agentic-os/shared-flow.

Ownership:
- Verify cross-project alignment across project://hoplon, project://phalanx, and project://semantix.
- Confirm producer and consumer agents used PMO-first catch-up, respected project-native execution boundaries, and produced pointer-only evidence.
- Do not implement feature changes in Hoplon, Phalanx, Semantix, or ProgramManagerMCP while acting as validator.

PMO refs:
- portfolioId: portfolio://default
- programId: program://agentic-os
- integrationRef: integration://agentic-os/shared-flow
- projectRefs: project://hoplon, project://phalanx, project://semantix

Required startup:
1. Read AGENTS.md and this handoff.
2. Call program-manager.pmo_macro macro://pmo/catch_me_up for integration://agentic-os/shared-flow.
3. Read project-native summaries, tracker states, commit/diff refs, and test/evidence refs produced by the producer and consumer agents.
4. Call macro://pmo/detect_drift after project agents report completion or if evidence appears stale.

Execution boundary:
- Validation is read-only except for validator-owned tracker comments or PMO reconciliation calls.
- Do not fix discovered implementation issues unless reassigned into a specific project-native execution task.
- Treat PMO warnings, missing receipts, stale evidence, or unresolved drift as blockers to validation pass.

Evidence expectations:
- Produce a bounded validation summary with pointer refs to each project's evidence, tests, tracker task state, and PMO macro artifacts.
- State per project: pass, fail, degraded, or not verified.
- State cross-project result: aligned, drift detected, missing evidence, missing receipt, or blocked.

Receipt obligations:
- If validator work has its own PMO receipt requirement, satisfy it through the active receipt path.
- If project receipts are missing, do not replace them with validator claims; report missing receipt refs and request macro://pmo/propose_unblock_plan or macro://pmo/detect_drift.
- Validation cannot pass while PMO reports unresolved required receipt obligations for the shared flow.
```

## Operator-Free Launch Checklist

Use this checklist to spawn agents without extra human sequencing:

1. Start one Hoplon producer agent with the Producer Handoff and its Hoplon-native task ref.
2. Start one Phalanx consumer agent with the Phalanx Consumer Handoff and its Phalanx-native task ref.
3. Start one Semantix consumer agent with the Semantix Consumer Handoff and its Semantix-native task ref.
4. Instruct all three agents to run PMO catch-up before local planning and to stop on PMO warnings until inspected.
5. Let producer and consumers work in parallel only when their PMO catch-up outputs do not show direct blockers or exclusive ownership conflicts.
6. Require `macro://pmo/simulate_impact` before any role changes shared contract shape, readiness semantics, evidence requirements, or orchestration behavior.
7. Require each role to produce pointer-only evidence refs and satisfy or reconcile its PMO receipt obligations before marking its project-native task complete.
8. Start the validator after all active project agents report project-native completion or after any agent reports an unresolved blocker.
9. The validator calls PMO catch-up and drift detection, then reports aligned, drift detected, missing evidence, missing receipt, or blocked.
10. If drift or missing receipts remain, use `macro://pmo/propose_unblock_plan` and assign any resulting actions through the owning project tools, not through PMO.

## Non-Overlap Rules

| Role | Owns | Must not own |
| --- | --- | --- |
| Hoplon producer | Producer contract, authz, lock/snapshot/gateway emission, producer evidence | Phalanx/Semantix implementation or validation signoff |
| Phalanx consumer | Phalanx ingestion, orchestration, UI/API interpretation, Phalanx evidence | Hoplon producer changes or Semantix semantic readiness |
| Semantix consumer | Semantix readiness, semantic validation, spec evidence | Hoplon producer changes or Phalanx orchestration behavior |
| Validator | Cross-project read-only verification and drift/receipt reconciliation checks | Feature implementation or substituting missing project receipts |

## Completion Criteria

An agent using this pack is complete only when:

- It has run PMO catch-up with the real shared-flow refs.
- It has executed only within its project-native boundary.
- It has produced pointer-only evidence for changed or verified state.
- It has satisfied or reconciled required PMO receipt obligations.
- It has left unresolved cross-project blockers in PMO-visible form instead of hidden chat context.
