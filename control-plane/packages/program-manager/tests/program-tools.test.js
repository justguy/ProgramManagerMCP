import test from "node:test";
import assert from "node:assert/strict";

import {
  assessProgramImpactResultSchema,
  getProgramDocumentationResultSchema,
  listProgramCapabilitiesResultSchema,
  queryProgramContextResultSchema
} from "../../../../shared/schemas/program-manager.ts";
import {
  AdapterRegistry,
  HoplonAdapterStub,
  TrackerAdapterStub
} from "../src/adapters/program-adapter-registry.ts";
import { ProgramManagerMcpGateway } from "../src/mcp/program-manager-mcp-gateway.ts";
import { InMemoryProgramManagerRepository } from "../src/repository/in-memory-program-manager-repository.ts";
import { ProgramToolService } from "../src/service/program-tool-service.ts";
import { getBackboneRepositoryFixture } from "../src/fixtures/golden-fixture-backbone.js";

function buildActor(overrides = {}) {
  return {
    actorId: "actor://operators/portfolio-reader",
    actorRole: "human_operator",
    tenantId: "tenant://default",
    portfolioGrants: ["portfolio://default"],
    programGrants: ["program://agentic-os"],
    projectGrants: [
      "project://guardrail",
      "project://hoplon",
      "project://phalanx",
      "project://program-manager-mcp",
      "project://semantix"
    ],
    authnMethod: "oidc_jwt",
    authnIssuer: "issuer://control-plane",
    authenticatedAt: "2026-05-03T11:00:00Z",
    expiresAt: "2026-05-03T13:00:00Z",
    ...overrides
  };
}

function buildGateway() {
  const repository = InMemoryProgramManagerRepository.fromFixture(getBackboneRepositoryFixture());
  const adapterRegistry = new AdapterRegistry([new HoplonAdapterStub(), new TrackerAdapterStub()]);
  const service = new ProgramToolService({
    repository,
    adapterRegistry,
    now: () => "2026-05-03T12:00:00Z"
  });

  return new ProgramManagerMcpGateway(service);
}

test("gateway lists the four public Phase 1A MCP tools", () => {
  const gateway = buildGateway();

  assert.deepEqual(
    gateway.listTools().map((tool) => tool.name),
    [
      "list_program_capabilities",
      "get_program_documentation",
      "query_program_context",
      "assess_program_impact"
    ]
  );
});

test("all Phase 1A tools return parseable standard envelopes with provenance context", async () => {
  const gateway = buildGateway();
  const actor = buildActor();

  const capabilityResult = await gateway.callTool(
    "list_program_capabilities",
    {
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      traceId: "trace://capabilities",
      correlationId: "corr://capabilities",
      includeAdapters: true
    },
    actor
  );
  assert.deepEqual(listProgramCapabilitiesResultSchema.parse(capabilityResult), capabilityResult);
  assert.equal(capabilityResult.toolName, "list_program_capabilities");
  assert.ok(capabilityResult.stateVersionHash.startsWith("sha256:"));
  assert.ok(capabilityResult.evidenceRefs.length > 0);
  assert.ok(capabilityResult.artifactRefs.some((ref) => ref.startsWith("cursor://")));

  const documentationResult = await gateway.callTool(
    "get_program_documentation",
    {
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      topic: "tool_contracts",
      traceId: "trace://docs",
      correlationId: "corr://docs"
    },
    actor
  );
  assert.deepEqual(
    getProgramDocumentationResultSchema.parse(documentationResult),
    documentationResult
  );
  assert.equal(documentationResult.redactionSummary.redacted, true);
  assert.ok(documentationResult.redactionSummary.omittedKinds.includes("content_body"));
  assert.ok(
    documentationResult.deterministicCore.sections.some((section) =>
      section.artifactRefs.includes(
        "artifact://docs/phase-0/public-pmo-tool-contracts-and-result-envelope.md"
      )
    )
  );

  const contextResult = await gateway.callTool(
    "query_program_context",
    {
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      queryKind: "program_summary",
      targetRefs: [
        "project://phalanx",
        "tracker://program-manager-mcp/PMO-001"
      ],
      limit: 4,
      traceId: "trace://context",
      correlationId: "corr://context"
    },
    actor
  );
  assert.deepEqual(queryProgramContextResultSchema.parse(contextResult), contextResult);
  assert.equal(contextResult.toolName, "query_program_context");
  assert.ok(contextResult.deterministicCore.matchedRefs.length > 0);
  assert.ok(contextResult.evidenceRefs.length > 0);
  assert.ok(contextResult.artifactRefs.some((ref) => ref.startsWith("cursor://")));

  const impactResult = await gateway.callTool(
    "assess_program_impact",
    {
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      changeRef: "change://program-manager-mcp/c0-hoplon-authz-contract-update",
      changeKind: "contract_update",
      targetRefs: [
        "contract://hoplon-authz/escalation-grant@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        "tracker://program-manager-mcp/PMO-001"
      ],
      traversalBudgetRef: "budget://phase-1a/default",
      traceId: "trace://impact",
      correlationId: "corr://impact"
    },
    actor
  );
  assert.deepEqual(assessProgramImpactResultSchema.parse(impactResult), impactResult);
  assert.equal(impactResult.toolName, "assess_program_impact");
  assert.ok(impactResult.deterministicCore.requiredApprovals.length > 0);
  assert.ok(impactResult.deterministicCore.findings.length > 0);
  assert.ok(impactResult.evidenceRefs.length > 0);
  assert.ok(impactResult.artifactRefs.some((ref) => ref.startsWith("cursor://")));
});
