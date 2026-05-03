# Program Manager Phase 0 Data Model, Event Replay, and Hash Spec

- Status: Drafted to satisfy `pmo-001`
- Date: 2026-05-03
- Blueprint anchors: `program-manager-mcp-integrated-blueprint-2026-05-03.md:679-681`, `:344-369`, `:526-591`, `:888-899`

## Scope

This document specifies the minimum deterministic contract required before implementation:

- the data model centered on `ContextAnchor`, `DependencyEdge`, `ArtifactRef`, and `EvidencePolicy`
- the append-only PMO event model and replay policy
- canonical hashing rules for `stateVersionHash` and `flightPlanHash`
- parseable fixture inputs for both hash types

The contract preserves four non-negotiables:

1. PMO owns PMO memory and may mutate only PMO-owned state.
2. PMO remains a passive analyst and never mutates downstream systems.
3. Context remains pointer-only.
4. Authz, redaction, and tenant isolation are part of the design contract.

## Deterministic Entity Model

### ContextAnchor

`ContextAnchor` scopes every deterministic query, plan, report, or reconciliation.

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

Normalization rules:

- Omit absent fields instead of serializing `null`.
- Use UTC ISO 8601 timestamps when `asOf` is present.
- Treat `trackerRev` as an integer.
- Never infer cross-portfolio scope from a missing `portfolioId`.

### Dependency relationship core

Hot graph traversal uses first-class Neo4j relationships with a stable `dependencyId`.

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

`DependencyEdge` remains a named model concept. In v1 it is represented primarily by relationship data. A separate `DependencyEdge` node is allowed only for metadata-heavy audit cases or when a durable node target is required for reports or evidence linkage.

### ArtifactRef

`ArtifactRef` is a pointer-only index entry, not a content container.

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

Artifact rules:

- `storageUri` must use an allowlisted scheme.
- `contentHash` is mandatory for any artifact that participates in deterministic proofs.
- `classification` and `redactionStatus` are mandatory because redaction is not optional hardening.
- Raw artifact contents are excluded from deterministic hashes and standard PMO outputs.

### EvidencePolicy

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

Policy rules:

- Tier 0 and tier 1 contract or production-policy evidence must require a digest.
- At least one independently verifiable method is required for tier 0 and tier 1 approvals.
- Branch-specific evidence is not valid outside the recorded branch and commit.
- Policies are portfolio-scoped unless an ADR explicitly allows inheritance.

### Event envelope

Every PMO event must carry deterministic replay metadata.

```ts
type ProgramManagerEvent = {
  eventId: string;
  eventType: string;
  eventVersion: string;
  occurredAt: string;
  recordedAt: string;
  portfolioId: string;
  programId?: string;
  projectId?: string;
  actorId: string;
  actorRole: string;
  traceId: string;
  correlationId: string;
  causationId?: string;
  idempotencyKey: string;
  propagationDepth: number;
  propagationPath: string[];
  sourceAdapterId?: string;
  sourceCursor?: string;
  contextAnchor?: ContextAnchor;
  payload: Record<string, unknown>;
  evidenceRefs: string[];
  artifactRefs: string[];
  redactionPolicyRefs: string[];
};
```

Event rules:

- `portfolioId` is mandatory on every event.
- `actorId` must come from server-verified identity, not caller text.
- `payload` may describe evidence and external actions, but it must not embed prohibited raw content classes.
- `idempotencyKey` plus `(eventType, portfolioId)` must be stable enough to reject duplicate logical writes.

### Receipt ledger

Flight-plan and receipt history must be explicit enough for reconciliation.

```ts
type ExpectedReceipt = {
  receiptRequirementId: string;
  flightPlanId: string;
  flightPlanHash: string;
  flightPlanStateVersionHash: string;
  portfolioId: string;
  programId?: string;
  projectId?: string;
  requiredEvidencePolicyRefs: string[];
  expectedBy?: string;
  status:
    | "expected"
    | "in_flight"
    | "submitted"
    | "accepted"
    | "rejected"
    | "late"
    | "lost"
    | "stale_plan_revalidation_required"
    | "conflicts_with_observed_state"
    | "superseded_by_reconciliation";
};

type ObservedReceipt = {
  receiptId: string;
  flightPlanId: string;
  flightPlanHash: string;
  flightPlanStateVersionHash: string;
  portfolioId: string;
  submittedAt: string;
  submittedBy: string;
  evidenceRefs: string[];
  artifactRefs: string[];
  observedStateRefs?: string[];
  status:
    | "submitted"
    | "accepted"
    | "rejected"
    | "stale_plan_revalidation_required"
    | "conflicts_with_observed_state";
};
```

## Event and Replay Policy

### Source of truth

PMO uses an append-only event model as the rebuild basis. Neo4j is the primary query and projection store, but the graph is treated as a projection that must be re-derivable.

### Interim write rule

For the first implementation:

- Write PMO event nodes and graph projection updates in one Neo4j transaction.
- Do not perform uncoordinated dual writes to an external event store plus Neo4j.
- Keep reducer and envelope boundaries compatible with a later outbox-driven split if audit scale requires it.

This is the default pending an architecture decision on whether to introduce a separate event store immediately.

### Replay order

Replay events in `(occurredAt, eventId)` order. Reducers must be pure over ordered input plus explicit auxiliary inputs:

- registry manifests
- adapter manifests
- artifact metadata
- evidence digests
- adapter sync cursors
- reducer version
- schema version

If an old event cannot be replayed into the current projection deterministically, create:

1. a migration reducer version
2. a replay fixture covering the migration
3. an explicit hash expectation before and after migration

### Reducer contract

Reducer behavior must satisfy these rules:

- deterministic input ordering at every traversal boundary
- idempotent handling of duplicate `idempotencyKey`
- no dependence on wall-clock time unless the time value is present in the replay input
- no dependence on advisory or model-assisted output
- no downstream mutation during replay

### Replay rebuild sequence

From an empty graph:

1. Load program registry manifests.
2. Load adapter manifests.
3. Replay PMO events.
4. Restore artifact metadata and evidence digests.
5. Refresh adapter state from stored cursors or fixture observations.
6. Rebuild projections.
7. Recompute `stateVersionHash`.
8. Rebuild deterministic report evidence envelopes if needed.

### Authz, redaction, and tenant isolation assumptions for replay

- Replay jobs run with system authority over PMO-owned storage only.
- Replay never bypasses portfolio isolation when producing queryable projections.
- Redacted fields remain redacted in query projections unless a dedicated operator-only projection is explicitly defined and separately authorized.
- Cross-portfolio joins are prohibited by default even during replay.

## Hash Specification

### Canonicalization

Use RFC 8785 JSON Canonicalization Scheme semantics:

1. Build a hash input document from included fields only.
2. Sort object properties lexicographically.
3. Preserve array order exactly as constructed by deterministic sort rules.
4. Serialize to canonical JSON bytes.
5. Compute SHA-256 over those bytes.
6. Encode as `sha256:<hex>`.

### `stateVersionHash`

Purpose: pin the exact deterministic PMO state used for a query, plan, report, or reconciliation.

Required included fields:

- normalized `contextAnchor`
- relevant node ids and relationship ids
- dependency properties that affect planning or reconciliation
- adapter manifest ids and versions
- adapter cursors and source revision hashes
- artifact and evidence refs with content digests
- deterministic rule ids and versions
- schema versions and reducer versions

Required exclusions:

- raw artifact contents
- raw logs, transcripts, screenshots, or scratchpads
- advisory panes
- generated timestamps that are not explicit query inputs
- non-deterministic ordering

### `flightPlanHash`

Purpose: pin the deterministic core of a proposed action plan, excluding advisory language.

Required included fields:

- `flightPlanId`
- `portfolioId`
- `programId` when applicable
- normalized `contextAnchor`
- `stateVersionHash`
- deterministic action set, ordered by `actionId`
- required approvals, ordered by `authorityRef`
- required evidence policy refs, ordered lexicographically
- expected receipt requirements, ordered by `receiptRequirementId`
- deterministic risk findings and blockers that materially gate execution
- `toolSchemaVersion` and `plannerRuleVersions`

Required exclusions:

- narrative explanation text that is purely advisory
- model confidence prose
- display-only report formatting
- transient UI labels

### Sort rules

When building either hash input:

- sort arrays of refs lexicographically unless a stronger domain order is defined
- sort actions by `actionId`
- sort receipt requirements by `receiptRequirementId`
- sort approvals by `authorityRef`
- sort policies by `policyId` or raw ref string
- sort graph relationships by `dependencyId`

## Parseable Hash Fixtures

The fixture files under [`docs/phase-0/fixtures`](./fixtures) are parseable JSON examples. Each file contains:

- `canonicalization`
- `hashAlgorithm`
- `input`
- `expectedHash`

`expectedHash` is computed over the `input` object only after canonicalization, not over the wrapper document.

## Open Questions with Owner and Decision Authority

| Question | Interim default | Owner | Decision authority |
|---|---|---|---|
| Interim event storage topology | Neo4j event nodes plus projection in one transaction | PMO implementer | Architecture reviewer |
| Trust root for server-verified actor identity | Must be available before production use | Platform/security owner | Security reviewer |
| Retention policy for events, artifact refs, evidence refs, actor metadata | Must be explicit before production use | Platform/security owner | Security reviewer |
| Tier 0/1 approval authority and evidence minimums | Must be explicit before approval tools ship | Program governance owner | Governance reviewer |

## Verification intent for later implementation

This planning repo does not ship the runtime yet, but the contract is written so the later implementation can verify:

- schema examples parse
- replay from fixtures is deterministic
- repeated canonical inputs yield the same hash
- authz, redaction, and portfolio isolation are testable as first-order behavior
- no external runtime mutation occurs through PMO
