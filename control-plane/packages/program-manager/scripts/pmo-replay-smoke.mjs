import assert from "node:assert/strict";

import {
  assessProgramImpactResultSchema,
  generateProgramUpdateResultSchema,
  queryProgramContextResultSchema
} from "../../../../shared/schemas/program-manager.ts";
import { ProgramToolService } from "../src/service/program-tool-service.ts";
import { ProgramManagerMcpGateway } from "../src/mcp/program-manager-mcp-gateway.ts";
import { AdapterRegistry } from "../src/adapters/program-adapter-registry.ts";
import { InMemoryProgramManagerRepository } from "../src/repository/in-memory-program-manager-repository.ts";
import { getBackboneRepositoryFixture } from "../src/fixtures/golden-fixture-backbone.js";
import {
  buildActor,
  runChecks,
  loadFixtureJSON
} from "./pmo-check-common.mjs";

function sortUnique(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function buildReplayGateway() {
  const repository = InMemoryProgramManagerRepository.fromFixture(getBackboneRepositoryFixture());
  const adapterRegistry = new AdapterRegistry();
  const service = new ProgramToolService({
    repository,
    adapterRegistry,
    now: () => "2026-05-03T12:00:00Z"
  });
  return new ProgramManagerMcpGateway(service);
}

async function checkReplaySmokePath() {
  const fixture = await loadFixtureJSON("../fixtures/pmo-doctor-fixture.example.json");
  const gateway = buildReplayGateway();
  const actor = buildActor();

  const queryRequest = {
    portfolioId: fixture.requestContext.portfolioId,
    programId: fixture.requestContext.programId,
    queryKind: fixture.replay.query.queryKind,
    targetRefs: fixture.replay.query.targetRefs,
    limit: 20,
    traceId: "trace://pmo-replay-query",
    correlationId: "corr://pmo-replay-query"
  };
  const impactRequest = {
    portfolioId: fixture.requestContext.portfolioId,
    programId: fixture.requestContext.programId,
    changeRef: fixture.replay.impact.changeRef,
    changeKind: fixture.replay.impact.changeKind,
    targetRefs: fixture.replay.impact.targetRefs,
    traversalBudgetRef: fixture.replay.impact.traversalBudgetRef,
    traceId: "trace://pmo-replay-impact",
    correlationId: "corr://pmo-replay-impact"
  };
  const generateRequest = {
    portfolioId: fixture.requestContext.portfolioId,
    programId: fixture.requestContext.programId,
    reportAudience: fixture.requestContext.reportAudience,
    contextAnchor: fixture.requestContext.contextAnchor,
    traceId: "trace://pmo-replay-report",
    correlationId: "corr://pmo-replay-report"
  };

  const queryResult = queryProgramContextResultSchema.parse(
    await gateway.callTool("query_program_context", queryRequest, actor)
  );
  const impactResult = assessProgramImpactResultSchema.parse(
    await gateway.callTool("assess_program_impact", impactRequest, actor)
  );
  const reportResult = generateProgramUpdateResultSchema.parse(
    await gateway.callTool("generate_program_update", generateRequest, actor)
  );

  assert.ok(queryResult.deterministicCore.matchedRefs.length > 0);
  assert.ok(
    queryResult.deterministicCore.matchedRefs.some((match) =>
      fixture.replay.query.targetRefs.includes(match.ref)
    )
  );
  assert.ok(impactResult.deterministicCore.affectedRefs.length >= 1, "impact replay should project affected refs");
  assert.equal(queryResult.status !== "blocked", true);
  assert.equal(reportResult.status, "ok");

  assert.equal(
    reportResult.stateVersionHash,
    fixture.report.stateVersionHash,
    "report state version must match deterministic replay fixture hash"
  );
  assert.equal(
    reportResult.deterministicCore.evidenceEnvelopeRef,
    fixture.report.evidenceEnvelopeRef,
    "evidence envelope reference must be deterministic"
  );
  assert.equal(
    reportResult.deterministicCore.reportMarkdownRef,
    fixture.report.reportMarkdownRef,
    "report markdown reference must be deterministic"
  );
  assert.deepEqual(
    sortUnique(fixture.report.inputRefs),
    sortUnique(reportResult.deterministicCore.inputRefs),
    "report inputRefs must match replay fixture inputs"
  );
  assert.deepEqual(
    sortUnique(fixture.report.sectionRefs),
    sortUnique(reportResult.deterministicCore.sectionRefs),
    "section IDs should match fixture section order"
  );

  const queryReplayResult = queryProgramContextResultSchema.parse(
    await gateway.callTool("query_program_context", {
      ...queryRequest,
      traceId: "trace://pmo-replay-query-2",
      correlationId: "corr://pmo-replay-query-2"
    }, actor)
  );
  const impactReplayResult = assessProgramImpactResultSchema.parse(
    await gateway.callTool("assess_program_impact", {
      ...impactRequest,
      traceId: "trace://pmo-replay-impact-2",
      correlationId: "corr://pmo-replay-impact-2"
    }, actor)
  );
  const reportReplayResult = generateProgramUpdateResultSchema.parse(
    await gateway.callTool("generate_program_update", {
      ...generateRequest,
      traceId: "trace://pmo-replay-report-2",
      correlationId: "corr://pmo-replay-report-2"
    }, actor)
  );

  assert.equal(queryResult.stateVersionHash, queryReplayResult.stateVersionHash);
  assert.equal(impactResult.stateVersionHash, impactReplayResult.stateVersionHash);
  assert.equal(reportResult.stateVersionHash, reportReplayResult.stateVersionHash);
  assert.equal(queryResult.deterministicCore.matchedRefs.length, queryReplayResult.deterministicCore.matchedRefs.length);
  assert.equal(
    reportResult.deterministicCore.sectionRefs.length,
    reportReplayResult.deterministicCore.sectionRefs.length
  );
}

const checks = [
  ["replay smoke path", checkReplaySmokePath]
];

const outcome = await runChecks(checks);
if (outcome.failed > 0) {
  process.exitCode = 1;
}
