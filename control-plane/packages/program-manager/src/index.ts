export type * from "./types/domain.js";
export type * from "./repository/program-manager-repository.js";
export type * from "./adapters/index.js";
export type * from "./authz/program-tool-authz.ts";
export {
  AdapterRegistry,
  HoplonAdapterStub,
  TrackerAdapterStub,
  adapterRegistry
} from "./adapters/index.js";
export { InMemoryProgramManagerRepository } from "./repository/in-memory-program-manager-repository.js";
export {
  AUTHZ_POLICY_REFS,
  ProgramToolAuthzError,
  assertReadAuthorized,
  buildAuthzEvidenceRefs,
  inferScopedProjectIds
} from "./authz/program-tool-authz.ts";
export {
  DEFAULT_REDACTION_POLICY_REFS,
  PROHIBITED_INLINE_KINDS,
  buildRedactionSummary,
  mergeRedactionSummaries,
  sanitizePointerPayload
} from "./redaction/program-tool-redaction.ts";
export { ProgramToolService } from "./service/program-tool-service.ts";
export {
  PROGRAM_MANAGER_MCP_TOOLS,
  ProgramManagerMcpGateway
} from "./mcp/program-manager-mcp-gateway.ts";
