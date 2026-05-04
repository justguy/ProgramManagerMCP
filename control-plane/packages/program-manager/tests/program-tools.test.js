import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeProgramIntelligenceResultSchema,
  assessProgramImpactResultSchema,
  getAgenticOsContextPacketResultSchema,
  getProgramDocumentationResultSchema,
  getProgramAuditTrailResultSchema,
  listProgramCapabilitiesResultSchema,
  generateProgramUpdateResultSchema,
  planProgramActionResultSchema,
  queryProgramContextResultSchema,
  recordProgramReceiptResultSchema,
  reconcileProgramStateResultSchema,
  submitAgenticOsReceiptResultSchema
} from "../../../../shared/schemas/program-manager.ts";
import { stateVersionHashFromInput } from "../src/hash/state-version-hash.js";
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

async function buildReceiptGateway() {
  const repository = InMemoryProgramManagerRepository.fromFixture(getBackboneRepositoryFixture());
  await repository.upsertExpectedReceipts([
    {
      actorId: "actor://agents/executor-a",
      contractRefs: ["contract://hoplon-authz/escalation-grant@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"],
      correlationId: "corr://record-receipt",
      dueAt: "2026-05-03T12:30:00Z",
      evidencePolicyRefs: ["policy://evidence/tracker-snapshot-fast-expiry"],
      expectedReceiptType: "tracker_update_receipt",
      flightPlanHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      flightPlanId: "flightplan://program-action/record-receipt",
      flightPlanStateVersionHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      idempotencyKey: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      projectId: "project://program-manager-mcp",
      proposedActionId: "action://program-action/record-receipt",
      receiptRequirementId: "receipt://program-action/record-receipt",
      recordedAt: "2026-05-03T12:00:00Z",
      requiredEvidenceRefs: ["evidence://receipt/required"],
      requiredVerifier: "adapter_observed_state",
      scopeRefs: [
        "portfolio://default",
        "program://agentic-os",
        "project://program-manager-mcp",
        "tracker://program-manager-mcp/PMO-502"
      ],
      status: "expected",
      traceId: "trace://record-receipt"
    },
    {
      actorId: "actor://agents/executor-b",
      contractRefs: ["contract://hoplon-authz/escalation-grant@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"],
      correlationId: "corr://record-receipt-b",
      dueAt: "2026-05-03T12:05:00Z",
      evidencePolicyRefs: ["policy://evidence/tracker-snapshot-fast-expiry"],
      expectedReceiptType: "tracker_update_receipt",
      flightPlanHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      flightPlanId: "flightplan://program-action/record-receipt",
      flightPlanStateVersionHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      idempotencyKey: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      projectId: "project://program-manager-mcp",
      proposedActionId: "action://program-action/record-receipt-b",
      receiptRequirementId: "receipt://program-action/record-receipt-b",
      recordedAt: "2026-05-03T12:00:00Z",
      requiredEvidenceRefs: ["evidence://receipt/required-b"],
      requiredVerifier: "adapter_observed_state",
      scopeRefs: [
        "portfolio://default",
        "program://agentic-os",
        "project://program-manager-mcp",
        "tracker://program-manager-mcp/PMO-502"
      ],
      status: "expected",
      traceId: "trace://record-receipt-b"
    },
    {
      actorId: "actor://agents/executor-c",
      contractRefs: ["contract://hoplon-authz/escalation-grant@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"],
      correlationId: "corr://record-receipt-c",
      evidencePolicyRefs: ["policy://evidence/tracker-snapshot-fast-expiry"],
      expectedReceiptType: "tracker_update_receipt",
      flightPlanHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      flightPlanId: "flightplan://program-action/record-receipt",
      flightPlanStateVersionHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      idempotencyKey: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      projectId: "project://program-manager-mcp",
      proposedActionId: "action://program-action/record-receipt-c",
      receiptRequirementId: "receipt://program-action/record-receipt-c",
      recordedAt: "2026-05-03T12:00:00Z",
      requiredEvidenceRefs: ["evidence://receipt/required-c"],
      requiredVerifier: "adapter_observed_state",
      scopeRefs: [
        "portfolio://default",
        "program://agentic-os",
        "project://program-manager-mcp",
        "tracker://program-manager-mcp/PMO-502"
      ],
      status: "expected",
      traceId: "trace://record-receipt-c"
    }
  ]);
  const adapterRegistry = new AdapterRegistry([new HoplonAdapterStub(), new TrackerAdapterStub()]);
  const service = new ProgramToolService({
    repository,
    adapterRegistry,
    now: () => "2026-05-03T12:10:00Z"
  });

  return { gateway: new ProgramManagerMcpGateway(service), repository };
}

function buildReceiptRequest(overrides = {}) {
  const base = {
    portfolioId: "portfolio://default",
    programId: "program://agentic-os",
    flightPlanHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    flightPlanId: "flightplan://program-action/record-receipt",
    flightPlanStateVersionHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    idempotencyKey: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    observedAt: "2026-05-03T12:09:00Z",
    proposedActionId: "action://program-action/record-receipt",
    receiptRequirementId: "receipt://program-action/record-receipt",
    receiptType: "tracker_update_receipt",
    evidenceRefs: ["evidence://receipt/required"],
    artifactRefs: ["artifact://receipt/record-receipt"],
    observedStateRefs: ["tracker://program-manager-mcp/PMO-502"],
    summary: "Executor observed the tracker receipt.",
    verificationMethod: "adapter_observed_state",
    traceId: "trace://record-receipt",
    correlationId: "corr://record-receipt",
    ...overrides
  };

  return {
    ...base,
    receiptDigest:
      overrides.receiptDigest ??
      stateVersionHashFromInput({
        evidenceRefs: base.evidenceRefs,
        flightPlanHash: base.flightPlanHash,
        flightPlanId: base.flightPlanId,
        observedAt: base.observedAt,
        observedStateRefs: base.observedStateRefs,
        proposedActionId: base.proposedActionId,
        receiptRequirementId: base.receiptRequirementId,
        receiptType: base.receiptType
      })
  };
}

test("gateway lists public Phase 1A/1B MCP tools", () => {
  const gateway = buildGateway();

  assert.deepEqual(
    gateway.listTools().map((tool) => tool.name),
    [
      "list_program_capabilities",
      "get_program_documentation",
      "query_program_context",
      "assess_program_impact",
      "generate_program_update",
      "get_program_audit_trail",
      "analyze_program_intelligence",
      "plan_program_action",
      "record_program_receipt",
      "reconcile_program_state",
      "get_agentic_os_context_packet",
      "submit_agentic_os_receipt"
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

  const generateResult = await gateway.callTool(
    "generate_program_update",
    {
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      reportAudience: "execution",
      traceId: "trace://update",
      correlationId: "corr://update",
      contextAnchor: {
        portfolioId: "portfolio://default",
        programId: "program://agentic-os",
        asOf: "2026-05-03T12:00:00Z"
      }
    },
    actor
  );
  assert.deepEqual(generateProgramUpdateResultSchema.parse(generateResult), generateResult);
  assert.equal(generateResult.toolName, "generate_program_update");
  assert.equal(generateResult.status, "ok");
  assert.equal(generateResult.deterministicCore.sections.length > 0, true);
  assert.ok(generateResult.artifactRefs.length > 0);
  assert.ok(generateResult.evidenceRefs.length > 0);
  assert.ok(generateResult.deterministicCore.evidenceEnvelopeRef.startsWith("artifact://"));
  assert.ok(generateResult.stateVersionHash.startsWith("sha256:"));
  assert.equal(generateResult.deterministicCore.reportAudience, "execution");

  const auditResult = await gateway.callTool(
    "get_program_audit_trail",
    {
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      traceId: "trace://audit-empty",
      correlationId: "corr://audit-empty",
      contextAnchor: {
        portfolioId: "portfolio://default",
        programId: "program://agentic-os",
        asOf: "2026-05-03T12:00:00Z"
      }
    },
    actor
  );
  assert.deepEqual(getProgramAuditTrailResultSchema.parse(auditResult), auditResult);
  assert.equal(auditResult.toolName, "get_program_audit_trail");
  assert.ok(auditResult.stateVersionHash.startsWith("sha256:"));
});

test("analyze_program_intelligence returns deterministic evidence-backed issue cards", async () => {
  const gateway = buildGateway();
  const actor = buildActor();
  const request = {
    portfolioId: "portfolio://default",
    programId: "program://agentic-os",
    targetRefs: [
      "contract://guardrail/tool-policy@sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      "tracker://program-manager-mcp/PMO-001"
    ],
    conditionTags: ["integration:guardrail", "risk:missing_evidence"],
    includeAdvisoryPane: true,
    traceId: "trace://intelligence",
    correlationId: "corr://intelligence",
    contextAnchor: {
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      asOf: "2026-05-03T12:00:00Z"
    }
  };

  const first = await gateway.callTool("analyze_program_intelligence", request, actor);
  const second = await gateway.callTool("analyze_program_intelligence", request, actor);

  assert.deepEqual(analyzeProgramIntelligenceResultSchema.parse(first), first);
  assert.equal(first.toolName, "analyze_program_intelligence");
  assert.equal(first.status, "ok");
  assert.equal(first.advisoryPane.excludedFromDeterministicHash, true);
  assert.equal(first.stateVersionHash, second.stateVersionHash);
  assert.deepEqual(
    first.deterministicCore.issueCards.map((card) => [card.issueType, card.issueId]),
    [...first.deterministicCore.issueCards]
      .sort(
        (left, right) =>
          left.issueType.localeCompare(right.issueType) ||
          left.issueId.localeCompare(right.issueId)
      )
      .map((card) => [card.issueType, card.issueId])
  );
  assert.ok(
    first.deterministicCore.issueCards.some((card) => card.issueType === "failure_pattern_match")
  );
  assert.ok(
    first.deterministicCore.issueCards.some((card) => card.issueType === "risk_signal")
  );
  assert.ok(first.evidenceRefs.every((ref) => ref.includes("://")));
  assert.equal(
    first.deterministicCore.issueCards.every(
      (card) => card.proposedUpdateStatus !== "not_applicable"
    ),
    true
  );
});

test("analyze_program_intelligence labels advisory output outside deterministic hash", async () => {
  const gateway = buildGateway();
  const actor = buildActor();
  const baseRequest = {
    portfolioId: "portfolio://default",
    programId: "program://agentic-os",
    targetRefs: ["tracker://program-manager-mcp/PMO-001"],
    traceId: "trace://intelligence-advisory",
    correlationId: "corr://intelligence-advisory"
  };

  const deterministicOnly = await gateway.callTool(
    "analyze_program_intelligence",
    baseRequest,
    actor
  );
  const withAdvisory = await gateway.callTool(
    "analyze_program_intelligence",
    {
      ...baseRequest,
      includeAdvisoryPane: true
    },
    actor
  );

  assert.equal(withAdvisory.advisoryPane.excludedFromDeterministicHash, true);
  assert.equal(deterministicOnly.stateVersionHash, withAdvisory.stateVersionHash);
});

test("plan_program_action returns deterministic proposal-only flight plans", async () => {
  const gateway = buildGateway();
  const actor = buildActor();
  const request = {
    portfolioId: "portfolio://default",
    programId: "program://agentic-os",
    traversalBudgetRef: "budget://phase-2/default",
    proposedChange: {
      changeType: "contract_update",
      summary: "Update Hoplon authz contract and refresh linked tracker evidence.",
      targetRefs: [
        "contract://hoplon-authz/escalation-grant@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        "tracker://program-manager-mcp/PMO-001"
      ]
    },
    includeAdvisoryPane: true,
    traceId: "trace://plan-action",
    correlationId: "corr://plan-action",
    contextAnchor: {
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      projectId: "project://program-manager-mcp",
      branchName: "main",
      gitCommit: "abc123def456",
      trackerSlug: "program-manager-mcp",
      trackerRev: 12,
      asOf: "2026-05-03T12:00:00Z"
    }
  };

  const first = await gateway.callTool("plan_program_action", request, actor);
  const second = await gateway.callTool("plan_program_action", request, actor);
  const deterministicOnly = await gateway.callTool(
    "plan_program_action",
    { ...request, includeAdvisoryPane: false },
    actor
  );

  assert.deepEqual(planProgramActionResultSchema.parse(first), first);
  assert.equal(first.toolName, "plan_program_action");
  assert.equal(first.status, "blocked");
  assert.equal(first.advisoryPane.excludedFromDeterministicHash, true);
  assert.equal(first.deterministicCore.flightPlanHash, second.deterministicCore.flightPlanHash);
  assert.equal(first.deterministicCore.flightPlanHash, deterministicOnly.deterministicCore.flightPlanHash);
  assert.equal(first.stateVersionHash, second.stateVersionHash);
  assert.equal(first.stateVersionHash, deterministicOnly.stateVersionHash);
  assert.equal(first.deterministicCore.approvalObligations[0].status, "unsatisfied");
  assert.ok(first.deterministicCore.approvalObligations[0].blocking);
  assert.ok(first.deterministicCore.evidenceObligations.some((item) => item.blocking));
  assert.ok(first.deterministicCore.expectedReceipts.length > 0);
  assert.ok(
    first.deterministicCore.expectedReceipts.every(
      (receipt) =>
        receipt.flightPlanHash === first.deterministicCore.flightPlanHash &&
        receipt.flightPlanStateVersionHash === first.stateVersionHash &&
        receipt.status === "expected"
    )
  );
  assert.ok(first.deterministicCore.proposedExternalActions.length > 0);
  assert.ok(
    first.deterministicCore.proposedExternalActions.every(
      (action) =>
        action.status === "proposed" &&
        action.causation.sourceTool === "plan_program_action" &&
        action.expectedReceiptRequirementIds.length > 0
    )
  );
  assert.equal(
    first.deterministicCore.revalidation.requiredBeforeReceiptSatisfaction,
    true
  );
  assert.deepEqual(
    first.deterministicCore.proposedExternalActions.map((action) => action.proposedActionId),
    [...first.deterministicCore.proposedExternalActions]
      .map((action) => action.proposedActionId)
      .sort((left, right) => left.localeCompare(right))
  );
});

test("plan_program_action suppresses repeated propagation edges", async () => {
  const gateway = buildGateway();
  const actor = buildActor();
  const repeatedEdge = {
    adapterId: "tracker",
    targetRef: "tracker://program-manager-mcp/PMO-001",
    actionType: "propose_tracker_update"
  };

  const result = await gateway.callTool(
    "plan_program_action",
    {
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      traversalBudgetRef: "budget://phase-2/default",
      proposedChange: {
        changeType: "evidence_refresh",
        summary: "Refresh tracker evidence without repeating adapter feedback.",
        targetRefs: ["tracker://program-manager-mcp/PMO-001"]
      },
      propagationDepth: 1,
      maxPropagationDepth: 8,
      propagationPath: [repeatedEdge],
      requestedExternalActions: [repeatedEdge],
      traceId: "trace://plan-suppression",
      correlationId: "corr://plan-suppression",
      contextAnchor: {
        portfolioId: "portfolio://default",
        programId: "program://agentic-os",
        asOf: "2026-05-03T12:00:00Z"
      }
    },
    actor
  );

  assert.deepEqual(planProgramActionResultSchema.parse(result), result);
  assert.equal(result.deterministicCore.proposedExternalActions.length, 0);
  assert.equal(result.deterministicCore.expectedReceipts.length, 0);
  assert.equal(result.deterministicCore.suppressedProposals.length, 1);
  assert.equal(
    result.deterministicCore.suppressedProposals[0].reason,
    "duplicate_propagation_edge"
  );
  assert.ok(
    result.warnings.some((warning) =>
      warning.warningId.startsWith("flight-plan-suppressed-")
    )
  );
});

test("get_agentic_os_context_packet composes context, graph refs, and proposal-only receipt obligations", async () => {
  const gateway = buildGateway();
  const actor = buildActor();

  const result = await gateway.callTool(
    "get_agentic_os_context_packet",
    {
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      workContextRef: "work://agentic-os/run-601/context",
      agenticOsRunRef: "run://agentic-os/phase-4-smoke",
      governance: {
        trustRootRef: "trust-root://control-plane/oidc-jwt",
        retentionPolicyRef: "policy://retention/pmo-phase-4-default",
        piiHandlingPolicyRefs: ["policy://pii/no-inline-sensitive-data"]
      },
      targetRefs: [
        "contract://hoplon-authz/escalation-grant@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        "tracker://program-manager-mcp/PMO-001"
      ],
      traversalBudgetRef: "budget://phase-4/agentic-os",
      proposedChange: {
        changeType: "agentic_os_execution",
        summary: "Agentic OS executor refreshes Hoplon authz tracker evidence.",
        targetRefs: [
          "contract://hoplon-authz/escalation-grant@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
          "tracker://program-manager-mcp/PMO-001"
        ]
      },
      traceId: "trace://agentic-os-context",
      correlationId: "corr://agentic-os-context",
      contextAnchor: {
        portfolioId: "portfolio://default",
        programId: "program://agentic-os",
        projectId: "project://program-manager-mcp",
        asOf: "2026-05-03T12:00:00Z"
      }
    },
    actor
  );

  assert.deepEqual(getAgenticOsContextPacketResultSchema.parse(result), result);
  assert.equal(result.toolName, "get_agentic_os_context_packet");
  assert.equal(
    result.deterministicCore.executionBoundary,
    "pmo_passive_analyst_execution_agent_performs_side_effects"
  );
  assert.equal(result.deterministicCore.receiptSubmission.resultToolName, "record_program_receipt");
  assert.equal(
    result.deterministicCore.receiptSubmission.submissionBoundary,
    "execution_agent_submits_receipt_pmo_records_ledger"
  );
  assert.ok(result.deterministicCore.contextPacketRef.startsWith("context-packet://"));
  assert.ok(result.deterministicCore.cpGraphRefs.includes("project://program-manager-mcp"));
  assert.ok(result.deterministicCore.flightPlanCore.expectedReceipts.length > 0);
  assert.ok(result.evidenceRefs.some((ref) => ref.startsWith("evidence://trust-root/")));
  assert.equal(result.redactionSummary.policyRefs.includes("policy://pii/no-inline-sensitive-data"), true);
});

test("record_program_receipt accepts valid receipts once and updates only PMO ledger state", async () => {
  const { gateway, repository } = await buildReceiptGateway();
  const actor = buildActor({
    actorId: "actor://agents/executor-a",
    actorRole: "execution_agent",
    projectGrants: ["project://program-manager-mcp"]
  });
  const request = buildReceiptRequest();

  const first = await gateway.callTool("record_program_receipt", request, actor);
  const duplicate = await gateway.callTool("record_program_receipt", request, actor);

  assert.deepEqual(recordProgramReceiptResultSchema.parse(first), first);
  assert.equal(first.status, "ok");
  assert.equal(first.toolName, "record_program_receipt");
  assert.equal(first.deterministicCore.validation.status, "accepted");
  assert.equal(first.deterministicCore.observedReceipt.status, "accepted");
  assert.equal(first.deterministicCore.reconcileStatus.status, "satisfied");
  assert.equal(duplicate.status, "blocked");
  assert.equal(duplicate.deterministicCore.validation.status, "duplicate");
  assert.equal(duplicate.warnings[0].warningId, "receipt-duplicate-idempotency-key");

  const ledger = await repository.listReceiptLedger({
    scope: { portfolioId: "portfolio://default" },
    receiptRequirementIds: ["receipt://program-action/record-receipt"]
  });
  assert.equal(ledger.observedReceipts.length, 1);
  assert.equal(ledger.actionLedgerEntries.length, 1);
  assert.equal(ledger.reconcileStatuses[0].status, "satisfied");
});

test("submit_agentic_os_receipt routes execution receipts through PMO ledger only", async () => {
  const { gateway, repository } = await buildReceiptGateway();
  const actor = buildActor({
    actorId: "actor://agents/executor-a",
    actorRole: "execution_agent",
    projectGrants: ["project://program-manager-mcp"]
  });

  const result = await gateway.callTool(
    "submit_agentic_os_receipt",
    {
      ...buildReceiptRequest(),
      agenticOsRunRef: "run://agentic-os/phase-4-smoke",
      executionAgentRef: "actor://agents/executor-a",
      governance: {
        trustRootRef: "trust-root://control-plane/oidc-jwt",
        retentionPolicyRef: "policy://retention/pmo-phase-4-default",
        piiHandlingPolicyRefs: ["policy://pii/no-inline-sensitive-data"]
      }
    },
    actor
  );

  assert.deepEqual(submitAgenticOsReceiptResultSchema.parse(result), result);
  assert.equal(result.status, "ok");
  assert.equal(result.toolName, "submit_agentic_os_receipt");
  assert.equal(result.deterministicCore.receiptSubmissionToolName, "record_program_receipt");
  assert.equal(result.deterministicCore.validation.passiveBoundaryPreserved, true);
  assert.equal(result.deterministicCore.validation.status, "accepted");
  assert.equal(result.deterministicCore.receiptCore.validation.status, "accepted");
  assert.ok(result.evidenceRefs.some((ref) => ref.startsWith("evidence://agentic-os/receipt/")));

  const ledger = await repository.listReceiptLedger({
    scope: { portfolioId: "portfolio://default" },
    receiptRequirementIds: ["receipt://program-action/record-receipt"]
  });
  assert.equal(ledger.observedReceipts.length, 1);
  assert.equal(ledger.actionLedgerEntries.length, 1);
});

test("record_program_receipt rejects forged, incomplete, stale, and unauthorized receipts", async () => {
  const { gateway } = await buildReceiptGateway();
  const actor = buildActor({
    actorId: "actor://agents/executor-a",
    actorRole: "execution_agent",
    projectGrants: ["project://program-manager-mcp"]
  });

  const forged = await gateway.callTool(
    "record_program_receipt",
    buildReceiptRequest({
      idempotencyKey: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      receiptDigest: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    }),
    actor
  );
  assert.equal(forged.status, "blocked");
  assert.equal(forged.warnings[0].warningId, "receipt-digest-mismatch");

  const incomplete = await gateway.callTool(
    "record_program_receipt",
    buildReceiptRequest({
      evidenceRefs: [],
      idempotencyKey: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
    }),
    actor
  );
  assert.equal(incomplete.status, "blocked");
  assert.equal(incomplete.warnings[0].warningId, "receipt-required-evidence-missing");

  const stale = await gateway.callTool(
    "record_program_receipt",
    buildReceiptRequest({
      flightPlanStateVersionHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      idempotencyKey: "sha256:2222222222222222222222222222222222222222222222222222222222222222"
    }),
    actor
  );
  assert.equal(stale.status, "blocked");
  assert.equal(stale.warnings[0].warningId, "receipt-stale-flight-plan");

  const unauthorized = await gateway.callTool(
    "record_program_receipt",
    buildReceiptRequest({
      idempotencyKey: "sha256:3333333333333333333333333333333333333333333333333333333333333333"
    }),
    buildActor({
      actorId: "actor://agents/out-of-scope",
      actorRole: "execution_agent",
      projectGrants: ["project://phalanx"]
    })
  );
  assert.equal(unauthorized.status, "blocked");
  assert.equal(unauthorized.warnings[0].warningId, "authz-denied");
});

test("reconcile_program_state reports accepted, lost, and replacement proposal findings", async () => {
  const { gateway } = await buildReceiptGateway();
  const actor = buildActor({
    actorId: "actor://agents/executor-a",
    actorRole: "execution_agent",
    projectGrants: ["project://program-manager-mcp"]
  });

  await gateway.callTool("record_program_receipt", buildReceiptRequest(), actor);

  const result = await gateway.callTool(
    "reconcile_program_state",
    {
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      targetRefs: ["tracker://program-manager-mcp/PMO-502"],
      asOf: "2026-05-03T13:30:00Z",
      lostAfterSeconds: 3600,
      includeCompensatingPlanProposals: true,
      traceId: "trace://reconcile",
      correlationId: "corr://reconcile"
    },
    actor
  );

  assert.deepEqual(reconcileProgramStateResultSchema.parse(result), result);
  assert.equal(result.toolName, "reconcile_program_state");
  assert.equal(result.status, "blocked");
  assert.ok(
    result.deterministicCore.reconcileStatuses.some(
      (status) =>
        status.receiptRequirementId === "receipt://program-action/record-receipt" &&
        status.status === "satisfied"
    )
  );
  assert.ok(
    result.deterministicCore.reconcileStatuses.some(
      (status) =>
        status.receiptRequirementId === "receipt://program-action/record-receipt-b" &&
        status.status === "lost"
    )
  );
  assert.ok(
    result.deterministicCore.reconcileStatuses.some(
      (status) =>
        status.receiptRequirementId === "receipt://program-action/record-receipt-c" &&
        status.status === "stuck"
    )
  );
  assert.ok(result.deterministicCore.findings.some((finding) => finding.type === "receipt_lost"));
  assert.ok(result.deterministicCore.findings.some((finding) => finding.type === "receipt_stuck"));
  assert.ok(result.deterministicCore.compensatingPlanProposals.length > 0);
});

test("reconcile_program_state due policy distinguishes in_flight, late, lost, and stuck", async () => {
  const { gateway } = await buildReceiptGateway();
  const actor = buildActor({
    actorId: "actor://agents/executor-a",
    actorRole: "execution_agent",
    projectGrants: ["project://program-manager-mcp"]
  });
  const baseRequest = {
    portfolioId: "portfolio://default",
    programId: "program://agentic-os",
    targetRefs: ["tracker://program-manager-mcp/PMO-502"],
    lostAfterSeconds: 3600,
    traceId: "trace://reconcile-due",
    correlationId: "corr://reconcile-due"
  };

  const inFlight = await gateway.callTool(
    "reconcile_program_state",
    { ...baseRequest, asOf: "2026-05-03T12:04:00Z" },
    actor
  );
  const late = await gateway.callTool(
    "reconcile_program_state",
    { ...baseRequest, asOf: "2026-05-03T12:10:00Z" },
    actor
  );
  const lost = await gateway.callTool(
    "reconcile_program_state",
    { ...baseRequest, asOf: "2026-05-03T13:30:00Z" },
    actor
  );

  assert.ok(
    inFlight.deterministicCore.reconcileStatuses.some(
      (status) =>
        status.receiptRequirementId === "receipt://program-action/record-receipt-b" &&
        status.status === "in_flight"
    )
  );
  assert.ok(
    late.deterministicCore.reconcileStatuses.some(
      (status) =>
        status.receiptRequirementId === "receipt://program-action/record-receipt-b" &&
        status.status === "late"
    )
  );
  assert.ok(
    lost.deterministicCore.reconcileStatuses.some(
      (status) =>
        status.receiptRequirementId === "receipt://program-action/record-receipt-b" &&
        status.status === "lost"
    )
  );
  assert.ok(
    lost.deterministicCore.reconcileStatuses.some(
      (status) =>
        status.receiptRequirementId === "receipt://program-action/record-receipt-c" &&
        status.status === "stuck"
    )
  );
});

test("reconcile_program_state detects conflicting receipt claims", async () => {
  const { gateway, repository } = await buildReceiptGateway();
  const actor = buildActor({
    actorId: "actor://agents/executor-a",
    actorRole: "execution_agent",
    projectGrants: ["project://program-manager-mcp"]
  });

  await repository.appendObservedReceipt(
    {
      actorId: "actor://agents/executor-a",
      artifactRefs: ["artifact://receipt/conflict"],
      contractRefs: ["contract://hoplon-authz/escalation-grant@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"],
      correlationId: "corr://conflict",
      evidenceRefs: ["evidence://receipt/required"],
      flightPlanHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      flightPlanId: "flightplan://program-action/record-receipt",
      idempotencyKey: "sha256:9999999999999999999999999999999999999999999999999999999999999999",
      observedAt: "2026-05-03T12:10:00Z",
      observedReceiptId: "receipt-observed://program-action/conflict",
      observedStateRefs: ["tracker://program-manager-mcp/other-task"],
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      projectId: "project://program-manager-mcp",
      proposedActionId: "action://program-action/record-receipt",
      receiptDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      receiptRequirementId: "receipt://program-action/record-receipt",
      receiptType: "tracker_update_receipt",
      recordedAt: "2026-05-03T12:10:00Z",
      status: "accepted",
      summary: "Conflicting observed target.",
      traceId: "trace://conflict"
    },
    {
      eventId: "event://receipt/conflict",
      portfolioId: "portfolio://default",
      eventType: "record_program_receipt.accepted",
      recordedAt: "2026-05-03T12:10:00Z",
      evidenceRefs: ["evidence://receipt/required"],
      artifactRefs: []
    }
  );

  const result = await gateway.callTool(
    "reconcile_program_state",
    {
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      targetRefs: ["tracker://program-manager-mcp/PMO-502"],
      asOf: "2026-05-03T12:15:00Z",
      traceId: "trace://reconcile-conflict",
      correlationId: "corr://reconcile-conflict"
    },
    actor
  );

  assert.deepEqual(reconcileProgramStateResultSchema.parse(result), result);
  assert.equal(result.status, "blocked");
  assert.ok(
    result.deterministicCore.findings.some(
      (finding) => finding.type === "receipt_state_conflict"
    )
  );
  assert.ok(
    result.deterministicCore.reconcileStatuses.some(
      (status) => status.status === "conflicting" && status.conflictingCount > 0
    )
  );
});

test("query_program_context skips stale adapters and caps degraded adapter reads", async () => {
  const actor = buildActor({ projectGrants: ["project://healthy"] });
  const readLimits = new Map();
  const readCalled = [];
  const registryReads = [];
  const adapterRegistry = {
    async assertNoMutationAuthority() {},
    listManifests() {
      return [
        {
          adapterId: "adapter-healthy",
          adapterVersion: "1.0.0",
          capabilityDomains: ["program_summary", "tracker_board", "contract_context"],
          redactionPolicyRefs: ["policy://redaction/pointer-only-v1"]
        },
        {
          adapterId: "adapter-degraded",
          adapterVersion: "1.0.0",
          capabilityDomains: ["program_summary", "tracker_board"],
          redactionPolicyRefs: ["policy://redaction/pointer-only-v1"]
        },
        {
          adapterId: "adapter-stale",
          adapterVersion: "1.0.0",
          capabilityDomains: ["program_summary", "tracker_board"],
          redactionPolicyRefs: ["policy://redaction/pointer-only-v1"]
        }
      ];
    },
    async listCapabilities() {
      return [];
    },
    async getHealth(adapterId) {
      if (adapterId === "adapter-healthy") {
        return {
          adapterId,
          status: "healthy",
          reasons: [],
          cursor: "cursor://adapter-healthy/current",
          observedAt: "2026-05-03T12:00:00Z",
          checkedAt: "2026-05-03T12:00:00Z",
          maxStaleCursorSeconds: 300
        };
      }
      if (adapterId === "adapter-degraded") {
        return {
          adapterId,
          status: "degraded",
          reasons: ["degraded source cursor age"],
          cursor: "cursor://adapter-degraded/current",
          observedAt: "2026-05-03T12:00:00Z",
          checkedAt: "2026-05-03T12:00:00Z",
          maxStaleCursorSeconds: 300
        };
      }

      return {
        adapterId,
        status: "stale",
        reasons: ["stale cursor"],
        cursor: "cursor://adapter-stale/current",
        observedAt: "2026-05-03T12:00:00Z",
        checkedAt: "2026-05-03T12:00:00Z",
        maxStaleCursorSeconds: 300
      };
    },
    async getSourceCursor() {
      return {
        adapterId: "adapter-healthy",
        portfolioId: "portfolio://default",
        cursor: "cursor://adapter-healthy/current",
        observedAt: "2026-05-03T12:00:00Z",
        sourceRevisionHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        status: "current"
      };
    },
    async readState(adapterId, request, _now) {
      readCalled.push(adapterId);
      readLimits.set(adapterId, request.limit);
      registryReads.push(adapterId);

      if (adapterId === "adapter-stale") {
        throw new Error("stale adapter should not be called");
      }

      const observations =
        adapterId === "adapter-degraded"
          ? [
              {
                kind: "contract",
                ref: "contract://degraded-a",
                reason: "degraded signal",
                status: "active",
                evidenceRefs: ["artifact://degraded/a"],
                artifactRefs: ["artifact://degraded/a"]
              },
              {
                kind: "contract",
                ref: "contract://degraded-b",
                reason: "degraded signal",
                status: "active",
                evidenceRefs: ["artifact://degraded/b"],
                artifactRefs: ["artifact://degraded/b"]
              }
            ]
          : [
              {
                kind: "project",
                ref: "project://healthy",
                reason: "healthy signal",
                status: "active",
                evidenceRefs: ["artifact://healthy/project"],
                artifactRefs: []
              }
            ];
      return {
        adapterId,
        sourceCursor: `cursor://${adapterId}/current`,
        observedAt: "2026-05-03T12:00:00Z",
        observations,
        artifactRefs: [...observations.flatMap((item) => item.artifactRefs)],
        evidenceRefs: [...observations.flatMap((item) => item.evidenceRefs)],
        truncated: observations.length > (request.limit ?? 0),
        omittedRefCount: Math.max(0, observations.length - (request.limit ?? 0)),
        omittedRefs: [],
        redactionSummary: {
          redacted: false,
          omittedKinds: [],
          policyRefs: ["policy://redaction/pointer-only-v1"]
        }
      };
    },
    async assessImpact() {
      return {
        adapterId: "adapter-healthy",
        status: "ok",
        sourceCursor: "cursor://adapter-healthy/current",
        affectedRefs: [],
        findings: [],
        evidenceRefs: [],
        artifactRefs: [],
        redactionSummary: {
          redacted: false,
          omittedKinds: [],
          policyRefs: ["policy://redaction/pointer-only-v1"]
        },
        requestId: "adapter"
      };
    },
    async reconcileState() {},
    async produceEvidenceRefs(input) {
      return input.evidenceRefs;
    }
  };

  const repository = {
    async listPrograms() {
      return [];
    },
    async listProjects() {
      return [];
    },
    async getProgramContext() {
      return {
        contextAnchor: {
          portfolioId: "portfolio://default",
          asOf: "2026-05-03T12:00:00Z"
        },
        matchedRefs: [],
        omittedRefCount: 0
      };
    },
    async assessImpact() {
      return {
        affectedRefs: [],
        findings: [],
        requiredApprovals: [],
        evidenceObligations: []
      };
    },
    async listRelationships() {
      return [];
    },
    async listEvidenceRefs(_scope, refs) {
      return refs.map((ref) => ({ evidenceRef: ref, artifactRef: undefined }));
    },
    async listArtifactRefs() {
      return [];
    },
    async listDecisions() {
      return [];
    },
    async getSyncCursors() {
      return [];
    }
  };

  const gateway = new ProgramManagerMcpGateway(
    new ProgramToolService({
      repository,
      adapterRegistry,
      now: () => "2026-05-03T12:00:00Z"
    })
  );
  const result = await gateway.callTool(
    "query_program_context",
    {
      portfolioId: "portfolio://default",
      queryKind: "program_summary",
      targetRefs: ["project://healthy"],
      traceId: "trace://query-health-policy",
      correlationId: "corr://query-health-policy",
      limit: 3
    },
    actor
  );

  assert.equal(result.toolName, "query_program_context");
  assert.equal(result.status, "warning");
  assert.equal(registryReads.includes("adapter-stale"), false);
  assert.equal(readLimits.get("adapter-degraded"), 1);
  assert.equal(readCalled.includes("adapter-healthy"), true);
  assert.ok(
    result.warnings.some((warning) => warning.warningId === "adapter-health-adapter-stale")
  );
  assert.equal(result.deterministicCore.matchedRefs.length > 0, true);
});

test("get_program_audit_trail filters pointer-only audit entries", async () => {
  const fixture = getBackboneRepositoryFixture();
  fixture.events = [
    {
      eventId: "event://program-manager-mcp/context-panes-complete",
      portfolioId: "portfolio://default",
      eventType: "task_completed",
      recordedAt: "2026-05-03T12:05:00Z",
      contextAnchor: {
        portfolioId: "portfolio://default",
        programId: "program://agentic-os",
        projectId: "project://program-manager-mcp",
        asOf: "2026-05-03T12:05:00Z"
      },
      evidenceRefs: ["tracker://program-manager-mcp/PMO-001"],
      artifactRefs: [
        "artifact://pmo/alignment-report/2026-05-03@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      ]
    },
    {
      eventId: "event://program-manager-mcp/report-regenerated",
      portfolioId: "portfolio://default",
      eventType: "report_generated",
      recordedAt: "2026-05-03T12:04:00Z",
      contextAnchor: {
        portfolioId: "portfolio://default",
        programId: "program://agentic-os",
        projectId: "project://program-manager-mcp",
        asOf: "2026-05-03T12:04:00Z"
      },
      evidenceRefs: [
        "artifact://pmo/alignment-report/2026-05-03@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      ],
      artifactRefs: [
        "artifact://pmo/alignment-report/2026-05-03@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      ],
      logs: ["forbidden inline audit body"]
    }
  ];
  const repository = InMemoryProgramManagerRepository.fromFixture(fixture);
  const adapterRegistry = new AdapterRegistry([new HoplonAdapterStub(), new TrackerAdapterStub()]);
  const service = new ProgramToolService({
    repository,
    adapterRegistry,
    now: () => "2026-05-03T12:06:00Z"
  });
  const gateway = new ProgramManagerMcpGateway(service);

  const result = await gateway.callTool(
    "get_program_audit_trail",
    {
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      eventTypes: ["task_completed"],
      targetRefs: ["tracker://program-manager-mcp/PMO-001"],
      since: "2026-05-03T12:00:00Z",
      until: "2026-05-03T12:06:00Z",
      limit: 1,
      traceId: "trace://audit",
      correlationId: "corr://audit",
      contextAnchor: {
        portfolioId: "portfolio://default",
        programId: "program://agentic-os",
        asOf: "2026-05-03T12:06:00Z"
      }
    },
    buildActor()
  );

  assert.deepEqual(getProgramAuditTrailResultSchema.parse(result), result);
  assert.equal(result.status, "ok");
  assert.equal(result.deterministicCore.auditEntries.length, 1);
  assert.equal(
    result.deterministicCore.auditEntries[0].eventId,
    "event://program-manager-mcp/context-panes-complete"
  );
  assert.equal("logs" in result.deterministicCore.auditEntries[0], false);
  assert.deepEqual(result.deterministicCore.auditEntries[0].evidenceRefs, [
    "tracker://program-manager-mcp/PMO-001"
  ]);
  assert.ok(result.redactionSummary.omittedKinds.includes("audit_log_body"));
});

test("get_program_audit_trail reports bounded audit windows", async () => {
  const fixture = getBackboneRepositoryFixture();
  fixture.events = [
    {
      eventId: "event://program-manager-mcp/second",
      portfolioId: "portfolio://default",
      eventType: "report_generated",
      recordedAt: "2026-05-03T12:05:00Z",
      evidenceRefs: ["tracker://program-manager-mcp/PMO-002"],
      artifactRefs: []
    },
    {
      eventId: "event://program-manager-mcp/first",
      portfolioId: "portfolio://default",
      eventType: "task_completed",
      recordedAt: "2026-05-03T12:04:00Z",
      evidenceRefs: ["tracker://program-manager-mcp/PMO-001"],
      artifactRefs: []
    }
  ];
  const repository = InMemoryProgramManagerRepository.fromFixture(fixture);
  const adapterRegistry = new AdapterRegistry([new HoplonAdapterStub(), new TrackerAdapterStub()]);
  const service = new ProgramToolService({
    repository,
    adapterRegistry,
    now: () => "2026-05-03T12:06:00Z"
  });
  const gateway = new ProgramManagerMcpGateway(service);

  const result = await gateway.callTool(
    "get_program_audit_trail",
    {
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      limit: 1,
      traceId: "trace://audit-bounded",
      correlationId: "corr://audit-bounded"
    },
    buildActor()
  );

  assert.deepEqual(getProgramAuditTrailResultSchema.parse(result), result);
  assert.equal(result.status, "warning");
  assert.equal(result.deterministicCore.omittedEntryCount, 1);
  assert.equal(result.warnings[0].warningId, "audit-trail-bounded");
  assert.equal(result.deterministicCore.auditEntries[0].eventId, "event://program-manager-mcp/second");
});

test("assess_program_impact ignores stale adapters and caps degraded findings", async () => {
  const actor = buildActor({ projectGrants: ["project://degraded-a"] });
  const adapterRegistry = {
    async assertNoMutationAuthority() {},
    listManifests() {
      return [
        {
          adapterId: "adapter-degraded",
          adapterVersion: "1.0.0",
          capabilityDomains: ["program_summary", "contract_context"],
          redactionPolicyRefs: ["policy://redaction/pointer-only-v1"]
        },
        {
          adapterId: "adapter-stale",
          adapterVersion: "1.0.0",
          capabilityDomains: ["program_summary", "contract_context"],
          redactionPolicyRefs: ["policy://redaction/pointer-only-v1"]
        },
        {
          adapterId: "adapter-unavailable",
          adapterVersion: "1.0.0",
          capabilityDomains: ["program_summary", "contract_context"],
          redactionPolicyRefs: ["policy://redaction/pointer-only-v1"]
        }
      ];
    },
    async listCapabilities() {
      return [];
    },
    async getHealth(adapterId) {
      if (adapterId === "adapter-degraded") {
        return {
          adapterId,
          status: "degraded",
          reasons: ["circuit has degraded confidence"],
          cursor: "cursor://adapter-degraded/current",
          observedAt: "2026-05-03T12:00:00Z",
          checkedAt: "2026-05-03T12:00:00Z",
          maxStaleCursorSeconds: 300
        };
      }
      if (adapterId === "adapter-stale") {
        return {
          adapterId,
          status: "stale",
          reasons: ["cursor stale"],
          cursor: "cursor://adapter-stale/current",
          observedAt: "2026-05-03T12:00:00Z",
          checkedAt: "2026-05-03T12:00:00Z",
          maxStaleCursorSeconds: 300
        };
      }
      return {
        adapterId,
        status: "unavailable",
        reasons: ["temporarily unavailable"],
        cursor: "cursor://adapter-unavailable/current",
        observedAt: "2026-05-03T12:00:00Z",
        checkedAt: "2026-05-03T12:00:00Z",
        maxStaleCursorSeconds: 300
      };
    },
    async getSourceCursor(adapterId) {
      return {
        adapterId,
        portfolioId: "portfolio://default",
        cursor: `cursor://${adapterId}/current`,
        observedAt: "2026-05-03T12:00:00Z",
        sourceRevisionHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        status: "current"
      };
    },
    async readState() {
      return {
        adapterId: "adapter-degraded",
        sourceCursor: "cursor://adapter-degraded/current",
        observedAt: "2026-05-03T12:00:00Z",
        observations: [],
        artifactRefs: [],
        evidenceRefs: [],
        truncated: false,
        omittedRefCount: 0,
        omittedRefs: [],
        redactionSummary: {
          redacted: false,
          omittedKinds: [],
          policyRefs: ["policy://redaction/pointer-only-v1"]
        }
      };
    },
    async assessImpact(adapterId) {
      if (adapterId === "adapter-degraded") {
        return {
          adapterId,
          status: "warning",
          sourceCursor: "cursor://adapter-degraded/current",
          affectedRefs: [
            { kind: "project", ref: "project://degraded-a", reason: "first reason" },
            { kind: "project", ref: "project://degraded-b", reason: "second reason" }
          ],
          findings: [
            {
              findingId: "finding-degraded-a",
              severity: "high",
              type: "degraded_risk",
              evidenceRefs: ["artifact://degraded/a"],
              summary: "first degraded finding"
            },
            {
              findingId: "finding-degraded-b",
              severity: "medium",
              type: "degraded_risk",
              evidenceRefs: ["artifact://degraded/b"],
              summary: "second degraded finding"
            }
          ],
          evidenceRefs: ["artifact://degraded/finding"],
          artifactRefs: [],
          redactionSummary: {
            redacted: false,
            omittedKinds: [],
            policyRefs: ["policy://redaction/pointer-only-v1"]
          },
          requestId: "adapter-impact"
        };
      }

      return {
        adapterId,
        status: "blocked",
        sourceCursor: "cursor://adapter-stale/current",
        affectedRefs: [],
        findings: [],
        evidenceRefs: [],
        artifactRefs: [],
        redactionSummary: {
          redacted: false,
          omittedKinds: [],
          policyRefs: ["policy://redaction/pointer-only-v1"]
        },
        requestId: "adapter-impact"
      };
    },
    async reconcileState() {},
    async produceEvidenceRefs(input) {
      return input.evidenceRefs;
    }
  };

  const repository = {
    async listPrograms() {
      return [];
    },
    async listProjects() {
      return [];
    },
    async assessImpact() {
      return {
        affectedRefs: [{ kind: "project", ref: "project://base", reason: "repo reason" }],
        findings: [],
        requiredApprovals: [],
        evidenceObligations: []
      };
    },
    async listEvidenceRefs(_scope, refs) {
      return refs.map((ref) => ({ evidenceRef: ref, artifactRef: undefined }));
    },
    async listArtifactRefs() {
      return [];
    },
    async getSyncCursors() {
      return [];
    }
  };

  const gateway = new ProgramManagerMcpGateway(
    new ProgramToolService({
      repository,
      adapterRegistry,
      now: () => "2026-05-03T12:00:00Z"
    })
  );

  const result = await gateway.callTool(
    "assess_program_impact",
    {
      portfolioId: "portfolio://default",
      changeRef: "change://program-manager-mcp/c0-test",
      changeKind: "policy_update",
      targetRefs: ["project://degraded-a"],
      traversalBudgetRef: "budget://phase-1a/default",
      traceId: "trace://impact-health-policy",
      correlationId: "corr://impact-health-policy"
    },
    actor
  );

  const cappedFinding = "finding-degraded-a";
  assert.equal(result.toolName, "assess_program_impact");
  assert.equal(result.status, "warning");
  assert.equal(result.deterministicCore.findings[0]?.findingId, cappedFinding);
  assert.equal(result.deterministicCore.affectedRefs[0]?.ref, "project://base");
  assert.ok(result.warnings.some((warning) => warning.warningId === "adapter-health-adapter-degraded"));
  assert.ok(result.warnings.some((warning) => warning.warningId === "adapter-health-adapter-stale"));
});

test("query_program_context returns Phase 1B context packet panes", async () => {
  const fixture = getBackboneRepositoryFixture();
  fixture.relationships = [
    ...fixture.relationships,
    {
      dependencyId: "blocked-phalanx-hoplon-authz",
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      fromRef: "project://phalanx",
      toRef: "contract://hoplon-authz/escalation-grant@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      dependencyType: "consumes_contract",
      criticality: "tier_1",
      status: "blocked",
      recordedAt: "2026-05-03T12:00:00Z",
      validFrom: "2026-05-03T00:00:00Z",
      evidenceRefs: ["tracker://program-manager-mcp/PMO-001"],
      policyRefs: ["policy://active-adapters/hoplon-authz-tier1"],
      sourceAdapterId: "fixture-loader",
      sourceCursor: "snapshot:v1"
    }
  ];
  fixture.decisions = [
    ...fixture.decisions,
    {
      decisionId: "decision://agentic-os/superseded-authz-path",
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      summary: "Previous authz path is superseded.",
      status: "superseded",
      recordedAt: "2026-05-03T12:00:00Z",
      validFrom: "2026-05-02T00:00:00Z",
      validTo: "2026-05-03T00:00:00Z",
      evidenceRefs: ["tracker://program-manager-mcp/PMO-001"]
    },
    {
      decisionId: "decision://agentic-os/discarded-inline-reporting",
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      summary: "Inline report payloads were rejected.",
      status: "discarded",
      recordedAt: "2026-05-03T12:00:00Z",
      validFrom: "2026-05-03T00:00:00Z",
      evidenceRefs: ["tracker://program-manager-mcp/PMO-001"]
    },
    {
      decisionId: "decision://agentic-os/future-approval-contract",
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      summary: "Future approval contract is not applicable to this anchor.",
      status: "future_not_applicable",
      recordedAt: "2026-05-03T12:00:00Z",
      validFrom: "2026-05-04T00:00:00Z",
      evidenceRefs: ["tracker://program-manager-mcp/PMO-001"]
    }
  ];
  const repository = InMemoryProgramManagerRepository.fromFixture(fixture);
  const adapterRegistry = new AdapterRegistry([new HoplonAdapterStub(), new TrackerAdapterStub()]);
  const service = new ProgramToolService({
    repository,
    adapterRegistry,
    now: () => "2026-05-03T12:00:00Z"
  });
  const gateway = new ProgramManagerMcpGateway(service);

  const result = await gateway.callTool(
    "query_program_context",
    {
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      queryKind: "program_summary",
      targetRefs: ["project://phalanx", "tracker://program-manager-mcp/PMO-001"],
      contextAnchor: {
        portfolioId: "portfolio://default",
        programId: "program://agentic-os",
        branchName: "main",
        gitCommit: "abc123def456",
        trackerSlug: "program-manager-mcp",
        trackerRev: 12,
        asOf: "2026-05-03T12:00:00Z"
      },
      limit: 8,
      traceId: "trace://context-panes",
      correlationId: "corr://context-panes"
    },
    buildActor()
  );

  assert.deepEqual(queryProgramContextResultSchema.parse(result), result);
  const panes = result.deterministicCore.contextPanes;
  assert.ok(panes.currentState.some((item) => item.ref === "project://phalanx"));
  assert.ok(
    panes.blockingDependencies.some(
      (item) => item.ref === "dependency://blocked-phalanx-hoplon-authz"
    )
  );
  assert.ok(panes.applicableDecisions.length > 0);
  assert.ok(
    panes.supersededDecisions.some(
      (item) => item.ref === "decision://agentic-os/superseded-authz-path"
    )
  );
  assert.ok(
    panes.discardedDecisions.some(
      (item) => item.ref === "decision://agentic-os/discarded-inline-reporting"
    )
  );
  assert.ok(
    panes.futureDecisions.some(
      (item) => item.ref === "decision://agentic-os/future-approval-contract"
    )
  );
  assert.ok(panes.staleEvidence.some((item) => item.ref === "tracker://program-manager-mcp/PMO-001"));
  assert.ok(
    panes.recommendedActions.some((item) => item.actionType === "review_stale_evidence")
  );
  assert.ok(
    panes.recommendedActions.every((item) => item.evidenceRefs.every((ref) => ref.includes("://")))
  );
});

test("generate_program_update is deterministic across regenerations and keeps section ordering", async () => {
  const gateway = buildGateway();
  const actor = buildActor();
  const request = {
    portfolioId: "portfolio://default",
    programId: "program://agentic-os",
    reportAudience: "leadership",
    maxSections: 3,
    traceId: "trace://regen-update",
    correlationId: "corr://regen-update",
    contextAnchor: {
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      asOf: "2026-05-03T12:00:00Z"
    }
  };

  const first = await gateway.callTool("generate_program_update", request, actor);
  const second = await gateway.callTool("generate_program_update", request, actor);
  const firstCore = generateProgramUpdateResultSchema.parse(first);
  const secondCore = generateProgramUpdateResultSchema.parse(second);

  assert.deepEqual(generateProgramUpdateResultSchema.parse(first), first);
  assert.equal(firstCore.toolName, "generate_program_update");
  assert.equal(firstCore.stateVersionHash, secondCore.stateVersionHash);
  assert.equal(
    firstCore.deterministicCore.evidenceEnvelopeRef,
    secondCore.deterministicCore.evidenceEnvelopeRef
  );
  assert.deepEqual(
    firstCore.deterministicCore.sectionRefs,
    [...firstCore.deterministicCore.sectionRefs].sort((left, right) => left.localeCompare(right))
  );
  assert.deepEqual(
    firstCore.deterministicCore.sections.map((section) => section.sectionId),
    [...firstCore.deterministicCore.sections.map((section) => section.sectionId)].sort()
  );
  assert.equal(firstCore.evidenceRefs[0]?.includes("://"), true);
  assert.equal(firstCore.artifactRefs.length, secondCore.artifactRefs.length);
  assert.equal(
    firstCore.deterministicCore.evidenceEnvelope.inputRefs.length,
    secondCore.deterministicCore.evidenceEnvelope.inputRefs.length
  );
  const firstEnvelopeWithoutGeneratedAt = {
    ...firstCore.deterministicCore.evidenceEnvelope,
    generatedAt: "normalized"
  };
  const secondEnvelopeWithoutGeneratedAt = {
    ...secondCore.deterministicCore.evidenceEnvelope,
    generatedAt: "normalized"
  };
  assert.deepEqual(firstEnvelopeWithoutGeneratedAt, secondEnvelopeWithoutGeneratedAt);
});
