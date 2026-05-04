import assert from "node:assert/strict";

import { generateProgramUpdateResultSchema } from "../../../../shared/schemas/program-manager.ts";
import { AdapterRegistry } from "../src/adapters/program-adapter-registry.ts";
import { InMemoryProgramManagerRepository } from "../src/repository/in-memory-program-manager-repository.ts";
import { ProgramManagerMcpGateway } from "../src/mcp/program-manager-mcp-gateway.ts";
import { ProgramToolService } from "../src/service/program-tool-service.ts";
import { getBackboneRepositoryFixture } from "../src/fixtures/golden-fixture-backbone.js";
import {
  buildActor,
  loadFixtureJSON,
  runChecks
} from "./pmo-check-common.mjs";

function sortUnique(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function buildRegenerationGateway() {
  const repository = InMemoryProgramManagerRepository.fromFixture(getBackboneRepositoryFixture());
  const adapterRegistry = new AdapterRegistry();
  const service = new ProgramToolService({
    repository,
    adapterRegistry,
    now: () => "2026-05-03T12:00:00Z"
  });

  return {
    gateway: new ProgramManagerMcpGateway(service),
    registry: adapterRegistry
  };
}

async function checkReportRegenerationFixtureMatch() {
  const fixture = await loadFixtureJSON("../fixtures/pmo-doctor-fixture.example.json");
  const { gateway } = buildRegenerationGateway();
  const actor = buildActor();

  const reportRequest = {
    portfolioId: fixture.requestContext.portfolioId,
    programId: fixture.requestContext.programId,
    reportAudience: fixture.requestContext.reportAudience,
    contextAnchor: fixture.requestContext.contextAnchor,
    traceId: "trace://report-regeneration",
    correlationId: "corr://report-regeneration"
  };
  const first = generateProgramUpdateResultSchema.parse(
    await gateway.callTool("generate_program_update", reportRequest, actor)
  );
  const second = generateProgramUpdateResultSchema.parse(
    await gateway.callTool(
      "generate_program_update",
      {
        ...reportRequest,
        traceId: "trace://report-regeneration-2",
        correlationId: "corr://report-regeneration-2"
      },
      actor
    )
  );

  assert.equal(first.status, "ok");
  assert.equal(second.status, "ok");
  assert.equal(first.stateVersionHash, second.stateVersionHash, "report generation must be deterministic");
  assert.deepEqual(
    first.stateVersionHash,
    fixture.report.stateVersionHash,
    "regenerated report hash should match fixture pin"
  );
  assert.equal(
    first.deterministicCore.evidenceEnvelopeRef,
    second.deterministicCore.evidenceEnvelopeRef,
    "envelope ref should stabilize across regenerations"
  );
  assert.equal(
    first.deterministicCore.reportMarkdownRef,
    second.deterministicCore.reportMarkdownRef,
    "report markdown ref should stabilize across regenerations"
  );
  assert.equal(first.deterministicCore.evidenceEnvelopeRef, fixture.report.evidenceEnvelopeRef);
  assert.equal(first.deterministicCore.reportMarkdownRef, fixture.report.reportMarkdownRef);

  assert.deepEqual(sortUnique(first.deterministicCore.sectionRefs), sortUnique(fixture.report.sectionRefs));
  assert.deepEqual(sortUnique(first.evidenceRefs), sortUnique(fixture.report.evidenceRefs));
  assert.deepEqual(sortUnique(first.artifactRefs), sortUnique(fixture.report.artifactRefs));
  assert.deepEqual(sortUnique(first.deterministicCore.inputRefs), sortUnique(fixture.report.inputRefs));
  assert.deepEqual(
    first.deterministicCore.sections.map((section) => section.sectionId),
    fixture.report.sectionIds,
    "section ids should align with fixture"
  );
  assert.deepEqual(first.artifactRefs.length, second.artifactRefs.length);
  assert.deepEqual(first.evidenceRefs.length, second.evidenceRefs.length);
  assert.deepEqual(
    sortUnique(first.deterministicCore.sectionRefs),
    sortUnique(second.deterministicCore.sectionRefs)
  );
}

const checks = [
  ["report regeneration fixture parity", checkReportRegenerationFixtureMatch]
];

const outcome = await runChecks(checks);
if (outcome.failed > 0) {
  process.exitCode = 1;
}
