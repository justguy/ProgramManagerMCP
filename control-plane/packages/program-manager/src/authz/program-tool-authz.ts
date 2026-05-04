export type ProgramToolActorRole =
  | "human_operator"
  | "program_manager_agent"
  | "execution_agent"
  | "c_suite_agent"
  | "service_adapter";

export type ProgramToolActor = {
  actorId: string;
  actorRole: ProgramToolActorRole;
  tenantId: string;
  portfolioGrants: string[];
  programGrants: string[];
  projectGrants: string[];
  authnMethod: string;
  authnIssuer: string;
  authenticatedAt: string;
  expiresAt: string;
};

export type ProgramToolScope = {
  portfolioId: string;
  programId?: string;
  projectIds?: string[];
  targetRefs?: string[];
};

export const AUTHZ_POLICY_REFS = Object.freeze({
  actorRole: "policy://authz/actor-role-v1",
  portfolioRead: "policy://authz/portfolio-read-v1",
  programScope: "policy://authz/program-scope-v1",
  projectScope: "policy://authz/project-scope-v1",
  verifiedActor: "policy://authz/server-verified-actor-v1"
});

const PORTFOLIO_READ_ROLES = new Set<ProgramToolActorRole>([
  "human_operator",
  "program_manager_agent",
  "c_suite_agent",
  "execution_agent"
]);

function sanitizeSegment(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
}

function sortUnique(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function hasScopedGrant(grants: string[], target: string | undefined): boolean {
  if (!target) {
    return true;
  }
  if (grants.length === 0) {
    return true;
  }
  return grants.includes(target);
}

function extractProjectIdsFromRefs(refs: string[] = []): string[] {
  const projectIds = new Set<string>();

  for (const ref of refs) {
    if (ref.startsWith("project://")) {
      projectIds.add(ref);
      continue;
    }
    if (ref.startsWith("tracker://")) {
      const [, remainder] = ref.split("://");
      const trackerSlug = remainder?.split("/")[0];
      if (trackerSlug) {
        projectIds.add(`project://${trackerSlug}`);
      }
    }
  }

  return [...projectIds].sort((left, right) => left.localeCompare(right));
}

export class ProgramToolAuthzError extends Error {
  evidenceRefs: string[];
  policyRefs: string[];

  constructor(message: string, policyRefs: string[], evidenceRefs: string[]) {
    super(message);
    this.name = "ProgramToolAuthzError";
    this.policyRefs = sortUnique(policyRefs);
    this.evidenceRefs = sortUnique(evidenceRefs);
  }
}

export function buildAuthzEvidenceRefs(actor: Pick<ProgramToolActor, "authnMethod">): string[] {
  return sortUnique([
    "evidence://authz/server-verified-actor/current",
    `evidence://authn/${sanitizeSegment(actor.authnMethod || "unknown")}/current`
  ]);
}

export function assertReadAuthorized(
  actor: ProgramToolActor,
  scope: ProgramToolScope,
  nowIso: string
): void {
  const evidenceRefs = buildAuthzEvidenceRefs(actor);

  if (!PORTFOLIO_READ_ROLES.has(actor.actorRole)) {
    throw new ProgramToolAuthzError(
      `Actor role ${actor.actorRole} cannot use public PMO read tools.`,
      [AUTHZ_POLICY_REFS.actorRole, AUTHZ_POLICY_REFS.verifiedActor],
      evidenceRefs
    );
  }

  if (actor.actorRole === "service_adapter") {
    throw new ProgramToolAuthzError(
      "Service adapters cannot query the public PMO gateway.",
      [AUTHZ_POLICY_REFS.actorRole, AUTHZ_POLICY_REFS.verifiedActor],
      evidenceRefs
    );
  }

  if (new Date(actor.expiresAt).getTime() <= new Date(nowIso).getTime()) {
    throw new ProgramToolAuthzError(
      "Actor session expired before this tool request was evaluated.",
      [AUTHZ_POLICY_REFS.verifiedActor],
      evidenceRefs
    );
  }

  if (!actor.portfolioGrants.includes(scope.portfolioId)) {
    throw new ProgramToolAuthzError(
      `Cross-portfolio read denied for ${scope.portfolioId}.`,
      [AUTHZ_POLICY_REFS.portfolioRead, AUTHZ_POLICY_REFS.verifiedActor],
      evidenceRefs
    );
  }

  if (!hasScopedGrant(actor.programGrants, scope.programId)) {
    throw new ProgramToolAuthzError(
      `Program scope denied for ${scope.programId}.`,
      [AUTHZ_POLICY_REFS.programScope, AUTHZ_POLICY_REFS.verifiedActor],
      evidenceRefs
    );
  }

  const requiredProjectIds = sortUnique([
    ...(scope.projectIds ?? []),
    ...extractProjectIdsFromRefs(scope.targetRefs)
  ]);

  const projectScopeDenied = requiredProjectIds.some(
    (projectId) => !actor.projectGrants.includes(projectId)
  );

  if (actor.actorRole === "execution_agent" && (requiredProjectIds.length === 0 || projectScopeDenied)) {
    throw new ProgramToolAuthzError(
      "Execution agents require explicit assigned project scope.",
      [AUTHZ_POLICY_REFS.projectScope, AUTHZ_POLICY_REFS.verifiedActor],
      evidenceRefs
    );
  }

  if (actor.projectGrants.length > 0 && projectScopeDenied) {
    throw new ProgramToolAuthzError(
      `Project scope denied for ${requiredProjectIds.join(", ")}.`,
      [AUTHZ_POLICY_REFS.projectScope, AUTHZ_POLICY_REFS.verifiedActor],
      evidenceRefs
    );
  }
}

export function inferScopedProjectIds(scope: ProgramToolScope): string[] {
  return sortUnique([...(scope.projectIds ?? []), ...extractProjectIdsFromRefs(scope.targetRefs)]);
}
