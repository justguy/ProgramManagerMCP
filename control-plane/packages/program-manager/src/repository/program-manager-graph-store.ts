import type {
  ArtifactRef,
  DecisionRecord,
  EvidenceRef,
  GraphRelationship,
  ProgramEvent,
  ProgramIntelligenceRecord,
  ProgramRef,
  ProjectRef,
  SyncCursor
} from "../types/domain.js";
import type {
  DecisionQuery,
  ProgramIntelligenceQuery,
  RepositoryScope
} from "./program-manager-repository.js";

const STATIC_RECORDED_AT = "1970-01-01T00:00:00Z";

export type ProgramMembership = {
  portfolioId: string;
  programId: string;
  projectId: string;
  recordedAt?: string;
  evidenceRefs?: string[];
};

export type IntegrationPointRecord = {
  integrationPointId: string;
  portfolioId: string;
  producerProjectId: string;
  consumerProjectIds: string[];
  purpose?: string;
  recordedAt?: string;
  evidenceRefs?: string[];
};

export type ContractRecord = {
  contractRef: string;
  portfolioId: string;
  integrationPointId: string;
  producerProjectId: string;
  recordedAt?: string;
  evidenceRefs?: string[];
};

export type DecisionRecordEnvelope = DecisionRecord & {
  actorId?: string;
  appliesToRefs?: string[];
  authorityRef?: string;
  decisionType?: string;
};

export type SyncCursorRecord = SyncCursor & {
  observedAt?: string;
  sourceRevisionHash?: string;
  status?: "current" | "stale" | "unavailable";
};

export type ProgramManagerGraphSeed = {
  programs?: ProgramRef[];
  projects?: ProjectRef[];
  memberships?: ProgramMembership[];
  integrationPoints?: IntegrationPointRecord[];
  contracts?: ContractRecord[];
  relationships?: GraphRelationship[];
  evidenceRefs?: EvidenceRef[];
  artifactRefs?: ArtifactRef[];
  decisions?: DecisionRecordEnvelope[];
  intelligenceRecords?: ProgramIntelligenceRecord[];
  events?: ProgramEvent[];
  syncCursors?: SyncCursorRecord[];
};

export interface ProgramManagerGraphStore {
  upsertProgram(program: ProgramRef): Promise<void>;
  upsertProject(project: ProjectRef): Promise<void>;
  upsertMembership(membership: ProgramMembership): Promise<void>;
  upsertIntegrationPoint(integrationPoint: IntegrationPointRecord): Promise<void>;
  upsertContract(contract: ContractRecord): Promise<void>;
  upsertRelationship(relationship: GraphRelationship): Promise<void>;
  upsertEvidenceRef(evidenceRef: EvidenceRef): Promise<void>;
  upsertArtifactRef(artifactRef: ArtifactRef): Promise<void>;
  upsertDecision(decision: DecisionRecordEnvelope): Promise<void>;
  upsertIntelligenceRecord(record: ProgramIntelligenceRecord): Promise<void>;
  appendEvent(event: ProgramEvent): Promise<void>;
  upsertSyncCursor(cursor: SyncCursorRecord): Promise<void>;
  listPrograms(scope: RepositoryScope): Promise<ProgramRef[]>;
  listProjects(scope: RepositoryScope): Promise<ProjectRef[]>;
  listMemberships(scope: RepositoryScope): Promise<ProgramMembership[]>;
  listIntegrationPoints(scope: RepositoryScope): Promise<IntegrationPointRecord[]>;
  listContracts(scope: RepositoryScope): Promise<ContractRecord[]>;
  listRelationships(scope: RepositoryScope): Promise<GraphRelationship[]>;
  listEvidenceRefs(scope: RepositoryScope, refs?: string[]): Promise<EvidenceRef[]>;
  listArtifactRefs(scope: RepositoryScope, refs?: string[]): Promise<ArtifactRef[]>;
  listDecisions(query: DecisionQuery): Promise<DecisionRecordEnvelope[]>;
  listIntelligenceRecords(query: ProgramIntelligenceQuery): Promise<ProgramIntelligenceRecord[]>;
  listEvents(scope: RepositoryScope): Promise<ProgramEvent[]>;
  listSyncCursors(scope: RepositoryScope): Promise<SyncCursorRecord[]>;
}

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right);
}

function compareOptionalStrings(left?: string, right?: string): number {
  return compareStrings(left ?? "", right ?? "");
}

function sortStringArray(values: string[] | undefined): string[] | undefined {
  if (!values) {
    return values;
  }
  return [...values].sort(compareStrings);
}

function cloneProgram(program: ProgramRef): ProgramRef {
  return { ...program };
}

function cloneProject(project: ProjectRef): ProjectRef {
  return { ...project };
}

function cloneMembership(membership: ProgramMembership): ProgramMembership {
  return {
    ...membership,
    evidenceRefs: sortStringArray(membership.evidenceRefs)
  };
}

function cloneIntegrationPoint(integrationPoint: IntegrationPointRecord): IntegrationPointRecord {
  return {
    ...integrationPoint,
    consumerProjectIds: [...integrationPoint.consumerProjectIds].sort(compareStrings),
    evidenceRefs: sortStringArray(integrationPoint.evidenceRefs)
  };
}

function cloneContract(contract: ContractRecord): ContractRecord {
  return {
    ...contract,
    evidenceRefs: sortStringArray(contract.evidenceRefs)
  };
}

function cloneRelationship(relationship: GraphRelationship): GraphRelationship {
  return {
    ...relationship,
    evidenceRefs: [...relationship.evidenceRefs].sort(compareStrings)
  };
}

function cloneEvidenceRef(evidenceRef: EvidenceRef): EvidenceRef {
  return { ...evidenceRef };
}

function cloneArtifactRef(artifactRef: ArtifactRef): ArtifactRef {
  return {
    ...artifactRef,
    contentHash: { ...artifactRef.contentHash }
  };
}

function cloneDecision(decision: DecisionRecordEnvelope): DecisionRecordEnvelope {
  return {
    ...decision,
    appliesToRefs: sortStringArray(decision.appliesToRefs),
    evidenceRefs: [...decision.evidenceRefs].sort(compareStrings)
  };
}

function cloneIntelligenceRecord(record: ProgramIntelligenceRecord): ProgramIntelligenceRecord {
  return {
    ...record,
    appliesToRefs: [...record.appliesToRefs].sort(compareStrings),
    conditionTags: [...record.conditionTags].sort(compareStrings),
    evidenceRefs: [...record.evidenceRefs].sort(compareStrings),
    sourceRefs: [...record.sourceRefs].sort(compareStrings),
    ...(record.recordType === "learning" ? { confidence: { ...record.confidence } } : {}),
    ...(record.recordType === "failure_pattern"
      ? { occurrenceRefs: [...record.occurrenceRefs].sort(compareStrings) }
      : {})
  } as ProgramIntelligenceRecord;
}

function cloneEvent(event: ProgramEvent): ProgramEvent {
  return {
    ...event,
    contextAnchor: event.contextAnchor ? { ...event.contextAnchor } : undefined,
    evidenceRefs: [...event.evidenceRefs].sort(compareStrings),
    artifactRefs: [...event.artifactRefs].sort(compareStrings)
  };
}

function cloneCursor(cursor: SyncCursorRecord): SyncCursorRecord {
  return { ...cursor };
}

export function normalizeRecordedAt(recordedAt?: string): string {
  return recordedAt ?? STATIC_RECORDED_AT;
}

export function comparePrograms(left: ProgramRef, right: ProgramRef): number {
  return (
    compareStrings(left.portfolioId, right.portfolioId) ||
    compareStrings(left.programId, right.programId) ||
    compareStrings(left.name, right.name)
  );
}

export function compareProjects(left: ProjectRef, right: ProjectRef): number {
  return (
    compareStrings(left.portfolioId, right.portfolioId) ||
    compareStrings(left.programId, right.programId) ||
    compareStrings(left.projectId, right.projectId) ||
    compareStrings(left.name, right.name)
  );
}

export function compareMemberships(left: ProgramMembership, right: ProgramMembership): number {
  return (
    compareStrings(left.portfolioId, right.portfolioId) ||
    compareStrings(left.programId, right.programId) ||
    compareStrings(left.projectId, right.projectId) ||
    compareStrings(normalizeRecordedAt(left.recordedAt), normalizeRecordedAt(right.recordedAt))
  );
}

export function compareIntegrationPoints(
  left: IntegrationPointRecord,
  right: IntegrationPointRecord
): number {
  return (
    compareStrings(left.portfolioId, right.portfolioId) ||
    compareStrings(left.integrationPointId, right.integrationPointId) ||
    compareStrings(left.producerProjectId, right.producerProjectId) ||
    compareStrings(normalizeRecordedAt(left.recordedAt), normalizeRecordedAt(right.recordedAt))
  );
}

export function compareContracts(left: ContractRecord, right: ContractRecord): number {
  return (
    compareStrings(left.portfolioId, right.portfolioId) ||
    compareStrings(left.contractRef, right.contractRef) ||
    compareStrings(left.integrationPointId, right.integrationPointId) ||
    compareStrings(normalizeRecordedAt(left.recordedAt), normalizeRecordedAt(right.recordedAt))
  );
}

export function compareRelationships(left: GraphRelationship, right: GraphRelationship): number {
  return (
    compareStrings(left.recordedAt, right.recordedAt) ||
    compareStrings(left.dependencyId, right.dependencyId) ||
    compareStrings(left.fromRef, right.fromRef) ||
    compareStrings(left.toRef, right.toRef) ||
    compareStrings(left.dependencyType, right.dependencyType)
  );
}

export function compareEvidenceRefs(left: EvidenceRef, right: EvidenceRef): number {
  return (
    compareStrings(left.portfolioId, right.portfolioId) ||
    compareStrings(left.evidenceRef, right.evidenceRef) ||
    compareOptionalStrings(left.artifactRef, right.artifactRef)
  );
}

export function compareArtifactRefs(left: ArtifactRef, right: ArtifactRef): number {
  return (
    compareStrings(left.portfolioId, right.portfolioId) ||
    compareStrings(left.artifactRef, right.artifactRef)
  );
}

export function compareDecisions(left: DecisionRecordEnvelope, right: DecisionRecordEnvelope): number {
  return (
    compareStrings(left.recordedAt, right.recordedAt) ||
    compareStrings(left.decisionId, right.decisionId)
  );
}

export function compareIntelligenceRecords(
  left: ProgramIntelligenceRecord,
  right: ProgramIntelligenceRecord
): number {
  return (
    compareStrings(left.recordedAt, right.recordedAt) ||
    compareStrings(left.recordType, right.recordType) ||
    compareStrings(left.recordId, right.recordId)
  );
}

export function compareEvents(left: ProgramEvent, right: ProgramEvent): number {
  return (
    compareStrings(left.recordedAt, right.recordedAt) ||
    compareStrings(left.eventId, right.eventId)
  );
}

export function compareSyncCursors(left: SyncCursorRecord, right: SyncCursorRecord): number {
  return (
    compareStrings(left.portfolioId, right.portfolioId) ||
    compareStrings(left.adapterId, right.adapterId) ||
    compareStrings(left.recordedAt, right.recordedAt)
  );
}

function inScope(
  portfolioId: string,
  programId: string | undefined,
  scope: RepositoryScope
): boolean {
  if (portfolioId !== scope.portfolioId) {
    return false;
  }
  if (scope.programId && programId !== scope.programId) {
    return false;
  }
  return true;
}

function matchesProjectScope(projectId: string | undefined, scope: RepositoryScope): boolean {
  if (!scope.projectIds?.length) {
    return true;
  }
  if (!projectId) {
    return false;
  }
  return scope.projectIds.includes(projectId);
}

type EntityCollection<T> = {
  data: T[];
  keyOf: (value: T) => string;
  clone: (value: T) => T;
};

function upsertEntity<T>(collection: EntityCollection<T>, value: T): void {
  const key = collection.keyOf(value);
  const index = collection.data.findIndex((entry) => collection.keyOf(entry) === key);
  const nextValue = collection.clone(value);
  if (index === -1) {
    collection.data.push(nextValue);
    return;
  }
  collection.data[index] = nextValue;
}

export class InMemoryProgramManagerGraphStore implements ProgramManagerGraphStore {
  private readonly programs: ProgramRef[] = [];
  private readonly projects: ProjectRef[] = [];
  private readonly memberships: ProgramMembership[] = [];
  private readonly integrationPoints: IntegrationPointRecord[] = [];
  private readonly contracts: ContractRecord[] = [];
  private readonly relationships: GraphRelationship[] = [];
  private readonly evidenceRefs: EvidenceRef[] = [];
  private readonly artifactRefs: ArtifactRef[] = [];
  private readonly decisions: DecisionRecordEnvelope[] = [];
  private readonly intelligenceRecords: ProgramIntelligenceRecord[] = [];
  private readonly events: ProgramEvent[] = [];
  private readonly syncCursors: SyncCursorRecord[] = [];

  async seed(seed: ProgramManagerGraphSeed): Promise<void> {
    for (const program of seed.programs ?? []) {
      await this.upsertProgram(program);
    }
    for (const project of seed.projects ?? []) {
      await this.upsertProject(project);
    }
    for (const membership of seed.memberships ?? []) {
      await this.upsertMembership(membership);
    }
    for (const integrationPoint of seed.integrationPoints ?? []) {
      await this.upsertIntegrationPoint(integrationPoint);
    }
    for (const contract of seed.contracts ?? []) {
      await this.upsertContract(contract);
    }
    for (const relationship of seed.relationships ?? []) {
      await this.upsertRelationship(relationship);
    }
    for (const evidenceRef of seed.evidenceRefs ?? []) {
      await this.upsertEvidenceRef(evidenceRef);
    }
    for (const artifactRef of seed.artifactRefs ?? []) {
      await this.upsertArtifactRef(artifactRef);
    }
    for (const decision of seed.decisions ?? []) {
      await this.upsertDecision(decision);
    }
    for (const record of seed.intelligenceRecords ?? []) {
      await this.upsertIntelligenceRecord(record);
    }
    for (const event of seed.events ?? []) {
      await this.appendEvent(event);
    }
    for (const cursor of seed.syncCursors ?? []) {
      await this.upsertSyncCursor(cursor);
    }
  }

  async upsertProgram(program: ProgramRef): Promise<void> {
    upsertEntity(
      {
        data: this.programs,
        keyOf: (value) => `${value.portfolioId}::${value.programId}`,
        clone: cloneProgram
      },
      program
    );
  }

  async upsertProject(project: ProjectRef): Promise<void> {
    upsertEntity(
      {
        data: this.projects,
        keyOf: (value) => `${value.portfolioId}::${value.programId}::${value.projectId}`,
        clone: cloneProject
      },
      project
    );
  }

  async upsertMembership(membership: ProgramMembership): Promise<void> {
    upsertEntity(
      {
        data: this.memberships,
        keyOf: (value) => `${value.portfolioId}::${value.programId}::${value.projectId}`,
        clone: cloneMembership
      },
      membership
    );
  }

  async upsertIntegrationPoint(integrationPoint: IntegrationPointRecord): Promise<void> {
    upsertEntity(
      {
        data: this.integrationPoints,
        keyOf: (value) => `${value.portfolioId}::${value.integrationPointId}`,
        clone: cloneIntegrationPoint
      },
      integrationPoint
    );
  }

  async upsertContract(contract: ContractRecord): Promise<void> {
    upsertEntity(
      {
        data: this.contracts,
        keyOf: (value) => `${value.portfolioId}::${value.contractRef}`,
        clone: cloneContract
      },
      contract
    );
  }

  async upsertRelationship(relationship: GraphRelationship): Promise<void> {
    upsertEntity(
      {
        data: this.relationships,
        keyOf: (value) => `${value.portfolioId}::${value.dependencyId}`,
        clone: cloneRelationship
      },
      relationship
    );
  }

  async upsertEvidenceRef(evidenceRef: EvidenceRef): Promise<void> {
    upsertEntity(
      {
        data: this.evidenceRefs,
        keyOf: (value) => `${value.portfolioId}::${value.evidenceRef}`,
        clone: cloneEvidenceRef
      },
      evidenceRef
    );
  }

  async upsertArtifactRef(artifactRef: ArtifactRef): Promise<void> {
    upsertEntity(
      {
        data: this.artifactRefs,
        keyOf: (value) => `${value.portfolioId}::${value.artifactRef}`,
        clone: cloneArtifactRef
      },
      artifactRef
    );
  }

  async upsertDecision(decision: DecisionRecordEnvelope): Promise<void> {
    upsertEntity(
      {
        data: this.decisions,
        keyOf: (value) => `${value.portfolioId}::${value.decisionId}`,
        clone: cloneDecision
      },
      decision
    );
  }

  async upsertIntelligenceRecord(record: ProgramIntelligenceRecord): Promise<void> {
    upsertEntity(
      {
        data: this.intelligenceRecords,
        keyOf: (value) => `${value.portfolioId}::${value.recordId}`,
        clone: cloneIntelligenceRecord
      },
      record
    );
  }

  async appendEvent(event: ProgramEvent): Promise<void> {
    upsertEntity(
      {
        data: this.events,
        keyOf: (value) => `${value.portfolioId}::${value.eventId}`,
        clone: cloneEvent
      },
      event
    );
  }

  async upsertSyncCursor(cursor: SyncCursorRecord): Promise<void> {
    upsertEntity(
      {
        data: this.syncCursors,
        keyOf: (value) => `${value.portfolioId}::${value.adapterId}`,
        clone: cloneCursor
      },
      cursor
    );
  }

  async listPrograms(scope: RepositoryScope): Promise<ProgramRef[]> {
    return this.programs
      .filter((program) => inScope(program.portfolioId, program.programId, scope))
      .map(cloneProgram);
  }

  async listProjects(scope: RepositoryScope): Promise<ProjectRef[]> {
    return this.projects
      .filter(
        (project) =>
          inScope(project.portfolioId, project.programId, scope) &&
          matchesProjectScope(project.projectId, scope)
      )
      .map(cloneProject);
  }

  async listMemberships(scope: RepositoryScope): Promise<ProgramMembership[]> {
    return this.memberships
      .filter(
        (membership) =>
          inScope(membership.portfolioId, membership.programId, scope) &&
          matchesProjectScope(membership.projectId, scope)
      )
      .map(cloneMembership);
  }

  async listIntegrationPoints(scope: RepositoryScope): Promise<IntegrationPointRecord[]> {
    const projectToProgramId = new Map(
      this.projects.map((project) => [project.projectId, project.programId])
    );
    return this.integrationPoints
      .filter((integrationPoint) => {
        if (integrationPoint.portfolioId !== scope.portfolioId) {
          return false;
        }
        const relatedProjectIds = [
          integrationPoint.producerProjectId,
          ...integrationPoint.consumerProjectIds
        ];
        if (scope.programId) {
          const inProgram = relatedProjectIds.some(
            (projectId) => projectToProgramId.get(projectId) === scope.programId
          );
          if (!inProgram) {
            return false;
          }
        }
        if (!scope.projectIds?.length) {
          return true;
        }
        return relatedProjectIds.some((projectId) => scope.projectIds?.includes(projectId));
      })
      .map(cloneIntegrationPoint);
  }

  async listContracts(scope: RepositoryScope): Promise<ContractRecord[]> {
    const projectToProgramId = new Map(
      this.projects.map((project) => [project.projectId, project.programId])
    );
    return this.contracts
      .filter((contract) => {
        if (contract.portfolioId !== scope.portfolioId) {
          return false;
        }
        if (scope.programId && projectToProgramId.get(contract.producerProjectId) !== scope.programId) {
          return false;
        }
        return matchesProjectScope(contract.producerProjectId, scope);
      })
      .map(cloneContract);
  }

  async listRelationships(scope: RepositoryScope): Promise<GraphRelationship[]> {
    return this.relationships
      .filter(
        (relationship) =>
          inScope(relationship.portfolioId, relationship.programId, scope) &&
          matchesProjectScope(relationship.projectId, scope)
      )
      .map(cloneRelationship);
  }

  async listEvidenceRefs(scope: RepositoryScope, refs?: string[]): Promise<EvidenceRef[]> {
    const refSet = refs ? new Set(refs) : undefined;
    return this.evidenceRefs
      .filter(
        (evidenceRef) =>
          evidenceRef.portfolioId === scope.portfolioId &&
          (!refSet || refSet.has(evidenceRef.evidenceRef))
      )
      .map(cloneEvidenceRef);
  }

  async listArtifactRefs(scope: RepositoryScope, refs?: string[]): Promise<ArtifactRef[]> {
    const refSet = refs ? new Set(refs) : undefined;
    return this.artifactRefs
      .filter(
        (artifactRef) =>
          artifactRef.portfolioId === scope.portfolioId &&
          (!refSet || refSet.has(artifactRef.artifactRef))
      )
      .map(cloneArtifactRef);
  }

  async listDecisions(query: DecisionQuery): Promise<DecisionRecordEnvelope[]> {
    const targetRefSet = query.targetRefs?.length ? new Set(query.targetRefs) : undefined;
    return this.decisions
      .filter((decision) => {
        if (!inScope(decision.portfolioId, decision.programId, query.scope)) {
          return false;
        }
        if (!matchesProjectScope(decision.projectId, query.scope)) {
          return false;
        }
        if (query.statuses && !query.statuses.includes(decision.status)) {
          return false;
        }
        if (!targetRefSet) {
          return true;
        }
        if (targetRefSet.has(decision.decisionId)) {
          return true;
        }
        return (decision.appliesToRefs ?? []).some((ref) => targetRefSet.has(ref));
      })
      .map(cloneDecision);
  }

  async listIntelligenceRecords(
    query: ProgramIntelligenceQuery
  ): Promise<ProgramIntelligenceRecord[]> {
    const targetRefSet = query.targetRefs?.length ? new Set(query.targetRefs) : undefined;
    const conditionTagSet = query.conditionTags?.length ? new Set(query.conditionTags) : undefined;
    return this.intelligenceRecords
      .filter((record) => {
        if (!inScope(record.portfolioId, record.programId, query.scope)) {
          return false;
        }
        if (!matchesProjectScope(record.projectId, query.scope)) {
          return false;
        }
        if (query.recordTypes && !query.recordTypes.includes(record.recordType)) {
          return false;
        }
        if (query.reviewStatuses && !query.reviewStatuses.includes(record.reviewStatus)) {
          return false;
        }
        if (targetRefSet) {
          const refs = [
            record.recordId,
            ...record.appliesToRefs,
            ...record.sourceRefs,
            ...record.evidenceRefs
          ];
          if (!refs.some((ref) => targetRefSet.has(ref))) {
            return false;
          }
        }
        if (conditionTagSet && !record.conditionTags.some((tag) => conditionTagSet.has(tag))) {
          return false;
        }
        return true;
      })
      .map(cloneIntelligenceRecord);
  }

  async listEvents(scope: RepositoryScope): Promise<ProgramEvent[]> {
    return this.events
      .filter((event) => event.portfolioId === scope.portfolioId)
      .map(cloneEvent);
  }

  async listSyncCursors(scope: RepositoryScope): Promise<SyncCursorRecord[]> {
    return this.syncCursors
      .filter((cursor) => cursor.portfolioId === scope.portfolioId)
      .map(cloneCursor);
  }
}
