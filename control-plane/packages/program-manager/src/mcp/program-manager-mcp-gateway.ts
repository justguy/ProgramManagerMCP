import {
  analyzeProgramIntelligenceRequestSchema,
  assessProgramImpactRequestSchema,
  generateProgramUpdateRequestSchema,
  getProgramAuditTrailRequestSchema,
  getProgramDocumentationRequestSchema,
  listProgramCapabilitiesRequestSchema,
  queryProgramContextRequestSchema
} from "../../../../../shared/schemas/program-manager.ts";
import type { ProgramToolActor } from "../authz/program-tool-authz.ts";
import { ProgramToolService } from "../service/program-tool-service.ts";

export const PROGRAM_MANAGER_MCP_TOOLS = Object.freeze([
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
  }
] as const);

export class ProgramManagerMcpGateway {
  #service: ProgramToolService;

  constructor(service: ProgramToolService) {
    this.#service = service;
  }

  listTools() {
    return PROGRAM_MANAGER_MCP_TOOLS.map((tool) => ({
      name: tool.name,
      description: tool.description
    }));
  }

  async callTool(toolName: string, request: unknown, actor: ProgramToolActor) {
    switch (toolName) {
      case "list_program_capabilities":
        return this.#service.listProgramCapabilities(request, actor);
      case "get_program_documentation":
        return this.#service.getProgramDocumentation(request, actor);
      case "query_program_context":
        return this.#service.queryProgramContext(request, actor);
      case "assess_program_impact":
        return this.#service.assessProgramImpact(request, actor);
      case "generate_program_update":
        return this.#service.generateProgramUpdate(request, actor);
      case "get_program_audit_trail":
        return this.#service.getProgramAuditTrail(request, actor);
      case "analyze_program_intelligence":
        return this.#service.analyzeProgramIntelligence(request, actor);
      default:
        throw new Error(`Unsupported PMO MCP tool: ${toolName}`);
    }
  }
}
