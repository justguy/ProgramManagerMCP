# Program Manager Sample Registry and Golden Fixture Scope

- Status: Drafted to satisfy `pmo-005`
- Date: 2026-05-03
- Blueprint anchors: `program-manager-mcp-integrated-blueprint-2026-05-03.md:839-899`, `:1780-1834`
- Depends on: [schema-examples-and-fixture-contracts.md](./schema-examples-and-fixture-contracts.md), [public-pmo-tool-contracts-and-result-envelope.md](./public-pmo-tool-contracts-and-result-envelope.md)

## Purpose

This document defines the first sample program registry and the shared fixture universe that later implementation and tests should extend.

The registry is an operational input and source reference. It is not the durable PMO memory by itself, and it does not give Program Manager downstream mutation authority. PMO imports or observes registry data through allowlisted adapters and then records durable PMO facts in its own event-backed repository.

Parseable examples live in [`sample-registry.example.json`](./fixtures/sample-registry.example.json).

## Seed Registry Manifest

The first registry seed covers one local development portfolio and the Agentic OS program.

Required top-level sections:

- `portfolios`
- `programs`
- `projects`
- `verticals`
- `integrationPoints`
- `contracts`
- `policies`
- `evidenceRefs`
- `decisions`
- `syncCursors`
- `fixtureScope`
- `openQuestions`

All refs use allowlisted schemes first:

- `portfolio://`
- `program://`
- `project://`
- `repo://`
- `integration://`
- `contract://`
- `policy://`
- `evidence://`
- `artifact://`
- `decision://`
- `tracker://`
- `cursor://`

Refs are identifiers. They must not trigger arbitrary fetches without adapter mediation.

## Projects

The seed registry includes these projects:

| Project ref | Name | Initial source refs |
|---|---|---|
| `project://program-manager-mcp` | Program Manager MCP | `repo://ProgramManagerMCP`, `tracker://program-manager-mcp` |
| `project://guardrail` | Guardrail | `repo://Guardian`, `tracker://guardrail-roadmap` |
| `project://hoplon` | Hoplon | `repo://Hoplon`, `tracker://hoplon` |
| `project://phalanx` | Project Phalanx | `repo://Phalanx`, `tracker://project-phalanx` |
| `project://semantix` | Semantix | `repo://Semantix`, `tracker://semantix` |

Actual repo paths, tracker slugs, and adapter source bindings remain follow-up decisions until verified in the implementation environment.

## Integration Points

The seed integration points are:

| Integration point | Producer | Consumers | Purpose |
|---|---|---|---|
| `integration://hoplon/authz-gateway` | `project://hoplon` | `project://program-manager-mcp`, `project://phalanx` | Hoplon authorization contracts consumed by agentic program flows. |
| `integration://tracker/program-state` | `project://program-manager-mcp` | `project://program-manager-mcp`, `project://guardrail`, `project://hoplon`, `project://phalanx`, `project://semantix` | Tracker task, blocker, and status observations consumed as PMO evidence. |
| `integration://semantix/readiness-spec-flow` | `project://semantix` | `project://program-manager-mcp`, `project://phalanx` | Spec readiness and alignment state consumed by planning. |
| `integration://guardrail/runtime-controls` | `project://guardrail` | `project://program-manager-mcp`, `project://phalanx` | Runtime, provider, and policy constraints consumed by orchestration. |
| `integration://phalanx/orchestration` | `project://phalanx` | `project://program-manager-mcp` | Orchestration state consumed by Agentic OS program workflows. |

## Fixture Scope

Every later test should reference this fixture backbone instead of inventing isolated examples.

| Fixture | Meaning | Required by |
|---|---|---|
| `G0` | Seed graph with projects, integration points, contracts, policies, decisions, evidence refs, and cursors. | Repository, graph, context, and report tests. |
| `C0` | Proposed Hoplon authz contract change plus tracker evidence freshness check. | Impact and hash tests. |
| `A0` | Expected affected refs for `G0 + C0`. | Impact tests. |
| `F0` | Expected cross-project dependency and stale/missing evidence findings. | Impact, report, and intelligence tests. |
| `H0` | Expected `stateVersionHash` for deterministic fixture input. | Hash tests. |
| `P0` | Phase 1A public tool envelope examples. | MCP facade and redaction tests. |
| `R0` | Registry seed manifest. | Repository seed, import, and rebuild tests. |
| `I0` | Initial intelligence findings over the seed graph. | Phase 1C intelligence tests. |

`F0` must include at least:

- one cross-project dependency from Hoplon authz to Phalanx
- one stale tracker evidence condition
- one missing evidence condition for a runtime-control policy or readiness artifact

## Open Questions

The implementation must resolve these before treating the seed as production configuration:

- Which exact project IDs does Hoplon register for Hoplon, Hoplon, Phalanx, Semantix, and Guardrail?
- Which tracker slugs are authoritative for each project?
- Should the first tracker adapter read local JSON, the tracker API, the tracker CLI, or an MCP client?
- What is the runtime trust root for verified actor identity?
- Which artifact store backs `artifact://` refs in local development and production?
- What is the final URI allowlist for fetchable refs?
- Which Neo4j edition and features are assumed for constraints, indexes, and migrations?
- What retention policies apply to tracker snapshots, generated reports, operator attestations, and adapter observations?
- Which roles can approve tier 0 and tier 1 gates for each portfolio and program?

Until these are answered, registry values are fixture seeds and default recommendations, not production truth.

## Copy-Forward Requirements

When implementation starts:

- seed repository tests from `sample-registry.example.json`
- extend `golden-fixture-backbone.example.json` rather than creating another fixture family
- assert that fixture refs are pointer-only and use allowlisted schemes
- assert that `G0 + C0 -> A0 + F0` includes the cross-project dependency and stale/missing evidence cases
- preserve `openQuestions` as explicit decision records or implementation assumptions
