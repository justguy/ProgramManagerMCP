# Phase 1A Acceptance Proof

- Status: accepted
- Date: 2026-05-03
- Tracker task: `pmo-108`
- Scope: read-only graph-backed PMO MVP

## Evidence Summary

Phase 1A is implemented under `control-plane/packages/program-manager` as `cp-program-manager`.

Verified commands:

```bash
TPF_LLM_TOOL=codex tpf npm test
TPF_LLM_TOOL=codex tpf npm run generate:schemas
/Users/adilevinshtein/Documents/dev/Hoplon/node_modules/.bin/tsc -p tsconfig.json --noEmit
```

Results:

- `npm test`: 35 passing tests, 1 skipped live-Neo4j hook.
- `npm run generate:schemas`: passed.
- `tsc --noEmit`: passed using the local Hoplon TypeScript binary.
- Prohibited-reference scan: no matches across the repo and shared tracker file.

The live Neo4j test is intentionally gated by `PMO_NEO4J_URI`; non-live graph repository, migration, and Neo4j store behavior are covered in package tests.

## Acceptance Criteria

PMO can answer capability and documentation questions through the Phase 1A gateway:

- `list_program_capabilities`
- `get_program_documentation`
- `query_program_context`
- `assess_program_impact`

All four tools return standard envelopes with:

- deterministic core data
- evidence refs
- artifact refs
- warnings
- trace id
- correlation id
- redaction summary
- state version hash where deterministic core data exists

Fixture `G0 + C0` produces exact `A0/F0` expectations through package tests. The fixture includes Hoplon, Phalanx, Semantix, Guardrail, Program Manager MCP, contracts, integration points, decisions, evidence refs, tracker refs, stale evidence, missing evidence, and a cross-project dependency.

Repository and graph evidence:

- `ProgramManagerRepository`
- `InMemoryProgramManagerRepository`
- `ProgramManagerGraphRepository`
- Neo4j constraints and indexes
- deterministic graph read ordering
- seed fixture loading
- state version hash stability

Adapter and boundary evidence:

- read-only LLM Tracker stub
- read-only Hoplon stub
- adapter manifests
- bounded reads
- cursor and health results
- evidence ref production
- no exposed mutation authority

Authz and redaction evidence:

- cross-portfolio reads are denied
- unauthorized actor scopes are denied
- prohibited inline payload classes are omitted or pointerized
- public gateway rejects unsupported downstream tool names
- facade tests prove only read-side repository and adapter APIs are called

## Deferred Evidence

Live Neo4j proof remains environment-gated. Run with `PMO_NEO4J_URI` to exercise the live hook against a real database. Phase 1A is still accepted because migration files, store query behavior, repository behavior, deterministic ordering, and non-live graph proof are covered.
