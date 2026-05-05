# Agent PMO Onboarding

This directory is the operator-free setup path for agents coordinating the Agentic OS shared flow through Program Manager MCP.

Agents should not rely on chat history or a human-maintained checklist for cross-project flow state. The self-contained starting point is `program-manager.pmo_help`. The help response includes `deterministicCore.helpGuide` with canonical refs, operating rules, recommended follow-up calls, role refs, and the receipt path. Compatibility clients may still call `program-manager.pmo_macro` with `action: "help"`.

Agents that can read repository files should also read `AGENTS.md`, this directory, and the role handoff. Agents that cannot read repository docs should follow `deterministicCore.helpGuide` from the MCP help response.

`pmo_help` is the bootstrap tool. It is the only start step for autonomous PMO use.

`pmo_macro` is not the PMO entity-management tool. Use `program-manager.manage_projects` to list or register PMO-owned programs and projects.

Use `program-manager.manage_integrations` for the complete integration lifecycle:

- `list`: read existing PMO integration points.
- `upsert`: create or register an integration record.
- `update`: edit metadata on an integration record.
- `add_project`: attach a new project to an existing integration ref.
- `remove_project`: detach a project from an integration ref.
- `retire`: stop active use while preserving ledger/history.
- `delete`: non-destructive retirement alias for `retire` (historical artifacts and evidence refs remain).

`pmo_macro` runs only workflow macros after scope exists. It does not manage programs/projects or integration memberships. Canonical calls use `macroId: "macro://pmo/<macro-name>"` and `input: { ... }`; compatibility calls using `macroName: "<macro-name>"` and `macroInput: { ... }` are also accepted and normalized by PMO before validation.

More projects join the same integration via the same stable integration ref. This is the mechanism for shared knowledge/progress:

1) `manage_integrations upsert` creates/normalizes `integration://agentic-os/shared-flow`.
2) each producer/consumer project calls `add_project` against that ref.
3) all shared-work evidence/reconciliation is tracked through pointer refs under that integration.

## Canonical Scope

Use these refs unless PMO returns a newer applicable decision:

| Object | Ref |
| --- | --- |
| Portfolio | `portfolio://default` |
| Program | `program://agentic-os` |
| Shared flow | `integration://agentic-os/shared-flow` |
| Producer | `project://hoplon` |
| Consumers | `project://phalanx`, `project://semantix` |
| Program Manager | `project://program-manager-mcp` |

## Documents

- [Agent handoffs](./agent-handoffs.md): paste-ready Hoplon, Phalanx, Semantix, and validator role prompts.
- [Receipt protocol](./receipt-protocol.md): machine-checkable execution-agent receipt shape and PMO submission path.
- [Receipt JSON Schema](./execution-agent-receipt.schema.json): metadata schema for `executionReceipt`.
- [Receipt example](./examples/execution-agent-receipt.example.json): pointer-only sample receipt payload.

## Agent-Owned Loop

The intended autonomous flow is:

1. Agent calls `program-manager.pmo_help` and reads `deterministicCore.helpGuide`.
2. If no program/project scope is assigned, call `program-manager.manage_projects` with `action: "list"` and then `action: "upsert"` if the scope is missing.
3. If the integration ref is missing, call `program-manager.manage_integrations` with `action: "list"` and then `action: "upsert"` for the integration.
4. Add participating projects with `manage_integrations` `action: "add_project"` against the same stable integration ref.
5. Run `macro://pmo/catch_me_up` only after scope + integration refs + project attachments exist.
6. Run `macro://pmo/simulate_impact` before changing shared contracts, readiness, orchestration, evidence, or receipt behavior.
7. Perform all code, tracker, test, and repository work through the owning project's native tools.
8. Submit an execution receipt through `submit_agentic_os_receipt` when PMO has expected receipt obligations, using pointer-only evidence/receipts.
9. Verify evidence and reconciliation state with `macro://pmo/detect_drift` (and `reconcile_program_state` if your environment uses it) before marking work complete.

When required input is missing or invalid, PMO tools return guidance with allowed actions, retry examples, and relevant known programs/projects/integrations so agents can correct course without drifting. `pmo_help` accepts missing or slug-shaped portfolio input and resolves the allowed portfolio in `deterministicCore.guidance.resolvedPortfolioId`.

Treat those blocked envelopes as the PMO correction path, not as a reason to guess. Retry with `deterministicCore.guidance.correctForm` or one of `retryExamples`. Optional metadata sent as `null` is treated as unknown/not asserted and ignored; send the real pointer or value when the metadata is important enough to update PMO memory.

PMO remains passive. It may plan, reconcile, and ledger PMO-owned state, but it must not mutate Hoplon, Phalanx, Semantix, GitHub, LLM Tracker, code, deployments, or external product state.

## Structured Blocker Clearance

PMO does not infer blocker meaning from `summary` prose. If a blocker is waiting for another PMO coordination record, agents must encode that dependency in structured fields on `integration.item`:

```json
{
  "itemType": "blocker",
  "itemId": "blocker://ask-mr-gambler/rbaa/hoplon-phalanx-alignment-required",
  "status": "open",
  "blockedOnRefs": [
    "response://hoplon/amg-rbaa-alignment-confirmation-2026-05-05"
  ],
  "clearanceCriteria": [
    {
      "ref": "response://hoplon/amg-rbaa-alignment-confirmation-2026-05-05",
      "requiredStatus": "submitted"
    }
  ],
  "summary": "Blocked until the structured Hoplon response is submitted."
}
```

`blockedOnRefs` is a sorted pointer list for dependencies the blocker is waiting on. `clearanceCriteria` is a deterministic list of `{ ref, requiredStatus }` checks. `macro://pmo/detect_drift` flags a stale blocker when every clearance criterion is satisfied by current PMO coordination state but the blocker remains non-terminal. Changing only the prose summary must not affect drift detection.

## Verification

Run the focused proof from the package root:

```bash
cd control-plane/packages/program-manager
TPF_LLM_TOOL=codex tpf npm run pmo:agent-loop-proof
```

The proof emits `PMO_AGENT_OWNED_LOOP_PROOF` with PMO-visible project refs, the shared-flow integration ref, expected receipt type, observed receipt status, reconciliation status, and pointer-only evidence refs.

Restart durability is covered separately:

```bash
cd control-plane/packages/program-manager
TPF_LLM_TOOL=codex tpf npm run pmo:mcp-runtime-smoke
```

The MCP wrapper does not use local JSON PMO state. It is a stateless frontend over the host-managed shared PMO knowledge store, and it stamps actor identity at process startup with a rolling expiry so fresh MCP processes do not fail because of stale fixture-time auth. If the shared store is missing, agents receive blocked runtime guidance through `pmo_help` instead of a local fallback.

Project-scope access is also host-owned. Agents should not edit local config or request database credentials; if `pmo_help` reports a project-scope denial, surface that host grant gap and stop before writing.
