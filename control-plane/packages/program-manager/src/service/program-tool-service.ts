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
  planProgramActionRequestSchema,
  planProgramActionResultSchema,
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
import type { ProgramManagerRepository } from "../repository/program-manager-repository.js";
import type {
  ContextAnchor,
  DecisionRecord,
  ExpectedReceipt,
  GraphRelationship,
  ActionLedgerEntry,
  ObservedReceipt,
  ProgramEvent,
  ProgramIntelligenceRecord,
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
};

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

export class ProgramToolService {
  #adapterRegistry: ProgramToolServiceDependencies["adapterRegistry"];
  #documentationCatalog: DocumentationCatalog;
  #now: () => string;
  #repository: ProgramManagerRepository;

  constructor(dependencies: ProgramToolServiceDependencies) {
    this.#adapterRegistry = dependencies.adapterRegistry;
    this.#documentationCatalog = dependencies.documentationCatalog ?? DOCUMENTATION_CATALOG;
    this.#now = dependencies.now ?? (() => "2026-05-03T12:00:00Z");
    this.#repository = dependencies.repository;
  }

  async pmoMacro(requestInput: unknown, actor: ProgramToolActor) {
    const fallback = requestInput && typeof requestInput === "object" ? requestInput as Record<string, unknown> : {};
    const parsed = pmoMacroRequestSchema.safeParse(requestInput);
    if (!parsed.success) {
      const deterministicCore = {
        action: "validate" as const,
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

    const currentRegistry =
      (await this.#repository.getMacroRegistry({ portfolioId: request.portfolioId })) ??
      createBuiltInMacroRegistry(request.portfolioId, this.#now());
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
        ...facts.dependencyEdges.map((edge) => edge.dependencyRef),
        ...facts.runbooks.map((runbook) => runbook.runbookRef)
      ]);
      const deterministicCore = {
        ...baseCore,
        macro: requestedMacro,
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
      ]).slice(0, 8);
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
      const [facts, ledger, cursors] = await Promise.all([
        this.#repository.listMacroFacts({ scope, contextAnchor: request.contextAnchor, targetRefs, limit: 24 }),
        this.#repository.listReceiptLedger({ scope, limit: 24 }),
        this.#repository.getSyncCursors(scope)
      ]);
      const unevidencedRefs = sortUniqueRefs([
        ...facts.tasks.filter((fact) => fact.evidenceStatus !== "supported").map((fact) => fact.taskRef),
        ...facts.blockers.filter((fact) => fact.evidenceStatus !== "supported").map((fact) => fact.blockerRef),
        ...facts.contracts.filter((fact) => fact.evidenceStatus !== "supported").map((fact) => fact.contractRef),
        ...facts.dependencyEdges.filter((fact) => fact.evidenceStatus !== "supported").map((fact) => fact.dependencyRef),
        ...facts.runbooks.filter((fact) => fact.evidenceStatus !== "supported").map((fact) => fact.runbookRef)
      ]);
      const reconcileRefs = ledger.reconcileStatuses
        .filter((status) => !["satisfied", "expected", "in_flight"].includes(status.status))
        .map((status) => `finding://pmo/reconcile/${encodeURIComponent(status.receiptRequirementId)}`);
      const cursorRefs = cursors.map((cursor) => `cursor://${encodeURIComponent(cursor.adapterId)}/${encodeURIComponent(cursor.cursor)}`);
      const remediationRefs = unevidencedRefs.map((ref) => `action://pmo/remediate-drift/${encodeURIComponent(ref)}`);
      const objectModelRefs = sortUniqueRefs([
        ...targetRefs,
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
    const deterministicCore = {
      ...baseCore,
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
      nextRecommendedTool: request.action === "help" ? "pmo_macro" : "get_program_documentation",
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
      governance,
      ...receiptRequest
    } = request;

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
    const [matchedEvidenceRefs, relationships, decisions] = await Promise.all([
      this.#repository.listEvidenceRefs(scope, evidenceRefs),
      this.#repository.listRelationships(scope),
      this.#repository.listDecisions({
        scope,
        contextAnchor: request.contextAnchor,
        targetRefs: request.targetRefs
      })
    ]);
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
      nextRecommendedTool: "get_program_documentation",
      traceId: request.traceId,
      correlationId: request.correlationId
    };
  }
}
