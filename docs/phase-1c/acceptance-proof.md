# Phase 1C Acceptance Proof

Generated: 2026-05-03

## Scope

Phase 1C closes evidence-backed learning and decision intelligence for Program Manager MCP. The implementation keeps intelligence read-only: records are persisted as typed PMO facts, deterministic rules produce issue cards, and advisory summaries are labeled outside deterministic hash inputs.

## Acceptance Evidence

| Requirement | Evidence |
| --- | --- |
| Learning, attempt, discarded decision, failure pattern, and risk records are typed and queryable. | `shared/schemas/program-manager.ts` defines the discriminated intelligence record schemas; `ProgramManagerRepository.listIntelligenceRecords` is implemented by in-memory, graph, and Neo4j stores; `npm test` passes fixture and repository tests covering all five record types. |
| Learning confidence is explicit, and needs-review confidence is bounded. | `calculateLearningConfidence` in `control-plane/packages/program-manager/src/fixtures/golden-fixture-backbone.js` derives supported confidence from evidence/source refs and caps `needs_review` at `<= 0.5`; schema validation enforces the same bound. |
| Deterministic matching produces stable issue cards. | `analyze_program_intelligence` maps persisted records and blocked/stale relationships into sorted deterministic issue cards with rule ids, provenance, confidence, evidence refs, and proposed update status. |
| Advisory/model-assisted content is excluded from deterministic hashes. | `programToolResultEnvelopeSchema` labels `advisoryPane.excludedFromDeterministicHash: true`; `program-tools.test.js` proves the `stateVersionHash` is unchanged when advisory output is requested. |
| Tool output remains read-only and authz/redaction-safe. | The service follows the existing public PMO gateway pattern: `assertReadAuthorized`, `assertNoMutationAuthority`, pointer-only evidence/artifact refs, standard redaction summaries, and no downstream mutation call. |

## Command Evidence

```text
TPF_LLM_TOOL=codex tpf npm run typecheck
PASS: tsc -p tsconfig.json --noEmit

TPF_LLM_TOOL=codex tpf node --test tests/program-tools.test.js
PASS: 10 tests, including analyze_program_intelligence deterministic cards and advisory hash exclusion.

TPF_LLM_TOOL=codex tpf node --test tests/golden-fixture-seed.test.js
PASS: golden fixture import into graph repository is deterministic and complete.

TPF_LLM_TOOL=codex tpf npm test
PASS: 46 tests, 45 pass, 1 skipped, 0 fail.
```

## Deterministic 1C Tool Contract

`analyze_program_intelligence` returns:

- `deterministicCore.contextAnchor`
- `deterministicCore.issueCards`
- `deterministicCore.omittedCardCount`
- `deterministicCore.rulesVersion`
- `stateVersionHash`
- pointer-only `evidenceRefs` and `artifactRefs`

Each issue card includes `issueType`, `affectedScope`, `relevance`, `confidence`, `ruleId`, `ruleVersion`, provenance record ids, evidence/source refs, recommended next action, and proposed update status.

The tool may recommend tracker/report/decision follow-up, but it does not execute those updates.
