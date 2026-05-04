import test from "node:test";
import assert from "node:assert/strict";

import {
  generateProgramUpdateResultSchema,
  getProgramAuditTrailResultSchema,
  listProgramCapabilitiesResultSchema,
  planProgramActionResultSchema,
  queryProgramContextResultSchema,
  submitAgenticOsReceiptResultSchema
} from "../../../../shared/schemas/program-manager.ts";
import {
  AdapterRegistry,
  HoplonAdapterStub,
  TrackerAdapterStub
} from "../src/adapters/program-adapter-registry.ts";
import { getBackboneRepositoryFixture } from "../src/fixtures/golden-fixture-backbone.js";
import { ProgramManagerMcpGateway } from "../src/mcp/program-manager-mcp-gateway.ts";
import { InMemoryProgramManagerRepository } from "../src/repository/in-memory-program-manager-repository.ts";
import { ProgramToolService } from "../src/service/program-tool-service.ts";

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

function buildActor(overrides = {}) {
  return {
    actorId: "actor://operators/read-scope",
    actorRole: "human_operator",
    tenantId: "tenant://default",
    portfolioGrants: ["portfolio://default"],
    programGrants: ["program://agentic-os"],
    projectGrants: ["project://phalanx"],
    authnMethod: "oidc_jwt",
    authnIssuer: "issuer://control-plane",
    authenticatedAt: "2026-05-03T11:00:00Z",
    expiresAt: "2026-05-03T13:00:00Z",
    ...overrides
  };
}

test("authz denies cross-portfolio reads with a blocked standard envelope", async () => {
  const gateway = buildGateway();
  const actor = buildActor();

  const result = await gateway.callTool(
    "list_program_capabilities",
    {
      portfolioId: "portfolio://other",
      programId: "program://agentic-os",
      traceId: "trace://cross-portfolio",
      correlationId: "corr://cross-portfolio"
    },
    actor
  );

  assert.deepEqual(listProgramCapabilitiesResultSchema.parse(result), result);
  assert.equal(result.status, "blocked");
  assert.equal(result.warnings[0].warningId, "authz-denied");
  assert.match(result.warnings[0].summary, /Cross-portfolio read denied/);
});

test("authz denies cross-portfolio audit and report reads", async () => {
  const gateway = buildGateway();
  const actor = buildActor();

  const auditResult = await gateway.callTool(
    "get_program_audit_trail",
    {
      portfolioId: "portfolio://other",
      programId: "program://agentic-os",
      traceId: "trace://audit-cross-portfolio",
      correlationId: "corr://audit-cross-portfolio"
    },
    actor
  );
  assert.deepEqual(getProgramAuditTrailResultSchema.parse(auditResult), auditResult);
  assert.equal(auditResult.status, "blocked");
  assert.equal(auditResult.warnings[0].warningId, "authz-denied");

  const reportResult = await gateway.callTool(
    "generate_program_update",
    {
      portfolioId: "portfolio://other",
      programId: "program://agentic-os",
      traceId: "trace://report-cross-portfolio",
      correlationId: "corr://report-cross-portfolio"
    },
    actor
  );
  assert.deepEqual(generateProgramUpdateResultSchema.parse(reportResult), reportResult);
  assert.equal(reportResult.status, "blocked");
  assert.equal(reportResult.warnings[0].warningId, "authz-denied");
});

test("authz denies unauthorized actor scope for project-bearing context reads", async () => {
  const gateway = buildGateway();
  const actor = buildActor({
    actorRole: "execution_agent",
    projectGrants: []
  });

  const result = await gateway.callTool(
    "query_program_context",
    {
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      queryKind: "program_summary",
      targetRefs: ["tracker://program-manager-mcp/PMO-001"],
      traceId: "trace://unauthorized-scope",
      correlationId: "corr://unauthorized-scope"
    },
    actor
  );

  assert.deepEqual(queryProgramContextResultSchema.parse(result), result);
  assert.equal(result.status, "blocked");
  assert.match(result.warnings[0].summary, /explicit assigned project scope/);

  const planResult = await gateway.callTool(
    "plan_program_action",
    {
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      traversalBudgetRef: "budget://phase-2/default",
      proposedChange: {
        changeType: "tracker_update",
        summary: "Attempt unauthorized tracker proposal planning.",
        targetRefs: ["tracker://program-manager-mcp/PMO-001"]
      },
      traceId: "trace://unauthorized-plan-scope",
      correlationId: "corr://unauthorized-plan-scope"
    },
    actor
  );

  assert.deepEqual(planProgramActionResultSchema.parse(planResult), planResult);
  assert.equal(planResult.status, "blocked");
  assert.match(planResult.warnings[0].summary, /explicit assigned project scope/);
});

test("authz denies Agentic OS receipt submission for mismatched execution actor", async () => {
  const gateway = buildGateway();
  const actor = buildActor({
    actorId: "actor://agents/executor-a",
    actorRole: "execution_agent",
    projectGrants: ["project://program-manager-mcp"]
  });

  const result = await gateway.callTool(
    "submit_agentic_os_receipt",
    {
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      agenticOsRunRef: "run://agentic-os/mismatch",
      executionAgentRef: "actor://agents/executor-b",
      governance: {
        trustRootRef: "trust-root://control-plane/oidc-jwt",
        retentionPolicyRef: "policy://retention/pmo-phase-4-default"
      },
      flightPlanHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      flightPlanId: "flightplan://program-action/mismatch",
      flightPlanStateVersionHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      idempotencyKey: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      observedAt: "2026-05-03T12:09:00Z",
      proposedActionId: "action://program-action/mismatch",
      receiptRequirementId: "receipt://program-action/mismatch",
      receiptType: "tracker_update_receipt",
      evidenceRefs: ["evidence://receipt/required"],
      observedStateRefs: ["tracker://program-manager-mcp/PMO-502"],
      receiptDigest: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      summary: "Wrong execution actor should be blocked before receipt validation.",
      verificationMethod: "adapter_observed_state",
      traceId: "trace://agentic-os-mismatch",
      correlationId: "corr://agentic-os-mismatch"
    },
    actor
  );

  assert.deepEqual(submitAgenticOsReceiptResultSchema.parse(result), result);
  assert.equal(result.status, "blocked");
  assert.equal(result.warnings[0].warningId, "agentic-os-execution-agent-mismatch");
  assert.equal(result.deterministicCore.validation.passiveBoundaryPreserved, true);
});
