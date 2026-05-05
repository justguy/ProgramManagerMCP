# Program Manager Schema Examples and Fixture Contracts

- Status: Drafted to satisfy `pmo-002`
- Date: 2026-05-03
- Blueprint anchor: `program-manager-mcp-integrated-blueprint-2026-05-03.md:839-854`
- Depends on: [data-model-event-replay-and-hash-spec.md](./data-model-event-replay-and-hash-spec.md)

## Purpose

This document turns the Phase 0 PMO model into example contracts that later Zod schemas, generated JSON Schemas, AJV validators, fixtures, and conformance tests can reuse without reinterpretation.

All examples must remain:

- pointer-only
- portfolio-scoped
- deterministic
- stable-ID based
- sorted wherever output depends on collection order
- free of raw logs, transcripts, screenshots, secrets, credentials, session data, scratchpads, and content-bearing evidence bodies

## Parseable Example Files

The parseable examples live under [`docs/phase-0/fixtures`](./fixtures).

| File | Purpose |
|---|---|
| `schema-examples.example.json` | Canonical examples for core PMO schema objects. |
| `golden-fixture-backbone.example.json` | The shared `G0/C0/A0/F0/H0` fixture backbone. |
| `tool-contracts.example.json` | Public PMO tool request/result envelope examples and forward-compatible tool scopes. |
| `sample-registry.example.json` | Seed registry manifest and extended `G0/C0/A0/F0/H0/P0/R0/I0` fixture scope. |
| `state-version-hash-input.example.json` | Parseable `stateVersionHash` input and expected digest. |
| `flight-plan-hash-input.example.json` | Parseable `flightPlanHash` input and expected digest. |

## Schema Example Contract

`schema-examples.example.json` includes the following top-level fields:

- `schemaVersion`
- `validationContract`
- `examples`

The `examples` object provides canonical examples for:

- `portfolio`
- `program`
- `project`
- `contextAnchor`
- `dependencyRelationshipProps`
- `artifactRef`
- `evidenceRef`
- `evidencePolicy`
- `decisionRecord`
- `syncCursor`

These examples are intentionally compact. They are not exhaustive domain payloads; they are stable, pointer-only examples intended to become direct test fixtures.

## Golden Fixture Backbone

Every phase should extend one shared fixture backbone instead of creating isolated examples.

| Fixture | Meaning |
|---|---|
| `G0` | Seed graph with Hoplon, Phalanx, Semantix, Guardrail, Program Manager MCP, contracts, integration points, decisions, evidence refs, and tracker refs. |
| `C0` | Proposed change, such as a Hoplon authz contract update or stale evidence condition. |
| `A0` | Expected affected refs: projects, contracts, integration points, tracker tasks, policies, and evidence refs. |
| `F0` | Expected findings: at least one cross-project dependency and one stale/missing evidence condition. |
| `H0` | Expected `stateVersionHash`. |
| `P0` | Public PMO tool envelope and Phase 1A tool examples. |
| `R0` | Sample registry seed manifest for programs, projects, integration points, contracts, policies, evidence refs, decisions, and sync cursors. |
| `I0` | Initial intelligence fixture for repeated blockers, stale evidence, missing evidence, discarded decisions, and risk signals. |

`golden-fixture-backbone.example.json` keeps these names as first-class keys so later tests can address them directly.

## Deterministic Ordering Rules

The examples use these ordering rules:

- project lists sort by `projectId`
- contract refs sort lexicographically
- integration points sort by `integrationPointId`
- dependency relationships sort by `dependencyId`
- evidence refs sort by `evidenceRef`
- findings sort by severity rank, then `findingId`
- affected refs sort by `kind`, then `ref`
- policy refs sort lexicographically

No fixture should rely on JavaScript insertion order or Neo4j traversal order unless the order has first been normalized under these rules.

## Zod and JSON Schema Notes

The implementation target is TypeScript with Zod-authored schemas and generated JSON Schema. The examples are ready for that path:

- optional fields may be omitted; runtime PMO tool inputs and Neo4j read models treat `null` optional metadata as unknown/not asserted and ignore it
- timestamps use UTC ISO 8601 strings
- `sha256:` values are strings so they can use a JSON Schema pattern
- enum values match the Phase 0 data model spec
- pointer fields use explicit refs such as `portfolio://`, `program://`, `project://`, `contract://`, `tracker://`, `artifact://`, and `policy://`
- raw content is never embedded

AJV-compatible generated schemas should reject:

- missing `portfolioId` on portfolio-scoped facts
- unknown artifact URI schemes when the field is fetchable
- raw payload fields such as `logBody`, `transcript`, `screenshotBytes`, `secret`, `credential`, or `scratchpad`
- unsorted deterministic arrays in fixture outputs when a schema-level or test-level sorted assertion is available
- adapter examples that claim mutation authority through PMO

## Validation Command Used for These Docs

The planning repo does not yet contain the final Zod schemas. For Phase 0, parseability and deterministic hash fixtures are validated with Node JSON parsing plus canonical hash recomputation:

```bash
TPF_LLM_TOOL=codex tpf node -e '<fixture validation script>'
```

Later implementation should replace this with Zod parsing, JSON Schema generation, AJV validation, and fixture tests.

## Copy-Forward Requirements for Implementation

When implementation starts, copy the example values directly into tests before expanding them:

- Unit schema tests should parse `schema-examples.example.json`.
- Fixture tests should load `golden-fixture-backbone.example.json`.
- Impact tests should assert `G0 + C0 -> A0 + F0`.
- Hash tests should assert `H0.expectedStateVersionHash`.
- Redaction tests should assert no inline raw payload classes are present.
