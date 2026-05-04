import type { PmoMacroDefinition, PmoMacroRegistry, ProgramEvent } from "../types/domain.js";
import type { ProgramManagerRepository } from "../repository/program-manager-repository.js";

export const PMO_MACRO_REGISTRY_ADMIN_ROLE = "role://pmo/macro-registry-admin";
export const PMO_MACRO_OPERATOR_ROLE = "role://pmo/macro-operator";
export const BUILT_IN_MACRO_REGISTRY_REF = "registry://pmo/macros";
export const BUILT_IN_MACRO_REGISTRY_VERSION = "1.0.0";

type VerifiedMacroRegistryActor = {
  actorId: string;
  roleRefs: string[];
  portfolioIds: string[];
};

export type MacroRegistryEditPatch = {
  macroId: string;
  set: Partial<Pick<PmoMacroDefinition, "description" | "enabled" | "requiredRoleRefs" | "title">> &
    Record<string, unknown>;
};

export type MacroRegistryEditResult =
  | {
      accepted: true;
      registry: PmoMacroRegistry;
      auditEvent: ProgramEvent;
      evidenceRefs: string[];
    }
  | {
      accepted: false;
      errorCode: string;
      summary: string;
      auditEvent: ProgramEvent;
      evidenceRefs: string[];
    };

const SAFE_EDIT_FIELDS = new Set(["description", "enabled", "requiredRoleRefs", "title"]);
const LOCKED_POLICY_FIELDS = new Set([
  "deterministicHashPolicy",
  "downstreamAuthority",
  "inputSchemaRef",
  "macroId",
  "macroName",
  "outputSchemaRef",
  "registryEntryRef",
  "requiredEvidenceBehavior",
  "sideEffectClass",
  "sideEffectPosture",
  "version"
]);
const DOWNSTREAM_AUTHORITY_PATTERNS = [
  "github",
  "guardrail",
  "hoplon",
  "llm-tracker",
  "phalanx",
  "semantix",
  "serena",
  "tracker"
];

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right);
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort(compareStrings);
}

function macro(
  macroName: PmoMacroDefinition["macroName"],
  title: string,
  description: string,
  sideEffectPosture: PmoMacroDefinition["sideEffectPosture"] = "read_only"
): PmoMacroDefinition {
  return {
    description,
    enabled: true,
    inputSchemaRef: "schema://pmo/pmo-macro-request",
    macroId: `macro://pmo/${macroName}`,
    macroName,
    outputSchemaRef: "schema://pmo/pmo-macro-result",
    registryEntryRef: `registry://pmo/macros/${macroName}`,
    requiredRoleRefs: [PMO_MACRO_OPERATOR_ROLE],
    sideEffectPosture,
    title,
    version: BUILT_IN_MACRO_REGISTRY_VERSION
  };
}

export function createBuiltInMacroRegistry(
  portfolioId: string,
  recordedAt = "1970-01-01T00:00:00Z"
): PmoMacroRegistry {
  return normalizeMacroRegistry({
    artifactRefs: ["artifact://docs/phase-5/pmo-macro-registry@sha256:built-in"],
    evidenceRefs: ["evidence://program-manager-mcp/phase-5/macro-registry/built-in"],
    macros: [
      macro("analyze_blockers", "Analyze Blockers", "Find active blockers, affected work, and missing evidence."),
      macro("catch_me_up", "Catch Me Up", "Return a bounded context packet for selected PMO object refs."),
      macro("describe_macro", "Describe Macro", "Describe one macro's input, output, evidence, and safety posture."),
      macro("detect_drift", "Detect Drift", "Compare current PMO facts against expected evidence and contracts."),
      macro("discover_macros", "Discover Macros", "List enabled macros visible to the verified actor."),
      macro("export_registry", "Export Registry", "Return the pointer-only PMO macro registry."),
      macro("object_type_docs", "Object Type Docs", "Document normalized PMO object types and reference patterns."),
      macro("propose_unblock_plan", "Propose Unblock Plan", "Draft PMO-only proposed unblock actions without executing them.", "describes_actions_only"),
      macro("registry_help", "Registry Help", "Explain safe registry edit behavior and locked fields."),
      macro("simulate_impact", "Simulate Impact", "War-game dependency impact without persisting hypothetical program truth.", "describes_actions_only"),
      macro("validate_macro", "Validate Macro", "Validate a macro request and deterministic envelope shape.")
    ],
    portfolioId,
    recordedAt,
    registryRef: BUILT_IN_MACRO_REGISTRY_REF,
    registryVersion: BUILT_IN_MACRO_REGISTRY_VERSION,
    schemaVersion: "1"
  });
}

export function normalizeMacroRegistry(registry: PmoMacroRegistry): PmoMacroRegistry {
  return {
    ...registry,
    artifactRefs: sortedUnique(registry.artifactRefs ?? []),
    evidenceRefs: sortedUnique(registry.evidenceRefs),
    macros: registry.macros
      .map((entry) => ({
        ...entry,
        requiredRoleRefs: sortedUnique(entry.requiredRoleRefs)
      }))
      .sort((left, right) => compareStrings(left.macroId, right.macroId))
  };
}

export function applyMacroRegistryEdit(
  registry: PmoMacroRegistry,
  patch: MacroRegistryEditPatch,
  actor: VerifiedMacroRegistryActor,
  now: string
): MacroRegistryEditResult {
  const evidenceRefs = ["evidence://authz/server-verified-actor/current"];
  const deny = (errorCode: string, summary: string): MacroRegistryEditResult => ({
    accepted: false,
    auditEvent: buildMacroRegistryAuditEvent(registry.portfolioId, actor.actorId, "rejected", now, evidenceRefs),
    errorCode,
    evidenceRefs,
    summary
  });

  if (!actor.roleRefs.includes(PMO_MACRO_REGISTRY_ADMIN_ROLE)) {
    return deny("macro-registry-edit-unauthorized", "Actor is not authorized to edit the PMO macro registry.");
  }
  if (!actor.portfolioIds.includes(registry.portfolioId) && !actor.portfolioIds.includes("portfolio://*")) {
    return deny("macro-registry-edit-cross-portfolio-denied", "Actor is not authorized for this portfolio.");
  }

  const unsafeField = Object.keys(patch.set).find(
    (field) => !SAFE_EDIT_FIELDS.has(field) || LOCKED_POLICY_FIELDS.has(field)
  );
  if (unsafeField) {
    return deny("macro-registry-edit-locked-field", `Field ${unsafeField} cannot be edited through pmo_macro.`);
  }

  const nextRequiredRoleRefs = patch.set.requiredRoleRefs;
  if (nextRequiredRoleRefs && nextRequiredRoleRefs.some((roleRef) => grantsDownstreamAuthority(roleRef))) {
    return deny(
      "macro-registry-edit-downstream-authority-denied",
      "Macro registry edits cannot grant downstream execution authority."
    );
  }

  const macroIndex = registry.macros.findIndex((entry) => entry.macroId === patch.macroId);
  if (macroIndex === -1) {
    return deny("macro-registry-edit-macro-not-found", "Requested macro is not present in the registry.");
  }

  const macros = registry.macros.map((entry, index) =>
    index === macroIndex
      ? {
          ...entry,
          ...patch.set,
          requiredRoleRefs: nextRequiredRoleRefs ? sortedUnique(nextRequiredRoleRefs) : entry.requiredRoleRefs
        }
      : entry
  );
  const nextRegistry = normalizeMacroRegistry({
    ...registry,
    evidenceRefs,
    macros,
    recordedAt: now
  });

  return {
    accepted: true,
    auditEvent: buildMacroRegistryAuditEvent(registry.portfolioId, actor.actorId, "accepted", now, evidenceRefs),
    evidenceRefs,
    registry: nextRegistry
  };
}

export async function applyAndPersistMacroRegistryEdit(
  repository: ProgramManagerRepository,
  portfolioId: string,
  patch: MacroRegistryEditPatch,
  actor: VerifiedMacroRegistryActor,
  now: string
): Promise<MacroRegistryEditResult> {
  const currentRegistry =
    (await repository.getMacroRegistry({ portfolioId })) ?? createBuiltInMacroRegistry(portfolioId, now);
  const result = applyMacroRegistryEdit(currentRegistry, patch, actor, now);
  if (result.accepted) {
    await repository.upsertMacroRegistry(result.registry, result.auditEvent);
  }
  return result;
}

function grantsDownstreamAuthority(roleRef: string): boolean {
  const lower = roleRef.toLowerCase();
  return DOWNSTREAM_AUTHORITY_PATTERNS.some((pattern) => lower.includes(pattern));
}

function buildMacroRegistryAuditEvent(
  portfolioId: string,
  actorId: string,
  status: "accepted" | "rejected",
  recordedAt: string,
  evidenceRefs: string[]
): ProgramEvent {
  return {
    artifactRefs: [],
    contextAnchor: {
      portfolioId
    },
    eventId: `event://pmo/macro-registry-edit/${status}/${encodeURIComponent(actorId)}/${recordedAt}`,
    eventType: `pmo_macro.edit_registry.${status}`,
    evidenceRefs,
    portfolioId,
    recordedAt
  };
}
