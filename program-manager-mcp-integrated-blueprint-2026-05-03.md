# Program Manager MCP Integrated Implementation Blueprint

**Date:** 2026-05-03  
**Status:** Integrated planning handoff v2  
**Source:** Program Manager MCP Agent Handoff, plus implementation review, gap analysis, opportunities, and tooling recommendations.  
**Audience:** Implementing agent, control-plane maintainers, architecture reviewers, and operator stakeholders.

## 1. Executive Direction

Build **Program Manager MCP** as the stateful PMO memory, dependency intelligence, and audit/receipt ledger over standalone capabilities such as LLM Tracker, Hoplon, Serena, GitHub, Guardrail, Semantix, Phalanx, and future Agentic OS control-plane services.

The product name remains **Program Manager**. The MCP server id remains `cp-program-manager`. The operator-facing and agent-facing capability label is **PMO**.

Program Manager is a **passive analyst, planner, reconciler, and ledger**. It does not execute downstream mutations. It calculates blast radius, names dependencies, identifies gaps, states required approvals and evidence, records receipts from execution agents, and reconciles expected state against observed state.

Focused MCPs and tools remain standalone. Program Manager does not replace LLM Tracker, Hoplon, Serena, GitHub, Semantix, Guardrail, or other focused systems. It coordinates them only when a cross-project or cross-program PMO view is needed.

## 2. Non-Negotiables Preserved

1. Do not replace focused MCPs or downstream systems.
2. Do not expose every downstream tool through Program Manager.
3. Do not make the LLM remember propagation rules. PMO must infer affected projects, contracts, trackers, reports, decisions, and evidence obligations.
4. Do not execute downstream mutations through PMO. Execution agents perform external actions with their own authorized tools and return receipts.
5. Do not use LLM Tracker as the only durable memory. LLM Tracker remains the operational task/blocker board; PMO owns program memory, decisions, dependency edges, evidence indexes, action ledgers, and cross-program learnings.
6. Use TypeScript and a database-backed repository from the start.
7. Use Neo4j as the primary PMO cp-graph query/projection store for blast-radius traversal.
8. Keep context pointer-only. Do not inline raw logs, traces, screenshots, provider transcripts, product rows, secrets, credentials, session data, or scratchpads.
9. Every meaningful program action needs trace, correlation, actor, program, project, scope, and evidence context.
10. Propagation must be loop-safe and idempotent.
11. Cross-tool execution is not a PMO transaction. Partial completion must be represented through missing, failed, conflicting, or stale receipts.

## 3. Integrated Decisions

| Area | Decision |
|---|---|
| Package shape | Create a separate `cp-program-manager` package and expose a small MCP surface through `mcp-gateway`. |
| Runtime language | TypeScript. |
| Schema strategy | Define schemas in `shared/schemas/cp-program-manager.ts` using Zod; generate JSON Schema for adapters, fixtures, docs, and validation. |
| Persistence | Use a typed `ProgramManagerRepository` interface, a Neo4j-backed cp-graph repository, and an in-memory repository for narrow unit tests. |
| Event basis | Use an append-only event model as the rebuild basis. Neo4j is the primary query/projection database, not the only audit history. |
| Event/write consistency | Avoid uncontrolled dual writes. Either write PMO events and cp-graph projection in one Neo4j transaction for the interim, or use a durable event store plus idempotent projection reducer and outbox. |
| Adapter strategy | Use local file/API adapters first rather than MCP-to-MCP calls, unless the MCP host already supports safe, audited MCP client calls. |
| Report outputs | Generate markdown plus a JSON evidence envelope. Reports are reproducible artifacts, not source-of-truth memory. |
| Authz | Make verified identity, portfolio isolation, scoped reads, and redaction Phase 1 requirements. Do not defer them to late operational hardening. |
| Determinism | Use canonical JSON plus SHA-256 for `stateVersionHash` and `flightPlanHash`. Model-assisted advisory output is excluded from deterministic hashes. |
| Phase 1 size | Split the original Phase 1 into Phase 1A, 1B, and 1C so the first useful MVP is achievable. |

## 4. Gaps Resolved and New Requirements Added

| Gap found | Integrated requirement | Phase |
|---|---|---|
| Phase 1 was too large | Split into Phase 1A read-only cp-graph and impact, Phase 1B context/report/adapter health, and Phase 1C learning/decision intelligence. | 1A-1C |
| Phase 1 said no mutation but also required persisted ledgers | Clarify as **no external mutation**. PMO may mutate its own repository, artifact registry, event log, projections, and generated reports. | 0 |
| Flight-plan tests appeared before flight-plan tool delivery | Move full flight-plan hard-block tests to Phase 2. In Phase 1A, expose hard blocks as read-only impact findings. | 1A/2 |
| Event store versus Neo4j source of truth was unresolved | Define a concrete event/projection model before implementation. For interim, use one transaction or an outbox/reducer. | 0 |
| Auth and tenant isolation were too late | Require server-verified identity, portfolio-scoped authority, query guards, and redaction tests in Phase 1A. | 1A |
| Canonical hashing was under-specified | Use RFC 8785/JCS canonical JSON rules where possible, SHA-256 digests, explicit included/excluded fields, and deterministic ordering. | 0 |
| DependencyEdge could duplicate cp-graph concepts | Use first-class Neo4j relationships for hot traversal, each with a stable `dependencyId`; use a `DependencyEdge` node only for metadata-heavy audit cases. | 0/1A |
| Approval authority was underspecified | Add an approval authority matrix covering role, scope, criticality, evidence, expiration, supersession, and break-glass handling. | 0/1B |
| Adapter failure policy was incomplete | Add retry/backoff, stale cursor behavior, degraded-mode caps, circuit-break reset rules, and deterministic-core exclusion rules. | 1B |
| Evidence freshness was implied | Add `EvidencePolicy` with artifact type, criticality, max age, digest/signature requirements, branch applicability, and allowed verifier. | 1A/1B |
| Security threat model was too narrow | Add controls for artifact URI abuse, SSRF, path traversal, poisoned adapter data, prompt injection, receipt forgery, and confused-deputy execution. | 0/1A |
| Tool result shape was not standardized | Add a shared `ProgramToolResultEnvelope`. | 0/1A |
| Report reproducibility needed template rules | Add report template version, deterministic section ordering, generation inputs, and JSON evidence envelope. | 1B |

## 5. System Boundary and PMO Workflow

The PMO loop is:

1. An LLM or worker agent proposes or receives work.
2. The agent asks Program Manager for context, impact, documentation, or a flight plan.
3. Program Manager reads PMO state, cp-graph projections, deterministic rules, adapter manifests, adapter observations, decisions, evidence refs, and dependency edges.
4. Program Manager returns affected scope, approval gates, evidence obligations, proposed external actions, risks, and expected receipts.
5. The agent executes external work using its own authorized tools.
6. The agent submits receipts back to Program Manager.
7. Program Manager validates receipts, records them in its ledger, updates projections, reconciles observed state, and raises desynchronization findings when needed.

Program Manager never becomes the hidden executor. A PMO flight plan is not execution authority beyond the executor's own delegated scope.

## 6. Core Memory Model

Program Manager maintains durable cross-project and cross-program memory through its own store. Baseline entities remain:

- `Portfolio`
- `Program`
- `Project`
- `BranchContext`
- `ContextAnchor`
- `Vertical`
- `ProgramMembership`
- `IntegrationPoint`
- `Contract`
- `DependencyEdge`
- `CrossProgramDependency`
- `DecisionRequest`
- `DecisionRecord`
- `DiscardedDecision`
- `AttemptRecord`
- `LearningRecord`
- `FailurePattern`
- `RiskSignal`
- `Finding`
- `TemporalFact`
- `EvidenceRef`
- `ArtifactRef`
- `ActionLedgerEntry`
- `ExpectedReceipt`
- `ObservedReceipt`
- `PropagationEdge`
- `AdapterBinding`
- `SyncCursor`

All facts that can affect execution should be scoped by portfolio, program, project, branch, commit, tracker revision, contract, integration point, valid time, recorded time, source adapter, source cursor, and evidence refs where applicable.

### Bitemporal Rule

Use both:

- **Valid time:** when the dependency, decision, blocker, contract, or risk applies.
- **Recorded time:** when PMO learned or recorded it.

The same query against different anchors may produce different applicable decisions, blockers, dependencies, and risks. This prevents latest-main decisions from leaking into old branch contexts and prevents old branch state from overwriting current program truth.

## 7. Context Anchor Contract

```ts
export const ProgramContextAnchorSchema = z.object({
  portfolioId: z.string().optional(),
  programId: z.string().optional(),
  projectId: z.string().optional(),
  repoId: z.string().optional(),
  branchName: z.string().optional(),
  gitCommit: z.string().optional(),
  trackerSlug: z.string().optional(),
  trackerRev: z.number().int().optional(),
  hoplonSnapshotRef: z.string().optional(),
  asOf: z.string().optional(),
});
```

When a context anchor is supplied, PMO should return:

- applicable decisions
- superseded decisions to ignore
- discarded decisions that match the current plan or context
- future-not-applicable decisions
- unresolved dependencies
- branch-divergent blockers
- stale or missing evidence
- contract compatibility notes
- proposed tracker, report, verification, or decision updates

## 8. DependencyEdge Decision

Use first-class Neo4j relationships for hot traversal:

- `CONSUMES_CONTRACT`
- `PRODUCES_CONTRACT`
- `REQUIRES_APPROVAL`
- `REQUIRES_EVIDENCE`
- `BLOCKS`
- `DEPENDS_ON`
- `SUPERSEDES`
- `HAS_RECEIPT`
- `AFFECTS`

Each relationship carries stable properties:

```ts
type DependencyRelationshipProps = {
  dependencyId: string;
  dependencyType: string;
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
  validFrom: string;
  validTo?: string;
  recordedAt: string;
  supersededBy?: string;
  sourceAdapterId: string;
  sourceCursor: string;
  evidenceRefs: string[];
  policyRefs: string[];
  approvalRequired: boolean;
  verificationRequired: boolean;
  receiptRequirements: string[];
};
```

Use a separate `DependencyEdge` node only when edge metadata becomes too heavy for relationship properties, or when an audit/report artifact needs a durable node target. V1 should avoid duplicating every relationship as both an edge node and a relationship.

## 9. ArtifactRef and EvidencePolicy

`ArtifactRef` is the pointer-only index for proof and generated PMO artifacts.

```ts
type ArtifactRef = {
  artifactId: string;
  artifactType: string;
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
  redactionStatus: "not_required" | "redacted" | "pending_review" | "blocked";
  validFrom: string;
  validTo?: string;
  createdAt: string;
  expiresAt?: string;
  retentionPolicyRef: string;
  sourceCursor?: string;
};
```

Add an `EvidencePolicy` registry:

```ts
type EvidencePolicy = {
  policyId: string;
  artifactTypes: string[];
  appliesToCriticality: Array<"tier_0" | "tier_1" | "tier_2" | "tier_3">;
  maxAgeSeconds?: number;
  digestRequired: boolean;
  signatureRequired: boolean;
  allowedVerificationMethods: Array<
    "adapter_observed_state" |
    "content_digest" |
    "downstream_signed_receipt" |
    "operator_attestation" |
    "not_independently_verified"
  >;
  branchSpecific: boolean;
  commitSpecific: boolean;
  reviewerAuthorityRefs: string[];
};
```

Recommended defaults:

- Tier 0/1 production policy or contract evidence should require digest and either adapter-observed state, downstream signed receipt, or operator attestation from an approved authority.
- Branch-specific test evidence should be valid only for the recorded branch and commit.
- Tracker snapshots should expire quickly enough to prevent stale board state from satisfying current gates.
- Operator attestations should carry explicit expiration or review dates.

## 10. Reference URI Scheme

Normalize references early. Recommended forms:

```text
portfolio://default
program://agentic-os
project://cp-program-manager-mcp
repo://ProgramManagerMCP/shared/schemas/hoplon-authz.ts
contract://hoplon-authz/escalation-grant@sha256:<digest>
tracker://cp-program-manager-mcp/HOPAUTH-013
artifact://pmo/alignment-report/2026-05-03@sha256:<digest>
decision://agentic-os/hoplon-authz-tier1-approval
flightplan://agentic-os/fp-<id>
receipt://agentic-os/rcpt-<id>
trace://<trace-id>
policy://active-adapters/hoplon-authz-tier1
```

Do not allow arbitrary URI schemes to drive PMO fetch behavior. Reference strings are identifiers first; fetch behavior must be mediated through allowlisted adapters and stores.

## 11. Deterministic State and Hashing

`stateVersionHash` pins the exact deterministic state used for a plan, query, report, or reconciliation. `flightPlanHash` pins the deterministic part of a flight plan.

Use this standard:

1. Build a deterministic input document from included fields only.
2. Canonicalize JSON using RFC 8785/JCS-style deterministic JSON serialization and property ordering.
3. Hash the canonical bytes with SHA-256.
4. Encode as `sha256:<hex>`.

Include in `stateVersionHash`:

- normalized context anchor
- relevant PMO cp-graph node ids and relationship ids
- relationship properties affecting planning, such as status, criticality, temporal scope, evidence requirements, source cursor, policy refs, and supersession fields
- adapter manifest ids and versions
- adapter sync cursors and source revision hashes
- artifact/evidence refs and their content digests
- deterministic rule ids and versions
- schema versions and reducer versions used for replay

Exclude:

- raw artifact contents
- raw logs or transcripts
- model-assisted summaries
- generated timestamps unless explicitly part of the deterministic query input
- non-deterministic collection order
- advisory pane content

Repository methods that contribute to deterministic results must use explicit sort order at every traversal boundary. Tests should seed fixture cp-graph `G0`, compute a hash, rerun the same query, and assert identical output and identical hash.

## 12. Rule Registry

Deterministic rules should be named and versioned.

```ts
type ProgramRuleRegistryEntry = {
  ruleId: string;
  version: string;
  deterministic: boolean;
  inputs: string[];
  outputKinds: string[];
  hashIncluded: boolean;
  description: string;
};
```

Example rules:

- `pmo.contract.stale-evidence.v1`
- `pmo.dependency.high-fanout-risk.v1`
- `pmo.decision.future-not-applicable.v1`
- `pmo.receipt.stale-flight-plan.v1`
- `pmo.adapter.degraded-confidence.v1`
- `pmo.discarded-decision.typed-match.v1`

## 13. Event Store, Projection, and Rebuild

The event model should be append-only and replayable. Neo4j is the primary cp-graph query/projection store, but the cp-graph must be re-derivable from events, registry manifests, adapter manifests, artifact metadata, evidence digests, and adapter sync cursors.

### Interim Write Model Options

| Option | Use when | Rule |
|---|---|---|
| Neo4j event nodes plus cp-graph projection in one transaction | Fastest safe interim path | Write event node, update cp-graph projection, and update outbox marker atomically. |
| Separate event store plus Neo4j projection | Better long-term audit posture | Event store write is source of truth. Projection reducer is idempotent. Use outbox/inbox to avoid dual-write loss. |
| Uncoordinated event store plus Neo4j writes | Never recommended | This creates split-brain risk without deterministic recovery. |

### Replay Order

Replay events in `(occurredAt, eventId)` order. Each reducer has an explicit version. If any old event cannot be replayed deterministically into the current projection, add a migration reducer and a fixture covering that migration.

### Rebuild Smoke Test

From an empty cp-graph:

1. Load program registry manifests.
2. Load adapter manifests.
3. Replay PMO events.
4. Restore artifact metadata and evidence digests.
5. Refresh adapter state from stored cursors or fixture observations.
6. Rebuild projections.
7. Assert fixture `stateVersionHash`.
8. Regenerate reports and assert deterministic evidence refs.

## 14. Tool Result Envelope

Every public MCP tool should return a consistent envelope.

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

## 15. Public MCP Surface by Phase

Keep the tool surface small and macro-level.

### Phase 1A Tools

| Tool | Purpose |
|---|---|
| `list_program_capabilities` | Discover PMO domains and adapter capabilities without exposing every downstream tool. |
| `get_program_documentation` | Retrieve concise documentation, schemas, examples, authz rules, evidence rules, and failure modes. |
| `query_program_context` | Read bounded PMO memory for a program, project, branch, contract, or as-of audit context. |
| `assess_program_impact` | Run read-only blast-radius analysis without generating a full flight plan. |

### Phase 1B Tools or Enhancements

| Tool | Purpose |
|---|---|
| `generate_program_update` | Generate reproducible markdown plus JSON evidence envelope from PMO state. |
| `get_program_audit_trail` | Retrieve filtered, redaction-safe audit entries and evidence refs. |
| `query_program_context` enhancement | Include context packet panes, stale evidence, and decision applicability. |

### Phase 1C Tools or Enhancements

| Tool | Purpose |
|---|---|
| `analyze_program_intelligence` | Surface deterministic proactive risks, discarded decisions, repeated blockers, stale evidence, and cross-program learnings. |

### Phase 2 Tools

| Tool | Purpose |
|---|---|
| `plan_program_action` | Produce a deterministic PMO flight plan with approvals, affected scope, expected receipts, and evidence obligations. |

### Phase 3 Tools

| Tool | Purpose |
|---|---|
| `record_program_receipt` | Validate and ledger evidence that an execution agent performed external work. |
| `reconcile_program_state` | Compare expected receipts/dependencies against observed adapter state and raise desynchronization findings. |

## 16. Graph Traversal Budget

Add explicit budgets to prevent noisy, slow, or runaway analysis.

```ts
type ProgramTraversalBudget = {
  maxTraversalDepth: number;
  maxAffectedRefs: number;
  maxAdapterCalls: number;
  maxReportItems: number;
  maxContextPacketBytes: number;
  timeoutMs: number;
  includeAdvisoryPane: boolean;
};
```

Recommended Phase 1A defaults:

- `maxTraversalDepth`: 3
- `maxAffectedRefs`: 100
- `maxAdapterCalls`: 4
- `maxReportItems`: 50
- `maxContextPacketBytes`: 24000
- `timeoutMs`: 10000
- `includeAdvisoryPane`: false unless explicitly requested

Any truncated result must include a warning with the budget that was reached.

## 17. Adapter Contract and Lifecycle

Every adapter implements:

- `describeCapabilities()`
- `getObservationSchema(domain, observationType)`
- `readState(readRequest)`
- `assessImpact(ProgramImpactAssessmentRequest)`
- `reconcileState(scope)`
- `produceEvidenceRefs(observationResult)`
- `getSourceCursor(scope)`
- `getHealth(scope)`

Adapters may describe external actions and evidence requirements, but they must not execute external actions through PMO.

### Adapter Health Behavior

| Status | Meaning | PMO behavior |
|---|---|---|
| `healthy` | Current enough and within error/latency budget | Output may participate in deterministic core. |
| `degraded` | Usable with limitations | Include `tool_health_degradation` risk. Use in deterministic core only if limitations do not affect the queried fact. |
| `unavailable` | Cannot provide current state | Do not claim current observed state. Emit explicit gap. |
| `circuit_open` | Calls suppressed until retry window | Skip adapter calls. Use last-known cursor only as stale context. |

### Default Retry and Circuit Policy

- Failure 1: retry after 30 seconds.
- Failure 2: retry after 2 minutes.
- Failure 3: retry after 10 minutes.
- Failure 4 or repeated stale cursor beyond policy: mark `circuit_open` for 30 minutes or configured adapter window.
- Reset to `healthy` only after a successful health check plus source cursor validation.
- Mark facts as stale when cursor age exceeds the adapter's `maxStaleCursorSeconds`.

### Adapter Conformance Harness

Create a shared harness before production adapters are enabled. It should validate:

- manifest shape
- schema refs
- side-effect classification
- deterministic `assessImpact` for fixture inputs
- sync cursor monotonicity
- degraded/unavailable/circuit behavior
- evidence ref production
- reconciliation behavior
- refusal to expose mutation authority through PMO
- trace/correlation/causation propagation
- loop suppression via propagation path

## 18. Approval Authority Matrix

Approval satisfaction must be evidence-backed and context-valid. Superseded, expired, branch-inapplicable, or future-not-applicable decisions must not satisfy gates.

| Role | Query context | Plan action | Record receipt | Approve gate | Cross portfolio |
|---|---:|---:|---:|---:|---:|
| `human_operator` | Yes | Yes | Yes | Scoped by grant | No by default |
| `program_manager_agent` | Yes | Yes | Limited/internal only | No | No |
| `execution_agent` | Assigned scope only | Limited | Assigned flight plan only | No | No |
| `c_suite_agent` | Scoped | Yes | No | Program-level gates within authority | Explicit grant only |
| `service_adapter` | Adapter scope only | No | Observed receipts only | No | No |

Add these fields to approval checks:

- `authorityRef`
- `actorId` from server-verified identity
- `role`
- `portfolioGrants`
- `programGrants`
- `maxCriticality`
- `allowedContractRefs`
- `requiredEvidencePolicyRefs`
- `expiresAt`
- `supersededBy`
- `breakGlassAllowed`
- `breakGlassEvidenceRefs`

Break-glass approval should always emit a critical audit event and create a follow-up review obligation.

## 19. Security Threat Model

| Threat | Control |
|---|---|
| Artifact URI abuse | Use allowlisted URI schemes and adapter-mediated fetches. Treat refs as identifiers, not direct fetch instructions. |
| SSRF and path traversal | Block arbitrary HTTP/file fetches in PMO. If fetching is required, use isolated fetch workers with allowlists and normalized paths. |
| Poisoned adapter data | Validate every adapter result against schema, manifest version, source cursor, and evidence policy. |
| Prompt injection through reports or external artifacts | Keep raw content behind refs. Summaries must be generated from sanitized, bounded, redacted material. |
| Receipt forgery | Require digest, signed downstream receipt, adapter-observed state, or scoped operator attestation based on evidence policy. |
| Confused-deputy execution | PMO flight plans do not grant more authority than the executor already has. Execution tools must enforce their own authz. |
| Cross-portfolio leakage | Require portfolio-scoped authority on every query and event. Cross-portfolio access is denied by default and audited when allowed. |
| Looping propagation | Carry causation, ancestry, idempotency key, propagation depth, and propagation path. Suppress repeated `(adapterId, targetRef, action)` edges. |
| Secret leakage | Never inline secrets, credentials, provider transcripts, raw logs, screenshots, or scratchpads in PMO outputs. |

## 20. Receipt State Machine

Use explicit receipt states so reconciliation is testable.

```text
expected -> in_flight
expected -> submitted -> accepted
expected -> submitted -> rejected
expected -> late -> lost
submitted -> stale_plan_revalidation_required
submitted -> conflicts_with_observed_state
accepted -> conflicts_with_observed_state
accepted -> superseded_by_reconciliation
lost -> replacement_flight_plan_proposed
```

Rules:

- Expected receipts are recorded when a flight plan is created.
- Submitted receipts include `flightPlanId`, `flightPlanHash`, and `flightPlanStateVersionHash`.
- If the current PMO state hash differs, PMO records the receipt as an observation but does not satisfy the expected receipt until reconciliation revalidates it.
- Expired flight plans cannot satisfy receipts without revalidation.
- Missing, conflicting, stale, or unverifiable receipts raise findings.

## 21. Report Reproducibility

Reports are generated artifacts. Deleting a report must not lose information.

Every generated report should have:

- markdown output
- JSON evidence envelope
- `reportTemplateVersion`
- `stateVersionHash`
- deterministic input refs
- deterministic section ordering
- generated timestamp isolated from deterministic evidence refs
- audience
- redaction summary
- evidence refs
- artifact refs
- trace id and correlation id

The JSON evidence envelope should be the canonical regression artifact. Markdown can vary in formatting as long as the envelope and deterministic refs match.

## 22. Internal Helper Tools to Build

These are not third-party packages. They are small internal utilities that will save implementation and review time.

| Helper | What it does | Why it saves time |
|---|---|---|
| PMO Doctor CLI | Validates schemas, registry manifests, adapter manifests, Neo4j constraints, seed cp-graph, state hash, redaction rules, and report reproducibility. | Replaces manual smoke checks with one command. |
| Adapter Conformance Harness | Runs standard manifest, impact, cursor, health, evidence, reconciliation, and no-mutation tests for each adapter. | Prevents every adapter from inventing its own test suite. |
| Golden Fixture Harness | Maintains `G0` seed cp-graph, `C0` changeset, expected affected refs `A0`, findings `F0`, context packet, report envelope, and state hash. | Makes deterministic regressions obvious. |
| PMO Report Regenerator | Regenerates markdown and JSON evidence envelopes from a pinned state hash. | Proves reports are artifacts, not memory. |
| Rule Registry Validator | Ensures rule ids, versions, hash inclusion, and input/output kinds are valid. | Prevents silent drift in deterministic rules. |
| Replay Smoke Runner | Replays event fixtures into an empty cp-graph and asserts expected hashes. | Validates recoverability. |
| Redaction Probe | Feeds prohibited payload kinds through tool outputs and reports. | Guards against accidental raw-context leakage. |

## 23. Third-Party and Standards Tooling

| Need | Tool / standard | Recommended use | Source |
|---|---|---|---|
| MCP server facade | Official MCP TypeScript SDK | Build the `cp-program-manager` MCP server with standard tools/resources/prompts and stdio or Streamable HTTP transports. | [Model Context Protocol TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) |
| Schema-first contracts | Zod 4 | Author TypeScript-first DTOs and emit JSON Schema for adapter docs, fixtures, and external validation. | [Zod JSON Schema docs](https://zod.dev/json-schema) |
| Runtime/external schema validation | AJV standalone validators | Compile generated JSON Schemas into standalone validation code for CI, adapters, and fixtures. | [AJV standalone validation](https://ajv.js.org/standalone.html) |
| Deterministic hashing | RFC 8785 JSON Canonicalization Scheme | Canonicalize JSON before SHA-256 for `stateVersionHash`, `flightPlanHash`, fixture hashes, and report envelopes. | [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785) |
| Neo4j schema migrations | Neo4j-Migrations | Track and apply Cypher migrations, constraints, and indexes instead of ad hoc bootstrap scripts. | [Neo4j-Migrations](https://neo4j.com/labs/neo4j-migrations/) |
| Neo4j integration tests | Testcontainers for Node.js Neo4j module | Spin up real Neo4j instances for traversal, gate, constraint, and replay tests. | [Testcontainers Neo4j module](https://node.testcontainers.org/modules/neo4j/) |
| Graph lookup and integrity | Neo4j indexes and constraints | Use indexes for efficient lookups and constraints for PMO-owned stable IDs and data integrity. | [Neo4j indexes](https://neo4j.com/docs/cypher-manual/current/indexes/), [Neo4j constraints](https://neo4j.com/docs/cypher-manual/current/schema/constraints/) |
| Event envelope inspiration | CloudEvents | Borrow consistent event metadata concepts without forcing full adoption if unnecessary. | [CloudEvents specification](https://github.com/cloudevents/spec) |
| Event/API documentation | AsyncAPI | Document PMO event types, adapter event streams, payloads, channels, and generated docs. | [AsyncAPI document concept](https://www.asyncapi.com/docs/concepts/asyncapi-document) |
| Traces, metrics, logs | OpenTelemetry JS | Emit traces and metrics for PMO tools, adapters, flight plans, receipts, replay, and reports. | [OpenTelemetry JavaScript docs](https://opentelemetry.io/docs/languages/js/) |
| Monorepo build boundaries | TypeScript project references | Separate `cp-program-manager`, mcp-gateway, cp-graph, context, and shared schema packages while improving build behavior. | [TypeScript project references](https://www.typescriptlang.org/docs/handbook/project-references.html) |
| Fixture-heavy tests | Vitest test context | Reuse seeded cp-graph, adapter fixtures, and golden-output helpers across deterministic tests. | [Vitest test context](https://vitest.dev/guide/test-context) |

## 24. Recommended File and Package Layout

```text
shared/schemas/cp-program-manager.ts
control-plane/packages/cp-program-manager/
  src/
    service/
    repository/
    adapters/
    reports/
    rules/
    replay/
    authz/
    redaction/
  migrations/neo4j/
  fixtures/
  docs/
control-plane/mcp-gateway/
  src/cp-program-manager-tools.ts
control-plane/tests/unit/cp-program-manager/
control-plane/tests/integration/cp-program-manager-neo4j/
control-plane/manifests/programs/*.json
artifacts/reports/alignment/
artifacts/reports/implementation/
```

## 25. Phased Delivery Plan

### Phase 0: Design Contract

Deliver:

- ADR: Program Manager is a stateful memory service with its own DB.
- Implementation decision: TypeScript, Neo4j cp-graph projection, repository abstraction.
- Data model spec focused on `DependencyEdge`, `ArtifactRef`, `EvidencePolicy`, and `ContextAnchor`.
- Event store and replay policy.
- Hashing spec for `stateVersionHash` and `flightPlanHash`.
- Adapter manifest, impact assessment, health, and conformance specs.
- Approval authority matrix.
- Tenant/portfolio isolation and trust-root requirements.
- Security threat model.
- Public MCP tool contracts.
- Tool result envelope.
- Sample program registry for Hoplon/Phalanx/Semantix/Guardrail/Program Manager MCP.

Validation:

- Schema examples parse.
- Data model examples parse.
- Cypher examples run against a fixture cp-graph.
- Hash fixture computes deterministically.
- Adapter conformance suite is defined.
- No external runtime mutation.

### Phase 1A: Read-Only Graph, Seed, and Impact MVP

Deliver:

- `cp-program-manager` package.
- `ProgramManagerRepository` interface.
- `ProgramManagerGraphRepository` backed by Neo4j.
- `InMemoryProgramManagerRepository` for narrow unit tests.
- Neo4j constraints/index bootstrap.
- Fixture seed cp-graph for Hoplon/Phalanx/Semantix/Guardrail/Program Manager MCP.
- Portfolio/program/project membership store.
- Integration points, contracts, dependency relationships, artifact refs, evidence refs, decisions, and sync cursors.
- Read-only adapter manifests for LLM Tracker and Hoplon.
- `list_program_capabilities`.
- `get_program_documentation`.
- `query_program_context` basic form.
- `assess_program_impact`.
- Standard result envelope.
- Portfolio-scoped authz guard and redaction guard.

Validation:

- Repository unit tests.
- Neo4j integration tests.
- Boundary tests.
- Given `G0` and `C0`, impact returns exactly `A0` and `F0`.
- Tests prove no downstream mutations occur.
- Tests prove explicit cp-graph traversal ordering and deterministic hash stability.
- Redaction tests prove prohibited payload kinds are not returned inline.
- Portfolio isolation tests pass for read tools.

### Phase 1B: Context Packets, Reports, Adapter Health

Deliver:

- Context packet panes: current state, blocking dependencies, applicable decisions, superseded decisions, future decisions, stale evidence, and recommended actions.
- Adapter health checks.
- Retry/circuit behavior.
- Generated markdown alignment report plus JSON evidence envelope.
- Report template versioning and deterministic section ordering.
- `get_program_audit_trail`.
- `generate_program_update`.
- Evidence freshness policy enforcement in read/report paths.

Validation:

- Report deletion/regeneration test.
- JSON evidence envelope deterministic refs match fixture.
- Adapter degraded/unavailable/circuit tests.
- Stale cursor tests.
- Evidence freshness tests.
- Context anchor tests across branch, commit, tracker revision, and as-of time.

### Phase 1C: Learning and Decision Intelligence

Deliver:

- Read-only learning records.
- Attempt records.
- Discarded decision records.
- Failure patterns.
- Risk signals.
- Typed deterministic matching for discarded decisions and repeated blockers.
- `analyze_program_intelligence`.

Validation:

- Cross-program learning queries return evidence-backed issue cards.
- Superseded, discarded, and future-not-applicable decisions do not apply to the wrong anchor.
- Discarded decision typed-tag matching is deterministic.
- Model-assisted advisory cards are labeled and excluded from deterministic hashes.

### Phase 2: Flight Plans and Expected Receipts

Deliver:

- `plan_program_action`.
- Deterministic flight-plan planner.
- Approval and evidence obligations.
- Tracker update proposals.
- Decision request proposals.
- Expected receipt model.
- Circular propagation suppression.
- Flight plan TTL and stale-plan behavior.

Validation:

- No tracker writes occur through PMO.
- Repeated flight plans are stable under same state hash, context anchor, proposed change, adapter manifest versions, and rule versions.
- Unsatisfied HITL approval gates appear as hard blocks.
- Missing evidence blocks or warns according to policy.
- Advisory output is excluded from `flightPlanHash`.
- Expired or stale plans require revalidation before satisfying receipts.

### Phase 3: Receipt Ledger and Reconciliation

Deliver:

- `record_program_receipt`.
- `reconcile_program_state`.
- Expected-vs-observed receipt ledger.
- Audit event persistence.
- Digest/signature/operator-attestation validation.
- Desynchronization findings.
- Compensating/replacement flight plan proposals.

Validation:

- Receipt validation tests.
- Authz rejection tests.
- Duplicate receipt and idempotency tests.
- Stale flight-plan receipt tests.
- Due-policy timing tests for `in_flight`, `late`, `lost`, and stuck plans.
- Forged/incomplete receipt tests.
- Conflicting-state tests where receipt contradicts adapter-observed state.
- Reconciliation tests with one receipt accepted and another missing.

### Phase 4: Agentic OS Integration and Operational Hardening

Deliver:

- Agentic OS consumes PMO context packets and cp-graph refs.
- Execution agents submit PMO receipts.
- Tenant/portfolio isolation hardened.
- Trust-root integration completed.
- Retention and PII policies enforced.
- OpenTelemetry metrics, traces, and logs emitted.
- Replay and report regeneration part of operational checks.

Validation:

- End-to-end workflow smoke.
- Context-packet tests.
- Tenant isolation tests.
- Auth trust-root tests.
- Adapter degraded/circuit tests.
- Schema migration/replay tests.
- Retention/redaction tests.
- OTel smoke tests.

## 26. Golden Fixture Backbone

Define one golden fixture set and reuse it everywhere.

| Fixture | Meaning |
|---|---|
| `G0` | Seed cp-graph with Hoplon, Phalanx, Semantix, Guardrail, Program Manager MCP, contracts, integration points, decisions, evidence refs, and tracker refs. |
| `C0` | Proposed change, such as Hoplon authz contract update or stale evidence condition. |
| `A0` | Expected affected refs: projects, contracts, integration points, tracker tasks, policies, and evidence refs. |
| `F0` | Expected findings: at least one cross-project dependency and one stale/missing evidence condition. |
| `H0` | Expected `stateVersionHash`. |
| `P0` | Expected context packet. |
| `R0` | Expected markdown report and JSON evidence envelope refs. |
| `I0` | Expected impact assessment result. |

Every phase should add expectations to the same fixture backbone instead of creating isolated examples.

## 27. Highest-Leverage Implementation Order

1. ADR and data model spec.
2. Schema package and examples.
3. Golden fixture backbone.
4. Repository interface.
5. Neo4j migrations, constraints, indexes, and Testcontainers integration tests.
6. MCP facade for Phase 1A tools.
7. Adapter registry and read-only LLM Tracker/Hoplon adapter stubs.
8. Deterministic hash implementation.
9. Report generator and JSON evidence envelope.
10. Adapter conformance harness.
11. PMO Doctor CLI.
12. Flight plans and receipts.
13. Reconciliation and operational telemetry.

## 28. Phase 1A Acceptance Criteria

Phase 1A is done when:

- A user or agent can ask what PMO capability should handle a program task.
- PMO returns concise capability matches and documentation topics.
- PMO persists programs, projects, integration points, contracts, dependency relationships, decisions, evidence refs, artifact refs, sync cursors, and fixture facts through its own repository.
- PMO can read or stub LLM Tracker state through an adapter contract.
- PMO can read or stub Hoplon/code context through an adapter contract.
- Given fixture `G0` and changeset `C0`, `assess_program_impact` returns exactly `A0` and `F0`.
- PMO identifies at least one cross-project dependency and one stale/missing evidence condition.
- PMO can answer whether a decision is applicable, superseded, discarded, or future-not-applicable for a context anchor.
- PMO does not execute downstream mutations.
- All outputs carry evidence refs and provenance.
- Portfolio isolation and redaction tests pass.

## 29. Open Questions to Resolve Before Implementation

1. Should interim PMO events live as Neo4j event nodes in the same transaction as cp-graph projection, or should a separate event store be introduced immediately?
2. Which project IDs does Hoplon currently register for Hoplon, Hoplon, Phalanx, Semantix, and Guardrail?
3. Should the first tracker adapter use local tracker JSON reads, tracker CLI/API, or LLM Tracker MCP client calls?
4. Does the current MCP host allow safe audited MCP-to-MCP calls, or should all downstream capability reads use native file/API adapters first?
5. Which trust root is available for server-verified actor identity: OIDC/JWT, mTLS, host-signed envelope, or another mechanism?
6. Which artifact store should own generated report envelopes and evidence metadata?
7. Which URI schemes are allowed in v1, and which are identifiers only versus fetchable refs?
8. Which Neo4j edition/features are available for constraints and relationship property uniqueness?
9. What is the retention policy for PMO events, artifact refs, evidence refs, and actor metadata?
10. Who can approve tier 0/1 gates, and what evidence is mandatory for those approvals?

## 30. Verification Menu

Use the narrowest checks per phase.

```bash
TPF_LLM_TOOL=codex tpf pnpm exec vitest run tests/unit/agent-os-schemas.test.ts
TPF_LLM_TOOL=codex tpf pnpm --filter @control-plane exec vitest run --config vitest.config.ts tests/unit/cp-program-manager/*.test.ts
TPF_LLM_TOOL=codex tpf pnpm --filter @control-plane run typecheck
TPF_LLM_TOOL=codex tpf pnpm run control-plane:check:boundaries
TPF_LLM_TOOL=codex tpf pnpm --filter @control-plane run test:unit
```

Add new checks:

```bash
pnpm --filter cp-program-manager run test:fixtures
pnpm --filter cp-program-manager run test:neo4j
pnpm --filter cp-program-manager run pmo:doctor
pnpm --filter cp-program-manager run pmo:replay-smoke
pnpm --filter cp-program-manager run pmo:report-regenerate
pnpm --filter cp-program-manager run pmo:adapter-conformance
```

## 31. Implementation PR Sequence

| PR | Scope | Close criteria |
|---|---|---|
| 1 | ADR, data model spec, event/replay/hash spec | Reviewable architecture docs and parseable examples. |
| 2 | Shared schemas and JSON Schema export | Zod parse tests and generated JSON Schema snapshots. |
| 3 | Program Manager package skeleton and repository interface | Typecheck and unit tests pass. |
| 4 | Neo4j migrations and cp-graph repository | Testcontainers traversal, constraints, and deterministic ordering tests pass. |
| 5 | Golden fixture seed and hash fixture | `G0/C0/A0/F0/H0` tests pass. |
| 6 | MCP Phase 1A tools | Tool envelope, authz, redaction, and boundary tests pass. |
| 7 | Read-only adapter registry with LLM Tracker/Hoplon stubs | Adapter conformance fixture tests pass. |
| 8 | Context packets and report generator | Report regeneration and evidence envelope tests pass. |
| 9 | Adapter health, PMO Doctor, replay smoke | Degraded/circuit/replay tests pass. |
| 10 | Phase 1C intelligence | Deterministic learning and discarded-decision tests pass. |

## 32. Summary

The core direction remains strong: Program Manager is the stateful PMO memory and intelligence layer for coordinated programs. The integrated plan makes the first build smaller, protects trust boundaries earlier, and adds the deterministic machinery needed for hashes, replay, evidence, and adapter conformance.

The immediate goal should be **Phase 1A**: a read-only cp-graph-backed PMO package with deterministic impact analysis, a seed registry, clear tool envelopes, portfolio-scoped authz, redaction, and a golden fixture. Flight plans, receipts, and proactive intelligence become much safer once that base is stable.

## 33. References

- Program Manager MCP Agent Handoff, uploaded source document, 2026-05-03.
- Model Context Protocol TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk
- Zod JSON Schema docs: https://zod.dev/json-schema
- AJV standalone validation: https://ajv.js.org/standalone.html
- RFC 8785 JSON Canonicalization Scheme: https://www.rfc-editor.org/rfc/rfc8785
- Neo4j-Migrations: https://neo4j.com/labs/neo4j-migrations/
- Testcontainers for Node.js Neo4j module: https://node.testcontainers.org/modules/neo4j/
- Neo4j indexes: https://neo4j.com/docs/cypher-manual/current/indexes/
- Neo4j constraints: https://neo4j.com/docs/cypher-manual/current/schema/constraints/
- CloudEvents specification: https://github.com/cloudevents/spec
- AsyncAPI document concept: https://www.asyncapi.com/docs/concepts/asyncapi-document
- OpenTelemetry JavaScript documentation: https://opentelemetry.io/docs/languages/js/
- TypeScript project references: https://www.typescriptlang.org/docs/handbook/project-references.html
- Vitest test context: https://vitest.dev/guide/test-context
