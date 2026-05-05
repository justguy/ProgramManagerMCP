import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  executionAgentReceiptSchema,
  reconcileProgramStateResultSchema,
  submitAgenticOsReceiptResultSchema
} from "../../../../shared/schemas/program-manager.ts";
import { AdapterRegistry } from "../src/adapters/program-adapter-registry.ts";
import { stateVersionHashFromInput } from "../src/hash/state-version-hash.js";
import { ProgramManagerMcpGateway } from "../src/mcp/program-manager-mcp-gateway.ts";
import { InMemoryProgramManagerRepository } from "../src/repository/in-memory-program-manager-repository.ts";
import { ProgramToolService } from "../src/service/program-tool-service.ts";

const NOW = "2026-05-03T12:10:00Z";
const HASH_A = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const HASH_B = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

function loadExampleReceipt() {
  return JSON.parse(
    readFileSync(
      resolve(REPO_ROOT, "docs/agent-pmo-onboarding/examples/execution-agent-receipt.example.json"),
      "utf8"
    )
  );
}

function buildActor() {
  return {
    actorId: "actor://agents/executor-a",
    actorRole: "execution_agent",
    tenantId: "tenant://default",
    portfolioGrants: ["portfolio://default"],
    programGrants: ["program://agentic-os"],
    projectGrants: ["project://program-manager-mcp"],
    authnMethod: "oidc_jwt",
    authnIssuer: "issuer://control-plane",
    authenticatedAt: "2026-05-03T11:00:00Z",
    expiresAt: "2026-05-03T13:00:00Z"
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

function expectedReceiptFromRequest(request, overrides = {}) {
  return {
    actorId: request.executionAgentRef,
    contractRefs: [],
    correlationId: request.correlationId,
    dueAt: "2026-05-03T12:30:00Z",
    evidencePolicyRefs: ["policy://evidence/tracker-snapshot-fast-expiry"],
    expectedReceiptType: request.receiptType,
    flightPlanHash: request.flightPlanHash,
    flightPlanId: request.flightPlanId,
    flightPlanStateVersionHash: request.flightPlanStateVersionHash,
    idempotencyKey: request.idempotencyKey,
    portfolioId: request.portfolioId,
    programId: request.programId,
    projectId: request.executionReceipt.projectId,
    proposedActionId: request.proposedActionId,
    receiptRequirementId: request.receiptRequirementId,
    recordedAt: "2026-05-03T12:00:00Z",
    requiredEvidenceRefs: request.evidenceRefs,
    requiredVerifier: request.verificationMethod,
    scopeRefs: [
      request.portfolioId,
      request.programId,
      request.executionReceipt.projectId,
      ...request.executionReceipt.affectedRefs
    ].sort((left, right) => left.localeCompare(right)),
    status: "expected",
    traceId: request.traceId,
    ...overrides
  };
}

async function buildGateway(expectedReceipts) {
  const repository = new InMemoryProgramManagerRepository();
  await repository.upsertExpectedReceipts(expectedReceipts);
  const service = new ProgramToolService({
    repository,
    adapterRegistry: new AdapterRegistry(),
    now: () => NOW
  });
  return {
    gateway: new ProgramManagerMcpGateway(service),
    repository
  };
}

test("execution-agent receipt example submits through MCP and reconciles expected, observed, and missing states", async () => {
  const receipt = loadExampleReceipt();
  assert.equal(receipt.receiptDigest, receiptDigestForRequest(receipt));
  const missingReceipt = expectedReceiptFromRequest(receipt, {
    idempotencyKey: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    proposedActionId: "action://program-action/missing-receipt",
    receiptRequirementId: "receipt://program-action/missing-receipt",
    requiredEvidenceRefs: ["evidence://receipt/missing-required"]
  });
  const { gateway, repository } = await buildGateway([
    expectedReceiptFromRequest(receipt),
    missingReceipt
  ]);

  assert.deepEqual(executionAgentReceiptSchema.parse(receipt.executionReceipt), receipt.executionReceipt);

  const submitted = await gateway.callTool("submit_agentic_os_receipt", receipt, buildActor());

  assert.deepEqual(submitAgenticOsReceiptResultSchema.parse(submitted), submitted);
  assert.equal(submitted.status, "ok");
  assert.equal(submitted.deterministicCore.validation.passiveBoundaryPreserved, true);
  assert.equal(submitted.deterministicCore.validation.status, "accepted");
  assert.deepEqual(submitted.deterministicCore.executionReceipt, receipt.executionReceipt);

  const ledger = await repository.listReceiptLedger({
    scope: { portfolioId: "portfolio://default" },
    receiptRequirementIds: [receipt.receiptRequirementId]
  });
  assert.equal(ledger.expectedReceipts.length, 1);
  assert.equal(ledger.observedReceipts.length, 1);
  assert.equal(ledger.observedReceipts[0].projectId, receipt.executionReceipt.projectId);

  const reconciled = await gateway.callTool(
    "reconcile_program_state",
    {
      portfolioId: receipt.portfolioId,
      programId: receipt.programId,
      projectIds: receipt.projectIds,
      targetRefs: receipt.executionReceipt.affectedRefs,
      flightPlanIds: [receipt.flightPlanId],
      asOf: "2026-05-03T12:11:00Z",
      traceId: "trace://pmo-agent-004/reconcile-smoke",
      correlationId: "corr://pmo-agent-004/reconcile-smoke"
    },
    buildActor()
  );

  assert.deepEqual(reconcileProgramStateResultSchema.parse(reconciled), reconciled);
  assert.equal(reconciled.deterministicCore.observedReceiptCount, 1);
  assert.ok(
    reconciled.deterministicCore.reconcileStatuses.some(
      (status) => status.receiptRequirementId === receipt.receiptRequirementId && status.status === "satisfied"
    )
  );
  assert.ok(
    reconciled.deterministicCore.reconcileStatuses.some(
      (status) => status.receiptRequirementId === missingReceipt.receiptRequirementId && status.missingCount === 1
    )
  );
});

test("execution-agent receipt protocol exposes stale blocking and conflicting reconciliation", async () => {
  const stale = loadExampleReceipt();
  stale.flightPlanStateVersionHash = "sha256:1111111111111111111111111111111111111111111111111111111111111111";
  const staleGateway = await buildGateway([expectedReceiptFromRequest(loadExampleReceipt())]);

  const blocked = await staleGateway.gateway.callTool("submit_agentic_os_receipt", stale, buildActor());

  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.warnings[0].warningId, "receipt-stale-flight-plan");
  assert.equal(blocked.deterministicCore.validation.status, "rejected");

  const conflicting = loadExampleReceipt();
  conflicting.idempotencyKey = "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
  conflicting.proposedActionId = "action://program-action/conflicting-receipt";
  conflicting.receiptRequirementId = "receipt://program-action/conflicting-receipt";
  conflicting.observedStateRefs = [conflicting.executionReceipt.sourceRef];
  conflicting.receiptDigest = receiptDigestForRequest(conflicting);
  const conflictGateway = await buildGateway([expectedReceiptFromRequest(conflicting)]);

  const accepted = await conflictGateway.gateway.callTool(
    "submit_agentic_os_receipt",
    conflicting,
    buildActor()
  );
  assert.equal(accepted.status, "ok");

  const reconciled = await conflictGateway.gateway.callTool(
    "reconcile_program_state",
    {
      portfolioId: conflicting.portfolioId,
      programId: conflicting.programId,
      projectIds: conflicting.projectIds,
      targetRefs: conflicting.executionReceipt.affectedRefs,
      flightPlanIds: [conflicting.flightPlanId],
      receiptRequirementIds: [conflicting.receiptRequirementId],
      asOf: "2026-05-03T12:11:00Z",
      traceId: "trace://pmo-agent-004/reconcile-conflict",
      correlationId: "corr://pmo-agent-004/reconcile-conflict"
    },
    buildActor()
  );

  assert.equal(reconciled.status, "blocked");
  assert.equal(reconciled.deterministicCore.reconcileStatuses[0].status, "conflicting");
  assert.equal(reconciled.deterministicCore.findings[0].type, "receipt_state_conflict");
});
