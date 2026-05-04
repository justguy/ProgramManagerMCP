# Phase 1B Acceptance Proof

Generated: 2026-05-04T01:20:25Z

## Scope

Phase 1B closes the PMO context/report/adapter-health slice:

- `query_program_context` context packet panes.
- `generate_program_update` reproducible report and JSON evidence envelope.
- `get_program_audit_trail` redaction-safe audit trail.
- Adapter health, stale cursor, degraded-mode caps, and circuit behavior.
- PMO Doctor, replay smoke, report regeneration, and adapter conformance checks.

## Acceptance Evidence

| Requirement | Evidence |
|---|---|
| Context packet panes include current state, blocking dependencies, decision applicability, stale evidence, and recommended actions. | `TPF_LLM_TOOL=codex tpf node --test control-plane/packages/program-manager/tests/program-tools.test.js` passed 8 tests, including `query_program_context returns Phase 1B context packet panes`. |
| Report deletion/regeneration path is deterministic. | `TPF_LLM_TOOL=codex tpf npm run pmo:report-regenerate` passed `report regeneration fixture parity`. |
| JSON evidence envelope refs match deterministic fixture expectations. | `TPF_LLM_TOOL=codex tpf npm run pmo:doctor` passed `fixture + report smoke`; `control-plane/packages/program-manager/fixtures/pmo-doctor-fixture.example.json` pins `stateVersionHash`, `reportMarkdownRef`, `evidenceEnvelopeRef`, `sectionRefs`, `evidenceRefs`, `artifactRefs`, and `inputRefs`. |
| Adapter degraded, stale, unavailable/circuit, and cursor behavior is covered. | `TPF_LLM_TOOL=codex tpf npm run pmo:adapter-conformance` passed `adapter manifests`, `health and cursor`, and `redaction and evidence`; `program-tools.test.js` covers degraded/stale read and impact behavior. |
| Evidence freshness cannot be satisfied silently by stale cursors. | `adapter-stubs.test.js`, `adapter-registry.test.js`, and `program-tools.test.js` pass stale cursor, circuit recovery, stale adapter skip, and degraded cap cases. |
| Context anchor coverage includes branch, commit, tracker revision, and as-of time. | `program-tools.test.js` passes context pane coverage with `branchName`, `gitCommit`, `trackerSlug`, `trackerRev`, and `asOf`; `program-manager-graph-repository.test.js` covers repository context-anchor propagation. |
| Audit/report tools use standard envelopes with authz and redaction. | `program-tool-authz.test.js` passes cross-portfolio audit/report denial; `program-tools.test.js` parses both tool envelopes and proves pointer-only audit entries. |
| Default operational checks do not depend on live mutation-capable services. | `pmo:doctor`, `pmo:replay-smoke`, `pmo:report-regenerate`, and `pmo:adapter-conformance` all run against local fixtures/stubs. |

## Verification Commands

All commands were run from `control-plane/packages/program-manager` unless the path is explicit.

```text
TPF_LLM_TOOL=codex tpf npm run pmo:doctor
PASS schema fixtures
PASS registry core invariants
PASS graph invariants
PASS hash invariants
PASS redaction invariants
PASS fixture + report smoke

TPF_LLM_TOOL=codex tpf npm run pmo:replay-smoke
PASS replay smoke path

TPF_LLM_TOOL=codex tpf npm run pmo:report-regenerate
PASS report regeneration fixture parity

TPF_LLM_TOOL=codex tpf npm run pmo:adapter-conformance
PASS adapter manifests
PASS health and cursor
PASS redaction and evidence

TPF_LLM_TOOL=codex tpf npm run typecheck
tsc -p tsconfig.json --noEmit

TPF_LLM_TOOL=codex tpf npm test
43 passed, 0 failed, 1 skipped
```

Focused checks also passed:

```text
TPF_LLM_TOOL=codex tpf node --test control-plane/packages/program-manager/tests/program-tools.test.js
8 passed

TPF_LLM_TOOL=codex tpf node --test control-plane/packages/program-manager/tests/program-tool-authz.test.js
3 passed

TPF_LLM_TOOL=codex tpf node --test control-plane/packages/program-manager/tests/program-manager-schemas.test.js
6 passed
```

## Artifact Refs

Pinned deterministic report fixture refs from `control-plane/packages/program-manager/fixtures/pmo-doctor-fixture.example.json`:

- `stateVersionHash`: `sha256:20b80a793608a78b549c9420dbaeef14d77a776621c2d4f1d9224b939f223b60`
- `reportMarkdownRef`: `artifact://pmo/reports/alignment/template%3A%2F%2Fpmo-alignment-report%2Fv1/report@sha256:70f5d65c0db5b1381fb3a6f7524ab074aacee1318f60d68ec60c4191ccdc8357`
- `evidenceEnvelopeRef`: `artifact://pmo/reports/alignment-envelope/template%3A%2F%2Fpmo-alignment-report%2Fv1/evidence-envelope@sha256:abf233c6ca766ebf22e13f5949b5fc706da3d796db2ad6cb44cfb3e19bd8c727`

## Result

Phase 1B acceptance criteria are satisfied. Phase 1C can start from stable context packet, report, audit, adapter-health, evidence-freshness, and operational-check foundations.
