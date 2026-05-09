# PMO Omni-Tool Agent Guide

Program Manager MCP uses a domain omni-tool approach: a small set of broad PMO tools, each with explicit ownership over one class of PMO state. The goal is to make autonomous agents faster and safer at runtime without turning PMO into an execution orchestrator.

## The Design

The public PMO MCP surface is:

| Tool | Primary job |
| --- | --- |
| `pmo_help` | Start here. Returns runtime authority, shared knowledge status, canonical refs, operating rules, setup order, recommended next calls, and receipt path. |
| `manage_projects` | Owns PMO program and project records, project roles, tracker/repo/adapter pointers, and goals. |
| `manage_integrations` | Owns integration lifecycle, participants, contracts, blockers, gaps, decisions, responses, conflicts, learnings, tracker refs, inbox, and catch-up. |
| `manage_evidence_items` | Owns pointer-only evidence and artifact records, classifications, retention refs, storage URIs, hashes, and attachments. |
| `pmo_macro` | Runs bounded workflow automation over existing PMO state, such as catch-up, impact simulation, blocker analysis, unblock planning, and drift detection. |

These tools are omni-tools because each one accepts an `action` and a domain-specific payload. They are not arbitrary intent tools. They validate state transitions, required refs, idempotency, authz, pointer-only evidence, and canonical ordering.

## Runtime Guidance Contract

Agents are expected to treat PMO responses as guidance, not just data.

Every public tool returns:

- `status`: whether the call succeeded, degraded, warned, blocked, or errored
- `deterministicCore`: machine-checkable facts and guidance
- `warnings`: issues to inspect before continuing
- `evidenceRefs` and `artifactRefs`: pointer-only support
- `redactionSummary`: what PMO omitted or protected
- `nextRecommendedTool`: the next PMO call to consider
- `traceId` and `correlationId`: task and call correlation

When a call is blocked, agents should not guess. The blocked envelope may include:

- allowed actions
- known programs, projects, and integrations
- missing or invalid field paths
- `correctForm`
- `retryExamples`
- setup order
- authority gaps
- redaction or shared-store gaps

This is where the system saves time: agents get an actionable repair path in the tool result instead of searching source files, asking a human for schema details, or retrying random payload shapes.

## Normal Agent Flow

1. Call `pmo_help`.
2. If scope is missing, call `manage_projects list` and then `manage_projects upsert` if needed.
3. If an integration is missing, call `manage_integrations list` or `get`, then `upsert`.
4. Attach participants with `manage_integrations add_project`.
5. Use `pmo_macro catch_me_up` after lifecycle records exist.
6. Use `pmo_macro simulate_impact` before changing contracts, readiness, orchestration, evidence, or receipt behavior.
7. Execute code, tracker, GitHub, deployment, product, or project-specific work through the owning project's native tools.
8. Register pointer-only evidence with `manage_evidence_items` or submit the expected receipt path.
9. Run `pmo_macro detect_drift` or reconciliation before marking cross-project work complete.

## Pros

- Smaller public tool list means less agent routing overhead.
- Runtime help carries enough context for agents that cannot read repository docs.
- Deterministic repair guidance reduces human interruptions.
- Domain ownership keeps PMO records auditable and easier to authorize.
- PMO can reject ambiguous or unsafe writes before they corrupt shared coordination state.
- Pointer-only evidence keeps high-volume and sensitive payloads out of PMO memory.
- Macros can automate common PMO workflows while still staying passive and proposal-only.

## Cons

- A domain omni-tool schema is larger than a single-purpose tool schema.
- Agents must learn that `pmo_macro` is workflow automation, not lifecycle registration.
- Broad tools need strict docs and tests to prevent action sprawl.
- Compatibility tools can confuse older clients unless tool discovery and docs keep pointing to the five-tool surface.
- PMO can tell an agent what is expected, but it cannot prove downstream work happened until project-native tools produce pointer-only evidence or receipts.

## Why This Saves Time

For humans:

- fewer repeated status handoffs
- fewer "which repo or tracker has the real answer?" interruptions
- clearer distinction between proposed work, executed work, and evidenced work
- durable records of blockers, decisions, contracts, receipts, and stale evidence
- safer audits because raw sensitive content is kept out of PMO

For agents:

- one first call instead of repository spelunking
- known refs and setup order before touching code
- deterministic retry examples when payloads fail
- context packets that summarize current blockers and decisions
- impact and drift checks before and after project-native execution
- receipt guidance that says what proof is still missing

## Use Cases

### Agent Bootstrapping

An agent starts with only a portfolio or task slug. `pmo_help` resolves accessible scope, returns known PMO rules, and tells the agent whether it should list projects, read an integration, or run a macro.

### Cross-Project Shared Flow

Hoplon produces a contract and Phalanx/Semantix consume it. `manage_integrations` records the stable integration ref and participants. `pmo_macro catch_me_up` summarizes current blockers, decisions, evidence, and warnings. `pmo_macro simulate_impact` shows who is affected before a contract change.

### Blocker Management

An agent records a blocker with `manage_integrations record_blocker`, structured `blockedOnRefs`, and `clearanceCriteria`. Later, `pmo_macro detect_drift` can flag the blocker as stale if the referenced response or evidence is now satisfied but the blocker remains open.

### Evidence and Receipt Hygiene

A project agent runs tests or updates a tracker through project-native tools. It registers only pointer refs, hashes, storage URIs, or receipt refs with PMO. Humans can audit what happened without PMO storing raw logs or credentials.

### Runtime Recovery

An agent submits malformed `manage_integrations` input. PMO returns `status: "blocked"` with a known integration list, field guidance, and a valid `correctForm`. The agent retries without asking a human or reading TypeScript schemas.

### Drift Detection

After multiple agents have worked in parallel, `pmo_macro detect_drift` compares PMO facts, expected evidence, observed receipts, source cursors, and integration state. It surfaces missing, stale, conflicting, or unevidenced refs before humans accept the work as complete.

## Example: Catch Up And Simulate Impact

```json
{
  "tool": "program-manager.pmo_macro",
  "arguments": {
    "action": "invoke",
    "macroId": "macro://pmo/catch_me_up",
    "macroVersion": "1.0.0",
    "portfolioId": "portfolio://default",
    "programId": "program://agentic-os",
    "projectIds": ["project://hoplon", "project://phalanx", "project://semantix"],
    "input": {
      "targetRefs": ["integration://agentic-os/shared-flow"]
    },
    "traceId": "trace://agent/shared-flow",
    "correlationId": "corr://agent/shared-flow/catch-up"
  }
}
```

Then, before a contract change:

```json
{
  "tool": "program-manager.pmo_macro",
  "arguments": {
    "action": "invoke",
    "macroId": "macro://pmo/simulate_impact",
    "macroVersion": "1.0.0",
    "portfolioId": "portfolio://default",
    "programId": "program://agentic-os",
    "projectIds": ["project://hoplon", "project://phalanx", "project://semantix"],
    "input": {
      "changeRef": "change://shared-flow/contract-update",
      "changeKind": "hypothetical",
      "targetRefs": ["integration://agentic-os/shared-flow"],
      "traversalBudgetRef": "budget://pmo/macro/simulate-impact/default"
    },
    "traceId": "trace://agent/shared-flow",
    "correlationId": "corr://agent/shared-flow/simulate-impact"
  }
}
```

Simulation is non-persistent. It helps agents and humans see impact before execution, but the actual work still happens outside PMO.

## Example: Register Evidence Pointer

```json
{
  "tool": "program-manager.manage_evidence_items",
  "arguments": {
    "action": "register",
    "portfolioId": "portfolio://default",
    "traceId": "trace://agent/evidence",
    "correlationId": "corr://agent/evidence/register",
    "evidenceItem": {
      "evidenceRef": "evidence://tests/program-manager/agent-loop-proof",
      "kind": "test_receipt",
      "artifactRef": "artifact://tests/program-manager/agent-loop-proof",
      "artifactType": "test_report",
      "storageUri": "artifact://tests/program-manager/agent-loop-proof",
      "contentHash": {
        "algorithm": "sha256",
        "value": "0000000000000000000000000000000000000000000000000000000000000000"
      },
      "classification": "internal",
      "redactionStatus": "not_required"
    }
  }
}
```

The pointer names where evidence lives and how it can be verified. The raw evidence body stays out of PMO.

## Rules Of Thumb

- Use `pmo_help` first.
- Use domain tools to create or update PMO records.
- Use `pmo_macro` only after the relevant lifecycle records exist.
- Treat warnings as blockers until inspected or reconciled.
- Keep evidence and artifacts pointer-only.
- Sort set-like ref arrays lexicographically before writes.
- Never treat a macro summary as proof that an integration was registered; use `manage_integrations get`.
- Never treat a PMO plan as execution authority; use project-native tools for downstream work.
