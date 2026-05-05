import {
  analyzeProgramIntelligenceRequestSchema,
  assessProgramImpactRequestSchema,
  generateProgramUpdateRequestSchema,
  getAgenticOsContextPacketRequestSchema,
  getProgramAuditTrailRequestSchema,
  getProgramDocumentationRequestSchema,
  listProgramCapabilitiesRequestSchema,
  manageEvidenceItemsRequestSchema,
  manageIntegrationsRequestSchema,
  manageProjectsRequestSchema,
  planProgramActionRequestSchema,
  pmoHelpRequestSchema,
  pmoMacroRequestSchema,
  queryProgramContextRequestSchema,
  recordProgramReceiptRequestSchema,
  reconcileProgramStateRequestSchema,
  submitAgenticOsReceiptRequestSchema
} from "../../../../../shared/schemas/program-manager.ts";
import { ZodError } from "zod";
import type { ProgramToolActor } from "../authz/program-tool-authz.ts";
import { normalizePmoToolInput } from "../normalization/program-manager-normalization.ts";
import { ProgramToolService, buildPmoOmniToolContract } from "../service/program-tool-service.ts";

export const PROGRAM_MANAGER_MCP_TOOLS = Object.freeze([
  {
    name: "pmo_help",
    description:
      "Bootstrap help for autonomous agents: returns the PMO operating guide, shared knowledge authority, canonical scope, recommended next calls, and receipt path.",
    requestSchema: pmoHelpRequestSchema
  },
  {
    name: "pmo_macro",
    description:
      "PMO macro dispatcher for discovery, validation, invocation, object docs, registry export, and safe registry edits.",
    requestSchema: pmoMacroRequestSchema
  },
  {
    name: "manage_projects",
    description:
      "Manage PMO-owned shared program and project records: list existing scope or upsert programs/projects before scoped work begins.",
    requestSchema: manageProjectsRequestSchema
  },
  {
    name: "manage_integrations",
    description:
      "Manage PMO-owned shared integration lifecycle records and optional pointer-only value context: contracts, dependencies, gaps, blockers, decisions, responses, learnings, tracker refs, inbox, catch_up, retire, and delete.",
    requestSchema: manageIntegrationsRequestSchema
  },
  {
    name: "manage_evidence_items",
    description:
      "Manage PMO-owned pointer-only evidence and artifact registry records: help, list, get, register, update, classify, retention, and attachments.",
    requestSchema: manageEvidenceItemsRequestSchema
  },
  /*
   * Legacy compatibility contracts remain callable for existing clients and tests, but the listed
   * public PMO surface is pmo_help, manage_projects, manage_integrations, manage_evidence_items,
   * and the single pmo_macro
   * macro dispatcher.
   */
  {
    name: "list_program_capabilities",
    description: "List the public PMO capability surface without exposing downstream mutation methods.",
    requestSchema: listProgramCapabilitiesRequestSchema
  },
  {
    name: "get_program_documentation",
    description: "Return concise PMO documentation summaries, schema refs, authz rules, and evidence rules.",
    requestSchema: getProgramDocumentationRequestSchema
  },
  {
    name: "query_program_context",
    description: "Read bounded PMO program context with redacted pointer-only results.",
    requestSchema: queryProgramContextRequestSchema
  },
  {
    name: "assess_program_impact",
    description: "Run read-only impact assessment with evidence, approval, and provenance context.",
    requestSchema: assessProgramImpactRequestSchema
  },
  {
    name: "generate_program_update",
    description: "Generate reproducible PMO alignment/update report artifacts.",
    requestSchema: generateProgramUpdateRequestSchema
  },
  {
    name: "get_program_audit_trail",
    description: "Return filtered, redaction-safe PMO audit entries and evidence refs.",
    requestSchema: getProgramAuditTrailRequestSchema
  },
  {
    name: "analyze_program_intelligence",
    description: "Return deterministic evidence-backed PMO intelligence cards without downstream mutation.",
    requestSchema: analyzeProgramIntelligenceRequestSchema
  },
  {
    name: "plan_program_action",
    description:
      "Create a deterministic proposal-only PMO flight plan with approval, evidence, receipt, TTL, and loop-suppression obligations.",
    requestSchema: planProgramActionRequestSchema
  },
  {
    name: "record_program_receipt",
    description:
      "Record and validate a PMO receipt against an expected flight-plan receipt obligation without downstream mutation.",
    requestSchema: recordProgramReceiptRequestSchema
  },
  {
    name: "reconcile_program_state",
    description:
      "Compare expected receipts, observed receipts, and adapter state to surface PMO reconciliation findings.",
    requestSchema: reconcileProgramStateRequestSchema
  },
  {
    name: "get_agentic_os_context_packet",
    description:
      "Return a bounded Agentic OS work context packet that composes PMO context, cp-graph refs, and optional proposal-only flight-plan receipt obligations.",
    requestSchema: getAgenticOsContextPacketRequestSchema
  },
  {
    name: "submit_agentic_os_receipt",
    description:
      "Submit an Agentic OS execution-agent receipt through the PMO receipt ledger while preserving the passive analyst boundary.",
    requestSchema: submitAgenticOsReceiptRequestSchema
  }
] as const);

export class ProgramManagerMcpGateway {
  #service: ProgramToolService;

  constructor(service: ProgramToolService) {
    this.#service = service;
  }

  listTools() {
    const publicToolOrder = ["pmo_help", "manage_projects", "manage_integrations", "manage_evidence_items", "pmo_macro"];
    return publicToolOrder.map((toolName) => {
      const tool = PROGRAM_MANAGER_MCP_TOOLS.find((candidate) => candidate.name === toolName);
      if (!tool) {
        throw new Error(`Missing PMO MCP tool definition: ${toolName}`);
      }
      return {
        name: tool.name,
        description: tool.description
      };
    });
  }

  async callTool(toolName: string, request: unknown, actor: ProgramToolActor) {
    const normalizedRequest = normalizePmoToolInput(request);
    try {
      switch (toolName) {
        case "pmo_help":
          return await this.#service.pmoHelp(normalizedRequest, actor);
        case "manage_projects":
          return await this.#service.manageProjects(normalizedRequest, actor);
        case "manage_integrations":
          return await this.#service.manageIntegrations(normalizedRequest, actor);
        case "manage_evidence_items":
          return await this.#service.manageEvidenceItems(normalizedRequest, actor);
        case "pmo_macro":
          return await this.#service.pmoMacro(normalizedRequest, actor);
        case "list_program_capabilities":
          return await this.#service.listProgramCapabilities(normalizedRequest, actor);
        case "get_program_documentation":
          return await this.#service.getProgramDocumentation(normalizedRequest, actor);
        case "query_program_context":
          return await this.#service.queryProgramContext(normalizedRequest, actor);
        case "assess_program_impact":
          return await this.#service.assessProgramImpact(normalizedRequest, actor);
        case "generate_program_update":
          return await this.#service.generateProgramUpdate(normalizedRequest, actor);
        case "get_program_audit_trail":
          return await this.#service.getProgramAuditTrail(normalizedRequest, actor);
        case "analyze_program_intelligence":
          return await this.#service.analyzeProgramIntelligence(normalizedRequest, actor);
        case "plan_program_action":
          return await this.#service.planProgramAction(normalizedRequest, actor);
        case "record_program_receipt":
          return await this.#service.recordProgramReceipt(normalizedRequest, actor);
        case "reconcile_program_state":
          return await this.#service.reconcileProgramState(normalizedRequest, actor);
        case "get_agentic_os_context_packet":
          return await this.#service.getAgenticOsContextPacket(normalizedRequest, actor);
        case "submit_agentic_os_receipt":
          return await this.#service.submitAgenticOsReceipt(normalizedRequest, actor);
        default:
          throw new Error(`Unsupported PMO MCP tool: ${toolName}`);
      }
    } catch (error) {
      if (isZodError(error)) {
        return this.#validationGuidance(toolName, normalizedRequest, error, actor);
      }
      throw error;
    }
  }

  async #validationGuidance(
    toolName: string,
    request: unknown,
    error: ZodError,
    actor: ProgramToolActor
  ) {
    const input = isRecord(request) ? request : {};
    const portfolioId =
      typeof input.portfolioId === "string" ? input.portfolioId : actor.portfolioGrants[0] ?? "portfolio://default";
    const traceId =
      typeof input.traceId === "string" ? input.traceId : `trace://pmo-guidance/${toolName}`;
    const correlationId =
      typeof input.correlationId === "string" ? input.correlationId : `corr://pmo-guidance/${toolName}`;
    const programsAndProjects = await this.#safeProgramProjectList(portfolioId, traceId, correlationId, actor);
    const integrationCandidates =
      toolName === "manage_integrations"
        ? await this.#safeIntegrationList(portfolioId, traceId, correlationId, actor)
        : [];
    const issues = error.issues.map((issue) => ({
      path: issue.path.join(".") || "<root>",
      message: issue.message
    }));
    const correction = correctionForToolInput(toolName, input, portfolioId, traceId, correlationId);

    return {
      schemaVersion: "1",
      status: "blocked",
      toolName,
      portfolioId,
      evidenceRefs: ["evidence://pmo/tool-validation/current"],
      artifactRefs: [],
      redactionSummary: {
        omittedKinds: [],
        policyRefs: ["policy://redaction/pointer-only-v1"],
        redacted: false
      },
      warnings: [
        {
          warningId: "tool-input-guidance",
          severity: "high",
          summary: "Tool input is missing required data or contains invalid values. Use deterministicCore.guidance before retrying.",
          evidenceRefs: ["evidence://pmo/tool-validation/current"]
        }
      ],
      deterministicCore: {
        guidance: {
          omniToolContract: buildPmoOmniToolContract(),
          allowedActions: allowedActionsForTool(toolName),
          issues,
          correctionSummary: correction.summary,
          fieldGuidance: correction.fieldGuidance,
          correctForm: correction.correctForm,
          help: correction.help,
          relevantPrograms: programsAndProjects.programs,
          relevantProjects: programsAndProjects.projects,
          knownIntegrationRefs: integrationCandidates.map(
            (integration) => integration.integrationPointId
          ),
          retryExamples: [
            ...(correction.retryExamples ?? []),
            ...retryExamplesForTool(toolName, portfolioId, traceId, correlationId)
          ]
        }
      },
      nextRecommendedTool: toolName === "pmo_help" ? "pmo_help" : toolName,
      traceId,
      correlationId
    };
  }

  async #safeProgramProjectList(
    portfolioId: string,
    traceId: string,
    correlationId: string,
    actor: ProgramToolActor
  ): Promise<{ programs: unknown[]; projects: unknown[] }> {
    try {
      const result = await this.#service.manageProjects(
        {
          action: "list",
          portfolioId,
          traceId,
          correlationId: `${correlationId}/scope-list`
        },
        actor
      );
      return {
        programs: result.deterministicCore?.programs ?? [],
        projects: result.deterministicCore?.projects ?? []
      };
    } catch {
      return { programs: [], projects: [] };
    }
  }

  async #safeIntegrationList(
    portfolioId: string,
    traceId: string,
    correlationId: string,
    actor: ProgramToolActor
  ): Promise<Array<{ integrationPointId: string }>> {
    try {
      const result = await this.#service.manageIntegrations(
        {
          action: "list",
          portfolioId,
          traceId,
          correlationId: `${correlationId}/integration-list`
        },
        actor
      );
      return result.deterministicCore?.integrationPoints ?? [];
    } catch {
      return [];
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isZodError(value: unknown): value is ZodError {
  return value instanceof ZodError || Boolean(isRecord(value) && Array.isArray(value.issues));
}

function correctionForToolInput(
  toolName: string,
  input: Record<string, unknown>,
  portfolioId: string,
  traceId: string,
  correlationId: string
) {
  const help = {
    toolName: "pmo_help",
    arguments: {
      portfolioId,
      traceId,
      correlationId: `${correlationId}/help`
    }
  };

  if (toolName === "manage_integrations") {
    return manageIntegrationsCorrection(input, portfolioId, traceId, correlationId, help);
  }
  if (toolName === "manage_projects") {
    return manageProjectsCorrection(input, portfolioId, traceId, correlationId, help);
  }
  if (toolName === "manage_evidence_items") {
    return manageEvidenceItemsCorrection(input, portfolioId, traceId, correlationId, help);
  }

  const retryExample = retryExamplesForTool(toolName, portfolioId, traceId, correlationId)[0];
  return {
    summary:
      "Retry with the shown correctForm or one of retryExamples. Do not inspect source files for schema details; the rejection envelope is the repair contract.",
    fieldGuidance: [
      "Keep pointer-only refs in documented fields only.",
      "Use deterministicCore.guidance.issues to identify the rejected field path.",
      "Null optional fields are treated as unknown/not asserted and ignored. Provide a real pointer or value when that metadata is important.",
      "Use deterministicCore.guidance.help to refresh current PMO tool guidance when in doubt."
    ],
    correctForm: retryExample
      ? { toolName, arguments: retryExample.arguments }
      : help,
    help,
    retryExamples: []
  };
}

function manageProjectsCorrection(
  input: Record<string, unknown>,
  portfolioId: string,
  traceId: string,
  correlationId: string,
  help: { toolName: string; arguments: Record<string, unknown> }
) {
  const action = stringValue(input.action) ?? "list";
  const program = recordValue(input.program);
  const project = recordValue(input.project);
  const programId =
    stringValue(program?.programId) ??
    stringValue(project?.programId) ??
    stringValue(input.programId) ??
    "program://<program-slug>";
  const projectId = stringValue(project?.projectId) ?? "project://<project-slug>";
  const correctedAction = allowedActionsForTool("manage_projects").includes(action) ? action : "list";
  const argumentsForAction =
    correctedAction === "list"
      ? {
          action: "list",
          portfolioId,
          traceId,
          correlationId
        }
      : {
          action: correctedAction,
          portfolioId,
          programId,
          traceId,
          correlationId,
          ...(correctedAction === "get" || correctedAction === "retire"
            ? {
                program: { programId },
                project: { projectId }
              }
            : {
                program: {
                  programId,
                  name: stringValue(program?.name) ?? "<Program name>"
                },
                project: {
                  programId,
                  projectId,
                  name: stringValue(project?.name) ?? "<Project name>"
                }
              })
        };

  return {
    summary:
      "manage_projects rejected the payload shape. Retry with correctForm, keeping program fields under program and project fields under project.",
    fieldGuidance: [
      "Required common fields: action, portfolioId, traceId, correlationId.",
      "Program metadata belongs under program.",
      "Project metadata belongs under project.",
      "Null optional metadata means unknown/not asserted and is ignored. Send trackerRef, repoRef, adapterRef, goal, status, projectRole, or name only when you have the real value.",
      "For create/upsert, include program.name or project.name for new records."
    ],
    correctForm: {
      toolName: "manage_projects",
      arguments: argumentsForAction
    },
    help,
    retryExamples: [
      {
        purpose: `Retry manage_projects ${correctedAction} with the accepted payload shape.`,
        toolName: "manage_projects",
        arguments: argumentsForAction
      }
    ]
  };
}

function manageIntegrationsCorrection(
  input: Record<string, unknown>,
  portfolioId: string,
  traceId: string,
  correlationId: string,
  help: { toolName: string; arguments: Record<string, unknown> }
) {
  const integration = recordValue(input.integration);
  const item = recordValue(integration?.item);
  const action = stringValue(input.action);
  const programId = stringValue(input.programId);
  const integrationPointId =
    stringValue(integration?.integrationPointId) ?? "integration://<integration-slug>";
  const evidenceRefs = stringArrayValue(input.evidenceRefs);
  const misplacedArtifactRefs = stringArrayValue(input.artifactRefs);
  const itemArtifactRefs = stringArrayValue(item?.artifactRefs);
  const artifactRef =
    misplacedArtifactRefs[0] ??
    itemArtifactRefs[0] ??
    stringValue(integration?.artifactRef) ??
    "artifact://<source>/<pointer>";
  const baseArguments = {
    portfolioId,
    ...(programId ? { programId } : {}),
    traceId,
    correlationId
  };
  const coordinationItemType = action ? coordinationItemTypeForAction(action) : undefined;

  if (action && coordinationItemType && action !== "add_artifact") {
    const coordinationArguments = {
      action,
      ...baseArguments,
      integration: {
        integrationPointId,
        item: correctedCoordinationItem({
          action,
          artifactRefs: [...itemArtifactRefs, ...misplacedArtifactRefs],
          item,
          itemType: coordinationItemType
        })
      },
      evidenceRefs: evidenceRefs.length > 0 ? evidenceRefs : ["evidence://<source>/<pointer>"]
    };
    const coordinationFieldGuidance = [
      "Required common fields: action, portfolioId, traceId, correlationId.",
      "The target integration ref belongs at integration.integrationPointId.",
      `For ${action}, integration.item.itemType is required and must be "${coordinationItemType}".`,
      "Use top-level evidenceRefs for evidence pointers.",
      "Use integration.item.artifactRefs for artifact pointers attached to the coordination item."
    ];
    if (action === "submit_gap_report" || action === "update_gap") {
      coordinationFieldGuidance.push(
        "For gap records, reporterProjectId, affectedProjectIds, summary, status, evidenceRefs, artifactRefs, and trackerRefs are optional value context when known.",
        "To close an existing gap, retry update_gap with the same integration.item.itemId, integration.item.itemType = \"gap\", status = \"resolved\", and pointer-only closure evidence."
      );
    }
    return {
      summary:
        `${action} is a manage_integrations coordination write. Put coordination fields under integration.item and include integration.item.itemType: "${coordinationItemType}".`,
      fieldGuidance: coordinationFieldGuidance,
      correctForm: {
        toolName: "manage_integrations",
        arguments: coordinationArguments
      },
      help,
      retryExamples: [
        {
          purpose: `Retry ${action} with the accepted coordination item payload shape.`,
          toolName: "manage_integrations",
          arguments: coordinationArguments
        }
      ]
    };
  }

  if (misplacedArtifactRefs.length > 0) {
    const addArtifactArguments = {
      action: "add_artifact",
      ...baseArguments,
      integration: {
        integrationPointId,
        artifactRef,
        item: {
          itemType: "artifact",
          artifactRefs: misplacedArtifactRefs,
          summary: "<Artifact pointer summary>"
        }
      },
      evidenceRefs: evidenceRefs.length > 0 ? evidenceRefs : ["evidence://<source>/<pointer>"]
    };
    return {
      summary:
        "artifactRefs is not a top-level manage_integrations input. Move artifact pointers inside integration: use integration.artifactRef for the artifact being attached and integration.item.artifactRefs for additional coordination artifact pointers.",
      fieldGuidance: [
        "Top-level evidenceRefs is valid for evidence pointers.",
        "Top-level artifactRefs is rejected for manage_integrations writes.",
        "Use integration.artifactRef for a single contract/artifact pointer.",
        "Use integration.item.artifactRefs when recording a coordination item with one or more artifact pointers."
      ],
      correctForm: {
        toolName: "manage_integrations",
        arguments: addArtifactArguments
      },
      help,
      retryExamples: [
        {
          purpose: "Attach artifact pointers to an existing integration using the accepted payload shape.",
          toolName: "manage_integrations",
          arguments: addArtifactArguments
        },
        {
          purpose: "Create or update an integration with a single artifact pointer inside integration.",
          toolName: "manage_integrations",
          arguments: {
            action: "upsert",
            ...baseArguments,
            integration: {
              integrationPointId,
              producerProjectId:
                stringValue(integration?.producerProjectId) ?? "project://<producer-project-slug>",
              consumerProjectIds:
                stringArrayValue(integration?.consumerProjectIds).length > 0
                  ? stringArrayValue(integration?.consumerProjectIds)
                  : ["project://<consumer-project-slug>"],
              purpose: stringValue(integration?.purpose) ?? "<Integration purpose>",
              artifactRef
            },
            evidenceRefs: evidenceRefs.length > 0 ? evidenceRefs : ["evidence://<source>/<pointer>"]
          }
        }
      ]
    };
  }

  if (action === "add_project" || action === "remove_project") {
    const membershipArguments = {
      action,
      ...baseArguments,
      integration: {
        integrationPointId,
        consumerProjectIds:
          stringArrayValue(integration?.consumerProjectIds).length > 0
            ? stringArrayValue(integration?.consumerProjectIds)
            : ["project://<consumer-project-slug>"]
      },
      evidenceRefs: evidenceRefs.length > 0 ? evidenceRefs : ["evidence://<source>/<pointer>"]
    };
    return {
      summary:
        `${action} is a manage_integrations membership write. Put the target integration ref and participating consumer project refs under integration.`,
      fieldGuidance: [
        "Required common fields: action, portfolioId, traceId, correlationId.",
        "The target integration ref belongs at integration.integrationPointId.",
        "Consumer project refs for membership changes belong at integration.consumerProjectIds.",
        "Use top-level evidenceRefs for pointer-only evidence."
      ],
      correctForm: {
        toolName: "manage_integrations",
        arguments: membershipArguments
      },
      help,
      retryExamples: [
        {
          purpose: `Retry ${action} with the accepted membership payload shape.`,
          toolName: "manage_integrations",
          arguments: membershipArguments
        }
      ]
    };
  }

  if (action && allowedActionsForTool("manage_integrations").includes(action)) {
    const lifecycleArguments = {
      action,
      ...baseArguments,
      integration: {
        integrationPointId,
        ...(action === "create" || action === "upsert"
          ? {
              producerProjectId:
                stringValue(integration?.producerProjectId) ?? "project://<producer-project-slug>",
              consumerProjectIds:
                stringArrayValue(integration?.consumerProjectIds).length > 0
                  ? stringArrayValue(integration?.consumerProjectIds)
                  : ["project://<consumer-project-slug>"],
              purpose: stringValue(integration?.purpose) ?? "<Integration purpose>"
            }
          : {}),
        ...(action === "update" || action === "rename"
          ? { purpose: stringValue(integration?.purpose) ?? "<Updated integration purpose>" }
          : {}),
        ...(action === "retire" || action === "delete" ? { status: "retired" } : {})
      },
      ...(evidenceRefs.length > 0 ? { evidenceRefs } : {})
    };
    return {
      summary:
        `${action} is a manage_integrations lifecycle/read action. Put target lifecycle fields under integration.`,
      fieldGuidance: [
        "Required common fields: action, portfolioId, traceId, correlationId.",
        "The target integration ref belongs at integration.integrationPointId.",
        "For create/upsert, integration.producerProjectId is schema-required.",
        "For create/upsert, integration.consumerProjectIds, integration.purpose, evidenceRefs, and integration.artifactRef are recommended value context when known, not registration proof.",
        "Use top-level evidenceRefs for pointer-only evidence."
      ],
      correctForm: {
        toolName: "manage_integrations",
        arguments: lifecycleArguments
      },
      help,
      retryExamples: [
        {
          purpose: `Retry ${action} with the accepted integration payload shape.`,
          toolName: "manage_integrations",
          arguments: lifecycleArguments
        }
      ]
    };
  }

  const retryExample = retryExamplesForTool("manage_integrations", portfolioId, traceId, correlationId)[0];
  return {
    summary:
      "Retry with the shown correctForm or one of retryExamples. manage_integrations accepts lifecycle fields under integration and evidence pointers at top level.",
    fieldGuidance: [
      "Required common fields: action, portfolioId, traceId, correlationId.",
      "Lifecycle target fields belong under integration, starting with integration.integrationPointId.",
      "Use top-level evidenceRefs for evidence pointers.",
      "Use integration.artifactRef or integration.item.artifactRefs for artifact pointers."
    ],
    correctForm: retryExample
      ? { toolName: "manage_integrations", arguments: retryExample.arguments }
      : help,
    help,
    retryExamples: []
  };
}

function manageEvidenceItemsCorrection(
  input: Record<string, unknown>,
  portfolioId: string,
  traceId: string,
  correlationId: string,
  help: { toolName: string; arguments: Record<string, unknown> }
) {
  const action = stringValue(input.action) ?? "list";
  const evidenceItem = recordValue(input.evidenceItem);
  const correctedAction = allowedActionsForTool("manage_evidence_items").includes(action)
    ? action
    : "list";
  const evidenceRef = stringValue(evidenceItem?.evidenceRef) ?? "evidence://<source>/<pointer>";
  const artifactRef = stringValue(evidenceItem?.artifactRef) ?? "artifact://<source>/<pointer>";
  const evidenceItemShape =
    correctedAction === "list"
      ? undefined
      : {
          ...(correctedAction !== "add_artifact" ? { evidenceRef } : {}),
          ...(correctedAction === "register" ||
          correctedAction === "add_artifact" ||
          correctedAction === "attach_to_integration" ||
          correctedAction === "attach_to_decision" ||
          correctedAction === "attach_to_learning"
            ? { artifactRef }
            : {}),
          ...(correctedAction === "register" || correctedAction === "link_evidence"
            ? { kind: stringValue(evidenceItem?.kind) ?? "operator_attestation" }
            : {}),
          ...(correctedAction === "register" || correctedAction === "add_artifact"
            ? {
                artifactType: stringValue(evidenceItem?.artifactType) ?? "pmo_artifact",
                storageUri: stringValue(evidenceItem?.storageUri) ?? artifactRef,
                contentHash: recordValue(evidenceItem?.contentHash) ?? {
                  algorithm: "sha256",
                  value: "0000000000000000000000000000000000000000000000000000000000000000"
                }
              }
            : {}),
          ...(correctedAction === "attach_to_integration" ||
          correctedAction === "attach_to_decision" ||
          correctedAction === "attach_to_learning"
            ? {
                attachesToRefs:
                  stringArrayValue(evidenceItem?.attachesToRefs).length > 0
                    ? stringArrayValue(evidenceItem?.attachesToRefs)
                    : ["integration://<integration-slug>"]
              }
            : {})
        };
  const argumentsForAction = {
    action: correctedAction,
    portfolioId,
    traceId,
    correlationId,
    ...(evidenceItemShape ? { evidenceItem: evidenceItemShape } : {})
  };

  return {
    summary:
      "manage_evidence_items rejected the payload shape. Retry with correctForm; raw evidence bodies are not accepted, only pointer refs, storage URIs, hashes, classifications, retention refs, and attachments.",
    fieldGuidance: [
      "Required common fields: action, portfolioId, traceId, correlationId.",
      "Evidence and artifact fields belong under evidenceItem.",
      "Do not include raw logs, bodies, screenshots, transcripts, product rows, credentials, or secrets.",
      "For artifact registration, include evidenceItem.storageUri and evidenceItem.contentHash."
    ],
    correctForm: {
      toolName: "manage_evidence_items",
      arguments: argumentsForAction
    },
    help,
    retryExamples: [
      {
        purpose: `Retry manage_evidence_items ${correctedAction} with the accepted pointer-only payload shape.`,
        toolName: "manage_evidence_items",
        arguments: argumentsForAction
      }
    ]
  };
}

function coordinationItemTypeForAction(action: string): string | undefined {
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

function correctedCoordinationItem(input: {
  action: string;
  artifactRefs: string[];
  item?: Record<string, unknown>;
  itemType: string;
}) {
  const item = input.item ?? {};
  const artifactRefs = sortUniqueStrings(input.artifactRefs);
  const affectedProjectIds = stringArrayValue(item.affectedProjectIds);
  return {
    ...(affectedProjectIds.length > 0 ? { affectedProjectIds } : {}),
    ...(artifactRefs.length > 0 ? { artifactRefs } : {}),
    ...(stringValue(item.blockedProjectId) ? { blockedProjectId: stringValue(item.blockedProjectId) } : {}),
    ...(stringValue(item.itemId) ? { itemId: stringValue(item.itemId) } : {}),
    itemType: input.itemType,
    ...(stringValue(item.ownerProjectId) ? { ownerProjectId: stringValue(item.ownerProjectId) } : {}),
    ...(stringValue(item.projectId) ? { projectId: stringValue(item.projectId) } : {}),
    ...(input.action === "submit_gap_report" && !stringValue(item.reporterProjectId)
      ? { reporterProjectId: "project://<reporting-project-slug>" }
      : {}),
    ...(stringValue(item.reporterProjectId) ? { reporterProjectId: stringValue(item.reporterProjectId) } : {}),
    status: stringValue(item.status) ?? defaultCoordinationStatusForAction(input.action),
    summary: stringValue(item.summary) ?? defaultCoordinationSummaryForAction(input.action),
    ...(stringArrayValue(item.trackerRefs).length > 0
      ? { trackerRefs: stringArrayValue(item.trackerRefs) }
      : {})
  };
}

function defaultCoordinationStatusForAction(action: string): string {
  const statuses: Record<string, string> = {
    acknowledge_goal: "acknowledged",
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
    update_blocker: "updated",
    update_gap: "updated"
  };
  return statuses[action] ?? "recorded";
}

function defaultCoordinationSummaryForAction(action: string): string {
  if (action === "submit_gap_report") {
    return "<Gap summary>";
  }
  return "<Coordination item summary>";
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function sortUniqueStrings(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function allowedActionsForTool(toolName: string): string[] {
  if (toolName === "manage_projects") {
    return [
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
  }
  if (toolName === "manage_integrations") {
    return [
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
  }
  if (toolName === "manage_evidence_items") {
    return [
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
    ];
  }
  if (toolName === "pmo_macro") {
    return ["help", "list", "describe", "validate", "invoke", "edit_registry"];
  }
  return [];
}

function retryExamplesForTool(
  toolName: string,
  portfolioId: string,
  traceId: string,
  correlationId: string
): Array<{ purpose: string; arguments: Record<string, unknown> }> {
  if (toolName === "manage_projects") {
    return [
      {
        purpose: "List existing PMO programs and projects.",
        arguments: { action: "list", portfolioId, traceId, correlationId }
      },
      {
        purpose: "Register or update a PMO program/project.",
        arguments: {
          action: "upsert",
          portfolioId,
          programId: "program://<program-slug>",
          traceId,
          correlationId,
          program: { programId: "program://<program-slug>", name: "<Program name>" },
          project: {
            programId: "program://<program-slug>",
            projectId: "project://<project-slug>",
            name: "<Project name>"
          },
          evidenceRefs: ["evidence://<source>/<pointer>"]
        }
      },
      {
        purpose: "Link external tracker/repo/adapter refs without transferring ownership to PMO.",
        arguments: {
          action: "link_tracker",
          portfolioId,
          programId: "program://<program-slug>",
          traceId,
          correlationId,
          project: {
            projectId: "project://<project-slug>",
            trackerRef: "tracker://<tracker-slug>/<task-or-project-ref>"
          }
        }
      },
      {
        purpose: "Add a project to a program membership/binding.",
        arguments: {
          action: "add_project",
          portfolioId,
          programId: "program://<program-slug>",
          traceId,
          correlationId,
          project: {
            projectId: "project://<project-slug>",
            name: "<Project name>"
          }
        }
      }
    ];
  }
  if (toolName === "manage_integrations") {
    return [
      {
        purpose: "List existing PMO integration refs.",
        arguments: { action: "list", portfolioId, traceId, correlationId }
      },
      {
        purpose: "Create a new PMO integration record with producer and initial consumers.",
        arguments: {
          action: "upsert",
          portfolioId,
          programId: "program://<program-slug>",
          traceId,
          correlationId,
          integration: {
            integrationPointId: "integration://<integration-slug>",
            producerProjectId: "project://<producer-project-slug>",
            consumerProjectIds: ["project://<consumer-project-slug>"],
            status: "active",
            purpose: "<Integration purpose>"
          },
          evidenceRefs: ["evidence://<source>/<pointer>"]
        }
      },
      {
        purpose: "Update integration metadata (for example purpose or status).",
        arguments: {
          action: "update",
          portfolioId,
          programId: "program://<program-slug>",
          traceId,
          correlationId,
          integration: {
            integrationPointId: "integration://<integration-slug>",
            purpose: "<Updated integration purpose>"
          }
        }
      },
      {
        purpose: "Add a project to an integration (project sign-up).",
        arguments: {
          action: "add_project",
          portfolioId,
          programId: "program://<program-slug>",
          traceId,
          correlationId,
          integration: {
            integrationPointId: "integration://<integration-slug>",
            consumerProjectIds: ["project://<new-consumer-project-slug>"]
          }
        }
      },
      {
        purpose: "Remove a project's participation from an integration.",
        arguments: {
          action: "remove_project",
          portfolioId,
          programId: "program://<program-slug>",
          traceId,
          correlationId,
          integration: {
            integrationPointId: "integration://<integration-slug>",
            consumerProjectIds: ["project://<consumer-project-slug>"]
          }
        }
      },
      {
        purpose: "Retire an integration without deleting it (PMO retirement state).",
        arguments: {
          action: "retire",
          portfolioId,
          programId: "program://<program-slug>",
          traceId,
          correlationId,
          integration: {
            integrationPointId: "integration://<integration-slug>",
            status: "retired"
          }
        }
      },
      {
        purpose: "Run deletion as non-destructive retirement.",
        arguments: {
          action: "delete",
          portfolioId,
          programId: "program://<program-slug>",
          traceId,
          correlationId,
          integration: {
            integrationPointId: "integration://<integration-slug>",
            status: "retired"
          }
        }
      }
    ];
  }
  if (toolName === "manage_evidence_items") {
    return [
      {
        purpose: "List existing PMO evidence and artifact refs.",
        arguments: { action: "list", portfolioId, traceId, correlationId }
      },
      {
        purpose: "Register pointer-only evidence and artifact records.",
        arguments: {
          action: "register",
          portfolioId,
          traceId,
          correlationId,
          evidenceItem: {
            evidenceRef: "evidence://<source>/<pointer>",
            kind: "operator_attestation",
            artifactRef: "artifact://<source>/<pointer>",
            artifactType: "pmo_artifact",
            storageUri: "artifact://<source>/<pointer>",
            contentHash: {
              algorithm: "sha256",
              value: "0000000000000000000000000000000000000000000000000000000000000000"
            }
          }
        }
      }
    ];
  }
  if (toolName === "pmo_macro") {
    return [
      {
        purpose: "Ask for macro help.",
        arguments: { action: "help", portfolioId, traceId, correlationId }
      },
      {
        purpose: "Invoke catch-up after program/project scope is known.",
        arguments: {
          action: "invoke",
          portfolioId,
          programId: "program://<program-slug>",
          traceId,
          correlationId,
          macroId: "macro://pmo/catch_me_up",
          macroVersion: "1.0.0",
          input: { targetRefs: ["integration://<integration-slug>"] }
        }
      }
    ];
  }
  return [
    {
      purpose: "Bootstrap PMO guidance.",
      arguments: { portfolioId, traceId, correlationId }
    }
  ];
}
