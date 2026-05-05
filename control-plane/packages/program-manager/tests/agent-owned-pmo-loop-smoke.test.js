import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  getAgenticOsContextPacketResultSchema,
  pmoMacroResultSchema,
  reconcileProgramStateResultSchema,
  submitAgenticOsReceiptResultSchema
} from "../../../../shared/schemas/program-manager.ts";
import {
  AdapterRegistry,
  HoplonAdapterStub,
  TrackerAdapterStub
} from "../src/adapters/program-adapter-registry.ts";
import { getBackboneRepositoryFixture } from "../src/fixtures/golden-fixture-backbone.js";
import { stateVersionHashFromInput } from "../src/hash/state-version-hash.js";
import { ProgramManagerMcpGateway } from "../src/mcp/program-manager-mcp-gateway.ts";
import { InMemoryProgramManagerRepository } from "../src/repository/in-memory-program-manager-repository.ts";
import { ProgramToolService } from "../src/service/program-tool-service.ts";

const PORTFOLIO_ID = "portfolio://default";
const PROGRAM_ID = "program://agentic-os";
const SHARED_FLOW_REF = "integration://agentic-os/shared-flow";
const TRACKER_TASK_REF = "tracker://program-manager-mcp/pmo-agent-006";
const SHARED_FLOW_PROJECT_IDS = [
  "project://hoplon",
  "project://phalanx",
  "project://semantix"
];
const PROJECT_IDS = [
  ...SHARED_FLOW_PROJECT_IDS.slice(0, 2),
  "project://program-manager-mcp",
  SHARED_FLOW_PROJECT_IDS[2]
];
const TRACE_ID = "trace://pmo-agent-006/end-to-end-proof";

function buildActor(overrides = {}) {
  return {
    actorId: "actor://agents/pmo-agent-006",
    actorRole: "program_manager_agent",
    tenantId: "tenant://default",
    portfolioGrants: [PORTFOLIO_ID],
    programGrants: [PROGRAM_ID],
    projectGrants: PROJECT_IDS,
    authnMethod: "oidc_jwt",
    authnIssuer: "issuer://control-plane",
    authenticatedAt: "2026-05-04T22:00:00Z",
    expiresAt: "2026-05-05T02:00:00Z",
    ...overrides
  };
}

function loadMacroFixture() {
  return JSON.parse(
    readFileSync(
      join(process.cwd(), "../../../docs/phase-5/fixtures/pmo-macro-fixture-universe.example.json"),
      "utf8"
    )
  );
}

function buildFreshProofHarness() {
  const macroFixture = loadMacroFixture();
  const repository = InMemoryProgramManagerRepository.fromFixture({
    ...getBackboneRepositoryFixture(),
    macroTasks: macroFixture.seedGraph.tasks,
    macroBlockers: macroFixture.seedGraph.blockers,
    macroContracts: macroFixture.seedGraph.contracts,
    macroDependencyEdges: macroFixture.seedGraph.dependencyEdges,
    macroRunbooks: macroFixture.seedGraph.runbooks
  });
  const service = new ProgramToolService({
    repository,
    adapterRegistry: new AdapterRegistry([new HoplonAdapterStub(), new TrackerAdapterStub()]),
    now: () => "2026-05-04T23:00:00Z"
  });

  return {
    gateway: new ProgramManagerMcpGateway(service),
    repository
  };
}

function digestReceipt(request) {
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

function buildReceiptRequest(expectedReceipt) {
  const base = {
    portfolioId: PORTFOLIO_ID,
    programId: PROGRAM_ID,
    projectIds: ["project://program-manager-mcp"],
    artifactRefs: ["artifact://program-manager-mcp/pmo-agent-006/proof-output"],
    evidenceRefs: expectedReceipt.requiredEvidenceRefs,
    flightPlanHash: expectedReceipt.flightPlanHash,
    flightPlanId: expectedReceipt.flightPlanId,
    flightPlanStateVersionHash: expectedReceipt.flightPlanStateVersionHash,
    idempotencyKey: expectedReceipt.idempotencyKey,
    observedAt: "2026-05-04T23:02:00Z",
    observedStateRefs: [TRACKER_TASK_REF],
    proposedActionId: expectedReceipt.proposedActionId,
    receiptRequirementId: expectedReceipt.receiptRequirementId,
    receiptType: expectedReceipt.expectedReceiptType,
    summary: "Worker 6 produced a deterministic local PMO loop proof artifact.",
    verificationMethod: expectedReceipt.requiredVerifier,
    traceId: TRACE_ID,
    correlationId: "corr://pmo-agent-006/submit-receipt",
    agenticOsRunRef: "run://agentic-os/pmo-agent-006/local-proof",
    executionAgentRef: "actor://agents/pmo-agent-006",
    executionReceipt: {
      affectedRefs: [SHARED_FLOW_REF, TRACKER_TASK_REF],
      blockers: [],
      integrationRef: SHARED_FLOW_REF,
      projectId: "project://program-manager-mcp",
      sourceRef: TRACKER_TASK_REF,
      testsRun: [
        {
          evidenceRefs: ["evidence://program-manager-mcp/pmo-agent-006/node-test"],
          status: "pass",
          testRef: "test://program-manager-mcp/pmo-agent-006/agent-owned-loop-smoke"
        }
      ]
    },
    governance: {
      trustRootRef: "trust-root://control-plane/oidc-jwt",
      retentionPolicyRef: "policy://retention/pmo-agent-proof",
      piiHandlingPolicyRefs: ["policy://pii/pointer-only"]
    }
  };

  return {
    ...base,
    receiptDigest: digestReceipt(base)
  };
}

test("pmo-agent-006 proves the agent-owned PMO loop from fresh context through receipt reconciliation", async () => {
  const { gateway, repository } = buildFreshProofHarness();
  const pmoActor = buildActor();

  const catchUp = await gateway.callTool(
    "pmo_macro",
    {
      action: "invoke",
      macroId: "macro://pmo/catch_me_up",
      macroVersion: "1.0.0",
      portfolioId: PORTFOLIO_ID,
      programId: PROGRAM_ID,
      projectIds: PROJECT_IDS,
      input: {
        targetRefs: [SHARED_FLOW_REF]
      },
      traceId: TRACE_ID,
      correlationId: "corr://pmo-agent-006/catch-up",
      contextAnchor: {
        portfolioId: PORTFOLIO_ID,
        programId: PROGRAM_ID,
        projectId: "project://program-manager-mcp",
        branchName: "worker-6-local-proof",
        gitCommit: "abc123def456",
        trackerSlug: "program-manager-mcp",
        trackerRev: 92,
        asOf: "2026-05-04T23:00:00Z"
      }
    },
    pmoActor
  );

  assert.deepEqual(pmoMacroResultSchema.parse(catchUp), catchUp);
  assert.equal(catchUp.status, "ok", JSON.stringify(catchUp));
  for (const expectedRef of [...SHARED_FLOW_PROJECT_IDS, SHARED_FLOW_REF]) {
    assert.ok(catchUp.deterministicCore.objectModelRefs.includes(expectedRef), `${expectedRef} visible`);
  }

  const contextPacket = await gateway.callTool(
    "get_agentic_os_context_packet",
    {
      portfolioId: PORTFOLIO_ID,
      programId: PROGRAM_ID,
      projectIds: PROJECT_IDS,
      workContextRef: "work://program-manager-mcp/pmo-agent-006/fresh-context",
      agenticOsRunRef: "run://agentic-os/pmo-agent-006/local-proof",
      governance: {
        trustRootRef: "trust-root://control-plane/oidc-jwt",
        retentionPolicyRef: "policy://retention/pmo-agent-proof",
        piiHandlingPolicyRefs: ["policy://pii/pointer-only"]
      },
      targetRefs: [SHARED_FLOW_REF],
      traversalBudgetRef: "budget://pmo-agent-006/local-proof",
      proposedChange: {
        changeType: "agentic_os_execution",
        summary: "Worker 6 proves PMO discovery, expected receipt creation, mock execution receipt, and reconciliation.",
        targetRefs: [TRACKER_TASK_REF]
      },
      traceId: TRACE_ID,
      correlationId: "corr://pmo-agent-006/context-packet",
      contextAnchor: {
        portfolioId: PORTFOLIO_ID,
        programId: PROGRAM_ID,
        projectId: "project://program-manager-mcp",
        branchName: "worker-6-local-proof",
        gitCommit: "abc123def456",
        trackerSlug: "program-manager-mcp",
        trackerRev: 92,
        asOf: "2026-05-04T23:00:00Z"
      }
    },
    pmoActor
  );

  assert.deepEqual(getAgenticOsContextPacketResultSchema.parse(contextPacket), contextPacket);
  assert.equal(
    contextPacket.deterministicCore.executionBoundary,
    "pmo_passive_analyst_execution_agent_performs_side_effects"
  );
  assert.ok(contextPacket.deterministicCore.flightPlanCore.expectedReceipts.length > 0);
  assert.ok(contextPacket.deterministicCore.cpGraphRefs.includes(SHARED_FLOW_REF));

  const expectedReceipts = contextPacket.deterministicCore.flightPlanCore.expectedReceipts.map((receipt) => ({
    contractRefs: [],
    portfolioId: PORTFOLIO_ID,
    programId: PROGRAM_ID,
    projectId: "project://program-manager-mcp",
    recordedAt: "2026-05-04T23:01:00Z",
    ...receipt
  }));

  await repository.upsertExpectedReceipts(expectedReceipts, {
    artifactRefs: ["artifact://program-manager-mcp/pmo-agent-006/expected-receipts"],
    eventId: "event://program-manager-mcp/pmo-agent-006/expected-receipts",
    eventType: "pmo-agent-006.expected-receipts.persisted",
    evidenceRefs: ["evidence://program-manager-mcp/pmo-agent-006/context-packet"],
    portfolioId: PORTFOLIO_ID,
    programId: PROGRAM_ID,
    recordedAt: "2026-05-04T23:01:00Z"
  });

  const expectedReceipt = expectedReceipts.find(
    (receipt) => receipt.scopeRefs.includes(TRACKER_TASK_REF)
  );
  assert.ok(expectedReceipt, "expected receipt for Worker 6 tracker task exists");

  const submitted = await gateway.callTool(
    "submit_agentic_os_receipt",
    buildReceiptRequest(expectedReceipt),
    buildActor({
      actorRole: "execution_agent",
      projectGrants: PROJECT_IDS
    })
  );

  assert.deepEqual(submitAgenticOsReceiptResultSchema.parse(submitted), submitted);
  assert.equal(submitted.status, "ok", JSON.stringify(submitted));
  assert.equal(submitted.deterministicCore.validation.passiveBoundaryPreserved, true);
  assert.equal(submitted.deterministicCore.validation.status, "accepted");

  const reconciled = await gateway.callTool(
    "reconcile_program_state",
    {
      portfolioId: PORTFOLIO_ID,
      programId: PROGRAM_ID,
      projectIds: PROJECT_IDS,
      targetRefs: [...new Set([SHARED_FLOW_REF, ...expectedReceipt.scopeRefs])].sort((left, right) =>
        left.localeCompare(right)
      ),
      flightPlanIds: [expectedReceipt.flightPlanId],
      receiptRequirementIds: [expectedReceipt.receiptRequirementId],
      asOf: "2026-05-04T23:03:00Z",
      traceId: TRACE_ID,
      correlationId: "corr://pmo-agent-006/reconcile"
    },
    pmoActor
  );

  assert.deepEqual(reconcileProgramStateResultSchema.parse(reconciled), reconciled);
  assert.ok(["ok", "warning"].includes(reconciled.status), JSON.stringify(reconciled));
  assert.equal(reconciled.deterministicCore.reconcileStatuses[0].status, "satisfied");

  const drift = await gateway.callTool(
    "pmo_macro",
    {
      action: "invoke",
      macroId: "macro://pmo/detect_drift",
      macroVersion: "1.0.0",
      portfolioId: PORTFOLIO_ID,
      programId: PROGRAM_ID,
      projectIds: PROJECT_IDS,
      input: {
        targetRefs: [SHARED_FLOW_REF]
      },
      traceId: TRACE_ID,
      correlationId: "corr://pmo-agent-006/detect-drift",
      contextAnchor: {
        portfolioId: PORTFOLIO_ID,
        programId: PROGRAM_ID,
        projectId: "project://program-manager-mcp",
        branchName: "worker-6-local-proof",
        gitCommit: "abc123def456",
        trackerSlug: "program-manager-mcp",
        trackerRev: 92,
        asOf: "2026-05-04T23:03:00Z"
      }
    },
    pmoActor
  );

  assert.deepEqual(pmoMacroResultSchema.parse(drift), drift);
  assert.ok(
    drift.deterministicCore.objectModelRefs.includes(submitted.deterministicCore.receiptCore.observedReceipt.observedReceiptId)
  );

  const proof = {
    pmoVisibleProjectRefs: [
      ...new Set(
        [
          ...catchUp.deterministicCore.objectModelRefs,
          ...contextPacket.deterministicCore.cpGraphRefs
        ].filter((ref) => ref.startsWith("project://"))
      )
    ].sort((left, right) => left.localeCompare(right)),
    pmoVisibleIntegrationRefs: [SHARED_FLOW_REF],
    expectedReceipts: expectedReceipts.map((receipt) => ({
      receiptRequirementId: receipt.receiptRequirementId,
      receiptType: receipt.expectedReceiptType,
      scopeRefs: receipt.scopeRefs
    })),
    observedReceipt: {
      observedReceiptId: submitted.deterministicCore.receiptCore.observedReceipt.observedReceiptId,
      receiptRequirementId: submitted.deterministicCore.receiptCore.observedReceipt.receiptRequirementId,
      status: submitted.deterministicCore.receiptCore.observedReceipt.status
    },
    reconciliationStatus: reconciled.deterministicCore.reconcileStatuses[0].status,
    pmoDriftMacroStatus: drift.status,
    evidenceRefs: [
      "evidence://program-manager-mcp/pmo-agent-006/node-test",
      "evidence://program-manager-mcp/pmo-agent-006/context-packet",
      "artifact://program-manager-mcp/pmo-agent-006/proof-output"
    ]
  };

  console.log(`PMO_AGENT_OWNED_LOOP_PROOF ${JSON.stringify(proof)}`);
});
