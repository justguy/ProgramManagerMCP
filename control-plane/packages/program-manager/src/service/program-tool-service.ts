import {
  assessProgramImpactRequestSchema,
  assessProgramImpactResultSchema,
  getProgramDocumentationRequestSchema,
  getProgramDocumentationResultSchema,
  listProgramCapabilitiesRequestSchema,
  listProgramCapabilitiesResultSchema,
  queryProgramContextRequestSchema,
  queryProgramContextResultSchema
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
import { stateVersionHashFromInput } from "../hash/state-version-hash.js";
import {
  assertReadAuthorized,
  inferScopedProjectIds,
  ProgramToolAuthzError,
  type ProgramToolActor
} from "../authz/program-tool-authz.ts";
import {
  buildRedactionSummary,
  DEFAULT_REDACTION_POLICY_REFS,
  mergeRedactionSummaries,
  sanitizePointerPayload
} from "../redaction/program-tool-redaction.ts";

type ToolName =
  | "list_program_capabilities"
  | "get_program_documentation"
  | "query_program_context"
  | "assess_program_impact";

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

type DocumentationCatalog = Record<string, DocumentationSection[]>;

type ProgramToolServiceDependencies = {
  adapterRegistry: {
    assertNoMutationAuthority(): Promise<void>;
    assessImpact(adapterId: string, request: Record<string, unknown>): Promise<AdapterImpactResult>;
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
    readState(adapterId: string, request: Record<string, unknown>): Promise<AdapterReadStateResult>;
  };
  repository: ProgramManagerRepository;
  now?: () => string;
  documentationCatalog?: DocumentationCatalog;
};

const TOOL_NEXT_RECOMMENDATION: Record<ToolName, ToolName> = {
  list_program_capabilities: "get_program_documentation",
  get_program_documentation: "query_program_context",
  query_program_context: "assess_program_impact",
  assess_program_impact: "query_program_context"
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

function compareCapabilities(
  left: { capabilityId: string },
  right: { capabilityId: string }
): number {
  return left.capabilityId.localeCompare(right.capabilityId);
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

function defaultContextAnchor(request: {
  portfolioId: string;
  programId?: string;
  projectIds?: string[];
  contextAnchor?: Record<string, unknown>;
}) {
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
    const adapterReads = await Promise.all(
      manifests.map((manifest) =>
        this.#adapterRegistry.readState(manifest.adapterId, {
          requestId: `${request.correlationId}:${manifest.adapterId}`,
          portfolioId: request.portfolioId,
          programId: request.programId,
          projectIds: scope.projectIds,
          targetRefs: request.targetRefs,
          limit: request.limit,
          contextAnchor: request.contextAnchor
        })
      )
    );
    const sanitizedAdapterReads = adapterReads.map((result) => sanitizePointerPayload(result));
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
      ...sanitizedAdapterReads.flatMap(({ value }) => value.evidenceRefs)
    ]);
    const matchedEvidenceRefs = await this.#repository.listEvidenceRefs(scope, evidenceRefs);
    const resolvedArtifactRefs = await this.#repository.listArtifactRefs(
      scope,
      collectArtifactRefsFromEvidence(matchedEvidenceRefs)
    );
    const cursors = await this.#repository.getSyncCursors(scope);
    const redactionSummary = mergeRedactionSummaries(
      repoContext.redactionSummary,
      ...sanitizedAdapterReads.map((entry) => entry.redactionSummary),
      ...adapterReads.map((entry) => entry.redactionSummary)
    );
    const warnings = sanitizedAdapterReads
      .filter(({ value }) => value.truncated || value.omittedRefCount > 0)
      .map(({ value }) =>
        makeWarning(
          `adapter-read-${value.adapterId}-bounded`,
          "medium",
          `${value.adapterId} returned a bounded context window with ${value.omittedRefCount} omitted refs.`,
          value.evidenceRefs
        )
      )
      .sort(compareWarnings);
    const deterministicCore = {
      contextAnchor: {
        ...defaultContextAnchor(request),
        ...(repoContext.value.contextAnchor ?? {})
      },
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
      warnings,
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
    const adapterImpacts = await Promise.all(
      manifests.map((manifest) =>
        this.#adapterRegistry.assessImpact(manifest.adapterId, {
          requestId: `${request.correlationId}:${manifest.adapterId}`,
          portfolioId: request.portfolioId,
          programId: request.programId,
          changeRef: request.changeRef,
          changeKind: request.changeKind,
          targetRefs: request.targetRefs,
          traversalBudgetRef: request.traversalBudgetRef,
          contextAnchor: request.contextAnchor
        })
      )
    );
    const sanitizedAdapterImpacts = adapterImpacts.map((result) => sanitizePointerPayload(result));
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
      ...sanitizedAdapterImpacts.flatMap(({ value }) => value.evidenceRefs)
    ]);
    const matchedEvidenceRefs = await this.#repository.listEvidenceRefs(scope, evidenceRefs);
    const resolvedArtifactRefs = await this.#repository.listArtifactRefs(
      scope,
      collectArtifactRefsFromEvidence(matchedEvidenceRefs)
    );
    const adapterCursors = await Promise.all(
      manifests.map((manifest) => this.#adapterRegistry.getSourceCursor(manifest.adapterId, scope))
    );
    const warnings = sanitizedAdapterImpacts
      .filter(({ value }) => value.status !== "ok")
      .map(({ value }) =>
        makeWarning(
          `adapter-impact-${value.adapterId}-${value.status}`,
          value.status === "blocked" ? "high" : "medium",
          `${value.adapterId} reported ${value.status} impact status.`,
          value.evidenceRefs
        )
      )
      .sort(compareWarnings);
    const redactionSummary = mergeRedactionSummaries(
      repoImpact.redactionSummary,
      ...adapterImpacts.map((entry) => entry.redactionSummary),
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
      ...adapterImpacts.map((impact) => impact.status)
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
