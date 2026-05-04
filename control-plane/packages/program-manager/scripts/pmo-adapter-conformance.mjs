import assert from "node:assert/strict";

import {
  adapterManifestSchema,
  queryProgramContextResultSchema
} from "../../../../shared/schemas/program-manager.ts";
import {
  AdapterRegistry,
  HoplonAdapterStub,
  TrackerAdapterStub
} from "../src/adapters/program-adapter-registry.ts";
import { InMemoryProgramManagerRepository } from "../src/repository/in-memory-program-manager-repository.ts";
import { ProgramManagerMcpGateway } from "../src/mcp/program-manager-mcp-gateway.ts";
import { ProgramToolService } from "../src/service/program-tool-service.ts";
import { getBackboneRepositoryFixture } from "../src/fixtures/golden-fixture-backbone.js";
import { DEFAULT_NOW, buildActor, runChecks } from "./pmo-check-common.mjs";

function sortUnique(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function buildConformanceGateway() {
  const repository = InMemoryProgramManagerRepository.fromFixture(getBackboneRepositoryFixture());
  const adapterRegistry = new AdapterRegistry([new HoplonAdapterStub(), new TrackerAdapterStub()]);
  const service = new ProgramToolService({
    repository,
    adapterRegistry,
    now: () => DEFAULT_NOW
  });
  return {
    gateway: new ProgramManagerMcpGateway(service),
    adapterRegistry
  };
}

function buildExpectedStatuses(manifest) {
  return new Set(manifest.healthModel.statuses ?? []);
}

async function checkAdapterManifests() {
  const { adapterRegistry } = buildConformanceGateway();
  const manifests = adapterRegistry.listManifests();

  assert.equal(manifests.length, 2, "expected hoplon and tracker stubs only");
  const manifestIds = manifests.map((item) => item.adapterId).sort();
  assert.deepEqual(manifestIds, ["hoplon-local", "tracker-local"]);

  for (const manifest of manifests) {
    adapterManifestSchema.parse(manifest);
    assert.equal(manifest.phase1aEnabled, true, `${manifest.adapterId} must remain phase1a enabled`);
    assert.equal(manifest.methods.reconcileState, false, `${manifest.adapterId} must not expose mutation authority`);
    assert.equal(manifest.methods.readState, true, `${manifest.adapterId} readState must be present`);
    assert.equal(manifest.methods.getHealth, true, `${manifest.adapterId} getHealth must be present`);
    assert.ok(buildExpectedStatuses(manifest).has("healthy"), `${manifest.adapterId} health set must include healthy`);
  }

  await adapterRegistry.assertNoMutationAuthority();
}

async function checkHealthAndCursorConformance() {
  const { adapterRegistry } = buildConformanceGateway();
  const manifests = adapterRegistry.listManifests();
  const scope = { portfolioId: "portfolio://default", programId: "program://agentic-os" };
  const now = "2026-05-03T12:00:00Z";
  const staleNow = "2026-05-03T13:00:00Z";

  for (const manifest of manifests) {
    const health = await adapterRegistry.getHealth(manifest.adapterId, scope, now);
    const staleHealth = await adapterRegistry.getHealth(manifest.adapterId, scope, staleNow);
    const cursor = await adapterRegistry.getSourceCursor(manifest.adapterId, scope);
    const staleCursor = await adapterRegistry.getSourceCursor(manifest.adapterId, scope, staleNow);

    assert.equal(health.adapterId, manifest.adapterId);
    assert.equal(staleHealth.adapterId, manifest.adapterId);
    assert.ok(staleCursor.status === "current" || staleCursor.status === "stale", `${manifest.adapterId} source cursor status should be bounded`);
    assert.ok(staleCursor.sourceRevisionHash.startsWith("sha256:"));
    assert.ok(staleCursor.cursor.length > 0);
    assert.ok(cursor.sourceRevisionHash.startsWith("sha256:"));
    assert.ok(buildExpectedStatuses(manifest).has(health.status));
    assert.ok(buildExpectedStatuses(manifest).has(staleHealth.status));
    assert.ok(health.reasons.length >= 0);
  }
}

async function checkRedactionEvidenceAndNoMutation() {
  const { gateway, adapterRegistry } = buildConformanceGateway();
  const actor = buildActor();

  const queryResult = queryProgramContextResultSchema.parse(
    await gateway.callTool(
      "query_program_context",
      {
        portfolioId: "portfolio://default",
        programId: "program://agentic-os",
        queryKind: "program_summary",
        targetRefs: ["project://phalanx", "tracker://program-manager-mcp/PMO-001"],
        traceId: "trace://adapter-conformance-query",
        correlationId: "corr://adapter-conformance-query"
      },
      actor
    )
  );

  assert.equal(queryResult.status !== "blocked", true);
  assert.ok(queryResult.redactionSummary.policyRefs.includes("policy://redaction/pointer-only-v1"));
  assert.deepEqual(queryResult.evidenceRefs, sortUnique(queryResult.evidenceRefs));
  assert.deepEqual(queryResult.artifactRefs, sortUnique(queryResult.artifactRefs));

  const manifests = adapterRegistry.listManifests();
  const now = DEFAULT_NOW;
  for (const manifest of manifests) {
    const read = await adapterRegistry.readState(
      manifest.adapterId,
      {
        requestId: `conformance-read-${manifest.adapterId}`,
        portfolioId: "portfolio://default",
        programId: "program://agentic-os",
        targetRefs: ["project://phalanx", "tracker://program-manager-mcp/PMO-001"],
        limit: 10
      },
      now
    );
    const impact = await adapterRegistry.assessImpact(
      manifest.adapterId,
      {
        requestId: `conformance-impact-${manifest.adapterId}`,
        portfolioId: "portfolio://default",
        programId: "program://agentic-os",
        changeRef: "change://program-manager-mcp/c0-hoplon-authz-contract-update",
        changeKind: "contract_update",
        targetRefs: ["contract://hoplon-authz/escalation-grant@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc", "tracker://program-manager-mcp/PMO-001"],
        traversalBudgetRef: "budget://phase-1a/default"
      },
      now
    );

    assert.equal(read.redactionSummary.redacted, true);
    assert.equal(read.redactionSummary.policyRefs.includes("policy://redaction/pointer-only-v1"), true);
    assert.ok(read.evidenceRefs.every((ref) => ref.startsWith("tracker://") || ref.startsWith("artifact://")));
    assert.equal(impact.redactionSummary.redacted, true);
    assert.equal(impact.redactionSummary.policyRefs.includes("policy://redaction/pointer-only-v1"), true);
    assert.equal(impact.requestId, `conformance-impact-${manifest.adapterId}`);
    assert.ok(impact.findings.length > 0 || impact.affectedRefs.length > 0);
  }
}

const checks = [
  ["adapter manifests", checkAdapterManifests],
  ["health and cursor", checkHealthAndCursorConformance],
  ["redaction and evidence", checkRedactionEvidenceAndNoMutation]
];

const outcome = await runChecks(checks);
if (outcome.failed > 0) {
  process.exitCode = 1;
}
