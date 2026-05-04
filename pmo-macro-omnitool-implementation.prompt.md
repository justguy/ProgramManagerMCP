# PMO Macro Omni-Tool Implementation Prompt

Use this prompt with a coding agent or implementation team to build the Program Manager / PMO normalized object model and single-tool macro surface.

## Role

You are an Expert Technical Project Manager, Systems Architect, and Senior TypeScript/Neo4j Engineer. Your objective is to implement the Program Manager MCP / PMO macro layer as a normalized graph-backed coordination system.

PMO is a stateful memory, dependency intelligence, planning, reconciliation, and audit ledger service. PMO is not a downstream executor. It may analyze, classify, plan, propose, ledger, reconcile, and report. It must not directly execute downstream mutations in LLM Tracker, Hoplon, GitHub, Semantix, Guardrail, Phalanx, Serena, or any other standalone capability.

## Feature Summary

Implement a single public MCP tool named `pmo_macro` using the Omni-Tool pattern.

All PMO macro capabilities are exposed as sub-tools or macro invocations behind `pmo_macro`. The user should not see dozens of separate PMO MCP tools. Instead, `pmo_macro` supports help, macro discovery, macro documentation, validation, invocation, and authorized macro-registry editing.

The PMO macro layer operates over normalized PMO objects such as `Portfolio`, `Program`, `Project`, `Task`, `Blocker`, `Contract`, `DependencyEdge`, `Runbook`, `FlightPlan`, `ExpectedReceipt`, `ObservedReceipt`, `Finding`, `RiskSignal`, `EvidenceRef`, and `ArtifactRef`.

The implementation must support these architecture capabilities:

1. Blocker Alleviation Engine.
2. Cross-Domain War-Gaming / Impact Simulation.
3. Instant Context Provisioning / Catch-Me-Up Protocol.
4. Automated Drift Detection / Reality Checker.
5. Editable built-in macro registry.
6. Deterministic output envelopes with evidence refs, artifact refs, redaction summaries, trace ids, correlation ids, and state hashes.

## Implementation Stack

Assume this default stack unless the repository proves otherwise:

- Language: TypeScript.
- Public MCP facade: MCP TypeScript SDK through the existing MCP gateway or equivalent server composition root.
- Database: Neo4j through `neo4j-driver`.
- Schema definitions: Zod.
- External validator output: generated JSON Schema plus AJV where useful.
- Deterministic hashing: canonical JSON serialization, preferably RFC 8785 / JCS semantics, then SHA-256 over the deterministic core.
- Tests: Vitest, fixture-based schema tests, repository unit tests, Neo4j integration tests, adapter conformance tests, macro dispatcher tests, and golden output tests.
- Observability: OpenTelemetry-compatible trace and metric hooks.

## Non-Negotiable Constraints

1. PMO must not execute downstream mutations.
2. PMO may mutate only its own repository, graph projections, event log, artifact registry, macro registry, reports, findings, receipts, and reconciliation state.
3. External work is performed by execution agents using their own authorized tools.
4. PMO plans external work through `ProposedAction`, `FlightPlan`, and `ExpectedReceipt` records.
5. Execution agents submit `ObservedReceipt` records after they perform external actions.
6. PMO validates and reconciles receipts against expected state and adapter-observed state.
7. PMO must use pointer-only context. Do not inline raw logs, screenshots, transcripts, secrets, credentials, full diffs, provider payloads, scratchpads, or long reports.
8. Every result must carry evidence refs or explicitly state that evidence is missing.
9. Every planning, impact, simulation, intelligence, or reconciliation result must carry a deterministic `stateVersionHash` unless the operation is pure help/documentation.
10. Model-assisted content must be separated into `advisoryPane` and excluded from deterministic hashes.
11. Repository queries that contribute to deterministic results must use explicit ordering.
12. All relevant facts must be scoped by portfolio, program, project, branch/commit/tracker context, valid time, recorded time, source adapter, source cursor, and evidence refs.
13. Portfolio isolation is mandatory. Cross-portfolio access is denied by default.
14. Client-supplied actor ids are not authoritative. Server-verified identity must be used for audit and authorization decisions.
15. Macro editing is allowed only as an internal PMO configuration mutation, gated by role/scope, and must not grant downstream execution authority.

## Phase Boundary

Implement Phase 1A first:

- normalized object schemas
- macro registry schema
- single `pmo_macro` public tool
- read-only graph-backed context and impact macros
- blocker analysis and proposed unblock plans
- simulation reports that do not mutate program truth
- drift detection reports and reconciliation findings
- pointer-only evidence/artifact refs
- deterministic envelopes and `stateVersionHash`
- seed fixtures and tests for the four provided macro examples

Defer direct receipt ingestion, full flight-plan execution lifecycle, and advanced proactive learning if necessary, but the schemas must be designed so later phases can add them without breaking the object model.

---

# 1. Normalized PMO Object Model

Implement PMO around stable normalized object types. Do not build one-off ad hoc JSON blobs for each macro. Macros should operate over these objects.

## 1.1 Common Fields

All persisted PMO objects that can affect execution must include:

```ts
type PmoScopedFactFields = {
  schemaVersion: "1";
  id: string;
  portfolioId: string;
  programId?: string;
  projectId?: string;
  repoId?: string;
  branchName?: string;
  gitCommit?: string;
  trackerSlug?: string;
  trackerRev?: number;
  contractRef?: string;
  integrationPointId?: string;
  validFrom: string;
  validTo?: string;
  recordedAt: string;
  supersededBy?: string;
  sourceAdapterId: string;
  sourceCursor?: string;
  evidenceRefs: string[];
};
```

Rules:

- `validFrom` / `validTo` define when the fact applies.
- `recordedAt` defines when PMO learned the fact.
- Superseded records must remain queryable for audit but must not satisfy current gates.
- Empty or missing evidence refs are allowed only when the object is explicitly marked as unevidenced, advisory, or needs review.
- No object may inline sensitive payloads.

## 1.2 Reference URI Scheme

Normalize references so objects can point to one another without depending on database internal ids.

Use these patterns:

```text
portfolio://default
program://agentic-os
project://ask-mr-gambler
vertical://agentic-os/authz
branch://hoplon/main@sha256:...
task://agentic-os/T404
milestone://agentic-os/M2
deliverable://agentic-os/hoplon-authz-v2
contract://hoplon/authz/escalation-grant@sha256:...
integration://agentic-os/hoplon-authz-gateway
blocker://agentic-os/blocker-hoplon-pr-12-review
runbook://code-review/request-senior-review
flightplan://agentic-os/fp-...
receipt://agentic-os/rcpt-...
evidence://github/pr-12/status@sha256:...
artifact://pmo/alignment-report/2026-05-03@sha256:...
decision://agentic-os/hoplon-authz-tier1-approval
finding://agentic-os/finding-phalanx-security-drift
risk://agentic-os/risk-contract-drift-hoplon-authz
macro://pmo/analyze_blockers
```

Rules:

- References must be stable, human-readable when possible, and safe to log.
- References must not contain secrets.
- Content-bearing refs must include or link to a content digest.
- PMO objects should use refs in public results and internal stable ids in repository methods.

---

# 2. Object Types To Implement

## 2.1 Portfolio

Purpose: isolation boundary across programs.

Required fields:

```ts
type Portfolio = {
  schemaVersion: "1";
  portfolioId: string;
  name: string;
  status: "active" | "archived";
  ownerRefs: string[];
  createdAt: string;
  evidenceRefs: string[];
};
```

Constraints:

- `portfolioId` is an isolation boundary, not only a filter.
- Repository methods must require portfolio scope or explicit cross-portfolio authority.
- Every PMO-owned object that can affect planning must carry `portfolioId`.

Neo4j:

- Label: `Portfolio`.
- Uniqueness: `Portfolio(portfolioId)`.

## 2.2 Program

Purpose: durable initiative spanning projects, verticals, contracts, tasks, and dependencies.

Required fields:

```ts
type Program = {
  schemaVersion: "1";
  programId: string;
  portfolioId: string;
  name: string;
  status: "planned" | "active" | "blocked" | "paused" | "completed" | "archived";
  ownerRefs: string[];
  goalRefs: string[];
  reportingCadence?: string;
  createdAt: string;
  evidenceRefs: string[];
};
```

Neo4j:

- Label: `Program`.
- Relationship: `(portfolio)-[:PORTFOLIO_HAS_PROGRAM]->(program)`.
- Uniqueness: `Program(portfolioId, programId)`.

## 2.3 Project

Purpose: participating codebase, service, tool, capability, or system.

Required fields:

```ts
type Project = {
  schemaVersion: "1";
  projectId: string;
  portfolioId: string;
  name: string;
  repoRefs: string[];
  trackerSlug?: string;
  adapterBindingIds: string[];
  status: "active" | "blocked" | "paused" | "archived";
  environmentTags: string[];
  evidenceRefs: string[];
};
```

Examples:

- `ask-mr-gambler`
- `hoplon`
- `project-phalanx`
- `semantix`
- `guardrail`

Neo4j:

- Label: `Project`.
- Relationship: `(program)-[:PROGRAM_USES_PROJECT]->(project)`.
- Uniqueness: `Project(portfolioId, projectId)`.

## 2.4 Vertical / Workstream

Purpose: functional workstream inside a program.

Required fields:

```ts
type Vertical = {
  schemaVersion: "1";
  verticalId: string;
  portfolioId: string;
  programId: string;
  name: string;
  status: "active" | "blocked" | "paused" | "completed";
  ownerRefs: string[];
  evidenceRefs: string[];
};
```

Examples: `authz`, `runtime`, `operations-dashboard`, `provider-broker`, `readiness-control`, `policy-enforcement`, `audit`, `reporting`.

Neo4j:

- Label: `Vertical`.
- Relationship: `(program)-[:PROGRAM_HAS_VERTICAL]->(vertical)`.

## 2.5 BranchContext

Purpose: repo branch/ref/worktree context with commit, tracker revision, adapter cursors, and optional Hoplon snapshots.

Required fields:

```ts
type BranchContext = {
  schemaVersion: "1";
  branchContextId: string;
  portfolioId: string;
  programId?: string;
  projectId: string;
  repoId: string;
  branchName: string;
  gitCommit?: string;
  trackerSlug?: string;
  trackerRev?: number;
  hoplonSnapshotRef?: string;
  sourceCursors: string[];
  validFrom: string;
  validTo?: string;
  recordedAt: string;
  evidenceRefs: string[];
};
```

Neo4j:

- Label: `BranchContext`.
- Relationship: `(project)-[:PROJECT_HAS_BRANCH_CONTEXT]->(branchContext)`.

## 2.6 ContextAnchor

Purpose: request-time context used to reconstruct applicable facts.

Required shape:

```ts
type ContextAnchor = {
  portfolioId?: string;
  programId?: string;
  projectId?: string;
  repoId?: string;
  branchName?: string;
  gitCommit?: string;
  trackerSlug?: string;
  trackerRev?: number;
  hoplonSnapshotRef?: string;
  asOf?: string;
};
```

Rules:

- All context, impact, simulation, planning, and reconciliation macros should accept a `ContextAnchor`.
- If no `asOf` is provided, use current server time and record it in the result envelope.
- Applicable facts must satisfy valid-time, recorded-time, branch, commit, tracker, supersession, and portfolio filters.

## 2.7 ProgramMembership

Purpose: temporal link between project, program, and optional vertical.

Required fields:

```ts
type ProgramMembership = {
  schemaVersion: "1";
  membershipId: string;
  portfolioId: string;
  programId: string;
  projectId: string;
  verticalId?: string;
  status: "active" | "pending" | "paused" | "ended";
  validFrom: string;
  validTo?: string;
  recordedAt: string;
  evidenceRefs: string[];
};
```

Neo4j:

- Relationship: `(program)-[:PROGRAM_USES_PROJECT {membershipId, validFrom, validTo, status}]->(project)`.

## 2.8 Task / WorkItem

Purpose: executable or trackable unit of work.

Required fields:

```ts
type Task = {
  schemaVersion: "1";
  taskId: string;
  taskRef: string;
  portfolioId: string;
  programId?: string;
  projectId?: string;
  trackerSlug?: string;
  trackerTaskId?: string;
  title: string;
  summary?: string;
  status: "not_started" | "in_progress" | "blocked" | "waiting" | "done" | "cancelled";
  priority: "low" | "medium" | "high" | "critical";
  ownerRefs: string[];
  dueAt?: string;
  conditionTags: string[];
  evidenceRefs: string[];
  validFrom: string;
  validTo?: string;
  recordedAt: string;
  sourceAdapterId: string;
  sourceCursor?: string;
};
```

Rules:

- PMO may import or mirror task state through an adapter.
- PMO must not directly mutate external tracker tasks.
- PMO may propose tracker updates through `ProposedAction`.

Neo4j:

- Labels: `Task`, optionally `TrackerTask`.
- Relationships: `(project)-[:OWNS_TASK]->(task)`, `(task)-[:DEPENDS_ON]->(otherTask)`, `(task)-[:HAS_BLOCKER]->(blocker)`.

## 2.9 Milestone

Purpose: target date or phase grouping tasks and deliverables.

Required fields:

```ts
type Milestone = {
  schemaVersion: "1";
  milestoneId: string;
  portfolioId: string;
  programId: string;
  projectId?: string;
  name: string;
  targetDate?: string;
  status: "planned" | "at_risk" | "blocked" | "met" | "missed" | "cancelled";
  taskRefs: string[];
  deliverableRefs: string[];
  evidenceRefs: string[];
};
```

## 2.10 Deliverable

Purpose: artifact, API, schema, feature, report, verified outcome, or operational capability.

Required fields:

```ts
type Deliverable = {
  schemaVersion: "1";
  deliverableId: string;
  deliverableRef: string;
  portfolioId: string;
  programId: string;
  projectId?: string;
  deliverableType: "artifact" | "api" | "schema" | "feature" | "report" | "verified_outcome" | "operational_capability";
  status: "planned" | "in_progress" | "blocked" | "delivered" | "verified" | "retired";
  contractRefs: string[];
  evidenceRefs: string[];
};
```

## 2.11 IntegrationPoint

Purpose: cross-project dependency requiring coordination.

Required fields:

```ts
type IntegrationPoint = {
  schemaVersion: "1";
  integrationPointId: string;
  portfolioId: string;
  programId: string;
  producerProjectId: string;
  consumerProjectIds: string[];
  contractRefs: string[];
  status: "active" | "pending" | "blocked" | "retired";
  owner: string;
  verificationRequirements: string[];
  evidenceRefs: string[];
};
```

Example:

```json
{
  "schemaVersion": "1",
  "integrationPointId": "hoplon-authz-gateway",
  "portfolioId": "default",
  "programId": "agentic-os",
  "producerProjectId": "hoplon",
  "consumerProjectIds": ["ask-mr-gambler", "project-phalanx"],
  "contractRefs": ["contract://hoplon/authz/escalation-grant@sha256:abc123"],
  "status": "active",
  "owner": "program-manager",
  "verificationRequirements": ["consumer_contract_tests", "policy_result"],
  "evidenceRefs": []
}
```

Neo4j:

- Label: `IntegrationPoint`.
- Relationships:
  - `(vertical)-[:VERTICAL_HAS_INTEGRATION_POINT]->(integration)`
  - `(integration)-[:INTEGRATION_PRODUCED_BY_PROJECT]->(producerProject)`
  - `(integration)-[:INTEGRATION_CONSUMED_BY_PROJECT]->(consumerProject)`
  - `(integration)-[:INTEGRATION_GOVERNED_BY_CONTRACT]->(contract)`

## 2.12 Contract

Purpose: schema, API, event, MCP tool, authz policy, evidence contract, trace contract, or operational behavior that producers expose and consumers depend on.

Required fields:

```ts
type Contract = {
  schemaVersion: "1";
  contractId: string;
  contractRef: string;
  portfolioId: string;
  programId?: string;
  projectId?: string;
  contractType: "schema" | "api" | "event" | "mcp_tool" | "authz_policy" | "evidence_contract" | "trace_contract" | "operational_behavior";
  version?: string;
  contentHash?: string;
  compatibilityStatus: "compatible" | "breaking" | "unknown" | "deprecated";
  producerProjectId?: string;
  consumerProjectIds: string[];
  evidenceRefs: string[];
  validFrom: string;
  validTo?: string;
  recordedAt: string;
  sourceAdapterId: string;
  sourceCursor?: string;
};
```

Neo4j:

- Label: `Contract`.
- Relationships: `(project)-[:PRODUCES_CONTRACT]->(contract)`, `(project)-[:CONSUMES_CONTRACT]->(contract)`.

## 2.13 DependencyEdge

Purpose: normalized dependency between tasks, projects, contracts, tools, policies, evidence, decisions, milestones, deliverables, or programs.

Required fields:

```ts
type DependencyEdge = {
  schemaVersion: "1";
  dependencyId: string;
  dependencyType:
    | "program_depends_on_program"
    | "project_depends_on_contract"
    | "task_depends_on_task"
    | "task_depends_on_contract"
    | "task_depends_on_decision"
    | "contract_consumed_by_project"
    | "decision_blocks_action"
    | "policy_blocks_action"
    | "evidence_required_for_contract"
    | "tool_required_for_verification"
    | "branch_diverges_from_context"
    | "blocker_targets_node"
    | "runbook_applies_to_blocker"
    | "receipt_satisfies_action";
  fromRef: string;
  toRef: string;
  portfolioId: string;
  programId?: string;
  projectId?: string;
  integrationPointId?: string;
  contractRef?: string;
  branchContextId?: string;
  trackerSlug?: string;
  trackerTaskId?: string;
  criticality: "tier_0" | "tier_1" | "tier_2" | "tier_3";
  status: "active" | "pending" | "satisfied" | "blocked" | "stale" | "superseded" | "discarded";
  reason?: string;
  validFrom: string;
  validTo?: string;
  recordedAt: string;
  supersededBy?: string;
  sourceAdapterId: string;
  sourceCursor?: string;
  evidenceRefs: string[];
  policyRefs: string[];
  approvalRequired: boolean;
  verificationRequired: boolean;
  receiptRequirements: string[];
};
```

Rules:

- Use first-class Neo4j relationships for hot traversals.
- Store `dependencyId` on every relationship that represents a dependency.
- Do not rely only on relationship type for identity.
- Relationship properties must include temporal scope, portfolio scope, status, criticality, evidence requirements, policy refs, source adapter id, and source cursor.
- Use `DependencyEdge` nodes only if rich metadata, audit history, or reification is required; otherwise use relationship properties and repository DTOs.

Neo4j hot relationship types:

```text
DEPENDS_ON
BLOCKS
HAS_BLOCKER
TARGETS
CONSUMES_CONTRACT
PRODUCES_CONTRACT
REQUIRES_APPROVAL
REQUIRES_EVIDENCE
SATISFIED_BY
SUPERSEDES
AFFECTS
DERIVED_FROM
SUGGESTS_RUNBOOK
HAS_RECEIPT
```

## 2.14 Blocker

Purpose: first-class impediment with type, lifecycle, severity, target, evidence, and runbook mapping.

Required fields:

```ts
type Blocker = {
  schemaVersion: "1";
  blockerId: string;
  blockerRef: string;
  portfolioId: string;
  programId?: string;
  projectId?: string;
  blockerType:
    | "awaiting_code_review"
    | "awaiting_human_approval"
    | "missing_evidence"
    | "stale_evidence"
    | "contract_drift"
    | "dependency_failure"
    | "policy_denial"
    | "budget_exhausted"
    | "resource_unavailable"
    | "adapter_unavailable"
    | "receipt_missing"
    | "conflicting_state"
    | "branch_divergence"
    | "circular_dependency"
    | "security_or_compliance_gate";
  status: "open" | "blocked" | "in_review" | "mitigated" | "resolved" | "superseded" | "false_positive";
  severity: "low" | "medium" | "high" | "critical";
  criticality: "tier_0" | "tier_1" | "tier_2" | "tier_3";
  blockedRef: string;
  targetRef?: string;
  reason: string;
  ownerRefs: string[];
  recommendedRunbookRefs: string[];
  conditionTags: string[];
  validFrom: string;
  validTo?: string;
  recordedAt: string;
  supersededBy?: string;
  sourceAdapterId: string;
  sourceCursor?: string;
  evidenceRefs: string[];
};
```

Rules:

- A blocker should be a node, not only a relationship property.
- Use relationships for fast traversal and node fields for lifecycle/evidence/runbook state.
- PMO may classify blockers and propose runbooks.
- PMO must not directly perform the unblock action.

Neo4j:

```cypher
(task:Task)-[:HAS_BLOCKER {dependencyId, status, criticality, validFrom, validTo, portfolioId}]->(blocker:Blocker)
(blocker)-[:BLOCKS]->(task)
(blocker)-[:TARGETS]->(target)
(blocker)-[:SUGGESTS_RUNBOOK]->(runbook:Runbook)
(blocker)-[:EVIDENCED_BY]->(evidence:EvidenceRef)
```

## 2.15 DecisionRequest

Purpose: unresolved gate requiring authority.

Required fields:

```ts
type DecisionRequest = {
  schemaVersion: "1";
  decisionRequestId: string;
  portfolioId: string;
  programId: string;
  projectId?: string;
  title: string;
  summary: string;
  authorityRequired: "human_operator" | "c_suite_agent" | "security_owner" | "technical_owner";
  affectedRefs: string[];
  dueAt?: string;
  status: "open" | "approved" | "rejected" | "expired" | "superseded";
  evidenceRefs: string[];
  validFrom: string;
  validTo?: string;
  recordedAt: string;
};
```

## 2.16 DecisionRecord

Purpose: resolved decision with authority, evidence, scope, expiry, and supersession.

Required fields:

```ts
type DecisionRecord = {
  schemaVersion: "1";
  decisionId: string;
  portfolioId: string;
  programId: string;
  projectId?: string;
  decisionRequestId?: string;
  decisionType: "approval" | "rejection" | "constraint" | "exception" | "supersession";
  approverRef: string;
  authorityRef: string;
  summary: string;
  rationaleSummary: string;
  affectedRefs: string[];
  constraints: string[];
  conditionTags: string[];
  validFrom: string;
  validTo?: string;
  reviewAt?: string;
  expiresAt?: string;
  recordedAt: string;
  supersedes?: string[];
  supersededBy?: string;
  evidenceRefs: string[];
};
```

Rules:

- Superseded, expired, future-not-applicable, or branch-inapplicable decisions must not satisfy approval gates.
- Decision records require evidence refs.

## 2.17 DiscardedDecision

Purpose: rejected, superseded, or abandoned decision option that should not be repeated under matching conditions.

Required fields:

```ts
type DiscardedDecision = {
  schemaVersion: "1";
  discardedDecisionId: string;
  portfolioId: string;
  programId?: string;
  projectIds: string[];
  integrationPointIds: string[];
  contractRefs: string[];
  summary: string;
  rejectedOption: string;
  reason: string;
  conditionTags: string[];
  avoidAction?: string;
  validFrom: string;
  validTo?: string;
  recordedAt: string;
  supersededBy?: string;
  evidenceRefs: string[];
};
```

Deterministic match rule:

- A proposed change matches a discarded decision if it shares at least one `contract:*` or `integration:*` tag, shares at least one `action:*` or `risk:*` tag, and has no conflicting `branch:*`, `program:*`, or valid-time condition.
- Embedding or LLM similarity may be advisory only.

## 2.18 EvidenceRef

Purpose: pointer-only reference to proof, audit, trace, diff, test result, policy result, tracker history, or signed receipt.

Required fields:

```ts
type EvidenceRef = {
  schemaVersion: "1";
  evidenceId: string;
  evidenceRef: string;
  portfolioId: string;
  programId?: string;
  projectId?: string;
  evidenceType:
    | "tracker_history"
    | "github_pr_status"
    | "code_review_result"
    | "policy_result"
    | "test_result"
    | "contract_schema"
    | "adapter_observed_state"
    | "operator_attestation"
    | "downstream_signed_receipt"
    | "trace_export"
    | "report_ref";
  storageUri?: string;
  contentHash?: { algorithm: "sha256"; value: string };
  classification: "public" | "internal" | "operator_only" | "content_bearing_evidence" | "secret_adjacent";
  redactionStatus: "not_required" | "redacted" | "blocked" | "pending_review";
  producedByAdapterId?: string;
  validFrom: string;
  validTo?: string;
  createdAt: string;
  expiresAt?: string;
  sourceCursor?: string;
};
```

Rules:

- Evidence refs are pointers, not inlined content.
- High-risk gates should require independently verifiable evidence when available.
- Secret-adjacent evidence must not be returned inline.

## 2.19 ArtifactRef

Purpose: pointer-only metadata for generated or imported artifacts such as reports, schemas, snapshots, traces, handoffs, and policy results.

Required fields:

```ts
type ArtifactRef = {
  schemaVersion: "1";
  artifactId: string;
  artifactType:
    | "alignment_report"
    | "implementation_report"
    | "tracker_snapshot"
    | "hoplon_audit"
    | "policy_result"
    | "test_result"
    | "contract_schema"
    | "decision_packet"
    | "handoff"
    | "trace_export"
    | "screenshot_ref"
    | "provider_transcript_ref";
  storageUri: string;
  contentHash: { algorithm: "sha256"; value: string };
  producer: string;
  portfolioId: string;
  programId?: string;
  projectId?: string;
  repoId?: string;
  branchName?: string;
  gitCommit?: string;
  trackerRev?: number;
  integrationPointId?: string;
  contractRef?: string;
  decisionId?: string;
  flightPlanId?: string;
  receiptId?: string;
  classification: "public" | "internal" | "operator_only" | "content_bearing_evidence" | "secret_adjacent";
  redactionStatus: "not_required" | "redacted" | "blocked" | "pending_review";
  validFrom: string;
  validTo?: string;
  createdAt: string;
  expiresAt?: string;
  retentionPolicyRef: string;
  sourceCursor?: string;
};
```

Rules:

- Reports are generated artifacts, not source-of-truth state.
- Deleting a generated report must not lose PMO memory.
- Generated reports should have a paired JSON evidence envelope.

## 2.20 Finding

Purpose: concrete PMO-observed issue or mismatch.

Required fields:

```ts
type Finding = {
  schemaVersion: "1";
  findingId: string;
  portfolioId: string;
  programId?: string;
  projectId?: string;
  kind:
    | "stale_evidence"
    | "missing_evidence"
    | "contract_drift"
    | "blocked_task"
    | "policy_denial"
    | "adapter_health_degradation"
    | "unexpected_security_blocker"
    | "receipt_claim_not_observed"
    | "blocker_state_conflict"
    | "branch_divergence"
    | "desynchronized_state";
  severity: "low" | "medium" | "high" | "critical";
  summary: string;
  affectedRefs: string[];
  expectedRef?: string;
  observedRef?: string;
  recommendedAction?: string;
  deterministicRuleId?: string;
  confidence: number;
  status: "open" | "acknowledged" | "mitigated" | "resolved" | "false_positive";
  validFrom: string;
  validTo?: string;
  recordedAt: string;
  evidenceRefs: string[];
};
```

## 2.21 RiskSignal

Purpose: proactive warning derived from graph structure, stale evidence, repeated failures, branch divergence, tool health, or contract drift.

Required fields:

```ts
type RiskSignal = {
  schemaVersion: "1";
  riskId: string;
  portfolioId: string;
  programId?: string;
  projectId?: string;
  riskType:
    | "high_dependency_fanout"
    | "blocked_critical_path"
    | "stale_evidence_on_active_dependency"
    | "missing_consumer_verification"
    | "branch_divergence"
    | "repeated_blocker"
    | "tool_health_degradation"
    | "contract_sla_breach"
    | "resource_pressure";
  severity: "low" | "medium" | "high" | "critical";
  summary: string;
  affectedRefs: string[];
  deterministicRuleId?: string;
  confidence: number;
  status: "active" | "needs_review" | "mitigated" | "retired";
  evidenceRefs: string[];
  validFrom: string;
  validTo?: string;
  recordedAt: string;
};
```

## 2.22 AttemptRecord

Purpose: attempted implementation, verification, mitigation, propagation, migration, or decision action with outcome.

Required fields:

```ts
type AttemptRecord = {
  schemaVersion: "1";
  attemptId: string;
  portfolioId: string;
  programId?: string;
  projectId?: string;
  attemptType: "implementation" | "verification" | "mitigation" | "propagation" | "migration" | "decision" | "integration";
  targetRefs: string[];
  summary: string;
  outcome: "succeeded" | "failed" | "partial" | "reverted" | "abandoned";
  failureMode?: string;
  conditionTags: string[];
  startedAt: string;
  completedAt?: string;
  recordedAt: string;
  evidenceRefs: string[];
};
```

## 2.23 LearningRecord

Purpose: reusable lesson derived from attempts, decisions, blockers, audits, incidents, reports, or repeated program patterns.

Required fields:

```ts
type LearningRecord = {
  schemaVersion: "1";
  learningId: string;
  learningType:
    | "failed_attempt"
    | "discarded_decision"
    | "repeated_blocker"
    | "contract_drift"
    | "stale_evidence"
    | "policy_conflict"
    | "fragile_integration"
    | "branch_divergence"
    | "tool_health_degradation"
    | "successful_mitigation";
  portfolioId: string;
  programIds: string[];
  projectIds: string[];
  integrationPointIds: string[];
  contractRefs: string[];
  branchContextIds: string[];
  summary: string;
  whyItMatters: string;
  conditions: string[];
  conditionTags: string[];
  recommendedAction?: string;
  avoidAction?: string;
  confidence: number;
  confidenceMode: "operator_asserted" | "evidence_ratio" | "adapter_reported";
  confidenceReason: string;
  status: "active" | "needs_review" | "superseded" | "retired";
  derivedFrom: string[];
  validFrom: string;
  validTo?: string;
  supersededBy?: string;
  evidenceRefs: string[];
};
```

Confidence rule:

```text
evidence_ratio = min(1, 0.35 + 0.15 * corroboratingEvidenceCount + 0.10 * successfulOutcomeCount - 0.15 * contradictoryOutcomeCount)
```

Cap at `0.95` unless operator-approved. If confidence cannot be calculated, set `status: "needs_review"` and `confidence <= 0.5`.

## 2.24 FailurePattern

Purpose: normalized recurring failure mode across projects or programs.

Required fields:

```ts
type FailurePattern = {
  schemaVersion: "1";
  failurePatternId: string;
  portfolioId: string;
  patternType: "repeated_blocker" | "contract_drift" | "policy_conflict" | "adapter_health" | "fragile_integration" | "stale_evidence";
  summary: string;
  conditionTags: string[];
  occurrenceRefs: string[];
  affectedRefs: string[];
  recommendedAction?: string;
  confidence: number;
  status: "active" | "needs_review" | "mitigated" | "retired";
  evidenceRefs: string[];
  validFrom: string;
  validTo?: string;
  recordedAt: string;
};
```

## 2.25 CapabilityAdapter

Purpose: stable read/analysis/sync interface to standalone capabilities.

Required fields:

```ts
type CapabilityAdapter = {
  schemaVersion: "1";
  adapterId: string;
  version: string;
  displayName: string;
  domains: string[];
  capabilities: Array<{
    capabilityId: string;
    description: string;
    sideEffect: "read" | "analysis" | "proposal" | "receipt_ingest" | "internal_projection";
    requiresApproval: boolean;
    schemaRef: string;
    emits: string[];
    consumes: string[];
    resources: string[];
    sourceCursors: string[];
    evidenceTypes: string[];
  }>;
  authz: {
    readableBy: string[];
    writableBy: string[];
  };
};
```

Rules:

- Adapters may read external state and analyze impact.
- Adapters must not expose mutation authority through PMO.
- Adapters must produce pointer-only evidence refs.
- Adapters must report health and freshness.

## 2.26 AdapterBinding

Purpose: configured adapter instance for a project/program scope.

Required fields:

```ts
type AdapterBinding = {
  schemaVersion: "1";
  adapterBindingId: string;
  portfolioId: string;
  programId?: string;
  projectId?: string;
  adapterId: string;
  manifestVersion: string;
  authScopeRefs: string[];
  sideEffectPosture: "read_only" | "analysis_only" | "proposal_only" | "receipt_ingest" | "internal_projection";
  healthStatus: "healthy" | "degraded" | "unavailable" | "circuit_open";
  lastCheckedAt?: string;
  evidenceRefs: string[];
};
```

## 2.27 SyncCursor

Purpose: last observed revision/event/hash per external tool.

Required fields:

```ts
type SyncCursor = {
  schemaVersion: "1";
  syncCursorId: string;
  portfolioId: string;
  programId?: string;
  projectId?: string;
  adapterId: string;
  cursorType: "tracker_rev" | "git_commit" | "api_cursor" | "event_id" | "snapshot_hash" | "report_hash";
  cursorValue: string;
  observedAt: string;
  staleAfterSeconds?: number;
  evidenceRefs: string[];
};
```

## 2.28 Runbook

Purpose: typed playbook PMO can recommend for blockers, findings, risks, drift, and missing evidence.

Required fields:

```ts
type Runbook = {
  schemaVersion: "1";
  runbookId: string;
  runbookRef: string;
  portfolioId?: string;
  runbookType:
    | "blocker_alleviation"
    | "approval_gate_resolution"
    | "evidence_refresh"
    | "dependency_debug"
    | "contract_revalidation"
    | "resource_reallocation"
    | "drift_reconciliation"
    | "security_triage";
  displayName: string;
  appliesToBlockerTypes: string[];
  appliesToFindingKinds: string[];
  appliesToRiskTypes: string[];
  requiredAdapters: string[];
  requiredEvidenceTypes: string[];
  proposedActions: Array<{
    action: string;
    executionOwner: "llm_agent" | "worker_agent" | "human_operator";
    targetRefTemplate: string;
    reasonTemplate: string;
  }>;
  expectedReceiptTypes: string[];
  approvalRequired: boolean;
  riskLevel: "low" | "medium" | "high" | "critical";
  editableFields: string[];
  lockedFields: string[];
  evidenceRefs: string[];
};
```

Rules:

- Runbooks map normalized blockers/findings/risks to proposed external actions and expected receipts.
- Runbooks are editable only inside the PMO macro registry/config store.
- Runbooks cannot grant new downstream permissions.

## 2.29 ProposedAction

Purpose: PMO-recommended external action to be performed outside PMO.

Required fields:

```ts
type ProposedAction = {
  schemaVersion: "1";
  proposedActionId: string;
  portfolioId: string;
  programId: string;
  projectId?: string;
  targetAdapterId: string;
  action: string;
  targetRef: string;
  executionOwner: "llm_agent" | "worker_agent" | "human_operator";
  idempotencyKey: string;
  reason: string;
  requiredApprovalRefs: string[];
  expectedReceiptIds: string[];
  sideEffectClass: "external_mutation" | "external_read" | "internal_projection" | "operator_decision";
  evidenceRefs: string[];
};
```

Rules:

- Proposed actions describe work; PMO does not execute them.
- All external mutation proposed actions require expected receipts.

## 2.30 FlightPlan

Purpose: deterministic plan containing proposed actions, gates, evidence obligations, blast radius, risks, and expected receipts.

Required fields:

```ts
type FlightPlan = {
  schemaVersion: "1";
  flightPlanId: string;
  flightPlanHash: string;
  stateVersionHash: string;
  portfolioId: string;
  programId: string;
  contextAnchor?: ContextAnchor;
  generatedAt: string;
  expiresAt: string;
  ttlSeconds: number;
  proposedChange: {
    changeType: string;
    targetRefs: string[];
    summary: string;
  };
  blastRadius: {
    affectedProgramIds: string[];
    affectedProjectIds: string[];
    affectedIntegrationPointIds: string[];
    affectedContractRefs: string[];
    affectedTaskRefs: string[];
  };
  gaps: Array<{ gapId: string; kind: string; summary: string; evidenceRefs: string[] }>;
  dependencies: Array<{ dependencyId: string; dependencyType: string; fromRef: string; toRef: string; status: string; reason: string }>;
  risks: Array<{ riskId: string; severity: string; summary: string; requiresApproval: boolean; evidenceRefs: string[] }>;
  proposedExternalActions: ProposedAction[];
  expectedReceipts: ExpectedReceipt[];
  evidenceObligations: string[];
  deterministicCore: {
    ruleVersions: string[];
    repositoryQueryIds: string[];
    adapterCursorRefs: string[];
  };
  advisoryPane?: {
    modelAssistedFindings: unknown[];
    excludedFromFlightPlanHash: true;
  };
  traceId: string;
  correlationId: string;
};
```

Rules:

- Flight plan hash is computed over deterministic core only.
- Expired or stale flight plans cannot satisfy expected receipts without revalidation.
- Flight plans are roll-forward; partial execution is reconciled with new findings/plans, not rollback transactions.

## 2.31 ExpectedReceipt

Purpose: receipt obligation generated by a proposed action.

Required fields:

```ts
type ExpectedReceipt = {
  schemaVersion: "1";
  expectedReceiptId: string;
  portfolioId: string;
  programId: string;
  flightPlanId: string;
  proposedActionId: string;
  receiptType: string;
  requiredFields: string[];
  evidenceRequirements: string[];
  duePolicy: {
    policyId: string;
    startsAt: string;
    dueAt: string;
    warnAfterSeconds: number;
    staleAfterSeconds: number;
    lostAfterSeconds: number;
    escalationRefs: string[];
  };
  status: "expected" | "in_flight" | "submitted" | "accepted" | "rejected" | "late" | "lost" | "conflicting" | "superseded";
  evidenceRefs: string[];
};
```

## 2.32 ObservedReceipt

Purpose: submitted or adapter-observed proof of external completion.

Required fields:

```ts
type ObservedReceipt = {
  schemaVersion: "1";
  receiptId: string;
  portfolioId: string;
  programId: string;
  flightPlanId: string;
  flightPlanHash: string;
  flightPlanStateVersionHash: string;
  proposedActionId: string;
  submittedByActorId: string;
  submittedByRole: string;
  status: "submitted" | "accepted" | "rejected" | "conflicts_with_observed_state" | "stale_plan_revalidation_required";
  targetAdapterId: string;
  targetRef: string;
  externalAction: string;
  externalResultRef?: string;
  externalResultDigest?: { algorithm: "sha256"; value: string };
  verification: {
    method: "adapter_observed_state" | "content_digest" | "downstream_signed_receipt" | "operator_attestation" | "not_independently_verified";
    verifiedAt?: string;
    verifierAdapterId?: string;
    signatureRef?: string;
    limitations: string[];
  };
  traceId: string;
  correlationId: string;
  evidenceRefs: string[];
  submittedAt: string;
};
```

## 2.33 ReconciliationFinding

Purpose: mismatch between expected PMO state and observed adapter state.

Required fields:

```ts
type ReconciliationFinding = {
  schemaVersion: "1";
  reconciliationFindingId: string;
  portfolioId: string;
  programId?: string;
  flightPlanId?: string;
  kind:
    | "missing_receipts"
    | "conflicting_state"
    | "stale_flight_plan"
    | "stale_evidence"
    | "unexpected_adapter_state"
    | "desynchronized_state";
  severity: "low" | "medium" | "high" | "critical";
  summary: string;
  expectedRef?: string;
  observedRef?: string;
  missingReceiptIds: string[];
  conflictingReceiptIds: string[];
  staleFlightPlanIds: string[];
  evidenceRefs: string[];
  recommendedAction?: string;
  status: "open" | "acknowledged" | "mitigated" | "resolved";
  recordedAt: string;
};
```

## 2.34 MacroDefinition

Purpose: editable built-in or user-defined macro configuration.

Required fields:

```ts
type MacroDefinition = {
  schemaVersion: "1";
  macroId: string;
  displayName: string;
  description: string;
  category:
    | "help"
    | "context"
    | "impact"
    | "simulation"
    | "blocker"
    | "planning"
    | "reconciliation"
    | "reporting"
    | "audit"
    | "intelligence"
    | "administration";
  operation:
    | "help"
    | "list_macros"
    | "describe_macro"
    | "get_localized_context"
    | "assess_impact"
    | "simulate_change"
    | "analyze_blockers"
    | "propose_unblock_plan"
    | "detect_drift"
    | "reconcile_state"
    | "generate_update"
    | "get_audit_trail"
    | "analyze_critical_path"
    | "analyze_resource_pressure"
    | "detect_repeated_patterns"
    | "find_decision_conflicts"
    | "find_stale_evidence"
    | "validate_receipt"
    | "build_flight_plan";
  inputSchemaRef: string;
  outputSchemaRef: string;
  defaultOptions: Record<string, unknown>;
  editableFields: string[];
  lockedFields: string[];
  sideEffectClass: "none" | "internal_pmo_config" | "internal_pmo_projection" | "internal_pmo_ledger" | "external_proposal_only";
  requiredRoles: string[];
  requiredScopes: string[];
  enabled: boolean;
  version: string;
  deterministicRuleVersions: string[];
  promptTemplate?: string;
  runbookRefs: string[];
  evidencePolicyRefs: string[];
  createdAt: string;
  updatedAt: string;
  evidenceRefs: string[];
};
```

Rules:

- Built-in macros may be editable but must keep locked safety fields intact.
- Macro editing can change names, thresholds, default traversal depth, included sections, prompt templates, and runbook mapping.
- Macro editing cannot change side-effect posture to downstream mutation.
- Macro editing cannot disable portfolio isolation, evidence discipline, actor stamping, redaction, or deterministic hash rules.
- User-defined macros must call existing safe macro operations and repository methods; they cannot introduce arbitrary downstream tool calls.

## 2.35 MacroInvocation

Purpose: audit record for every call to `pmo_macro`.

Required fields:

```ts
type MacroInvocation = {
  schemaVersion: "1";
  macroInvocationId: string;
  macroId: string;
  portfolioId?: string;
  programId?: string;
  projectId?: string;
  actorId: string;
  actorRole: string;
  traceId: string;
  correlationId: string;
  contextAnchor?: ContextAnchor;
  targetRefs: string[];
  inputDigest: { algorithm: "sha256"; value: string };
  stateVersionHash?: string;
  status: "received" | "validated" | "completed" | "blocked" | "failed";
  startedAt: string;
  completedAt?: string;
  evidenceRefs: string[];
};
```

---

# 3. Single Public Tool: `pmo_macro`

## 3.1 Tool Description

Expose exactly one public PMO macro MCP tool:

```text
pmo_macro
```

Tool description:

```text
Use this single PMO Omni-Tool for Program Manager help, macro discovery, macro documentation, context packets, impact analysis, blocker analysis, simulation, planning proposals, drift detection, reconciliation, reporting, audit lookup, and authorized macro registry edits. PMO analyzes, proposes, ledgers, reconciles, and reports. PMO does not execute downstream mutations.
```

## 3.2 Input Schema

Implement this as the top-level input schema:

```ts
type PmoMacroToolInput = {
  schemaVersion: "1";
  subtool:
    | "help"
    | "list_macros"
    | "describe_macro"
    | "invoke"
    | "validate_macro"
    | "edit_macro"
    | "export_macro_registry"
    | "list_object_types"
    | "describe_object_type";
  macroId?: string;
  request?: PmoMacroRequest;
  editPatch?: PmoMacroEditPatch;
  documentationQuery?: {
    topic?: string;
    domain?: string;
    action?: string;
    objectType?: string;
    includeExamples?: boolean;
  };
  traceId?: string;
  correlationId?: string;
};
```

## 3.3 Macro Request Schema

```ts
type PmoMacroRequest = {
  schemaVersion: "1";
  scope: {
    portfolioId?: string;
    programIds?: string[];
    projectIds?: string[];
    taskRefs?: string[];
    contractRefs?: string[];
    integrationPointIds?: string[];
    blockerRefs?: string[];
    findingRefs?: string[];
  };
  targetRefs: string[];
  contextAnchor?: ContextAnchor;
  hypothesis?: {
    kind:
      | "timeline_shift"
      | "resource_drain"
      | "contract_change"
      | "adapter_outage"
      | "task_completion"
      | "blocker_removed"
      | "blocker_added"
      | "policy_change";
    payload: Record<string, unknown>;
  };
  proposedChange?: {
    changeType: string;
    targetRefs: string[];
    summary: string;
    payloadSchemaRef?: string;
    payloadDigest?: string;
  };
  filters?: {
    statuses?: string[];
    severities?: string[];
    blockerTypes?: string[];
    findingKinds?: string[];
    riskTypes?: string[];
    since?: string;
    asOf?: string;
  };
  options?: {
    maxTraversalDepth?: number;
    maxResults?: number;
    maxAdapterCalls?: number;
    includeAdvisoryPane?: boolean;
    requireDeterministicOnly?: boolean;
    includeEvidenceRefs?: boolean;
    includeArtifactRefs?: boolean;
    includeProposedActions?: boolean;
    saveAsArtifact?: boolean;
    dryRun?: boolean;
  };
  outputMode?:
    | "help"
    | "context_packet"
    | "impact_report"
    | "simulation_report"
    | "blocker_report"
    | "flight_plan"
    | "reconciliation_findings"
    | "status_update"
    | "audit_packet"
    | "macro_registry";
};
```

## 3.4 Macro Edit Patch Schema

```ts
type PmoMacroEditPatch = {
  schemaVersion: "1";
  macroId: string;
  expectedVersion: string;
  patchReason: string;
  changes: {
    displayName?: string;
    description?: string;
    defaultOptions?: Record<string, unknown>;
    promptTemplate?: string;
    runbookRefs?: string[];
    evidencePolicyRefs?: string[];
    enabled?: boolean;
  };
  evidenceRefs: string[];
};
```

Rules:

- Reject edits to locked fields.
- Reject edits without server-verified actor authority.
- Reject edits that change macro side-effect class to downstream execution.
- Persist accepted edits as PMO internal configuration events.
- Return the new macro registry version and artifact/evidence refs.

## 3.5 Output Envelope

All `pmo_macro` responses must use one envelope:

```ts
type PmoMacroToolResult = {
  schemaVersion: "1";
  status: "ok" | "warning" | "blocked" | "error";
  subtool: string;
  macroId?: string;
  macroInvocationId?: string;
  stateVersionHash?: string;
  deterministicCore: unknown;
  advisoryPane?: {
    modelAssistedFindings: unknown[];
    excludedFromStateHash: true;
  };
  evidenceRefs: string[];
  artifactRefs: string[];
  redactionSummary: {
    redactedKinds: string[];
    omittedRefs: string[];
    notes: string[];
  };
  warnings: string[];
  errors: Array<{
    code: string;
    message: string;
    targetRef?: string;
  }>;
  traceId: string;
  correlationId: string;
};
```

Rules:

- `help`, `list_macros`, and `describe_macro` may omit `stateVersionHash` when they do not read PMO graph state.
- Any macro reading PMO state must include `stateVersionHash`.
- Any redacted or omitted content must be represented in `redactionSummary`.
- Errors must be structured and must not leak secrets.

---

# 4. Built-In Macro Registry

Ship these built-in macros. Users may edit allowed fields, but not locked safety fields.

## 4.1 `pmo.help`

Purpose: explain how to use `pmo_macro`, list examples, and route users to relevant macros.

Operation: `help`.

Category: `help`.

Side effect: `none`.

Editable fields:

- `displayName`
- `description`
- `promptTemplate`

Locked fields:

- `macroId`
- `operation`
- `sideEffectClass`
- `requiredRoles`
- `requiredScopes`

## 4.2 `pmo.list_macros`

Purpose: list available built-in and user-defined macros.

Operation: `list_macros`.

Output: macro ids, categories, descriptions, versions, side-effect classes, and editable fields.

## 4.3 `pmo.describe_macro`

Purpose: describe a specific macro, input requirements, examples, safety constraints, and output shape.

Operation: `describe_macro`.

## 4.4 `pmo.get_localized_context`

Purpose: provide bounded context around a target node without raw graph dumps or wiki-scale context.

Operation: `get_localized_context`.

Output mode: `context_packet`.

Required object types:

- `ContextAnchor`
- `Program`
- `Project`
- `Task`
- `Contract`
- `DependencyEdge`
- `DecisionRecord`
- `DiscardedDecision`
- `Blocker`
- `EvidenceRef`
- `ArtifactRef`

Default options:

```json
{
  "maxTraversalDepth": 2,
  "maxResults": 25,
  "includeAdvisoryPane": false,
  "includeEvidenceRefs": true,
  "includeArtifactRefs": true
}
```

Deterministic output panes:

- `currentState`
- `blockingDependencies`
- `applicableDecisions`
- `discardedDecisions`
- `supersededDecisions`
- `futureDecisions`
- `pastFailedAttempts`
- `reusableMitigations`
- `crossProgramSignals`
- `staleEvidence`
- `recommendedActions`

## 4.5 `pmo.assess_impact`

Purpose: compute blast radius for a proposed change without generating a full flight plan.

Operation: `assess_impact`.

Output mode: `impact_report`.

Required object types:

- `Contract`
- `IntegrationPoint`
- `DependencyEdge`
- `Project`
- `Task`
- `DecisionRequest`
- `DecisionRecord`
- `EvidenceRef`
- `RiskSignal`
- `Finding`

Default options:

```json
{
  "maxTraversalDepth": 4,
  "maxResults": 100,
  "includeProposedActions": true,
  "includeEvidenceRefs": true
}
```

Output must include:

- affected programs
- affected projects
- affected integration points
- affected contracts
- affected tasks
- dependency ids
- required approvals
- evidence requirements
- risks
- gaps
- proposed follow-up actions

## 4.6 `pmo.simulate_change`

Purpose: run a non-persistent hypothetical scenario over the graph.

Operation: `simulate_change`.

Output mode: `simulation_report`.

Supported hypotheses:

- `timeline_shift`
- `resource_drain`
- `contract_change`
- `adapter_outage`
- `task_completion`
- `blocker_removed`
- `blocker_added`
- `policy_change`

Rules:

- Simulation must not rewrite current PMO truth.
- Simulation may optionally save a generated artifact if `saveAsArtifact: true` and the actor is authorized.
- Simulation output must clearly label all projected effects as hypothetical.

## 4.7 `pmo.analyze_blockers`

Purpose: find, classify, prioritize, and explain active blockers.

Operation: `analyze_blockers`.

Output mode: `blocker_report`.

Default filters:

```json
{
  "statuses": ["open", "blocked", "in_review"],
  "severities": ["medium", "high", "critical"]
}
```

Output must include:

- blocker cards
- blocked refs
- target refs
- blocker type
- severity
- criticality
- age
- applicable runbooks
- evidence refs
- affected downstream refs
- suggested next macro

## 4.8 `pmo.propose_unblock_plan`

Purpose: map blockers to runbooks and proposed external actions with expected receipts.

Operation: `propose_unblock_plan`.

Output mode: `flight_plan`.

Rules:

- PMO returns proposed actions only.
- PMO does not execute code review, budget approval, API debugging, tracker writes, or downstream notifications.
- Every external mutation proposal must have expected receipts.
- High-risk blockers must surface approval gates.

## 4.9 `pmo.detect_drift`

Purpose: compare PMO expected state against adapter-observed external state.

Operation: `detect_drift`.

Output mode: `reconciliation_findings`.

Rules:

- If an adapter is unavailable, report a gap rather than claiming current state.
- If PMO and adapter state conflict, emit `ReconciliationFinding` and proposed remediation actions.
- Do not write external tracker blockers directly.

## 4.10 `pmo.reconcile_state`

Purpose: reconcile expected receipts, observed receipts, adapter state, and graph facts.

Operation: `reconcile_state`.

Output mode: `reconciliation_findings`.

Rules:

- Distinguish `in_flight`, `late`, `lost`, `conflicting`, and `satisfied` receipt states.
- Stale flight plans require revalidation.
- Do not mark a receipt accepted solely because an agent claimed completion.

## 4.11 `pmo.generate_update`

Purpose: generate reproducible PMO status updates for a declared audience.

Operation: `generate_update`.

Output mode: `status_update`.

Audience options:

- `operator`
- `cto`
- `ceo`
- `delivery`
- `audit`

Rules:

- Reports are artifacts, not source-of-truth memory.
- Every generated report must include a JSON evidence envelope.
- Report generation must be reproducible from PMO state and evidence refs.

## 4.12 `pmo.get_audit_trail`

Purpose: retrieve filtered, evidence-backed audit history.

Operation: `get_audit_trail`.

Output mode: `audit_packet`.

Rules:

- Do not export raw logs.
- Return safe audit entries, evidence refs, trace ids, correlation ids, and redaction notices.

## 4.13 `pmo.analyze_critical_path`

Purpose: identify tasks, contracts, decisions, and blockers that determine the program critical path.

Operation: `analyze_critical_path`.

Output must include:

- critical path refs
- blocking nodes
- missing approvals
- stale evidence
- predicted slip risk
- proposed unblock macros

## 4.14 `pmo.analyze_resource_pressure`

Purpose: identify overloaded agents, unavailable resources, tool bottlenecks, or projects idled by dependencies.

Operation: `analyze_resource_pressure`.

Output must include:

- affected resources
- idled tasks/projects
- overloaded owners
- adapter/tool health limits
- proposed mitigation actions

## 4.15 `pmo.detect_repeated_patterns`

Purpose: detect repeated blockers, failures, discarded decisions, stale evidence, and fragile integrations.

Operation: `detect_repeated_patterns`.

Output must include:

- matched `FailurePattern` records
- related `LearningRecord` records
- affected projects/programs
- confidence calculation
- evidence refs

## 4.16 `pmo.find_decision_conflicts`

Purpose: find active, superseded, discarded, future-not-applicable, or conflicting decisions for a context anchor.

Operation: `find_decision_conflicts`.

Output must include:

- applicable decisions
- superseded decisions
- discarded decisions
- future-not-applicable decisions
- conflicting decisions
- evidence refs

## 4.17 `pmo.find_stale_evidence`

Purpose: find evidence that no longer proves the current branch, contract, tracker revision, adapter cursor, or as-of state.

Operation: `find_stale_evidence`.

Output must include:

- stale evidence refs
- why each item is stale
- affected refs
- required refresh evidence types
- proposed refresh actions

## 4.18 `pmo.validate_receipt`

Purpose: validate a submitted receipt against a flight plan and adapter-observed state.

Operation: `validate_receipt`.

Output must include:

- shape validation
- actor/scope validation
- hash/staleness validation
- evidence requirement validation
- adapter observation status
- accept/reject/revalidate recommendation

## 4.19 `pmo.build_flight_plan`

Purpose: produce a deterministic flight plan for proposed external work.

Operation: `build_flight_plan`.

Rules:

- Use this as the internal implementation of action-planning macros.
- Must include blast radius, gaps, risks, proposed actions, expected receipts, evidence obligations, and hard approval gates.

---

# 5. Built-In Runbooks

Ship these default runbooks and make them editable where safe.

## 5.1 Code Review Blocker Runbook

```json
{
  "schemaVersion": "1",
  "runbookId": "runbook-code-review-request-senior-review",
  "runbookRef": "runbook://code-review/request-senior-review",
  "runbookType": "blocker_alleviation",
  "displayName": "Request senior code review",
  "appliesToBlockerTypes": ["awaiting_code_review"],
  "appliesToFindingKinds": [],
  "appliesToRiskTypes": [],
  "requiredAdapters": ["github-adapter"],
  "requiredEvidenceTypes": ["github_pr_status", "code_review_result"],
  "proposedActions": [
    {
      "action": "request_code_review",
      "executionOwner": "worker_agent",
      "targetRefTemplate": "{{blocker.targetRef}}",
      "reasonTemplate": "{{blocker.blockedRef}} is blocked waiting on code review for {{blocker.targetRef}}."
    }
  ],
  "expectedReceiptTypes": ["code_review_requested", "code_review_completed", "code_review_rejected"],
  "approvalRequired": false,
  "riskLevel": "low",
  "editableFields": ["displayName", "proposedActions", "expectedReceiptTypes"],
  "lockedFields": ["runbookId", "runbookType", "appliesToBlockerTypes", "riskLevel"],
  "evidenceRefs": []
}
```

## 5.2 Budget Approval Blocker Runbook

Applies to `budget_exhausted`.

Must propose a human/operator or C-suite decision request, not direct budget mutation.

Expected receipts:

- `budget_approval_decision_recorded`
- `budget_rejection_decision_recorded`

## 5.3 Dependency Failure Investigation Runbook

Applies to `dependency_failure`.

Must propose QA/debug investigation by a worker agent and expected evidence from adapter-observed state, test result, or issue analysis.

Expected receipts:

- `dependency_investigation_started`
- `dependency_failure_confirmed`
- `dependency_failure_resolved`

## 5.4 Missing Evidence Refresh Runbook

Applies to `missing_evidence` and `stale_evidence`.

Must propose evidence refresh, verification rerun, or artifact regeneration.

Expected receipts:

- `evidence_refreshed`
- `verification_failed`
- `evidence_unavailable`

## 5.5 Policy Approval Runbook

Applies to `policy_denial`, `awaiting_human_approval`, and `security_or_compliance_gate`.

Must create or surface an approval gate and decision request.

Expected receipts:

- `decision_recorded`
- `approval_evidence_attached`

## 5.6 Drift Reconciliation Runbook

Applies to `conflicting_state`, `receipt_missing`, and `adapter_unavailable`.

Must propose reconciliation actions and never overwrite adapter state blindly.

Expected receipts:

- `adapter_state_observed`
- `receipt_revalidated`
- `state_conflict_resolved`

---

# 6. Repository Interface Requirements

Implement a `ProgramManagerRepository` interface. Service and macro logic must use repository methods, not raw Cypher.

Minimum methods:

```ts
interface ProgramManagerRepository {
  getPortfolioScope(input: { actorRef: string; portfolioId: string }): Promise<unknown>;
  upsertProgramRegistry(input: unknown): Promise<void>;
  getMacroRegistry(input: { portfolioId?: string }): Promise<MacroDefinition[]>;
  getMacroDefinition(input: { macroId: string; portfolioId?: string }): Promise<MacroDefinition | null>;
  updateMacroDefinition(input: { macroId: string; patch: PmoMacroEditPatch; actorRef: string }): Promise<MacroDefinition>;

  queryContext(input: { targetRefs: string[]; contextAnchor?: ContextAnchor; options?: unknown }): Promise<unknown>;
  calculateBlastRadius(input: { targetRefs: string[]; contextAnchor?: ContextAnchor; maxDepth: number }): Promise<unknown>;
  findActiveBlockers(input: { scope: unknown; contextAnchor?: ContextAnchor; filters?: unknown }): Promise<Blocker[]>;
  findApplicableRunbooks(input: { blockerTypes?: string[]; findingKinds?: string[]; riskTypes?: string[] }): Promise<Runbook[]>;
  findUnsatisfiedApprovalGates(input: { targetRefs: string[]; contextAnchor?: ContextAnchor }): Promise<unknown>;
  findStaleEvidence(input: { scope: unknown; contextAnchor?: ContextAnchor }): Promise<unknown>;
  findDecisionContext(input: { scope: unknown; contextAnchor?: ContextAnchor; conditionTags?: string[] }): Promise<unknown>;
  findRepeatedPatterns(input: { scope: unknown; contextAnchor?: ContextAnchor }): Promise<unknown>;

  recordFinding(input: Finding): Promise<void>;
  recordRiskSignal(input: RiskSignal): Promise<void>;
  recordMacroInvocation(input: MacroInvocation): Promise<void>;
  recordArtifactRef(input: ArtifactRef): Promise<void>;
  computeStateVersionHash(input: { scope: unknown; contextAnchor?: ContextAnchor; ruleVersions: string[] }): Promise<string>;
}
```

Rules:

- Repository methods must enforce portfolio filters.
- Repository methods that return deterministic collections must sort by stable ids.
- Neo4j implementation must include constraints and indexes for all target labels.
- In-memory implementation is allowed only for narrow unit tests and fixtures.

---

# 7. Neo4j Implementation Requirements

## 7.1 Labels

Implement at least these labels:

```text
Portfolio
Program
Vertical
Project
BranchContext
Task
Milestone
Deliverable
IntegrationPoint
Contract
Blocker
Runbook
DecisionRequest
DecisionRecord
DiscardedDecision
Finding
RiskSignal
AttemptRecord
LearningRecord
FailurePattern
EvidenceRef
ArtifactRef
CapabilityAdapter
AdapterBinding
SyncCursor
MacroDefinition
MacroInvocation
FlightPlan
ExpectedReceipt
ObservedReceipt
ReconciliationFinding
```

## 7.2 Relationships

Implement at least these relationships:

```text
PORTFOLIO_HAS_PROGRAM
PROGRAM_HAS_VERTICAL
PROGRAM_USES_PROJECT
PROGRAM_DEPENDS_ON_PROGRAM
PROJECT_HAS_BRANCH_CONTEXT
PROJECT_OWNS_TASK
TASK_DEPENDS_ON_TASK
TASK_DEPENDS_ON_CONTRACT
TASK_HAS_BLOCKER
BLOCKER_BLOCKS
BLOCKER_TARGETS
BLOCKER_SUGGESTS_RUNBOOK
RUNBOOK_PROPOSES_ACTION_TYPE
VERTICAL_HAS_INTEGRATION_POINT
INTEGRATION_PRODUCED_BY_PROJECT
INTEGRATION_CONSUMED_BY_PROJECT
INTEGRATION_GOVERNED_BY_CONTRACT
PROJECT_PRODUCES_CONTRACT
PROJECT_CONSUMES_CONTRACT
REQUIRES_APPROVAL
REQUIRES_EVIDENCE
SATISFIED_BY
SUPERSEDES
AFFECTS
DERIVED_FROM
EVIDENCED_BY
ADAPTER_PROVIDES_CAPABILITY
ADAPTER_BOUND_TO_PROJECT
SYNC_CURSOR_FOR_ADAPTER
MACRO_DEFINED_IN_REGISTRY
MACRO_INVOCATION_USED_MACRO
FLIGHT_PLAN_HAS_EXPECTED_RECEIPT
RECEIPT_SATISFIES_ACTION
RECONCILIATION_FINDING_AFFECTS_REF
```

## 7.3 Constraints And Indexes

Create uniqueness constraints for all stable ids.

Examples:

```cypher
CREATE CONSTRAINT portfolio_id IF NOT EXISTS
FOR (n:Portfolio) REQUIRE n.portfolioId IS UNIQUE;

CREATE CONSTRAINT program_identity IF NOT EXISTS
FOR (n:Program) REQUIRE (n.portfolioId, n.programId) IS UNIQUE;

CREATE CONSTRAINT project_identity IF NOT EXISTS
FOR (n:Project) REQUIRE (n.portfolioId, n.projectId) IS UNIQUE;

CREATE CONSTRAINT blocker_identity IF NOT EXISTS
FOR (n:Blocker) REQUIRE (n.portfolioId, n.blockerId) IS UNIQUE;

CREATE CONSTRAINT macro_identity IF NOT EXISTS
FOR (n:MacroDefinition) REQUIRE (n.macroId, n.version) IS UNIQUE;
```

Create indexes for:

- `portfolioId`
- `programId`
- `projectId`
- `status`
- `validFrom`
- `validTo`
- `recordedAt`
- `sourceAdapterId`
- `sourceCursor`
- `contractRef`
- `trackerSlug`
- `trackerTaskId`
- `blockerType`
- `severity`
- `conditionTags`

## 7.4 Deterministic Query Rules

Every query feeding a deterministic result must:

- filter by portfolio unless explicitly cross-portfolio authorized
- filter by context anchor where provided
- filter out superseded facts unless requested
- respect valid-time and recorded-time semantics
- use explicit `ORDER BY`
- return stable ids and refs
- avoid nondeterministic collection order

Example blocker query:

```cypher
MATCH (program:Program {portfolioId: $portfolioId, programId: $programId})-[:PROGRAM_USES_PROJECT]->(project:Project)
MATCH (project)-[:PROJECT_OWNS_TASK]->(task:Task)
MATCH (task)-[:TASK_HAS_BLOCKER]->(blocker:Blocker)
OPTIONAL MATCH (blocker)-[:BLOCKER_TARGETS]->(target)
OPTIONAL MATCH (blocker)-[:BLOCKER_SUGGESTS_RUNBOOK]->(runbook:Runbook)
WHERE blocker.portfolioId = $portfolioId
  AND blocker.status IN $statuses
  AND blocker.validFrom <= $asOf
  AND coalesce(blocker.validTo, "9999-12-31T00:00:00Z") > $asOf
RETURN task, blocker, target, collect(runbook) AS runbooks
ORDER BY blocker.criticality ASC, blocker.severity DESC, blocker.recordedAt ASC, blocker.blockerId ASC
```

---

# 8. Adapter Contract Requirements

Adapters integrate standalone systems into PMO without giving PMO downstream mutation authority.

Every adapter must implement:

```ts
interface ProgramCapabilityAdapter {
  describeCapabilities(): Promise<CapabilityAdapter>;
  getObservationSchema(domain: string, observationType: string): Promise<unknown>;
  readState(readRequest: unknown): Promise<unknown>;
  assessImpact(request: ProgramImpactAssessmentRequest): Promise<ProgramImpactAssessmentResult>;
  reconcileState(scope: unknown): Promise<unknown>;
  produceEvidenceRefs(observationResult: unknown): Promise<EvidenceRef[]>;
  getSourceCursor(scope: unknown): Promise<SyncCursor>;
  getHealth(scope: unknown): Promise<ProgramAdapterHealth>;
}
```

Adapter health:

```ts
type ProgramAdapterHealth = {
  schemaVersion: "1";
  adapterId: string;
  status: "healthy" | "degraded" | "unavailable" | "circuit_open";
  checkedAt: string;
  sourceCursor?: string;
  latencyMs?: number;
  errorRate?: number;
  staleCursorSeconds?: number;
  limitations: string[];
  evidenceRefs: string[];
};
```

Rules:

- `healthy`: adapter output may participate in deterministic core.
- `degraded`: PMO may use output only with explicit degraded confidence and a `tool_health_degradation` risk.
- `unavailable`: PMO must not claim current observed state from that adapter.
- `circuit_open`: PMO skips adapter calls until the retry window and uses last-known state only as stale context.

---

# 9. Deterministic Hashing

Implement `stateVersionHash` for every stateful macro result.

Hash input must include:

- normalized context anchor
- relevant PMO graph nodes and relationships sorted by stable id
- relationship properties that affect planning
- adapter manifest ids and versions
- adapter sync cursors and source revision hashes
- artifact/evidence refs and their content digests
- deterministic rule versions
- macro definition version
- default options after applying user overrides

Hash input must exclude:

- advisory LLM summaries
- natural language prioritization not backed by deterministic rules
- generated timestamps except when explicitly part of state
- non-deterministic collection order
- raw evidence contents

Use canonical JSON serialization and SHA-256.

---

# 10. Security, Authz, Redaction, And Audit

## 10.1 Roles

Initial roles:

```text
human_operator
program_manager_agent
c_suite_agent
execution_agent
service_adapter
```

Rules:

- `program_manager_agent` may invoke read, context, impact, simulation, blocker analysis, planning proposal, and report macros within scope.
- `execution_agent` may receive delegated work packets and submit receipts; it should not have broad macro registry edit rights.
- `human_operator` may approve decisions, edit macros within scope, and review findings.
- `c_suite_agent` may approve or reject program-level decisions within declared authority.
- `service_adapter` may submit adapter observations, cursors, evidence refs, and health state.

## 10.2 Macro Edit Authz

Allowed macro edits require:

- server-verified actor id
- allowed role
- portfolio scope
- expected macro version
- patch reason
- evidence refs or operator attestation

Reject edits that:

- modify locked fields
- grant downstream mutation authority
- disable redaction
- disable portfolio isolation
- remove evidence requirements from high-risk macros
- change deterministic rule ids without a schema/version migration

## 10.3 Redaction

Never inline:

- secrets
- credentials
- raw logs
- traces
- screenshots
- transcripts
- provider prompts/responses
- scratchpads
- full diffs
- content-bearing evidence

Return pointer-only refs and redaction summaries.

## 10.4 Audit

Every macro invocation must emit or persist an audit record with:

- actor id from server trust root
- actor role
- portfolio id
- program id when known
- macro id
- subtool
- trace id
- correlation id
- input digest
- state version hash when applicable
- evidence refs
- artifact refs
- status

---

# 11. Test Fixtures Based On User Examples

Keep the following examples as architecture and solution tests. Build them into the fixture suite. Each scenario should have seed data, a `pmo_macro` invocation, and exact expected deterministic output assertions.

## 11.1 Test Scenario A: Blocker Alleviation Engine

### Seed Graph

Create these objects:

- Program: `program://agentic-os`
- Project: `project://hoplon`
- Task: `task://agentic-os/T404`
- Target PR: `pr://hoplon/12`
- Blocker: `blocker://agentic-os/blocker-hoplon-pr-12-review`
- Runbook: `runbook://code-review/request-senior-review`

Blocker shape:

```json
{
  "schemaVersion": "1",
  "blockerId": "blocker-hoplon-pr-12-review",
  "blockerRef": "blocker://agentic-os/blocker-hoplon-pr-12-review",
  "portfolioId": "default",
  "programId": "agentic-os",
  "projectId": "hoplon",
  "blockerType": "awaiting_code_review",
  "status": "open",
  "severity": "medium",
  "criticality": "tier_2",
  "blockedRef": "task://agentic-os/T404",
  "targetRef": "pr://hoplon/12",
  "reason": "Task T404 is waiting on Hoplon PR 12 review before downstream contract validation can proceed.",
  "ownerRefs": [],
  "recommendedRunbookRefs": ["runbook://code-review/request-senior-review"],
  "conditionTags": ["project:hoplon", "action:code_review", "contract:hoplon-authz"],
  "validFrom": "2026-05-04T00:00:00Z",
  "recordedAt": "2026-05-04T00:00:00Z",
  "sourceAdapterId": "github-adapter",
  "sourceCursor": "github://hoplon/pr/12#status",
  "evidenceRefs": ["evidence://github/pr-12/status@sha256:abc123"]
}
```

### Invocation

```json
{
  "schemaVersion": "1",
  "subtool": "invoke",
  "macroId": "pmo.propose_unblock_plan",
  "request": {
    "schemaVersion": "1",
    "scope": {
      "portfolioId": "default",
      "programIds": ["agentic-os"],
      "projectIds": ["hoplon"]
    },
    "targetRefs": ["task://agentic-os/T404"],
    "contextAnchor": {
      "portfolioId": "default",
      "programId": "agentic-os",
      "projectId": "hoplon",
      "asOf": "2026-05-04T00:00:00Z"
    },
    "options": {
      "includeProposedActions": true,
      "includeEvidenceRefs": true
    },
    "outputMode": "flight_plan"
  },
  "traceId": "trace-test-blocker-alleviation",
  "correlationId": "corr-test-blocker-alleviation"
}
```

### Expected Assertions

- Response status is `ok` or `warning`, not `error`.
- Response includes `stateVersionHash`.
- Deterministic core includes one blocker with type `awaiting_code_review`.
- Deterministic core maps the blocker to `runbook://code-review/request-senior-review`.
- Deterministic core includes a proposed external action with action `request_code_review`.
- Proposed action target is `pr://hoplon/12`.
- Proposed action execution owner is `worker_agent` or equivalent non-PMO executor.
- Expected receipt types include code review requested/completed/rejected evidence.
- PMO does not perform or claim to perform code review.
- Evidence refs are pointer-only.

## 11.2 Test Scenario B: Budget Exhausted Blocker

### Seed Graph

Add a task blocked by budget exhaustion:

```json
{
  "schemaVersion": "1",
  "blockerId": "blocker-finance-approval-required",
  "blockerRef": "blocker://agentic-os/blocker-finance-approval-required",
  "portfolioId": "default",
  "programId": "agentic-os",
  "projectId": "project-phalanx",
  "blockerType": "budget_exhausted",
  "status": "open",
  "severity": "high",
  "criticality": "tier_1",
  "blockedRef": "task://agentic-os/T405",
  "targetRef": "approval://finance/project-phalanx-budget-extension",
  "reason": "Project Phalanx cannot continue orchestration work until finance approval extends the budget.",
  "ownerRefs": [],
  "recommendedRunbookRefs": ["runbook://finance/request-budget-approval"],
  "conditionTags": ["project:project-phalanx", "risk:budget", "action:approval"],
  "validFrom": "2026-05-04T00:00:00Z",
  "recordedAt": "2026-05-04T00:00:00Z",
  "sourceAdapterId": "llm-tracker-adapter",
  "sourceCursor": "tracker://project-phalanx/T405#budget",
  "evidenceRefs": ["evidence://tracker/project-phalanx/T405@sha256:def456"]
}
```

### Invocation

Call `pmo.propose_unblock_plan` for `task://agentic-os/T405`.

### Expected Assertions

- Output includes a decision request or approval gate.
- Output does not propose direct budget mutation by PMO.
- Proposed action owner is `human_operator` or `c_suite_agent`.
- Expected receipt type includes `budget_approval_decision_recorded` or `budget_rejection_decision_recorded`.
- The hard gate is surfaced if required authority is missing.

## 11.3 Test Scenario C: Dependency Failure Blocker

### Seed Graph

Add a task blocked by a failing API dependency:

```json
{
  "schemaVersion": "1",
  "blockerId": "blocker-phalanx-api-v2-failure",
  "blockerRef": "blocker://agentic-os/blocker-phalanx-api-v2-failure",
  "portfolioId": "default",
  "programId": "agentic-os",
  "projectId": "ask-mr-gambler",
  "blockerType": "dependency_failure",
  "status": "open",
  "severity": "critical",
  "criticality": "tier_0",
  "blockedRef": "task://agentic-os/T406",
  "targetRef": "api://project-phalanx/phalanx-api-v2",
  "reason": "AskMrGambler integration work is blocked because Phalanx API v2 is failing compatibility checks.",
  "ownerRefs": [],
  "recommendedRunbookRefs": ["runbook://dependency/debug-api-failure"],
  "conditionTags": ["project:ask-mr-gambler", "project:project-phalanx", "integration:phalanx-api-v2", "risk:dependency_failure"],
  "validFrom": "2026-05-04T00:00:00Z",
  "recordedAt": "2026-05-04T00:00:00Z",
  "sourceAdapterId": "semantix-adapter",
  "sourceCursor": "semantix://phalanx-api-v2/readiness#failure",
  "evidenceRefs": ["evidence://semantix/phalanx-api-v2/failure@sha256:ghi789"]
}
```

### Invocation

Call `pmo.propose_unblock_plan` for `task://agentic-os/T406`.

### Expected Assertions

- Output maps blocker to dependency debugging runbook.
- Output proposes QA/debug investigation by a worker agent.
- Output identifies `api://project-phalanx/phalanx-api-v2` as target.
- Output includes affected downstream project `ask-mr-gambler` and upstream project `project-phalanx`.
- PMO does not call the API, patch code, or update tracker directly.
- Expected receipts include investigation and verification evidence.

## 11.4 Test Scenario D: Cross-Domain War-Gaming / Impact Simulation

### Seed Graph

Create these dependencies:

- `contract://ask-mr-gambler/api/public-v2` consumed by `project://hoplon` and `project://project-phalanx`.
- Hoplon Contract B depends on the API delivery date.
- Fourteen Phalanx tasks depend on the API contract.
- Three developer or worker-agent resources are assigned to downstream work and become idle if the API slips.

### Invocation

```json
{
  "schemaVersion": "1",
  "subtool": "invoke",
  "macroId": "pmo.simulate_change",
  "request": {
    "schemaVersion": "1",
    "scope": {
      "portfolioId": "default",
      "programIds": ["agentic-os"],
      "projectIds": ["ask-mr-gambler"]
    },
    "targetRefs": ["contract://ask-mr-gambler/api/public-v2"],
    "hypothesis": {
      "kind": "timeline_shift",
      "payload": {
        "delayDays": 14,
        "reason": "AskMrGambler API delivery slips by two weeks"
      }
    },
    "contextAnchor": {
      "portfolioId": "default",
      "programId": "agentic-os",
      "projectId": "ask-mr-gambler",
      "asOf": "2026-05-04T00:00:00Z"
    },
    "outputMode": "simulation_report"
  },
  "traceId": "trace-test-war-game",
  "correlationId": "corr-test-war-game"
}
```

### Expected Assertions

- Output is labeled hypothetical/non-persistent.
- Output identifies downstream affected projects.
- Output identifies affected contract refs.
- Output identifies affected task refs.
- Output includes a critical path.
- Output includes risk that Hoplon Contract B may breach if the two-week delay is applied.
- Output includes resource idle risk for affected developer/worker agents if seeded.
- PMO does not update real milestones, tracker statuses, or contract state.

## 11.5 Test Scenario E: Instant Context Provisioning / Catch-Me-Up Protocol

### Seed Graph

Create target:

- `contract://hoplon/authz/v2`

Surrounding context:

- parent project `project://hoplon`
- upstream policies that must be obeyed
- immediate open tasks
- active blocker or approval gate
- applicable decision record
- stale evidence ref

### Invocation

```json
{
  "schemaVersion": "1",
  "subtool": "invoke",
  "macroId": "pmo.get_localized_context",
  "request": {
    "schemaVersion": "1",
    "scope": {
      "portfolioId": "default",
      "programIds": ["agentic-os"],
      "projectIds": ["hoplon"],
      "contractRefs": ["contract://hoplon/authz/v2"]
    },
    "targetRefs": ["contract://hoplon/authz/v2"],
    "contextAnchor": {
      "portfolioId": "default",
      "programId": "agentic-os",
      "projectId": "hoplon",
      "branchName": "main",
      "asOf": "2026-05-04T00:00:00Z"
    },
    "options": {
      "maxTraversalDepth": 2,
      "maxResults": 20,
      "includeEvidenceRefs": true
    },
    "outputMode": "context_packet"
  },
  "traceId": "trace-test-context",
  "correlationId": "corr-test-context"
}
```

### Expected Assertions

- Output is a bounded context packet, not a raw graph dump.
- Output includes parent project.
- Output includes immediate upstream policies.
- Output includes immediate open tasks.
- Output includes applicable decisions.
- Output includes blockers/gates relevant to the target ref.
- Output includes stale evidence if seeded.
- Output omits unrelated projects and raw logs.
- Output uses evidence refs instead of content-bearing evidence.

## 11.6 Test Scenario F: Automated Drift Detection / Reality Checker

### Seed Graph

PMO expected state says:

- `project://project-phalanx` has zero open security blockers.

Adapter-observed state says:

- Hoplon adapter reports a newly opened vulnerability.

Observation ref:

```text
evidence://hoplon/finding/vuln-123@sha256:jkl012
```

### Invocation

```json
{
  "schemaVersion": "1",
  "subtool": "invoke",
  "macroId": "pmo.detect_drift",
  "request": {
    "schemaVersion": "1",
    "scope": {
      "portfolioId": "default",
      "programIds": ["agentic-os"],
      "projectIds": ["project-phalanx"]
    },
    "targetRefs": ["project://project-phalanx"],
    "contextAnchor": {
      "portfolioId": "default",
      "programId": "agentic-os",
      "projectId": "project-phalanx",
      "asOf": "2026-05-04T00:00:00Z"
    },
    "outputMode": "reconciliation_findings"
  },
  "traceId": "trace-test-drift",
  "correlationId": "corr-test-drift"
}
```

### Expected Assertions

- Output includes a `ReconciliationFinding` or `Finding` with kind `unexpected_security_blocker` or `desynchronized_state`.
- Output includes expected ref and observed ref.
- Output includes the Hoplon evidence ref.
- Output proposes a remediation action such as creating a high-priority blocker or requesting security triage.
- PMO does not directly create an external tracker blocker.
- If the adapter is unavailable, output reports an adapter gap instead of claiming no drift.

---

# 12. Implementation Order

Implement in this strict order.

## T1. Define shared Zod schemas

Create schemas for object types, `pmo_macro` input/output, macro registry, runbooks, and result envelopes.

Acceptance criteria:

- All object schemas parse valid examples.
- Invalid examples are rejected.
- JSON Schema can be generated for external docs/validation.
- No schema includes raw secret/log/transcript fields.

## T2. Create golden fixtures

Create fixture graph G0 containing AMG, Hoplon, Phalanx, Semantix, Guardrail, the four user examples, and expected outputs.

Acceptance criteria:

- Fixtures include blocker alleviation, war-gaming, localized context, and drift detection cases.
- Fixtures define expected affected refs, findings, blockers, proposed actions, and evidence refs.
- Fixtures define expected deterministic state hash inputs.

## T3. Add Neo4j migrations, constraints, and indexes

Acceptance criteria:

- All required labels have uniqueness constraints.
- Relationship properties include `dependencyId` where needed.
- Portfolio-scoped indexes exist.
- Migration can be rerun idempotently.

## T4. Implement repository interface

Acceptance criteria:

- Service code does not use raw Cypher directly.
- Repository methods enforce portfolio scope.
- Deterministic methods return sorted stable refs.
- In-memory repository supports fixture tests.

## T5. Implement macro registry

Acceptance criteria:

- Built-in macros are seeded.
- Built-in runbooks are seeded.
- Macro edits reject locked field changes.
- Macro edits are audited as internal PMO config mutations.
- Macro registry export is deterministic.

## T6. Implement `pmo_macro` dispatcher

Acceptance criteria:

- Only one public PMO MCP tool is exposed.
- Subtools route to help, list, describe, invoke, validate, edit, export, list object types, and describe object type.
- All responses use the standard result envelope.
- Unauthorized macro edits are rejected.

## T7. Implement context and impact macros

Acceptance criteria:

- `pmo.get_localized_context` returns bounded context packet.
- `pmo.assess_impact` returns affected refs, dependencies, risks, gaps, and evidence refs.
- Both include `stateVersionHash`.
- Both preserve redaction rules.

## T8. Implement blocker macros

Acceptance criteria:

- `pmo.analyze_blockers` finds typed blockers.
- `pmo.propose_unblock_plan` maps blockers to runbooks and proposed actions.
- Proposed external actions include expected receipts.
- PMO does not execute the actions.

## T9. Implement simulation macro

Acceptance criteria:

- `pmo.simulate_change` supports timeline shift, resource drain, contract change, adapter outage, task completion, blocker removed, blocker added, and policy change hypotheses.
- Simulation is non-persistent unless saved as an artifact by authorized actor.
- Hypothetical outputs are clearly labeled.

## T10. Implement drift and reconciliation macros

Acceptance criteria:

- `pmo.detect_drift` compares PMO expected state with adapter observed state.
- `pmo.reconcile_state` distinguishes missing, late, lost, conflicting, and satisfied receipts where available.
- Unavailable adapters produce explicit gaps.

## T11. Implement deterministic hashing

Acceptance criteria:

- Same fixture, same anchor, same macro version, same rule versions produce identical `stateVersionHash`.
- Advisory pane changes do not change the state hash.
- Different relevant graph state changes alter the hash.

## T12. Implement adapter conformance tests

Acceptance criteria:

- Manifest shape is validated.
- No adapter exposes mutation authority through PMO.
- Adapter health behavior is validated.
- Evidence refs are pointer-only.
- Sync cursors are monotonic where applicable.

## T13. Implement report/artifact generation

Acceptance criteria:

- `pmo.generate_update` produces markdown plus JSON evidence envelope.
- Report can be deleted and regenerated from durable state.
- Report includes artifact refs and evidence refs.

## T14. Implement PMO Doctor checks

Acceptance criteria:

- Validates schemas, macros, runbooks, Neo4j constraints, adapter manifests, redaction rules, fixture hash, and single-tool exposure.
- Fails if any downstream mutation tool is exposed through PMO.

---

# 13. Acceptance Criteria For The Whole Feature

The implementation is complete when:

1. `pmo_macro` is the only public PMO macro tool.
2. `pmo_macro` supports help, macro listing, macro documentation, invocation, validation, authorized editing, registry export, object type listing, and object type documentation.
3. The built-in macro registry ships with all macros listed in this file.
4. Built-in macros are editable only within safe fields.
5. Normalized PMO object schemas exist and are tested.
6. Blocker is implemented as a first-class node with typed blocker taxonomy.
7. Runbooks map blocker/finding/risk types to proposed external actions and expected receipts.
8. PMO never directly executes downstream mutations.
9. Context, impact, blocker, simulation, and drift macros all return standard result envelopes.
10. Stateful macros return deterministic `stateVersionHash`.
11. Evidence and artifact refs are pointer-only.
12. Redaction tests prove raw logs, screenshots, transcripts, secrets, provider payloads, and scratchpads are not returned inline.
13. Portfolio isolation tests pass.
14. The four user examples are implemented as fixture-backed tests.
15. Neo4j constraints, repository tests, and macro dispatcher tests pass.
16. Adapter conformance tests pass for read-only/stub adapters.
17. PMO Doctor validates the registry, schemas, graph, adapters, and safety constraints.

---

# 14. Example `pmo_macro` Help Response Shape

When called with:

```json
{
  "schemaVersion": "1",
  "subtool": "help",
  "documentationQuery": {
    "includeExamples": true
  }
}
```

Return:

```json
{
  "schemaVersion": "1",
  "status": "ok",
  "subtool": "help",
  "deterministicCore": {
    "tool": "pmo_macro",
    "description": "Single PMO Omni-Tool for help, macro discovery, context, impact, blocker analysis, simulation, planning proposals, drift detection, reconciliation, reporting, audit lookup, and authorized macro registry edits.",
    "availableSubtools": [
      "help",
      "list_macros",
      "describe_macro",
      "invoke",
      "validate_macro",
      "edit_macro",
      "export_macro_registry",
      "list_object_types",
      "describe_object_type"
    ],
    "safetyBoundary": "PMO analyzes, proposes, ledgers, reconciles, and reports. PMO does not execute downstream mutations.",
    "exampleMacroIds": [
      "pmo.get_localized_context",
      "pmo.assess_impact",
      "pmo.simulate_change",
      "pmo.analyze_blockers",
      "pmo.propose_unblock_plan",
      "pmo.detect_drift"
    ]
  },
  "evidenceRefs": [],
  "artifactRefs": [],
  "redactionSummary": {
    "redactedKinds": [],
    "omittedRefs": [],
    "notes": []
  },
  "warnings": [],
  "errors": [],
  "traceId": "server-generated-trace-id",
  "correlationId": "server-generated-correlation-id"
}
```

---

# 15. Required Verification Commands

Add project-specific commands equivalent to:

```bash
TPF_LLM_TOOL=codex tpf pnpm --filter program-manager run test:fixtures
TPF_LLM_TOOL=codex tpf pnpm --filter program-manager run test:neo4j
TPF_LLM_TOOL=codex tpf pnpm --filter program-manager run pmo:doctor
TPF_LLM_TOOL=codex tpf pnpm --filter program-manager run pmo:replay-smoke
TPF_LLM_TOOL=codex tpf pnpm --filter program-manager run pmo:report-regenerate
TPF_LLM_TOOL=codex tpf pnpm --filter program-manager run pmo:adapter-conformance
```

If package names differ, implement equivalent scripts and document them in the PMO README.

---

# 16. Final Implementation Principle

Normalize the nouns. Keep verbs generic.

Do not create a growing list of bespoke downstream tools such as:

```text
review_blocked_pr
fix_dependency_failure
create_budget_approval
notify_phalanx
rerun_semantix
```

Instead, implement normalized objects:

```text
Blocker
DependencyEdge
Runbook
ProposedAction
ExpectedReceipt
ObservedReceipt
Finding
RiskSignal
ContextPacket
Simulation
ReconciliationFinding
MacroDefinition
```

And implement generic macro operations:

```text
classify
traverse
simulate
contextualize
plan
reconcile
report
audit
```

This creates a scalable PMO coordination system instead of a pile of special-case tools.
