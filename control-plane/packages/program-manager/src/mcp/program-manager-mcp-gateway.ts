import {
  assessProgramImpactRequestSchema,
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
      default:
        throw new Error(`Unsupported PMO MCP tool: ${toolName}`);
    }
  }
}
