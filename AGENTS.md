# Repository Agent Instructions

## PMO-First Workflow

Program Manager MCP is the PMO memory, planning, evidence, and reconciliation layer for Agentic OS work. Start shared or cross-project work by asking PMO for current context instead of relying on this checkout, tracker notes, or chat history alone.

Use `program-manager.pmo_help` to bootstrap all agent work in PMO. It returns canonical scope, role refs, and the recommended next calls for the task.

Use these PMO public surfaces in order:

1. `program-manager.pmo_help` to bootstrap and discover missing context.
2. `program-manager.manage_projects` for PMO-owned program/project records.
3. `program-manager.manage_integrations` for PMO-owned integration points and cross-project participation.
4. `program-manager.pmo_macro` only for workflow execution: `catch_me_up`, `simulate_impact`, `propose_unblock_plan`, `detect_drift`, and `reconcile_program_state`.

If any of these are in-scope:

- The Agentic OS shared flow.
- Cross-project contracts, blockers, evidence, approvals, or receipts.
- Planning that may affect Hoplon, Phalanx, Semantix, Guardrail, or ProgramManagerMCP together.
- Catch-up after another worker has changed PMO, tracker, repo, or fixture state.

Do not proceed from local repo context alone for shared-flow changes. First call PMO against `integration://agentic-os/shared-flow`, inspect returned pointer refs, warnings, evidence refs, and artifact refs, then continue with project-native tools.

`pmo_macro` is not an entity-management tool. Use `manage_projects` for PMO-owned program/project list/upsert. Use `manage_integrations` for integration list/upsert/update/add_project/remove_project/retire/delete. Macros are layered operations on top of existing PMO state.

`manage_integrations` lifecycle semantics:

- `upsert`: create or register integration metadata for a stable integration ref.
- `update`: edit existing integration metadata (non-destructive).
- `add_project`: register an additional PMO project under the same integration ref so knowledge/progress is shared.
- `remove_project`: detach a project from the integration while retaining the integration record.
- `retire`: mark integration inactive but preserve historical ledger and traceability.
- `delete`: non-destructive retirement alias; does not erase historical artifacts, only transitions the integration to retired state.

If a PMO tool returns `status: "blocked"` for missing or invalid input, read `deterministicCore.guidance`. It includes allowed actions, retry examples, and known programs, projects, or integrations where applicable. `pmo_help` is tolerant of missing or slug-shaped portfolio input and will resolve to an allowed portfolio in `deterministicCore.guidance.resolvedPortfolioId`.

PMO is passive. Code edits, tracker edits, repository changes, GitHub operations, Hoplon writes, Semantix writes, Phalanx writes, and other downstream mutations must happen through the owning project's native tools and authorization path. PMO may return context, simulate impact, propose plans, list evidence obligations, and reconcile receipts, but PMO plans do not expand executor authority and do not execute downstream work.

## Canonical Scope Refs

Use these stable refs unless a PMO response supersedes them:

- `portfolioId`: `portfolio://default`
- `programId`: `program://agentic-os`
- Shared-flow integration: `integration://agentic-os/shared-flow`
- Shared-flow producer: `project://hoplon`
- Shared-flow consumers: `project://phalanx`, `project://semantix`
- ProgramManagerMCP project: `project://program-manager-mcp`

For shared-flow calls, include all affected project refs:

```json
["project://hoplon", "project://phalanx", "project://semantix"]
```

## Trace And Correlation IDs

Every PMO call must include both IDs:

- `traceId`: stable across one agent task or handoff chain, for example `trace://pmo-agent-003/install-agent-instructions`.
- `correlationId`: unique per PMO call, for example `corr://pmo-agent-003/catch-up-shared-flow`.

Use task IDs in both values when available. Do not reuse a `correlationId` for different calls.

## PMO Macro Examples

Use the service request field `input` for macro payloads with `macroId: "macro://pmo/<macro-name>"`. The PMO MCP also accepts the compatibility wrapper shape `macroName: "<macro-name>"` with `macroInput: { ... }` and normalizes it to the canonical `macroId`/`input` form before validation.

### Catch Up Before Shared-Flow Work

```json
{
  "action": "invoke",
  "macroId": "macro://pmo/catch_me_up",
  "macroVersion": "1.0.0",
  "portfolioId": "portfolio://default",
  "programId": "program://agentic-os",
  "projectIds": ["project://hoplon", "project://phalanx", "project://semantix"],
  "input": {
    "targetRefs": ["integration://agentic-os/shared-flow"]
  },
  "traceId": "trace://pmo-agent-003/install-agent-instructions",
  "correlationId": "corr://pmo-agent-003/catch-up-shared-flow"
}
```

Use this before editing shared-flow contracts, dependencies, readiness evidence, or orchestration behavior. Treat `deterministicCore.objectModelRefs`, `evidenceRefs`, `artifactRefs`, warnings, and redaction summary as the source of truth for what PMO currently knows.

### Simulate Impact Before Changing A Contract Or Dependency

```json
{
  "action": "invoke",
  "macroId": "macro://pmo/simulate_impact",
  "macroVersion": "1.0.0",
  "portfolioId": "portfolio://default",
  "programId": "program://agentic-os",
  "projectIds": ["project://hoplon", "project://phalanx", "project://semantix"],
  "input": {
    "changeRef": "change://pmo-agent-003/shared-flow-doc-update",
    "changeKind": "hypothetical",
    "targetRefs": ["integration://agentic-os/shared-flow"],
    "traversalBudgetRef": "budget://pmo/macro/simulate-impact/default"
  },
  "traceId": "trace://pmo-agent-003/install-agent-instructions",
  "correlationId": "corr://pmo-agent-003/simulate-shared-flow-impact"
}
```

Simulation is non-persistent. Use it to find affected refs, approvals, evidence obligations, and warnings before making project-native changes.

### Propose An Unblock Plan

```json
{
  "action": "invoke",
  "macroId": "macro://pmo/propose_unblock_plan",
  "macroVersion": "1.0.0",
  "portfolioId": "portfolio://default",
  "programId": "program://agentic-os",
  "projectIds": ["project://hoplon", "project://phalanx", "project://semantix"],
  "input": {
    "targetRefs": ["integration://agentic-os/shared-flow"]
  },
  "traceId": "trace://pmo-agent-003/install-agent-instructions",
  "correlationId": "corr://pmo-agent-003/propose-unblock-plan"
}
```

This returns proposed external actions and expected receipt refs only. Execute accepted actions through the owning project tools, then report evidence back through the PMO receipt or reconciliation path.

### Receipt And Reconciliation Reporting

After project-native tools mutate code, trackers, or external systems, keep receipt evidence pointer-only. Do not inline logs, transcripts, screenshots, credentials, secrets, product rows, or raw session data in PMO calls.

Use `pmo_macro` to reconcile receipt state and missing evidence:

```json
{
  "action": "invoke",
  "macroId": "macro://pmo/detect_drift",
  "macroVersion": "1.0.0",
  "portfolioId": "portfolio://default",
  "programId": "program://agentic-os",
  "projectIds": ["project://hoplon", "project://phalanx", "project://semantix"],
  "input": {
    "targetRefs": ["integration://agentic-os/shared-flow"]
  },
  "traceId": "trace://pmo-agent-003/install-agent-instructions",
  "correlationId": "corr://pmo-agent-003/reconcile-receipts"
}
```

When a dedicated PMO receipt tool is available in the active tool surface, submit the actual receipt there with PMO-provided `receiptRequirementId`, idempotency key, evidence refs, artifact refs, observed state refs, and digest. `program-manager.pmo_macro` remains the catch-up, planning, simulation, and reconciliation entry point.

## Operational Rules

- Keep PMO calls pointer-only and redaction-safe.
- Re-run catch-up when branch, commit, tracker revision, task owner, or shared-flow evidence changes.
- Include current branch, commit, tracker revision, and as-of time in `contextAnchor` when known.
- Treat PMO warnings as blockers until inspected.
- Keep repository edits scoped to the task; do not touch Program Manager server persistence or state loading unless the task explicitly owns it.
- If PMO says a plan requires receipts, do not mark the work complete until receipt evidence has been produced through project-native execution and reconciled through PMO.
