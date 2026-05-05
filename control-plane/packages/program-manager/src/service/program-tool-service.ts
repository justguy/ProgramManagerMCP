import {
  analyzeProgramIntelligenceRequestSchema,
  analyzeProgramIntelligenceResultSchema,
  assessProgramImpactRequestSchema,
  assessProgramImpactResultSchema,
  generateProgramUpdateCoreSchema,
  generateProgramUpdateRequestSchema,
  generateProgramUpdateResultSchema,
  getAgenticOsContextPacketRequestSchema,
  getAgenticOsContextPacketResultSchema,
  getProgramAuditTrailRequestSchema,
  getProgramAuditTrailResultSchema,
  getProgramDocumentationRequestSchema,
  getProgramDocumentationResultSchema,
  listProgramCapabilitiesRequestSchema,
  listProgramCapabilitiesResultSchema,
  manageEvidenceItemsRequestSchema,
  manageEvidenceItemsResultSchema,
  manageIntegrationsRequestSchema,
  manageIntegrationsResultSchema,
  manageProjectsRequestSchema,
  manageProjectsResultSchema,
  planProgramActionRequestSchema,
  planProgramActionResultSchema,
  pmoHelpRequestSchema,
  pmoHelpResultSchema,
  pmoMacroRequestSchema,
  pmoMacroResultSchema,
  queryProgramContextRequestSchema,
  queryProgramContextResultSchema,
  recordProgramReceiptRequestSchema,
  recordProgramReceiptResultSchema,
  reconcileProgramStateRequestSchema,
  reconcileProgramStateResultSchema,
  submitAgenticOsReceiptRequestSchema,
  submitAgenticOsReceiptResultSchema
} from "../../../../../shared/schemas/program-manager.ts";
import type {
  AdapterCursor,
  AdapterHealthResult,
  AdapterImpactResult,
  AdapterManifest,
  AdapterReadStateResult,
  ProgramCapabilityListing
} from "../adapters/index.js";
import type {
  IntegrationCoordinationItem,
  IntegrationPointRecord,
  ProgramManagerRepository
} from "../repository/program-manager-repository.js";
import type {
  ArtifactRef,
  ContextAnchor,
  DecisionRecord,
  EvidenceRef,
  ExpectedReceipt,
  GraphRelationship,
  ActionLedgerEntry,
  ObservedReceipt,
  PmoMacroRegistry,
  ProgramEvent,
  ProgramIntelligenceRecord,
  ProgramRef,
  ProjectRef,
  ReceiptReconcileRecord
} from "../types/domain.js";
import {
  assertReadAuthorized,
  buildAuthzEvidenceRefs,
  inferScopedProjectIds,
  ProgramToolAuthzError,
  type ProgramToolActor
} from "../authz/program-tool-authz.ts";
import {
  PMO_MACRO_OPERATOR_ROLE,
  PMO_MACRO_REGISTRY_ADMIN_ROLE,
  applyAndPersistMacroRegistryEdit,
  createBuiltInMacroRegistry
} from "../macros/pmo-macro-registry.ts";
import {
  buildRedactionSummary,
  DEFAULT_REDACTION_POLICY_REFS,
  mergeRedactionSummaries,
  sanitizePointerPayload
} from "../redaction/program-tool-redaction.ts";
import { sha256ForInput, stateVersionHashFromInput } from "../hash/state-version-hash.js";
import {
  normalizePmoMacroInput,
  normalizePmoReadModels
} from "../normalization/program-manager-normalization.ts";

type ToolName =
  | "list_program_capabilities"
  | "get_program_documentation"
  | "query_program_context"
  | "assess_program_impact"
  | "generate_program_update"
  | "get_program_audit_trail"
  | "analyze_program_intelligence"
  | "plan_program_action"
  | "record_program_receipt"
  | "reconcile_program_state"
  | "get_agentic_os_context_packet"
  | "submit_agentic_os_receipt"
  | "manage_evidence_items"
  | "manage_integrations"
  | "manage_projects"
  | "pmo_help"
  | "pmo_macro";

type ToolWarning = {
  warningId: string;
  severity: "low" | "medium" | "high" | "critical";
  summary: string;
  evidenceRefs: string[];
};

type DocumentationSection = {
  sectionId: string;
  title: string;
  summary: string;
  schemaRefs: string[];
  artifactRefs: string[];
  evidenceRefs: string[];
};

type SanitizedAdapterReadState = ReturnType<typeof sanitizePointerPayload<AdapterReadStateResult>>;
type SanitizedAdapterImpactState = ReturnType<
  typeof sanitizePointerPayload<AdapterImpactResult>
>;

type AdapterReadAttempt = {
  adapterId: string;
  health: AdapterHealthResult;
  result?: SanitizedAdapterReadState;
  errorSummary?: ToolWarning;
};

type AdapterImpactAttempt = {
  adapterId: string;
  health: AdapterHealthResult;
  result?: SanitizedAdapterImpactState;
  errorSummary?: ToolWarning;
};

type DocumentationCatalog = Record<string, DocumentationSection[]>;

type ContextMatch = {
  ref: string;
  kind: string;
  status: string;
  reason: string;
  validFrom?: string;
  validTo?: string;
  recordedAt: string;
  evidenceRefs: string[];
};

type ContextPaneItem = {
  ref: string;
  kind: string;
  status: string;
  summary: string;
  inclusionReason: string;
  recordedAt: string;
  evidenceRefs: string[];
};

type RecommendedContextAction = {
  actionId: string;
  actionType: string;
  summary: string;
  inclusionReason: string;
  targetRefs: string[];
  evidenceRefs: string[];
};

type IntelligenceIssueType =
  | "discarded_decision_match"
  | "failure_pattern_match"
  | "learning_match"
  | "repeated_blocker"
  | "risk_signal"
  | "stale_evidence";

type IntelligenceIssueCard = {
  issueId: string;
  issueType: IntelligenceIssueType;
  title: string;
  summary: string;
  affectedScope: Array<{ kind: string; ref: string }>;
  relevance: { score: number; rationale: string };
  confidence: {
    mode: "deterministic_rule" | "needs_review";
    score: number;
    source: "persisted_fact" | "fixture_rule" | "model_assisted";
  };
  ruleId: string;
  ruleVersion: string;
  provenance: {
    recordIds: string[];
    ruleId: string;
    ruleVersion: string;
    sourceRecordTypes: string[];
  };
  evidenceRefs: string[];
  sourceRefs: string[];
  recommendedNextAction: {
    actionType: string;
    summary: string;
    targetRefs: string[];
  };
  proposedUpdateStatus: "proposed" | "not_applicable" | "needs_review";
};

type FlightPlanProposedExternalAction = {
  actionType: string;
  approvalAuthorityRefs: string[];
  causation: {
    depth: number;
    path: Array<{ actionType: string; adapterId: string; targetRef: string }>;
    sourceTool: "plan_program_action";
  };
  evidencePolicyRefs: string[];
  expectedReceiptRequirementIds: string[];
  idempotencyKey: string;
  proposedActionId: string;
  rationale: string;
  status: "proposed" | "suppressed";
  targetAdapterId: string;
  targetRef: string;
};

type FlightPlanExpectedReceipt = {
  correlationId: string;
  evidencePolicyRefs: string[];
  expectedReceiptType: string;
  flightPlanHash: string;
  flightPlanId: string;
  flightPlanStateVersionHash: string;
  idempotencyKey: string;
  proposedActionId: string;
  receiptRequirementId: string;
  requiredEvidenceRefs: string[];
  requiredVerifier: "adapter_observed_state" | "content_digest" | "operator_attestation";
  scopeRefs: string[];
  status: "expected";
  traceId: string;
};

type ProgramToolServiceDependencies = {
  adapterRegistry: {
    assertNoMutationAuthority(): Promise<void>;
    assessImpact(
      adapterId: string,
      request: Record<string, unknown>,
      now?: string
    ): Promise<AdapterImpactResult>;
    getHealth(
      adapterId: string,
      scope: { portfolioId: string; programId?: string; projectIds?: string[] },
      now?: string
    ): Promise<AdapterHealthResult>;
    getSourceCursor(
      adapterId: string,
      scope: { portfolioId: string; programId?: string; projectIds?: string[] }
    ): Promise<AdapterCursor>;
    listCapabilities(capabilityDomain?: string): Promise<ProgramCapabilityListing[]>;
    listManifests(): AdapterManifest[];
    readState(
      adapterId: string,
      request: Record<string, unknown>,
      now?: string
    ): Promise<AdapterReadStateResult>;
  };
  repository: ProgramManagerRepository;
  now?: () => string;
  documentationCatalog?: DocumentationCatalog;
  runtimeKnowledge?: ProgramManagerRuntimeKnowledge;
};

export type ProgramManagerRuntimeKnowledge = {
  backend: string;
  databaseRef?: string;
  firstAgentInstruction: string;
  gaps: string[];
  operatingRules: string[];
  sharedAcrossMcpInstances: boolean;
  sourceRef: string;
  statefulAuthority: string;
  status: "ok" | "warning" | "blocked" | "degraded";
  systemRef?: string;
};

const DEFAULT_RUNTIME_KNOWLEDGE: ProgramManagerRuntimeKnowledge = {
  backend: "unspecified",
  firstAgentInstruction:
    "Runtime storage authority was not declared by this MCP host. Call pmo_help and treat missing storage provenance as a setup gap before relying on PMO memory.",
  gaps: [
    "The MCP host did not provide runtime storage metadata, so agents cannot prove whether this instance is reading shared PMO knowledge."
  ],
  operatingRules: [
    "PMO knowledge must come from the configured stateful store, not from an MCP process, local chat history, or guessed repository files.",
    "When runtime storage provenance is missing or non-shared, surface the gap and ask for PMO host configuration instead of probing random tools."
  ],
  sharedAcrossMcpInstances: false,
  sourceRef: "artifact://program-manager/state/source/unspecified",
  statefulAuthority: "unknown",
  status: "degraded"
};

function agentKnowledgeAuthorityView(runtimeKnowledge: ProgramManagerRuntimeKnowledge) {
  const { backend: _backend, databaseRef: _databaseRef, ...agentSafeKnowledgeAuthority } = runtimeKnowledge;
  return agentSafeKnowledgeAuthority;
}

const TOOL_NEXT_RECOMMENDATION: Record<ToolName, ToolName> = {
  list_program_capabilities: "get_program_documentation",
  get_program_documentation: "query_program_context",
  query_program_context: "assess_program_impact",
  assess_program_impact: "query_program_context",
  generate_program_update: "get_program_audit_trail",
  get_program_audit_trail: "query_program_context",
  analyze_program_intelligence: "query_program_context",
  plan_program_action: "get_program_audit_trail",
  record_program_receipt: "get_program_audit_trail",
  reconcile_program_state: "plan_program_action",
  get_agentic_os_context_packet: "record_program_receipt",
  submit_agentic_os_receipt: "reconcile_program_state",
  manage_evidence_items: "pmo_help",
  manage_integrations: "pmo_help",
  manage_projects: "pmo_help",
  pmo_help: "pmo_macro",
  pmo_macro: "get_program_documentation"
};

const STATUS_RANK = new Map([
  ["error", 0],
  ["blocked", 1],
  ["degraded", 2],
  ["warning", 3],
  ["ok", 4]
]);

const WARNING_RANK = new Map([
  ["critical", 0],
  ["high", 1],
  ["medium", 2],
  ["low", 3]
]);

const QUERY_KIND_DOMAINS: Record<string, string[]> = {
  applicable_decisions: [],
  contract_context: ["contract_context", "snapshot_context"],
  dependency_status: ["code_context", "contract_context", "snapshot_context"],
  evidence_status: ["snapshot_context", "tracker_board"],
  program_summary: ["code_context", "contract_context", "snapshot_context", "tracker_board"]
};

const AGENTIC_OS_SHARED_FLOW_SCOPE = {
  integrationRef: "integration://agentic-os/shared-flow",
  portfolioId: "portfolio://default",
  producerProjectId: "project://hoplon",
  programId: "program://agentic-os",
  projectIds: ["project://hoplon", "project://phalanx", "project://semantix"]
} as const;

const WORKFLOW_MACRO_NAMES = new Set([
  "analyze_blockers",
  "catch_me_up",
  "detect_drift",
  "propose_unblock_plan",
  "simulate_impact"
]);

const PMO_OMNI_PUBLIC_TOOLS = ["pmo_help", "manage_projects", "manage_integrations", "manage_evidence_items", "pmo_macro"] as const;
const PMO_OMNI_WRITE_ACTOR_ROLES = ["human_operator", "program_manager_agent"] as const;
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
] as const;
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
] as const;
const ACTIVE_INTEGRATION_ACTIONS = MANAGE_INTEGRATION_ACTIONS;
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
] as const;
const MANAGE_EVIDENCE_ACTIONS = [
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
] as const;
const COORDINATION_ACTIONS = new Set([
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
  "supersede"
]);

export function buildPmoOmniToolContract() {
  return {
    schemaVersion: "1.0.0",
    publicTools: PMO_OMNI_PUBLIC_TOOLS,
    canonicalDomainTools: {
      help: "pmo_help",
      evidenceAndArtifactRegistry: "manage_evidence_items",
      integrationLifecycle: "manage_integrations",
      macroAutomation: "pmo_macro",
      programAndProjectMemory: "manage_projects"
    },
    resultEnvelope: {
      schemaVersion: "1",
      deterministicCoreRequiredForWrites: true,
      advisoryPaneExcludedFromDeterministicHash: true,
      pointerOnlyEvidence: true,
      statuses: ["ok", "warning", "blocked", "error", "degraded"]
    },
    knowledgeAuthorityPolicy: {
      sourceOfTruth:
        "PMO knowledge is owned by the configured shared PMO knowledge store. MCP server processes are stateless frontends and must not be treated as sources of durable truth.",
      requiredRuntimeDisclosure:
        "pmo_help reports whether shared PMO knowledge is available through this MCP. Agents must treat missing, local-only, or non-shared storage as a setup gap instead of probing tools or repo files for answers.",
      sharedDbExpectation:
        "Production Program Manager MCP instances are expected to use the same shared PMO knowledge store so writes from one instance are immediately readable from another."
    },
    actionTaxonomy: {
      bootstrap: ["help"],
      discovery: ["list", "describe"],
      validation: ["validate"],
      lifecycleMutation: [
        "create",
        "upsert",
        "update",
        "rename",
        "add_project",
        "remove_project",
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
        "acknowledge",
        "dispute",
        "unblock",
        "resolve",
        "reopen",
        "supersede",
        "retire",
        "delete"
      ],
      evidenceLinking: ["attach_evidence", "submit_receipt"],
      recovery: ["retry_with_idempotency_key", "retry_after_refresh", "list_candidates"]
    },
    guidanceBehavior: {
      missingAction: "Return valid actions, retry examples, and the next recommended domain tool.",
      missingIdentifier: "Return candidate refs when available and a retry example using the canonical id field.",
      invalidIdentifier: "Return relevant program/project/integration candidates without requiring URI probing.",
      unauthorizedAction:
        "Return required authority, eligible actor roles, policy/evidence refs, and safe next actions.",
      invalidStateTransition:
        "Return current state, allowed next actions or states, and repair guidance. Do not infer closure.",
      malformedRefs: "Reject unsorted or malformed refs before writes; callers retry with normalized pointer refs."
    },
    authorityPolicy: {
      eligibleWriteActorRoles: PMO_OMNI_WRITE_ACTOR_ROLES,
      defaultRules: [
        {
          actor: "reporter_or_blocked_project",
          may: ["unblock", "resolve", "reopen"],
          scope: "blockers owned by or blocking that project"
        },
        {
          actor: "owner_project",
          may: ["submit_resolution_evidence", "attach_evidence"],
          scope: "records it owns or produces"
        },
        {
          actor: "affected_project",
          may: ["acknowledge", "dispute"],
          scope: "records that list the project as affected"
        },
        {
          actor: "unrelated_project",
          may: [],
          scope: "no mutation authority"
        },
        {
          actor: "pmo",
          may: ["record", "surface_conflict", "propose_next_action"],
          scope: "cannot infer closure or choose a winner for conflicting project responses"
        }
      ]
    },
    stateMachines: {
      gap: {
        open: ["acknowledged", "superseded"],
        acknowledged: ["resolved", "disputed", "superseded"],
        disputed: ["acknowledged", "superseded"],
        resolved: ["reopened", "superseded"],
        reopened: ["acknowledged", "resolved", "superseded"],
        superseded: []
      },
      blocker: {
        open: ["mitigated", "resolved", "superseded"],
        mitigated: ["open", "resolved", "superseded"],
        resolved: ["open", "superseded"],
        superseded: []
      },
      decision: {
        requested: ["approved", "rejected", "superseded"],
        approved: ["superseded"],
        rejected: ["superseded"],
        superseded: []
      },
      response: {
        requested: ["submitted", "disputed", "superseded"],
        submitted: ["accepted", "disputed", "superseded"],
        disputed: ["submitted", "superseded"],
        accepted: ["superseded"],
        superseded: []
      },
      artifact: {
        registered: ["verified", "stale", "retired"],
        verified: ["stale", "retired"],
        stale: ["verified", "retired"],
        retired: []
      },
      learning: {
        proposed: ["supported", "needs_review", "superseded"],
        needs_review: ["supported", "superseded"],
        supported: ["superseded"],
        superseded: []
      },
      integration: {
        active: ["update", "add_project", "remove_project", "retire", "delete"],
        retired: ["update", "retire", "delete"]
      }
    },
    projectInboxSemantics: {
      requiredAction: "Every obligation-creating omni-tool must expose project_inbox or an equivalent first-class action before enforcing obligations.",
      panes: ["owed_now", "blocked_by", "pending_decisions", "stale_evidence", "conflicts"]
    },
    conflictHandling: {
      policy: "Record contradictory project responses as conflicts and surface them; never select a winner.",
      requiredRefs: ["conflictRef", "projectResponseRefs", "evidenceRefs"]
    },
    writePolicy: {
      idempotencyKey:
        "Write-capable omni-tools must accept or derive an idempotency key from traceId, correlationId, action, target refs, and payload digest; duplicate retries return the existing managed refs.",
      staleUpdate:
        "When a caller supplies a stale state hash, block the mutation and return current state, candidate refs, allowed next actions, and a retry-after-refresh example.",
      deterministicOrdering:
        "Normalize and sort evidenceRefs, artifactRefs, projectIds, consumerProjectIds, and managedRefs before persistence and hashing."
    },
    trackerLinking: {
      policy:
        "PMO records may link to LLM Tracker task refs as evidence or context, but PMO does not become tracker task owner and does not mutate tracker state."
    },
    migrationPolicy: {
      canonicalIntegrationTool: "manage_integrations",
      compatibilityAliases:
        "Legacy narrow integration behaviors may remain callable only as temporary compatibility paths; public help and tool lists must point to manage_integrations."
    }
  };
}

function buildOmniGuidance(extra: Record<string, unknown> = {}) {
  const omniToolContract = buildPmoOmniToolContract();
  return {
    omniToolContract,
    authorityPolicy: omniToolContract.authorityPolicy,
    writePolicy: omniToolContract.writePolicy,
    ...extra
  };
}

function buildPmoHelpForm(request: {
  portfolioId: string;
  programId?: string;
  projectIds?: string[];
  traceId: string;
  correlationId: string;
}) {
  return {
    toolName: "pmo_help",
    arguments: {
      portfolioId: request.portfolioId,
      ...(request.programId ? { programId: request.programId } : {}),
      ...(request.projectIds ? { projectIds: request.projectIds } : {}),
      traceId: request.traceId,
      correlationId: `${request.correlationId}/help`
    }
  };
}

function buildIntegrationAlignmentGuidance() {
  const schemaRequiredFields = [
    "integration.integrationPointId: schema-required for every manage_integrations action except help and list.",
    "integration.producerProjectId: schema-required when action is create or upsert.",
    "integration.consumerProjectIds: schema-required when action is add_project or remove_project."
  ];
  const recommendedRegistrationValues = [
    "integration.consumerProjectIds: recommended for create/upsert when initial consumers are known; otherwise register the producer edge now and use add_project later.",
    "integration.purpose: recommended short statement of what must stay aligned across the participating projects.",
    "evidenceRefs: recommended pointer-only refs for the human request, task, issue, receipt, or source that justifies the registration."
  ];
  const optionalValueToShare = [
    "contracts: optional pointer refs for specs, schemas, API contracts, fixture digests, compatibility matrices, docs, or validation reports. Use integration.artifactRef for one pointer, add_artifact for durable artifact records, or integration.item.artifactRefs on coordination records.",
    "dependencies: optional upstream/downstream integration refs, tracker refs, repo refs, rollout dependencies, or compatibility windows that explain what other teams must not break.",
    "blockers: optional record_blocker/update_blocker entries with ownerProjectId, blockedProjectId, summary, status, and pointer-only evidence refs.",
    "gaps: optional submit_gap_report/update_gap entries for missing contracts, semantic drift, field mismatch, version skew, or missing validation evidence.",
    "decisions: optional request_decision/record_decision entries for ownership, rollout order, breaking changes, compatibility windows, or disputed interpretation.",
    "project responses: optional submit_project_response entries when a producer or consumer confirms, disputes, or accepts the current contract state.",
    "learnings and tracker refs: optional record_learning/link_tracker_ref entries that help future agents find reusable instructions or project-native work."
  ];
  return {
    schemaVsValueGuidance: [
      "The schema-required fields only prove that the PMO integration record exists and has the minimum lifecycle identity for the requested action.",
      "Contracts, dependencies, blockers, gaps, decisions, project responses, learnings, tracker refs, and validation evidence are optional value payloads; provide any known pointer refs, but do not fabricate missing artifacts.",
      "If a contract, dependency, or validation result is not ready, register the integration anyway and record a gap, blocker, decision request, or tracker ref that names what is missing."
    ],
    schemaRequiredFields,
    requiredRegistrationFields: schemaRequiredFields,
    recommendedRegistrationValues,
    optionalValueToShare,
    registrationInputs: [
      ...schemaRequiredFields,
      ...recommendedRegistrationValues,
      "integration.artifactRef: optional pointer inside the integration payload for a contract spec, schema, fixture digest, compatibility matrix, doc, or validation report. For multiple artifact pointers, use add_artifact or integration.item.artifactRefs on a coordination record."
    ],
    coordinationInputs: [
      "record_goal: optional expected aligned state, such as a consumer validating producer contract version X.",
      "submit_gap_report or update_gap: optional known contract mismatch, missing field, semantic drift, missing dependency, missing validation evidence, or version skew.",
      "record_blocker or update_blocker: optional impediments with owner, blocked project, and pointer-only evidence.",
      "request_decision or record_decision: optional breaking changes, rollout order, compatibility windows, or ownership decisions.",
      "submit_project_response: optional producer or consumer response that confirms, disputes, or accepts a contract/gap/blocker/decision state.",
      "record_learning: optional reusable agent instruction discovered while aligning the integration.",
      "link_tracker_ref: optional tracker task pointer for project-native execution, without transferring tracker ownership to PMO."
    ],
    contractSharingChecklist: [
      "Share the contract as pointer refs, not inline content: artifact refs, schema refs, fixture digest refs, commit refs, test refs, or tracker refs.",
      "State who produces the contract, who consumes it, and what compatibility or rollout boundary matters.",
      "Consumers should attach validation evidence against the exact producer artifact version or digest.",
      "If the contract is absent or disputed, submit a gap report instead of describing it as complete."
    ],
    gapClosureWorkflow: [
      "Open a gap with submit_gap_report using integration.item.itemType = gap, reporterProjectId, affectedProjectIds when known, summary, and pointer-only evidence/artifact/tracker refs.",
      "Update an existing gap with update_gap and the same integration.item.itemId as more evidence, dependencies, owner context, or project responses arrive.",
      "Close a gap only when the owning or affected project provides pointer-only validation or decision evidence. Use update_gap with itemType = gap, the same itemId, status = resolved, and closure evidenceRefs/artifactRefs/trackerRefs.",
      "Use status = disputed when projects disagree, or status = superseded when another gap/contract artifact replaces the old one. Record the replacement pointer in evidenceRefs, artifactRefs, or trackerRefs.",
      "After project-native work changes the contract or evidence, run pmo_macro detect_drift. Do not treat catch_me_up or detect_drift status ok as registration proof or as implicit gap closure."
    ],
    blockerClosureWorkflow: [
      "Open or update blockers with record_blocker/update_blocker and include ownerProjectId, blockedProjectId, affectedProjectIds, summary, status, and pointer-only evidence.",
      "Only the reporting or blocked project should mark a blocker unblocked, resolved, or reopened.",
      "When a blocker is cleared, use mark_blocker_unblocked or mark_blocker_resolved with the same itemId and pointer-only evidence showing the external project-native action."
    ],
    agentHandoffWorkflow: [
      "Call pmo_help first to resolve allowed portfolio/program/project scope and public PMO tools.",
      "Use manage_projects list/upsert before integration registration when a producer or consumer project ref is missing.",
      "Use manage_integrations upsert for the minimum integration record, then add_project/remove_project for participation changes.",
      "Share optional value through pointer-only contracts, dependencies, blockers, gaps, decisions, project responses, learnings, and tracker refs; do not inline raw logs, transcripts, diffs, screenshots, or secrets.",
      "Agents should read manage_integrations get or manage_integrations catch_up for the integration ref before editing downstream code or tracker state.",
      "Use pmo_macro simulate_impact before changing a contract, and detect_drift after project-native work to find stale or missing evidence.",
      "If macro catch_up is blocked by project-scope authz, fall back to manage_integrations get/inbox for the integration and resolve authz separately."
    ],
    contractAlignmentPattern: [
      "Model each dependency edge separately, for example integration://amg/phalanx-contract and integration://phalanx/hoplon-contract.",
      "The producing project owns the contract artifact; consuming projects attach validation evidence against the exact artifact version or digest.",
      "Record gaps, blockers, and decisions on the integration so future agents can retrieve current alignment state without chat copy-paste."
    ]
  };
}

function buildMacroAutomationGuidance() {
  return {
    macroAutomationBoundary:
      "pmo_macro is for workflow automation over existing PMO state. It does not create, update, or verify integration lifecycle records.",
    acceptedInvocationShapes: [
      "Canonical: action = invoke, macroId = macro://pmo/<macro-name>, input = { ... }.",
      "Compatibility: action = invoke, macroName = <macro-name>, macroInput = { ... }. PMO normalizes this to macroId/input before validation.",
      "If both canonical and compatibility fields are present, canonical macroId/input are authoritative."
    ],
    integrationRegistrationSourceOfTruth:
      "Use manage_integrations upsert/create/update/add_project/remove_project to mutate integration records. Use manage_integrations get/list to verify registration.",
    registrationProof:
      "An integration is registered only when manage_integrations get returns that integrationPointId in deterministicCore.integrationPoints.",
    safeSequence: [
      "Call pmo_help for current scope and public tool guidance.",
      "Call manage_projects list/upsert if producer or consumer project refs are missing.",
      "Call manage_integrations upsert or add_project to register the integration and participation.",
      "Call manage_integrations get and confirm deterministicCore.integrationPoints contains the exact integrationPointId.",
      "Only then call pmo_macro catch_me_up, simulate_impact, or detect_drift for workflow context and reconciliation."
    ],
    commonMisuse:
      "Do not treat pmo_macro catch_me_up or detect_drift status ok as proof that an integration was registered; macros can operate on targetRefs that are not lifecycle records."
  };
}

function allowedIntegrationActionsForState(status: "active" | "retired" | undefined) {
  if (status === "retired") {
    return [...RETIRED_INTEGRATION_ACTIONS];
  }
  return [...ACTIVE_INTEGRATION_ACTIONS];
}

function workflowOnlyMacroRegistry(registry: PmoMacroRegistry): PmoMacroRegistry {
  return {
    ...registry,
    macros: registry.macros.filter((macro) => WORKFLOW_MACRO_NAMES.has(macro.macroName))
  };
}

function buildPmoHelpToolCatalog() {
  return [
    {
      actions: ["help"],
      mutatesPmoState: false,
      purpose: "Bootstrap agents with allowed PMO scope, setup sequence, tool catalog, and examples.",
      toolName: "pmo_help",
      useWhen: "Always call first, especially when portfolio/program/project/integration scope is unknown."
    },
    {
      actions: [...MANAGE_PROJECT_ACTIONS],
      mutatesPmoState: true,
      purpose:
        "Manage PMO-owned program/project memory: discovery, create/update/rename/retire, project membership, role, tracker/repo/adapter pointers, and goals.",
      toolName: "manage_projects",
      useWhen:
        "Use before pmo_macro when the agent does not know the valid programId or projectId, when a program/project is missing, or when project metadata pointers need registration."
    },
    {
      actions: [...MANAGE_INTEGRATION_ACTIONS],
      mutatesPmoState: true,
      purpose:
        "Manage PMO-owned integration lifecycle and coordination records: list, create/update metadata, project participation, pointer-only artifacts, goals, gaps, blockers, decisions, responses, conflicts, learnings, tracker refs, inbox, catch-up, and non-destructive retirement.",
      toolName: "manage_integrations",
      useWhen:
        "Use before pmo_macro when integration refs are unknown, when projects need to join/leave an integration, or when lifecycle metadata must be updated."
    },
    {
      actions: [...MANAGE_EVIDENCE_ACTIONS],
      mutatesPmoState: true,
      purpose:
        "Register and manage pointer-only PMO evidence and artifact refs, including classification, retention, and links to integration, decision, or learning records.",
      toolName: "manage_evidence_items",
      useWhen:
        "Use when a blocker, decision, response, learning, or integration item needs durable evidence or artifact pointers."
    },
    {
      actions: ["help", "list", "describe", "validate", "invoke", "edit_registry"],
      mutatesPmoState: true,
      purpose: "Run the single macro dispatcher for workflow macros over existing PMO data.",
      toolName: "pmo_macro",
      useWhen:
        "Use only after required PMO program/project/integration records exist; do not use it to probe or create missing PMO entities."
    }
  ];
}

function buildPmoMacroHelpGuide(scopeMode: "portfolio_bootstrap" | "scoped_work") {
  const baseRequest = {
    portfolioId: AGENTIC_OS_SHARED_FLOW_SCOPE.portfolioId,
    programId: AGENTIC_OS_SHARED_FLOW_SCOPE.programId,
    projectIds: AGENTIC_OS_SHARED_FLOW_SCOPE.projectIds,
    traceId: "trace://shared-flow/<agent-role>/<task-id>",
    correlationId: "corr://shared-flow/<agent-role>/<call-purpose>/<unique-suffix>"
  };

  return {
    canonicalScope: AGENTIC_OS_SHARED_FLOW_SCOPE,
    docsAvailableToAgents: false,
    firstAgentInstruction:
      scopeMode === "scoped_work"
        ? "Do not proceed from local repo context alone. First call manage_integrations get or catch_up for the assigned integration ref to read participants, contracts, dependencies, blockers, gaps, decisions, evidenceRefs, artifactRefs, and warnings; use pmo_macro only after the lifecycle record is known."
        : "If no program, project, or integration is assigned yet, first call manage_projects and manage_integrations with action list. If PMO records are absent, call manage_projects/manage_integrations with action upsert before using pmo_macro for scoped work. Use add_project so additional projects can join an existing integration.",
    operatingRules: [
      "PMO MCP server instances are stateless. The PMO knowledge database is the durable source of truth; do not rely on process-local state, chat history, or repository files as substitutes for PMO tool reads.",
      "PMO is passive: it provides context, simulation, proposed plans, evidence obligations, receipts, and reconciliation; it does not mutate Hoplon, Phalanx, Semantix, GitHub, LLM Tracker, code, deployments, or product state.",
      "Use project-native tools for code, tracker, repository, tests, and downstream system mutations.",
      "Use manage_projects, not pmo_macro, for PMO-owned program and project registration or updates.",
      "Use manage_integrations, not pmo_macro, for PMO-owned integration registration or updates.",
      "Keep PMO evidence pointer-only: evidence refs, artifact refs, digest refs, commit refs, tracker refs, test refs, and receipt refs only.",
      "Do not inline secrets, credentials, raw logs, screenshots, provider transcripts, hidden scratchpads, raw database rows, or unbounded diffs.",
      "Treat PMO warnings as blockers until inspected or explicitly reconciled.",
      "Use unique correlationId values for each call and a stable traceId across one task or handoff chain."
    ],
    receiptPath: {
      queryTool: "reconcile_program_state",
      submitTool: "submit_agentic_os_receipt",
      summary:
        "When PMO returns expected receipt obligations, execute the accepted action through the owning project tools, submit pointer-only executionReceipt metadata through submit_agentic_os_receipt, then query reconcile_program_state or pmo_macro detect_drift before marking work complete."
    },
    recommendedCalls: [
      {
        purpose:
          "Read the integration lifecycle record and verify registration before treating macro output as context.",
        toolName: "manage_integrations",
        arguments: {
          ...baseRequest,
          action: "get",
          integration: {
            integrationPointId: AGENTIC_OS_SHARED_FLOW_SCOPE.integrationRef
          }
        }
      },
      {
        purpose: "Catch up on shared-flow context before planning or editing.",
        toolName: "pmo_macro",
        arguments: {
          ...baseRequest,
          action: "invoke",
          macroId: "macro://pmo/catch_me_up",
          macroVersion: "1.0.0",
          input: {
            targetRefs: [AGENTIC_OS_SHARED_FLOW_SCOPE.integrationRef]
          }
        }
      },
      {
        purpose: "Simulate impact before changing shared contracts, readiness, orchestration, evidence, or receipts.",
        toolName: "pmo_macro",
        arguments: {
          ...baseRequest,
          action: "invoke",
          macroId: "macro://pmo/simulate_impact",
          macroVersion: "1.0.0",
          input: {
            changeRef: "change://shared-flow/<agent-role>/<task-id>",
            changeKind: "hypothetical",
            targetRefs: [AGENTIC_OS_SHARED_FLOW_SCOPE.integrationRef],
            traversalBudgetRef: "budget://pmo/macro/simulate-impact/default"
          }
        }
      },
      {
        purpose: "Request proposed external actions when shared-flow work is blocked.",
        toolName: "pmo_macro",
        arguments: {
          ...baseRequest,
          action: "invoke",
          macroId: "macro://pmo/propose_unblock_plan",
          macroVersion: "1.0.0",
          input: {
            targetRefs: [AGENTIC_OS_SHARED_FLOW_SCOPE.integrationRef]
          }
        }
      },
      {
        purpose: "Check missing, stale, conflicting, or unevidenced PMO state after project-native work.",
        toolName: "pmo_macro",
        arguments: {
          ...baseRequest,
          action: "invoke",
          macroId: "macro://pmo/detect_drift",
          macroVersion: "1.0.0",
          input: {
            targetRefs: [AGENTIC_OS_SHARED_FLOW_SCOPE.integrationRef]
          }
        }
      }
    ],
    setupCalls: [
      {
        purpose: "List existing PMO programs and projects before assuming scope.",
        toolName: "manage_projects",
        arguments: {
          action: "list",
          portfolioId: AGENTIC_OS_SHARED_FLOW_SCOPE.portfolioId,
          traceId: "trace://pmo-setup/<agent-role>/<task-id>",
          correlationId: "corr://pmo-setup/list/<unique-suffix>"
        }
      },
      {
        purpose: "Register or update a PMO program/project when the intended scope is missing.",
        toolName: "manage_projects",
        arguments: {
          action: "upsert",
          portfolioId: AGENTIC_OS_SHARED_FLOW_SCOPE.portfolioId,
          programId: "program://<program-slug>",
          traceId: "trace://pmo-setup/<agent-role>/<task-id>",
          correlationId: "corr://pmo-setup/upsert/<unique-suffix>",
          program: {
            programId: "program://<program-slug>",
            name: "<Program name>"
          },
          project: {
            programId: "program://<program-slug>",
            projectId: "project://<project-slug>",
            name: "<Project name>"
          },
          evidenceRefs: ["evidence://<source>/<pointer>"]
        }
      },
      {
        purpose: "List existing PMO integration refs before assuming an integration exists.",
        toolName: "manage_integrations",
        arguments: {
          action: "list",
          portfolioId: AGENTIC_OS_SHARED_FLOW_SCOPE.portfolioId,
          programId: "program://<program-slug>",
          traceId: "trace://pmo-setup/<agent-role>/<task-id>",
          correlationId: "corr://pmo-setup/integrations/list/<unique-suffix>"
        }
      },
      {
        purpose:
          "Register or update the minimum PMO integration ref when the intended integration is missing. Add optional contracts, dependencies, blockers, gaps, decisions, learnings, tracker refs, and validation evidence as pointer refs when known.",
        toolName: "manage_integrations",
        arguments: {
          action: "upsert",
          portfolioId: AGENTIC_OS_SHARED_FLOW_SCOPE.portfolioId,
          programId: "program://<program-slug>",
          traceId: "trace://pmo-setup/<agent-role>/<task-id>",
          correlationId: "corr://pmo-setup/integrations/upsert/<unique-suffix>",
          integration: {
            integrationPointId: "integration://<integration-slug>",
            producerProjectId: "project://<producer-project-slug>",
            consumerProjectIds: ["project://<consumer-project-slug>"],
            purpose: "<Integration purpose>"
          },
          evidenceRefs: ["evidence://<source>/<pointer>"]
        }
      }
    ],
    toolCatalog: buildPmoHelpToolCatalog(),
    scopeMode,
    roleRefs: [
      { projectId: "project://hoplon", role: "producer" },
      { projectId: "project://phalanx", role: "consumer_orchestrator" },
      { projectId: "project://semantix", role: "consumer_readiness_validator" }
    ]
  };
}

const DOCUMENTATION_CATALOG: DocumentationCatalog = {
  overview: [
    {
      sectionId: "public-boundary",
      title: "Public Boundary",
      summary:
        "Phase 1A exposes only read-only PMO analysis and documentation surfaces. The gateway does not proxy downstream mutation authority.",
      schemaRefs: ["schema://program-manager/programToolResultEnvelope"],
      artifactRefs: [
        "artifact://docs/phase-0/public-pmo-tool-contracts-and-result-envelope.md"
      ],
      evidenceRefs: ["evidence://documentation/overview/current"]
    }
  ],
  schemas: [
    {
      sectionId: "schema-bundle",
      title: "Schema Bundle",
      summary:
        "The shared schema bundle defines request envelopes, deterministic cores, redaction summaries, and adapter fixtures for Phase 1A.",
      schemaRefs: [
        "schema://program-manager/programManagerSchemaBundle",
        "schema://program-manager/programToolRequestContext"
      ],
      artifactRefs: ["artifact://shared/schemas/program-manager.ts"],
      evidenceRefs: ["evidence://documentation/schemas/current"]
    }
  ],
  tool_contracts: [
    {
      sectionId: "phase-1a-tools",
      title: "Phase 1A Tools",
      summary:
        "The public tool contract fixes four Phase 1A tool names, standard envelopes, deterministic cores, and hash exclusions.",
      schemaRefs: [
        "schema://program-manager/listProgramCapabilitiesRequest",
        "schema://program-manager/getProgramDocumentationRequest",
        "schema://program-manager/queryProgramContextRequest",
        "schema://program-manager/assessProgramImpactRequest"
      ],
      artifactRefs: [
        "artifact://docs/phase-0/public-pmo-tool-contracts-and-result-envelope.md",
        "artifact://docs/phase-0/fixtures/tool-contracts.example.json"
      ],
      evidenceRefs: ["evidence://documentation/tool-contracts/current"]
    }
  ],
  adapter_contracts: [
    {
      sectionId: "adapter-manifests",
      title: "Adapter Contracts",
      summary:
        "Adapters must publish manifest shape, cursor freshness, health, side-effect posture, read methods, and pointer-only redaction behavior.",
      schemaRefs: [
        "schema://program-manager/adapterManifest",
        "schema://program-manager/adapterImpactResult"
      ],
      artifactRefs: [
        "artifact://docs/phase-0/adapter-authz-approval-security-contracts.md",
        "artifact://docs/phase-0/fixtures/adapter-contract-fixtures.example.json"
      ],
      evidenceRefs: ["evidence://documentation/adapter-contracts/current"]
    }
  ],
  evidence_rules: [
    {
      sectionId: "pointer-only-evidence",
      title: "Evidence Rules",
      summary:
        "Evidence and artifact outputs remain pointer-only. Missing or stale evidence must surface as deterministic findings instead of inline raw payloads.",
      schemaRefs: [
        "schema://program-manager/evidenceRef",
        "schema://program-manager/evidencePolicy"
      ],
      artifactRefs: [
        "artifact://docs/phase-0/public-pmo-tool-contracts-and-result-envelope.md",
        "artifact://docs/phase-0/adapter-authz-approval-security-contracts.md"
      ],
      evidenceRefs: ["evidence://documentation/evidence-rules/current"]
    }
  ],
  authz_rules: [
    {
      sectionId: "portfolio-isolation",
      title: "Portfolio Isolation",
      summary:
        "Portfolio read authority is mandatory. Program and project grants further constrain visible PMO facts, and cross-portfolio reads are denied by default.",
      schemaRefs: ["schema://program-manager/programToolRequestContext"],
      artifactRefs: [
        "artifact://docs/phase-0/adapter-authz-approval-security-contracts.md"
      ],
      evidenceRefs: ["evidence://documentation/authz-rules/current"]
    }
  ],
  failure_modes: [
    {
      sectionId: "failure-boundaries",
      title: "Failure Modes",
      summary:
        "Threat controls cover stale cursors, malformed adapter data, prompt-like content in artifacts, secret leakage, and confused-deputy execution attempts.",
      schemaRefs: ["schema://program-manager/adapterImpactResult"],
      artifactRefs: [
        "artifact://docs/phase-0/adapter-authz-approval-security-contracts.md"
      ],
      evidenceRefs: ["evidence://documentation/failure-modes/current"]
    }
  ],
  fixture_backbone: [
    {
      sectionId: "golden-fixture",
      title: "Golden Fixture Backbone",
      summary:
        "The golden fixture backbone supplies deterministic portfolio, program, project, impact, and finding refs used by repository and tool tests.",
      schemaRefs: ["schema://program-manager/goldenFixtureBackbone"],
      artifactRefs: [
        "artifact://docs/phase-0/fixtures/golden-fixture-backbone.example.json"
      ],
      evidenceRefs: ["evidence://documentation/fixture-backbone/current"]
    }
  ]
};

function sortUnique(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function compareWarnings(left: ToolWarning, right: ToolWarning): number {
  return (
    (WARNING_RANK.get(left.severity) ?? Number.MAX_SAFE_INTEGER) -
      (WARNING_RANK.get(right.severity) ?? Number.MAX_SAFE_INTEGER) ||
    left.warningId.localeCompare(right.warningId)
  );
}

function compareAffectedRefs(
  left: { kind: string; ref: string },
  right: { kind: string; ref: string }
): number {
  return left.kind.localeCompare(right.kind) || left.ref.localeCompare(right.ref);
}

function compareFindings(
  left: { severity: string; findingId: string },
  right: { severity: string; findingId: string }
): number {
  return (
    (WARNING_RANK.get(left.severity) ?? Number.MAX_SAFE_INTEGER) -
      (WARNING_RANK.get(right.severity) ?? Number.MAX_SAFE_INTEGER) ||
    left.findingId.localeCompare(right.findingId)
  );
}

function compareMatchedRefs(
  left: { kind: string; ref: string; recordedAt: string },
  right: { kind: string; ref: string; recordedAt: string }
): number {
  return (
    left.kind.localeCompare(right.kind) ||
    left.ref.localeCompare(right.ref) ||
    left.recordedAt.localeCompare(right.recordedAt)
  );
}

function compareContextPaneItems(left: ContextPaneItem, right: ContextPaneItem): number {
  return (
    left.kind.localeCompare(right.kind) ||
    left.ref.localeCompare(right.ref) ||
    left.recordedAt.localeCompare(right.recordedAt)
  );
}

function compareRecommendedActions(
  left: RecommendedContextAction,
  right: RecommendedContextAction
): number {
  return left.actionId.localeCompare(right.actionId);
}

function compareIntelligenceIssueCards(
  left: IntelligenceIssueCard,
  right: IntelligenceIssueCard
): number {
  return left.issueType.localeCompare(right.issueType) || left.issueId.localeCompare(right.issueId);
}

function compareCapabilities(
  left: { capabilityId: string },
  right: { capabilityId: string }
): number {
  return left.capabilityId.localeCompare(right.capabilityId);
}

const DEFAULT_REPORT_TEMPLATE_VERSION = "template://pmo-alignment-report/v1";

type ProgramUpdateSection = {
  sectionId: string;
  title: string;
  summary: string;
  refs: string[];
};

function sortUniqueRefs(values: string[]): string[] {
  return [...new Set(values)]
    .filter((value) => value.length > 0)
    .sort((left, right) => left.localeCompare(right));
}

function expectedReceiptContractRefs(receipt: ExpectedReceipt): string[] {
  return sortUniqueRefs(receipt.contractRefs ?? []);
}

function receiptDigestForInput(request: {
  evidenceRefs: string[];
  flightPlanHash: string;
  flightPlanId: string;
  observedAt: string;
  observedStateRefs: string[];
  proposedActionId: string;
  receiptRequirementId: string;
  receiptType: string;
}): string {
  return stateVersionHashFromInput({
    evidenceRefs: sortUniqueRefs(request.evidenceRefs),
    flightPlanHash: request.flightPlanHash,
    flightPlanId: request.flightPlanId,
    observedAt: request.observedAt,
    observedStateRefs: sortUniqueRefs(request.observedStateRefs),
    proposedActionId: request.proposedActionId,
    receiptRequirementId: request.receiptRequirementId,
    receiptType: request.receiptType
  });
}

function receiptObservedId(idempotencyKey: string): string {
  return `receipt-observed://program-action/${sanitizedPointerSegment(idempotencyKey)}`;
}

function receiptLedgerEntryId(idempotencyKey: string): string {
  return `ledger://program-action/${sanitizedPointerSegment(idempotencyKey)}`;
}

function makeReportMarkdownRef(reportTemplateVersion: string, digest: string) {
  return `artifact://pmo/reports/alignment/${encodeURIComponent(
    reportTemplateVersion
  )}/report@${digest}`;
}

function makeEvidenceEnvelopeRef(reportTemplateVersion: string, digest: string) {
  return `artifact://pmo/reports/alignment-envelope/${encodeURIComponent(
    reportTemplateVersion
  )}/evidence-envelope@${digest}`;
}

function makeProgramUpdateSectionRef(reportTemplateVersion: string, sectionId: string) {
  return `artifact://pmo/reports/alignment/${encodeURIComponent(
    reportTemplateVersion
  )}/sections/${encodeURIComponent(sectionId)}`;
}

function buildInputRefs(
  request: { portfolioId: string; programId?: string; projectIds?: string[] },
  scope: { portfolioId: string; programId?: string; projectIds?: string[] },
  programs: { programId?: string }[],
  projects: { projectId?: string }[],
  decisions: { decisionId: string }[],
  relationships: {
    dependencyId: string;
    fromRef: string;
    toRef: string;
    contractRef?: string;
    evidenceRefs?: string[];
    policyRefs?: string[];
  }[],
  evidenceRefs: string[],
  artifactRefs: string[]
): string[] {
  return sortUniqueRefs([
    request.portfolioId,
    ...(request.programId ? [request.programId] : []),
    ...(request.projectIds ?? []),
    ...(scope.projectIds ?? []),
    ...programs.flatMap((program) => (program.programId ? [program.programId] : [])),
    ...projects.flatMap((project) => (project.projectId ? [project.projectId] : [])),
    ...decisions.map((decision) => decision.decisionId),
    ...relationships.flatMap((relationship) => [
      dependencyPointer(relationship.dependencyId),
      relationship.fromRef,
      relationship.toRef,
      ...(relationship.contractRef ? [relationship.contractRef] : []),
      ...(relationship.evidenceRefs ?? []),
      ...(relationship.policyRefs ?? [])
    ]),
    ...evidenceRefs,
    ...artifactRefs
  ]);
}

function buildProgramUpdateSections(input: {
  decisions: { decisionId: string; status: string; recordedAt: string }[];
  evidenceRefs: string[];
  artifactRefs: string[];
  portfolioIds: string[];
  programIds: string[];
  projectIds: string[];
  relationships: { dependencyId: string; fromRef: string; toRef: string; status: string }[];
  reportAudience: string;
  reportTemplateVersion: string;
}): ProgramUpdateSection[] {
  const scopeSummary = [
    ...input.portfolioIds,
    ...input.programIds,
    ...input.projectIds
  ];

  return [
    {
      sectionId: "decisions",
      title: "Decision Set",
      summary: `${input.decisions.length} decision facts loaded in scope.`,
      refs: sortUniqueRefs(input.decisions.map((decision) => decision.decisionId))
    },
    {
      sectionId: "dependencies",
      title: "Dependency Surface",
      summary: `${input.relationships.length} dependency relationships loaded in scope.`,
      refs: sortUniqueRefs(
        input.relationships.flatMap((relationship) => [
          relationship.fromRef,
          relationship.toRef,
          `dependency://${relationship.dependencyId}`
        ])
      )
    },
    {
      sectionId: "evidence",
      title: "Evidence Inputs",
      summary: `${input.evidenceRefs.length} evidence refs available for report reconstruction.`,
      refs: sortUniqueRefs(input.evidenceRefs)
    },
    {
      sectionId: "metadata",
      title: "Metadata",
      summary: `Template ${input.reportTemplateVersion} generated for ${input.reportAudience} audience.`,
      refs: sortUniqueRefs([...input.artifactRefs, ...scopeSummary])
    },
    {
      sectionId: "scope",
      title: "PMO Scope",
      summary: `${scopeSummary.length} scoped PMO refs in this report.`,
      refs: sortUniqueRefs(scopeSummary)
    }
  ].sort((left, right) => left.sectionId.localeCompare(right.sectionId));
}

function buildReportMarkdown(input: {
  templateVersion: string;
  reportAudience: string;
  sections: ProgramUpdateSection[];
  stateVersionHash: string;
}): string {
  const header = [
    "# PMO Program Update",
    `templateVersion: ${input.templateVersion}`,
    `audience: ${input.reportAudience}`,
    `stateVersionHash: ${input.stateVersionHash}`
  ];

  const details = input.sections
    .map(
      (section) =>
        [
          `## ${section.title}`,
          `id: ${section.sectionId}`,
          `summary: ${section.summary}`,
          ...section.refs.map((entry) => `- ${entry}`)
        ].join("\n")
    )
    .join("\n\n");

  return [...header, "", details].join("\n");
}

function compareAuditEvents(left: ProgramEvent, right: ProgramEvent): number {
  return right.recordedAt.localeCompare(left.recordedAt) || left.eventId.localeCompare(right.eventId);
}

function contextAnchorRefs(contextAnchor: ContextAnchor | undefined): string[] {
  if (!contextAnchor) {
    return [];
  }

  return sortUniqueRefs(
    [
      contextAnchor.portfolioId,
      contextAnchor.programId,
      contextAnchor.projectId,
      contextAnchor.repoId,
      contextAnchor.hoplonSnapshotRef
    ].filter((value): value is string => Boolean(value))
  );
}

function eventMatchesTargetRefs(event: ProgramEvent, targetRefs: string[] | undefined): boolean {
  if (!targetRefs?.length) {
    return true;
  }

  const eventRefs = new Set([
    event.eventId,
    ...event.evidenceRefs,
    ...event.artifactRefs,
    ...contextAnchorRefs(event.contextAnchor)
  ]);
  return targetRefs.some((targetRef) => eventRefs.has(targetRef));
}

function eventMatchesWindow(event: ProgramEvent, since?: string, until?: string): boolean {
  if (since && event.recordedAt < since) {
    return false;
  }
  if (until && event.recordedAt > until) {
    return false;
  }
  return true;
}

function statusFromValues(values: string[]): "ok" | "warning" | "blocked" | "error" | "degraded" {
  const sorted = [...values].sort(
    (left, right) =>
      (STATUS_RANK.get(left) ?? Number.MAX_SAFE_INTEGER) -
      (STATUS_RANK.get(right) ?? Number.MAX_SAFE_INTEGER)
  );
  return (sorted[0] as "ok" | "warning" | "blocked" | "error" | "degraded") ?? "ok";
}

function summarizeHealthStatus(health: AdapterHealthResult): ToolWarning | undefined {
  if (health.status === "healthy") {
    return undefined;
  }

  const severity =
    health.status === "unavailable" || health.status === "circuit_open" ? "high" : "medium";

  return {
    warningId: `adapter-health-${health.adapterId}`,
    severity,
    summary: `${health.adapterId} is ${health.status}: ${health.reasons.join("; ")}`,
    evidenceRefs: [`evidence://adapter-health/${health.adapterId}/${health.status}`]
  };
}

function isBlockingHealthStatus(status: AdapterHealthResult["status"]): boolean {
  return status === "stale" || status === "unavailable" || status === "circuit_open";
}

function readLimitForHealth(baseLimit: number | undefined, status: AdapterHealthResult["status"]): number | undefined {
  const normalized = baseLimit ?? 10;
  return status === "degraded" ? Math.min(normalized, 1) : normalized;
}

function capFindingsForHealth<T>(
  values: T[],
  status: AdapterHealthResult["status"],
  cap: number
): T[] {
  return status === "degraded" ? values.slice(0, cap) : values;
}

function defaultContextAnchor(request: {
  portfolioId: string;
  programId?: string;
  projectIds?: string[];
  contextAnchor?: ContextAnchor;
}): ContextAnchor {
  return {
    ...(request.contextAnchor ?? {}),
    portfolioId: request.portfolioId,
    ...(request.programId ? { programId: request.programId } : {}),
    ...(request.projectIds?.length === 1 ? { projectId: request.projectIds[0] } : {})
  };
}

function contextAnchorWithoutAsOf(contextAnchor: ContextAnchor | undefined): ContextAnchor | undefined {
  if (!contextAnchor?.asOf) {
    return contextAnchor;
  }
  const { asOf: _asOf, ...rest } = contextAnchor;
  return rest;
}

function pointerFromCursor(adapterId: string, cursor: string): string {
  return `cursor://${adapterId}/${cursor}`;
}

function collectArtifactRefsFromEvidence(
  evidenceRefs: Array<{ artifactRef?: string }>
): string[] {
  return sortUnique(
    evidenceRefs.flatMap((evidenceRef) => (evidenceRef.artifactRef ? [evidenceRef.artifactRef] : []))
  );
}

function dependencyPointer(dependencyId: string): string {
  return `dependency://${dependencyId.replace(/[^A-Za-z0-9._~:-]/g, "-")}`;
}

function sanitizedPointerSegment(value: string): string {
  return value
    .replace(/^[a-z][a-z0-9_-]*:\/\//, "")
    .replace(/[^A-Za-z0-9._~:-]/g, "-");
}

function addSeconds(iso: string, seconds: number): string {
  return new Date(new Date(iso).valueOf() + seconds * 1000).toISOString();
}

function adapterForTargetRef(ref: string): string {
  if (ref.startsWith("tracker://")) {
    return "tracker";
  }
  if (ref.startsWith("decision://") || ref.startsWith("authority://")) {
    return "decision-log";
  }
  if (ref.startsWith("artifact://") || ref.startsWith("evidence://")) {
    return "evidence-registry";
  }
  if (ref.startsWith("contract://") || ref.startsWith("snapshot://")) {
    return "hoplon";
  }
  return refKind(ref);
}

function actionTypeForTargetRef(ref: string): string {
  if (ref.startsWith("tracker://")) {
    return "propose_tracker_update";
  }
  if (ref.startsWith("decision://") || ref.startsWith("authority://")) {
    return "request_decision";
  }
  if (ref.startsWith("artifact://") || ref.startsWith("evidence://")) {
    return "request_evidence_verification";
  }
  if (ref.startsWith("contract://") || ref.startsWith("snapshot://")) {
    return "request_contract_review";
  }
  return "request_scope_review";
}

function edgeKey(edge: { actionType: string; adapterId: string; targetRef: string }): string {
  return `${edge.adapterId}\u0000${edge.targetRef}\u0000${edge.actionType}`;
}

function comparePlanActionCandidates(
  left: { adapterId: string; targetRef: string; actionType: string },
  right: { adapterId: string; targetRef: string; actionType: string }
): number {
  return (
    left.adapterId.localeCompare(right.adapterId) ||
    left.targetRef.localeCompare(right.targetRef) ||
    left.actionType.localeCompare(right.actionType)
  );
}

function receiptTypeForAction(actionType: string): string {
  if (actionType === "propose_tracker_update") {
    return "tracker_update_receipt";
  }
  if (actionType === "request_decision") {
    return "decision_request_receipt";
  }
  if (actionType === "request_evidence_verification") {
    return "evidence_verification_receipt";
  }
  if (actionType === "request_contract_review") {
    return "contract_review_receipt";
  }
  return "external_action_receipt";
}

function requiredVerifierForAction(
  actionType: string
): "adapter_observed_state" | "content_digest" | "operator_attestation" {
  if (actionType === "request_decision") {
    return "operator_attestation";
  }
  if (actionType === "request_contract_review") {
    return "content_digest";
  }
  return "adapter_observed_state";
}

function defaultEvidencePolicyRefForTarget(ref: string): string {
  if (ref.startsWith("tracker://")) {
    return "policy://evidence/tracker-snapshot-fast-expiry";
  }
  if (ref.startsWith("contract://")) {
    return "policy://active-adapters/hoplon-authz-tier1";
  }
  if (ref.startsWith("decision://") || ref.startsWith("authority://")) {
    return "policy://approval/operator-attestation";
  }
  return "policy://evidence/default-pointer-proof";
}

function isBlockingEvidenceObligation(obligation: {
  policyRef: string;
  status: "satisfied" | "missing" | "stale";
}): boolean {
  if (obligation.status === "satisfied") {
    return false;
  }
  return (
    obligation.policyRef.includes("tier0") ||
    obligation.policyRef.includes("tier1") ||
    obligation.policyRef.includes("fast-expiry") ||
    obligation.status === "stale"
  );
}

function refKind(ref: string): string {
  return ref.split("://", 1)[0] || "reference";
}

function issueIdFromRecord(record: ProgramIntelligenceRecord, issueType: IntelligenceIssueType): string {
  const suffix = record.recordId
    .replace(/^[a-z][a-z0-9_-]*:\/\//, "")
    .replace(/[^A-Za-z0-9._~:-]/g, "-");
  return `issue://program-intelligence/${issueType}/${suffix}`;
}

function issueTypeForRecord(record: ProgramIntelligenceRecord): IntelligenceIssueType {
  switch (record.recordType) {
    case "discarded_decision":
      return "discarded_decision_match";
    case "failure_pattern":
      return "failure_pattern_match";
    case "learning":
      return "learning_match";
    case "risk_signal":
      return "risk_signal";
    case "attempt":
      return record.conditionTags.includes("risk:stale_evidence")
        ? "stale_evidence"
        : "failure_pattern_match";
  }
}

function recommendedActionForIssue(
  issueType: IntelligenceIssueType,
  targetRefs: string[]
): IntelligenceIssueCard["recommendedNextAction"] {
  const summaryTarget = targetRefs.length > 0 ? targetRefs.join(", ") : "the matched PMO scope";
  switch (issueType) {
    case "discarded_decision_match":
      return {
        actionType: "review_discarded_decision",
        summary: `Review whether the proposed work repeats a discarded decision for ${summaryTarget}.`,
        targetRefs
      };
    case "failure_pattern_match":
      return {
        actionType: "apply_failure_pattern_mitigation",
        summary: `Apply or record mitigation for the matched failure pattern on ${summaryTarget}.`,
        targetRefs
      };
    case "learning_match":
      return {
        actionType: "apply_learning",
        summary: `Apply the evidence-backed learning before changing ${summaryTarget}.`,
        targetRefs
      };
    case "repeated_blocker":
      return {
        actionType: "resolve_repeated_blocker",
        summary: `Resolve or reclassify the repeated blocker affecting ${summaryTarget}.`,
        targetRefs
      };
    case "risk_signal":
      return {
        actionType: "review_risk_signal",
        summary: `Review the persisted risk signal before proceeding on ${summaryTarget}.`,
        targetRefs
      };
    case "stale_evidence":
      return {
        actionType: "refresh_stale_evidence",
        summary: `Refresh stale evidence before relying on ${summaryTarget}.`,
        targetRefs
      };
  }
}

function issueCardFromRecord(record: ProgramIntelligenceRecord): IntelligenceIssueCard {
  const issueType = issueTypeForRecord(record);
  const confidenceScore =
    record.recordType === "learning"
      ? record.confidence.score
      : record.reviewStatus === "supported"
        ? 0.9
        : 0.5;
  const affectedScope = record.appliesToRefs
    .map((ref) => ({ kind: refKind(ref), ref }))
    .sort(compareAffectedRefs);
  const ruleId = `rule://program-intelligence/${issueType}/v1`;
  const sourceRecordTypes = sortUniqueRefs([record.recordType]);

  return {
    issueId: issueIdFromRecord(record, issueType),
    issueType,
    title: record.title,
    summary: record.summary,
    affectedScope,
    relevance: {
      score: record.conditionTags.length > 0 ? 0.9 : 0.65,
      rationale: `Matched persisted ${record.recordType} by target ref, condition tag, or scoped repository query.`
    },
    confidence: {
      mode: record.reviewStatus === "supported" ? "deterministic_rule" : "needs_review",
      score: confidenceScore,
      source: "persisted_fact"
    },
    ruleId,
    ruleVersion: "v1",
    provenance: {
      recordIds: [record.recordId],
      ruleId,
      ruleVersion: "v1",
      sourceRecordTypes
    },
    evidenceRefs: sortUniqueRefs(record.evidenceRefs),
    sourceRefs: sortUniqueRefs(record.sourceRefs),
    recommendedNextAction: recommendedActionForIssue(issueType, sortUniqueRefs(record.appliesToRefs)),
    proposedUpdateStatus: record.reviewStatus === "supported" ? "proposed" : "needs_review"
  };
}

function repeatedBlockerCardsFromRelationships(
  relationships: GraphRelationship[],
  targetRefs: string[]
): IntelligenceIssueCard[] {
  return relationships
    .filter((relationship) => ["blocked", "stale"].includes(relationship.status))
    .filter((relationship) => intersectsTargetRefs(relationship, targetRefs))
    .map((relationship) => {
      const target = dependencyPointer(relationship.dependencyId);
      const issueType: IntelligenceIssueType =
        relationship.status === "stale" ? "stale_evidence" : "repeated_blocker";
      const ruleId = `rule://program-intelligence/${issueType}/v1`;
      const evidenceRefs = sortUniqueRefs(relationship.evidenceRefs);
      const targetRefsForAction = sortUniqueRefs([target, relationship.fromRef, relationship.toRef]);

      return {
        issueId: `issue://program-intelligence/${issueType}/${relationship.dependencyId.replace(/[^A-Za-z0-9._~:-]/g, "-")}`,
        issueType,
        title:
          relationship.status === "stale"
            ? "Stale dependency evidence"
            : "Repeated blocking dependency",
        summary: `${relationship.fromRef} ${relationship.dependencyType} ${relationship.toRef} is ${relationship.status}.`,
        affectedScope: targetRefsForAction.map((ref) => ({ kind: refKind(ref), ref })).sort(compareAffectedRefs),
        relevance: {
          score: 0.85,
          rationale: "Matched deterministic dependency state intersecting requested target refs."
        },
        confidence: {
          mode: evidenceRefs.length > 0 ? "deterministic_rule" : "needs_review",
          score: evidenceRefs.length > 0 ? 0.85 : 0.5,
          source: "fixture_rule"
        },
        ruleId,
        ruleVersion: "v1",
        provenance: {
          recordIds: [],
          ruleId,
          ruleVersion: "v1",
          sourceRecordTypes: ["GraphRelationship"]
        },
        evidenceRefs,
        sourceRefs: sortUniqueRefs([target]),
        recommendedNextAction: recommendedActionForIssue(issueType, targetRefsForAction),
        proposedUpdateStatus: evidenceRefs.length > 0 ? "proposed" : "needs_review"
      };
    });
}

function contextPaneItemFromMatch(match: ContextMatch, inclusionReason: string): ContextPaneItem {
  return {
    ref: match.ref,
    kind: match.kind,
    status: match.status,
    summary: match.reason,
    inclusionReason,
    recordedAt: match.recordedAt,
    evidenceRefs: sortUnique(match.evidenceRefs)
  };
}

function contextPaneItemFromDecision(
  decision: DecisionRecord,
  inclusionReason: string
): ContextPaneItem {
  return {
    ref: decision.decisionId,
    kind: "decision",
    status: decision.status,
    summary: decision.summary,
    inclusionReason,
    recordedAt: decision.recordedAt,
    evidenceRefs: sortUnique(decision.evidenceRefs)
  };
}

function contextPaneItemFromRelationship(
  relationship: GraphRelationship,
  inclusionReason: string
): ContextPaneItem {
  return {
    ref: dependencyPointer(relationship.dependencyId),
    kind: "dependency",
    status: relationship.status,
    summary: `${relationship.fromRef} ${relationship.dependencyType} ${relationship.toRef}`,
    inclusionReason,
    recordedAt: relationship.recordedAt,
    evidenceRefs: sortUnique(relationship.evidenceRefs)
  };
}

function intersectsTargetRefs(relationship: GraphRelationship, targetRefs: string[]): boolean {
  if (targetRefs.length === 0) {
    return true;
  }

  return targetRefs.some(
    (targetRef) =>
      relationship.fromRef === targetRef ||
      relationship.toRef === targetRef ||
      relationship.contractRef === targetRef ||
      relationship.evidenceRefs.includes(targetRef) ||
      relationship.policyRefs?.includes(targetRef)
  );
}

function uniqueDecisions(decisions: DecisionRecord[]): DecisionRecord[] {
  const byDecisionId = new Map<string, DecisionRecord>();
  for (const decision of decisions) {
    byDecisionId.set(decision.decisionId, decision);
  }
  return [...byDecisionId.values()].sort(
    (left, right) =>
      left.recordedAt.localeCompare(right.recordedAt) ||
      left.decisionId.localeCompare(right.decisionId)
  );
}

function buildContextPanes(input: {
  matchedRefs: ContextMatch[];
  relationships: GraphRelationship[];
  decisions: DecisionRecord[];
  targetRefs: string[];
  limit?: number;
}): {
  currentState: ContextPaneItem[];
  blockingDependencies: ContextPaneItem[];
  applicableDecisions: ContextPaneItem[];
  supersededDecisions: ContextPaneItem[];
  discardedDecisions: ContextPaneItem[];
  futureDecisions: ContextPaneItem[];
  staleEvidence: ContextPaneItem[];
  recommendedActions: RecommendedContextAction[];
} {
  const limit = input.limit ?? 10;
  const currentState = input.matchedRefs
    .filter((match) => match.status !== "stale")
    .map((match) => contextPaneItemFromMatch(match, "matched by repository or read-only adapter"))
    .sort(compareContextPaneItems)
    .slice(0, limit);
  const blockingDependencies = input.relationships
    .filter((relationship) => ["blocked", "pending", "stale"].includes(relationship.status))
    .filter((relationship) => intersectsTargetRefs(relationship, input.targetRefs))
    .map((relationship) =>
      contextPaneItemFromRelationship(
        relationship,
        `${relationship.status} dependency intersects the requested context target`
      )
    )
    .sort(compareContextPaneItems)
    .slice(0, limit);
  const staleEvidence = [
    ...input.matchedRefs
      .filter((match) => match.status === "stale")
      .map((match) =>
        contextPaneItemFromMatch(match, "stale observed state must remain pointer-only")
      ),
    ...input.relationships
      .filter((relationship) => relationship.status === "stale")
      .filter((relationship) => intersectsTargetRefs(relationship, input.targetRefs))
      .map((relationship) =>
        contextPaneItemFromRelationship(
          relationship,
          "stale dependency evidence cannot satisfy current read requirements silently"
        )
      )
  ]
    .sort(compareContextPaneItems)
    .slice(0, limit);
  const decisionsByStatus = (status: DecisionRecord["status"], inclusionReason: string) =>
    input.decisions
      .filter((decision) => decision.status === status)
      .map((decision) => contextPaneItemFromDecision(decision, inclusionReason))
      .sort(compareContextPaneItems)
      .slice(0, limit);
  const recommendedActions: RecommendedContextAction[] = [
    ...staleEvidence.map((item, index) => ({
      actionId: `action://query-program-context/review-stale-evidence/${index + 1}`,
      actionType: "review_stale_evidence",
      summary: `Refresh or verify stale evidence for ${item.ref}.`,
      inclusionReason: "stale evidence pane item requires an explicit downstream refresh or verification decision",
      targetRefs: [item.ref],
      evidenceRefs: sortUnique(item.evidenceRefs)
    })),
    ...blockingDependencies.map((item, index) => ({
      actionId: `action://query-program-context/resolve-blocking-dependency/${index + 1}`,
      actionType: "resolve_blocking_dependency",
      summary: `Resolve or reclassify ${item.status} dependency ${item.ref}.`,
      inclusionReason: "blocking dependency pane item affects execution readiness",
      targetRefs: [item.ref],
      evidenceRefs: sortUnique(item.evidenceRefs)
    }))
  ].sort(compareRecommendedActions);

  return {
    currentState,
    blockingDependencies,
    applicableDecisions: decisionsByStatus("applicable", "decision applies to the requested anchor"),
    supersededDecisions: decisionsByStatus("superseded", "decision is superseded for the requested anchor"),
    discardedDecisions: decisionsByStatus("discarded", "decision was discarded and must not be treated as applicable"),
    futureDecisions: decisionsByStatus(
      "future_not_applicable",
      "decision is recorded but not yet applicable to the requested anchor"
    ),
    staleEvidence,
    recommendedActions
  };
}

function makeWarning(
  warningId: string,
  severity: ToolWarning["severity"],
  summary: string,
  evidenceRefs: string[] = []
): ToolWarning {
  return {
    warningId,
    severity,
    summary,
    evidenceRefs: sortUnique(evidenceRefs)
  };
}

function isRegistryPatch(value: unknown): value is {
  macroId: string;
  set: Record<string, unknown>;
} {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as { macroId?: unknown }).macroId === "string" &&
    Boolean((value as { set?: unknown }).set) &&
    typeof (value as { set?: unknown }).set === "object"
  );
}

type ManageIntegrationAction = (typeof MANAGE_INTEGRATION_ACTIONS)[number];

type ManagedIntegrationItemInput = {
  affectedProjectIds?: string[];
  artifactRefs?: string[];
  blockedProjectId?: string;
  evidenceRefs?: string[];
  itemId?: string;
  itemType?: IntegrationCoordinationItem["itemType"];
  ownerProjectId?: string;
  projectId?: string;
  reporterProjectId?: string;
  status?: string;
  summary?: string;
  trackerRefs?: string[];
};

type ManagedIntegrationInput = {
  artifactRef?: string;
  idempotencyKey?: string;
  integrationPointId: string;
  item?: ManagedIntegrationItemInput;
  projectId?: string;
  projectRole?: string;
  trackerRef?: string;
};

function coordinationItemTypeForAction(action: ManageIntegrationAction): IntegrationCoordinationItem["itemType"] | undefined {
  if (action === "add_artifact") {
    return "artifact";
  }
  if (action === "record_goal" || action === "acknowledge_goal") {
    return "goal";
  }
  if (action === "submit_gap_report" || action === "update_gap") {
    return "gap";
  }
  if (
    action === "record_blocker" ||
    action === "update_blocker" ||
    action === "assign_blocker_owner" ||
    action === "mark_blocker_unblocked" ||
    action === "mark_blocker_resolved" ||
    action === "reopen_blocker" ||
    action === "identify_blockers"
  ) {
    return "blocker";
  }
  if (action === "request_decision" || action === "record_decision") {
    return "decision";
  }
  if (action === "submit_project_response") {
    return "response";
  }
  if (action === "record_conflict") {
    return "conflict";
  }
  if (action === "record_learning") {
    return "learning";
  }
  if (action === "link_tracker_ref") {
    return "tracker_ref";
  }
  return undefined;
}

function coordinationStatusForAction(action: ManageIntegrationAction, requestedStatus?: string): string {
  if (requestedStatus) {
    return requestedStatus;
  }
  const statuses: Partial<Record<ManageIntegrationAction, string>> = {
    acknowledge_goal: "acknowledged",
    add_artifact: "registered",
    assign_blocker_owner: "owner_assigned",
    identify_blockers: "identified",
    link_tracker_ref: "linked",
    mark_blocker_resolved: "resolved",
    mark_blocker_unblocked: "unblocked",
    record_blocker: "open",
    record_conflict: "open",
    record_decision: "recorded",
    record_goal: "proposed",
    record_learning: "recorded",
    reopen_blocker: "reopened",
    request_decision: "requested",
    submit_gap_report: "open",
    submit_project_response: "submitted",
    supersede: "superseded",
    update_blocker: "updated",
    update_gap: "updated"
  };
  return statuses[action] ?? "recorded";
}

function coordinationItemId(input: {
  action: ManageIntegrationAction;
  correlationId: string;
  integrationPointId: string;
  itemType: IntegrationCoordinationItem["itemType"];
  requestedItemId?: string;
}): string {
  return (
    input.requestedItemId ??
    `integration-item://${sanitizedPointerSegment(input.integrationPointId)}/${input.itemType}/${sanitizedPointerSegment(
      input.correlationId
    )}/${input.action}`
  );
}

function buildCoordinationItem(input: {
  action: ManageIntegrationAction;
  correlationId: string;
  evidenceRefs: string[];
  integration: ManagedIntegrationInput;
  recordedAt: string;
}): IntegrationCoordinationItem | undefined {
  if (!COORDINATION_ACTIONS.has(input.action)) {
    return undefined;
  }
  const item = input.integration.item ?? {};
  const itemType = item.itemType ?? coordinationItemTypeForAction(input.action);
  if (!itemType) {
    return undefined;
  }
  const projectId = item.projectId ?? input.integration.projectId;
  const artifactRefs = sortUniqueRefs([
    ...(item.artifactRefs ?? []),
    ...(input.integration.artifactRef ? [input.integration.artifactRef] : [])
  ]);
  const trackerRefs = sortUniqueRefs([
    ...(item.trackerRefs ?? []),
    ...(input.integration.trackerRef ? [input.integration.trackerRef] : [])
  ]);
  const affectedProjectIds = sortUniqueRefs([
    ...(item.affectedProjectIds ?? []),
    ...(projectId ? [projectId] : []),
    ...(item.blockedProjectId ? [item.blockedProjectId] : []),
    ...(item.reporterProjectId ? [item.reporterProjectId] : [])
  ]);

  return {
    affectedProjectIds,
    artifactRefs,
    ...(item.blockedProjectId ? { blockedProjectId: item.blockedProjectId } : {}),
    createdAt: input.recordedAt,
    evidenceRefs: sortUniqueRefs([...(item.evidenceRefs ?? []), ...input.evidenceRefs]),
    integrationPointId: input.integration.integrationPointId,
    itemId: coordinationItemId({
      action: input.action,
      correlationId: input.correlationId,
      integrationPointId: input.integration.integrationPointId,
      itemType,
      requestedItemId: item.itemId
    }),
    itemType,
    ...(item.ownerProjectId ? { ownerProjectId: item.ownerProjectId } : {}),
    ...(projectId ? { projectId } : {}),
    ...(item.reporterProjectId ? { reporterProjectId: item.reporterProjectId } : {}),
    status: coordinationStatusForAction(input.action, item.status),
    ...(item.summary ? { summary: item.summary } : {}),
    trackerRefs,
    updatedAt: input.recordedAt
  };
}

function mergeCoordinationItems(
  existingItems: IntegrationCoordinationItem[] | undefined,
  nextItem: IntegrationCoordinationItem | undefined
): IntegrationCoordinationItem[] {
  const byId = new Map<string, IntegrationCoordinationItem>();
  for (const item of existingItems ?? []) {
    byId.set(item.itemId, {
      ...item,
      affectedProjectIds: sortUniqueRefs(item.affectedProjectIds),
      artifactRefs: sortUniqueRefs(item.artifactRefs),
      evidenceRefs: sortUniqueRefs(item.evidenceRefs),
      trackerRefs: sortUniqueRefs(item.trackerRefs)
    });
  }
  if (nextItem) {
    const existing = byId.get(nextItem.itemId);
    byId.set(nextItem.itemId, {
      ...existing,
      ...nextItem,
      createdAt: existing?.createdAt ?? nextItem.createdAt,
      affectedProjectIds: sortUniqueRefs([
        ...(existing?.affectedProjectIds ?? []),
        ...nextItem.affectedProjectIds
      ]),
      artifactRefs: sortUniqueRefs([...(existing?.artifactRefs ?? []), ...nextItem.artifactRefs]),
      evidenceRefs: sortUniqueRefs([...(existing?.evidenceRefs ?? []), ...nextItem.evidenceRefs]),
      trackerRefs: sortUniqueRefs([...(existing?.trackerRefs ?? []), ...nextItem.trackerRefs])
    });
  }
  return [...byId.values()].sort((left, right) => left.itemId.localeCompare(right.itemId));
}

function inboxItemsForProjects(
  coordinationItems: IntegrationCoordinationItem[],
  projectIds: string[]
): Array<{
  action: string;
  itemId: string;
  itemType: string;
  projectId: string;
  summary: string;
}> {
  const projectIdSet = new Set(projectIds);
  return coordinationItems
    .flatMap((item) =>
      item.affectedProjectIds
        .filter((projectId) => projectIdSet.has(projectId))
        .map((projectId) => ({
          action:
            item.itemType === "decision"
              ? "respond_to_decision"
              : item.itemType === "blocker"
                ? "review_blocker"
                : "review_item",
          itemId: item.itemId,
          itemType: item.itemType,
          projectId,
          summary: item.summary ?? `${item.itemType} ${item.status}`
        }))
    )
    .sort(
      (left, right) =>
        left.projectId.localeCompare(right.projectId) ||
        left.itemType.localeCompare(right.itemType) ||
      left.itemId.localeCompare(right.itemId)
    );
}

const TERMINAL_COORDINATION_STATUSES = new Set([
  "accepted",
  "approved",
  "rejected",
  "resolved",
  "retired",
  "superseded",
  "unblocked",
  "verified"
]);

const EVIDENCE_REQUIRED_COORDINATION_ITEM_TYPES = new Set<IntegrationCoordinationItem["itemType"]>([
  "blocker",
  "conflict",
  "decision",
  "gap",
  "response"
]);

function coordinationItemNeedsDriftReview(item: IntegrationCoordinationItem): boolean {
  const hasPointerSupport =
    item.evidenceRefs.length > 0 || item.artifactRefs.length > 0 || item.trackerRefs.length > 0;
  if (item.status === "superseded") {
    return !hasPointerSupport;
  }
  if (EVIDENCE_REQUIRED_COORDINATION_ITEM_TYPES.has(item.itemType) && item.evidenceRefs.length === 0) {
    return true;
  }
  if (TERMINAL_COORDINATION_STATUSES.has(item.status)) {
    return false;
  }
  if (item.itemType === "gap" || item.itemType === "blocker" || item.itemType === "conflict") {
    return true;
  }
  if (item.itemType === "decision") {
    return item.status === "requested" || item.status === "disputed";
  }
  if (item.itemType === "response") {
    return item.status === "requested" || item.status === "disputed";
  }
  return false;
}

function integrationMatchesTargetRefs(
  integrationPoint: IntegrationPointRecord,
  targetRefs: string[]
): boolean {
  if (targetRefs.length === 0) {
    return true;
  }
  const searchableRefs = sortUniqueRefs([
    integrationPoint.integrationPointId,
    integrationPoint.producerProjectId,
    ...integrationPoint.consumerProjectIds,
    ...(integrationPoint.artifactRefs ?? []),
    ...(integrationPoint.evidenceRefs ?? []),
    ...(integrationPoint.coordinationItems ?? []).flatMap((item) => [
      item.itemId,
      item.integrationPointId,
      item.blockedProjectId ?? "",
      item.ownerProjectId ?? "",
      item.projectId ?? "",
      item.reporterProjectId ?? "",
      ...item.affectedProjectIds,
      ...item.artifactRefs,
      ...item.evidenceRefs,
      ...item.trackerRefs
    ])
  ]);
  const searchableRefSet = new Set(searchableRefs);
  return targetRefs.some((ref) => searchableRefSet.has(ref));
}

function actorMayResolveBlocker(actor: ProgramToolActor, item: IntegrationCoordinationItem | undefined): boolean {
  if (!item) {
    return true;
  }
  const eligibleProjects = [item.reporterProjectId, item.blockedProjectId].filter(
    (value): value is string => Boolean(value)
  );
  if (eligibleProjects.length === 0) {
    return true;
  }
  return eligibleProjects.some((projectId) => actor.projectGrants.includes(projectId));
}

type ManageEvidenceAction = (typeof MANAGE_EVIDENCE_ACTIONS)[number];

type ManagedEvidenceItemInput = {
  artifactRef?: string;
  artifactType?: string;
  attachesToRefs?: string[];
  classification?: ArtifactRef["classification"];
  contentHash?: ArtifactRef["contentHash"];
  evidenceRef?: string;
  evidenceType?: string;
  kind?: string;
  redactionStatus?: ArtifactRef["redactionStatus"];
  retentionPolicyRef?: string;
  storageUri?: string;
  summary?: string;
};

function evidenceRefsFromManagedItem(item: ManagedEvidenceItemInput | undefined): string[] {
  return sortUniqueRefs([
    ...(item?.evidenceRef ? [item.evidenceRef] : []),
    ...(item?.artifactRef ? [item.artifactRef] : []),
    ...(item?.attachesToRefs ?? [])
  ]);
}

function buildArtifactRecord(input: {
  item: ManagedEvidenceItemInput;
  now: string;
  portfolioId: string;
  existing?: ArtifactRef;
}): ArtifactRef | undefined {
  if (!input.item.artifactRef) {
    return undefined;
  }
  return {
    artifactRef: input.item.artifactRef,
    portfolioId: input.portfolioId,
    artifactType: input.item.artifactType ?? input.existing?.artifactType ?? "pmo_artifact",
    storageUri: input.item.storageUri ?? input.existing?.storageUri ?? input.item.artifactRef,
    contentHash:
      input.item.contentHash ??
      input.existing?.contentHash ?? {
        algorithm: "sha256",
        value: "0000000000000000000000000000000000000000000000000000000000000000"
      },
    ...(input.item.classification ?? input.existing?.classification
      ? { classification: input.item.classification ?? input.existing?.classification }
      : {}),
    redactionStatus: input.item.redactionStatus ?? input.existing?.redactionStatus ?? "not_required",
    ...(input.item.retentionPolicyRef ?? input.existing?.retentionPolicyRef
      ? { retentionPolicyRef: input.item.retentionPolicyRef ?? input.existing?.retentionPolicyRef }
      : {}),
    createdAt: input.existing?.createdAt ?? input.now
  };
}

function buildEvidenceRecord(input: {
  item: ManagedEvidenceItemInput;
  now: string;
  portfolioId: string;
  existing?: EvidenceRef;
}): EvidenceRef | undefined {
  if (!input.item.evidenceRef) {
    return undefined;
  }
  return {
    evidenceRef: input.item.evidenceRef,
    portfolioId: input.portfolioId,
    kind: input.item.kind ?? input.item.evidenceType ?? input.existing?.kind ?? "pmo_evidence",
    recordedAt: input.existing?.recordedAt ?? input.now,
    ...(input.item.artifactRef ?? input.existing?.artifactRef
      ? { artifactRef: input.item.artifactRef ?? input.existing?.artifactRef }
      : {}),
    attachesToRefs: sortUniqueRefs([
      ...(input.existing?.attachesToRefs ?? []),
      ...(input.item.attachesToRefs ?? [])
    ]),
    ...(input.item.classification ?? input.existing?.classification
      ? { classification: input.item.classification ?? input.existing?.classification }
      : {}),
    ...(input.item.redactionStatus ?? input.existing?.redactionStatus
      ? { redactionStatus: input.item.redactionStatus ?? input.existing?.redactionStatus }
      : {}),
    ...(input.item.retentionPolicyRef ?? input.existing?.retentionPolicyRef
      ? { retentionPolicyRef: input.item.retentionPolicyRef ?? input.existing?.retentionPolicyRef }
      : {}),
    ...(input.item.summary ?? input.existing?.summary ? { summary: input.item.summary ?? input.existing?.summary } : {})
  };
}

export class ProgramToolService {
  #adapterRegistry: ProgramToolServiceDependencies["adapterRegistry"];
  #documentationCatalog: DocumentationCatalog;
  #now: () => string;
  #repository: ProgramManagerRepository;
  #runtimeKnowledge: ProgramManagerRuntimeKnowledge;

  constructor(dependencies: ProgramToolServiceDependencies) {
    this.#adapterRegistry = dependencies.adapterRegistry;
    this.#documentationCatalog = dependencies.documentationCatalog ?? DOCUMENTATION_CATALOG;
    this.#now = dependencies.now ?? (() => "2026-05-03T12:00:00Z");
    this.#repository = dependencies.repository;
    this.#runtimeKnowledge = dependencies.runtimeKnowledge ?? DEFAULT_RUNTIME_KNOWLEDGE;
  }

  #runtimeStorageWarnings() {
    if (this.#runtimeKnowledge.status === "ok" && this.#runtimeKnowledge.sharedAcrossMcpInstances) {
      return [];
    }
    return [
      makeWarning(
        "pmo-runtime-knowledge-authority-gap",
        this.#runtimeKnowledge.sharedAcrossMcpInstances ? "medium" : "high",
        this.#runtimeKnowledge.gaps.join(" "),
        ["evidence://program-manager-mcp/runtime/knowledge-authority"]
      )
    ];
  }

  #helpGuideWithRuntimeKnowledge<T extends { firstAgentInstruction: string; operatingRules: string[] }>(
    helpGuide: T
  ): T {
    const runtimeRules = this.#runtimeKnowledge.operatingRules.filter((rule) => rule.length > 0);
    return {
      ...helpGuide,
      firstAgentInstruction: `${this.#runtimeKnowledge.firstAgentInstruction} ${helpGuide.firstAgentInstruction}`,
      operatingRules: [
        ...runtimeRules,
        ...helpGuide.operatingRules.filter((rule) => !runtimeRules.includes(rule))
      ]
    } as T;
  }

  async pmoMacro(requestInput: unknown, actor: ProgramToolActor) {
    const normalizedRequestInput = normalizePmoMacroInput(requestInput);
    const fallback =
      normalizedRequestInput && typeof normalizedRequestInput === "object"
        ? normalizedRequestInput as Record<string, unknown>
        : {};
    const parsed = pmoMacroRequestSchema.safeParse(normalizedRequestInput);
    if (!parsed.success) {
      const deterministicCore = {
        action: "validate" as const,
        guidance: buildOmniGuidance({
          acceptedInvocationShapes: [
            "Canonical pmo_macro invoke shape: macroId = macro://pmo/<macro-name>, input = { ... }.",
            "Compatibility shape accepted by PMO: macroName = <macro-name>, macroInput = { ... }.",
            "Use macroName values catch_me_up, simulate_impact, propose_unblock_plan, detect_drift, or analyze_blockers."
          ],
          correctForm: {
            toolName: "pmo_macro",
            arguments: {
              action: "invoke",
              portfolioId: String(fallback.portfolioId ?? "portfolio://default"),
              ...(typeof fallback.programId === "string" ? { programId: fallback.programId } : {}),
              traceId: String(fallback.traceId ?? "trace://pmo-macro/invalid-request"),
              correlationId: String(fallback.correlationId ?? "corr://pmo-macro/invalid-request/retry"),
              macroId: "macro://pmo/catch_me_up",
              input: {
                targetRefs: ["integration://<integration-slug>"]
              }
            }
          },
          macroAutomation: buildMacroAutomationGuidance()
        }),
        objectModelRefs: [],
        registryVersion: "unknown"
      };
      return pmoMacroResultSchema.parse({
        schemaVersion: "1",
        status: "blocked",
        toolName: "pmo_macro",
        portfolioId: String(fallback.portfolioId ?? "portfolio://unknown"),
        evidenceRefs: ["evidence://schema/pmo-macro-request/validation-failed"],
        artifactRefs: [],
        redactionSummary: buildRedactionSummary({
          omittedKinds: ["invalid_request_payload"],
          policyRefs: DEFAULT_REDACTION_POLICY_REFS
        }),
        warnings: [
          makeWarning(
            "pmo-macro-request-invalid",
            "high",
            parsed.error.issues.map((issue) => issue.message).join("; "),
            ["evidence://schema/pmo-macro-request/validation-failed"]
          )
        ],
        deterministicCore,
        stateVersionHash: stateVersionHashFromInput({
          deterministicCore,
          validationError: parsed.error.issues.map((issue) => issue.message).sort()
        }),
        nextRecommendedTool: "pmo_macro",
        traceId: String(fallback.traceId ?? "trace://pmo-macro/invalid-request"),
        correlationId: String(fallback.correlationId ?? "corr://pmo-macro/invalid-request")
      });
    }

    const request = parsed.data;
    try {
      assertReadAuthorized(actor, request, this.#now());
    } catch (error) {
      return pmoMacroResultSchema.parse(this.#blockedEnvelope("pmo_macro", request, error));
    }

    const currentRegistry = workflowOnlyMacroRegistry(
      (await this.#repository.getMacroRegistry({ portfolioId: request.portfolioId })) ??
        createBuiltInMacroRegistry(request.portfolioId, this.#now())
    );
    const requestedMacro = request.macroId
      ? currentRegistry.macros.find((entry) => entry.macroId === request.macroId)
      : undefined;
    const baseCore = {
      action: request.action,
      contextAnchor: request.contextAnchor,
      objectModelRefs: sortUniqueRefs([request.macroId ?? "", request.registryPatchRef ?? ""]),
      registryVersion: currentRegistry.registryVersion
    };
    const artifactRefs = sortUniqueRefs([
      ...(currentRegistry.artifactRefs ?? []),
      ...(request.action === "list" ? ["artifact://pmo/macro/registry-export/built-in"] : [])
    ]);
    const evidenceRefs = sortUniqueRefs(currentRegistry.evidenceRefs);

    if (request.action === "edit_registry") {
      const editResult = await applyAndPersistMacroRegistryEdit(
        this.#repository,
        request.portfolioId,
        isRegistryPatch(request.input?.patch)
          ? request.input.patch
          : { macroId: request.macroId ?? "", set: {} },
        {
          actorId: actor.actorId,
          portfolioIds: actor.portfolioGrants,
          roleRefs:
            actor.actorRole === "program_manager_agent"
              ? [PMO_MACRO_OPERATOR_ROLE, PMO_MACRO_REGISTRY_ADMIN_ROLE]
              : [PMO_MACRO_OPERATOR_ROLE]
        },
        this.#now()
      );
      const deterministicCore = {
        ...baseCore,
        registry: editResult.accepted ? editResult.registry : currentRegistry
      };
      const status = editResult.accepted ? "ok" : "blocked";
      return pmoMacroResultSchema.parse({
        schemaVersion: "1",
        status,
        toolName: "pmo_macro",
        portfolioId: request.portfolioId,
        ...(request.programId ? { programId: request.programId } : {}),
        ...(request.projectIds ? { projectIds: sortUniqueRefs(request.projectIds) } : {}),
        evidenceRefs: sortUniqueRefs(editResult.evidenceRefs),
        artifactRefs,
        redactionSummary: buildRedactionSummary({
          policyRefs: DEFAULT_REDACTION_POLICY_REFS
        }),
        warnings: editResult.accepted
          ? []
          : [makeWarning(editResult.errorCode, "high", editResult.summary, editResult.evidenceRefs)],
        deterministicCore,
        stateVersionHash: stateVersionHashFromInput({ deterministicCore, status }),
        nextRecommendedTool: "pmo_macro",
        traceId: request.traceId,
        correlationId: request.correlationId
      });
    }

    if (request.action === "invoke" && requestedMacro?.macroName === "catch_me_up") {
      const targetRefs = Array.isArray(request.input?.targetRefs)
        ? request.input.targetRefs.filter((ref): ref is string => typeof ref === "string")
        : [];
      const scope = {
        portfolioId: request.portfolioId,
        ...(request.programId ? { programId: request.programId } : {}),
        ...(request.projectIds ? { projectIds: sortUniqueRefs(request.projectIds) } : {})
      };
      const [context, facts] = await Promise.all([
        this.#repository.getProgramContext({
          scope,
          contextAnchor: request.contextAnchor,
          targetRefs,
          limit: 12,
          includeSuperseded: false,
          includeFutureNotApplicable: false
        }),
        this.#repository.listMacroFacts({
          scope,
          contextAnchor: request.contextAnchor,
          targetRefs,
          limit: 12
        })
      ]);
      const objectModelRefs = sortUniqueRefs([
        ...targetRefs,
        ...context.matchedRefs.map((match) => match.ref),
        ...facts.tasks.map((task) => task.taskRef),
        ...facts.blockers.map((blocker) => blocker.blockerRef),
        ...facts.contracts.map((contract) => contract.contractRef),
        ...facts.contracts.map((contract) => contract.producerRef),
        ...facts.contracts.flatMap((contract) => contract.consumerRefs),
        ...facts.contracts.flatMap((contract) =>
          contract.integrationPointId ? [contract.integrationPointId] : []
        ),
        ...facts.dependencyEdges.map((edge) => edge.dependencyRef),
        ...facts.dependencyEdges.flatMap((edge) => [
          edge.fromRef,
          edge.toRef,
          ...edge.policyRefs
        ]),
        ...facts.runbooks.map((runbook) => runbook.runbookRef)
      ]);
      const deterministicCore = {
        ...baseCore,
        macro: requestedMacro,
        guidance: buildOmniGuidance({
          macroAutomation: buildMacroAutomationGuidance(),
          integrationAlignment: buildIntegrationAlignmentGuidance()
        }),
        objectModelRefs
      };
      const stateVersionHash = stateVersionHashFromInput({
        deterministicCore,
        evidenceRefs,
        status: "ok"
      });
      return pmoMacroResultSchema.parse({
        schemaVersion: "1",
        status: "ok",
        toolName: "pmo_macro",
        portfolioId: request.portfolioId,
        ...(request.programId ? { programId: request.programId } : {}),
        ...(request.projectIds ? { projectIds: sortUniqueRefs(request.projectIds) } : {}),
        evidenceRefs,
        artifactRefs: [`artifact://pmo/macro/catch-me-up/context@${stateVersionHash}`],
        redactionSummary: buildRedactionSummary({
          omittedKinds: ["raw_database_rows", "logs", "provider_transcripts", "scratchpads"],
          policyRefs: DEFAULT_REDACTION_POLICY_REFS
        }),
        warnings: [],
        deterministicCore,
        advisoryPane: {
          content: {
            summary: `Bounded catch-me-up context includes ${objectModelRefs.length} pointer refs and omits ${context.omittedRefCount} overflow refs.`
          },
          excludedFromDeterministicHash: true,
          modelAssisted: false
        },
        stateVersionHash,
        nextRecommendedTool: "pmo_macro",
        traceId: request.traceId,
        correlationId: request.correlationId
      });
    }

    if (request.action === "invoke" && requestedMacro?.macroName === "simulate_impact") {
      const targetRefs = Array.isArray(request.input?.targetRefs)
        ? request.input.targetRefs.filter((ref): ref is string => typeof ref === "string")
        : [];
      const changeRef = typeof request.input?.changeRef === "string" ? request.input.changeRef : request.macroId;
      const scope = {
        portfolioId: request.portfolioId,
        ...(request.programId ? { programId: request.programId } : {}),
        ...(request.projectIds ? { projectIds: sortUniqueRefs(request.projectIds) } : {})
      };
      const impact = await this.#repository.assessImpact({
        scope,
        changeRef: changeRef ?? "change://pmo/simulate-impact/unspecified",
        changeKind: typeof request.input?.changeKind === "string" ? request.input.changeKind : "hypothetical",
        targetRefs,
        traversalBudgetRef:
          typeof request.input?.traversalBudgetRef === "string"
            ? request.input.traversalBudgetRef
            : "budget://pmo/macro/simulate-impact/default",
        contextAnchor: request.contextAnchor
      });
      const objectModelRefs = sortUniqueRefs([
        changeRef ?? "",
        ...targetRefs,
        ...impact.affectedRefs.map((ref) => ref.ref),
        ...impact.findings.map((finding) => `finding://pmo/${encodeURIComponent(finding.findingId)}`),
        ...impact.requiredApprovals.map((approval) => approval.authorityRef),
        ...impact.evidenceObligations.map((obligation) => obligation.targetRef)
      ]);
      const deterministicCore = {
        ...baseCore,
        macro: requestedMacro,
        guidance: buildOmniGuidance({
          macroAutomation: buildMacroAutomationGuidance(),
          integrationAlignment: buildIntegrationAlignmentGuidance()
        }),
        objectModelRefs
      };
      const stateVersionHash = stateVersionHashFromInput({
        deterministicCore,
        nonPersistentSimulation: true,
        status: "warning"
      });
      return pmoMacroResultSchema.parse({
        schemaVersion: "1",
        status: impact.findings.length > 0 ? "warning" : "ok",
        toolName: "pmo_macro",
        portfolioId: request.portfolioId,
        ...(request.programId ? { programId: request.programId } : {}),
        ...(request.projectIds ? { projectIds: sortUniqueRefs(request.projectIds) } : {}),
        evidenceRefs,
        artifactRefs: [`artifact://pmo/macro/simulate-impact/report@${stateVersionHash}`],
        redactionSummary: buildRedactionSummary({
          omittedKinds: ["raw_database_rows", "provider_transcripts", "scratchpads"],
          policyRefs: DEFAULT_REDACTION_POLICY_REFS
        }),
        warnings: [
          makeWarning(
            "pmo-macro-simulation-non-persistent",
            "low",
            "Simulation is non-persistent and did not update canonical PMO truth.",
            evidenceRefs
          )
        ],
        deterministicCore,
        advisoryPane: {
          content: {
            summary: `Non-persistent impact simulation found ${impact.affectedRefs.length} affected refs, ${impact.findings.length} findings, ${impact.requiredApprovals.length} approvals, and ${impact.evidenceObligations.length} evidence obligations.`
          },
          excludedFromDeterministicHash: true,
          modelAssisted: false
        },
        stateVersionHash,
        nextRecommendedTool: "pmo_macro",
        traceId: request.traceId,
        correlationId: request.correlationId
      });
    }

    if (
      request.action === "invoke" &&
      (requestedMacro?.macroName === "analyze_blockers" ||
        requestedMacro?.macroName === "propose_unblock_plan")
    ) {
      const targetRefs = Array.isArray(request.input?.targetRefs)
        ? request.input.targetRefs.filter((ref): ref is string => typeof ref === "string")
        : [];
      const scope = {
        portfolioId: request.portfolioId,
        ...(request.programId ? { programId: request.programId } : {}),
        ...(request.projectIds ? { projectIds: sortUniqueRefs(request.projectIds) } : {})
      };
      const facts = await this.#repository.listMacroFacts({
        scope,
        contextAnchor: request.contextAnchor,
        targetRefs,
        limit: 20
      });
      const openBlockers = facts.blockers.filter((blocker) => blocker.status === "open");
      const blockedRefs = sortUniqueRefs(openBlockers.flatMap((blocker) => blocker.blockedRefs));
      const runbookRefs = facts.runbooks.map((runbook) => runbook.runbookRef);
      const proposedActionRefs = sortUniqueRefs([
        ...openBlockers.map((blocker) => `action://pmo/unblock/${encodeURIComponent(blocker.blockerRef)}`),
        ...facts.contracts.map((contract) => `action://pmo/request-approval/${encodeURIComponent(contract.contractRef)}`),
        ...facts.dependencyEdges
          .filter((edge) => edge.evidenceStatus !== "supported" || edge.status !== "active")
          .map((edge) => `action://pmo/refresh-evidence/${encodeURIComponent(edge.dependencyRef)}`),
        ...facts.tasks
          .filter((task) => task.status === "blocked" || task.blockerRefs?.length)
          .map((task) => `action://pmo/request-receipt/${encodeURIComponent(task.taskRef)}`)
      ]).slice(0, 12);
      const expectedReceiptRefs = proposedActionRefs.map(
        (ref) => `receipt://pmo/expected/${encodeURIComponent(ref)}`
      );
      const objectModelRefs = sortUniqueRefs([
        ...targetRefs,
        ...openBlockers.map((blocker) => blocker.blockerRef),
        ...blockedRefs,
        ...runbookRefs,
        ...facts.tasks.map((task) => task.taskRef),
        ...facts.contracts.map((contract) => contract.contractRef),
        ...facts.dependencyEdges.map((edge) => edge.dependencyRef),
        ...proposedActionRefs,
        ...expectedReceiptRefs
      ]);
      const deterministicCore = {
        ...baseCore,
        macro: requestedMacro,
        guidance: buildOmniGuidance({
          macroAutomation: buildMacroAutomationGuidance(),
          integrationAlignment: buildIntegrationAlignmentGuidance()
        }),
        objectModelRefs
      };
      const stateVersionHash = stateVersionHashFromInput({
        deterministicCore,
        proposedOnly: true,
        status: proposedActionRefs.length > 0 ? "warning" : "ok"
      });
      return pmoMacroResultSchema.parse({
        schemaVersion: "1",
        status: proposedActionRefs.length > 0 ? "warning" : "ok",
        toolName: "pmo_macro",
        portfolioId: request.portfolioId,
        ...(request.programId ? { programId: request.programId } : {}),
        ...(request.projectIds ? { projectIds: sortUniqueRefs(request.projectIds) } : {}),
        evidenceRefs: sortUniqueRefs([
          ...evidenceRefs,
          ...facts.blockers.flatMap((blocker) => blocker.evidenceRefs),
          ...facts.tasks.flatMap((task) => task.evidenceRefs),
          ...facts.contracts.flatMap((contract) => contract.evidenceRefs),
          ...facts.dependencyEdges.flatMap((edge) => edge.evidenceRefs)
        ]),
        artifactRefs: [`artifact://pmo/macro/unblock-plan/report@${stateVersionHash}`],
        redactionSummary: buildRedactionSummary({
          omittedKinds: ["raw_database_rows", "logs", "provider_transcripts", "scratchpads"],
          policyRefs: DEFAULT_REDACTION_POLICY_REFS
        }),
        warnings: [
          makeWarning(
            "pmo-macro-proposed-actions-only",
            "low",
            "PMO produced proposed external actions and expected receipts only; it did not execute downstream work.",
            evidenceRefs
          )
        ],
        deterministicCore,
        advisoryPane: {
          content: {
            summary: `Classified ${openBlockers.length} open blockers and proposed ${proposedActionRefs.length} external actions with ${expectedReceiptRefs.length} expected receipts.`
          },
          excludedFromDeterministicHash: true,
          modelAssisted: false
        },
        stateVersionHash,
        nextRecommendedTool: "record_program_receipt",
        traceId: request.traceId,
        correlationId: request.correlationId
      });
    }

    if (request.action === "invoke" && requestedMacro?.macroName === "detect_drift") {
      const targetRefs = Array.isArray(request.input?.targetRefs)
        ? request.input.targetRefs.filter((ref): ref is string => typeof ref === "string")
        : [];
      const scope = {
        portfolioId: request.portfolioId,
        ...(request.programId ? { programId: request.programId } : {}),
        ...(request.projectIds ? { projectIds: sortUniqueRefs(request.projectIds) } : {})
      };
      const [facts, ledger, cursors, integrationPoints] = await Promise.all([
        this.#repository.listMacroFacts({ scope, contextAnchor: request.contextAnchor, targetRefs, limit: 24 }),
        this.#repository.listReceiptLedger({ scope, limit: 24 }),
        this.#repository.getSyncCursors(scope),
        this.#repository.listIntegrationPoints(scope)
      ]);
      const relevantIntegrationPoints = integrationPoints.filter((integrationPoint) =>
        integrationMatchesTargetRefs(integrationPoint, targetRefs)
      );
      const coordinationDriftItems = relevantIntegrationPoints.flatMap((integrationPoint) =>
        (integrationPoint.coordinationItems ?? []).filter(coordinationItemNeedsDriftReview)
      );
      const coordinationDriftRefs = coordinationDriftItems.map(
        (item) => `finding://pmo/coordination/${encodeURIComponent(item.itemId)}`
      );
      const coordinationUnevidencedRefs = coordinationDriftItems
        .filter((item) => item.evidenceRefs.length === 0)
        .map((item) => item.itemId);
      const unevidencedRefs = sortUniqueRefs([
        ...facts.tasks.filter((fact) => fact.evidenceStatus !== "supported").map((fact) => fact.taskRef),
        ...facts.blockers.filter((fact) => fact.evidenceStatus !== "supported").map((fact) => fact.blockerRef),
        ...facts.contracts.filter((fact) => fact.evidenceStatus !== "supported").map((fact) => fact.contractRef),
        ...facts.dependencyEdges.filter((fact) => fact.evidenceStatus !== "supported").map((fact) => fact.dependencyRef),
        ...facts.runbooks.filter((fact) => fact.evidenceStatus !== "supported").map((fact) => fact.runbookRef),
        ...coordinationUnevidencedRefs
      ]);
      const reconcileRefs = sortUniqueRefs([
        ...ledger.reconcileStatuses
          .filter((status) => !["satisfied", "expected", "in_flight"].includes(status.status))
          .map((status) => `finding://pmo/reconcile/${encodeURIComponent(status.receiptRequirementId)}`),
        ...coordinationDriftRefs
      ]);
      const cursorRefs = cursors.map((cursor) => `cursor://${encodeURIComponent(cursor.adapterId)}/${encodeURIComponent(cursor.cursor)}`);
      const remediationRefs = unevidencedRefs.map((ref) => `action://pmo/remediate-drift/${encodeURIComponent(ref)}`);
      const objectModelRefs = sortUniqueRefs([
        ...targetRefs,
        ...relevantIntegrationPoints.map((integrationPoint) => integrationPoint.integrationPointId),
        ...coordinationDriftItems.map((item) => item.itemId),
        ...unevidencedRefs,
        ...reconcileRefs,
        ...cursorRefs,
        ...remediationRefs,
        ...ledger.expectedReceipts.map((receipt) => receipt.receiptRequirementId),
        ...ledger.observedReceipts.map((receipt) => receipt.observedReceiptId)
      ]);
      const deterministicCore = {
        ...baseCore,
        macro: requestedMacro,
        guidance: buildOmniGuidance({
          macroAutomation: buildMacroAutomationGuidance(),
          integrationAlignment: buildIntegrationAlignmentGuidance()
        }),
        objectModelRefs
      };
      const degraded = unevidencedRefs.length > 0 || reconcileRefs.length > 0;
      const stateVersionHash = stateVersionHashFromInput({
        deterministicCore,
        degraded,
        status: degraded ? "degraded" : "ok"
      });
      return pmoMacroResultSchema.parse({
        schemaVersion: "1",
        status: degraded ? "degraded" : "ok",
        toolName: "pmo_macro",
        portfolioId: request.portfolioId,
        ...(request.programId ? { programId: request.programId } : {}),
        ...(request.projectIds ? { projectIds: sortUniqueRefs(request.projectIds) } : {}),
        evidenceRefs: sortUniqueRefs([
          ...evidenceRefs,
          ...facts.tasks.flatMap((fact) => fact.evidenceRefs),
          ...facts.blockers.flatMap((fact) => fact.evidenceRefs),
          ...facts.contracts.flatMap((fact) => fact.evidenceRefs),
          ...facts.dependencyEdges.flatMap((fact) => fact.evidenceRefs),
          ...relevantIntegrationPoints.flatMap((integrationPoint) => integrationPoint.evidenceRefs ?? []),
          ...coordinationDriftItems.flatMap((item) => item.evidenceRefs),
          ...ledger.expectedReceipts.flatMap((receipt) => receipt.requiredEvidenceRefs),
          ...ledger.observedReceipts.flatMap((receipt) => receipt.evidenceRefs)
        ]),
        artifactRefs: [`artifact://pmo/macro/detect-drift/report@${stateVersionHash}`],
        redactionSummary: buildRedactionSummary({
          omittedKinds: ["raw_database_rows", "provider_transcripts", "scratchpads"],
          policyRefs: DEFAULT_REDACTION_POLICY_REFS
        }),
        warnings: degraded
          ? [
              makeWarning(
                "pmo-macro-drift-detected",
                "high",
                "Drift detection found missing, stale, conflicting, or unevidenced PMO state.",
                evidenceRefs
              )
            ]
          : [],
        deterministicCore,
        advisoryPane: {
          content: {
            summary: `Drift check found ${unevidencedRefs.length} unevidenced refs, ${reconcileRefs.length} reconciliation findings, and ${cursors.length} source cursors.`
          },
          excludedFromDeterministicHash: true,
          modelAssisted: false
        },
        stateVersionHash,
        nextRecommendedTool: "pmo_macro",
        traceId: request.traceId,
        correlationId: request.correlationId
      });
    }

    const warningForMissingMacro =
      request.macroId && !requestedMacro
        ? [makeWarning("pmo-macro-not-found", "high", "Requested macro was not found.", evidenceRefs)]
        : [];
    const hasScopedWork = Boolean(request.programId || request.projectIds?.length);
    const helpGuide =
      request.action === "help"
        ? buildPmoMacroHelpGuide(hasScopedWork ? "scoped_work" : "portfolio_bootstrap")
        : undefined;
    const deterministicCore = {
      ...baseCore,
      ...(request.action === "help"
        ? {
            guidance: buildOmniGuidance({
              allowedActions: ["help", "list", "describe", "validate", "invoke", "edit_registry"],
              macroAutomationBoundary:
                "Use pmo_macro only for workflow automation over existing PMO state; use domain omni-tools for lifecycle records.",
              macroAutomation: buildMacroAutomationGuidance(),
              integrationAlignment: buildIntegrationAlignmentGuidance()
            })
          }
        : {}),
      ...(helpGuide
        ? {
            helpGuide,
            objectModelRefs: sortUniqueRefs([
              ...baseCore.objectModelRefs,
              helpGuide.canonicalScope.integrationRef,
              helpGuide.canonicalScope.portfolioId,
              helpGuide.canonicalScope.producerProjectId,
              helpGuide.canonicalScope.programId,
              ...helpGuide.canonicalScope.projectIds
            ])
          }
        : {}),
      ...(requestedMacro ? { macro: requestedMacro } : {}),
      ...(["help", "list"].includes(request.action) ? { registry: currentRegistry } : {})
    };
    const status = warningForMissingMacro.length > 0 ? "blocked" : "ok";
    const needsStateHash = ["validate", "invoke"].includes(request.action);
    return pmoMacroResultSchema.parse({
      schemaVersion: "1",
      status,
      toolName: "pmo_macro",
      portfolioId: request.portfolioId,
      ...(request.programId ? { programId: request.programId } : {}),
      ...(request.projectIds ? { projectIds: sortUniqueRefs(request.projectIds) } : {}),
      evidenceRefs,
      artifactRefs,
      redactionSummary: buildRedactionSummary({
        policyRefs: DEFAULT_REDACTION_POLICY_REFS
      }),
      warnings: warningForMissingMacro,
      deterministicCore,
      ...(needsStateHash ? { stateVersionHash: stateVersionHashFromInput({ deterministicCore, status }) } : {}),
      nextRecommendedTool:
        request.action === "help"
          ? hasScopedWork
            ? "manage_integrations"
            : "manage_projects"
          : "get_program_documentation",
      traceId: request.traceId,
      correlationId: request.correlationId
    });
  }

  async pmoHelp(requestInput: unknown, actor: ProgramToolActor) {
    const request = pmoHelpRequestSchema.parse(requestInput);
    const accessiblePortfolioIds = sortUniqueRefs(actor.portfolioGrants);
    const requestedPortfolioId = request.portfolioId;
    const requestedPortfolioIsUsable =
      Boolean(requestedPortfolioId?.match(/^[a-z][a-z0-9_-]*:\/\/\S+$/)) &&
      accessiblePortfolioIds.includes(requestedPortfolioId as string);
    const resolvedPortfolioId =
      requestedPortfolioIsUsable
        ? (requestedPortfolioId as string)
        : accessiblePortfolioIds[0] ?? AGENTIC_OS_SHARED_FLOW_SCOPE.portfolioId;
    const portfolioCorrected = requestedPortfolioId !== resolvedPortfolioId;
    const scopedProgramId =
      request.programId?.match(/^[a-z][a-z0-9_-]*:\/\/\S+$/) ? request.programId : undefined;
    const scopedProjectIds = sortUniqueRefs(
      (request.projectIds ?? []).filter((projectId) => projectId.match(/^[a-z][a-z0-9_-]*:\/\/\S+$/))
    );
    const hasScopedWork = Boolean(request.programId || request.projectIds?.length);
    const result = await this.pmoMacro(
      {
        ...request,
        portfolioId: resolvedPortfolioId,
        ...(scopedProgramId ? { programId: scopedProgramId } : { programId: undefined }),
        ...(scopedProjectIds.length ? { projectIds: scopedProjectIds } : { projectIds: undefined }),
        action: "help"
      },
      actor
    );

    return pmoHelpResultSchema.parse({
      ...result,
      toolName: "pmo_help",
      warnings: [
        ...result.warnings,
        ...this.#runtimeStorageWarnings(),
        ...(portfolioCorrected
          ? [
              makeWarning(
                "pmo-help-scope-corrected",
                "medium",
                `pmo_help resolved portfolioId to ${resolvedPortfolioId}. Use one of the allowed portfolioIds instead of probing alternate URI shapes.`,
                ["evidence://pmo/help/scope-resolution"]
              )
            ]
          : [])
      ].sort(compareWarnings),
      deterministicCore: result.deterministicCore
        ? {
            ...result.deterministicCore,
            ...(result.deterministicCore.helpGuide
              ? {
                  helpGuide: this.#helpGuideWithRuntimeKnowledge(result.deterministicCore.helpGuide)
                }
              : {}),
            guidance: {
              ...(result.deterministicCore.guidance ?? {}),
              ...buildOmniGuidance(),
              allowedPortfolioIds: accessiblePortfolioIds,
              knowledgeAuthority: agentKnowledgeAuthorityView(this.#runtimeKnowledge),
              runtimeGapHandling: [
                "Use pmo_help as the first runtime authority check; it reports whether this MCP process provides shared PMO knowledge.",
                "If knowledgeAuthority.sharedAcrossMcpInstances is false, or if knowledgeAuthority.gaps is non-empty, stop guessing and surface the runtime gap to the user.",
                "For normal work, read PMO state through manage_projects, manage_integrations, manage_evidence_items, and pmo_macro. Do not mine local repo files as a substitute for PMO memory."
              ],
              integrationRegistrationTool: {
                action: "upsert",
                toolName: "manage_integrations",
                summary:
                  "Register PMO-owned integration refs here before using pmo_macro. Use add_project/remove_project for participation changes; delete is PMO retirement (non-destructive).",
                ...buildIntegrationAlignmentGuidance()
              },
              setupToolOrder: ["manage_projects", "manage_integrations", "pmo_macro"],
              toolCatalog: buildPmoHelpToolCatalog(),
              requestedPortfolioId: requestedPortfolioId ?? null,
              resolvedPortfolioId,
              retryExamples: [
                {
                  purpose: "Bootstrap PMO help with the resolved accessible portfolio.",
                  toolName: "pmo_help",
                  arguments: {
                    portfolioId: resolvedPortfolioId,
                    traceId: request.traceId,
                    correlationId: request.correlationId
                  }
                },
                {
                  purpose: "List PMO programs and projects in the resolved accessible portfolio.",
                  toolName: "manage_projects",
                  arguments: {
                    action: "list",
                    portfolioId: resolvedPortfolioId,
                    traceId: request.traceId,
                    correlationId: `${request.correlationId}/projects`
                  }
                },
                {
                  purpose: "List PMO integrations in the resolved accessible portfolio.",
                  toolName: "manage_integrations",
                  arguments: {
                    action: "list",
                    portfolioId: resolvedPortfolioId,
                    traceId: request.traceId,
                    correlationId: `${request.correlationId}/integrations`
                  }
                },
                {
                  purpose: "Add a project to an existing integration.",
                  toolName: "manage_integrations",
                  arguments: {
                    action: "add_project",
                    portfolioId: resolvedPortfolioId,
                    traceId: request.traceId,
                    correlationId: `${request.correlationId}/integrations/add-project`,
                    integration: {
                      integrationPointId: "integration://<integration-slug>",
                      consumerProjectIds: ["project://<consumer-project-slug>"]
                    }
                  }
                }
              ]
            }
          }
        : result.deterministicCore,
      nextRecommendedTool: hasScopedWork ? "manage_integrations" : "manage_projects"
    });
  }

  async manageProjects(requestInput: unknown, actor: ProgramToolActor) {
    const request = manageProjectsRequestSchema.parse(requestInput);
    const action = request.action;
    const isReadAction = action === "help" || action === "list" || action === "get";

    try {
      assertReadAuthorized(actor, { portfolioId: request.portfolioId }, this.#now());
      if (!isReadAction && !["human_operator", "program_manager_agent"].includes(actor.actorRole)) {
        throw new ProgramToolAuthzError(
          `Actor role ${actor.actorRole} cannot manage PMO programs or projects.`,
          ["policy://authz/actor-role-v1", "policy://authz/server-verified-actor-v1"],
          buildAuthzEvidenceRefs(actor)
        );
      }
    } catch (error) {
      return manageProjectsResultSchema.parse(this.#blockedEnvelope("manage_projects", request, error));
    }

    const recordedAt = this.#now();
    const evidenceRefs = sortUniqueRefs(request.evidenceRefs ?? []);
    const portfolioScope = { portfolioId: request.portfolioId };
    const existingPrograms = normalizePmoReadModels(await this.#repository.listPrograms(portfolioScope)).sort((left, right) =>
      left.programId.localeCompare(right.programId)
    );
    const existingProjects = normalizePmoReadModels(await this.#repository.listProjects(portfolioScope)).sort((left, right) =>
      left.projectId.localeCompare(right.projectId) || left.programId.localeCompare(right.programId)
    );
    const requestedProgramId = request.program?.programId ?? request.programId ?? request.project?.programId;
    const requestedProjectId = request.project?.projectId ?? request.projectIds?.[0];
    const existingProgram = requestedProgramId
      ? existingPrograms.find((program) => program.programId === requestedProgramId)
      : undefined;
    const existingProject = requestedProjectId
      ? existingProjects.find(
          (project) =>
            project.projectId === requestedProjectId &&
            (!requestedProgramId ||
              project.programId === requestedProgramId ||
              (project.activeProgramIds ?? [project.programId]).includes(requestedProgramId))
        ) ?? existingProjects.find((project) => project.projectId === requestedProjectId)
      : undefined;

    const retryExamples = [
      {
        purpose: "Discover existing PMO program and project refs.",
        toolName: "manage_projects",
        arguments: {
          action: "list",
          portfolioId: request.portfolioId,
          traceId: request.traceId,
          correlationId: `${request.correlationId}/list`
        }
      },
      {
        purpose: "Create or update a PMO program/project record.",
        toolName: "manage_projects",
        arguments: {
          action: "upsert",
          portfolioId: request.portfolioId,
          programId: "program://<program-slug>",
          traceId: request.traceId,
          correlationId: `${request.correlationId}/upsert`,
          program: {
            programId: "program://<program-slug>",
            name: "<Program name>"
          },
          project: {
            programId: "program://<program-slug>",
            projectId: "project://<project-slug>",
            name: "<Project name>"
          }
        }
      }
    ];

    const guidance = buildOmniGuidance({
      allowedActions: [...MANAGE_PROJECT_ACTIONS],
      correctForm: {
        toolName: "manage_projects",
        arguments: retryExamples[0].arguments
      },
      fieldGuidance: [
        "Use manage_projects list/get to refresh existing PMO program and project refs.",
        "Use manage_projects create/upsert with program fields under program and project fields under project.",
        "Null optional metadata is treated as unknown/not asserted and ignored. Provide a real pointer or value when the agent intends to update PMO memory.",
        "Use pmo_help when scope, authority, or setup order is unclear."
      ],
      help: buildPmoHelpForm(request),
      lifecycleNotes: [
        "manage_projects owns PMO program/project memory only; tracker and repository systems remain externally owned.",
        "Pointer metadata such as trackerRef, repoRef, and adapterRef is stored for discovery and coordination, not downstream mutation.",
        "Legacy upsert remains a create/update alias for compatibility."
      ],
      retryExamples,
      relevantPrograms: existingPrograms,
      relevantProjects: existingProjects
    });

    const blocked = (warningId: string, summary: string) =>
      manageProjectsResultSchema.parse({
        schemaVersion: "1",
        status: "blocked",
        toolName: "manage_projects",
        portfolioId: request.portfolioId,
        ...(request.programId ? { programId: request.programId } : {}),
        ...(request.projectIds ? { projectIds: request.projectIds } : {}),
        evidenceRefs: ["evidence://program-manager-mcp/manage-projects/guidance"],
        artifactRefs: [],
        redactionSummary: buildRedactionSummary({
          policyRefs: DEFAULT_REDACTION_POLICY_REFS
        }),
        warnings: [
          makeWarning(
            warningId,
            "high",
            summary,
            ["evidence://program-manager-mcp/manage-projects/guidance"]
          )
        ],
        deterministicCore: {
          action,
          guidance,
          managedRefs: [],
          programs: existingPrograms,
          projects: existingProjects
        },
        nextRecommendedTool: "manage_projects",
        traceId: request.traceId,
        correlationId: request.correlationId
      });

    if (["update", "rename", "remove_project", "set_project_role"].includes(action) && requestedProjectId && !existingProject) {
      return blocked(
        "manage-projects-project-not-found",
        `Project ${requestedProjectId} is not registered in portfolio ${request.portfolioId}.`
      );
    }
    if (["update", "rename"].includes(action) && request.program?.programId && !existingProgram) {
      return blocked(
        "manage-projects-program-not-found",
        `Program ${request.program.programId} is not registered in portfolio ${request.portfolioId}.`
      );
    }
    if (action === "retire" && requestedProgramId && !existingProgram && !existingProject) {
      return blocked(
        "manage-projects-target-not-found",
        `No program or project target is registered for ${requestedProgramId}.`
      );
    }

    const labelFromRef = (ref: string) => ref.split("/").filter(Boolean).at(-1) ?? ref;
    const programProgramId = request.program?.programId ?? request.programId;
    const projectProgramId =
      request.project?.programId ?? request.program?.programId ?? request.programId ?? existingProject?.programId;
    let program: ProgramRef | undefined;
    let project: ProjectRef | undefined;

    if (request.program && action !== "list" && action !== "get" && programProgramId) {
      program = {
        ...(existingProgram ?? {
          portfolioId: request.portfolioId,
          programId: programProgramId,
          name: request.program.name ?? labelFromRef(programProgramId)
        }),
        portfolioId: request.portfolioId,
        programId: programProgramId,
        name: request.program.name ?? existingProgram?.name ?? labelFromRef(programProgramId),
        ...(request.program.status ? { status: request.program.status } : {}),
        ...(request.program.trackerRef ? { trackerRef: request.program.trackerRef } : {}),
        ...(request.program.repoRef ? { repoRef: request.program.repoRef } : {}),
        ...(request.program.adapterRef ? { adapterRef: request.program.adapterRef } : {}),
        ...(request.program.goal ? { goal: request.program.goal } : {})
      };
      if (action === "retire") {
        program.status = "retired";
      }
    }

    if (request.project && action !== "list" && action !== "get") {
      if (!projectProgramId) {
        return blocked(
          "manage-projects-program-id-required",
          "A programId is required to create or update project membership."
        );
      }
      const activeProgramIds = sortUniqueRefs(existingProject?.activeProgramIds ?? [existingProject?.programId ?? projectProgramId]);
      const nextActiveProgramIds =
        action === "remove_project"
          ? activeProgramIds.filter((programId) => programId !== projectProgramId)
          : sortUniqueRefs([...activeProgramIds, projectProgramId]);
      project = {
        ...(existingProject ?? {
          portfolioId: request.portfolioId,
          programId: projectProgramId,
          projectId: request.project.projectId,
          name: request.project.name ?? labelFromRef(request.project.projectId)
        }),
        portfolioId: request.portfolioId,
        programId: projectProgramId,
        projectId: request.project.projectId,
        name: request.project.name ?? existingProject?.name ?? labelFromRef(request.project.projectId),
        activeProgramIds: nextActiveProgramIds,
        ...(request.project.status ? { status: request.project.status } : {}),
        ...(request.project.projectRole ? { projectRole: request.project.projectRole } : {}),
        ...(request.project.trackerRef ? { trackerRef: request.project.trackerRef } : {}),
        ...(request.project.repoRef ? { repoRef: request.project.repoRef } : {}),
        ...(request.project.adapterRef ? { adapterRef: request.project.adapterRef } : {}),
        ...(request.project.goal ? { goal: request.project.goal } : {})
      };
      if (action === "retire") {
        project.status = "retired";
      }
    }

    if (action === "retire" && !program && existingProgram && !request.project?.projectId) {
      program = { ...existingProgram, status: "retired" };
    }
    if (action === "retire" && !project && existingProject) {
      project = { ...existingProject, status: "retired" };
    }

    const managedRefs = sortUniqueRefs([
      ...(program ? [program.programId] : []),
      ...(project ? [project.projectId] : [])
    ]);

    if (program || project) {
      const auditEvent: ProgramEvent = {
        eventId: `event://manage-projects/${sanitizedPointerSegment(request.correlationId)}`,
        portfolioId: request.portfolioId,
        eventType: `manage_projects.${action}`,
        recordedAt,
        contextAnchor: {
          portfolioId: request.portfolioId,
          ...(program?.programId ?? project?.programId ? { programId: program?.programId ?? project?.programId } : {}),
          ...(project ? { projectId: project.projectId } : {})
        },
        evidenceRefs,
        artifactRefs: [],
        targetRefs: managedRefs
      };

      if (program) {
        await this.#repository.upsertProgram(program, auditEvent);
      }
      if (project) {
        await this.#repository.upsertProject(project, auditEvent);
      }
    }

    const scope =
      action === "get"
        ? {
            portfolioId: request.portfolioId,
            ...(requestedProgramId ? { programId: requestedProgramId } : {}),
            ...(requestedProjectId ? { projectIds: [requestedProjectId] } : request.projectIds ? { projectIds: request.projectIds } : {})
          }
        : {
            portfolioId: request.portfolioId,
            ...(request.programId ? { programId: request.programId } : {}),
            ...(request.projectIds ? { projectIds: request.projectIds } : {})
          };
    const programs = normalizePmoReadModels(await this.#repository.listPrograms(scope)).sort((left, right) =>
      left.programId.localeCompare(right.programId)
    );
    const projects = normalizePmoReadModels(await this.#repository.listProjects(scope)).sort((left, right) =>
      left.projectId.localeCompare(right.projectId) || left.programId.localeCompare(right.programId)
    );
    const responseManagedRefs = action === "get"
      ? sortUniqueRefs([...programs.map((item) => item.programId), ...projects.map((item) => item.projectId)])
      : managedRefs;

    return manageProjectsResultSchema.parse({
      schemaVersion: "1",
      status: "ok",
      toolName: "manage_projects",
      portfolioId: request.portfolioId,
      ...(request.programId ? { programId: request.programId } : {}),
      ...(request.projectIds ? { projectIds: request.projectIds } : {}),
      evidenceRefs,
      artifactRefs: [],
      redactionSummary: buildRedactionSummary({
        policyRefs: DEFAULT_REDACTION_POLICY_REFS
      }),
      warnings: [],
      deterministicCore: {
        action,
        guidance,
        managedRefs: responseManagedRefs,
        programs,
        projects
      },
      nextRecommendedTool: action === "help" || action === "list" ? "manage_projects" : "pmo_macro",
      traceId: request.traceId,
      correlationId: request.correlationId
    });
  }

  async manageEvidenceItems(requestInput: unknown, actor: ProgramToolActor) {
    const request = manageEvidenceItemsRequestSchema.parse(requestInput);

    try {
      assertReadAuthorized(actor, { portfolioId: request.portfolioId }, this.#now());
      if (!["human_operator", "program_manager_agent"].includes(actor.actorRole)) {
        throw new ProgramToolAuthzError(
          `Actor role ${actor.actorRole} cannot manage PMO evidence or artifacts.`,
          ["policy://authz/actor-role-v1", "policy://authz/server-verified-actor-v1"],
          buildAuthzEvidenceRefs(actor)
        );
      }
    } catch (error) {
      return manageEvidenceItemsResultSchema.parse(this.#blockedEnvelope("manage_evidence_items", request, error));
    }

    const action = request.action as ManageEvidenceAction;
    const recordedAt = this.#now();
    const evidenceRefs = sortUniqueRefs(request.evidenceRefs ?? []);
    const scope = {
      portfolioId: request.portfolioId,
      ...(request.programId ? { programId: request.programId } : {}),
      ...(request.projectIds ? { projectIds: request.projectIds } : {})
    };
    const item = request.evidenceItem as ManagedEvidenceItemInput | undefined;
    const requestedRefs = evidenceRefsFromManagedItem(item);
    const existingEvidence = item?.evidenceRef
      ? (await this.#repository.listEvidenceRefs({ portfolioId: request.portfolioId }, [item.evidenceRef]))[0]
      : undefined;
    const existingArtifact = item?.artifactRef
      ? (await this.#repository.listArtifactRefs({ portfolioId: request.portfolioId }, [item.artifactRef]))[0]
      : undefined;
    const missingTarget =
      ["get", "update", "rename", "retire", "classify", "set_retention"].includes(action) &&
      ((item?.evidenceRef && !existingEvidence) || (item?.artifactRef && !existingArtifact));

    if (missingTarget) {
      const [evidenceRecords, artifactRecords] = await Promise.all([
        this.#repository.listEvidenceRefs(scope),
        this.#repository.listArtifactRefs(scope)
      ]);
      return manageEvidenceItemsResultSchema.parse({
        schemaVersion: "1",
        status: "blocked",
        toolName: "manage_evidence_items",
        portfolioId: request.portfolioId,
        ...(request.programId ? { programId: request.programId } : {}),
        ...(request.projectIds ? { projectIds: request.projectIds } : {}),
        evidenceRefs,
        artifactRefs: [],
        redactionSummary: buildRedactionSummary({
          policyRefs: DEFAULT_REDACTION_POLICY_REFS
        }),
        warnings: [
          makeWarning(
            "manage-evidence-target-not-found",
            "high",
            "Requested evidence or artifact ref was not found. List refs first or register a pointer-only record before updating it.",
            evidenceRefs
          )
        ],
        deterministicCore: {
          action,
          artifactRecords,
          evidenceRecords,
          managedRefs: [],
          guidance: buildOmniGuidance({
            allowedActions: [...MANAGE_EVIDENCE_ACTIONS],
            correctForm: {
              toolName: "manage_evidence_items",
              arguments: {
                action: "register",
                portfolioId: request.portfolioId,
                ...(request.programId ? { programId: request.programId } : {}),
                traceId: request.traceId,
                correlationId: `${request.correlationId}/register`,
                evidenceItem: {
                  evidenceRef: item?.evidenceRef ?? "evidence://<source>/<pointer>",
                  kind: "operator_attestation",
                  artifactRef: item?.artifactRef ?? "artifact://<source>/<pointer>",
                  artifactType: "pmo_artifact",
                  storageUri: item?.artifactRef ?? "artifact://<source>/<pointer>",
                  contentHash: {
                    algorithm: "sha256",
                    value: "0000000000000000000000000000000000000000000000000000000000000000"
                  }
                }
              }
            },
            fieldGuidance: [
              "Use manage_evidence_items list/get to discover existing pointer refs.",
              "Use manage_evidence_items register to create missing pointer-only evidence or artifact records.",
              "Evidence bodies, logs, screenshots, transcripts, product rows, credentials, and secrets are not accepted."
            ],
            help: buildPmoHelpForm(request),
            knownArtifactRefs: artifactRecords.map((artifact) => artifact.artifactRef),
            knownEvidenceRefs: evidenceRecords.map((evidence) => evidence.evidenceRef),
            retryExamples: [
              {
                purpose: "List evidence and artifact refs.",
                toolName: "manage_evidence_items",
                arguments: {
                  action: "list",
                  portfolioId: request.portfolioId,
                  traceId: request.traceId,
                  correlationId: `${request.correlationId}/list`
                }
              },
              {
                purpose: "Register a pointer-only evidence or artifact ref.",
                toolName: "manage_evidence_items",
                arguments: {
                  action: "register",
                  portfolioId: request.portfolioId,
                  traceId: request.traceId,
                  correlationId: `${request.correlationId}/register`,
                  evidenceItem: {
                    evidenceRef: item?.evidenceRef ?? "evidence://<source>/<pointer>",
                    kind: "operator_attestation",
                    artifactRef: item?.artifactRef ?? "artifact://<source>/<pointer>"
                  }
                }
              }
            ]
          })
        },
        nextRecommendedTool: "manage_evidence_items",
        traceId: request.traceId,
        correlationId: request.correlationId
      });
    }

    const shouldWrite = item && !["help", "list", "get"].includes(action);
    const artifactRecord = shouldWrite
      ? buildArtifactRecord({
          item: {
            ...item,
            redactionStatus: action === "retire" ? "blocked" : item.redactionStatus,
            artifactType: item.artifactType ?? (action === "add_artifact" ? "pmo_artifact" : undefined)
          },
          now: recordedAt,
          portfolioId: request.portfolioId,
          existing: existingArtifact
        })
      : undefined;
    const evidenceRecord = shouldWrite
      ? buildEvidenceRecord({
          item: {
            ...item,
            redactionStatus: action === "retire" ? "blocked" : item.redactionStatus
          },
          now: recordedAt,
          portfolioId: request.portfolioId,
          existing: existingEvidence
        })
      : undefined;

    if (artifactRecord) {
      await this.#repository.upsertArtifactRef(artifactRecord, {
        eventId: `event://manage-evidence-items/${sanitizedPointerSegment(request.correlationId)}/artifact`,
        portfolioId: request.portfolioId,
        eventType: `manage_evidence_items.${action}`,
        recordedAt,
        contextAnchor: {
          portfolioId: request.portfolioId,
          ...(request.programId ? { programId: request.programId } : {})
        },
        evidenceRefs,
        artifactRefs: [artifactRecord.artifactRef],
        schemaVersion: "1",
        eventKind: "pmo_omni_tool_write",
        toolName: "manage_evidence_items",
        action,
        traceId: request.traceId,
        correlationId: request.correlationId,
        idempotencyKey: stateVersionHashFromInput({ action, artifactRef: artifactRecord.artifactRef, item }),
        targetRefs: [artifactRecord.artifactRef],
        managedRefs: [artifactRecord.artifactRef],
        writeStatus: "accepted",
        payloadDigest: stateVersionHashFromInput(sanitizePointerPayload(artifactRecord))
      });
    }
    if (evidenceRecord) {
      await this.#repository.upsertEvidenceRef(evidenceRecord, {
        eventId: `event://manage-evidence-items/${sanitizedPointerSegment(request.correlationId)}/evidence`,
        portfolioId: request.portfolioId,
        eventType: `manage_evidence_items.${action}`,
        recordedAt,
        contextAnchor: {
          portfolioId: request.portfolioId,
          ...(request.programId ? { programId: request.programId } : {})
        },
        evidenceRefs: sortUniqueRefs([...evidenceRefs, evidenceRecord.evidenceRef]),
        artifactRefs: evidenceRecord.artifactRef ? [evidenceRecord.artifactRef] : [],
        schemaVersion: "1",
        eventKind: "pmo_omni_tool_write",
        toolName: "manage_evidence_items",
        action,
        traceId: request.traceId,
        correlationId: request.correlationId,
        idempotencyKey: stateVersionHashFromInput({ action, evidenceRef: evidenceRecord.evidenceRef, item }),
        targetRefs: [evidenceRecord.evidenceRef],
        managedRefs: [evidenceRecord.evidenceRef],
        writeStatus: "accepted",
        payloadDigest: stateVersionHashFromInput(sanitizePointerPayload(evidenceRecord))
      });
    }

    const refsToFetch = requestedRefs.length ? requestedRefs : undefined;
    const [evidenceRecords, artifactRecords] = await Promise.all([
      this.#repository.listEvidenceRefs(scope, refsToFetch),
      this.#repository.listArtifactRefs(scope, refsToFetch)
    ]);
    const managedRefs = sortUniqueRefs([
      ...(artifactRecord ? [artifactRecord.artifactRef] : []),
      ...(evidenceRecord ? [evidenceRecord.evidenceRef] : [])
    ]);

    return manageEvidenceItemsResultSchema.parse({
      schemaVersion: "1",
      status: "ok",
      toolName: "manage_evidence_items",
      portfolioId: request.portfolioId,
      ...(request.programId ? { programId: request.programId } : {}),
      ...(request.projectIds ? { projectIds: request.projectIds } : {}),
      evidenceRefs,
      artifactRefs: sortUniqueRefs([
        ...(artifactRecord ? [artifactRecord.artifactRef] : []),
        ...evidenceRecords.flatMap((evidence) => (evidence.artifactRef ? [evidence.artifactRef] : []))
      ]),
      redactionSummary: buildRedactionSummary({
        policyRefs: DEFAULT_REDACTION_POLICY_REFS
      }),
      warnings: [],
      deterministicCore: {
        action,
        artifactRecords,
        evidenceRecords,
        guidance: buildOmniGuidance({
          allowedActions: [...MANAGE_EVIDENCE_ACTIONS],
          pointerOnlyPolicy:
            "manage_evidence_items stores refs, storage URIs, hashes, classifications, retention pointers, and attachment refs only; raw logs, transcripts, screenshots, product rows, and secrets are rejected by strict input schema.",
          lifecycleNotes: [
            "register and add_artifact create durable pointer records.",
            "classify and set_retention update metadata without copying content.",
            "attach_to_integration, attach_to_decision, and attach_to_learning add attachment refs for downstream PMO records."
          ]
        }),
        managedRefs
      },
      nextRecommendedTool: action === "help" || action === "list" ? "pmo_help" : "pmo_macro",
      traceId: request.traceId,
      correlationId: request.correlationId
    });
  }

  async manageIntegrations(requestInput: unknown, actor: ProgramToolActor) {
    const request = manageIntegrationsRequestSchema.parse(requestInput);

    try {
      assertReadAuthorized(actor, { portfolioId: request.portfolioId }, this.#now());
      if (!["human_operator", "program_manager_agent"].includes(actor.actorRole)) {
        throw new ProgramToolAuthzError(
          `Actor role ${actor.actorRole} cannot manage PMO integrations.`,
          ["policy://authz/actor-role-v1", "policy://authz/server-verified-actor-v1"],
          buildAuthzEvidenceRefs(actor)
        );
      }
    } catch (error) {
      return manageIntegrationsResultSchema.parse(this.#blockedEnvelope("manage_integrations", request, error));
    }

    const recordedAt = this.#now();
    const action = request.action as ManageIntegrationAction;
    const evidenceRefs = sortUniqueRefs(request.evidenceRefs ?? []);
    const scope = {
      portfolioId: request.portfolioId,
      ...(request.programId ? { programId: request.programId } : {}),
      ...(request.projectIds ? { projectIds: request.projectIds } : {})
    };
    const currentIntegrationPoints = normalizePmoReadModels(
      await this.#repository.listIntegrationPoints({
        portfolioId: request.portfolioId
      })
    );
    const scopedIntegrationPoints = normalizePmoReadModels(
      await this.#repository.listIntegrationPoints(scope)
    ).sort((left, right) => left.integrationPointId.localeCompare(right.integrationPointId));
    const existingIntegration = request.integration
      ? currentIntegrationPoints.find(
          (item) => item.integrationPointId === request.integration?.integrationPointId
        )
      : undefined;
    const readOnlyAction = ["help", "list", "get", "inbox", "catch_up"].includes(action);
    const createAction = action === "create" || action === "upsert";
    const allowedActionsForCurrentState = allowedIntegrationActionsForState(existingIntegration?.status);

    if (!readOnlyAction && !createAction && !existingIntegration) {
      return manageIntegrationsResultSchema.parse({
        schemaVersion: "1",
        status: "blocked",
        toolName: "manage_integrations",
        portfolioId: request.portfolioId,
        ...(request.programId ? { programId: request.programId } : {}),
        ...(request.projectIds ? { projectIds: request.projectIds } : {}),
        evidenceRefs,
        artifactRefs: [],
        redactionSummary: buildRedactionSummary({
          policyRefs: DEFAULT_REDACTION_POLICY_REFS
        }),
        warnings: [
          makeWarning(
            "manage-integrations-target-not-found",
            "high",
            "Requested integration was not found. List integrations first, then create it or retry against an existing integrationPointId.",
            evidenceRefs
          )
        ],
        deterministicCore: {
          action,
          integrationPoints: scopedIntegrationPoints,
          managedRefs: [],
          guidance: buildOmniGuidance({
            allowedActions: allowedIntegrationActionsForState(undefined),
            correctForm: {
              toolName: "manage_integrations",
              arguments: {
                action: "create",
                portfolioId: request.portfolioId,
                ...(request.programId ? { programId: request.programId } : {}),
                traceId: request.traceId,
                correlationId: `${request.correlationId}/create`,
                integration: {
                  integrationPointId: request.integration?.integrationPointId ?? "integration://<integration-slug>",
                  producerProjectId: "project://<producer-project-slug>",
                  consumerProjectIds: ["project://<consumer-project-slug>"],
                  purpose: "<Integration purpose>"
                },
                evidenceRefs: ["evidence://<source>/<pointer>"]
              }
            },
            fieldGuidance: [
              "Use manage_integrations list/get to discover existing integration refs.",
              "Create the integration before using membership or coordination actions against it.",
              "Put lifecycle fields under integration and evidence pointers in top-level evidenceRefs."
            ],
            help: buildPmoHelpForm(request),
            knownIntegrationRefs: scopedIntegrationPoints.map((item) => item.integrationPointId),
            lifecycleNotes: [
              "add_project lets additional projects join an existing integration.",
              "coordination actions record pointer-only integration state.",
              "delete is a PMO retirement represented as a non-destructive state transition."
            ],
            integrationAlignment: buildIntegrationAlignmentGuidance(),
            retryExamples: [
              {
                purpose: "List existing integration refs.",
                toolName: "manage_integrations",
                arguments: {
                  action: "list",
                  portfolioId: request.portfolioId,
                  ...(request.programId ? { programId: request.programId } : {}),
                  traceId: request.traceId,
                  correlationId: `${request.correlationId}/list`
                }
              },
              {
                purpose: "Create the integration before coordinating on it.",
                toolName: "manage_integrations",
                arguments: {
                  action: "create",
                  portfolioId: request.portfolioId,
                  ...(request.programId ? { programId: request.programId } : {}),
                  traceId: request.traceId,
                  correlationId: `${request.correlationId}/create`,
                  integration: {
                    integrationPointId: request.integration?.integrationPointId ?? "integration://<integration-slug>",
                    producerProjectId: "project://<producer-project-slug>",
                    consumerProjectIds: ["project://<consumer-project-slug>"],
                    purpose: "<Integration purpose>"
                  },
                  evidenceRefs: ["evidence://<source>/<pointer>"]
                }
              }
            ]
          })
        },
        nextRecommendedTool: "manage_integrations",
        traceId: request.traceId,
        correlationId: request.correlationId
      });
    }

    if (existingIntegration && !allowedActionsForCurrentState.includes(action)) {
      return manageIntegrationsResultSchema.parse({
        schemaVersion: "1",
        status: "blocked",
        toolName: "manage_integrations",
        portfolioId: request.portfolioId,
        ...(request.programId ? { programId: request.programId } : {}),
        ...(request.projectIds ? { projectIds: request.projectIds } : {}),
        evidenceRefs,
        artifactRefs: [],
        redactionSummary: buildRedactionSummary({
          policyRefs: DEFAULT_REDACTION_POLICY_REFS
        }),
        warnings: [
          makeWarning(
            "manage-integrations-invalid-state-transition",
            "high",
            "Requested integration lifecycle transition is not allowed from the current state. Use deterministicCore.guidance before retrying.",
            evidenceRefs
          )
        ],
        deterministicCore: {
          action,
          integrationPoints: scopedIntegrationPoints,
          managedRefs: [],
          guidance: buildOmniGuidance({
            currentState: existingIntegration.status ?? "active",
            allowedNextActions: allowedActionsForCurrentState,
            correctForm: {
              toolName: "manage_integrations",
              arguments: {
                action: "get",
                portfolioId: request.portfolioId,
                ...(request.programId ? { programId: request.programId } : {}),
                traceId: request.traceId,
                correlationId: `${request.correlationId}/refresh`,
                integration: { integrationPointId: existingIntegration.integrationPointId }
              }
            },
            fieldGuidance: [
              "Refresh the integration record before retrying a blocked state transition.",
              "Choose one of deterministicCore.guidance.allowedNextActions for the current state.",
              "Do not infer closure or reactivation when the state machine disallows it."
            ],
            help: buildPmoHelpForm(request),
            repairGuidance:
              "Refresh the integration record, choose an allowed next action for the current state, and preserve evidenceRefs/artifactRefs as sorted pointer refs.",
            retryExamples: [
              {
                purpose: "Refresh the current integration state.",
                toolName: "manage_integrations",
                arguments: {
                  action: "get",
                  portfolioId: request.portfolioId,
                  ...(request.programId ? { programId: request.programId } : {}),
                  traceId: request.traceId,
                  correlationId: `${request.correlationId}/refresh`,
                  integration: { integrationPointId: existingIntegration.integrationPointId }
                }
              }
            ]
          })
        },
        nextRecommendedTool: "manage_integrations",
        traceId: request.traceId,
        correlationId: request.correlationId
      });
    }

    const integrationInput = request.integration as (ManagedIntegrationInput & {
      consumerProjectIds?: string[];
      expectedStateVersionHash?: string;
      producerProjectId?: string;
      purpose?: string;
      status?: "active" | "retired";
    }) | undefined;
    const idempotencyKey =
      integrationInput && !readOnlyAction
        ? integrationInput.idempotencyKey ??
          stateVersionHashFromInput({
            action,
            correlationId: request.correlationId,
            integration: sanitizePointerPayload(integrationInput),
            traceId: request.traceId
          })
        : undefined;
    if (
      idempotencyKey &&
      existingIntegration?.idempotencyKeys?.includes(idempotencyKey)
    ) {
      return manageIntegrationsResultSchema.parse({
        schemaVersion: "1",
        status: "ok",
        toolName: "manage_integrations",
        portfolioId: request.portfolioId,
        ...(request.programId ? { programId: request.programId } : {}),
        ...(request.projectIds ? { projectIds: request.projectIds } : {}),
        evidenceRefs,
        artifactRefs: sortUniqueRefs(existingIntegration.artifactRefs ?? []),
        redactionSummary: buildRedactionSummary({
          policyRefs: DEFAULT_REDACTION_POLICY_REFS
        }),
        warnings: [
          makeWarning(
            "manage-integrations-duplicate-idempotency-key",
            "low",
            "Duplicate manage_integrations idempotency key observed; returning the existing integration state without duplicating coordination records.",
            evidenceRefs
          )
        ],
        deterministicCore: {
          action,
          coordinationItems: existingIntegration.coordinationItems ?? [],
          inboxItems: inboxItemsForProjects(
            existingIntegration.coordinationItems ?? [],
            sortUniqueRefs([
              ...(request.projectIds ?? []),
              ...(integrationInput?.projectId ? [integrationInput.projectId] : [])
            ])
          ),
          integrationPoints: [existingIntegration],
          guidance: buildOmniGuidance({
            allowedActions: allowedIntegrationActionsForState(existingIntegration.status),
            duplicateIdempotencyKey: idempotencyKey
          }),
          managedRefs: [existingIntegration.integrationPointId]
        },
        nextRecommendedTool: "pmo_macro",
        traceId: request.traceId,
        correlationId: request.correlationId
      });
    }

    if (
      existingIntegration &&
      integrationInput?.expectedStateVersionHash &&
      integrationInput.expectedStateVersionHash !== stateVersionHashFromInput(existingIntegration)
    ) {
      return manageIntegrationsResultSchema.parse({
        schemaVersion: "1",
        status: "blocked",
        toolName: "manage_integrations",
        portfolioId: request.portfolioId,
        ...(request.programId ? { programId: request.programId } : {}),
        ...(request.projectIds ? { projectIds: request.projectIds } : {}),
        evidenceRefs,
        artifactRefs: sortUniqueRefs(existingIntegration.artifactRefs ?? []),
        redactionSummary: buildRedactionSummary({
          policyRefs: DEFAULT_REDACTION_POLICY_REFS
        }),
        warnings: [
          makeWarning(
            "manage-integrations-stale-state-version",
            "high",
            "Caller supplied a stale integration state hash. Refresh the integration and retry with the current state hash.",
            evidenceRefs
          )
        ],
        deterministicCore: {
          action,
          coordinationItems: existingIntegration.coordinationItems ?? [],
          integrationPoints: [existingIntegration],
          managedRefs: [],
          guidance: buildOmniGuidance({
            currentStateVersionHash: stateVersionHashFromInput(existingIntegration),
            correctForm: {
              toolName: "manage_integrations",
              arguments: {
                action: "get",
                portfolioId: request.portfolioId,
                ...(request.programId ? { programId: request.programId } : {}),
                traceId: request.traceId,
                correlationId: `${request.correlationId}/refresh`,
                integration: { integrationPointId: existingIntegration.integrationPointId }
              }
            },
            fieldGuidance: [
              "Refresh the integration record with manage_integrations get.",
              "Copy deterministicCore.guidance.currentStateVersionHash into integration.expectedStateVersionHash before retrying the write.",
              "Keep the original evidenceRefs and pointer-only payload shape when retrying."
            ],
            help: buildPmoHelpForm(request),
            retryExamples: [
              {
                purpose: "Refresh the integration before retrying the stale write.",
                toolName: "manage_integrations",
                arguments: {
                  action: "get",
                  portfolioId: request.portfolioId,
                  ...(request.programId ? { programId: request.programId } : {}),
                  traceId: request.traceId,
                  correlationId: `${request.correlationId}/refresh`,
                  integration: { integrationPointId: existingIntegration.integrationPointId }
                }
              }
            ]
          })
        },
        nextRecommendedTool: "manage_integrations",
        traceId: request.traceId,
        correlationId: request.correlationId
      });
    }

    const nextCoordinationItem = integrationInput
      ? buildCoordinationItem({
          action,
          correlationId: request.correlationId,
          evidenceRefs,
          integration: integrationInput,
          recordedAt
        })
      : undefined;
    const existingCoordinationItem = nextCoordinationItem
      ? existingIntegration?.coordinationItems?.find((item) => item.itemId === nextCoordinationItem.itemId)
      : undefined;
    if (
      ["mark_blocker_unblocked", "mark_blocker_resolved", "reopen_blocker"].includes(action) &&
      !actorMayResolveBlocker(actor, existingCoordinationItem ?? nextCoordinationItem)
    ) {
      return manageIntegrationsResultSchema.parse({
        schemaVersion: "1",
        status: "blocked",
        toolName: "manage_integrations",
        portfolioId: request.portfolioId,
        ...(request.programId ? { programId: request.programId } : {}),
        ...(request.projectIds ? { projectIds: request.projectIds } : {}),
        evidenceRefs,
        artifactRefs: sortUniqueRefs(existingIntegration?.artifactRefs ?? []),
        redactionSummary: buildRedactionSummary({
          policyRefs: DEFAULT_REDACTION_POLICY_REFS
        }),
        warnings: [
          makeWarning(
            "manage-integrations-blocker-authority-denied",
            "high",
            "Only the reporting project or blocked project may mark a blocker unblocked, resolved, or reopened.",
            evidenceRefs
          )
        ],
        deterministicCore: {
          action,
          coordinationItems: existingIntegration?.coordinationItems ?? [],
          integrationPoints: existingIntegration ? [existingIntegration] : [],
          managedRefs: [],
          guidance: buildOmniGuidance({
            correctForm: {
              toolName: "manage_integrations",
              arguments: {
                action,
                portfolioId: request.portfolioId,
                ...(request.programId ? { programId: request.programId } : {}),
                traceId: request.traceId,
                correlationId: request.correlationId,
                integration: {
                  integrationPointId:
                    existingIntegration?.integrationPointId ??
                    integrationInput?.integrationPointId ??
                    "integration://<integration-slug>",
                  item: {
                    itemType: "blocker",
                    ...(existingCoordinationItem?.itemId ?? nextCoordinationItem?.itemId
                      ? { itemId: existingCoordinationItem?.itemId ?? nextCoordinationItem?.itemId }
                      : {}),
                    ...(existingCoordinationItem?.reporterProjectId ?? nextCoordinationItem?.reporterProjectId
                      ? {
                          reporterProjectId:
                            existingCoordinationItem?.reporterProjectId ?? nextCoordinationItem?.reporterProjectId
                        }
                      : {}),
                    ...(existingCoordinationItem?.blockedProjectId ?? nextCoordinationItem?.blockedProjectId
                      ? {
                          blockedProjectId:
                            existingCoordinationItem?.blockedProjectId ?? nextCoordinationItem?.blockedProjectId
                        }
                      : {}),
                    summary: "<Blocker transition summary>"
                  }
                },
                ...(evidenceRefs.length ? { evidenceRefs } : {})
              }
            },
            fieldGuidance: [
              "Retry the blocker transition as an actor for one of eligibleProjectIds.",
              "Use integration.item.itemType: \"blocker\" and preserve the existing itemId when updating an existing blocker.",
              "If the actor is not eligible, ask the reporting or blocked project to submit the transition instead."
            ],
            eligibleProjectIds: sortUniqueRefs(
              [
                existingCoordinationItem?.reporterProjectId,
                existingCoordinationItem?.blockedProjectId,
                nextCoordinationItem?.reporterProjectId,
                nextCoordinationItem?.blockedProjectId
              ].filter((value): value is string => Boolean(value))
            ),
            safeNextActions: [
              "Ask the reporting project to submit the blocker transition.",
              "Ask the blocked project to submit the blocker transition.",
              "Record owner evidence with update_blocker instead of inferring closure."
            ],
            help: buildPmoHelpForm(request)
          })
        },
        nextRecommendedTool: "manage_integrations",
        traceId: request.traceId,
        correlationId: request.correlationId
      });
    }

    const requestedConsumers = sortUniqueRefs(request.integration?.consumerProjectIds ?? []);
    const shouldPersist = Boolean(integrationInput && !readOnlyAction);
    const artifactRefsForWrite = sortUniqueRefs([
      ...(existingIntegration?.artifactRefs ?? []),
      ...(integrationInput?.artifactRef ? [integrationInput.artifactRef] : []),
      ...(nextCoordinationItem?.artifactRefs ?? [])
    ]);
    const integration: IntegrationPointRecord | undefined = shouldPersist && integrationInput
      ? {
          portfolioId: request.portfolioId,
          integrationPointId: integrationInput.integrationPointId,
          producerProjectId:
            integrationInput.producerProjectId ??
            existingIntegration?.producerProjectId ??
            "project://unknown-producer",
          consumerProjectIds:
            action === "add_project"
              ? sortUniqueRefs([...(existingIntegration?.consumerProjectIds ?? []), ...requestedConsumers])
              : action === "remove_project"
                ? sortUniqueRefs(
                    (existingIntegration?.consumerProjectIds ?? []).filter(
                      (projectId) => !requestedConsumers.includes(projectId)
                    )
                  )
                : requestedConsumers.length > 0
                  ? requestedConsumers
                  : sortUniqueRefs(existingIntegration?.consumerProjectIds ?? []),
          artifactRefs: artifactRefsForWrite,
          coordinationItems: mergeCoordinationItems(existingIntegration?.coordinationItems, nextCoordinationItem),
          ...(integrationInput.purpose ?? existingIntegration?.purpose
            ? { purpose: integrationInput.purpose ?? existingIntegration?.purpose }
            : {}),
          recordedAt,
          evidenceRefs: sortUniqueRefs([...(existingIntegration?.evidenceRefs ?? []), ...evidenceRefs]),
          idempotencyKeys: sortUniqueRefs([
            ...(existingIntegration?.idempotencyKeys ?? []),
            ...(idempotencyKey ? [idempotencyKey] : [])
          ]),
          projectRoles: {
            ...(existingIntegration?.projectRoles ?? {}),
            ...(integrationInput.projectId && integrationInput.projectRole
              ? { [integrationInput.projectId]: integrationInput.projectRole }
              : {})
          },
          status:
            action === "retire" || action === "delete"
              ? ("retired" as const)
              : integrationInput.status ?? existingIntegration?.status ?? ("active" as const),
          statusHistory: [
            ...(existingIntegration?.statusHistory ?? []),
            ...(["retire", "delete", "create", "upsert", "update", "rename"].includes(action)
              ? [
                  {
                    status:
                      action === "retire" || action === "delete"
                        ? ("retired" as const)
                        : integrationInput.status ?? existingIntegration?.status ?? ("active" as const),
                    action,
                    recordedAt,
                    evidenceRefs
                  }
                ]
              : [])
          ]
        }
      : undefined;

    if (integration) {
      await this.#repository.upsertIntegrationPoint(integration, {
        eventId: `event://manage-integrations/${sanitizedPointerSegment(request.correlationId)}`,
        portfolioId: request.portfolioId,
        eventType: `manage_integrations.${action === "delete" ? "retire" : action}`,
        recordedAt,
        contextAnchor: {
          portfolioId: request.portfolioId,
          ...(request.programId ? { programId: request.programId } : {})
        },
        evidenceRefs,
        artifactRefs: artifactRefsForWrite,
        schemaVersion: "1",
        eventKind: "pmo_omni_tool_write",
        toolName: "manage_integrations",
        action,
        traceId: request.traceId,
        correlationId: request.correlationId,
        ...(idempotencyKey ? { idempotencyKey } : {}),
        targetRefs: [integration.integrationPointId],
        managedRefs: [integration.integrationPointId],
        writeStatus: "accepted",
        payloadDigest: stateVersionHashFromInput({ action, integration: sanitizePointerPayload(integration) })
      });
    }

    const refreshedIntegrationPoints = integration
      ? normalizePmoReadModels(await this.#repository.listIntegrationPoints(scope)).sort((left, right) =>
          left.integrationPointId.localeCompare(right.integrationPointId)
        )
      : scopedIntegrationPoints;
    const visibleIntegrationPoints =
      request.action === "get" && existingIntegration
        ? [existingIntegration]
        : integration
          ? refreshedIntegrationPoints
          : scopedIntegrationPoints;
    const visibleCoordinationItems = visibleIntegrationPoints.flatMap(
      (integrationPoint) => integrationPoint.coordinationItems ?? []
    );
    const inboxProjectIds = sortUniqueRefs([
      ...(request.projectIds ?? []),
      ...(integrationInput?.projectId ? [integrationInput.projectId] : []),
      ...(integrationInput?.consumerProjectIds ?? []),
      ...(existingIntegration
        ? [existingIntegration.producerProjectId, ...existingIntegration.consumerProjectIds]
        : [])
    ]);

    return manageIntegrationsResultSchema.parse({
      schemaVersion: "1",
      status: "ok",
      toolName: "manage_integrations",
      portfolioId: request.portfolioId,
      ...(request.programId ? { programId: request.programId } : {}),
      ...(request.projectIds ? { projectIds: request.projectIds } : {}),
      evidenceRefs,
      artifactRefs: sortUniqueRefs([
        ...(integration?.artifactRefs ?? []),
        ...(existingIntegration?.artifactRefs ?? []),
        ...(integrationInput?.artifactRef ? [integrationInput.artifactRef] : [])
      ]),
      redactionSummary: buildRedactionSummary({
        policyRefs: DEFAULT_REDACTION_POLICY_REFS
      }),
      warnings: [],
      deterministicCore: {
        action,
        coordinationItems: visibleCoordinationItems,
        inboxItems: inboxItemsForProjects(visibleCoordinationItems, inboxProjectIds),
        integrationPoints: visibleIntegrationPoints,
        guidance: buildOmniGuidance({
          allowedActions: allowedIntegrationActionsForState(integration?.status ?? existingIntegration?.status),
          lifecycleNotes: [
            "manage_integrations is the canonical public integration omni-tool.",
            "Coordination records are pointer-only and sorted for deterministic replay.",
            "delete is represented as non-destructive retirement.",
            "Repeated writes with the same idempotencyKey return the existing managed refs without duplicating records."
          ],
          integrationAlignment: buildIntegrationAlignmentGuidance()
        }),
        managedRefs: sortUniqueRefs(integration ? [integration.integrationPointId] : [])
      },
      nextRecommendedTool: action === "list" || action === "help" ? "pmo_help" : "pmo_macro",
      traceId: request.traceId,
      correlationId: request.correlationId
    });
  }

  async listProgramCapabilities(requestInput: unknown, actor: ProgramToolActor) {
    const request = listProgramCapabilitiesRequestSchema.parse(requestInput);

    try {
      assertReadAuthorized(actor, request, this.#now());
      await this.#adapterRegistry.assertNoMutationAuthority();
    } catch (error) {
      return listProgramCapabilitiesResultSchema.parse(
        this.#blockedEnvelope("list_program_capabilities", request, error)
      );
    }

    const manifests = this.#adapterRegistry.listManifests();
    const scope = {
      portfolioId: request.portfolioId,
      programId: request.programId,
      projectIds: inferScopedProjectIds(request)
    };
    const [capabilities, healths, cursors] = await Promise.all([
      this.#adapterRegistry.listCapabilities(request.capabilityDomain),
      Promise.all(
        manifests.map((manifest) =>
          this.#adapterRegistry.getHealth(manifest.adapterId, scope, this.#now())
        )
      ),
      Promise.all(
        manifests.map((manifest) =>
          this.#adapterRegistry.getSourceCursor(manifest.adapterId, scope)
        )
      )
    ]);

    const warnings = healths
      .map((health) => summarizeHealthStatus(health))
      .filter((warning): warning is ToolWarning => Boolean(warning));
    const redactionSummary = buildRedactionSummary({
      policyRefs: sortUnique(
        manifests.flatMap((manifest) => manifest.redactionPolicyRefs ?? DEFAULT_REDACTION_POLICY_REFS)
      )
    });

    const deterministicCore =
      capabilities.length > 0
        ? {
            capabilities: capabilities
              .map((capability) => ({
                ...capability,
                adapterIds: [...capability.adapterIds].sort((left, right) => left.localeCompare(right)),
                domains: [...capability.domains].sort((left, right) => left.localeCompare(right)),
                toolNames: [...capability.toolNames].sort((left, right) => left.localeCompare(right))
              }))
              .sort(compareCapabilities)
          }
        : undefined;
    const evidenceRefs = sortUnique([
      ...manifests.map(
        (manifest) => `evidence://adapter-manifest/${manifest.adapterId}@${manifest.adapterVersion}`
      ),
      ...healths.map((health) => `evidence://adapter-health/${health.adapterId}/${health.status}`)
    ]);
    const artifactRefs = sortUnique(
      cursors.map((cursor) => pointerFromCursor(cursor.adapterId, cursor.cursor))
    );
    const status = deterministicCore
      ? statusFromValues([
          warnings.length > 0 ? "warning" : "ok",
          ...healths.map((health) =>
            health.status === "healthy"
              ? "ok"
              : health.status === "degraded"
                ? "degraded"
                : "warning"
          )
        ])
      : "warning";
    const envelope = {
      schemaVersion: "1" as const,
      status,
      toolName: "list_program_capabilities" as const,
      portfolioId: request.portfolioId,
      ...(request.programId ? { programId: request.programId } : {}),
      ...(request.projectIds ? { projectIds: request.projectIds } : {}),
      ...(deterministicCore ? { deterministicCore } : {}),
      evidenceRefs,
      artifactRefs,
      redactionSummary,
      warnings: [
        ...warnings,
        ...(deterministicCore
          ? []
          : [makeWarning("no-capabilities", "medium", "No capabilities matched the requested domain.")]
        )
      ].sort(compareWarnings),
      nextRecommendedTool: TOOL_NEXT_RECOMMENDATION.list_program_capabilities,
      traceId: request.traceId,
      correlationId: request.correlationId,
      ...(deterministicCore
        ? {
            stateVersionHash: stateVersionHashFromInput({
              request: {
                capabilityDomain: request.capabilityDomain,
                includeAdapters: request.includeAdapters ?? false,
                portfolioId: request.portfolioId,
                programId: request.programId,
                projectIds: request.projectIds
              },
              deterministicCore,
              evidenceRefs,
              artifactRefs
            })
          }
        : {})
    };

    return listProgramCapabilitiesResultSchema.parse(envelope);
  }

  async getProgramDocumentation(requestInput: unknown, actor: ProgramToolActor) {
    const request = getProgramDocumentationRequestSchema.parse(requestInput);

    try {
      assertReadAuthorized(actor, request, this.#now());
      await this.#adapterRegistry.assertNoMutationAuthority();
    } catch (error) {
      return getProgramDocumentationResultSchema.parse(
        this.#blockedEnvelope("get_program_documentation", request, error)
      );
    }

    const sections = (this.#documentationCatalog[request.topic] ?? []).map((section) => ({
      ...section,
      artifactRefs: [...section.artifactRefs].sort((left, right) => left.localeCompare(right)),
      evidenceRefs: [...section.evidenceRefs].sort((left, right) => left.localeCompare(right)),
      schemaRefs: [...section.schemaRefs].sort((left, right) => left.localeCompare(right))
    }));
    const redactionSummary = buildRedactionSummary({
      redacted: true,
      omittedKinds: ["content_body"],
      policyRefs: DEFAULT_REDACTION_POLICY_REFS
    });
    const deterministicCore = {
      topic: request.topic,
      sections
    };
    const artifactRefs = sortUnique(sections.flatMap((section) => section.artifactRefs));
    const evidenceRefs = sortUnique(sections.flatMap((section) => section.evidenceRefs));

    return getProgramDocumentationResultSchema.parse({
      schemaVersion: "1",
      status: "ok",
      toolName: "get_program_documentation",
      portfolioId: request.portfolioId,
      ...(request.programId ? { programId: request.programId } : {}),
      ...(request.projectIds ? { projectIds: request.projectIds } : {}),
      deterministicCore,
        evidenceRefs,
        artifactRefs,
        redactionSummary,
      warnings: [],
      nextRecommendedTool: TOOL_NEXT_RECOMMENDATION.get_program_documentation,
      traceId: request.traceId,
      correlationId: request.correlationId,
        stateVersionHash: stateVersionHashFromInput({
          request: {
            topic: request.topic,
            format: request.format ?? "json_summary",
            portfolioId: request.portfolioId,
          programId: request.programId,
          projectIds: request.projectIds
        },
        deterministicCore,
          evidenceRefs,
          artifactRefs
        })
      });
  }

  async planProgramAction(requestInput: unknown, actor: ProgramToolActor) {
    const request = planProgramActionRequestSchema.parse(requestInput);

    try {
      assertReadAuthorized(
        actor,
        {
          ...request,
          projectIds: inferScopedProjectIds({
            ...request,
            projectIds: request.projectIds,
            targetRefs: request.proposedChange.targetRefs
          })
        },
        this.#now()
      );
      await this.#adapterRegistry.assertNoMutationAuthority();
    } catch (error) {
      return planProgramActionResultSchema.parse(
        this.#blockedEnvelope("plan_program_action", request, error)
      );
    }

    const scope = {
      portfolioId: request.portfolioId,
      programId: request.programId,
      projectIds: inferScopedProjectIds({
        ...request,
        projectIds: request.projectIds,
        targetRefs: request.proposedChange.targetRefs
      })
    };
    const contextAnchor = defaultContextAnchor({
      portfolioId: request.portfolioId,
      programId: request.programId,
      projectIds: scope.projectIds,
      contextAnchor: request.contextAnchor
    });
    const proposedChangeDigest = sha256ForInput(request.proposedChange);
    const changeRef = `change://program-action/${sanitizedPointerSegment(proposedChangeDigest)}`;
    const manifests = this.#adapterRegistry
      .listManifests()
      .map((manifest) => ({
        adapterId: manifest.adapterId,
        adapterVersion: manifest.adapterVersion,
        sideEffectPosture: manifest.sideEffectPosture
      }))
      .sort((left, right) => left.adapterId.localeCompare(right.adapterId));
    const [repoImpactResult, relationships, adapterCursors] = await Promise.all([
      this.#repository.assessImpact({
        scope,
        changeRef,
        changeKind: request.proposedChange.changeType,
        targetRefs: request.proposedChange.targetRefs,
        traversalBudgetRef: request.traversalBudgetRef,
        contextAnchor: request.contextAnchor
      }),
      this.#repository.listRelationships(scope),
      Promise.all(
        manifests.map((manifest) =>
          this.#adapterRegistry.getSourceCursor(manifest.adapterId, scope)
        )
      )
    ]);
    const repoImpact = sanitizePointerPayload(repoImpactResult);
    const plannerRuleVersions = [
      { ruleId: "rule://program-action/approval-obligations/v1", version: "v1" },
      { ruleId: "rule://program-action/evidence-obligations/v1", version: "v1" },
      { ruleId: "rule://program-action/flight-plan-hash/v1", version: "v1" },
      { ruleId: "rule://program-action/propagation-suppression/v1", version: "v1" },
      { ruleId: "rule://program-action/proposal-boundary/v1", version: "v1" },
      { ruleId: "rule://program-action/ttl-revalidation/v1", version: "v1" }
    ];
    const relationshipAffectedRefs = relationships
      .filter((relationship) => intersectsTargetRefs(relationship, request.proposedChange.targetRefs))
      .flatMap((relationship) => [
        {
          kind: "dependency",
          ref: dependencyPointer(relationship.dependencyId),
          reason: "dependency intersects proposed change target refs"
        },
        ...(relationship.policyRefs ?? []).map((policyRef) => ({
          kind: "policy",
          ref: policyRef,
          reason: "policy attached to affected dependency"
        })),
        ...relationship.evidenceRefs.map((evidenceRef) => ({
          kind: "evidence",
          ref: evidenceRef,
          reason: "evidence attached to affected dependency"
        }))
      ]);
    const targetAffectedRefs = request.proposedChange.targetRefs.map((ref) => ({
      kind: refKind(ref),
      ref,
      reason: "direct target of proposed change"
    }));
    const affectedRefs = sortUnique(
      [...repoImpact.value.affectedRefs, ...relationshipAffectedRefs, ...targetAffectedRefs].map(
        (item) => JSON.stringify(item)
      )
    )
      .map((item) => JSON.parse(item))
      .sort(compareAffectedRefs);
    const riskFindings = repoImpact.value.findings
      .map((finding) => ({
        findingId: finding.findingId.includes("://")
          ? finding.findingId
          : `finding://program-action/${sanitizedPointerSegment(finding.findingId)}`,
        severity: finding.severity,
        type: finding.type,
        summary: finding.summary ?? `${finding.type} risk from impact assessment.`,
        evidenceRefs: sortUniqueRefs(finding.evidenceRefs)
      }))
      .sort(compareFindings);
    const approvalObligations = repoImpact.value.requiredApprovals
      .map((approval) => ({
        authorityRef: approval.authorityRef,
        blocking: true,
        evidencePolicyRefs: sortUniqueRefs(approval.evidencePolicyRefs),
        reason: approval.reason,
        status: "unsatisfied" as const
      }))
      .sort((left, right) => left.authorityRef.localeCompare(right.authorityRef));
    const evidenceObligations = repoImpact.value.evidenceObligations
      .map((obligation) => {
        const enriched = {
          ...obligation,
          blocking: isBlockingEvidenceObligation(obligation),
          requiredVerifier: "adapter_observed_state" as const
        };
        return enriched;
      })
      .sort((left, right) => left.policyRef.localeCompare(right.policyRef) || left.targetRef.localeCompare(right.targetRef));
    const requestedActionInputs: Array<{
      actionType: string;
      adapterId: string;
      rationale?: string;
      targetRef: string;
    }> = request.requestedExternalActions?.length
      ? request.requestedExternalActions
      : request.proposedChange.targetRefs.map((targetRef) => ({
          actionType: actionTypeForTargetRef(targetRef),
          adapterId: adapterForTargetRef(targetRef),
          targetRef
        }));
    const requestedActionCandidates = requestedActionInputs
      .map((action) => ({
        actionType: action.actionType,
        adapterId: action.adapterId,
        rationale:
          action.rationale ??
          `Proposal-only ${action.actionType} for ${action.targetRef}; executor owns downstream mutation.`,
        targetRef: action.targetRef
      }))
      .sort(comparePlanActionCandidates)
      .filter(
        (action, index, list) =>
          list.findIndex((candidate) => edgeKey(candidate) === edgeKey(action)) === index
      );
    const propagationDepth = request.propagationDepth ?? 0;
    const maxPropagationDepth = request.maxPropagationDepth ?? 8;
    const propagationPath = [...(request.propagationPath ?? [])].sort(comparePlanActionCandidates);
    const propagationPathKeys = new Set(propagationPath.map(edgeKey));
    const suppressedProposals = requestedActionCandidates
      .filter(
        (action) =>
          propagationDepth >= maxPropagationDepth || propagationPathKeys.has(edgeKey(action))
      )
      .map((action) => ({
        suppressionId: `suppression://program-action/${sanitizedPointerSegment(
          sha256ForInput({ action, propagationDepth, maxPropagationDepth, propagationPath })
        )}`,
        targetAdapterId: action.adapterId,
        targetRef: action.targetRef,
        actionType: action.actionType,
        reason:
          propagationDepth >= maxPropagationDepth
            ? "max_propagation_depth_reached" as const
            : "duplicate_propagation_edge" as const,
        evidenceRefs: sortUniqueRefs([
          `evidence://program-action/propagation-path/${sanitizedPointerSegment(
            sha256ForInput(propagationPath)
          )}`
        ])
      }))
      .sort((left, right) => left.suppressionId.localeCompare(right.suppressionId));
    const suppressedKeys = new Set(
      suppressedProposals.map((proposal) =>
        edgeKey({
          adapterId: proposal.targetAdapterId,
          targetRef: proposal.targetRef,
          actionType: proposal.actionType
        })
      )
    );
    const actionPlans: FlightPlanProposedExternalAction[] = requestedActionCandidates
      .filter((action) => !suppressedKeys.has(edgeKey(action)))
      .map((action) => {
        const idempotencyKey = stateVersionHashFromInput({
          contextAnchor,
          proposedChange: request.proposedChange,
          action,
          propagationDepth,
          propagationPath
        });
        const proposedActionId = `action://program-action/${sanitizedPointerSegment(idempotencyKey)}`;
        const receiptRequirementId = `receipt://program-action/${sanitizedPointerSegment(
          idempotencyKey
        )}`;
        const evidencePolicyRefs = sortUniqueRefs([
          defaultEvidencePolicyRefForTarget(action.targetRef),
          ...evidenceObligations
            .filter((obligation) => obligation.targetRef === action.targetRef)
            .map((obligation) => obligation.policyRef)
        ]);
        return {
          actionType: action.actionType,
          approvalAuthorityRefs: sortUniqueRefs(
            approvalObligations.map((approval) => approval.authorityRef)
          ),
          causation: {
            depth: propagationDepth,
            path: propagationPath,
            sourceTool: "plan_program_action" as const
          },
          evidencePolicyRefs,
          expectedReceiptRequirementIds: [receiptRequirementId],
          idempotencyKey,
          proposedActionId,
          rationale: action.rationale,
          status: "proposed" as const,
          targetAdapterId: action.adapterId,
          targetRef: action.targetRef
        };
      })
      .sort((left, right) => left.proposedActionId.localeCompare(right.proposedActionId));
    const expiresAt = addSeconds(
      typeof contextAnchor.asOf === "string" ? contextAnchor.asOf : this.#now(),
      request.planTtlSeconds ?? 3600
    );
    const flightPlanStateVersionHash = stateVersionHashFromInput({
      adapterManifestVersions: manifests,
      adapterCursors,
      contextAnchor,
      proposedChange: request.proposedChange,
      repoImpact: repoImpact.value,
      plannerRuleVersions,
      traversalBudgetRef: request.traversalBudgetRef
    });
    const receiptRequirementsWithoutPlanHash = actionPlans.map((action) => ({
      correlationId: request.correlationId,
      evidencePolicyRefs: action.evidencePolicyRefs,
      expectedReceiptType: receiptTypeForAction(action.actionType),
      flightPlanStateVersionHash,
      idempotencyKey: action.idempotencyKey,
      proposedActionId: action.proposedActionId,
      receiptRequirementId: action.expectedReceiptRequirementIds[0],
      requiredEvidenceRefs: sortUniqueRefs([
        ...riskFindings.flatMap((finding) => finding.evidenceRefs),
        ...evidenceObligations
          .filter((obligation) => obligation.targetRef === action.targetRef)
          .map((obligation) => obligation.targetRef)
      ]),
      requiredVerifier: requiredVerifierForAction(action.actionType),
      scopeRefs: sortUniqueRefs([
        request.portfolioId,
        ...(request.programId ? [request.programId] : []),
        ...scope.projectIds,
        action.targetRef
      ]),
      status: "expected" as const,
      traceId: request.traceId
    }));
    const flightPlanId = `flightplan://program-action/${sanitizedPointerSegment(
      sha256ForInput({
        flightPlanStateVersionHash,
        contextAnchor,
        proposedChange: request.proposedChange
      })
    )}`;
    const hashInput = {
      adapterManifestVersions: manifests,
      affectedRefs,
      approvalObligations,
      contextAnchor,
      evidenceObligations,
      expiresAt,
      flightPlanId,
      flightPlanStateVersionHash,
      plannerRuleVersions,
      proposedChange: request.proposedChange,
      proposedExternalActions: actionPlans,
      receiptRequirements: receiptRequirementsWithoutPlanHash,
      revalidation: {
        requiredBeforeReceiptSatisfaction: true,
        staleIfAnyChangeTo: [
          "stateVersionHash",
          "contextAnchor",
          "adapterManifestVersions",
          "plannerRuleVersions"
        ]
      },
      riskFindings,
      suppressedProposals,
      traversalBudgetRef: request.traversalBudgetRef
    };
    const flightPlanHash = stateVersionHashFromInput(hashInput);
    const expectedReceipts: FlightPlanExpectedReceipt[] = receiptRequirementsWithoutPlanHash.map(
      (receipt) => ({
        ...receipt,
        flightPlanHash,
        flightPlanId
      })
    );
    const deterministicCore = {
      ...hashInput,
      expectedReceipts,
      flightPlanHash
    };
    delete (deterministicCore as { receiptRequirements?: unknown }).receiptRequirements;
    const evidenceRefs = sortUniqueRefs([
      ...riskFindings.flatMap((finding) => finding.evidenceRefs),
      ...suppressedProposals.flatMap((proposal) => proposal.evidenceRefs),
      ...manifests.map(
        (manifest) => `evidence://adapter-manifest/${manifest.adapterId}@${manifest.adapterVersion}`
      )
    ]);
    const matchedEvidenceRefs = await this.#repository.listEvidenceRefs(scope, evidenceRefs);
    const artifactRefs = sortUniqueRefs([
      ...collectArtifactRefsFromEvidence(matchedEvidenceRefs),
      ...adapterCursors.map((cursor) => pointerFromCursor(cursor.adapterId, cursor.cursor))
    ]);
    const warnings = [
      ...evidenceObligations
        .filter((obligation) => obligation.status !== "satisfied")
        .map((obligation) =>
          makeWarning(
            `flight-plan-evidence-${sanitizedPointerSegment(obligation.policyRef)}-${sanitizedPointerSegment(obligation.targetRef)}`,
            obligation.blocking ? "high" : "medium",
            `${obligation.status} evidence for ${obligation.targetRef} under ${obligation.policyRef}.`,
            [obligation.targetRef]
          )
        ),
      ...suppressedProposals.map((proposal) =>
        makeWarning(
          `flight-plan-suppressed-${sanitizedPointerSegment(proposal.suppressionId)}`,
          "medium",
          `Suppressed ${proposal.actionType} for ${proposal.targetRef}: ${proposal.reason}.`,
          proposal.evidenceRefs
        )
      )
    ].sort(compareWarnings);
    const hasBlockingObligation =
      approvalObligations.some((approval) => approval.blocking && approval.status === "unsatisfied") ||
      evidenceObligations.some((obligation) => obligation.blocking);
    const advisoryPane = request.includeAdvisoryPane
      ? {
          content: {
            summary: `${actionPlans.length} proposal-only external actions planned; no downstream writes were performed.`
          },
          excludedFromDeterministicHash: true as const,
          modelAssisted: false
        }
      : undefined;

    return planProgramActionResultSchema.parse({
      schemaVersion: "1",
      status: hasBlockingObligation ? "blocked" : warnings.length > 0 ? "warning" : "ok",
      toolName: "plan_program_action",
      portfolioId: request.portfolioId,
      ...(request.programId ? { programId: request.programId } : {}),
      ...(scope.projectIds.length > 0 ? { projectIds: scope.projectIds } : {}),
      deterministicCore,
      evidenceRefs,
      artifactRefs,
      redactionSummary: mergeRedactionSummaries(repoImpact.redactionSummary),
      warnings,
      ...(advisoryPane ? { advisoryPane } : {}),
      nextRecommendedTool: TOOL_NEXT_RECOMMENDATION.plan_program_action,
      traceId: request.traceId,
      correlationId: request.correlationId,
      stateVersionHash: flightPlanStateVersionHash
    });
  }

  async getAgenticOsContextPacket(requestInput: unknown, actor: ProgramToolActor) {
    const request = getAgenticOsContextPacketRequestSchema.parse(requestInput);
    const queryRequest = {
      portfolioId: request.portfolioId,
      ...(request.programId ? { programId: request.programId } : {}),
      ...(request.projectIds ? { projectIds: request.projectIds } : {}),
      ...(request.contextAnchor ? { contextAnchor: request.contextAnchor } : {}),
      queryKind: request.queryKind ?? "program_summary",
      targetRefs: request.targetRefs,
      includeFutureNotApplicable: request.includeFutureNotApplicable,
      includeSuperseded: request.includeSuperseded,
      limit: request.limit,
      traceId: request.traceId,
      correlationId: request.correlationId
    };
    const contextResult = await this.queryProgramContext(queryRequest, actor);

    if (!contextResult.deterministicCore) {
      return getAgenticOsContextPacketResultSchema.parse({
        schemaVersion: "1",
        status: "blocked",
        toolName: "get_agentic_os_context_packet",
        portfolioId: request.portfolioId,
        ...(request.programId ? { programId: request.programId } : {}),
        ...(contextResult.projectIds ? { projectIds: contextResult.projectIds } : {}),
        evidenceRefs: contextResult.evidenceRefs,
        artifactRefs: contextResult.artifactRefs,
        redactionSummary: contextResult.redactionSummary,
        warnings: contextResult.warnings,
        nextRecommendedTool: "get_program_documentation",
        traceId: request.traceId,
        correlationId: request.correlationId
      });
    }

    const planResult = request.proposedChange
      ? await this.planProgramAction(
          {
            portfolioId: request.portfolioId,
            ...(request.programId ? { programId: request.programId } : {}),
            ...(request.projectIds ? { projectIds: request.projectIds } : {}),
            ...(request.contextAnchor ? { contextAnchor: request.contextAnchor } : {}),
            proposedChange: request.proposedChange,
            traversalBudgetRef: request.traversalBudgetRef,
            traceId: request.traceId,
            correlationId: request.correlationId
          },
          actor
        )
      : undefined;
    const cpGraphRefs = sortUniqueRefs([
      request.portfolioId,
      ...(request.programId ? [request.programId] : []),
      ...request.targetRefs,
      ...contextResult.deterministicCore.matchedRefs.map((match) => match.ref),
      ...Object.values(contextResult.deterministicCore.contextPanes ?? {}).flatMap((items) =>
        items.flatMap((item) => ("ref" in item ? [item.ref] : item.targetRefs))
      ),
      ...(planResult?.deterministicCore?.affectedRefs.map((item) => item.ref) ?? []),
      ...(planResult?.deterministicCore?.proposedExternalActions.map((item) => item.targetRef) ?? []),
      ...(planResult?.deterministicCore?.expectedReceipts.flatMap((receipt) => receipt.scopeRefs) ?? [])
    ]);
    const deterministicCore = {
      contextPacketRef: `context-packet://agentic-os/${sanitizedPointerSegment(
        stateVersionHashFromInput({
          workContextRef: request.workContextRef,
          contextStateVersionHash: contextResult.stateVersionHash,
          flightPlanHash: planResult?.deterministicCore?.flightPlanHash,
          governance: request.governance,
          cpGraphRefs
        })
      )}`,
      workContextRef: request.workContextRef,
      ...(request.agenticOsRunRef ? { agenticOsRunRef: request.agenticOsRunRef } : {}),
      contextCore: contextResult.deterministicCore,
      ...(planResult?.deterministicCore ? { flightPlanCore: planResult.deterministicCore } : {}),
      cpGraphRefs,
      governance: {
        ...request.governance,
        ...(request.governance.piiHandlingPolicyRefs
          ? { piiHandlingPolicyRefs: sortUniqueRefs(request.governance.piiHandlingPolicyRefs) }
          : {})
      },
      receiptSubmission: {
        resultToolName: "record_program_receipt" as const,
        submissionBoundary: "execution_agent_submits_receipt_pmo_records_ledger" as const,
        requiredTraceId: request.traceId,
        requiredCorrelationId: request.correlationId,
        requiredVerifierMethods: sortUnique([
          "adapter_observed_state",
          "content_digest",
          "operator_attestation"
        ]) as Array<"adapter_observed_state" | "content_digest" | "operator_attestation">
      },
      executionBoundary: "pmo_passive_analyst_execution_agent_performs_side_effects" as const
    };
    const evidenceRefs = sortUniqueRefs([
      ...contextResult.evidenceRefs,
      ...(planResult?.evidenceRefs ?? []),
      `evidence://agentic-os/context-packet/${sanitizedPointerSegment(request.workContextRef)}`,
      `evidence://trust-root/${sanitizedPointerSegment(request.governance.trustRootRef)}`,
      `evidence://retention-policy/${sanitizedPointerSegment(request.governance.retentionPolicyRef)}`
    ]);
    const artifactRefs = sortUniqueRefs([
      ...contextResult.artifactRefs,
      ...(planResult?.artifactRefs ?? [])
    ]);
    const warnings = [
      ...contextResult.warnings,
      ...(planResult?.warnings ?? [])
    ].sort(compareWarnings);

    return getAgenticOsContextPacketResultSchema.parse({
      schemaVersion: "1",
      status: statusFromValues([contextResult.status, planResult?.status ?? "ok"]),
      toolName: "get_agentic_os_context_packet",
      portfolioId: request.portfolioId,
      ...(request.programId ? { programId: request.programId } : {}),
      ...(contextResult.projectIds ? { projectIds: contextResult.projectIds } : {}),
      deterministicCore,
      evidenceRefs,
      artifactRefs,
      redactionSummary: mergeRedactionSummaries(
        contextResult.redactionSummary,
        planResult?.redactionSummary,
        buildRedactionSummary({
          policyRefs: [
            "policy://redaction/pointer-only-v1",
            request.governance.retentionPolicyRef,
            ...(request.governance.piiHandlingPolicyRefs ?? [])
          ]
        })
      ),
      warnings,
      nextRecommendedTool: TOOL_NEXT_RECOMMENDATION.get_agentic_os_context_packet,
      traceId: request.traceId,
      correlationId: request.correlationId,
      stateVersionHash: stateVersionHashFromInput({
        deterministicCore,
        evidenceRefs,
        artifactRefs
      })
    });
  }

  async recordProgramReceipt(requestInput: unknown, actor: ProgramToolActor) {
    const request = recordProgramReceiptRequestSchema.parse(requestInput);
    const scope = {
      portfolioId: request.portfolioId,
      programId: request.programId,
      projectIds: inferScopedProjectIds({
        ...request,
        projectIds: request.projectIds,
        targetRefs: request.observedStateRefs
      })
    };

    try {
      assertReadAuthorized(
        actor,
        {
          ...request,
          projectIds: scope.projectIds,
          targetRefs: request.observedStateRefs
        },
        this.#now()
      );
      await this.#adapterRegistry.assertNoMutationAuthority();
    } catch (error) {
      return recordProgramReceiptResultSchema.parse(
        this.#blockedEnvelope("record_program_receipt", request, error)
      );
    }

    const validationRuleRefs = sortUniqueRefs([
      "rule://program-receipt/expected-match/v1",
      "rule://program-receipt/idempotency/v1",
      "rule://program-receipt/evidence-policy/v1",
      "rule://program-receipt/digest-attestation/v1",
      "rule://program-receipt/stale-plan/v1"
    ]);
    const ledger = await this.#repository.listReceiptLedger({
      scope,
      flightPlanIds: [request.flightPlanId],
      receiptRequirementIds: [request.receiptRequirementId]
    });
    const expectedReceipt = ledger.expectedReceipts.find(
      (receipt) =>
        receipt.receiptRequirementId === request.receiptRequirementId &&
        receipt.flightPlanId === request.flightPlanId &&
        receipt.proposedActionId === request.proposedActionId
    );
    const duplicateReceipt = ledger.observedReceipts.find(
      (receipt) =>
        receipt.receiptRequirementId === request.receiptRequirementId &&
        receipt.idempotencyKey === request.idempotencyKey
    );
    const evidenceRefs = sortUniqueRefs([
      ...request.evidenceRefs,
      ...(request.operatorAttestation?.evidenceRefs ?? [])
    ]);
    const artifactRefs = sortUniqueRefs(request.artifactRefs ?? []);

    const rejectedEnvelope = (
      warningId: string,
      summary: string,
      validationStatus: "duplicate" | "rejected" = "rejected",
      duplicateOf?: string
    ) =>
      recordProgramReceiptResultSchema.parse({
        schemaVersion: "1",
        status: "blocked",
        toolName: "record_program_receipt",
        portfolioId: request.portfolioId,
        ...(request.programId ? { programId: request.programId } : {}),
        ...(scope.projectIds.length > 0 ? { projectIds: scope.projectIds } : {}),
        deterministicCore: {
          receiptRequirementId: request.receiptRequirementId,
          ...(expectedReceipt ? { expectedReceipt } : {}),
          ...(duplicateOf ? { duplicateOf } : {}),
          validation: {
            status: validationStatus,
            validationRuleRefs
          }
        },
        evidenceRefs,
        artifactRefs,
        redactionSummary: buildRedactionSummary({
          policyRefs: DEFAULT_REDACTION_POLICY_REFS
        }),
        warnings: [makeWarning(warningId, "high", summary, evidenceRefs)],
        nextRecommendedTool: TOOL_NEXT_RECOMMENDATION.record_program_receipt,
        traceId: request.traceId,
        correlationId: request.correlationId,
        stateVersionHash: stateVersionHashFromInput({
          request,
          validationStatus,
          warningId,
          duplicateOf,
          expectedReceipt,
          evidenceRefs,
          artifactRefs
        })
      });

    if (!expectedReceipt) {
      return rejectedEnvelope(
        "receipt-expected-not-found",
        "No expected receipt obligation matched the submitted receipt."
      );
    }

    if (
      expectedReceipt.flightPlanHash !== request.flightPlanHash ||
      expectedReceipt.flightPlanStateVersionHash !== request.flightPlanStateVersionHash
    ) {
      return rejectedEnvelope(
        "receipt-stale-flight-plan",
        "Receipt references a stale or mismatched flight plan hash."
      );
    }

    if (expectedReceipt.expectedReceiptType !== request.receiptType) {
      return rejectedEnvelope(
        "receipt-type-mismatch",
        "Receipt type does not match the expected receipt obligation."
      );
    }

    if (expectedReceipt.requiredVerifier !== request.verificationMethod) {
      return rejectedEnvelope(
        "receipt-verifier-mismatch",
        "Receipt verification method does not match the expected evidence policy."
      );
    }

    if (duplicateReceipt) {
      return rejectedEnvelope(
        "receipt-duplicate-idempotency-key",
        "Receipt idempotency key was already recorded for this expected receipt.",
        "duplicate",
        duplicateReceipt.observedReceiptId
      );
    }

    const requiredEvidenceRefs = sortUniqueRefs(expectedReceipt.requiredEvidenceRefs ?? []);
    const submittedEvidenceContext = new Set([...evidenceRefs, ...request.observedStateRefs]);
    const missingEvidenceRefs = requiredEvidenceRefs.filter((ref) => !submittedEvidenceContext.has(ref));

    if (missingEvidenceRefs.length > 0) {
      return rejectedEnvelope(
        "receipt-required-evidence-missing",
        `Receipt is missing required evidence refs: ${missingEvidenceRefs.join(", ")}.`
      );
    }

    if (request.verificationMethod === "adapter_observed_state" && request.observedStateRefs.length === 0) {
      return rejectedEnvelope(
        "receipt-observed-state-missing",
        "Adapter-observed receipts require at least one observed state ref."
      );
    }

    if (request.verificationMethod === "operator_attestation") {
      if (!request.operatorAttestation) {
        return rejectedEnvelope(
          "receipt-operator-attestation-missing",
          "Operator-attested receipts require an operator attestation."
        );
      }
      if (request.operatorAttestation.attestedBy !== actor.actorId) {
        return rejectedEnvelope(
          "receipt-operator-attestation-actor-mismatch",
          "Operator attestation must be made by the authenticated actor."
        );
      }
    }

    const expectedDigest = receiptDigestForInput(request);
    if (request.receiptDigest !== expectedDigest) {
      return rejectedEnvelope(
        "receipt-digest-mismatch",
        "Receipt digest does not match the canonical receipt payload."
      );
    }

    if (request.signature && request.signature.digest !== request.receiptDigest) {
      return rejectedEnvelope(
        "receipt-signature-digest-mismatch",
        "Receipt signature digest does not match the submitted receipt digest."
      );
    }

    const now = this.#now();
    const observedReceipt: ObservedReceipt = {
      observedReceiptId: receiptObservedId(request.idempotencyKey),
      receiptRequirementId: request.receiptRequirementId,
      portfolioId: request.portfolioId,
      ...(request.programId ? { programId: request.programId } : {}),
      ...(scope.projectIds.length === 1 ? { projectId: scope.projectIds[0] } : {}),
      contractRefs: expectedReceiptContractRefs(expectedReceipt),
      flightPlanId: request.flightPlanId,
      flightPlanHash: request.flightPlanHash,
      proposedActionId: request.proposedActionId,
      actorId: actor.actorId,
      traceId: request.traceId,
      correlationId: request.correlationId,
      idempotencyKey: request.idempotencyKey,
      receiptType: request.receiptType,
      receiptDigest: request.receiptDigest,
      evidenceRefs,
      artifactRefs,
      observedStateRefs: sortUniqueRefs(request.observedStateRefs),
      observedAt: request.observedAt,
      recordedAt: now,
      status: "accepted",
      summary: request.summary
    };
    const actionLedgerEntry: ActionLedgerEntry = {
      ledgerEntryId: receiptLedgerEntryId(request.idempotencyKey),
      portfolioId: request.portfolioId,
      ...(request.programId ? { programId: request.programId } : {}),
      ...(observedReceipt.projectId ? { projectId: observedReceipt.projectId } : {}),
      contractRefs: observedReceipt.contractRefs,
      flightPlanId: request.flightPlanId,
      proposedActionId: request.proposedActionId,
      receiptRequirementId: request.receiptRequirementId,
      observedReceiptId: observedReceipt.observedReceiptId,
      actorId: actor.actorId,
      traceId: request.traceId,
      correlationId: request.correlationId,
      entryType: "observed_receipt",
      status: "accepted",
      summary: request.summary,
      evidenceRefs,
      artifactRefs,
      recordedAt: now
    };
    const reconcileStatus: ReceiptReconcileRecord = {
      receiptRequirementId: request.receiptRequirementId,
      portfolioId: request.portfolioId,
      ...(request.programId ? { programId: request.programId } : {}),
      ...(observedReceipt.projectId ? { projectId: observedReceipt.projectId } : {}),
      contractRefs: observedReceipt.contractRefs,
      flightPlanId: request.flightPlanId,
      flightPlanHash: request.flightPlanHash,
      proposedActionId: request.proposedActionId,
      status: "satisfied",
      expectedCount: 1,
      observedCount: ledger.observedReceipts.length + 1,
      acceptedCount:
        ledger.observedReceipts.filter((receipt) => receipt.status === "accepted").length + 1,
      missingCount: 0,
      duplicateCount: ledger.observedReceipts.filter((receipt) => receipt.status === "duplicate").length,
      conflictingCount: ledger.observedReceipts.filter((receipt) => receipt.status === "conflicting").length,
      evidenceRefs,
      updatedAt: now
    };
    const auditEvent: ProgramEvent = {
      eventId: `event://program-receipt/${sanitizedPointerSegment(request.idempotencyKey)}`,
      portfolioId: request.portfolioId,
      eventType: "record_program_receipt.accepted",
      recordedAt: now,
      contextAnchor: defaultContextAnchor({
        portfolioId: request.portfolioId,
        programId: request.programId,
        projectIds: scope.projectIds,
        contextAnchor: request.contextAnchor
      }),
      evidenceRefs,
      artifactRefs
    };

    await this.#repository.appendObservedReceipt(observedReceipt, auditEvent);
    await this.#repository.appendActionLedgerEntry(actionLedgerEntry);
    await this.#repository.upsertReceiptReconcileStatus(reconcileStatus);

    return recordProgramReceiptResultSchema.parse({
      schemaVersion: "1",
      status: "ok",
      toolName: "record_program_receipt",
      portfolioId: request.portfolioId,
      ...(request.programId ? { programId: request.programId } : {}),
      ...(scope.projectIds.length > 0 ? { projectIds: scope.projectIds } : {}),
      deterministicCore: {
        expectedReceipt,
        observedReceipt,
        actionLedgerEntry,
        reconcileStatus,
        receiptRequirementId: request.receiptRequirementId,
        validation: {
          status: "accepted",
          validationRuleRefs
        }
      },
      evidenceRefs,
      artifactRefs,
      redactionSummary: buildRedactionSummary({
        policyRefs: DEFAULT_REDACTION_POLICY_REFS
      }),
      warnings: [],
      nextRecommendedTool: TOOL_NEXT_RECOMMENDATION.record_program_receipt,
      traceId: request.traceId,
      correlationId: request.correlationId,
      stateVersionHash: stateVersionHashFromInput({
        request,
        deterministicCore: {
          expectedReceipt,
          observedReceipt,
          actionLedgerEntry,
          reconcileStatus
        },
        evidenceRefs,
        artifactRefs
      })
    });
  }

  async submitAgenticOsReceipt(requestInput: unknown, actor: ProgramToolActor) {
    const request = submitAgenticOsReceiptRequestSchema.parse(requestInput);
    const {
      agenticOsRunRef,
      executionAgentRef,
      executionReceipt,
      governance,
      ...rawReceiptRequest
    } = request;
    const receiptRequest = {
      ...rawReceiptRequest,
      ...(executionReceipt && !rawReceiptRequest.projectIds
        ? { projectIds: [executionReceipt.projectId] }
        : {})
    };

    if (executionAgentRef !== actor.actorId) {
      return submitAgenticOsReceiptResultSchema.parse({
        schemaVersion: "1",
        status: "blocked",
        toolName: "submit_agentic_os_receipt",
        portfolioId: request.portfolioId,
        ...(request.programId ? { programId: request.programId } : {}),
        ...(request.projectIds ? { projectIds: request.projectIds } : {}),
        deterministicCore: {
          agenticOsRunRef,
          executionAgentRef,
          ...(executionReceipt ? { executionReceipt } : {}),
          receiptSubmissionToolName: "record_program_receipt",
          validation: {
            passiveBoundaryPreserved: true,
            status: "blocked"
          }
        },
        evidenceRefs: buildAuthzEvidenceRefs(actor),
        artifactRefs: [],
        redactionSummary: buildRedactionSummary({
          policyRefs: [
            "policy://authz/server-verified-actor-v1",
            governance.trustRootRef,
            governance.retentionPolicyRef,
            ...(governance.piiHandlingPolicyRefs ?? [])
          ]
        }),
        warnings: [
          makeWarning(
            "agentic-os-execution-agent-mismatch",
            "high",
            "Agentic OS receipt executionAgentRef must match the authenticated actor.",
            buildAuthzEvidenceRefs(actor)
          )
        ],
        nextRecommendedTool: "get_agentic_os_context_packet",
        traceId: request.traceId,
        correlationId: request.correlationId,
        stateVersionHash: stateVersionHashFromInput({
          agenticOsRunRef,
          executionAgentRef,
          actorId: actor.actorId,
          status: "blocked"
        })
      });
    }

    const receiptResult = await this.recordProgramReceipt(receiptRequest, actor);
    const receiptValidationStatus =
      receiptResult.deterministicCore?.validation.status ?? "blocked";
    const validationStatus =
      receiptValidationStatus === "accepted"
        ? "accepted"
        : receiptValidationStatus === "duplicate"
          ? "duplicate"
          : receiptValidationStatus === "rejected"
            ? "rejected"
            : "blocked";
    const deterministicCore = {
      agenticOsRunRef,
      executionAgentRef,
      receiptSubmissionToolName: "record_program_receipt" as const,
      ...(executionReceipt ? { executionReceipt } : {}),
      ...(receiptResult.deterministicCore
        ? { receiptCore: receiptResult.deterministicCore }
        : {}),
      validation: {
        passiveBoundaryPreserved: true as const,
        status: validationStatus
      }
    };

    return submitAgenticOsReceiptResultSchema.parse({
      schemaVersion: "1",
      status: receiptResult.status,
      toolName: "submit_agentic_os_receipt",
      portfolioId: request.portfolioId,
      ...(request.programId ? { programId: request.programId } : {}),
      ...(receiptResult.projectIds ? { projectIds: receiptResult.projectIds } : {}),
      deterministicCore,
      evidenceRefs: sortUniqueRefs([
        ...receiptResult.evidenceRefs,
        `evidence://agentic-os/receipt/${sanitizedPointerSegment(agenticOsRunRef)}`,
        `evidence://trust-root/${sanitizedPointerSegment(governance.trustRootRef)}`,
        `evidence://retention-policy/${sanitizedPointerSegment(governance.retentionPolicyRef)}`
      ]),
      artifactRefs: receiptResult.artifactRefs,
      redactionSummary: mergeRedactionSummaries(
        receiptResult.redactionSummary,
        buildRedactionSummary({
          policyRefs: [
            "policy://redaction/pointer-only-v1",
            governance.trustRootRef,
            governance.retentionPolicyRef,
            ...(governance.piiHandlingPolicyRefs ?? [])
          ]
        })
      ),
      warnings: receiptResult.warnings,
      nextRecommendedTool: TOOL_NEXT_RECOMMENDATION.submit_agentic_os_receipt,
      traceId: request.traceId,
      correlationId: request.correlationId,
      stateVersionHash: stateVersionHashFromInput({
        deterministicCore,
        executionReceipt,
        evidenceRefs: receiptResult.evidenceRefs,
        artifactRefs: receiptResult.artifactRefs
      })
    });
  }

  async reconcileProgramState(requestInput: unknown, actor: ProgramToolActor) {
    const request = reconcileProgramStateRequestSchema.parse(requestInput);

    try {
      assertReadAuthorized(
        actor,
        {
          ...request,
          projectIds: inferScopedProjectIds({
            ...request,
            projectIds: request.projectIds,
            targetRefs: request.targetRefs
          }),
          targetRefs: request.targetRefs
        },
        this.#now()
      );
      await this.#adapterRegistry.assertNoMutationAuthority();
    } catch (error) {
      return reconcileProgramStateResultSchema.parse(
        this.#blockedEnvelope("reconcile_program_state", request, error)
      );
    }

    const scope = {
      portfolioId: request.portfolioId,
      programId: request.programId,
      projectIds: inferScopedProjectIds({
        ...request,
        projectIds: request.projectIds,
        targetRefs: request.targetRefs
      })
    };
    const now = request.asOf ?? this.#now();
    const ledger = await this.#repository.listReceiptLedger({
      scope,
      flightPlanIds: request.flightPlanIds,
      receiptRequirementIds: request.receiptRequirementIds
    });
    const targetRefSet = new Set(request.targetRefs);
    const relevantExpectedReceipts = ledger.expectedReceipts
      .filter((receipt) => receipt.scopeRefs.some((ref) => targetRefSet.has(ref)))
      .sort((left, right) => left.receiptRequirementId.localeCompare(right.receiptRequirementId));
    const manifests = this.#adapterRegistry.listManifests();
    const [healths, adapterReads] = await Promise.all([
      Promise.all(manifests.map((manifest) => this.#adapterRegistry.getHealth(manifest.adapterId, scope, now))),
      Promise.all(
        manifests.map(async (manifest) => {
          try {
            return await this.#adapterRegistry.readState(
              manifest.adapterId,
              {
                requestId: `${request.correlationId}:${manifest.adapterId}:reconcile`,
                portfolioId: request.portfolioId,
                programId: request.programId,
                projectIds: scope.projectIds,
                targetRefs: request.targetRefs,
                limit: request.targetRefs.length || 10,
                contextAnchor: request.contextAnchor
              },
              now
            );
          } catch {
            return undefined;
          }
        })
      )
    ]);
    const adapterObservationRefs = new Set(
      adapterReads
        .filter((read): read is AdapterReadStateResult => read !== undefined)
        .flatMap((read) => read.observations.flatMap((observation) => [observation.ref, ...observation.evidenceRefs]))
    );
    const reconcileStatuses: ReceiptReconcileRecord[] = [];
    const findings: Array<{
      findingId: string;
      severity: "low" | "medium" | "high" | "critical";
      type: string;
      summary: string;
      evidenceRefs: string[];
    }> = [];

    for (const expectedReceipt of relevantExpectedReceipts) {
      const observedReceipts = ledger.observedReceipts.filter(
        (receipt) => receipt.receiptRequirementId === expectedReceipt.receiptRequirementId
      );
      const acceptedReceipts = observedReceipts.filter((receipt) => receipt.status === "accepted");
      const duplicateReceipts = observedReceipts.filter((receipt) => receipt.status === "duplicate");
      const conflictingReceipts = observedReceipts.filter((receipt) => receipt.status === "conflicting");
      const acceptedWithoutAdapterSupport = acceptedReceipts.filter(
        (receipt) =>
          receipt.observedStateRefs.length > 0 &&
          !receipt.observedStateRefs.some((ref) => targetRefSet.has(ref) || adapterObservationRefs.has(ref))
      );
      const isDue = expectedReceipt.dueAt ? expectedReceipt.dueAt <= now : false;
      const lateSeconds = expectedReceipt.dueAt
        ? Math.max(0, Math.floor((Date.parse(now) - Date.parse(expectedReceipt.dueAt)) / 1000))
        : 0;
      const stuckSeconds = !expectedReceipt.dueAt
        ? Math.max(0, Math.floor((Date.parse(now) - Date.parse(expectedReceipt.recordedAt)) / 1000))
        : 0;
      const isLost = isDue && lateSeconds >= (request.lostAfterSeconds ?? 3600);
      const isStuck = !expectedReceipt.dueAt && stuckSeconds >= (request.lostAfterSeconds ?? 3600);
      const status =
        conflictingReceipts.length > 0 || acceptedWithoutAdapterSupport.length > 0
          ? "conflicting"
          : acceptedReceipts.length > 0
            ? "satisfied"
            : isLost
              ? "lost"
              : isStuck
                ? "stuck"
              : isDue
                ? "late"
                : "in_flight";
      const evidenceRefs = sortUniqueRefs([
        ...expectedReceipt.requiredEvidenceRefs,
        ...observedReceipts.flatMap((receipt) => receipt.evidenceRefs),
        ...healths.map((health) => `evidence://adapter-health/${health.adapterId}/${health.status}`)
      ]);
      const reconcileStatus: ReceiptReconcileRecord = {
        receiptRequirementId: expectedReceipt.receiptRequirementId,
        portfolioId: expectedReceipt.portfolioId ?? request.portfolioId,
        ...(expectedReceipt.programId ? { programId: expectedReceipt.programId } : request.programId ? { programId: request.programId } : {}),
        ...(expectedReceipt.projectId ? { projectId: expectedReceipt.projectId } : scope.projectIds.length === 1 ? { projectId: scope.projectIds[0] } : {}),
        contractRefs: expectedReceiptContractRefs(expectedReceipt),
        flightPlanId: expectedReceipt.flightPlanId,
        flightPlanHash: expectedReceipt.flightPlanHash,
        proposedActionId: expectedReceipt.proposedActionId,
        status,
        expectedCount: 1,
        observedCount: observedReceipts.length,
        acceptedCount: acceptedReceipts.length,
        missingCount: acceptedReceipts.length > 0 ? 0 : 1,
        duplicateCount: duplicateReceipts.length,
        conflictingCount: conflictingReceipts.length + acceptedWithoutAdapterSupport.length,
        evidenceRefs,
        updatedAt: now
      };
      reconcileStatuses.push(reconcileStatus);

      if (status !== "satisfied") {
        const type =
          status === "conflicting"
            ? "receipt_state_conflict"
          : status === "lost"
              ? "receipt_lost"
              : status === "stuck"
                ? "receipt_stuck"
              : status === "late"
                ? "receipt_late"
                : "receipt_in_flight";
        findings.push({
          findingId: `finding://program-reconcile/${sanitizedPointerSegment(expectedReceipt.receiptRequirementId)}/${status}`,
          severity:
            status === "conflicting" || status === "lost"
              ? "critical"
              : status === "late" || status === "stuck"
                ? "high"
                : "low",
          type,
          summary: `${expectedReceipt.receiptRequirementId} is ${status}.`,
          evidenceRefs
        });
      }
    }

    const compensatingPlanProposals = (request.includeCompensatingPlanProposals ?? true)
      ? findings
          .filter((finding) => finding.severity === "critical" || finding.severity === "high")
          .map((finding) => ({
            proposalId: `proposal://program-reconcile/${sanitizedPointerSegment(finding.findingId)}`,
            proposalType: "replacement_flight_plan" as const,
            reason: finding.summary,
            targetRefs: request.targetRefs,
            evidenceRefs: finding.evidenceRefs
          }))
          .sort((left, right) => left.proposalId.localeCompare(right.proposalId))
      : [];

    await Promise.all(
      reconcileStatuses.map((status, index) =>
        this.#repository.upsertReceiptReconcileStatus(
          status,
          index === 0
            ? {
                eventId: `event://program-reconcile/${sanitizedPointerSegment(request.correlationId)}`,
                portfolioId: request.portfolioId,
                eventType: "reconcile_program_state.completed",
                recordedAt: now,
                contextAnchor: defaultContextAnchor({
                  portfolioId: request.portfolioId,
                  programId: request.programId,
                  projectIds: scope.projectIds,
                  contextAnchor: request.contextAnchor
                }),
                evidenceRefs: sortUniqueRefs(findings.flatMap((finding) => finding.evidenceRefs)),
                artifactRefs: []
              }
            : undefined
        )
      )
    );

    const evidenceRefs = sortUniqueRefs([
      ...findings.flatMap((finding) => finding.evidenceRefs),
      ...healths.map((health) => `evidence://adapter-health/${health.adapterId}/${health.status}`)
    ]);
    const warnings = [
      ...healths
        .map((health) => summarizeHealthStatus(health))
        .filter((warning): warning is ToolWarning => Boolean(warning)),
      ...findings
        .filter((finding) => finding.severity !== "low")
        .map((finding) =>
          makeWarning(
            `reconcile-${sanitizedPointerSegment(finding.findingId)}`,
            finding.severity,
            finding.summary,
            finding.evidenceRefs
          )
        )
    ].sort(compareWarnings);
    const deterministicCore = {
      compensatingPlanProposals,
      findings: findings.sort(compareFindings),
      observedReceiptCount: ledger.observedReceipts.length,
      reconcileStatuses: reconcileStatuses.sort(
        (left, right) =>
          left.flightPlanId.localeCompare(right.flightPlanId) ||
          left.proposedActionId.localeCompare(right.proposedActionId) ||
          left.receiptRequirementId.localeCompare(right.receiptRequirementId)
      ),
      rulesVersion: "program-reconcile-rules-v1"
    };

    return reconcileProgramStateResultSchema.parse({
      schemaVersion: "1",
      status: findings.some((finding) => finding.severity === "critical")
        ? "blocked"
        : findings.length > 0 || warnings.length > 0
          ? "warning"
          : "ok",
      toolName: "reconcile_program_state",
      portfolioId: request.portfolioId,
      ...(request.programId ? { programId: request.programId } : {}),
      ...(scope.projectIds.length > 0 ? { projectIds: scope.projectIds } : {}),
      deterministicCore,
      evidenceRefs,
      artifactRefs: [],
      redactionSummary: buildRedactionSummary({
        policyRefs: DEFAULT_REDACTION_POLICY_REFS
      }),
      warnings,
      nextRecommendedTool: TOOL_NEXT_RECOMMENDATION.reconcile_program_state,
      traceId: request.traceId,
      correlationId: request.correlationId,
      stateVersionHash: stateVersionHashFromInput({
        request,
        deterministicCore,
        evidenceRefs
      })
    });
  }

  async analyzeProgramIntelligence(requestInput: unknown, actor: ProgramToolActor) {
    const request = analyzeProgramIntelligenceRequestSchema.parse(requestInput);

    try {
      assertReadAuthorized(
        actor,
        {
          ...request,
          projectIds: inferScopedProjectIds({
            ...request,
            projectIds: request.projectIds,
            targetRefs: request.targetRefs
          })
        },
        this.#now()
      );
      await this.#adapterRegistry.assertNoMutationAuthority();
    } catch (error) {
      return analyzeProgramIntelligenceResultSchema.parse(
        this.#blockedEnvelope("analyze_program_intelligence", request, error)
      );
    }

    const scope = {
      portfolioId: request.portfolioId,
      programId: request.programId,
      projectIds: inferScopedProjectIds({
        ...request,
        projectIds: request.projectIds,
        targetRefs: request.targetRefs
      })
    };
    const contextAnchor = defaultContextAnchor({
      portfolioId: request.portfolioId,
      programId: request.programId,
      projectIds: scope.projectIds,
      contextAnchor: request.contextAnchor
    });
    const [records, relationships] = await Promise.all([
      this.#repository.listIntelligenceRecords({
        scope,
        contextAnchor: request.contextAnchor,
        recordTypes: request.recordTypes,
        targetRefs: request.targetRefs,
        conditionTags: request.conditionTags
      }),
      this.#repository.listRelationships(scope)
    ]);
    const recordCards = records.map(issueCardFromRecord);
    const relationshipCards = repeatedBlockerCardsFromRelationships(
      relationships,
      request.targetRefs
    );
    const allCards = [...recordCards, ...relationshipCards].sort(compareIntelligenceIssueCards);
    const limit = request.limit ?? allCards.length;
    const issueCards = allCards.slice(0, limit);
    const omittedCardCount = Math.max(0, allCards.length - issueCards.length);
    const evidenceRefs = sortUniqueRefs(issueCards.flatMap((card) => card.evidenceRefs));
    const matchedEvidenceRefs = await this.#repository.listEvidenceRefs(scope, evidenceRefs);
    const artifactRefs = sortUniqueRefs(collectArtifactRefsFromEvidence(matchedEvidenceRefs));
    const deterministicCore = {
      contextAnchor,
      issueCards,
      omittedCardCount,
      rulesVersion: "program-intelligence-rules-v1"
    };
    const warnings =
      omittedCardCount > 0
        ? [
            makeWarning(
              "intelligence-cards-bounded",
              "medium",
              `${omittedCardCount} intelligence issue cards were omitted by the requested limit.`,
              evidenceRefs
            )
          ]
        : [];
    const advisoryPane = request.includeAdvisoryPane
      ? {
          content: {
            summary: `${issueCards.length} deterministic intelligence cards matched. Advisory summaries are excluded from deterministic hashes.`
          },
          excludedFromDeterministicHash: true as const,
          modelAssisted: false
        }
      : undefined;

    return analyzeProgramIntelligenceResultSchema.parse({
      schemaVersion: "1",
      status: warnings.length > 0 ? "warning" : "ok",
      toolName: "analyze_program_intelligence",
      portfolioId: request.portfolioId,
      ...(request.programId ? { programId: request.programId } : {}),
      ...(scope.projectIds.length > 0 ? { projectIds: scope.projectIds } : {}),
      deterministicCore,
      evidenceRefs,
      artifactRefs,
      redactionSummary: buildRedactionSummary({
        policyRefs: DEFAULT_REDACTION_POLICY_REFS
      }),
      warnings,
      ...(advisoryPane ? { advisoryPane } : {}),
      nextRecommendedTool: TOOL_NEXT_RECOMMENDATION.analyze_program_intelligence,
      traceId: request.traceId,
      correlationId: request.correlationId,
      stateVersionHash: stateVersionHashFromInput({
        request: {
          conditionTags: request.conditionTags,
          limit: request.limit,
          portfolioId: request.portfolioId,
          programId: request.programId,
          projectIds: scope.projectIds,
          recordTypes: request.recordTypes,
          targetRefs: request.targetRefs,
          contextAnchor: request.contextAnchor
        },
        deterministicCore,
        evidenceRefs,
        artifactRefs
      })
    });
  }

  async generateProgramUpdate(requestInput: unknown, actor: ProgramToolActor) {
    const request = generateProgramUpdateRequestSchema.parse(requestInput);

    try {
      assertReadAuthorized(
        actor,
        {
          ...request,
          projectIds: inferScopedProjectIds({
            ...request,
            projectIds: request.projectIds
          })
        },
        this.#now()
      );
      await this.#adapterRegistry.assertNoMutationAuthority();
    } catch (error) {
      return generateProgramUpdateResultSchema.parse(
        this.#blockedEnvelope("generate_program_update", request, error)
      );
    }

    const scope = {
      portfolioId: request.portfolioId,
      programId: request.programId,
      projectIds: inferScopedProjectIds({
        ...request,
        projectIds: request.projectIds
      })
    };
    const reportAudience = request.reportAudience ?? "execution";
    const templateVersion = request.templateVersion ?? DEFAULT_REPORT_TEMPLATE_VERSION;
    const [
      programs,
      projects,
      relationships,
      decisions,
      cursors,
      allEvidenceRefs
    ] = await Promise.all([
      this.#repository.listPrograms(scope),
      this.#repository.listProjects(scope),
      this.#repository.listRelationships(scope),
      this.#repository.listDecisions({
        scope,
        contextAnchor: request.contextAnchor
      }),
      this.#repository.getSyncCursors(scope),
      this.#repository.listEvidenceRefs(scope)
    ]);

    const evidenceRefs = sortUniqueRefs([
      ...decisions.flatMap((decision) => decision.evidenceRefs),
      ...relationships.flatMap((relationship) => [
        ...relationship.evidenceRefs,
        ...(relationship.contractRef ? [relationship.contractRef] : []),
        ...(relationship.policyRefs ?? [])
      ]),
      ...allEvidenceRefs.map((entry) => entry.evidenceRef)
    ]);
    const matchedEvidenceRefs = await this.#repository.listEvidenceRefs(scope, evidenceRefs);
    const resolvedArtifactRefs = await this.#repository.listArtifactRefs(
      scope,
      collectArtifactRefsFromEvidence(matchedEvidenceRefs)
    );
    const artifactRefs = sortUniqueRefs([
      ...resolvedArtifactRefs.map((artifactRef) => artifactRef.artifactRef),
      ...cursors.map((cursor) => pointerFromCursor(cursor.adapterId, cursor.cursor))
    ]);
    const programIds = sortUnique(programs.map((program) => program.programId));
    const projectIds = sortUnique(projects.map((project) => project.projectId));
    const sections = buildProgramUpdateSections({
      decisions,
      evidenceRefs,
      artifactRefs,
      portfolioIds: [request.portfolioId],
      programIds,
      projectIds,
      relationships,
      reportAudience,
      reportTemplateVersion: templateVersion
    });
    const appliedSections = request.maxSections
      ? sections.slice(0, request.maxSections)
      : sections;
    const sectionRefs = appliedSections.map((section) =>
      makeProgramUpdateSectionRef(templateVersion, section.sectionId)
    );
    const inputRefs = buildInputRefs(
      request,
      scope,
      programs,
      projects,
      decisions,
      relationships,
      evidenceRefs,
      artifactRefs
    );
    const stateVersionHash = stateVersionHashFromInput({
      request: {
        maxSections: request.maxSections,
        portfolioId: request.portfolioId,
        programId: request.programId,
        projectIds: scope.projectIds,
        reportAudience,
        templateVersion,
        contextAnchor: request.contextAnchor
      },
      sections: appliedSections,
      sectionRefs,
      inputRefs,
      evidenceRefs,
      artifactRefs
    });
    const reportMarkdown = buildReportMarkdown({
      stateVersionHash,
      templateVersion,
      reportAudience,
      sections: appliedSections
    });
    const reportMarkdownRef = makeReportMarkdownRef(
      templateVersion,
      sha256ForInput(reportMarkdown)
    );
    const evidenceEnvelope = {
      artifactRefs,
      evidenceRefs,
      generatedAt: request.contextAnchor?.asOf ?? this.#now(),
      inputRefs,
      sectionRefs,
      stateVersionHash,
      templateVersion
    };
    const evidenceEnvelopeRef = makeEvidenceEnvelopeRef(
      templateVersion,
      sha256ForInput(evidenceEnvelope)
    );
    const warnings: ToolWarning[] = [];
    const deterministicCore = {
      evidenceEnvelope,
      evidenceEnvelopeRef,
      inputRefs,
      reportAudience,
      reportMarkdownRef,
      sectionRefs,
      sections: appliedSections,
      templateVersion
    };

    return generateProgramUpdateResultSchema.parse({
      schemaVersion: "1",
      status: warnings.length > 0 ? "warning" : "ok",
      toolName: "generate_program_update",
      portfolioId: request.portfolioId,
      ...(request.programId ? { programId: request.programId } : {}),
      ...(scope.projectIds.length > 0 ? { projectIds: scope.projectIds } : {}),
      deterministicCore,
      evidenceRefs,
      artifactRefs,
      redactionSummary: buildRedactionSummary({
        policyRefs: DEFAULT_REDACTION_POLICY_REFS
      }),
      warnings,
      nextRecommendedTool: TOOL_NEXT_RECOMMENDATION.generate_program_update,
      traceId: request.traceId,
      correlationId: request.correlationId,
      stateVersionHash
    });
  }

  async getProgramAuditTrail(requestInput: unknown, actor: ProgramToolActor) {
    const request = getProgramAuditTrailRequestSchema.parse(requestInput);

    try {
      assertReadAuthorized(
        actor,
        {
          ...request,
          projectIds: inferScopedProjectIds({
            ...request,
            projectIds: request.projectIds,
            targetRefs: request.targetRefs ?? []
          })
        },
        this.#now()
      );
      await this.#adapterRegistry.assertNoMutationAuthority();
    } catch (error) {
      return getProgramAuditTrailResultSchema.parse(
        this.#blockedEnvelope("get_program_audit_trail", request, error)
      );
    }

    const scope = {
      portfolioId: request.portfolioId,
      programId: request.programId,
      projectIds: inferScopedProjectIds({
        ...request,
        projectIds: request.projectIds,
        targetRefs: request.targetRefs ?? []
      })
    };
    const events = await this.#repository.listEvents(scope);
    const eventTypeSet = request.eventTypes ? new Set(request.eventTypes) : undefined;
    const filteredEvents = events
      .filter((event) => !eventTypeSet || eventTypeSet.has(event.eventType))
      .filter((event) => eventMatchesWindow(event, request.since, request.until))
      .filter((event) => eventMatchesTargetRefs(event, request.targetRefs))
      .sort(compareAuditEvents);
    const limit = request.limit ?? filteredEvents.length;
    const selectedEvents = filteredEvents.slice(0, limit);
    const omittedEntryCount = Math.max(0, filteredEvents.length - selectedEvents.length);
    const auditEntries = selectedEvents.map((event) => ({
      artifactRefs: sortUniqueRefs(event.artifactRefs),
      ...(event.contextAnchor ? { contextAnchor: event.contextAnchor } : {}),
      eventId: event.eventId,
      eventType: event.eventType,
      evidenceRefs: sortUniqueRefs(event.evidenceRefs),
      inclusionReason: "event matched requested portfolio/program/project/audit filters",
      recordedAt: event.recordedAt
    }));
    const evidenceRefs = sortUniqueRefs(auditEntries.flatMap((entry) => entry.evidenceRefs));
    const matchedEvidenceRefs = await this.#repository.listEvidenceRefs(scope, evidenceRefs);
    const artifactRefs = sortUniqueRefs([
      ...auditEntries.flatMap((entry) => entry.artifactRefs),
      ...collectArtifactRefsFromEvidence(matchedEvidenceRefs)
    ]);
    const deterministicCore = {
      auditEntries,
      omittedEntryCount
    };

    return getProgramAuditTrailResultSchema.parse({
      schemaVersion: "1",
      status: omittedEntryCount > 0 ? "warning" : "ok",
      toolName: "get_program_audit_trail",
      portfolioId: request.portfolioId,
      ...(request.programId ? { programId: request.programId } : {}),
      ...(scope.projectIds.length > 0 ? { projectIds: scope.projectIds } : {}),
      deterministicCore,
      evidenceRefs,
      artifactRefs,
      redactionSummary: buildRedactionSummary({
        redacted: true,
        omittedKinds: ["audit_log_body"],
        policyRefs: DEFAULT_REDACTION_POLICY_REFS
      }),
      warnings:
        omittedEntryCount > 0
          ? [
              makeWarning(
                "audit-trail-bounded",
                "medium",
                `${omittedEntryCount} audit entries were omitted by the requested limit.`,
                evidenceRefs
              )
            ]
          : [],
      nextRecommendedTool: TOOL_NEXT_RECOMMENDATION.get_program_audit_trail,
      traceId: request.traceId,
      correlationId: request.correlationId,
      stateVersionHash: stateVersionHashFromInput({
        request: {
          eventTypes: request.eventTypes,
          limit: request.limit,
          portfolioId: request.portfolioId,
          programId: request.programId,
          projectIds: scope.projectIds,
          since: request.since,
          targetRefs: request.targetRefs,
          until: request.until,
          contextAnchor: request.contextAnchor
        },
        deterministicCore,
        evidenceRefs,
        artifactRefs
      })
    });
  }

  async queryProgramContext(requestInput: unknown, actor: ProgramToolActor) {
    const request = queryProgramContextRequestSchema.parse(requestInput);

    try {
      assertReadAuthorized(
        actor,
        {
          ...request,
          projectIds: inferScopedProjectIds({
            ...request,
            projectIds: request.projectIds,
            targetRefs: request.targetRefs
          })
        },
        this.#now()
      );
      await this.#adapterRegistry.assertNoMutationAuthority();
    } catch (error) {
      return queryProgramContextResultSchema.parse(
        this.#blockedEnvelope("query_program_context", request, error)
      );
    }

    const scope = {
      portfolioId: request.portfolioId,
      programId: request.programId,
      projectIds: inferScopedProjectIds({
        ...request,
        projectIds: request.projectIds,
        targetRefs: request.targetRefs
      })
    };
    const repoContextResult = await this.#repository.getProgramContext({
      scope,
      contextAnchor: request.contextAnchor,
      targetRefs: request.targetRefs,
      includeFutureNotApplicable: request.includeFutureNotApplicable,
      includeSuperseded: request.includeSuperseded,
      limit: request.limit
    });
    const repoContext = sanitizePointerPayload(repoContextResult);
    const manifests = this.#adapterRegistry
      .listManifests()
      .filter((manifest) =>
        (QUERY_KIND_DOMAINS[request.queryKind] ?? []).some((domain) =>
          manifest.capabilityDomains.includes(domain)
        )
      );
    const now = this.#now();
    const healths = await Promise.all(
      manifests.map((manifest) => this.#adapterRegistry.getHealth(manifest.adapterId, scope, now))
    );
    const healthByAdapterId = new Map(healths.map((health) => [health.adapterId, health]));
    const adapterReadAttempts = await Promise.all(
      manifests.map(async (manifest) => {
        const health = healthByAdapterId.get(manifest.adapterId);
        if (!health || isBlockingHealthStatus(health.status)) {
          return { adapterId: manifest.adapterId, health } as AdapterReadAttempt;
        }

        try {
          const result = await this.#adapterRegistry.readState(manifest.adapterId, {
            requestId: `${request.correlationId}:${manifest.adapterId}`,
            portfolioId: request.portfolioId,
            programId: request.programId,
            projectIds: scope.projectIds,
            targetRefs: request.targetRefs,
            limit: readLimitForHealth(request.limit, health.status),
            contextAnchor: request.contextAnchor
          }, now);
          return {
            adapterId: manifest.adapterId,
            health,
            result: sanitizePointerPayload(result)
          } as AdapterReadAttempt;
        } catch {
          return {
            adapterId: manifest.adapterId,
            health,
            errorSummary: makeWarning(
              `adapter-read-${manifest.adapterId}-error`,
              "high",
              `${manifest.adapterId} readState failed`,
              [`evidence://adapter-health/${manifest.adapterId}/unavailable`]
            )
          } as AdapterReadAttempt;
        }
      })
    );
    const adapterReadValues = adapterReadAttempts.filter(
      (attempt): attempt is AdapterReadAttempt & { result: SanitizedAdapterReadState } =>
        attempt.result !== undefined
    );
    const adapterReadErrors = adapterReadAttempts.filter(
      (attempt): attempt is AdapterReadAttempt => attempt.errorSummary !== undefined
    );
    const sanitizedAdapterReads = adapterReadValues.map((attempt) => attempt.result);
    const readWarnings = adapterReadValues
      .filter(({ result }) => result.value.truncated || result.value.omittedRefCount > 0)
      .map(({ result }) =>
        makeWarning(
          `adapter-read-${result.value.adapterId}-bounded`,
          "medium",
          `${result.value.adapterId} returned a bounded context window with ${result.value.omittedRefCount} omitted refs.`,
          result.value.evidenceRefs
        )
      );
    const errorWarnings = adapterReadErrors
      .map((attempt) => attempt.errorSummary)
      .filter((warning): warning is ToolWarning => warning !== undefined);
    const healthWarnings = healths
      .map((health) => summarizeHealthStatus(health))
      .filter((warning): warning is ToolWarning => Boolean(warning));
    const warnings = [
      ...healthWarnings,
      ...readWarnings,
      ...errorWarnings
    ];
    const adapterMatches = sanitizedAdapterReads.flatMap(({ value }) =>
      value.observations.map((observation) => ({
        ref: observation.ref,
        kind: observation.kind,
        status: observation.status,
        reason: observation.reason,
        recordedAt: value.observedAt,
        evidenceRefs: [...observation.evidenceRefs].sort((left, right) => left.localeCompare(right))
      }))
    );
    const combinedMatches = sortUnique(
      [...repoContext.value.matchedRefs, ...adapterMatches].map((item) =>
        JSON.stringify({
          ...item,
          evidenceRefs: [...item.evidenceRefs].sort((left, right) => left.localeCompare(right))
        })
      )
    )
      .map((item) => JSON.parse(item))
      .sort(compareMatchedRefs);
    const evidenceRefs = sortUnique([
      ...combinedMatches.flatMap((match) => match.evidenceRefs),
      ...sanitizedAdapterReads.flatMap(({ value }) => value.evidenceRefs),
      ...healths.map((health) => `evidence://adapter-health/${health.adapterId}/${health.status}`)
    ]);
    const decisionQueries = [
      this.#repository.listDecisions({
        scope,
        contextAnchor: request.contextAnchor,
        targetRefs: request.targetRefs
      })
    ];
    const paneContextAnchor = contextAnchorWithoutAsOf(request.contextAnchor);
    if (request.includeSuperseded !== false) {
      decisionQueries.push(
        this.#repository.listDecisions({
          scope,
          contextAnchor: paneContextAnchor,
          statuses: ["superseded", "discarded"],
          targetRefs: request.targetRefs
        })
      );
    }
    if (request.includeFutureNotApplicable !== false) {
      decisionQueries.push(
        this.#repository.listDecisions({
          scope,
          contextAnchor: paneContextAnchor,
          statuses: ["future_not_applicable"],
          targetRefs: request.targetRefs
        })
      );
    }
    const [matchedEvidenceRefs, relationships, decisionGroups] = await Promise.all([
      this.#repository.listEvidenceRefs(scope, evidenceRefs),
      this.#repository.listRelationships(scope),
      Promise.all(decisionQueries)
    ]);
    const decisions = uniqueDecisions(decisionGroups.flat());
    const resolvedArtifactRefs = await this.#repository.listArtifactRefs(
      scope,
      collectArtifactRefsFromEvidence(matchedEvidenceRefs)
    );
    const cursors = await this.#repository.getSyncCursors(scope);
    const redactionSummary = mergeRedactionSummaries(
      repoContext.redactionSummary,
      ...sanitizedAdapterReads.map((entry) => entry.redactionSummary)
    );
    const deterministicCore = {
      contextAnchor: {
        ...defaultContextAnchor(request),
        ...(repoContext.value.contextAnchor ?? {})
      },
      contextPanes: buildContextPanes({
        matchedRefs: combinedMatches,
        relationships,
        decisions,
        targetRefs: request.targetRefs,
        limit: request.limit
      }),
      matchedRefs: combinedMatches,
      omittedRefCount:
        repoContext.value.omittedRefCount +
        sanitizedAdapterReads.reduce((sum, result) => sum + result.value.omittedRefCount, 0)
    };
    const artifactRefs = sortUnique([
      ...resolvedArtifactRefs.map((artifactRef) => artifactRef.artifactRef),
      ...sanitizedAdapterReads.flatMap(({ value }) => value.artifactRefs),
      ...cursors.map((cursor) => pointerFromCursor(cursor.adapterId, cursor.cursor))
    ]);

    return queryProgramContextResultSchema.parse({
      schemaVersion: "1",
      status: warnings.length > 0 ? "warning" : "ok",
      toolName: "query_program_context",
      portfolioId: request.portfolioId,
      ...(request.programId ? { programId: request.programId } : {}),
      ...(scope.projectIds.length > 0 ? { projectIds: scope.projectIds } : {}),
      deterministicCore,
      evidenceRefs,
      artifactRefs,
      redactionSummary,
      warnings: warnings.sort(compareWarnings),
      nextRecommendedTool: TOOL_NEXT_RECOMMENDATION.query_program_context,
      traceId: request.traceId,
      correlationId: request.correlationId,
      stateVersionHash: stateVersionHashFromInput({
        request: {
          queryKind: request.queryKind,
          targetRefs: request.targetRefs,
          includeSuperseded: request.includeSuperseded ?? false,
          includeFutureNotApplicable: request.includeFutureNotApplicable ?? false,
          limit: request.limit,
          contextAnchor: request.contextAnchor,
          portfolioId: request.portfolioId,
          programId: request.programId,
          projectIds: scope.projectIds
        },
        deterministicCore,
        evidenceRefs,
        artifactRefs
      })
    });
  }

  async assessProgramImpact(requestInput: unknown, actor: ProgramToolActor) {
    const request = assessProgramImpactRequestSchema.parse(requestInput);

    try {
      assertReadAuthorized(
        actor,
        {
          ...request,
          projectIds: inferScopedProjectIds({
            ...request,
            projectIds: request.projectIds,
            targetRefs: request.targetRefs
          })
        },
        this.#now()
      );
      await this.#adapterRegistry.assertNoMutationAuthority();
    } catch (error) {
      return assessProgramImpactResultSchema.parse(
        this.#blockedEnvelope("assess_program_impact", request, error)
      );
    }

    const scope = {
      portfolioId: request.portfolioId,
      programId: request.programId,
      projectIds: inferScopedProjectIds({
        ...request,
        projectIds: request.projectIds,
        targetRefs: request.targetRefs
      })
    };
    const repoImpactResult = await this.#repository.assessImpact({
      scope,
      changeRef: request.changeRef,
      changeKind: request.changeKind,
      targetRefs: request.targetRefs,
      traversalBudgetRef: request.traversalBudgetRef,
      contextAnchor: request.contextAnchor
    });
    const repoImpact = sanitizePointerPayload(repoImpactResult);
    const manifests = this.#adapterRegistry.listManifests();
    const now = this.#now();
    const healths = await Promise.all(
      manifests.map((manifest) => this.#adapterRegistry.getHealth(manifest.adapterId, scope, now))
    );
    const healthByAdapterId = new Map(healths.map((health) => [health.adapterId, health]));
    const adapterImpactAttempts = await Promise.all(
      manifests.map(async (manifest) => {
        const health = healthByAdapterId.get(manifest.adapterId);
        if (!health || isBlockingHealthStatus(health.status)) {
          return { adapterId: manifest.adapterId, health } as AdapterImpactAttempt;
        }

        try {
          const result = await this.#adapterRegistry.assessImpact(
            manifest.adapterId,
            {
              requestId: `${request.correlationId}:${manifest.adapterId}`,
              portfolioId: request.portfolioId,
              programId: request.programId,
              changeRef: request.changeRef,
              changeKind: request.changeKind,
              targetRefs: request.targetRefs,
              traversalBudgetRef: request.traversalBudgetRef,
              contextAnchor: request.contextAnchor
            },
            now
          );
          return {
            adapterId: manifest.adapterId,
            health,
            result: sanitizePointerPayload(result)
          } as AdapterImpactAttempt;
        } catch {
          return {
            adapterId: manifest.adapterId,
            health,
            errorSummary: makeWarning(
              `adapter-impact-${manifest.adapterId}-error`,
              "high",
              `${manifest.adapterId} assessImpact failed`,
              [`evidence://adapter-health/${manifest.adapterId}/unavailable`]
            )
          } as AdapterImpactAttempt;
        }
      })
    );
    const adapterImpactValues = adapterImpactAttempts.filter(
      (attempt): attempt is AdapterImpactAttempt & { result: SanitizedAdapterImpactState } =>
        attempt.result !== undefined
    );
    const adapterImpactErrors = adapterImpactAttempts.filter(
      (attempt): attempt is AdapterImpactAttempt => attempt.errorSummary !== undefined
    );
    const sanitizedAdapterImpacts = adapterImpactValues.map((attempt) => {
      const cap = attempt.health.status === "degraded" ? 1 : Number.MAX_SAFE_INTEGER;
      return {
        ...attempt.result,
        value: {
          ...attempt.result.value,
          affectedRefs: capFindingsForHealth(attempt.result.value.affectedRefs, attempt.health.status, cap),
          findings: capFindingsForHealth(attempt.result.value.findings, attempt.health.status, cap)
        }
      } as SanitizedAdapterImpactState;
    });
    const affectedRefs = sortUnique(
      [
        ...repoImpact.value.affectedRefs,
        ...sanitizedAdapterImpacts.flatMap(({ value }) => value.affectedRefs)
      ].map((item) => JSON.stringify(item))
    )
      .map((item) => JSON.parse(item))
      .sort(compareAffectedRefs);
    const findings = sortUnique(
      [
        ...repoImpact.value.findings,
        ...sanitizedAdapterImpacts.flatMap(({ value }) => value.findings)
      ].map((item) =>
        JSON.stringify({
          ...item,
          evidenceRefs: [...item.evidenceRefs].sort((left, right) => left.localeCompare(right))
        })
      )
    )
      .map((item) => JSON.parse(item))
      .sort(compareFindings);
    const evidenceRefs = sortUnique([
      ...findings.flatMap((finding) => finding.evidenceRefs),
      ...sanitizedAdapterImpacts.flatMap(({ value }) => value.evidenceRefs),
      ...healths.map((health) => `evidence://adapter-health/${health.adapterId}/${health.status}`)
    ]);
    const matchedEvidenceRefs = await this.#repository.listEvidenceRefs(scope, evidenceRefs);
    const resolvedArtifactRefs = await this.#repository.listArtifactRefs(
      scope,
      collectArtifactRefsFromEvidence(matchedEvidenceRefs)
    );
    const adapterCursors = await Promise.all(
      manifests.map((manifest) => this.#adapterRegistry.getSourceCursor(manifest.adapterId, scope))
    );
    const healthWarnings = healths
      .map((health) => summarizeHealthStatus(health))
      .filter((warning): warning is ToolWarning => Boolean(warning));
    const impactWarnings = sanitizedAdapterImpacts
      .filter(({ value }) => value.status !== "ok")
      .map(({ value }) =>
        makeWarning(
          `adapter-impact-${value.adapterId}-${value.status}`,
          value.status === "blocked" ? "high" : "medium",
          `${value.adapterId} reported ${value.status} impact status.`,
          value.evidenceRefs
        )
      );
    const errorWarnings = adapterImpactErrors
      .map((attempt) => attempt.errorSummary)
      .filter((warning): warning is ToolWarning => warning !== undefined);
    const warnings = [
      ...healthWarnings,
      ...impactWarnings,
      ...errorWarnings
    ].sort(compareWarnings);
    const redactionSummary = mergeRedactionSummaries(
      repoImpact.redactionSummary,
      ...sanitizedAdapterImpacts.map((entry) => entry.redactionSummary)
    );
    const deterministicCore = {
      changeRef: request.changeRef,
      affectedRefs,
      findings,
      requiredApprovals: repoImpact.value.requiredApprovals.map((approval) => ({
        ...approval,
        evidencePolicyRefs: [...approval.evidencePolicyRefs].sort((left, right) =>
          left.localeCompare(right)
        )
      })),
      evidenceObligations: [...repoImpact.value.evidenceObligations].sort((left, right) =>
        left.policyRef.localeCompare(right.policyRef) || left.targetRef.localeCompare(right.targetRef)
      )
    };
    const artifactRefs = sortUnique([
      ...resolvedArtifactRefs.map((artifactRef) => artifactRef.artifactRef),
      ...sanitizedAdapterImpacts.flatMap(({ value }) => value.artifactRefs),
      ...adapterCursors.map((cursor) => pointerFromCursor(cursor.adapterId, cursor.cursor))
    ]);
    const status = statusFromValues([
      warnings.length > 0 ? "warning" : "ok",
      ...healths.map((health) => (health.status === "healthy" ? "ok" : "warning")),
      ...adapterImpactValues.map((impact) => impact.result.value.status)
    ]);

    return assessProgramImpactResultSchema.parse({
      schemaVersion: "1",
      status,
      toolName: "assess_program_impact",
      portfolioId: request.portfolioId,
      ...(request.programId ? { programId: request.programId } : {}),
      ...(scope.projectIds.length > 0 ? { projectIds: scope.projectIds } : {}),
      deterministicCore,
      evidenceRefs,
      artifactRefs,
      redactionSummary,
      warnings,
      nextRecommendedTool: TOOL_NEXT_RECOMMENDATION.assess_program_impact,
      traceId: request.traceId,
      correlationId: request.correlationId,
      stateVersionHash: stateVersionHashFromInput({
        request: {
          portfolioId: request.portfolioId,
          programId: request.programId,
          projectIds: scope.projectIds,
          changeRef: request.changeRef,
          changeKind: request.changeKind,
          targetRefs: request.targetRefs,
          traversalBudgetRef: request.traversalBudgetRef,
          contextAnchor: request.contextAnchor
        },
        deterministicCore,
        evidenceRefs,
        artifactRefs
      })
    });
  }

  #blockedEnvelope(
    toolName: ToolName,
    request: {
      portfolioId: string;
      programId?: string;
      projectIds?: string[];
      traceId: string;
      correlationId: string;
      action?: string;
    },
    error: unknown
  ) {
    const authzError =
      error instanceof ProgramToolAuthzError
        ? error
        : new ProgramToolAuthzError(
            error instanceof Error ? error.message : "Authorization failed.",
            ["policy://authz/server-verified-actor-v1"],
            ["evidence://authz/server-verified-actor/current"]
          );
    const requiredAuthority = "authority://pmo/domain-omni-tool-write";
    const safeNextActions = [
      "Call pmo_help for the current authority model.",
      "Retry with a human_operator or program_manager_agent actor that has the required portfolio grant.",
      "Use list actions only when write authority is unavailable."
    ];
    const authzRepairGuidance = {
      requiredAuthority,
      eligibleActors: PMO_OMNI_WRITE_ACTOR_ROLES,
      safeNextActions,
      correctForm: buildPmoHelpForm(request),
      fieldGuidance: [
        "The payload may be structurally valid, but the actor lacks authority for this operation.",
        "Retry with an eligible actor role and required portfolio/project grant, or use a read-only/list action.",
        "Call pmo_help to refresh current authority and setup guidance."
      ],
      help: buildPmoHelpForm(request)
    };
    const deterministicCore =
      toolName === "manage_projects"
        ? {
            action:
              request.action && MANAGE_PROJECT_ACTIONS.includes(request.action as (typeof MANAGE_PROJECT_ACTIONS)[number])
                ? request.action
                : "list",
            managedRefs: [],
            programs: [],
            projects: [],
            guidance: buildOmniGuidance({
              allowedActions: [...MANAGE_PROJECT_ACTIONS],
              ...authzRepairGuidance
            })
          }
        : toolName === "manage_integrations"
          ? {
              action: request.action && allowedIntegrationActionsForState(undefined).includes(request.action as (typeof MANAGE_INTEGRATION_ACTIONS)[number])
                ? request.action
                : "list",
              integrationPoints: [],
              managedRefs: [],
              guidance: buildOmniGuidance({
                allowedActions: [...MANAGE_INTEGRATION_ACTIONS],
                ...authzRepairGuidance
              })
            }
          : toolName === "manage_evidence_items"
            ? {
                action:
                  request.action && MANAGE_EVIDENCE_ACTIONS.includes(request.action as (typeof MANAGE_EVIDENCE_ACTIONS)[number])
                    ? request.action
                    : "list",
                artifactRecords: [],
                evidenceRecords: [],
                managedRefs: [],
                guidance: buildOmniGuidance({
                  allowedActions: [...MANAGE_EVIDENCE_ACTIONS],
                  ...authzRepairGuidance
                })
              }
          : toolName === "pmo_macro"
            ? {
                action: request.action ?? "help",
                objectModelRefs: [],
                registryVersion: "1.0.0",
                guidance: buildOmniGuidance({
                  allowedActions: ["help", "list", "describe", "validate", "invoke", "edit_registry"],
                  ...authzRepairGuidance
                })
              }
          : undefined;

    return {
      schemaVersion: "1",
      status: "blocked" as const,
      toolName,
      portfolioId: request.portfolioId,
      ...(request.programId ? { programId: request.programId } : {}),
      ...(request.projectIds ? { projectIds: request.projectIds } : {}),
      evidenceRefs: authzError.evidenceRefs,
      artifactRefs: [],
      redactionSummary: buildRedactionSummary({
        policyRefs: authzError.policyRefs
      }),
      warnings: [
        makeWarning("authz-denied", "high", authzError.message, authzError.evidenceRefs)
      ],
      ...(deterministicCore ? { deterministicCore } : {}),
      nextRecommendedTool:
        toolName === "manage_projects" || toolName === "manage_integrations"
          ? "pmo_help"
          : "get_program_documentation",
      traceId: request.traceId,
      correlationId: request.correlationId
    };
  }
}
