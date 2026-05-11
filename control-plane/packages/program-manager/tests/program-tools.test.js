import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  analyzeProgramIntelligenceResultSchema,
  assessProgramImpactResultSchema,
  getAgenticOsContextPacketResultSchema,
  getProgramDocumentationResultSchema,
  getProgramAuditTrailResultSchema,
  listProgramCapabilitiesResultSchema,
  generateProgramUpdateResultSchema,
  manageEvidenceItemsResultSchema,
  manageIntegrationsResultSchema,
  manageProjectsResultSchema,
  planProgramActionResultSchema,
  pmoHelpResultSchema,
  pmoMacroResultSchema,
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

const MANAGE_INTEGRATION_ACTIONS = [
  "help",
  "list",
  "get",
  "create",
  "upsert",
  "update",
  "rename",
  "retire",
  "delete",
  "add_project",
  "remove_project",
  "add_artifact",
  "record_goal",
  "acknowledge_goal",
  "submit_gap_report",
  "update_gap",
  "record_blocker",
  "update_blocker",
  "assign_blocker_owner",
  "mark_blocker_unblocked",
  "mark_blocker_resolved",
  "reopen_blocker",
  "identify_blockers",
  "request_decision",
  "record_decision",
  "submit_project_response",
  "record_conflict",
  "record_learning",
  "link_tracker_ref",
  "inbox",
  "catch_up",
  "supersede"
];

const MANAGE_PROJECT_ACTIONS = [
  "help",
  "list",
  "get",
  "create",
  "upsert",
  "update",
  "rename",
  "retire",
  "add_project",
  "remove_project",
  "set_project_role",
  "link_tracker",
  "link_repo",
  "link_adapter",
  "record_goal"
];

const RETIRED_INTEGRATION_ACTIONS = [
  "help",
  "list",
  "get",
  "update",
  "rename",
  "retire",
  "delete",
  "inbox",
  "catch_up"
];

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

function buildGateway(overrides = {}) {
  const repository = InMemoryProgramManagerRepository.fromFixture(getBackboneRepositoryFixture());
  const adapterRegistry = new AdapterRegistry([new HoplonAdapterStub(), new TrackerAdapterStub()]);
  const service = new ProgramToolService({
    repository,
    adapterRegistry,
    now: () => "2026-05-03T12:00:00Z",
    ...overrides
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

function getMacroFixtureRepository() {
  const fixture = JSON.parse(
    readFileSync(
      join(process.cwd(), "../../../docs/phase-5/fixtures/pmo-macro-fixture-universe.example.json"),
      "utf8"
    )
  );
  return InMemoryProgramManagerRepository.fromFixture({
    macroTasks: fixture.seedGraph.tasks,
    macroBlockers: fixture.seedGraph.blockers,
    macroContracts: fixture.seedGraph.contracts,
    macroDependencyEdges: fixture.seedGraph.dependencyEdges,
    macroRunbooks: fixture.seedGraph.runbooks
  });
}

test("gateway lists pmo_help for bootstrap and pmo_macro for macro dispatch", () => {
  const gateway = buildGateway();

  assert.deepEqual(
    gateway.listTools().map((tool) => tool.name),
    ["pmo_help", "manage_projects", "manage_integrations", "manage_evidence_items", "pmo_macro"]
  );
});

test("pmo_help returns autonomous-agent bootstrap guidance without macro-shaped input", async () => {
  const gateway = buildGateway();
  const actor = buildActor({
    actorId: "actor://operators/pmo-agent",
    actorRole: "program_manager_agent",
    authenticatedAt: "2026-05-04T05:00:00Z",
    expiresAt: "2026-05-04T08:00:00Z"
  });

  const help = await gateway.callTool(
    "pmo_help",
    {
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      traceId: "trace://pmo-help/bootstrap",
      correlationId: "corr://pmo-help/bootstrap"
    },
    actor
  );
  assert.deepEqual(pmoHelpResultSchema.parse(help), help);
  assert.equal(help.toolName, "pmo_help");
  assert.equal(help.stateVersionHash, undefined);
  assert.deepEqual(
    help.deterministicCore.registry.macros.map((macro) => macro.macroName),
    ["analyze_blockers", "catch_me_up", "detect_drift", "propose_unblock_plan", "simulate_impact"]
  );
  assert.equal(help.deterministicCore.helpGuide.docsAvailableToAgents, false);
  assert.equal(
    help.deterministicCore.helpGuide.canonicalScope.integrationRef,
    "integration://agentic-os/shared-flow"
  );
  assert.deepEqual(help.deterministicCore.helpGuide.canonicalScope.projectIds, [
    "project://hoplon",
    "project://phalanx",
    "project://semantix"
  ]);
  assert.ok(
    help.deterministicCore.helpGuide.firstAgentInstruction.includes(
      "Do not proceed from local repo context alone"
    )
  );
  assert.ok(
    help.deterministicCore.helpGuide.recommendedCalls.some(
      (call) =>
        call.toolName === "pmo_macro" &&
        call.arguments.macroId === "macro://pmo/catch_me_up" &&
        call.arguments.input.targetRefs.includes("integration://agentic-os/shared-flow")
    )
  );
  assert.ok(
    help.deterministicCore.helpGuide.recommendedCalls.some(
      (call) =>
        call.toolName === "manage_integrations" &&
        call.arguments.action === "get" &&
        call.arguments.integration.integrationPointId === "integration://agentic-os/shared-flow"
    )
  );
  assert.equal(help.deterministicCore.helpGuide.receiptPath.submitTool, "submit_agentic_os_receipt");
  assert.ok(
    help.deterministicCore.helpGuide.toolCatalog.some(
      (tool) =>
        tool.toolName === "manage_integrations" &&
        tool.actions.includes("list") &&
        tool.actions.includes("upsert") &&
        tool.actions.includes("update") &&
        tool.actions.includes("add_project") &&
        tool.actions.includes("remove_project") &&
        tool.actions.includes("retire") &&
        tool.actions.includes("delete") &&
        tool.mutatesPmoState === true
    )
  );
  assert.equal(help.deterministicCore.guidance.integrationRegistrationTool.toolName, "manage_integrations");
  assert.equal(help.deterministicCore.guidance.integrationRegistrationTool.action, "upsert");
  assert.ok(
    help.deterministicCore.guidance.integrationRegistrationTool.registrationInputs.some((input) =>
      input.includes("producerProjectId")
    )
  );
  assert.ok(
    help.deterministicCore.guidance.integrationRegistrationTool.registrationInputs.some((input) =>
      input.includes("integration.artifactRef")
    )
  );
  assert.ok(
    help.deterministicCore.guidance.integrationRegistrationTool.coordinationInputs.some((input) =>
      input.includes("record_blocker")
    )
  );
  assert.ok(
    help.deterministicCore.guidance.integrationRegistrationTool.agentHandoffWorkflow.some((step) =>
      step.includes("manage_integrations get")
    )
  );
  assert.ok(
    help.deterministicCore.guidance.integrationRegistrationTool.contractAlignmentPattern.some((step) =>
      step.includes("integration://amg/phalanx-contract")
    )
  );
  assert.deepEqual(help.deterministicCore.guidance.omniToolContract.publicTools, [
    "pmo_help",
    "manage_projects",
    "manage_integrations",
    "manage_evidence_items",
    "pmo_macro"
  ]);
  assert.equal(
    help.deterministicCore.guidance.omniToolContract.canonicalDomainTools.integrationLifecycle,
    "manage_integrations"
  );
  assert.ok(
    help.deterministicCore.guidance.omniToolContract.authorityPolicy.defaultRules.some(
      (rule) => rule.actor === "reporter_or_blocked_project" && rule.may.includes("resolve")
    )
  );
  assert.match(
    help.deterministicCore.helpGuide.operatingRules.join("\n"),
    /Canonicalize set-like ref arrays/
  );
  assert.match(
    help.deterministicCore.guidance.canonicalRefOrdering.callerAction,
    /Sort projectIds, targetRefs, evidenceRefs, artifactRefs, consumerProjectIds, managedRefs/
  );
  assert.match(
    help.deterministicCore.guidance.omniToolContract.writePolicy.staleUpdate,
    /stale state hash/
  );
  assert.ok(
    help.deterministicCore.guidance.toolCatalog.some(
      (tool) =>
        tool.toolName === "manage_integrations" &&
        tool.actions.includes("update") &&
        tool.actions.includes("add_project") &&
        tool.actions.includes("remove_project") &&
        tool.actions.includes("retire") &&
        tool.actions.includes("delete") &&
        tool.actions.includes("upsert")
    )
  );
  assert.ok(help.deterministicCore.objectModelRefs.includes("project://hoplon"));
  assert.equal(help.nextRecommendedTool, "manage_integrations");
});

test("pmo_help surfaces the shared PMO knowledge authority for agents", async () => {
  const gateway = buildGateway({
    runtimeKnowledge: {
      backend: "shared-pmo-knowledge",
      databaseRef: "artifact://program-manager/state/backend/shared-pmo-knowledge@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      firstAgentInstruction:
        "This MCP process is a stateless frontend over the shared PMO knowledge store; use PMO tools as the source of truth.",
      gaps: [],
      operatingRules: [
        "All Program Manager MCP instances must point at the same shared PMO knowledge store; writes through one instance are shared PMO knowledge for every other instance."
      ],
      sharedAcrossMcpInstances: true,
      sourceRef: "artifact://program-manager/state/source/shared-pmo-knowledge",
      statefulAuthority: "shared_pmo_knowledge_store",
      status: "ok",
      systemRef: "system://program-manager/shared-knowledge"
    }
  });

  const help = await gateway.callTool(
    "pmo_help",
    {
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      traceId: "trace://pmo-help/shared-knowledge",
      correlationId: "corr://pmo-help/shared-knowledge"
    },
    buildActor()
  );

  assert.deepEqual(pmoHelpResultSchema.parse(help), help);
  assert.equal("backend" in help.deterministicCore.guidance.knowledgeAuthority, false);
  assert.equal("databaseRef" in help.deterministicCore.guidance.knowledgeAuthority, false);
  assert.equal(help.deterministicCore.guidance.knowledgeAuthority.sharedAcrossMcpInstances, true);
  assert.equal(
    help.deterministicCore.guidance.knowledgeAuthority.statefulAuthority,
    "shared_pmo_knowledge_store"
  );
  assert.equal(help.deterministicCore.guidance.knowledgeAuthority.systemRef, "system://program-manager/shared-knowledge");
  assert.ok(
    help.deterministicCore.helpGuide.firstAgentInstruction.includes("stateless frontend over the shared PMO")
  );
  assert.ok(
    help.deterministicCore.helpGuide.operatingRules.some((rule) =>
      rule.includes("same shared PMO knowledge store")
    )
  );
  assert.ok(
    help.deterministicCore.guidance.runtimeGapHandling.some((rule) =>
      rule.includes("sharedAcrossMcpInstances")
    )
  );
  assert.equal(
    help.warnings.some((warning) => warning.warningId === "pmo-runtime-knowledge-authority-gap"),
    false
  );
});

test("pmo_help names optional integration coordination values for external agents", async () => {
  const gateway = buildGateway();
  const actor = buildActor({
    actorId: "actor://operators/pmo-agent",
    actorRole: "program_manager_agent",
    authenticatedAt: "2026-05-04T05:00:00Z",
    expiresAt: "2026-05-04T08:00:00Z"
  });

  const help = await gateway.callTool(
    "pmo_help",
    {
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      traceId: "trace://pmo-help/integration-values",
      correlationId: "corr://pmo-help/integration-values"
    },
    actor
  );

  assert.deepEqual(pmoHelpResultSchema.parse(help), help);
  const guidance = help.deterministicCore.guidance;
  const integrationGuidance = guidance.integrationRegistrationTool;
  const valueGuidance = integrationGuidance.schemaVsValueGuidance.join("\n");
  const optionalValues = integrationGuidance.optionalValueToShare.join("\n");
  const registrationInputs = integrationGuidance.registrationInputs.join("\n");
  const coordinationInputs = integrationGuidance.coordinationInputs.join("\n");
  const gapClosureWorkflow = integrationGuidance.gapClosureWorkflow.join("\n");
  const handoffWorkflow = integrationGuidance.agentHandoffWorkflow.join("\n");
  const contractAlignmentPattern = integrationGuidance.contractAlignmentPattern.join("\n");

  assert.match(
    valueGuidance,
    /Contracts, dependencies, blockers, gaps, decisions, project responses, learnings, tracker refs, and validation evidence are optional value payloads/,
    "schema-vs-value guidance names the optional integration value surface"
  );
  assert.match(
    optionalValues,
    /contracts: optional pointer refs.*Use integration\.artifactRef/,
    "contract guidance names the optional artifact pointer values"
  );
  assert.match(
    optionalValues,
    /dependencies: optional upstream\/downstream integration refs.*compatibility windows/,
    "dependency guidance names optional upstream and downstream values"
  );
  assert.match(
    optionalValues,
    /blockers: optional record_blocker\/update_blocker entries.*ownerProjectId.*blockedProjectId/,
    "blocker guidance names optional owner and blocked project values"
  );
  assert.match(
    optionalValues,
    /gaps: optional submit_gap_report\/update_gap entries.*missing contracts.*version skew/,
    "gap guidance names optional mismatch and validation values"
  );
  assert.match(
    optionalValues,
    /decisions: optional request_decision\/record_decision entries.*rollout order/,
    "decision guidance names optional decision values"
  );
  assert.match(
    optionalValues,
    /learnings and tracker refs: optional record_learning\/link_tracker_ref entries/,
    "learning and tracker-ref guidance names optional future-agent values"
  );
  assert.match(
    registrationInputs,
    /integration\.artifactRef: optional pointer.*contract spec/,
    "contract guidance points agents to the optional integration artifact value"
  );
  assert.match(
    registrationInputs,
    /integration\.consumerProjectIds: recommended for create\/upsert when initial consumers are known/,
    "dependency guidance names recommended initial consuming project refs"
  );
  assert.match(
    registrationInputs,
    /integration\.consumerProjectIds: schema-required when action is add_project or remove_project/,
    "schema guidance keeps add/remove project requirements separate from optional value"
  );
  assert.match(
    contractAlignmentPattern,
    /Model each dependency edge separately/,
    "dependency guidance tells agents how to model contract edges"
  );
  assert.match(
    coordinationInputs,
    /record_blocker or update_blocker: optional impediments/,
    "blocker guidance names the coordination actions to use"
  );
  assert.match(
    coordinationInputs,
    /submit_gap_report or update_gap: optional known contract mismatch/,
    "gap guidance names the coordination actions to use"
  );
  assert.match(
    coordinationInputs,
    /request_decision or record_decision: optional breaking changes/,
    "decision guidance names the coordination actions to use"
  );
  assert.match(
    coordinationInputs,
    /record_learning: optional reusable agent instruction/,
    "learning guidance names the coordination action to use"
  );
  assert.match(
    coordinationInputs,
    /link_tracker_ref: optional tracker task pointer/,
    "tracker-ref guidance names the coordination action to use"
  );
  assert.match(
    handoffWorkflow,
    /Share optional value through pointer-only contracts, dependencies, blockers, gaps, decisions, project responses, learnings, and tracker refs/,
    "handoff guidance keeps optional integration values pointer-only"
  );
  assert.match(
    gapClosureWorkflow,
    /Open a gap with submit_gap_report.*itemType = gap/,
    "gap closure guidance names the opening action and item type"
  );
  assert.match(
    gapClosureWorkflow,
    /Update an existing gap with update_gap.*same integration\.item\.itemId/,
    "gap closure guidance preserves the existing item identity"
  );
  assert.match(
    gapClosureWorkflow,
    /Close a gap only when.*status = resolved.*closure evidenceRefs\/artifactRefs\/trackerRefs/,
    "gap closure guidance requires explicit closure evidence"
  );
  assert.match(
    gapClosureWorkflow,
    /Do not treat catch_me_up or detect_drift status ok.*implicit gap closure/,
    "gap closure guidance rejects implicit closure from macro success"
  );
  assert.deepEqual(guidance.omniToolContract.stateMachines.gap, {
    open: ["acknowledged", "superseded"],
    acknowledged: ["resolved", "disputed", "superseded"],
    disputed: ["acknowledged", "superseded"],
    resolved: ["reopened", "superseded"],
    reopened: ["acknowledged", "resolved", "superseded"],
    superseded: []
  });
  assert.match(
    guidance.omniToolContract.guidanceBehavior.invalidStateTransition,
    /Do not infer closure/,
    "gap closure guidance requires explicit allowed state-machine steps"
  );
});

test("pmo_help routes portfolio-only agents to manage_projects before macros", async () => {
  const gateway = buildGateway();
  const actor = buildActor({
    actorId: "actor://operators/pmo-agent",
    actorRole: "program_manager_agent",
    authenticatedAt: "2026-05-04T05:00:00Z",
    expiresAt: "2026-05-04T08:00:00Z"
  });

  const help = await gateway.callTool(
    "pmo_help",
    {
      portfolioId: "portfolio://default",
      traceId: "trace://pmo-help/setup",
      correlationId: "corr://pmo-help/setup"
    },
    actor
  );

  assert.deepEqual(pmoHelpResultSchema.parse(help), help);
  assert.equal(help.nextRecommendedTool, "manage_projects");
  assert.equal(help.deterministicCore.helpGuide.scopeMode, "portfolio_bootstrap");
  assert.ok(
    help.deterministicCore.helpGuide.setupCalls.some((call) => call.toolName === "manage_projects")
  );
  assert.ok(
    help.deterministicCore.helpGuide.setupCalls.some((call) => call.toolName === "manage_integrations")
  );
  assert.ok(
    help.deterministicCore.helpGuide.toolCatalog.some(
      (tool) => tool.toolName === "manage_integrations" && tool.useWhen.includes("integration")
    )
  );
});

test("pmo_help resolves invalid or unauthorized portfolio input without forcing URI probing", async () => {
  const gateway = buildGateway();
  const actor = buildActor({
    actorId: "actor://operators/pmo-agent",
    actorRole: "program_manager_agent",
    authenticatedAt: "2026-05-04T05:00:00Z",
    expiresAt: "2026-05-04T08:00:00Z"
  });

  const help = await gateway.callTool(
    "pmo_help",
    {
      portfolioId: "ask-mr-gambler",
      traceId: "trace://pmo-help/invalid-portfolio",
      correlationId: "corr://pmo-help/invalid-portfolio"
    },
    actor
  );

  assert.deepEqual(pmoHelpResultSchema.parse(help), help);
  assert.equal(help.status, "ok");
  assert.equal(help.portfolioId, "portfolio://default");
  assert.equal(help.deterministicCore.guidance.requestedPortfolioId, "ask-mr-gambler");
  assert.deepEqual(help.deterministicCore.guidance.allowedPortfolioIds, ["portfolio://default"]);
  assert.ok(help.warnings.some((warning) => warning.warningId === "pmo-help-scope-corrected"));
});

test("manage_projects lists and upserts PMO-owned program/project scope", async () => {
  const gateway = buildGateway();
  const actor = buildActor({
    actorId: "actor://operators/pmo-agent",
    actorRole: "program_manager_agent",
    authenticatedAt: "2026-05-04T05:00:00Z",
    expiresAt: "2026-05-04T08:00:00Z"
  });

  const upsert = await gateway.callTool(
    "manage_projects",
    {
      action: "upsert",
      portfolioId: "portfolio://default",
      programId: "program://new-flow",
      traceId: "trace://manage-projects/upsert",
      correlationId: "corr://manage-projects/upsert",
      program: {
        programId: "program://new-flow",
        name: "New Flow"
      },
      project: {
        projectId: "project://new-producer",
        name: "New Producer"
      },
      evidenceRefs: ["evidence://setup/new-flow"]
    },
    actor
  );

  assert.deepEqual(manageProjectsResultSchema.parse(upsert), upsert);
  assert.ok(upsert.deterministicCore.managedRefs.includes("program://new-flow"));
  assert.ok(upsert.deterministicCore.managedRefs.includes("project://new-producer"));
  assert.deepEqual(upsert.deterministicCore.guidance.allowedActions, MANAGE_PROJECT_ACTIONS);
  assert.match(upsert.deterministicCore.guidance.writePolicy.idempotencyKey, /idempotency key/);
  assert.match(upsert.deterministicCore.guidance.writePolicy.staleUpdate, /stale state hash/);

  const list = await gateway.callTool(
    "manage_projects",
    {
      action: "list",
      portfolioId: "portfolio://default",
      programId: "program://new-flow",
      traceId: "trace://manage-projects/list",
      correlationId: "corr://manage-projects/list"
    },
    actor
  );

  assert.deepEqual(manageProjectsResultSchema.parse(list), list);
  assert.ok(list.deterministicCore.programs.some((program) => program.programId === "program://new-flow"));
  assert.ok(list.deterministicCore.projects.some((project) => project.projectId === "project://new-producer"));
});

test("manage_projects supports omni-tool discovery and project metadata lifecycle actions", async () => {
  const gateway = buildGateway();
  const actor = buildActor({
    actorId: "actor://operators/pmo-agent",
    actorRole: "program_manager_agent",
    authenticatedAt: "2026-05-04T05:00:00Z",
    expiresAt: "2026-05-04T08:00:00Z"
  });

  const help = await gateway.callTool(
    "manage_projects",
    {
      action: "help",
      portfolioId: "portfolio://default",
      traceId: "trace://manage-projects/help",
      correlationId: "corr://manage-projects/help"
    },
    actor
  );
  assert.equal(help.status, "ok");
  assert.deepEqual(help.deterministicCore.guidance.allowedActions, MANAGE_PROJECT_ACTIONS);
  assert.ok(help.deterministicCore.guidance.relevantPrograms.length > 0);

  const created = await gateway.callTool(
    "manage_projects",
    {
      action: "create",
      portfolioId: "portfolio://default",
      programId: "program://omni-memory",
      traceId: "trace://manage-projects/create",
      correlationId: "corr://manage-projects/create",
      program: {
        programId: "program://omni-memory",
        name: "Omni Memory"
      },
      project: {
        projectId: "project://memory-worker",
        name: "Memory Worker"
      }
    },
    actor
  );
  assert.deepEqual(manageProjectsResultSchema.parse(created), created);
  assert.ok(created.deterministicCore.managedRefs.includes("program://omni-memory"));
  assert.ok(created.deterministicCore.managedRefs.includes("project://memory-worker"));

  const linked = await gateway.callTool(
    "manage_projects",
    {
      action: "link_tracker",
      portfolioId: "portfolio://default",
      programId: "program://omni-memory",
      traceId: "trace://manage-projects/link-tracker",
      correlationId: "corr://manage-projects/link-tracker",
      project: {
        projectId: "project://memory-worker",
        trackerRef: "tracker://program-manager-mcp/pmo-omni-003"
      }
    },
    actor
  );
  assert.equal(
    linked.deterministicCore.projects.find((project) => project.projectId === "project://memory-worker")?.trackerRef,
    "tracker://program-manager-mcp/pmo-omni-003"
  );

  const metadataActions = [
    ["link_repo", { repoRef: "repo://program-manager-mcp/main" }],
    ["link_adapter", { adapterRef: "adapter://tracker/llm-tracker" }],
    ["set_project_role", { projectRole: "program_memory_owner" }],
    ["record_goal", { goal: "Maintain PMO-owned project memory." }]
  ];
  for (const [action, projectMetadata] of metadataActions) {
    const result = await gateway.callTool(
      "manage_projects",
      {
        action,
        portfolioId: "portfolio://default",
        programId: "program://omni-memory",
        traceId: `trace://manage-projects/${action}`,
        correlationId: `corr://manage-projects/${action}`,
        project: {
          projectId: "project://memory-worker",
          ...projectMetadata
        }
      },
      actor
    );
    assert.equal(result.status, "ok");
  }

  const get = await gateway.callTool(
    "manage_projects",
    {
      action: "get",
      portfolioId: "portfolio://default",
      programId: "program://omni-memory",
      projectIds: ["project://memory-worker"],
      traceId: "trace://manage-projects/get",
      correlationId: "corr://manage-projects/get"
    },
    actor
  );
  const project = get.deterministicCore.projects.find(
    (candidate) => candidate.projectId === "project://memory-worker"
  );
  assert.equal(project?.repoRef, "repo://program-manager-mcp/main");
  assert.equal(project?.adapterRef, "adapter://tracker/llm-tracker");
  assert.equal(project?.projectRole, "program_memory_owner");
  assert.equal(project?.goal, "Maintain PMO-owned project memory.");
  assert.equal(project?.trackerRef, "tracker://program-manager-mcp/pmo-omni-003");

  const renamed = await gateway.callTool(
    "manage_projects",
    {
      action: "rename",
      portfolioId: "portfolio://default",
      programId: "program://omni-memory",
      traceId: "trace://manage-projects/rename",
      correlationId: "corr://manage-projects/rename",
      project: {
        projectId: "project://memory-worker",
        name: "Memory Worker Renamed"
      }
    },
    actor
  );
  assert.equal(
    renamed.deterministicCore.projects.find((candidate) => candidate.projectId === "project://memory-worker")?.name,
    "Memory Worker Renamed"
  );

  const removed = await gateway.callTool(
    "manage_projects",
    {
      action: "remove_project",
      portfolioId: "portfolio://default",
      programId: "program://omni-memory",
      traceId: "trace://manage-projects/remove",
      correlationId: "corr://manage-projects/remove",
      project: {
        projectId: "project://memory-worker"
      }
    },
    actor
  );
  assert.equal(removed.status, "ok");

  const portfolioGet = await gateway.callTool(
    "manage_projects",
    {
      action: "get",
      portfolioId: "portfolio://default",
      projectIds: ["project://memory-worker"],
      traceId: "trace://manage-projects/get-after-remove",
      correlationId: "corr://manage-projects/get-after-remove"
    },
    actor
  );
  assert.deepEqual(
    portfolioGet.deterministicCore.projects.find((candidate) => candidate.projectId === "project://memory-worker")
      ?.activeProgramIds,
    []
  );

  const retired = await gateway.callTool(
    "manage_projects",
    {
      action: "retire",
      portfolioId: "portfolio://default",
      programId: "program://omni-memory",
      traceId: "trace://manage-projects/retire",
      correlationId: "corr://manage-projects/retire",
      program: {
        programId: "program://omni-memory"
      }
    },
    actor
  );
  assert.equal(
    retired.deterministicCore.programs.find((program) => program.programId === "program://omni-memory")?.status,
    "retired"
  );
});

test("manage_integrations lists and upserts PMO-owned integration scope", async () => {
  const gateway = buildGateway();
  const actor = buildActor({
    actorId: "actor://operators/pmo-agent",
    actorRole: "program_manager_agent",
    authenticatedAt: "2026-05-04T05:00:00Z",
    expiresAt: "2026-05-04T08:00:00Z"
  });

    const integrationPointId = "integration://rbaa/new-flow";

    const upsert = await gateway.callTool(
      "manage_integrations",
      {
        action: "upsert",
        portfolioId: "portfolio://default",
        programId: "program://agentic-os",
        traceId: "trace://manage-integrations/upsert",
        correlationId: "corr://manage-integrations/upsert",
        integration: {
          integrationPointId,
          producerProjectId: "project://hoplon",
          consumerProjectIds: ["project://semantix", "project://phalanx"],
          purpose: "New RBAA flow"
        },
        evidenceRefs: ["evidence://setup/rbaa-new-flow/z", "evidence://setup/rbaa-new-flow/a"]
      },
      actor
    );

    assert.deepEqual(manageIntegrationsResultSchema.parse(upsert), upsert);
    assert.ok(upsert.deterministicCore.managedRefs.includes(integrationPointId));
    assert.match(upsert.deterministicCore.guidance.writePolicy.idempotencyKey, /idempotency key/);
    assert.match(upsert.deterministicCore.guidance.writePolicy.staleUpdate, /stale state hash/);
    assert.ok(
      upsert.deterministicCore.guidance.integrationAlignment.registrationInputs.some((input) =>
        input.includes("artifactRefs")
      )
    );
    assert.ok(
      upsert.deterministicCore.guidance.integrationAlignment.agentHandoffWorkflow.some((step) =>
        step.includes("simulate_impact")
      )
    );
    assert.deepEqual(upsert.evidenceRefs, [
      "evidence://setup/rbaa-new-flow/a",
      "evidence://setup/rbaa-new-flow/z"
    ]);

    const list = await gateway.callTool(
      "manage_integrations",
      {
        action: "list",
        portfolioId: "portfolio://default",
        programId: "program://agentic-os",
        traceId: "trace://manage-integrations/list",
        correlationId: "corr://manage-integrations/list"
      },
      actor
    );

    assert.deepEqual(manageIntegrationsResultSchema.parse(list), list);
    const created = list.deterministicCore.integrationPoints.find(
      (integration) => integration.integrationPointId === integrationPointId
    );
    assert.ok(created);
    assert.equal(created.status, "active");
    assert.deepEqual(created.consumerProjectIds, ["project://phalanx", "project://semantix"]);

    const repositoryWithNullIntegrationFields = InMemoryProgramManagerRepository.fromFixture(
      getBackboneRepositoryFixture()
    );
    const originalListIntegrationPoints =
      repositoryWithNullIntegrationFields.listIntegrationPoints.bind(repositoryWithNullIntegrationFields);
    repositoryWithNullIntegrationFields.listIntegrationPoints = async (scope) =>
      (await originalListIntegrationPoints(scope)).map((integrationPoint) =>
        integrationPoint.integrationPointId === "integration://agentic-os/shared-flow"
          ? { ...integrationPoint, purpose: null }
          : integrationPoint
      );
    const nullIntegrationGateway = buildGateway({ repository: repositoryWithNullIntegrationFields });
    const nullIntegrationList = await nullIntegrationGateway.callTool(
      "manage_integrations",
      {
        action: "list",
        portfolioId: "portfolio://default",
        programId: "program://agentic-os",
        traceId: "trace://manage-integrations/null-purpose",
        correlationId: "corr://manage-integrations/null-purpose"
      },
      actor
    );
    assert.equal(nullIntegrationList.status, "ok");
    assert.deepEqual(manageIntegrationsResultSchema.parse(nullIntegrationList), nullIntegrationList);
    const sharedFlow = nullIntegrationList.deterministicCore.integrationPoints.find(
      (integration) => integration.integrationPointId === "integration://agentic-os/shared-flow"
    );
    assert.ok(sharedFlow);
    assert.equal(sharedFlow.purpose, undefined);
  });

test("manage_integrations lifecycle operations add/remove consumers, update, retire, and delete", async () => {
    const gateway = buildGateway();
    const actor = buildActor({
      actorId: "actor://operators/pmo-agent",
      actorRole: "program_manager_agent",
      authenticatedAt: "2026-05-04T05:00:00Z",
      expiresAt: "2026-05-04T08:00:00Z"
    });
    const integrationPointId = "integration://rbaa/lifecycle";

    await gateway.callTool(
      "manage_integrations",
      {
        action: "upsert",
        portfolioId: "portfolio://default",
        programId: "program://agentic-os",
        traceId: "trace://manage-integrations/lifecycle-upsert",
        correlationId: "corr://manage-integrations/lifecycle-upsert",
        integration: {
          integrationPointId,
          producerProjectId: "project://hoplon",
          consumerProjectIds: ["project://semantix"],
          purpose: "Lifecycle test flow",
          status: "active"
        },
        evidenceRefs: ["evidence://setup/rbaa-lifecycle/b"]
      },
      actor
    );

    const updated = await gateway.callTool(
      "manage_integrations",
      {
        action: "update",
        portfolioId: "portfolio://default",
        programId: "program://agentic-os",
        traceId: "trace://manage-integrations/update",
        correlationId: "corr://manage-integrations/update",
        integration: {
          integrationPointId,
          purpose: "Lifecycle test flow updated"
        },
        evidenceRefs: ["evidence://setup/rbaa-lifecycle/c"]
      },
      actor
    );

    assert.deepEqual(manageIntegrationsResultSchema.parse(updated), updated);
    const updatedRecord = updated.deterministicCore.integrationPoints.find(
      (integration) => integration.integrationPointId === integrationPointId
    );
    assert.ok(updatedRecord);
    assert.equal(updatedRecord.purpose, "Lifecycle test flow updated");

    const withAddedConsumer = await gateway.callTool(
      "manage_integrations",
      {
        action: "add_project",
        portfolioId: "portfolio://default",
        programId: "program://agentic-os",
        traceId: "trace://manage-integrations/add_project",
        correlationId: "corr://manage-integrations/add_project",
        integration: {
          integrationPointId,
          consumerProjectIds: ["project://phalanx"]
        },
        evidenceRefs: ["evidence://setup/rbaa-lifecycle/evidence-002", "evidence://setup/rbaa-lifecycle/evidence-001"]
      },
      actor
    );
    const addedRecord = withAddedConsumer.deterministicCore.integrationPoints.find(
      (integration) => integration.integrationPointId === integrationPointId
    );
    assert.ok(addedRecord);
    assert.deepEqual(addedRecord.consumerProjectIds, ["project://phalanx", "project://semantix"]);

    const afterRemoval = await gateway.callTool(
      "manage_integrations",
      {
        action: "remove_project",
        portfolioId: "portfolio://default",
        programId: "program://agentic-os",
        traceId: "trace://manage-integrations/remove_project",
        correlationId: "corr://manage-integrations/remove_project",
        integration: {
          integrationPointId,
          consumerProjectIds: ["project://phalanx"]
        },
        evidenceRefs: ["evidence://setup/rbaa-lifecycle/evidence-003"]
      },
      actor
    );
    const removedRecord = afterRemoval.deterministicCore.integrationPoints.find(
      (integration) => integration.integrationPointId === integrationPointId
    );
    assert.ok(removedRecord);
    assert.deepEqual(removedRecord.consumerProjectIds, ["project://semantix"]);

    const retired = await gateway.callTool(
      "manage_integrations",
      {
        action: "retire",
        portfolioId: "portfolio://default",
        programId: "program://agentic-os",
        traceId: "trace://manage-integrations/retire",
        correlationId: "corr://manage-integrations/retire",
        integration: {
          integrationPointId
        },
        evidenceRefs: ["evidence://setup/rbaa-lifecycle/evidence-004"]
      },
      actor
    );
    const retiredRecord = retired.deterministicCore.integrationPoints.find(
      (integration) => integration.integrationPointId === integrationPointId
    );
    assert.ok(retiredRecord);
    assert.equal(retiredRecord.status, "retired");

    const invalidTransition = await gateway.callTool(
      "manage_integrations",
      {
        action: "add_project",
        portfolioId: "portfolio://default",
        programId: "program://agentic-os",
        traceId: "trace://manage-integrations/retired-add-project",
        correlationId: "corr://manage-integrations/retired-add-project",
        integration: {
          integrationPointId,
          consumerProjectIds: ["project://phalanx"]
        },
        evidenceRefs: ["evidence://setup/rbaa-lifecycle/evidence-004b"]
      },
      actor
    );
    assert.deepEqual(manageIntegrationsResultSchema.parse(invalidTransition), invalidTransition);
    assert.equal(invalidTransition.status, "blocked");
    assert.equal(
      invalidTransition.warnings[0].warningId,
      "manage-integrations-invalid-state-transition"
    );
    assert.equal(invalidTransition.deterministicCore.guidance.currentState, "retired");
    assert.deepEqual(invalidTransition.deterministicCore.guidance.allowedNextActions, RETIRED_INTEGRATION_ACTIONS);
    assert.equal(
      invalidTransition.deterministicCore.guidance.correctForm.arguments.action,
      "get"
    );
    assert.equal(invalidTransition.deterministicCore.guidance.help.toolName, "pmo_help");

    const retiredList = await gateway.callTool(
      "manage_integrations",
      {
        action: "list",
        portfolioId: "portfolio://default",
        programId: "program://agentic-os",
        traceId: "trace://manage-integrations/list-retired",
        correlationId: "corr://manage-integrations/list-retired"
      },
      actor
    );
    const listedAfterRetire = retiredList.deterministicCore.integrationPoints.find(
      (integration) => integration.integrationPointId === integrationPointId
    );
    assert.ok(listedAfterRetire);
    assert.equal(listedAfterRetire.status, "retired");

    const deleted = await gateway.callTool(
      "manage_integrations",
      {
        action: "delete",
        portfolioId: "portfolio://default",
        programId: "program://agentic-os",
        traceId: "trace://manage-integrations/delete",
        correlationId: "corr://manage-integrations/delete",
        integration: {
          integrationPointId
        },
        evidenceRefs: ["evidence://setup/rbaa-lifecycle/evidence-005"]
      },
      actor
    );
    const deletedRecord = deleted.deterministicCore.integrationPoints.find(
      (integration) => integration.integrationPointId === integrationPointId
    );
    assert.ok(deletedRecord);
    assert.equal(deletedRecord.status, "retired");

    const listAfterDelete = await gateway.callTool(
      "manage_integrations",
      {
        action: "list",
        portfolioId: "portfolio://default",
        programId: "program://agentic-os",
        traceId: "trace://manage-integrations/list-after-delete",
        correlationId: "corr://manage-integrations/list-after-delete"
      },
      actor
    );
    assert.ok(listAfterDelete.deterministicCore.integrationPoints.some((integration) => integration.integrationPointId === integrationPointId));
  });

test("manage_integrations lifecycle action on missing target returns retry guidance", async () => {
    const gateway = buildGateway();
    const actor = buildActor({
      actorId: "actor://operators/pmo-agent",
      actorRole: "program_manager_agent",
      authenticatedAt: "2026-05-04T05:00:00Z",
      expiresAt: "2026-05-04T08:00:00Z"
    });

    const blocked = await gateway.callTool(
      "manage_integrations",
      {
        action: "update",
        portfolioId: "portfolio://default",
        programId: "program://agentic-os",
        traceId: "trace://manage-integrations/missing-update",
        correlationId: "corr://manage-integrations/missing-update",
        integration: {
          integrationPointId: "integration://rbaa/does-not-exist",
          purpose: "Should fail",
          consumerProjectIds: ["project://semantix"]
        },
        evidenceRefs: ["evidence://setup/rbaa-missing/zzz", "evidence://setup/rbaa-missing/aaa"]
      },
      actor
    );

    assert.equal(blocked.status, "blocked");
    assert.deepEqual(blocked.deterministicCore.guidance.allowedActions, MANAGE_INTEGRATION_ACTIONS);
    assert.equal(blocked.warnings[0].warningId, "manage-integrations-target-not-found");
    assert.equal(blocked.deterministicCore.guidance.correctForm.arguments.action, "create");
    assert.equal(blocked.deterministicCore.guidance.help.toolName, "pmo_help");
    assert.ok(Array.isArray(blocked.deterministicCore.guidance.retryExamples));
    assert.ok(
      blocked.deterministicCore.guidance.retryExamples.some(
        (entry) => entry.arguments.action === "list"
      )
    );
    assert.ok(
      blocked.deterministicCore.guidance.retryExamples.some(
        (entry) => entry.arguments.action === "create"
      )
    );
    assert.deepEqual(blocked.evidenceRefs, ["evidence://setup/rbaa-missing/aaa", "evidence://setup/rbaa-missing/zzz"]);
  });

test("manage_integrations records pointer-only coordination items, inboxes, idempotent retries, and blocker authority", async () => {
  const gateway = buildGateway();
  const actor = buildActor({
    actorId: "actor://operators/pmo-agent",
    actorRole: "program_manager_agent",
    authenticatedAt: "2026-05-04T05:00:00Z",
    expiresAt: "2026-05-04T08:00:00Z"
  });
  const integrationPointId = "integration://rbaa/coordination";

  const created = await gateway.callTool(
    "manage_integrations",
    {
      action: "create",
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      traceId: "trace://manage-integrations/coordination",
      correlationId: "corr://manage-integrations/coordination/create",
      integration: {
        integrationPointId,
        producerProjectId: "project://hoplon",
        consumerProjectIds: ["project://phalanx", "project://semantix"],
        purpose: "Coordination flow"
      },
      evidenceRefs: ["evidence://setup/coordination/create"]
    },
    actor
  );
  assert.deepEqual(manageIntegrationsResultSchema.parse(created), created);

  const goal = await gateway.callTool(
    "manage_integrations",
    {
      action: "record_goal",
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      traceId: "trace://manage-integrations/coordination",
      correlationId: "corr://manage-integrations/coordination/goal",
      integration: {
        integrationPointId,
        idempotencyKey: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
        item: {
          affectedProjectIds: ["project://phalanx", "project://semantix"],
          itemId: "integration-item://rbaa/coordination/goal/readiness",
          itemType: "goal",
          summary: "Shared readiness goal"
        }
      },
      evidenceRefs: ["evidence://setup/coordination/goal"]
    },
    actor
  );
  assert.equal(goal.deterministicCore.coordinationItems[0].itemType, "goal");
  assert.deepEqual(goal.deterministicCore.coordinationItems[0].affectedProjectIds, [
    "project://phalanx",
    "project://semantix"
  ]);

  const duplicateGoal = await gateway.callTool(
    "manage_integrations",
    {
      action: "record_goal",
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      traceId: "trace://manage-integrations/coordination",
      correlationId: "corr://manage-integrations/coordination/goal/retry",
      integration: {
        integrationPointId,
        idempotencyKey: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
        item: {
          itemId: "integration-item://rbaa/coordination/goal/readiness",
          itemType: "goal",
          summary: "Shared readiness goal"
        }
      },
      evidenceRefs: ["evidence://setup/coordination/goal"]
    },
    actor
  );
  assert.equal(duplicateGoal.warnings[0].warningId, "manage-integrations-duplicate-idempotency-key");
  assert.equal(duplicateGoal.deterministicCore.coordinationItems.length, 1);

  const artifact = await gateway.callTool(
    "manage_integrations",
    {
      action: "add_artifact",
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      traceId: "trace://manage-integrations/coordination",
      correlationId: "corr://manage-integrations/coordination/artifact",
      integration: {
        integrationPointId,
        artifactRef: "artifact://pmo/coordination/readiness-report",
        item: {
          affectedProjectIds: ["project://semantix"],
          itemType: "artifact",
          summary: "Readiness report pointer"
        }
      },
      evidenceRefs: ["evidence://setup/coordination/artifact"]
    },
    actor
  );
  assert.ok(
    artifact.deterministicCore.integrationPoints
      .find((integration) => integration.integrationPointId === integrationPointId)
      .artifactRefs.includes("artifact://pmo/coordination/readiness-report")
  );

  await gateway.callTool(
    "manage_integrations",
    {
      action: "record_blocker",
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      traceId: "trace://manage-integrations/coordination",
      correlationId: "corr://manage-integrations/coordination/blocker",
      integration: {
        integrationPointId,
        item: {
          blockedProjectId: "project://phalanx",
          itemId: "integration-item://rbaa/coordination/blocker/contracts",
          itemType: "blocker",
          reporterProjectId: "project://semantix",
          summary: "Contract evidence missing"
        }
      },
      evidenceRefs: ["evidence://setup/coordination/blocker"]
    },
    actor
  );

  const unauthorized = await gateway.callTool(
    "manage_integrations",
    {
      action: "mark_blocker_resolved",
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      traceId: "trace://manage-integrations/coordination",
      correlationId: "corr://manage-integrations/coordination/blocker/unauthorized",
      integration: {
        integrationPointId,
        item: {
          itemId: "integration-item://rbaa/coordination/blocker/contracts",
          itemType: "blocker",
          summary: "Resolve from unrelated project"
        }
      },
      evidenceRefs: ["evidence://setup/coordination/blocker-denied"]
    },
    buildActor({
      actorId: "actor://operators/unrelated",
      actorRole: "program_manager_agent",
      projectGrants: ["project://guardrail"]
    })
  );
  assert.equal(unauthorized.status, "blocked");
  assert.equal(unauthorized.warnings[0].warningId, "manage-integrations-blocker-authority-denied");
  assert.equal(unauthorized.deterministicCore.guidance.correctForm.arguments.action, "mark_blocker_resolved");
  assert.equal(unauthorized.deterministicCore.guidance.correctForm.arguments.integration.item.itemType, "blocker");
  assert.equal(unauthorized.deterministicCore.guidance.help.toolName, "pmo_help");
  assert.deepEqual(unauthorized.deterministicCore.guidance.eligibleProjectIds, [
    "project://phalanx",
    "project://semantix"
  ]);

  const inbox = await gateway.callTool(
    "manage_integrations",
    {
      action: "inbox",
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      traceId: "trace://manage-integrations/coordination",
      correlationId: "corr://manage-integrations/coordination/inbox",
      integration: {
        integrationPointId,
        projectId: "project://phalanx"
      }
    },
    actor
  );
  assert.ok(
    inbox.deterministicCore.inboxItems.some(
      (item) =>
        item.projectId === "project://phalanx" &&
        item.itemId === "integration-item://rbaa/coordination/blocker/contracts"
    )
  );
  assert.ok(inbox.deterministicCore.coordinationItems.length >= 3);
});

test("manage_integrations blocks stale state writes with refresh guidance", async () => {
  const gateway = buildGateway();
  const actor = buildActor({
    actorId: "actor://operators/pmo-agent",
    actorRole: "program_manager_agent",
    authenticatedAt: "2026-05-04T05:00:00Z",
    expiresAt: "2026-05-04T08:00:00Z"
  });
  const integrationPointId = "integration://rbaa/stale-write";

  await gateway.callTool(
    "manage_integrations",
    {
      action: "create",
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      traceId: "trace://manage-integrations/stale",
      correlationId: "corr://manage-integrations/stale/create",
      integration: {
        integrationPointId,
        producerProjectId: "project://hoplon",
        consumerProjectIds: ["project://semantix"],
        purpose: "Stale write flow"
      },
      evidenceRefs: ["evidence://setup/stale/create"]
    },
    actor
  );

  const stale = await gateway.callTool(
    "manage_integrations",
    {
      action: "update",
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      traceId: "trace://manage-integrations/stale",
      correlationId: "corr://manage-integrations/stale/update",
      integration: {
        integrationPointId,
        expectedStateVersionHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        purpose: "Should be blocked"
      },
      evidenceRefs: ["evidence://setup/stale/update"]
    },
    actor
  );

  assert.deepEqual(manageIntegrationsResultSchema.parse(stale), stale);
  assert.equal(stale.status, "blocked");
  assert.equal(stale.warnings[0].warningId, "manage-integrations-stale-state-version");
  assert.match(stale.deterministicCore.guidance.currentStateVersionHash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(stale.deterministicCore.guidance.correctForm.arguments.action, "get");
  assert.equal(stale.deterministicCore.guidance.help.toolName, "pmo_help");
  assert.ok(
    stale.deterministicCore.guidance.retryExamples.some(
      (example) => example.arguments.action === "get"
    )
  );
});

test("manage_evidence_items registers pointer-only artifacts, evidence refs, metadata, and attachments", async () => {
  const gateway = buildGateway();
  const actor = buildActor({
    actorId: "actor://operators/pmo-agent",
    actorRole: "program_manager_agent",
    authenticatedAt: "2026-05-04T05:00:00Z",
    expiresAt: "2026-05-04T08:00:00Z"
  });

  const registered = await gateway.callTool(
    "manage_evidence_items",
    {
      action: "register",
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      traceId: "trace://manage-evidence/register",
      correlationId: "corr://manage-evidence/register",
      evidenceItem: {
        artifactRef: "artifact://pmo/evidence/readiness-report",
        artifactType: "readiness_report",
        contentHash: {
          algorithm: "sha256",
          value: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        evidenceRef: "evidence://pmo/readiness/report",
        kind: "operator_attestation",
        storageUri: "artifact://pmo/evidence/readiness-report",
        summary: "Pointer to readiness report"
      },
      evidenceRefs: ["evidence://setup/manage-evidence/register"]
    },
    actor
  );

  assert.deepEqual(manageEvidenceItemsResultSchema.parse(registered), registered);
  assert.deepEqual(registered.deterministicCore.managedRefs, [
    "artifact://pmo/evidence/readiness-report",
    "evidence://pmo/readiness/report"
  ]);
  assert.equal(registered.deterministicCore.artifactRecords[0].artifactType, "readiness_report");
  assert.equal(registered.deterministicCore.evidenceRecords[0].kind, "operator_attestation");
  assert.match(registered.deterministicCore.guidance.pointerOnlyPolicy, /stores refs/);

  const classified = await gateway.callTool(
    "manage_evidence_items",
    {
      action: "classify",
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      traceId: "trace://manage-evidence/classify",
      correlationId: "corr://manage-evidence/classify",
      evidenceItem: {
        artifactRef: "artifact://pmo/evidence/readiness-report",
        evidenceRef: "evidence://pmo/readiness/report",
        classification: "internal",
        retentionPolicyRef: "policy://retention/pmo/internal-30d"
      },
      evidenceRefs: ["evidence://setup/manage-evidence/classify"]
    },
    actor
  );

  assert.equal(classified.deterministicCore.artifactRecords[0].classification, "internal");
  assert.equal(classified.deterministicCore.artifactRecords[0].retentionPolicyRef, "policy://retention/pmo/internal-30d");
  assert.equal(classified.deterministicCore.evidenceRecords[0].classification, "internal");

  const attached = await gateway.callTool(
    "manage_evidence_items",
    {
      action: "attach_to_integration",
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      traceId: "trace://manage-evidence/attach",
      correlationId: "corr://manage-evidence/attach",
      evidenceItem: {
        evidenceRef: "evidence://pmo/readiness/report",
        attachesToRefs: ["integration://agentic-os/shared-flow"]
      },
      evidenceRefs: ["evidence://setup/manage-evidence/attach"]
    },
    actor
  );

  assert.deepEqual(attached.deterministicCore.evidenceRecords[0].attachesToRefs, [
    "integration://agentic-os/shared-flow"
  ]);

  const listed = await gateway.callTool(
    "manage_evidence_items",
    {
      action: "list",
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      traceId: "trace://manage-evidence/list",
      correlationId: "corr://manage-evidence/list"
    },
    actor
  );

  assert.ok(
    listed.deterministicCore.evidenceRecords.some(
      (record) => record.evidenceRef === "evidence://pmo/readiness/report"
    )
  );
  assert.ok(
    listed.deterministicCore.artifactRecords.some(
      (record) => record.artifactRef === "artifact://pmo/evidence/readiness-report"
    )
  );
});

test("manage_evidence_items returns guidance for missing targets and rejects inline payload keys", async () => {
  const gateway = buildGateway();
  const actor = buildActor({
    actorId: "actor://operators/pmo-agent",
    actorRole: "program_manager_agent",
    authenticatedAt: "2026-05-04T05:00:00Z",
    expiresAt: "2026-05-04T08:00:00Z"
  });

  const missing = await gateway.callTool(
    "manage_evidence_items",
    {
      action: "classify",
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      traceId: "trace://manage-evidence/missing",
      correlationId: "corr://manage-evidence/missing",
      evidenceItem: {
        evidenceRef: "evidence://pmo/does-not-exist",
        classification: "internal"
      }
    },
    actor
  );
  assert.equal(missing.status, "blocked");
  assert.equal(missing.warnings[0].warningId, "manage-evidence-target-not-found");
  assert.equal(missing.deterministicCore.guidance.correctForm.arguments.action, "register");
  assert.equal(missing.deterministicCore.guidance.help.toolName, "pmo_help");
  assert.ok(missing.deterministicCore.guidance.retryExamples.some((example) => example.arguments.action === "register"));

  const inlineRejected = await gateway.callTool(
    "manage_evidence_items",
    {
      action: "register",
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      traceId: "trace://manage-evidence/inline",
      correlationId: "corr://manage-evidence/inline",
      evidenceItem: {
        evidenceRef: "evidence://pmo/inline",
        kind: "operator_attestation",
        rawLog: "do not store raw logs"
      }
    },
    actor
  );
  assert.equal(inlineRejected.status, "blocked");
  assert.equal(inlineRejected.deterministicCore.guidance.correctForm.toolName, "manage_evidence_items");
  assert.equal(inlineRejected.deterministicCore.guidance.correctForm.arguments.evidenceItem.evidenceRef, "evidence://pmo/inline");
  assert.equal(inlineRejected.deterministicCore.guidance.help.toolName, "pmo_help");
  assert.ok(
    inlineRejected.deterministicCore.guidance.issues.some(
      (issue) => issue.path === "evidenceItem" && issue.message.includes("Unrecognized key")
    )
  );
  assert.deepEqual(inlineRejected.deterministicCore.guidance.allowedActions, [
    "help",
    "list",
    "get",
    "register",
    "update",
    "rename",
    "retire",
    "add_artifact",
    "link_evidence",
    "classify",
    "set_retention",
    "attach_to_integration",
    "attach_to_decision",
    "attach_to_learning"
  ]);
});

test("public tools return retry guidance instead of opaque validation failures", async () => {
  const gateway = buildGateway();
  const actor = buildActor({
    actorId: "actor://operators/pmo-agent",
    actorRole: "program_manager_agent",
    authenticatedAt: "2026-05-04T05:00:00Z",
    expiresAt: "2026-05-04T08:00:00Z"
  });

  const missingAction = await gateway.callTool(
    "manage_projects",
    {
      portfolioId: "portfolio://default",
      traceId: "trace://manage-projects/guidance",
      correlationId: "corr://manage-projects/guidance"
    },
    actor
  );
  assert.equal(missingAction.status, "blocked");
  assert.deepEqual(missingAction.deterministicCore.guidance.allowedActions, MANAGE_PROJECT_ACTIONS);
  assert.equal(missingAction.deterministicCore.guidance.correctForm.toolName, "manage_projects");
  assert.equal(missingAction.deterministicCore.guidance.correctForm.arguments.action, "list");
  assert.equal(missingAction.deterministicCore.guidance.help.toolName, "pmo_help");
  assert.ok(missingAction.deterministicCore.guidance.relevantPrograms.length > 0);
  assert.ok(
    missingAction.deterministicCore.guidance.retryExamples.some(
      (example) => example.arguments.action === "list"
    )
  );

  const nullableOptionalField = await gateway.callTool(
    "manage_projects",
    {
      action: "upsert",
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      traceId: "trace://manage-projects/nullable-guidance",
      correlationId: "corr://manage-projects/nullable-guidance",
      project: {
        programId: "program://agentic-os",
        projectId: "project://ask-mr-gambler",
        name: "Ask Mr Gambler",
        trackerRef: null
      }
    },
    actor
  );
  assert.equal(nullableOptionalField.status, "ok");
  assert.deepEqual(manageProjectsResultSchema.parse(nullableOptionalField), nullableOptionalField);
  const nullableProject = nullableOptionalField.deterministicCore.projects.find(
    (project) => project.projectId === "project://ask-mr-gambler"
  );
  assert.ok(nullableProject);
  assert.equal(nullableProject.trackerRef, undefined);
  assert.ok(
    nullableOptionalField.deterministicCore.guidance.fieldGuidance.some(
      (guidance) => guidance.includes("Null optional metadata is treated as unknown/not asserted")
    )
  );

  const repositoryWithNullOptionalFields = InMemoryProgramManagerRepository.fromFixture(
    getBackboneRepositoryFixture()
  );
  const originalListProjects = repositoryWithNullOptionalFields.listProjects.bind(repositoryWithNullOptionalFields);
  repositoryWithNullOptionalFields.listProjects = async (scope) =>
    (await originalListProjects(scope)).map((project) =>
      project.projectId === "project://phalanx"
        ? { ...project, trackerRef: null, repoRef: null }
        : project
    );
  const nullRecordGateway = buildGateway({ repository: repositoryWithNullOptionalFields });
  const existingNullRecord = await nullRecordGateway.callTool(
    "manage_projects",
    {
      action: "list",
      portfolioId: "portfolio://default",
      traceId: "trace://manage-projects/null-record",
      correlationId: "corr://manage-projects/null-record"
    },
    actor
  );
  assert.equal(existingNullRecord.status, "ok");
  assert.deepEqual(manageProjectsResultSchema.parse(existingNullRecord), existingNullRecord);
  const phalanxProject = existingNullRecord.deterministicCore.projects.find(
    (project) => project.projectId === "project://phalanx"
  );
  assert.ok(phalanxProject);
  assert.equal(phalanxProject.trackerRef, undefined);
  assert.equal(phalanxProject.repoRef, undefined);

  const missingIntegrationId = await gateway.callTool(
    "manage_integrations",
    {
      action: "add_project",
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      traceId: "trace://manage-integrations/missing-id-guidance",
      correlationId: "corr://manage-integrations/missing-id-guidance"
    },
    actor
  );
  assert.equal(missingIntegrationId.status, "blocked");
  assert.deepEqual(missingIntegrationId.deterministicCore.guidance.allowedActions, MANAGE_INTEGRATION_ACTIONS);
  assert.equal(missingIntegrationId.deterministicCore.guidance.correctForm.toolName, "manage_integrations");
  assert.equal(missingIntegrationId.deterministicCore.guidance.correctForm.arguments.integration.integrationPointId, "integration://<integration-slug>");
  assert.equal(missingIntegrationId.deterministicCore.guidance.help.toolName, "pmo_help");
  assert.ok(missingIntegrationId.deterministicCore.guidance.knownIntegrationRefs.length > 0);

  const invalidIntegrationId = await gateway.callTool(
    "manage_integrations",
    {
      action: "update",
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      traceId: "trace://manage-integrations/invalid-id-guidance",
      correlationId: "corr://manage-integrations/invalid-id-guidance",
      integration: {
        integrationPointId: "not-a-uri",
        purpose: "Invalid URI should return candidates."
      }
    },
    actor
  );
  assert.equal(invalidIntegrationId.status, "blocked");
  assert.equal(invalidIntegrationId.deterministicCore.guidance.correctForm.toolName, "manage_integrations");
  assert.equal(invalidIntegrationId.deterministicCore.guidance.help.toolName, "pmo_help");
  assert.ok(invalidIntegrationId.deterministicCore.guidance.knownIntegrationRefs.length > 0);
  assert.ok(
    invalidIntegrationId.deterministicCore.guidance.issues.some(
      (issue) => issue.path === "integration.integrationPointId"
    )
  );

  const slugRefsRejected = await gateway.callTool(
    "manage_integrations",
    {
      action: "get",
      portfolioId: "agentic-os",
      programId: "planning-guardrails",
      projectIds: ["phalanx", "hoplon"],
      traceId: "trace://manage-integrations/slug-ref-guidance",
      correlationId: "corr://manage-integrations/slug-ref-guidance",
      integration: {
        integrationPointId: "integration://agentic-os/shared-flow"
      }
    },
    actor
  );
  assert.equal(slugRefsRejected.status, "blocked");
  assert.equal(slugRefsRejected.portfolioId, "portfolio://default");
  assert.equal(
    slugRefsRejected.deterministicCore.guidance.correctForm.arguments.portfolioId,
    "portfolio://default"
  );
  assert.equal(
    slugRefsRejected.deterministicCore.guidance.correctForm.arguments.programId,
    "program://agentic-os"
  );
  assert.deepEqual(
    slugRefsRejected.deterministicCore.guidance.correctForm.arguments.projectIds,
    ["project://hoplon", "project://phalanx"]
  );
  assert.equal(
    slugRefsRejected.deterministicCore.guidance.correctForm.arguments.integration.integrationPointId,
    "integration://agentic-os/shared-flow"
  );
  assert.ok(
    slugRefsRejected.deterministicCore.guidance.normalizationHints.some(
      (hint) => hint.includes('portfolioId: normalized "agentic-os" to "portfolio://default"')
    )
  );
  assert.ok(
    slugRefsRejected.deterministicCore.guidance.normalizationHints.some(
      (hint) => hint.includes('programId: normalized "planning-guardrails" to "program://agentic-os"')
    )
  );

  const unknownAction = await gateway.callTool(
    "manage_integrations",
    {
      action: "frobnicate",
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      traceId: "trace://manage-integrations/unknown-action",
      correlationId: "corr://manage-integrations/unknown-action"
    },
    actor
  );
  assert.equal(unknownAction.status, "blocked");
  assert.deepEqual(unknownAction.deterministicCore.guidance.allowedActions, MANAGE_INTEGRATION_ACTIONS);
  assert.equal(unknownAction.deterministicCore.guidance.correctForm.toolName, "manage_integrations");
  assert.equal(unknownAction.deterministicCore.guidance.correctForm.arguments.action, "list");
  assert.equal(unknownAction.deterministicCore.guidance.help.toolName, "pmo_help");
  assert.deepEqual(unknownAction.deterministicCore.guidance.omniToolContract.publicTools, [
    "pmo_help",
    "manage_projects",
    "manage_integrations",
    "manage_evidence_items",
    "pmo_macro"
  ]);

  const unsortedMacroRefs = await gateway.callTool(
    "pmo_macro",
    {
      action: "invoke",
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      projectIds: ["project://semantix", "project://phalanx"],
      traceId: "trace://pmo-macro/unsorted-project-ids",
      correlationId: "corr://pmo-macro/unsorted-project-ids",
      macroId: "macro://pmo/detect_drift",
      macroVersion: "1.0.0",
      input: {
        targetRefs: ["integration://agentic-os/shared-flow"]
      }
    },
    actor
  );
  assert.equal(unsortedMacroRefs.status, "blocked");
  assert.equal(unsortedMacroRefs.deterministicCore.guidance.correctForm.toolName, "pmo_macro");
  assert.match(
    unsortedMacroRefs.deterministicCore.guidance.canonicalRefOrdering.enforcedBy,
    /returns status blocked for unsorted ref arrays/
  );
  assert.match(
    unsortedMacroRefs.deterministicCore.guidance.omniToolContract.writePolicy.deterministicOrdering,
    /PMO rejects unsorted/
  );

  const macroSlugRefsRejected = await gateway.callTool(
    "pmo_macro",
    {
      action: "invoke",
      portfolioId: "agentic-os",
      programId: "agentic-os",
      projectIds: ["semantix", "phalanx"],
      traceId: "trace://pmo-macro/slug-ref-guidance",
      correlationId: "corr://pmo-macro/slug-ref-guidance",
      macroName: "catch_me_up",
      input: {
        targetRefs: ["shared-flow"]
      }
    },
    actor
  );
  assert.equal(macroSlugRefsRejected.status, "blocked");
  assert.equal(macroSlugRefsRejected.portfolioId, "portfolio://default");
  assert.equal(
    macroSlugRefsRejected.deterministicCore.guidance.correctForm.arguments.portfolioId,
    "portfolio://default"
  );
  assert.equal(
    macroSlugRefsRejected.deterministicCore.guidance.correctForm.arguments.programId,
    "program://agentic-os"
  );
  assert.deepEqual(
    macroSlugRefsRejected.deterministicCore.guidance.correctForm.arguments.projectIds,
    ["project://phalanx", "project://semantix"]
  );
  assert.deepEqual(
    macroSlugRefsRejected.deterministicCore.guidance.correctForm.arguments.input.targetRefs,
    ["integration://agentic-os/shared-flow"]
  );
  assert.ok(
    macroSlugRefsRejected.deterministicCore.guidance.normalizationHints.some(
      (hint) => hint.includes('input.targetRefs.0: normalized "shared-flow" to "integration://agentic-os/shared-flow"')
    )
  );
});

test("write-capable omni-tools return authority guidance for unauthorized mutations", async () => {
  const gateway = buildGateway();
  const actor = buildActor({
    actorId: "actor://agents/execution-only",
    actorRole: "execution_agent",
    authenticatedAt: "2026-05-04T05:00:00Z",
    expiresAt: "2026-05-04T08:00:00Z"
  });

  const result = await gateway.callTool(
    "manage_integrations",
    {
      action: "upsert",
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      traceId: "trace://manage-integrations/unauthorized",
      correlationId: "corr://manage-integrations/unauthorized",
      integration: {
        integrationPointId: "integration://rbaa/unauthorized",
        producerProjectId: "project://hoplon",
        consumerProjectIds: ["project://semantix"]
      },
      evidenceRefs: ["evidence://setup/rbaa-unauthorized"]
    },
    actor
  );

  assert.deepEqual(manageIntegrationsResultSchema.parse(result), result);
  assert.equal(result.status, "blocked");
  assert.equal(result.warnings[0].warningId, "authz-denied");
  assert.equal(result.deterministicCore.guidance.correctForm.toolName, "pmo_help");
  assert.equal(result.deterministicCore.guidance.help.toolName, "pmo_help");
  assert.equal(result.deterministicCore.guidance.requiredAuthority, "authority://pmo/domain-omni-tool-write");
  assert.deepEqual(result.deterministicCore.guidance.eligibleActors, [
    "human_operator",
    "program_manager_agent"
  ]);
  assert.ok(
    result.deterministicCore.guidance.safeNextActions.some((action) => action.includes("pmo_help"))
  );
});

test("pmo_macro keeps compatibility help and handles discovery, validation, and registry edits", async () => {
  const gateway = buildGateway();
  const actor = buildActor({
    actorId: "actor://operators/pmo-agent",
    actorRole: "program_manager_agent",
    authenticatedAt: "2026-05-04T05:00:00Z",
    expiresAt: "2026-05-04T08:00:00Z"
  });

  const help = await gateway.callTool(
    "pmo_macro",
    {
      action: "help",
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      traceId: "trace://pmo-macro/help",
      correlationId: "corr://pmo-macro/help"
    },
    actor
  );
  assert.deepEqual(pmoMacroResultSchema.parse(help), help);
  assert.equal(help.toolName, "pmo_macro");
  assert.ok(help.deterministicCore.helpGuide);
  assert.equal(
    help.deterministicCore.guidance.omniToolContract.canonicalDomainTools.macroAutomation,
    "pmo_macro"
  );
  assert.match(help.deterministicCore.guidance.macroAutomationBoundary, /workflow automation/);

  const list = await gateway.callTool(
    "pmo_macro",
    {
      action: "list",
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      traceId: "trace://pmo-macro/list",
      correlationId: "corr://pmo-macro/list"
    },
    actor
  );
  assert.deepEqual(
    list.deterministicCore.registry.macros.map((entry) => entry.macroId).slice(0, 2),
    ["macro://pmo/analyze_blockers", "macro://pmo/catch_me_up"]
  );

  const validation = await gateway.callTool(
    "pmo_macro",
    {
      action: "validate",
      macroId: "macro://pmo/catch_me_up",
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      traceId: "trace://pmo-macro/validate",
      correlationId: "corr://pmo-macro/validate"
    },
    actor
  );
  assert.deepEqual(pmoMacroResultSchema.parse(validation), validation);
  assert.ok(validation.stateVersionHash.startsWith("sha256:"));

  const edit = await gateway.callTool(
    "pmo_macro",
    {
      action: "edit_registry",
      input: {
        patch: {
          macroId: "macro://pmo/catch_me_up",
          set: {
            title: "Catch Me Up"
          }
        }
      },
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      registryPatchRef: "artifact://pmo/macro-registry/patch/catch-me-up-title",
      traceId: "trace://pmo-macro/edit",
      correlationId: "corr://pmo-macro/edit"
    },
    actor
  );
  assert.deepEqual(pmoMacroResultSchema.parse(edit), edit);
  assert.equal(edit.status, "ok");
  assert.ok(edit.stateVersionHash.startsWith("sha256:"));

  const unsafeEdit = await gateway.callTool(
    "pmo_macro",
    {
      action: "edit_registry",
      input: {
        patch: {
          macroId: "macro://pmo/catch_me_up",
          set: {
            sideEffectPosture: "pmo_internal_write"
          }
        }
      },
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      registryPatchRef: "artifact://pmo/macro-registry/patch/unsafe",
      traceId: "trace://pmo-macro/edit-denied",
      correlationId: "corr://pmo-macro/edit-denied"
    },
    buildActor()
  );
  assert.deepEqual(pmoMacroResultSchema.parse(unsafeEdit), unsafeEdit);
  assert.equal(unsafeEdit.status, "blocked");
  assert.equal(unsafeEdit.warnings[0].warningId, "macro-registry-edit-unauthorized");
});

test("pmo_macro invokes catch_me_up and simulate_impact with bounded deterministic pointer refs", async () => {
  const repository = InMemoryProgramManagerRepository.fromFixture(getBackboneRepositoryFixture());
  const adapterRegistry = new AdapterRegistry([new HoplonAdapterStub(), new TrackerAdapterStub()]);
  const service = new ProgramToolService({
    repository,
    adapterRegistry,
    now: () => "2026-05-03T12:00:00Z"
  });
  const gateway = new ProgramManagerMcpGateway(service);
  const actor = buildActor({
    actorId: "actor://operators/pmo-agent",
    actorRole: "program_manager_agent",
    authenticatedAt: "2026-05-04T05:00:00Z",
    expiresAt: "2026-05-04T08:00:00Z"
  });

  const catchMeUpRequest = {
    action: "invoke",
    macroId: "macro://pmo/catch_me_up",
    macroVersion: "1.0.0",
    input: {
      targetRefs: [
        "project://phalanx",
        "contract://hoplon-authz/escalation-grant@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
      ]
    },
    portfolioId: "portfolio://default",
    programId: "program://agentic-os",
    traceId: "trace://pmo-macro/catch-me-up",
    correlationId: "corr://pmo-macro/catch-me-up"
  };
  const catchMeUp = await gateway.callTool("pmo_macro", catchMeUpRequest, actor);
  const catchMeUpAgain = await gateway.callTool("pmo_macro", catchMeUpRequest, actor);
  const legacyCatchMeUp = await gateway.callTool(
    "pmo_macro",
    {
      action: "invoke",
      macroName: "catch_me_up",
      macroVersion: "1.0.0",
      macroInput: {
        targetRef:
          "contract://hoplon-authz/escalation-grant@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
      },
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      traceId: "trace://pmo-macro/catch-me-up-legacy",
      correlationId: "corr://pmo-macro/catch-me-up-legacy"
    },
    actor
  );

  assert.deepEqual(pmoMacroResultSchema.parse(catchMeUp), catchMeUp);
  assert.deepEqual(pmoMacroResultSchema.parse(legacyCatchMeUp), legacyCatchMeUp);
  assert.equal(catchMeUp.stateVersionHash, catchMeUpAgain.stateVersionHash);
  assert.equal(legacyCatchMeUp.deterministicCore.macro.macroId, "macro://pmo/catch_me_up");
  assert.ok(
    legacyCatchMeUp.deterministicCore.objectModelRefs.includes(
      "contract://hoplon-authz/escalation-grant@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    )
  );
  assert.ok(
    legacyCatchMeUp.deterministicCore.guidance.macroAutomation.acceptedInvocationShapes.some(
      (shape) => shape.includes("macroName")
    )
  );
  assert.equal(catchMeUp.redactionSummary.redacted, true);
  assert.ok(catchMeUp.redactionSummary.omittedKinds.includes("raw_database_rows"));
  assert.ok(
    catchMeUp.deterministicCore.objectModelRefs.includes(
      "contract://hoplon-authz/escalation-grant@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    )
  );
  assert.match(
    catchMeUp.deterministicCore.guidance.macroAutomation.registrationProof,
    /manage_integrations get/
  );
  assert.match(
    catchMeUp.deterministicCore.guidance.macroAutomation.commonMisuse,
    /Do not treat pmo_macro catch_me_up/
  );
  assert.equal(catchMeUp.advisoryPane.excludedFromDeterministicHash, true);

  const beforeEvents = await repository.listEvents({ portfolioId: "portfolio://default" });
  const simulationRequest = {
    action: "invoke",
    macroId: "macro://pmo/simulate_impact",
    macroVersion: "1.0.0",
    input: {
      changeRef: "project://program-manager-mcp",
      targetRefs: [
        "contract://guardrail/runtime-controls@sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      ]
    },
    portfolioId: "portfolio://default",
    programId: "program://agentic-os",
    traceId: "trace://pmo-macro/simulate-impact",
    correlationId: "corr://pmo-macro/simulate-impact"
  };
  const simulation = await gateway.callTool("pmo_macro", simulationRequest, actor);
  const afterEvents = await repository.listEvents({ portfolioId: "portfolio://default" });

  assert.deepEqual(pmoMacroResultSchema.parse(simulation), simulation);
  assert.ok(simulation.stateVersionHash.startsWith("sha256:"));
  assert.equal(simulation.warnings[0].warningId, "pmo-macro-simulation-non-persistent");
  assert.ok(simulation.artifactRefs[0].startsWith("artifact://pmo/macro/simulate-impact/report@sha256:"));
  assert.match(
    simulation.deterministicCore.guidance.macroAutomation.integrationRegistrationSourceOfTruth,
    /manage_integrations/
  );
  assert.deepEqual(afterEvents, beforeEvents, "simulation must not persist hypothetical truth");
});

test("pmo_macro catch_me_up exposes the real three-project shared flow from its stable integration ref", async () => {
  const repository = getMacroFixtureRepository();
  const gateway = new ProgramManagerMcpGateway(
    new ProgramToolService({
      repository,
      adapterRegistry: new AdapterRegistry([new HoplonAdapterStub(), new TrackerAdapterStub()]),
      now: () => "2026-05-04T23:00:00Z"
    })
  );
  const actor = buildActor({
    actorId: "actor://operators/pmo-agent",
    actorRole: "program_manager_agent",
    authenticatedAt: "2026-05-04T22:00:00Z",
    expiresAt: "2026-05-05T00:00:00Z"
  });

  const result = await gateway.callTool(
    "pmo_macro",
    {
      action: "invoke",
      macroId: "macro://pmo/catch_me_up",
      macroVersion: "1.0.0",
      input: {
        targetRefs: ["integration://agentic-os/shared-flow"]
      },
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      traceId: "trace://pmo-agent-001/catch-up-shared-flow",
      correlationId: "corr://pmo-agent-001/catch-up-shared-flow"
    },
    actor
  );

  assert.deepEqual(pmoMacroResultSchema.parse(result), result);
  assert.equal(result.status, "ok");
  for (const expectedRef of [
    "integration://agentic-os/shared-flow",
    "contract://agentic-os/shared-flow@sha256:1111111111111111111111111111111111111111111111111111111111111111",
    "project://hoplon",
    "project://phalanx",
    "project://semantix",
    "dependency://agentic-os/shared-flow/hoplon-produces",
    "dependency://agentic-os/shared-flow/phalanx-orchestrates",
    "dependency://agentic-os/shared-flow/semantix-validates-readiness"
  ]) {
    assert.ok(result.deterministicCore.objectModelRefs.includes(expectedRef), `${expectedRef} visible`);
  }
});

test("pmo_macro blocker macros produce proposed actions and expected receipts without execution", async () => {
  const repository = getMacroFixtureRepository();
  const adapterRegistry = new AdapterRegistry([new HoplonAdapterStub(), new TrackerAdapterStub()]);
  const gateway = new ProgramManagerMcpGateway(
    new ProgramToolService({
      repository,
      adapterRegistry,
      now: () => "2026-05-04T06:00:00Z"
    })
  );
  const actor = buildActor({
    actorId: "actor://operators/pmo-agent",
    actorRole: "program_manager_agent",
    authenticatedAt: "2026-05-04T05:00:00Z",
    expiresAt: "2026-05-04T08:00:00Z"
  });

  const analyze = await gateway.callTool(
    "pmo_macro",
    {
      action: "invoke",
      macroId: "macro://pmo/analyze_blockers",
      macroVersion: "1.0.0",
      input: {
        targetRefs: []
      },
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      traceId: "trace://pmo-macro/analyze-blockers",
      correlationId: "corr://pmo-macro/analyze-blockers"
    },
    actor
  );

  assert.deepEqual(pmoMacroResultSchema.parse(analyze), analyze);
  assert.ok(["ok", "warning"].includes(analyze.status));
  assert.ok(analyze.stateVersionHash.startsWith("sha256:"));
  assert.ok(
    analyze.deterministicCore.objectModelRefs.some((ref) =>
      ref.startsWith("action://pmo/unblock/")
    )
  );
  assert.ok(
    analyze.deterministicCore.objectModelRefs.some((ref) =>
      ref.startsWith("receipt://pmo/expected/")
    )
  );
  assert.equal(analyze.warnings[0].warningId, "pmo-macro-proposed-actions-only");

  const proposedPlan = await gateway.callTool(
    "pmo_macro",
    {
      action: "invoke",
      macroId: "macro://pmo/propose_unblock_plan",
      macroVersion: "1.0.0",
      input: {
        targetRefs: []
      },
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      traceId: "trace://pmo-macro/propose-unblock-plan",
      correlationId: "corr://pmo-macro/propose-unblock-plan"
    },
    actor
  );

  assert.deepEqual(pmoMacroResultSchema.parse(proposedPlan), proposedPlan);
  assert.ok(proposedPlan.artifactRefs[0].startsWith("artifact://pmo/macro/unblock-plan/report@sha256:"));
  assert.equal(
    (await repository.listEvents({ portfolioId: "portfolio://default" })).length,
    0,
    "blocker macros must not execute or ledger downstream work"
  );
});

test("pmo_macro detect_drift emits deterministic degraded findings and remediation refs", async () => {
  const repository = getMacroFixtureRepository();
  repository.seed({
    expectedReceipts: [
      {
        actorId: "actor://agents/executor-a",
        contractRefs: ["contract://semantix/readiness/control@sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"],
        correlationId: "corr://drift",
        evidencePolicyRefs: ["policy://pmo/evidence-required-v1"],
        expectedReceiptType: "evidence_refresh_receipt",
        flightPlanHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        flightPlanId: "flightplan://pmo/drift",
        flightPlanStateVersionHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        idempotencyKey: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        portfolioId: "portfolio://default",
        programId: "program://agentic-os",
        projectId: "project://semantix",
        proposedActionId: "action://pmo/remediate-drift/semantix",
        receiptRequirementId: "receipt://pmo/drift/semantix",
        recordedAt: "2026-05-04T06:00:00Z",
        requiredEvidenceRefs: ["evidence://semantix/readiness/current"],
        requiredVerifier: "adapter_observed_state",
        scopeRefs: ["project://semantix"],
        status: "expected",
        traceId: "trace://drift"
      }
    ],
    receiptReconcileStatuses: [
      {
        acceptedCount: 0,
        conflictingCount: 0,
        contractRefs: ["contract://semantix/readiness/control@sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"],
        duplicateCount: 0,
        evidenceRefs: [],
        expectedCount: 1,
        flightPlanHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        flightPlanId: "flightplan://pmo/drift",
        missingCount: 1,
        observedCount: 0,
        portfolioId: "portfolio://default",
        programId: "program://agentic-os",
        projectId: "project://semantix",
        proposedActionId: "action://pmo/remediate-drift/semantix",
        receiptRequirementId: "receipt://pmo/drift/semantix",
        status: "late",
        updatedAt: "2026-05-04T06:05:00Z"
      }
    ],
    syncCursors: [
      {
        adapterId: "semantix-local",
        portfolioId: "portfolio://default",
        cursor: "cursor://semantix/readiness/stale",
        recordedAt: "2026-05-04T06:00:00Z",
        status: "stale"
      }
    ]
  });
  const gateway = new ProgramManagerMcpGateway(
    new ProgramToolService({
      repository,
      adapterRegistry: new AdapterRegistry([new HoplonAdapterStub(), new TrackerAdapterStub()]),
      now: () => "2026-05-04T06:10:00Z"
    })
  );
  const actor = buildActor({
    actorId: "actor://operators/pmo-agent",
    actorRole: "program_manager_agent",
    authenticatedAt: "2026-05-04T05:00:00Z",
    expiresAt: "2026-05-04T08:00:00Z"
  });

  const request = {
    action: "invoke",
    macroId: "macro://pmo/detect_drift",
    macroVersion: "1.0.0",
    input: {
      targetRefs: ["contract://semantix/readiness/control@sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"]
    },
    portfolioId: "portfolio://default",
    programId: "program://agentic-os",
    traceId: "trace://pmo-macro/detect-drift",
    correlationId: "corr://pmo-macro/detect-drift"
  };
  const first = await gateway.callTool("pmo_macro", request, actor);
  const second = await gateway.callTool("pmo_macro", request, actor);

  assert.deepEqual(pmoMacroResultSchema.parse(first), first);
  assert.equal(first.status, "degraded");
  assert.equal(first.stateVersionHash, second.stateVersionHash);
  assert.equal(first.warnings[0].warningId, "pmo-macro-drift-detected");
  assert.ok(first.deterministicCore.objectModelRefs.some((ref) => ref.startsWith("action://pmo/remediate-drift/")));
  assert.ok(first.deterministicCore.objectModelRefs.includes("receipt://pmo/drift/semantix"));
});

test("pmo_macro detect_drift degrades for open integration gaps without evidence", async () => {
  const gateway = buildGateway();
  const actor = buildActor({
    actorId: "actor://operators/pmo-agent",
    actorRole: "program_manager_agent",
    authenticatedAt: "2026-05-04T05:00:00Z",
    expiresAt: "2026-05-04T08:00:00Z"
  });
  const integrationPointId = "integration://rbaa/drift-gap";
  const gapItemId = "integration-item://rbaa/drift-gap/gap/missing-evidence";
  const responseItemId = "integration-item://rbaa/drift-gap/response/missing-evidence";

  await gateway.callTool(
    "manage_integrations",
    {
      action: "create",
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      traceId: "trace://pmo-macro/detect-drift-gap",
      correlationId: "corr://pmo-macro/detect-drift-gap/create",
      integration: {
        integrationPointId,
        producerProjectId: "project://hoplon",
        consumerProjectIds: ["project://phalanx"],
        purpose: "Drift gap regression fixture"
      },
      evidenceRefs: ["evidence://setup/detect-drift-gap/create"]
    },
    actor
  );

  const gap = await gateway.callTool(
    "manage_integrations",
    {
      action: "submit_gap_report",
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      traceId: "trace://pmo-macro/detect-drift-gap",
      correlationId: "corr://pmo-macro/detect-drift-gap/gap",
      integration: {
        integrationPointId,
        item: {
          affectedProjectIds: ["project://phalanx"],
          itemId: gapItemId,
          itemType: "gap",
          reporterProjectId: "project://phalanx",
          status: "open",
          summary: "Open gap has no pointer evidence."
        }
      }
    },
    actor
  );

  assert.deepEqual(manageIntegrationsResultSchema.parse(gap), gap);
  assert.deepEqual(gap.deterministicCore.coordinationItems[0].evidenceRefs, []);

  await gateway.callTool(
    "manage_integrations",
    {
      action: "submit_project_response",
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      traceId: "trace://pmo-macro/detect-drift-gap",
      correlationId: "corr://pmo-macro/detect-drift-gap/response",
      integration: {
        integrationPointId,
        item: {
          affectedProjectIds: ["project://phalanx"],
          itemId: responseItemId,
          itemType: "response",
          projectId: "project://phalanx",
          status: "submitted",
          summary: "Submitted response has no pointer evidence."
        }
      }
    },
    actor
  );

  const drift = await gateway.callTool(
    "pmo_macro",
    {
      action: "invoke",
      macroId: "macro://pmo/detect_drift",
      macroVersion: "1.0.0",
      input: {
        targetRefs: [integrationPointId]
      },
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      traceId: "trace://pmo-macro/detect-drift-gap",
      correlationId: "corr://pmo-macro/detect-drift-gap"
    },
    actor
  );

  assert.deepEqual(pmoMacroResultSchema.parse(drift), drift);
  assert.equal(drift.status, "degraded");
  assert.equal(drift.warnings[0].warningId, "pmo-macro-drift-detected");
  assert.ok(drift.deterministicCore.objectModelRefs.includes(integrationPointId));
  assert.ok(drift.deterministicCore.objectModelRefs.includes(gapItemId));
  assert.ok(drift.deterministicCore.objectModelRefs.includes(responseItemId));
  assert.ok(
    drift.deterministicCore.objectModelRefs.includes(
      `action://pmo/remediate-drift/${encodeURIComponent(gapItemId)}`
    )
  );
  assert.ok(
    drift.deterministicCore.objectModelRefs.includes(
      `action://pmo/remediate-drift/${encodeURIComponent(responseItemId)}`
    )
  );
});

test("pmo_macro detect_drift degrades for blockers with satisfied clearance criteria", async () => {
  const gateway = buildGateway();
  const actor = buildActor({
    actorId: "actor://operators/pmo-agent",
    actorRole: "program_manager_agent",
    authenticatedAt: "2026-05-04T05:00:00Z",
    expiresAt: "2026-05-04T08:00:00Z"
  });
  const integrationPointId = "integration://rbaa/clearance-drift";
  const responseItemId = "response://hoplon/clearance-drift-confirmation";
  const blockerItemId = "blocker://rbaa/clearance-drift/waiting-for-hoplon";
  const clearanceFindingRef = `finding://pmo/coordination-clearance/${encodeURIComponent(blockerItemId)}`;

  await gateway.callTool(
    "manage_integrations",
    {
      action: "create",
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      traceId: "trace://pmo-macro/detect-clearance-drift",
      correlationId: "corr://pmo-macro/detect-clearance-drift/create",
      integration: {
        integrationPointId,
        producerProjectId: "project://hoplon",
        consumerProjectIds: ["project://phalanx"],
        purpose: "Structured clearance drift fixture"
      },
      evidenceRefs: ["evidence://setup/detect-clearance-drift/create"]
    },
    actor
  );

  await gateway.callTool(
    "manage_integrations",
    {
      action: "submit_project_response",
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      traceId: "trace://pmo-macro/detect-clearance-drift",
      correlationId: "corr://pmo-macro/detect-clearance-drift/response",
      integration: {
        integrationPointId,
        item: {
          affectedProjectIds: ["project://phalanx"],
          itemId: responseItemId,
          itemType: "response",
          projectId: "project://hoplon",
          status: "submitted",
          summary: "Hoplon submitted structured clearance evidence."
        }
      },
      evidenceRefs: ["evidence://hoplon/clearance-drift/submitted"]
    },
    actor
  );

  const blocker = await gateway.callTool(
    "manage_integrations",
    {
      action: "record_blocker",
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      traceId: "trace://pmo-macro/detect-clearance-drift",
      correlationId: "corr://pmo-macro/detect-clearance-drift/blocker",
      integration: {
        integrationPointId,
        item: {
          affectedProjectIds: ["project://phalanx"],
          blockedOnRefs: [responseItemId],
          blockedProjectId: "project://phalanx",
          clearanceCriteria: [
            {
              ref: responseItemId,
              requiredStatus: "submitted"
            }
          ],
          itemId: blockerItemId,
          itemType: "blocker",
          ownerProjectId: "project://phalanx",
          status: "open",
          summary: "Blocked until the structured Hoplon response is submitted."
        }
      },
      evidenceRefs: ["evidence://phalanx/clearance-drift/blocker"]
    },
    actor
  );

  assert.deepEqual(manageIntegrationsResultSchema.parse(blocker), blocker);
  const recordedBlocker = blocker.deterministicCore.coordinationItems.find(
    (item) => item.itemId === blockerItemId
  );
  assert.deepEqual(recordedBlocker.blockedOnRefs, [responseItemId]);
  assert.deepEqual(recordedBlocker.clearanceCriteria, [
    {
      ref: responseItemId,
      requiredStatus: "submitted"
    }
  ]);

  const drift = await gateway.callTool(
    "pmo_macro",
    {
      action: "invoke",
      macroId: "macro://pmo/detect_drift",
      macroVersion: "1.0.0",
      input: {
        targetRefs: [integrationPointId]
      },
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      traceId: "trace://pmo-macro/detect-clearance-drift",
      correlationId: "corr://pmo-macro/detect-clearance-drift"
    },
    actor
  );

  assert.deepEqual(pmoMacroResultSchema.parse(drift), drift);
  assert.equal(drift.status, "degraded");
  assert.ok(drift.deterministicCore.objectModelRefs.includes(responseItemId));
  assert.ok(drift.deterministicCore.objectModelRefs.includes(blockerItemId));
  assert.ok(drift.deterministicCore.objectModelRefs.includes(clearanceFindingRef));
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

test("branch context filters decisions and learnings while keeping global records visible", async () => {
  const fixture = getBackboneRepositoryFixture();
  fixture.decisions = [
    {
      decisionId: "decision://agentic-os/global-approval",
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      summary: "Global approval applies to every branch.",
      status: "applicable",
      recordedAt: "2026-05-03T09:00:00Z",
      validFrom: "2026-05-03T00:00:00Z",
      evidenceRefs: []
    },
    {
      decisionId: "decision://agentic-os/main-approval",
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      summary: "Main approval applies to main only.",
      status: "applicable",
      branchName: "main",
      trackerSlug: "program-manager-mcp",
      trackerRev: 12,
      recordedAt: "2026-05-03T10:00:00Z",
      validFrom: "2026-05-03T00:00:00Z",
      evidenceRefs: []
    },
    {
      decisionId: "decision://agentic-os/feature-approval",
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      summary: "Feature approval applies to a feature branch only.",
      status: "applicable",
      branchName: "feature/time-travel",
      trackerSlug: "program-manager-mcp",
      trackerRev: 12,
      recordedAt: "2026-05-03T10:30:00Z",
      validFrom: "2026-05-03T00:00:00Z",
      evidenceRefs: []
    },
    {
      decisionId: "decision://agentic-os/main-future-applicable",
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      summary: "Main approval is not visible before its validity window.",
      status: "applicable",
      branchName: "main",
      trackerSlug: "program-manager-mcp",
      trackerRev: 12,
      recordedAt: "2026-05-03T11:00:00Z",
      validFrom: "2026-05-04T00:00:00Z",
      evidenceRefs: []
    }
  ];
  fixture.intelligenceRecords = [
    {
      appliesToRefs: ["project://phalanx"],
      conditionTags: ["risk:coordination"],
      confidence: {
        mode: "supported",
        rationale: "Global lesson is branch neutral.",
        score: 0.8
      },
      evidenceRefs: [],
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      recordedAt: "2026-05-03T09:05:00Z",
      recordId: "intelligence://agentic-os/global-learning",
      recordType: "learning",
      reusableLesson: "Use global PMO lessons when no branch context conflicts.",
      reviewStatus: "supported",
      sourceAdapterId: "fixture-loader",
      sourceCursor: "cursor://branch/global",
      sourceRefs: ["decision://agentic-os/global-approval"],
      summary: "Global branch-neutral learning.",
      title: "Global branch-neutral learning",
      validFrom: "2026-05-03T00:00:00Z"
    },
    {
      appliesToRefs: ["project://phalanx"],
      branchName: "main",
      conditionTags: ["risk:coordination"],
      confidence: {
        mode: "supported",
        rationale: "Main branch lesson is supported by tracker revision 12.",
        score: 0.9
      },
      evidenceRefs: [],
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      recordedAt: "2026-05-03T10:05:00Z",
      recordId: "intelligence://agentic-os/main-learning",
      recordType: "learning",
      reusableLesson: "Use main-specific PMO lessons only on main.",
      reviewStatus: "supported",
      sourceAdapterId: "fixture-loader",
      sourceCursor: "cursor://branch/main",
      sourceRefs: ["decision://agentic-os/main-approval"],
      summary: "Main branch learning.",
      title: "Main branch learning",
      trackerSlug: "program-manager-mcp",
      trackerRev: 12,
      validFrom: "2026-05-03T00:00:00Z"
    },
    {
      appliesToRefs: ["project://phalanx"],
      branchName: "feature/time-travel",
      conditionTags: ["risk:coordination"],
      confidence: {
        mode: "needs_review",
        rationale: "Feature branch lesson should not leak into main.",
        score: 0.4
      },
      evidenceRefs: [],
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      recordedAt: "2026-05-03T10:10:00Z",
      recordId: "intelligence://agentic-os/feature-learning",
      recordType: "learning",
      reusableLesson: "Keep feature-only PMO lessons scoped to the feature branch.",
      reviewStatus: "needs_review",
      sourceAdapterId: "fixture-loader",
      sourceCursor: "cursor://branch/feature",
      sourceRefs: ["decision://agentic-os/feature-approval"],
      summary: "Feature branch learning.",
      title: "Feature branch learning",
      trackerSlug: "program-manager-mcp",
      trackerRev: 12,
      validFrom: "2026-05-03T00:00:00Z"
    },
    {
      appliesToRefs: ["project://phalanx"],
      branchName: "main",
      conditionTags: ["risk:coordination"],
      confidence: {
        mode: "supported",
        rationale: "Expired main branch lesson should not be visible at the requested time.",
        score: 0.6
      },
      evidenceRefs: [],
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      recordedAt: "2026-05-03T08:00:00Z",
      recordId: "intelligence://agentic-os/expired-main-learning",
      recordType: "learning",
      reusableLesson: "Expired lessons are only visible before validTo.",
      reviewStatus: "supported",
      sourceAdapterId: "fixture-loader",
      sourceCursor: "cursor://branch/main-expired",
      sourceRefs: ["decision://agentic-os/main-approval"],
      summary: "Expired main branch learning.",
      title: "Expired main branch learning",
      trackerSlug: "program-manager-mcp",
      trackerRev: 12,
      validFrom: "2026-05-02T00:00:00Z",
      validTo: "2026-05-03T00:00:00Z"
    }
  ];

  const service = new ProgramToolService({
    repository: InMemoryProgramManagerRepository.fromFixture(fixture),
    adapterRegistry: new AdapterRegistry([]),
    now: () => "2026-05-03T12:00:00Z"
  });
  const gateway = new ProgramManagerMcpGateway(service);
  const actor = buildActor();
  const contextAnchor = {
    portfolioId: "portfolio://default",
    programId: "program://agentic-os",
    branchName: "main",
    trackerSlug: "program-manager-mcp",
    trackerRev: 12,
    asOf: "2026-05-03T12:00:00Z"
  };

  const contextResult = await gateway.callTool(
    "query_program_context",
    {
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      queryKind: "program_summary",
      targetRefs: ["project://phalanx"],
      contextAnchor,
      traceId: "trace://branch-context",
      correlationId: "corr://branch-context"
    },
    actor
  );
  const decisionRefs = contextResult.deterministicCore.contextPanes.applicableDecisions.map(
    (item) => item.ref
  );
  assert.deepEqual(decisionRefs, [
    "decision://agentic-os/global-approval",
    "decision://agentic-os/main-approval"
  ]);

  const intelligenceResult = await gateway.callTool(
    "analyze_program_intelligence",
    {
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      targetRefs: ["project://phalanx"],
      conditionTags: ["risk:coordination"],
      contextAnchor,
      traceId: "trace://branch-intelligence",
      correlationId: "corr://branch-intelligence"
    },
    actor
  );
  assert.deepEqual(
    intelligenceResult.deterministicCore.issueCards.map((card) => card.issueId),
    [
      "issue://program-intelligence/learning_match/agentic-os-global-learning",
      "issue://program-intelligence/learning_match/agentic-os-main-learning"
    ]
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
