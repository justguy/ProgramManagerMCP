# Program Manager MCP

Program Manager MCP is the planning home for **Program Manager**, a stateful PMO memory, dependency intelligence, and audit ledger service for coordinated agentic software programs.

The operator-facing and agent-facing capability label is **PMO**. The MCP server id is `program-manager`.

The current authoritative planning documents are:

- [Integrated implementation blueprint](program-manager-mcp-integrated-blueprint-2026-05-03.md)
- [Original agent handoff](program-manager-mcp-agent-handoff-2026-05-03.md)

The integrated blueprint supersedes the original handoff wherever the two differ. The original handoff remains useful for historical context, fuller rationale, and background requirements.

## Current Status

This repository currently contains planning documents only. The implementation target is a separate `@amg/cp-program-manager` package exposed through `@amg/mcp-gateway`.

The immediate build target is **Phase 1A**: read-only graph-backed PMO memory, deterministic impact analysis, portfolio-scoped authz, redaction, standard tool envelopes, adapter stubs, and a golden fixture.

## Purpose

Program Manager coordinates work across multiple programs, multiple projects, and multiple tools through a simplified MCP surface for agents.

It answers PMO questions such as:

- Which programs, projects, contracts, tasks, tools, reports, and evidence refs are affected by a proposed change?
- Which decisions apply to this branch, commit, tracker revision, or as-of time?
- Which dependencies are blocked, stale, superseded, discarded, or missing evidence?
- Which approvals, receipts, and verification artifacts are required before downstream work is complete?
- Which external systems disagree with expected PMO state?

Program Manager is a **passive analyst, planner, reconciler, and ledger**. It does not execute downstream mutations. Execution agents continue to use their own authorized tools and then return receipts to PMO.

## System Scope

Program Manager is intended to operate across:

- multiple portfolios
- multiple programs
- multiple projects per program
- projects participating in more than one program
- cross-program dependencies
- branch, commit, tracker revision, and as-of-time context
- multiple standalone capabilities such as LLM Tracker, Hoplon, GitHub, Guardrail, Semantix, Phalanx, Serena, and future Agentic OS services

Focused systems remain standalone. Program Manager does not replace them and does not expose every downstream action as a PMO tool.

## Default Decisions

Unless a later ADR changes them, the default implementation decisions are:

- Package: `@amg/cp-program-manager`
- MCP exposure: through `@amg/mcp-gateway`
- Database: Neo4j as the primary graph query and projection store
- First adapters: local file/API adapters, not MCP-to-MCP calls
- Reports: reproducible markdown plus a JSON evidence envelope
- External execution: outside PMO, coordinated through flight plans and receipts
- Event model: append-only PMO events as the rebuild basis
- Deterministic hashing: canonical JSON plus SHA-256 for state and plan hashes

## What PMO Does Not Do

Program Manager must preserve the passive PMO boundary:

- PMO does not write tracker tasks directly.
- PMO does not edit code.
- PMO does not call mutation-capable downstream tools.
- PMO does not inline raw logs, screenshots, prompts, transcripts, product rows, sessions, credentials, or secrets.
- PMO does not replace LLM Tracker, Hoplon, Serena, GitHub, Guardrail, Semantix, or Phalanx.

## Database Direction

Program Manager uses **Neo4j** as the primary PMO graph query and projection store.

This is not intended to be a simple in-memory graph or a hand-rolled graph database. Neo4j is required for durable dependency traversal, blast-radius analysis, indexed graph lookup, constraints, and graph-backed PMO projections.

The implementation should use:

- `ProgramManagerRepository` as the TypeScript repository interface
- `ProgramManagerGraphRepository` backed by Neo4j
- `InMemoryProgramManagerRepository` only for narrow unit tests and fixtures
- first-class Neo4j relationships for hot traversal
- stable IDs on relationships, especially `dependencyId`
- an append-only event model as the rebuild basis

Interim persistence may keep PMO event nodes and graph projection updates in one Neo4j transaction. A later architecture can move to a separate durable event store plus idempotent Neo4j projection reducer.

## Simplified MCP Surface

Agents should interact with a small macro-tool surface instead of every downstream capability directly through PMO.

Phase 1A tools:

- `list_program_capabilities`
- `get_program_documentation`
- `query_program_context`
- `assess_program_impact`

Later tools:

- `generate_program_update`
- `get_program_audit_trail`
- `analyze_program_intelligence`
- `plan_program_action`
- `record_program_receipt`
- `reconcile_program_state`

Every public tool should return a standard result envelope containing deterministic core data, optional advisory data, evidence refs, artifact refs, redaction summary, warnings, trace id, and correlation id.

## Pluggable Tool Contract

Additional tools and capabilities should integrate through capability adapters, not by expanding the PMO MCP surface with arbitrary tool calls.

A pluggable PMO adapter should provide:

- a capability manifest with version, supported domains, auth scopes, side-effect posture, evidence types, and health model
- bounded read methods for state, dependencies, context, cursors, evidence refs, and relevant artifacts
- impact assessment methods that return affected refs, findings, gaps, confidence, and evidence refs
- health and freshness reporting such as `healthy`, `degraded`, `stale`, or `unavailable`
- cursor support for incremental sync and reconciliation
- pointer-only evidence and artifact references with hashes
- explicit redaction behavior
- no hidden downstream mutation
- conformance tests for manifest shape, authz, redaction, impact, cursor behavior, health, evidence discipline, and no-mutation guarantees

The intended flow is:

```text
Standalone capability
  -> PMO adapter manifest and methods
  -> Program Manager repository and Neo4j graph
  -> simplified PMO MCP tools for agents
```

## Tooling Stack

The integrated blueprint recommends this stack:

- MCP TypeScript SDK for the `program-manager` MCP facade
- Zod for TypeScript-first DTOs
- AJV standalone validators for generated JSON Schema validation
- RFC 8785 JSON Canonicalization Scheme for deterministic hashing
- Neo4j-Migrations for graph constraints, indexes, and migrations
- Testcontainers Neo4j for integration tests
- Neo4j constraints and indexes for stable PMO IDs and efficient traversal
- CloudEvents-inspired PMO event envelopes
- AsyncAPI for event and adapter stream documentation
- OpenTelemetry JS for traces, metrics, and logs
- TypeScript project references for package boundaries
- Vitest for unit, fixture, adapter, and graph tests
- PMO Doctor CLI for schema, registry, graph, hash, redaction, fixture, and report smoke checks

## Repo Layout

Recommended implementation layout:

```text
shared/schemas/program-manager.ts
control-plane/packages/program-manager/
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
control-plane/packages/mcp-gateway/
  src/program-manager-tools.ts
control-plane/tests/unit/program-manager/
control-plane/tests/integration/program-manager-neo4j/
control-plane/manifests/programs/*.json
artifacts/reports/alignment/
artifacts/reports/implementation/
```

The implementation package should publish as `@amg/cp-program-manager`. The MCP gateway should expose only the simplified PMO tool surface, not the internal repository, adapter, or graph APIs.

## Core Memory Model

Program Manager owns durable PMO memory for:

- portfolios, programs, projects, and verticals
- branch contexts and context anchors
- program memberships
- integration points and contracts
- dependency relationships and cross-program dependencies
- decision requests, decision records, and discarded decisions
- evidence refs and artifact refs
- action ledger entries
- expected receipts and observed receipts
- propagation edges
- adapter bindings and sync cursors
- attempts, findings, risks, learnings, and failure patterns

Facts that can affect execution should be scoped by portfolio, program, project, repo, branch, commit, tracker revision, contract, integration point, valid time, recorded time, source adapter, source cursor, and evidence refs.

## Bitemporal Context

Program Manager must distinguish:

- **valid time**: when a decision, dependency, blocker, contract, or risk applies
- **recorded time**: when PMO learned or recorded that fact

This prevents current-main decisions from leaking into old branch contexts and prevents old branch state from overwriting current program truth.

## Delivery Plan

The integrated blueprint recommends this order:

1. ADR and data model spec.
2. Shared schemas and examples.
3. Golden fixture backbone.
4. Repository interface.
5. Neo4j migrations, constraints, indexes, and integration tests.
6. MCP facade for Phase 1A tools.
7. Adapter registry with read-only LLM Tracker and Hoplon stubs.
8. Deterministic hash implementation.
9. Report generator and JSON evidence envelope.
10. Adapter conformance harness.
11. PMO Doctor CLI.
12. Flight plans and receipts.
13. Reconciliation and operational telemetry.

The immediate implementation target is **Phase 1A**: a read-only graph-backed PMO package with deterministic impact analysis, a seed registry, tool envelopes, portfolio-scoped authz, redaction, and a golden fixture.

## First Implementation Slice

The first Phase 1A slice should include:

- shared Program Manager schemas
- golden fixture backbone
- `ProgramManagerRepository` interface
- Neo4j migrations, constraints, and indexes
- seed graph for initial programs, projects, contracts, dependencies, evidence refs, decisions, and cursors
- `list_program_capabilities`
- `get_program_documentation`
- `query_program_context`
- `assess_program_impact`
- deterministic `stateVersionHash`
- markdown plus JSON evidence report output

## Phase 1A Acceptance

Phase 1A is complete when PMO can:

- persist programs, projects, integration points, contracts, dependency relationships, decisions, evidence refs, artifact refs, and sync cursors in its own repository
- read or stub LLM Tracker state through an adapter contract
- read or stub Hoplon/code context through an adapter contract
- return capability matches and concise documentation
- answer bounded program context queries
- assess impact for a golden fixture and return exact affected refs and findings
- identify at least one cross-project dependency and one stale or missing evidence condition
- determine whether decisions are applicable, superseded, discarded, or future-not-applicable for a context anchor
- preserve the passive boundary by avoiding downstream mutations
- attach evidence refs and provenance to outputs
- pass portfolio isolation and redaction tests

## Verification Direction

The blueprint calls for focused checks by phase, including:

```bash
TPF_LLM_TOOL=codex tpf pnpm --filter program-manager run test:fixtures
TPF_LLM_TOOL=codex tpf pnpm --filter program-manager run test:neo4j
TPF_LLM_TOOL=codex tpf pnpm --filter program-manager run pmo:doctor
TPF_LLM_TOOL=codex tpf pnpm --filter program-manager run pmo:replay-smoke
TPF_LLM_TOOL=codex tpf pnpm --filter program-manager run pmo:report-regenerate
TPF_LLM_TOOL=codex tpf pnpm --filter program-manager run pmo:adapter-conformance
```

These commands are targets for the future implementation package. This repository currently contains planning documents only.

## Contribution Rules

Any implementation change affecting schemas, adapters, graph shape, authz, evidence, receipts, tool envelopes, deterministic hashes, or report outputs must update the integrated blueprint and the relevant fixtures in the same change.

Changes that add a new pluggable tool must also add or update its adapter manifest, conformance expectations, evidence behavior, health behavior, cursor behavior, and no-mutation guarantees.
