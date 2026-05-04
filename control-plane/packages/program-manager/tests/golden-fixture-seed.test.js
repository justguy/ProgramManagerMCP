import test from "node:test";
import assert from "node:assert/strict";

import { getBackboneRepositoryFixture } from "../src/fixtures/golden-fixture-backbone.js";
import { loadGraphModules } from "./load-graph-modules.js";
import { traversalBudgetDefaults } from "../src/seed/traversal-budgets.js";

function reverse(values) {
  return [...values].slice().reverse();
}

function reverseObjectArray(values) {
  return reverse(values).map((entry) => ({ ...entry }));
}

test("golden fixture import into graph repository is deterministic and complete", async () => {
  const { repositoryModule } = await loadGraphModules();
  const { ProgramManagerGraphRepository } = repositoryModule;

  const fixture = getBackboneRepositoryFixture();

  const repository = new ProgramManagerGraphRepository();
  await repository.seed({
    ...fixture,
    programs: reverseObjectArray(fixture.programs),
    projects: reverseObjectArray(fixture.projects),
    integrationPoints: reverseObjectArray(fixture.integrationPoints),
    contracts: reverseObjectArray(fixture.contracts),
    relationships: reverseObjectArray(fixture.relationships),
    evidenceRefs: reverseObjectArray(fixture.evidenceRefs),
    artifactRefs: reverseObjectArray(fixture.artifactRefs),
    decisions: reverseObjectArray(fixture.decisions),
    syncCursors: reverseObjectArray(fixture.syncCursors)
  });

  const scope = {
    portfolioId: "portfolio://default",
    programId: "program://agentic-os"
  };

  assert.deepEqual(
    (await repository.listPrograms(scope)).map((program) => program.programId),
    ["program://agentic-os"]
  );
  assert.deepEqual(
    (await repository.listProjects(scope)).map((project) => project.projectId),
    [
      "project://guardrail",
      "project://hoplon",
      "project://phalanx",
      "project://program-manager-mcp",
      "project://semantix"
    ]
  );
  assert.deepEqual(
    (await repository.listIntegrationPoints(scope)).map((integrationPoint) => integrationPoint.integrationPointId),
    [
      "integration://guardrail/runtime-controls",
      "integration://hoplon/authz-gateway",
      "integration://phalanx/orchestration",
      "integration://semantix/readiness-spec-flow",
      "integration://tracker/program-state"
    ]
  );
  assert.deepEqual(
    (await repository.listContracts(scope)).map((contract) => contract.contractRef),
    [
      "contract://guardrail/runtime-controls@sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      "contract://hoplon-authz/escalation-grant@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      "contract://semantix/readiness-spec@sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
    ]
  );
  assert.deepEqual(
    (await repository.listRelationships(scope)).map((relationship) => relationship.dependencyId),
    [
      "dep-guardrail-runtime-controls",
      "dep-hoplon-authz",
      "dep-semantix-readiness",
      "dep-tracker-evidence-freshness"
    ]
  );
  assert.deepEqual(
    (await repository.listEvidenceRefs(scope)).map((evidenceRef) => evidenceRef.evidenceRef),
    [
      "artifact://pmo/alignment-report/2026-05-03@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "evidence://guardrail/runtime-controls/missing-current-snapshot",
      "tracker://program-manager-mcp/PMO-001"
    ]
  );
  assert.deepEqual(
    (await repository.listArtifactRefs(scope)).map((artifactRef) => artifactRef.artifactRef),
    [
      "artifact://pmo/alignment-report/2026-05-03@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    ]
  );
  assert.deepEqual(
    (await repository.listDecisions({ scope })).map((decision) => decision.decisionId),
    ["decision://agentic-os/hoplon-authz-tier1-approval"]
  );
  assert.deepEqual(
    (await repository.getSyncCursors({
      portfolioId: "portfolio://default"
    })).map((cursor) => cursor.adapterId),
    ["guardrail-local", "hoplon-local", "tracker-local"]
  );

  const impactTargetRefs = [
    "tracker://program-manager-mcp/PMO-001",
    "contract://hoplon-authz/escalation-grant@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    "contract://guardrail/runtime-controls@sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
  ];
  const impactA = await repository.assessImpact({
    scope,
    changeRef: "project://program-manager-mcp",
    changeKind: "contract_update",
    targetRefs: impactTargetRefs,
    traversalBudgetRef: traversalBudgetDefaults.phase1a
  });
  const impactB = await repository.assessImpact({
    scope,
    changeRef: "project://program-manager-mcp",
    changeKind: "contract_update",
    targetRefs: reverse(impactTargetRefs),
    traversalBudgetRef: traversalBudgetDefaults.default
  });

  assert.deepEqual(impactA, impactB, "traversal input order must be deterministic");
  assert.deepEqual(impactA.affectedRefs, [
    {
      kind: "contract",
      ref: "contract://guardrail/runtime-controls@sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      reason: "REQUIRES_EVIDENCE:dep-guardrail-runtime-controls"
    },
    {
      kind: "tracker",
      ref: "tracker://program-manager-mcp/PMO-001",
      reason: "REQUIRES_EVIDENCE:dep-tracker-evidence-freshness"
    }
  ]);
  assert.deepEqual(
    impactA.findings.map((finding) => finding.findingId),
    [
      "dep-guardrail-runtime-controls",
      "dep-tracker-evidence-freshness"
    ]
  );
  assert.deepEqual(
    impactA.requiredApprovals,
    []
  );
  assert.deepEqual(
    impactA.evidenceObligations,
    [
      {
        policyRef: "dep-guardrail-runtime-controls",
        targetRef: "contract://guardrail/runtime-controls@sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        status: "missing"
      },
      {
        policyRef: "dep-tracker-evidence-freshness",
        targetRef: "tracker://program-manager-mcp/PMO-001",
        status: "stale"
      }
    ]
  );
});
