import assert from "node:assert/strict";

import { submitAgenticOsReceiptResultSchema } from "../../../../shared/schemas/program-manager.ts";
import { AdapterRegistry } from "../src/adapters/program-adapter-registry.ts";
import { getBackboneRepositoryFixture } from "../src/fixtures/golden-fixture-backbone.js";
import { stateVersionHashFromInput } from "../src/hash/state-version-hash.js";
import { ProgramManagerMcpGateway } from "../src/mcp/program-manager-mcp-gateway.ts";
import { InMemoryProgramManagerRepository } from "../src/repository/in-memory-program-manager-repository.ts";
import { ProgramToolService } from "../src/service/program-tool-service.ts";
import { buildToolSpan, newTraceId, summarizeTelemetryEvidence } from "./pmo-otel-telemetry.mjs";
import { DEFAULT_NOW, buildActor, runChecks } from "./pmo-check-common.mjs";

function buildPhase4Gateway() {
  const repository = InMemoryProgramManagerRepository.fromFixture(getBackboneRepositoryFixture());
  const service = new ProgramToolService({
    repository,
    adapterRegistry: new AdapterRegistry(),
    now: () => DEFAULT_NOW
  });

  return {
    gateway: new ProgramManagerMcpGateway(service),
    repository
  };
}

function receiptDigestForRequest(request) {
  return stateVersionHashFromInput({
    evidenceRefs: request.evidenceRefs,
    flightPlanHash: request.flightPlanHash,
    flightPlanId: request.flightPlanId,
    observedAt: request.observedAt,
    observedStateRefs: request.observedStateRefs,
    proposedActionId: request.proposedActionId,
    receiptRequirementId: request.receiptRequirementId,
    receiptType: request.receiptType
  });
}

async function callWithSpan({ gateway, actor, spans, traceId, toolName, request }) {
  const started = Date.now();
  const response = await gateway.callTool(toolName, request, actor);
  const ended = Date.now();
  spans.push(
    buildToolSpan({
      name: `pmo.phase4.${toolName}`,
      traceId,
      correlationId: request.correlationId,
      startAtMs: started,
      endAtMs: ended,
      request,
      response,
      status: response.status,
      attributes: {
        tool: toolName
      }
    })
  );
  return response;
}

async function checkPhase4EndToEndSmoke() {
  const { gateway, repository } = buildPhase4Gateway();
  const traceId = newTraceId("pmo-phase4-smoke");
  const spans = [];
  const operator = buildActor();
  const executor = buildActor({
    actorId: "actor://agents/phase4-executor",
    actorRole: "execution_agent",
    projectGrants: ["project://program-manager-mcp"]
  });
  const governance = {
    trustRootRef: "trust-root://control-plane/oidc-jwt",
    retentionPolicyRef: "policy://retention/pmo-phase-4-default",
    piiHandlingPolicyRefs: ["policy://pii/no-inline-sensitive-data"]
  };
  const contextPacket = await callWithSpan({
    gateway,
    actor: operator,
    spans,
    traceId,
    toolName: "get_agentic_os_context_packet",
    request: {
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      workContextRef: "work://agentic-os/phase-4-smoke",
      agenticOsRunRef: "run://agentic-os/phase-4-smoke",
      governance,
      targetRefs: ["tracker://program-manager-mcp/PMO-001"],
      traversalBudgetRef: "budget://phase-4/agentic-os",
      proposedChange: {
        changeType: "tracker_update",
        summary: "Simulated execution agent updates tracker evidence outside PMO.",
        targetRefs: ["tracker://program-manager-mcp/PMO-001"]
      },
      traceId,
      correlationId: "corr://phase4/context",
      contextAnchor: {
        portfolioId: "portfolio://default",
        programId: "program://agentic-os",
        projectId: "project://program-manager-mcp",
        asOf: DEFAULT_NOW
      }
    }
  });

  assert.equal(contextPacket.toolName, "get_agentic_os_context_packet");
  assert.ok(contextPacket.deterministicCore.flightPlanCore.expectedReceipts.length > 0);
  assert.equal(
    contextPacket.deterministicCore.executionBoundary,
    "pmo_passive_analyst_execution_agent_performs_side_effects"
  );

  await repository.upsertExpectedReceipts(
    contextPacket.deterministicCore.flightPlanCore.expectedReceipts.map((receipt) => ({
      ...receipt,
      actorId: executor.actorId,
      contractRefs: [],
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      projectId: "project://program-manager-mcp",
      recordedAt: DEFAULT_NOW,
      dueAt: "2026-05-03T12:30:00Z"
    }))
  );

  const expectedReceipt = contextPacket.deterministicCore.flightPlanCore.expectedReceipts[0];
  const proposedAction = contextPacket.deterministicCore.flightPlanCore.proposedExternalActions.find(
    (action) => action.proposedActionId === expectedReceipt.proposedActionId
  );
  assert.ok(proposedAction);

  const receiptRequest = {
    portfolioId: "portfolio://default",
    programId: "program://agentic-os",
    agenticOsRunRef: "run://agentic-os/phase-4-smoke",
    executionAgentRef: executor.actorId,
    governance,
    flightPlanHash: expectedReceipt.flightPlanHash,
    flightPlanId: expectedReceipt.flightPlanId,
    flightPlanStateVersionHash: expectedReceipt.flightPlanStateVersionHash,
    idempotencyKey: expectedReceipt.idempotencyKey,
    observedAt: "2026-05-03T12:10:00Z",
    proposedActionId: expectedReceipt.proposedActionId,
    receiptRequirementId: expectedReceipt.receiptRequirementId,
    receiptType: expectedReceipt.expectedReceiptType,
    evidenceRefs: expectedReceipt.requiredEvidenceRefs,
    artifactRefs: ["artifact://phase4/executor-receipt"],
    observedStateRefs: [proposedAction.targetRef],
    summary: "Simulated external execution agent submitted a PMO receipt.",
    verificationMethod: expectedReceipt.requiredVerifier,
    traceId,
    correlationId: "corr://phase4/receipt"
  };
  const receipt = await callWithSpan({
    gateway,
    actor: executor,
    spans,
    traceId,
    toolName: "submit_agentic_os_receipt",
    request: {
      ...receiptRequest,
      receiptDigest: receiptDigestForRequest(receiptRequest)
    }
  });

  assert.deepEqual(submitAgenticOsReceiptResultSchema.parse(receipt), receipt);
  assert.equal(receipt.status, "ok");
  assert.equal(receipt.deterministicCore.validation.passiveBoundaryPreserved, true);

  const reconcile = await callWithSpan({
    gateway,
    actor: operator,
    spans,
    traceId,
    toolName: "reconcile_program_state",
    request: {
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      targetRefs: [proposedAction.targetRef],
      flightPlanIds: [expectedReceipt.flightPlanId],
      receiptRequirementIds: [expectedReceipt.receiptRequirementId],
      asOf: "2026-05-03T12:11:00Z",
      traceId,
      correlationId: "corr://phase4/reconcile"
    }
  });

  assert.ok(["ok", "warning"].includes(reconcile.status));
  assert.equal(reconcile.deterministicCore.reconcileStatuses[0].status, "satisfied");

  const telemetry = summarizeTelemetryEvidence({
    traceId,
    scenario: "phase4-agentic-os-operational-smoke",
    spans,
    source: "pmo-phase4-smoke"
  });
  assert.equal(telemetry.redactionSummary.redacted, false);
  assert.equal(telemetry.statusCounts.ok, 1);
  assert.equal(telemetry.statusCounts.warning, 1);
  assert.equal(telemetry.statusCounts.blocked, 1);
}

const outcome = await runChecks([
  ["phase 4 Agentic OS operational smoke", checkPhase4EndToEndSmoke]
]);

if (outcome.failed > 0) {
  process.exitCode = 1;
}
