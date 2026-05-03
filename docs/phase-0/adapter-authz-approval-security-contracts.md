# Program Manager Adapter, Authz, Approval, and Security Contracts

- Status: Drafted to satisfy `pmo-003`
- Date: 2026-05-03
- Blueprint anchors: `program-manager-mcp-integrated-blueprint-2026-05-03.md:477-568`, `:675-688`
- Depends on: [adr-pmo-stateful-memory-service.md](./adr-pmo-stateful-memory-service.md)

## Purpose

This document specifies how Program Manager reads standalone capabilities through adapters and how identity, approval authority, portfolio isolation, redaction, and threat controls are enforced before adapter code exists.

The contract preserves the PMO boundary:

- Phase 1A adapters are read-only.
- Adapters may describe external actions and evidence requirements.
- Adapters must not execute external actions through PMO.
- PMO does not expose mutation-capable downstream tools as hidden adapter capabilities.
- PMO must not rely on an LLM to remember propagation, redaction, or approval rules.

## Adapter Manifest Contract

Each adapter must publish a manifest with these fields:

```ts
type ProgramAdapterManifest = {
  adapterId: string;
  adapterVersion: string;
  displayName: string;
  capabilityDomains: string[];
  supportedProjects: string[];
  sideEffectPosture: "read_only" | "describes_actions_only" | "mutation_capable_not_exposed";
  phase1aEnabled: boolean;
  authScopes: string[];
  evidenceTypes: string[];
  redactionPolicyRefs: string[];
  maxStaleCursorSeconds: number;
  healthModel: {
    statuses: Array<"healthy" | "degraded" | "unavailable" | "circuit_open">;
    circuitOpenAfterFailures: number;
    circuitOpenSeconds: number;
  };
  methods: {
    describeCapabilities: true;
    getObservationSchema: true;
    readState: true;
    assessImpact: true;
    reconcileState: boolean;
    produceEvidenceRefs: true;
    getSourceCursor: true;
    getHealth: true;
  };
};
```

### Side-effect posture

`sideEffectPosture` must be explicit:

- `read_only`: adapter cannot mutate downstream state.
- `describes_actions_only`: adapter can describe possible actions but cannot execute them through PMO.
- `mutation_capable_not_exposed`: underlying system has mutation APIs, but this adapter does not expose them.

Any adapter that cannot prove one of these postures fails Phase 1A conformance.

### Health and freshness

Adapter health uses the blueprint statuses:

| Status | PMO behavior |
|---|---|
| `healthy` | Output may participate in deterministic core. |
| `degraded` | Emit health risk; use in deterministic core only if limitations do not affect the queried fact. |
| `unavailable` | Do not claim current observed state; emit explicit gap. |
| `circuit_open` | Skip adapter calls; use last-known cursor only as stale context. |

Facts are stale when cursor age exceeds `maxStaleCursorSeconds`.

## Adapter Methods

Every adapter implements:

- `describeCapabilities()`
- `getObservationSchema(domain, observationType)`
- `readState(readRequest)`
- `assessImpact(ProgramImpactAssessmentRequest)`
- `reconcileState(scope)`
- `produceEvidenceRefs(observationResult)`
- `getSourceCursor(scope)`
- `getHealth(scope)`

For Phase 1A, `reconcileState` may return a bounded read-only observation and cannot record downstream changes.

## Impact Assessment Contract

```ts
type ProgramImpactAssessmentRequest = {
  requestId: string;
  portfolioId: string;
  programId?: string;
  contextAnchor: Record<string, unknown>;
  changeRef: string;
  changeKind: string;
  targetRefs: string[];
  traversalBudgetRef: string;
  stateVersionHash?: string;
};

type ProgramImpactAssessmentResult = {
  requestId: string;
  adapterId: string;
  status: "ok" | "warning" | "blocked" | "degraded";
  sourceCursor: string;
  affectedRefs: Array<{ kind: string; ref: string; reason: string }>;
  findings: Array<{ findingId: string; severity: string; type: string; evidenceRefs: string[] }>;
  evidenceRefs: string[];
  artifactRefs: string[];
  redactionSummary: {
    redacted: boolean;
    omittedKinds: string[];
    policyRefs: string[];
  };
};
```

Fixture examples for LLM Tracker and Hoplon live in [`adapter-contract-fixtures.example.json`](./fixtures/adapter-contract-fixtures.example.json).

## Adapter Conformance Suite

The shared conformance suite must exist before production adapters are enabled. It validates:

- manifest shape
- schema refs
- side-effect classification
- deterministic `assessImpact` for fixture inputs
- sync cursor monotonicity
- degraded, unavailable, and circuit-open behavior
- evidence ref production
- read-only reconciliation behavior
- refusal to expose mutation authority through PMO
- trace, correlation, and causation propagation
- loop suppression via propagation path
- portfolio-scoped authz checks
- redaction behavior for prohibited payload classes

## Identity and Trust Root

Every PMO query, event, adapter read, approval check, and receipt observation requires server-verified actor identity.

Accepted trust-root options for implementation may include OIDC/JWT, mTLS, host-signed envelope, or another platform-approved mechanism. Caller-asserted text identity is not sufficient.

Required identity fields:

- `actorId`
- `actorRole`
- `tenantId`
- `portfolioGrants`
- `programGrants`
- `projectGrants`
- `authnMethod`
- `authnIssuer`
- `authenticatedAt`
- `expiresAt`

Portfolio is the minimum isolation boundary. Cross-portfolio access is denied by default and requires an explicit grant plus audit event.

## Approval Authority Matrix

Approval satisfaction must be evidence-backed and context-valid. Superseded, expired, branch-inapplicable, or future-not-applicable approvals do not satisfy gates.

| Role | Query context | Plan action | Record receipt | Approve gate | Cross portfolio |
|---|---:|---:|---:|---:|---:|
| `human_operator` | Yes | Yes | Yes | Scoped by grant | No by default |
| `program_manager_agent` | Yes | Yes | Limited/internal only | No | No |
| `execution_agent` | Assigned scope only | Limited | Assigned flight plan only | No | No |
| `c_suite_agent` | Scoped | Yes | No | Program-level gates within authority | Explicit grant only |
| `service_adapter` | Adapter scope only | No | Observed receipts only | No | No |

Approval records and checks must include:

- `authorityRef`
- `actorId` from server-verified identity
- `role`
- `portfolioGrants`
- `programGrants`
- `maxCriticality`
- `allowedContractRefs`
- `requiredEvidencePolicyRefs`
- `validFrom`
- `expiresAt`
- `reviewBy`
- `supersededBy`
- `breakGlassAllowed`
- `breakGlassEvidenceRefs`

Tier 0 and tier 1 gates require scoped authority plus evidence policy satisfaction. Break-glass approval must emit a critical PMO audit event and create a follow-up review obligation.

## Redaction and Isolation Rules

PMO output must include redaction status, not silently omit sensitive data.

Required redaction controls:

- classify every artifact and evidence ref
- omit raw content-bearing evidence from normal outputs
- return pointer refs plus hashes instead of content
- include `redactionSummary` in tool and adapter results
- reject prohibited inline payload fields in adapter results
- keep portfolio-scoped projections isolated during replay and query

## Security Threat Model

| Threat | Required mitigation | Required test |
|---|---|---|
| Artifact URI abuse | Allowlisted URI schemes and adapter-mediated fetches; refs are identifiers first. | Reject unallowlisted fetchable URI schemes. |
| SSRF and path traversal | Block arbitrary HTTP/file fetches in PMO. Use isolated fetch workers only if fetches are explicitly allowed. | Attempt `http://`, `file://`, `../`, and absolute-path refs through PMO output paths. |
| Poisoned adapter data | Validate adapter result against manifest version, observation schema, source cursor, and evidence policy. | Feed malformed result and stale cursor fixtures. |
| Prompt injection through reports or external artifacts | Keep raw content behind refs; summarize only sanitized, bounded, redacted material. | Ensure prompt-like artifact content never appears inline in deterministic core. |
| Receipt forgery | Require digest, signed downstream receipt, adapter-observed state, or scoped operator attestation according to policy. | Submit receipt without required digest/signature and assert rejection. |
| Confused-deputy execution | PMO plans do not grant downstream authority; execution tools enforce their own authz. | Attempt to use PMO plan as approval for unauthorized downstream mutation. |
| Cross-portfolio leakage | Require portfolio-scoped authority on every query and event; deny by default. | Query portfolio B with portfolio A grants and assert denial plus audit event. |
| Looping propagation | Carry causation, ancestry, idempotency key, propagation depth, and path. | Replay repeated `(adapterId, targetRef, action)` and assert suppression. |
| Secret leakage | Never inline secrets, credentials, provider transcripts, raw logs, screenshots, or scratchpads. | Redaction probe fixtures include prohibited fields and must be blocked. |

## Phase 1A Readiness Criteria

Adapter work can start only when:

- manifests are parseable
- conformance checks are defined
- trust-root choice is explicit for the runtime
- portfolio grants are represented in authz checks
- redaction policy refs are present in adapter outputs
- LLM Tracker and Hoplon fixtures pass read-only posture checks
