import test from "node:test";
import assert from "node:assert/strict";

import {
  actionLedgerEntrySchema,
  expectedReceiptSchema,
  observedReceiptSchema,
  receiptReconcileRecordSchema
} from "../../../../shared/schemas/program-manager.ts";
import { loadGraphModules } from "./load-graph-modules.js";

const HASH_A = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const HASH_B = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const HASH_C = "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";

function expectedReceipt(overrides = {}) {
  return {
    actorId: "actor://agents/executor-a",
    contractRefs: ["contract://hoplon/authz@sha256:cccc"],
    correlationId: "corr://receipt-ledger",
    dueAt: "2026-05-03T12:30:00Z",
    evidencePolicyRefs: ["policy://evidence/adapter-observed-state-v1"],
    expectedReceiptType: "tracker_update_receipt",
    flightPlanHash: HASH_A,
    flightPlanId: "flightplan://program-action/plan-a",
    flightPlanStateVersionHash: HASH_B,
    idempotencyKey: HASH_C,
    portfolioId: "portfolio://default",
    programId: "program://agentic-os",
    projectId: "project://program-manager-mcp",
    proposedActionId: "action://program-action/action-a",
    receiptRequirementId: "receipt://program-action/requirement-a",
    recordedAt: "2026-05-03T12:00:00Z",
    requiredEvidenceRefs: ["evidence://required/a"],
    requiredVerifier: "adapter_observed_state",
    scopeRefs: [
      "portfolio://default",
      "program://agentic-os",
      "project://program-manager-mcp",
      "tracker://program-manager-mcp/PMO-501"
    ],
    status: "expected",
    traceId: "trace://receipt-ledger",
    ...overrides
  };
}

function observedReceipt(overrides = {}) {
  return {
    actorId: "actor://agents/executor-a",
    artifactRefs: ["artifact://receipts/a"],
    contractRefs: ["contract://hoplon/authz@sha256:cccc"],
    correlationId: "corr://receipt-ledger",
    evidenceRefs: ["evidence://receipt/a"],
    flightPlanHash: HASH_A,
    flightPlanId: "flightplan://program-action/plan-a",
    idempotencyKey: HASH_C,
    observedAt: "2026-05-03T12:05:00Z",
    observedReceiptId: "receipt-observed://program-action/observed-a",
    observedStateRefs: ["tracker://program-manager-mcp/PMO-501"],
    portfolioId: "portfolio://default",
    programId: "program://agentic-os",
    projectId: "project://program-manager-mcp",
    proposedActionId: "action://program-action/action-a",
    receiptDigest: HASH_A,
    receiptRequirementId: "receipt://program-action/requirement-a",
    receiptType: "tracker_update_receipt",
    recordedAt: "2026-05-03T12:06:00Z",
    status: "accepted",
    summary: "Executor recorded the tracker update receipt.",
    traceId: "trace://receipt-ledger",
    ...overrides
  };
}

function auditEvent(eventId, recordedAt, evidenceRefs = []) {
  return {
    eventId,
    portfolioId: "portfolio://default",
    eventType: "receipt_ledger_updated",
    recordedAt,
    contextAnchor: {
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      projectId: "project://program-manager-mcp",
      asOf: recordedAt
    },
    evidenceRefs,
    artifactRefs: []
  };
}

test("receipt ledger schemas validate expected, observed, action, and partial reconcile records", () => {
  const expected = expectedReceipt();
  const observed = observedReceipt();
  const entry = {
    actorId: "actor://agents/executor-a",
    artifactRefs: [],
    contractRefs: ["contract://hoplon/authz@sha256:cccc"],
    correlationId: "corr://receipt-ledger",
    entryType: "observed_receipt",
    evidenceRefs: ["evidence://receipt/a"],
    flightPlanId: "flightplan://program-action/plan-a",
    ledgerEntryId: "ledger://program-action/entry-a",
    observedReceiptId: "receipt-observed://program-action/observed-a",
    portfolioId: "portfolio://default",
    programId: "program://agentic-os",
    projectId: "project://program-manager-mcp",
    proposedActionId: "action://program-action/action-a",
    receiptRequirementId: "receipt://program-action/requirement-a",
    recordedAt: "2026-05-03T12:06:00Z",
    status: "accepted",
    summary: "Accepted observed receipt.",
    traceId: "trace://receipt-ledger"
  };
  const reconcile = {
    acceptedCount: 1,
    conflictingCount: 0,
    contractRefs: ["contract://hoplon/authz@sha256:cccc"],
    duplicateCount: 0,
    evidenceRefs: ["evidence://receipt/a"],
    expectedCount: 2,
    flightPlanHash: HASH_A,
    flightPlanId: "flightplan://program-action/plan-a",
    missingCount: 1,
    observedCount: 1,
    portfolioId: "portfolio://default",
    programId: "program://agentic-os",
    projectId: "project://program-manager-mcp",
    proposedActionId: "action://program-action/action-a",
    receiptRequirementId: "receipt://program-action/requirement-a",
    status: "partial",
    updatedAt: "2026-05-03T12:06:30Z"
  };

  assert.deepEqual(expectedReceiptSchema.parse(expected), expected);
  assert.deepEqual(observedReceiptSchema.parse(observed), observed);
  assert.deepEqual(actionLedgerEntrySchema.parse(entry), entry);
  assert.deepEqual(receiptReconcileRecordSchema.parse(reconcile), reconcile);
  assert.throws(
    () => receiptReconcileRecordSchema.parse({ ...reconcile, missingCount: 0 }),
    /receipt reconcile counts/
  );
});

test("ProgramManagerGraphRepository persists and queries receipt ledger by plan, action, actor, contract, project, and evidence", async () => {
  const { repositoryModule, storeModule } = await loadGraphModules();
  const { ProgramManagerGraphRepository } = repositoryModule;
  const { InMemoryProgramManagerGraphStore } = storeModule;
  const repository = new ProgramManagerGraphRepository(new InMemoryProgramManagerGraphStore());
  const expectedA = expectedReceipt();
  const expectedB = expectedReceipt({
    proposedActionId: "action://program-action/action-b",
    receiptRequirementId: "receipt://program-action/requirement-b",
    requiredEvidenceRefs: ["evidence://required/b"]
  });
  const observedA = observedReceipt();

  await repository.upsertExpectedReceipts(
    [expectedB, expectedA],
    auditEvent("event://receipt-ledger/expected", "2026-05-03T12:01:00Z", [
      "evidence://required/a",
      "evidence://required/b"
    ])
  );
  await repository.appendObservedReceipt(
    observedA,
    auditEvent("event://receipt-ledger/observed-a", "2026-05-03T12:06:00Z", [
      "evidence://receipt/a"
    ])
  );
  await repository.appendActionLedgerEntry({
    actorId: "actor://agents/executor-a",
    artifactRefs: [],
    contractRefs: ["contract://hoplon/authz@sha256:cccc"],
    correlationId: "corr://receipt-ledger",
    entryType: "observed_receipt",
    evidenceRefs: ["evidence://receipt/a"],
    flightPlanId: expectedA.flightPlanId,
    ledgerEntryId: "ledger://program-action/entry-observed-a",
    observedReceiptId: observedA.observedReceiptId,
    portfolioId: expectedA.portfolioId,
    programId: expectedA.programId,
    projectId: expectedA.projectId,
    proposedActionId: expectedA.proposedActionId,
    receiptRequirementId: expectedA.receiptRequirementId,
    recordedAt: "2026-05-03T12:06:01Z",
    status: "accepted",
    summary: "Accepted observed receipt for action-a.",
    traceId: "trace://receipt-ledger"
  });
  await repository.upsertReceiptReconcileStatus({
    acceptedCount: 1,
    conflictingCount: 0,
    contractRefs: ["contract://hoplon/authz@sha256:cccc"],
    duplicateCount: 0,
    evidenceRefs: ["evidence://receipt/a"],
    expectedCount: 2,
    flightPlanHash: expectedA.flightPlanHash,
    flightPlanId: expectedA.flightPlanId,
    missingCount: 1,
    observedCount: 1,
    portfolioId: expectedA.portfolioId,
    programId: expectedA.programId,
    projectId: expectedA.projectId,
    proposedActionId: expectedA.proposedActionId,
    receiptRequirementId: expectedA.receiptRequirementId,
    status: "partial",
    updatedAt: "2026-05-03T12:06:30Z"
  });

  const ledger = await repository.listReceiptLedger({
    scope: {
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      projectIds: ["project://program-manager-mcp"]
    },
    contractRefs: ["contract://hoplon/authz@sha256:cccc"],
    flightPlanIds: ["flightplan://program-action/plan-a"]
  });

  assert.deepEqual(
    ledger.expectedReceipts.map((receipt) => receipt.receiptRequirementId),
    ["receipt://program-action/requirement-a", "receipt://program-action/requirement-b"]
  );
  assert.equal(ledger.observedReceipts.length, 1);
  assert.equal(ledger.actionLedgerEntries[0].status, "accepted");
  assert.equal(ledger.reconcileStatuses[0].status, "partial");
  assert.equal(ledger.reconcileStatuses[0].missingCount, 1);

  const byActor = await repository.listReceiptLedger({
    scope: { portfolioId: "portfolio://default" },
    actorIds: ["actor://agents/executor-a"],
    proposedActionIds: ["action://program-action/action-a"]
  });
  assert.equal(byActor.observedReceipts[0].observedReceiptId, observedA.observedReceiptId);
  assert.equal(byActor.actionLedgerEntries[0].ledgerEntryId, "ledger://program-action/entry-observed-a");

  const byObservedEvidence = await repository.listReceiptLedger({
    scope: { portfolioId: "portfolio://default" },
    evidenceRefs: ["evidence://receipt/a"],
    observedStatuses: ["accepted"]
  });
  assert.equal(byObservedEvidence.observedReceipts[0].observedReceiptId, observedA.observedReceiptId);
  assert.equal(byObservedEvidence.expectedReceipts.length, 0);

  const events = await repository.listEvents({ portfolioId: "portfolio://default" });
  assert.deepEqual(
    events.map((event) => event.eventId),
    ["event://receipt-ledger/observed-a", "event://receipt-ledger/expected"]
  );
});
