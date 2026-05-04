import type {
  ArtifactRef,
  ContextAnchor,
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
  ImpactAssessmentQuery,
  ImpactAssessmentResult,
  ProgramContextQuery,
  ProgramIntelligenceQuery,
  ProgramManagerRepository,
  RepositoryScope
} from "./program-manager-repository.js";

type FixtureData = {
  programs?: ProgramRef[];
  projects?: ProjectRef[];
  relationships?: GraphRelationship[];
  evidenceRefs?: EvidenceRef[];
  artifactRefs?: ArtifactRef[];
  decisions?: DecisionRecord[];
  intelligenceRecords?: ProgramIntelligenceRecord[];
  events?: ProgramEvent[];
  syncCursors?: SyncCursor[];
  contextMatches?: Array<{
    ref: string;
    kind: string;
    status: string;
    reason: string;
    validFrom?: string;
    validTo?: string;
    recordedAt: string;
    evidenceRefs: string[];
  }>;
  impact?: ImpactAssessmentResult;
  contextAnchor?: ContextAnchor;
};

export class InMemoryProgramManagerRepository implements ProgramManagerRepository {
  private programs: ProgramRef[] = [];
  private projects: ProjectRef[] = [];
  private relationships: GraphRelationship[] = [];
  private evidenceRefs: EvidenceRef[] = [];
  private artifactRefs: ArtifactRef[] = [];
  private decisions: DecisionRecord[] = [];
  private intelligenceRecords: ProgramIntelligenceRecord[] = [];
  private events: ProgramEvent[] = [];
  private syncCursors: SyncCursor[] = [];
  private contextMatches: NonNullable<FixtureData["contextMatches"]> = [];
  private contextAnchor: ContextAnchor | undefined;
  private impact: ImpactAssessmentResult = {
    affectedRefs: [],
    findings: [],
    requiredApprovals: [],
    evidenceObligations: []
  };

  static fromFixture(fixture: FixtureData): InMemoryProgramManagerRepository {
    const repo = new InMemoryProgramManagerRepository();
    repo.seed(fixture);
    return repo;
  }

  seed(fixture: FixtureData): void {
    this.programs = fixture.programs ?? this.programs;
    this.projects = fixture.projects ?? this.projects;
    this.relationships = fixture.relationships ?? this.relationships;
    this.evidenceRefs = fixture.evidenceRefs ?? this.evidenceRefs;
    this.artifactRefs = fixture.artifactRefs ?? this.artifactRefs;
    this.decisions = fixture.decisions ?? this.decisions;
    this.intelligenceRecords = fixture.intelligenceRecords ?? this.intelligenceRecords;
    this.events = fixture.events ?? this.events;
    this.syncCursors = fixture.syncCursors ?? this.syncCursors;
    this.contextMatches = fixture.contextMatches ?? this.contextMatches;
    this.contextAnchor = fixture.contextAnchor ?? this.contextAnchor;
    this.impact = fixture.impact ?? this.impact;
  }

  async listPrograms(scope: RepositoryScope): Promise<ProgramRef[]> {
    return this.programs.filter((program) => this.inScope(program.portfolioId, program.programId, scope));
  }

  async listProjects(scope: RepositoryScope): Promise<ProjectRef[]> {
    return this.projects.filter((project) =>
      this.inScope(project.portfolioId, project.programId, scope) &&
      (!scope.projectIds || scope.projectIds.includes(project.projectId))
    );
  }

  async getProgramContext(query: ProgramContextQuery): Promise<{
    contextAnchor?: ContextAnchor;
    matchedRefs: Array<{
      ref: string;
      kind: string;
      status: string;
      reason: string;
      validFrom?: string;
      validTo?: string;
      recordedAt: string;
      evidenceRefs: string[];
    }>;
    omittedRefCount: number;
  }> {
    const refSet = new Set(query.targetRefs);
    const matchedRefs = this.contextMatches.filter((item) => refSet.has(item.ref));
    const limit = query.limit ?? matchedRefs.length;
    return {
      contextAnchor: query.contextAnchor ?? this.contextAnchor,
      matchedRefs: matchedRefs.slice(0, limit),
      omittedRefCount: Math.max(0, matchedRefs.length - limit)
    };
  }

  async assessImpact(_query: ImpactAssessmentQuery): Promise<ImpactAssessmentResult> {
    return this.impact;
  }

  async listRelationships(scope: RepositoryScope): Promise<GraphRelationship[]> {
    return this.relationships.filter((item) => this.inScope(item.portfolioId, item.programId, scope));
  }

  async listEvidenceRefs(scope: RepositoryScope, refs?: string[]): Promise<EvidenceRef[]> {
    const refSet = refs ? new Set(refs) : undefined;
    return this.evidenceRefs.filter(
      (item) =>
        item.portfolioId === scope.portfolioId &&
        (!refSet || refSet.has(item.evidenceRef))
    );
  }

  async listArtifactRefs(scope: RepositoryScope, refs?: string[]): Promise<ArtifactRef[]> {
    const refSet = refs ? new Set(refs) : undefined;
    return this.artifactRefs.filter(
      (item) =>
        item.portfolioId === scope.portfolioId &&
        (!refSet || refSet.has(item.artifactRef))
    );
  }

  async listDecisions(query: DecisionQuery): Promise<DecisionRecord[]> {
    return this.decisions.filter((decision) => {
      if (!this.inScope(decision.portfolioId, decision.programId, query.scope)) {
        return false;
      }
      if (query.statuses && !query.statuses.includes(decision.status)) {
        return false;
      }
      if (query.scope.projectIds?.length && decision.projectId && !query.scope.projectIds.includes(decision.projectId)) {
        return false;
      }
      return true;
    });
  }

  async listIntelligenceRecords(
    query: ProgramIntelligenceQuery
  ): Promise<ProgramIntelligenceRecord[]> {
    const targetRefSet = query.targetRefs?.length ? new Set(query.targetRefs) : undefined;
    const conditionTagSet = query.conditionTags?.length ? new Set(query.conditionTags) : undefined;
    const filtered = this.intelligenceRecords.filter((record) => {
      if (!this.inScope(record.portfolioId, record.programId, query.scope)) {
        return false;
      }
      if (query.scope.projectIds?.length && record.projectId && !query.scope.projectIds.includes(record.projectId)) {
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
    });
    const sorted = filtered.sort(
      (left, right) =>
        left.recordedAt.localeCompare(right.recordedAt) ||
        left.recordType.localeCompare(right.recordType) ||
        left.recordId.localeCompare(right.recordId)
    );
    return typeof query.limit === "number" ? sorted.slice(0, query.limit) : sorted;
  }

  async listEvents(scope: RepositoryScope, limit?: number): Promise<ProgramEvent[]> {
    const filtered = this.events.filter((item) => item.portfolioId === scope.portfolioId);
    if (!limit) {
      return filtered;
    }
    return filtered.slice(0, limit);
  }

  async getSyncCursors(scope: RepositoryScope): Promise<SyncCursor[]> {
    return this.syncCursors.filter((cursor) => cursor.portfolioId === scope.portfolioId);
  }

  private inScope(
    portfolioId: string,
    programId: string | undefined,
    scope: RepositoryScope
  ): boolean {
    if (portfolioId !== scope.portfolioId) {
      return false;
    }
    if (!scope.programId) {
      return true;
    }
    return programId === scope.programId;
  }
}
