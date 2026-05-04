import test from "node:test";
import assert from "node:assert/strict";
import {
  goldenFixtureBackboneSchema
} from "../../../../shared/schemas/program-manager.ts";
import {
  getBackboneRepositoryFixture,
  getGoldenFixture,
  getOrderedGoldenFixture
} from "../src/fixtures/golden-fixture-backbone.js";
import { InMemoryProgramManagerRepository } from "../src/repository/in-memory-program-manager-repository.ts";

function affectedKindsForSort(left, right) {
  return left.kind.localeCompare(right.kind) || left.ref.localeCompare(right.ref);
}

test("parses local package golden fixture backbone", () => {
  const fixture = getGoldenFixture();
  assert.deepEqual(goldenFixtureBackboneSchema.parse(fixture), fixture);
});

test("loads golden fixture deterministically ordered", () => {
  const fixture = getGoldenFixture();
  const ordered = getOrderedGoldenFixture();

  assert.deepEqual(
    ordered.G0.projects.map((item) => item.projectId),
    [...fixture.G0.projects].map((item) => item.projectId).sort(),
    "projectId order must be deterministic"
  );
  assert.deepEqual(
    ordered.G0.contracts.map((item) => item.contractRef),
    [...fixture.G0.contracts].map((item) => item.contractRef).sort(),
    "contractRef order must be deterministic"
  );
  assert.deepEqual(
    ordered.G0.integrationPoints.map((item) => item.integrationPointId),
    [...fixture.G0.integrationPoints].map((item) => item.integrationPointId).sort(),
    "integrationPoint order must be deterministic"
  );
  assert.deepEqual(
    ordered.G0.dependencyRelationships.map((item) => item.dependencyId),
    [...fixture.G0.dependencyRelationships].map((item) => item.dependencyId).sort(),
    "dependency relationship order must be deterministic"
  );
  assert.deepEqual(
    ordered.G0.evidenceRefs,
    [...fixture.G0.evidenceRefs].sort(),
    "evidenceRef order must be deterministic"
  );
  assert.deepEqual(
    ordered.A0.affectedRefs,
    [...fixture.A0.affectedRefs].sort(affectedKindsForSort),
    "A0 affectedRef order must be deterministic"
  );
  assert.deepEqual(
    ordered.F0.findings,
    [...fixture.F0.findings].sort((left, right) => {
      const severityRank = {
        critical: 0,
        high: 1,
        medium: 2,
        low: 3
      };
      return (severityRank[left.severity] ?? Number.MAX_SAFE_INTEGER)
        - (severityRank[right.severity] ?? Number.MAX_SAFE_INTEGER)
        || left.findingId.localeCompare(right.findingId);
    }),
    "F0 finding order must be deterministic"
  );
});

test("G0 includes required Hoplon/Phalanx/Semantix/Guardrail/Program Manager MCP assets and contracts", () => {
  const fixture = getGoldenFixture();
  const projectIds = fixture.G0.projects.map((item) => item.projectId).sort();

  assert.ok(projectIds.includes("project://program-manager-mcp"), "includes Program Manager MCP project");
  assert.ok(projectIds.includes("project://program-manager-mcp"), "includes Program Manager MCP project");
  assert.ok(projectIds.includes("project://hoplon"), "includes Hoplon project");
  assert.ok(projectIds.includes("project://phalanx"), "includes Phalanx project");
  assert.ok(projectIds.includes("project://semantix"), "includes Semantix project");
  assert.ok(projectIds.includes("project://guardrail"), "includes Guardrail project");
  assert.deepEqual(
    fixture.G0.contracts.map((item) => item.contractRef),
    fixture.G0.contracts.map((item) => item.contractRef).sort(),
    "contract refs should already be deterministic"
  );
  assert.deepEqual(
    fixture.G0.integrationPoints.map((item) => item.integrationPointId),
    fixture.G0.integrationPoints.map((item) => item.integrationPointId).sort(),
    "integration point ids should already be deterministic"
  );
  assert.ok(fixture.G0.decisionRefs.length >= 1, "G0 has decision refs");
  assert.ok(fixture.G0.evidenceRefs.length >= 2, "G0 has evidence refs and tracker refs");
});

test("A0 and C0 are exact and complete for the expected impact surface", () => {
  const fixture = getGoldenFixture();

  assert.deepEqual(fixture.C0.targetRefs.sort(), [
    "contract://hoplon-authz/escalation-grant@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    "tracker://program-manager-mcp/PMO-001"
  ]);

  assert.deepEqual(
    fixture.A0.affectedRefs.map((item) => `${item.kind}:${item.ref}`).sort(),
    [
      "contract:contract://hoplon-authz/escalation-grant@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      "evidence:tracker://program-manager-mcp/PMO-001",
      "integration_point:integration://hoplon/authz-gateway",
      "policy:policy://active-adapters/hoplon-authz-tier1",
      "policy:policy://evidence/tracker-snapshot-fast-expiry",
      "project:project://phalanx",
      "project:project://program-manager-mcp",
      "tracker_task:tracker://program-manager-mcp/PMO-001"
    ]
  );

  const kinds = new Set(fixture.A0.affectedRefs.map((item) => item.kind));
  assert.ok(kinds.has("contract"), "affected contracts included");
  assert.ok(kinds.has("integration_point"), "affected integration points included");
  assert.ok(kinds.has("tracker_task"), "affected tracker tasks included");
  assert.ok(kinds.has("project"), "affected projects included");
  assert.ok(kinds.has("policy"), "affected policies included");
  assert.ok(kinds.has("evidence"), "affected evidence refs included");
});

test("F0 includes cross-project dependency plus stale and missing evidence findings", () => {
  const fixture = getGoldenFixture();

  const findingTypes = new Set(fixture.F0.findings.map((finding) => finding.type));
  assert.ok(findingTypes.has("cross_project_dependency"), "contains cross-project dependency finding");
  assert.ok(findingTypes.has("stale_evidence"), "contains stale evidence finding");
  assert.ok(findingTypes.has("missing_evidence"), "contains missing evidence finding");

  const hasCrossProjectDependency = fixture.F0.findings.some((finding) =>
    finding.type === "cross_project_dependency" &&
    finding.evidenceRefs[0] === "artifact://pmo/alignment-report/2026-05-03@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  );
  assert.ok(hasCrossProjectDependency, "cross-project finding targets expected evidence pointer");

  const stale = fixture.F0.findings.find((finding) => finding.type === "stale_evidence");
  assert.ok(
    stale?.severity === "high" && stale?.evidenceRefs[0]?.startsWith("tracker://"),
    "stale finding is high severity tracker evidence"
  );
});

test("repository seed built from backbone is deterministic and reusable", async () => {
  const backbone = getGoldenFixture();
  const repo = InMemoryProgramManagerRepository.fromFixture(getBackboneRepositoryFixture());

  const scope = {
    portfolioId: "portfolio://default",
    programId: backbone.G0.programs[0].programId
  };

  const programs = await repo.listPrograms(scope);
  const projects = await repo.listProjects(scope);
  const relationships = await repo.listRelationships(scope);
  const evidenceRefs = await repo.listEvidenceRefs(scope);
  const impact = await repo.assessImpact({
    scope,
    changeRef: backbone.C0.changeId,
    changeKind: backbone.C0.changeKind,
    targetRefs: backbone.C0.targetRefs,
    traversalBudgetRef: "snapshot:v1"
  });

  assert.deepEqual(
    projects.map((project) => project.projectId),
    [...backbone.G0.projects.map((project) => project.projectId)].sort(),
    "projects are deterministic"
  );
  assert.equal(relationships.length, backbone.G0.dependencyRelationships.length);
  assert.ok(
    relationships.some(
      (relationship) =>
        relationship.fromRef === "project://phalanx" &&
        relationship.toRef === "contract://hoplon-authz/escalation-grant@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    ),
    "cross-project dependency retained in repository seed"
  );
  assert.equal(programs.length, backbone.G0.programs.length, "all programs loaded");
  assert.ok(projects.some((project) => project.projectId === "project://program-manager-mcp"), "Program Manager MCP project in repository");
  assert.ok(projects.some((project) => project.projectId === "project://program-manager-mcp"), "Program Manager MCP project in repository");
  assert.equal(evidenceRefs.length, backbone.G0.evidenceRefs.length, "all evidence refs loaded");
  assert.equal(impact.findings.length, backbone.F0.findings.length, "impact findings mirror F0");
  assert.equal(impact.requiredApprovals.length, 1, "impact includes deterministic required approvals");
});

test("report and intelligence fixture sections are anchored", () => {
  const backbone = getGoldenFixture();

  assert.equal(
    backbone.H0.hashInputRef,
    "docs/phase-0/fixtures/state-version-hash-input.example.json"
  );
  assert.ok(backbone.H0.expectedStateVersionHash.startsWith("sha256:"), "state version hash is pinned");

  const intelFindingTypes = new Set(backbone.I0.findings.map((item) => item.type));
  assert.ok(intelFindingTypes.has("stale_evidence"), "intelligence includes stale evidence");
  assert.ok(intelFindingTypes.has("missing_evidence"), "intelligence includes missing evidence");
});
