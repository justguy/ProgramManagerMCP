# ADR: Program Manager as a Stateful PMO Memory Service

- Status: Accepted for Phase 0 design contract
- Date: 2026-05-03
- Blueprint source: `program-manager-mcp-integrated-blueprint-2026-05-03.md:673-697`

## Context

Program Manager exists to provide cross-project PMO memory, dependency intelligence, audit history, and receipt reconciliation without replacing focused systems such as LLM Tracker, Hoplon, GitHub, Guardrail, Semantix, Phalanx, or Serena.

The integrated blueprint requires Phase 0 to lock the design contract before implementation starts. The contract must keep four boundaries explicit:

1. PMO owns its own durable memory.
2. PMO remains a passive analyst and does not execute downstream mutations.
3. PMO keeps context pointer-only instead of inlining sensitive or high-volume payloads.
4. Authz, redaction, and tenant isolation are first-order design constraints, not deferred hardening work.

## Decision

Program Manager is a stateful PMO memory service with its own repository, event ledger, artifact registry, and graph projection store.

It is not a thin stateless facade over downstream MCPs, and it is not an execution orchestrator. PMO may mutate only PMO-owned state:

- PMO repository records
- PMO event log
- PMO graph projections
- PMO artifact metadata and evidence indexes
- PMO-generated reports and receipts

PMO does not mutate downstream trackers, codebases, ticketing systems, deployment systems, or external product state. Any external action is performed by an execution agent using that agent's own authorized tools. PMO records expected actions, approvals, evidence obligations, and submitted receipts only.

## Implementation Decisions

### Runtime and package shape

- Runtime language: TypeScript
- Primary implementation package: `@amg/cp-program-manager`
- MCP exposure: narrow tool surface via `@amg/mcp-gateway`

### Persistence and query model

- Repository abstraction: `ProgramManagerRepository`
- Primary query and projection store: Neo4j
- Unit-test repository: `InMemoryProgramManagerRepository` for narrow fixtures only
- Event basis: append-only PMO events are the rebuild source for deterministic replay

Neo4j is the primary graph query and projection database, not the only audit history. PMO must be able to rebuild graph projections from PMO events, registry manifests, adapter manifests, artifact metadata, evidence digests, and adapter cursors.

### Passive analyst posture

PMO is a passive analyst, planner, reconciler, and ledger. In concrete terms:

- PMO may assess blast radius, dependency state, applicable decisions, evidence freshness, and receipt status.
- PMO may propose external actions in a flight plan.
- PMO may not execute those actions through downstream mutation-capable tools.
- PMO flight plans do not expand executor authority.

### Pointer-only context boundary

PMO stores and returns references plus digests, not raw payload bodies, for:

- logs
- traces
- screenshots
- provider transcripts
- product rows
- secrets
- credentials
- session data
- scratchpads

Artifact and evidence payload fetches must be adapter-mediated and allowlisted. Reference strings are identifiers first, never arbitrary fetch instructions.

## Required Assumptions

These assumptions are part of the Phase 0 contract and must hold unless a later ADR replaces them.

### Authz

- Every PMO query and event is evaluated against a server-verified actor identity.
- PMO authorizes reads by portfolio and, where relevant, by program, project, contract, and artifact classification.
- Execution agents do not inherit authority from PMO plans. Downstream tools enforce their own authz independently.

### Redaction

- PMO outputs are redaction-safe by default.
- Content-bearing evidence may be indexed by reference and digest, but raw content is omitted unless a later design explicitly allows a bounded, policy-checked retrieval path.
- Redaction outcome must be represented explicitly in PMO results and artifact metadata.

### Tenant and portfolio isolation

- Portfolio is the minimum isolation boundary for PMO reads, events, artifacts, decisions, and replay inputs.
- Cross-portfolio access is denied by default.
- If cross-portfolio access is later allowed, it requires explicit grant, audit logging, and an ADR that narrows allowed use cases.

### Determinism

- Deterministic planning and replay inputs use canonical JSON plus SHA-256.
- Advisory or model-assisted output is excluded from deterministic hashes.
- Repository traversals that feed deterministic results must define explicit sort order at each traversal boundary.

## Consequences

### Positive

- PMO has durable memory that survives agent turns and tool boundaries.
- Deterministic replay and hashing become testable.
- Cross-program dependency analysis has a graph-backed home.
- External tool replacement risk stays low because PMO coordinates rather than absorbs focused systems.

### Costs

- PMO needs explicit repository, graph schema, replay logic, authz, and redaction contracts before implementation.
- Receipt handling is more complex because cross-tool work is not transactional.
- The system must maintain a strict distinction between PMO-owned mutation and downstream mutation.

## Open Phase 0 Questions

The task requires unresolved questions to carry owner and decision authority. The following remain open from the integrated blueprint and are tracked here to block silent drift.

| Question | Default for implementation start | Owner | Decision authority |
|---|---|---|---|
| Should interim PMO events live as Neo4j event nodes in the same transaction as graph projection, or should a separate event store be introduced immediately? | Start with Neo4j event nodes plus graph projection in one transaction. Keep reducer boundaries compatible with later extraction to a separate event store. | PMO implementer | Architecture reviewer |
| Which trust root verifies actor identity? | Assume server-verified identity is mandatory. Implementation may not ship with caller-asserted identity. | Platform/security owner | Security reviewer |
| Which artifact store owns generated report envelopes and evidence metadata? | Assume PMO persists metadata and references only; payload store selection must preserve pointer-only access and retention controls. | PMO implementer | Architecture reviewer |
| Which URI schemes are fetchable versus identifier-only in v1? | Only explicitly allowlisted schemes may be fetchable. All others remain identifier-only. | PMO implementer | Security reviewer |
| What is the retention policy for PMO events, artifact refs, evidence refs, and actor metadata? | Retention must be explicit before production use. Until then, treat events and metadata as durable records subject to least-retention review. | Platform/security owner | Security reviewer |
| Who can approve tier 0 and tier 1 gates, and what evidence is mandatory? | Assume approval requires scoped authority plus evidence policy satisfaction; exact authority matrix needs explicit named grants. | Program governance owner | Governance reviewer |

## Rejected Alternatives

### Stateless PMO facade

Rejected because it would force durable program memory, decision applicability, dependency state, evidence freshness, and replay semantics back into downstream tools or model memory.

### PMO as execution orchestrator

Rejected because it violates the passive analyst boundary, creates confused-deputy risk, and weakens downstream authz separation.

### Raw content ingestion as default context strategy

Rejected because it breaks pointer-only context, increases leakage risk, and makes deterministic replay and redaction materially harder.
