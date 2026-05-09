# Program Manager Public Tool Contracts and Result Envelope

- Status: Drafted to satisfy `pmo-004`
- Date: 2026-05-03
- Blueprint anchors: `program-manager-mcp-integrated-blueprint-2026-05-03.md:371-447`
- Depends on: [schema-examples-and-fixture-contracts.md](./schema-examples-and-fixture-contracts.md), [adapter-authz-approval-security-contracts.md](./adapter-authz-approval-security-contracts.md)

## Purpose

This document defines the small public PMO MCP surface and the standard result envelope every public tool returns.

Program Manager remains a passive analyst, planner, reconciler, and ledger. Public tools may read PMO state, describe impact, generate reproducible PMO artifacts, and record PMO-owned receipts or audit facts in later phases. They must not expose downstream mutation authority or proxy arbitrary focused-tool actions.

## Current Public Domain Omni-Tool Surface

The current MCP tool discovery surface is intentionally small:

| Tool | Domain | Boundary |
|---|---|---|
| `pmo_help` | Bootstrap guidance, shared knowledge authority, canonical scope, recommended calls, and receipt path. | Read-only. Agents should call this first. |
| `manage_projects` | PMO-owned program/project memory, roles, tracker/repo/adapter refs, and goals. | Mutates only PMO project records. |
| `manage_integrations` | Integration lifecycle, participation, contracts, gaps, blockers, decisions, responses, conflicts, learnings, tracker refs, inbox, and catch-up. | Mutates only PMO integration and coordination records. |
| `manage_evidence_items` | Pointer-only evidence and artifact registry records, classification, retention, and attachments. | Mutates only PMO evidence/artifact metadata. |
| `pmo_macro` | Workflow automation over existing PMO state, including catch-up, impact simulation, blocker analysis, unblock planning, drift detection, and registry help. | Read-only or PMO-owned macro records only; no downstream mutation. |

This is a domain omni-tool design. The public surface is not one arbitrary intent tool, and it is not every low-level PMO action as a separate MCP tool. Each domain tool accepts an `action` and validates that action against its own state transitions, authorization, pointer-only evidence rules, idempotency, and retry guidance.

Legacy narrow tools described later in this document remain compatibility contracts for existing clients and tests. New agent-facing docs and tool discovery should route callers through the five-tool surface above.

## Standard Result Envelope

Every public tool returns `ProgramToolResultEnvelope<TCore, TAdvisory>`.

```ts
type ProgramToolResultEnvelope<TCore = unknown, TAdvisory = unknown> = {
  schemaVersion: "1";
  status: "ok" | "warning" | "blocked" | "error" | "degraded";
  toolName: string;
  portfolioId?: string;
  programId?: string;
  projectIds?: string[];
  stateVersionHash?: string;
  deterministicCore?: TCore;
  advisoryPane?: {
    modelAssisted: boolean;
    excludedFromDeterministicHash: true;
    content: TAdvisory;
  };
  evidenceRefs: string[];
  artifactRefs: string[];
  redactionSummary: {
    redacted: boolean;
    omittedKinds: string[];
    policyRefs: string[];
  };
  warnings: Array<{
    warningId: string;
    severity: "low" | "medium" | "high" | "critical";
    summary: string;
    evidenceRefs: string[];
  }>;
  nextRecommendedTool?: string;
  traceId: string;
  correlationId: string;
};
```

### Envelope rules

- `deterministicCore` is the only field that can satisfy deterministic assertions for tool-specific results.
- `stateVersionHash` covers only canonical deterministic inputs and deterministic output facts.
- `advisoryPane` is optional and always excluded from deterministic hashes.
- `evidenceRefs` and `artifactRefs` contain refs only. They never contain raw logs, transcripts, screenshots, provider output, sessions, credentials, secrets, product rows, or scratchpads.
- `redactionSummary` is mandatory even when no data was redacted.
- `traceId` and `correlationId` are mandatory for every result, including errors and denials.
- `warnings` are sorted by severity rank, then `warningId`.

Parseable examples live in [`tool-contracts.example.json`](./fixtures/tool-contracts.example.json).

## Common Request Fields

Every public request accepts a common context object:

```ts
type ProgramToolRequestContext = {
  portfolioId: string;
  programId?: string;
  projectIds?: string[];
  contextAnchor?: ProgramContextAnchor;
  traceId: string;
  correlationId: string;
};
```

The runtime must also have server-verified actor identity. Caller-provided text identity is not enough for authz decisions.

## Legacy Narrow Tool Contracts

The tools below define the Phase 1A and forward-compatible narrow contracts that backed earlier clients. They remain useful for compatibility and fixture coverage, but autonomous agents should prefer the current public domain omni-tool surface.

### `list_program_capabilities`

Purpose: discover PMO domains and adapter capabilities without exposing every downstream tool.

Request:

```ts
type ListProgramCapabilitiesRequest = ProgramToolRequestContext & {
  includeAdapters?: boolean;
  capabilityDomain?: string;
};
```

Deterministic core:

```ts
type ListProgramCapabilitiesCore = {
  capabilities: Array<{
    capabilityId: string;
    phase: "1A" | "1B" | "1C" | "2" | "3";
    status: "available" | "planned" | "disabled" | "degraded";
    domains: string[];
    toolNames: string[];
    adapterIds: string[];
    evidencePolicyRefs: string[];
    sideEffectPosture: "read_only" | "pmo_internal_write" | "describes_actions_only";
  }>;
};
```

Authz and redaction:

- Requires portfolio read authority.
- Adapter details are limited to manifest fields allowed by the adapter redaction policy.
- Does not reveal downstream mutation methods even when the underlying capability has them.

### `get_program_documentation`

Purpose: retrieve concise documentation, schema refs, examples, authz rules, evidence rules, and failure modes.

Request:

```ts
type GetProgramDocumentationRequest = ProgramToolRequestContext & {
  topic:
    | "overview"
    | "schemas"
    | "tool_contracts"
    | "adapter_contracts"
    | "evidence_rules"
    | "authz_rules"
    | "failure_modes"
    | "fixture_backbone";
  format?: "markdown" | "json_summary";
};
```

Deterministic core:

```ts
type GetProgramDocumentationCore = {
  topic: string;
  sections: Array<{
    sectionId: string;
    title: string;
    summary: string;
    schemaRefs: string[];
    artifactRefs: string[];
    evidenceRefs: string[];
  }>;
};
```

Authz and redaction:

- Requires portfolio read authority.
- Raw document bodies are not returned when the document is content-bearing evidence.
- Schema and fixture refs are returned as artifact refs plus short summaries.

### `query_program_context`

Purpose: read bounded PMO memory for a program, project, branch, contract, or as-of audit context.

Request:

```ts
type QueryProgramContextRequest = ProgramToolRequestContext & {
  queryKind:
    | "applicable_decisions"
    | "dependency_status"
    | "evidence_status"
    | "contract_context"
    | "program_summary";
  targetRefs: string[];
  includeSuperseded?: boolean;
  includeFutureNotApplicable?: boolean;
  limit?: number;
};
```

Deterministic core:

```ts
type QueryProgramContextCore = {
  contextAnchor: ProgramContextAnchor;
  matchedRefs: Array<{
    ref: string;
    kind: string;
    status: string;
    reason: string;
    validFrom?: string;
    validTo?: string;
    recordedAt: string;
    evidenceRefs: string[];
  }>;
  omittedRefCount: number;
};
```

Authz and redaction:

- Requires portfolio read authority and project-level grants when project-scoped facts are returned.
- Enforces bitemporal context. Superseded, discarded, and future-not-applicable facts must be explicitly labeled.
- Omits prohibited payload bodies and reports the omission in `redactionSummary`.

### `assess_program_impact`

Purpose: run read-only blast-radius analysis without producing a full flight plan.

Request:

```ts
type AssessProgramImpactRequest = ProgramToolRequestContext & {
  changeRef: string;
  changeKind: string;
  targetRefs: string[];
  traversalBudgetRef: string;
};
```

Deterministic core:

```ts
type AssessProgramImpactCore = {
  changeRef: string;
  affectedRefs: Array<{ kind: string; ref: string; reason: string }>;
  findings: Array<{
    findingId: string;
    severity: "low" | "medium" | "high" | "critical";
    type: string;
    summary: string;
    evidenceRefs: string[];
  }>;
  requiredApprovals: Array<{ authorityRef: string; reason: string; evidencePolicyRefs: string[] }>;
  evidenceObligations: Array<{ policyRef: string; targetRef: string; status: "satisfied" | "missing" | "stale" }>;
};
```

Authz and redaction:

- Requires portfolio read authority over every traversed fact.
- Does not grant execution authority.
- Missing, stale, or unavailable evidence appears as deterministic findings, not as advisory text only.

## Forward-Compatible Tools

These tools are intentionally scoped now so later phases do not invent incompatible result shapes.

| Tool | Phase | Deterministic core | Boundary |
|---|---|---|---|
| `generate_program_update` | 1B | Report sections, artifact refs, evidence envelope refs, template version, deterministic input refs. | Generates PMO-owned markdown and JSON evidence artifacts only. |
| `get_program_audit_trail` | 1B | Filtered audit entries, cursor, evidence refs, redaction summary. | Returns redaction-safe PMO audit entries, not raw downstream logs. |
| `analyze_program_intelligence` | 1C | Deterministic proactive findings, repeated blockers, stale evidence, discarded decision matches, learning refs. | Model-assisted commentary is advisory only. |
| `plan_program_action` | 2 | Flight plan hash, affected scope, proposed external actions, approval gates, expected receipts, evidence obligations. | Flight plan is not downstream execution authority. |
| `record_program_receipt` | 3 | Receipt validation result, ledger entry ref, missing evidence, conflicting observed state. | Records PMO-owned receipts and events; does not mutate downstream systems. |
| `reconcile_program_state` | 3 | Expected-vs-observed receipt state, desync findings, stale cursors, evidence refs. | Reads adapters and records PMO-owned findings only. |

## Determinism and Hash Exclusions

Tool implementations must exclude the following from deterministic hashes:

- `advisoryPane`
- generated timestamps unless part of the request context
- raw artifact content
- raw logs, traces, screenshots, transcripts, sessions, credentials, secrets, product rows, and scratchpads
- non-deterministic adapter ordering
- model-assisted summaries

Deterministic arrays must be sorted before hashing. Public tool examples use stable refs and explicit ordering so they can become fixture tests without reinterpretation.

## Phase 1A Readiness Criteria

Phase 1A tool implementation can start when:

- the envelope schema parses from fixture examples
- all Phase 1A tools have request and deterministic-core examples
- authz requirements name portfolio, program, and project grant expectations
- redaction expectations are explicit for every tool
- advisory/model-assisted content is excluded from deterministic hashes
- later tools keep the same envelope shape and passive PMO boundary
