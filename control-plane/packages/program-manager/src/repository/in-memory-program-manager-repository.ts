import type {
  ArtifactRef,
  ContextAnchor,
  DecisionRecord,
  EvidenceRef,
  ExpectedReceipt,
  GraphRelationship,
  ActionLedgerEntry,
  ObservedReceipt,
  ProgramEvent,
  ProgramIntelligenceRecord,
  ProgramRef,
  ProjectRef,
  ReceiptReconcileRecord,
  SyncCursor
} from "../types/domain.js";
import type {
  DecisionQuery,
  ImpactAssessmentQuery,
  ImpactAssessmentResult,
  ProgramContextQuery,
  ProgramIntelligenceQuery,
  ProgramManagerRepository,
  ReceiptLedgerQuery,
  ReceiptLedgerState,
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
  expectedReceipts?: ExpectedReceipt[];
  observedReceipts?: ObservedReceipt[];
  actionLedgerEntries?: ActionLedgerEntry[];
  receiptReconcileStatuses?: ReceiptReconcileRecord[];
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
  private expectedReceipts: ExpectedReceipt[] = [];
  private observedReceipts: ObservedReceipt[] = [];
  private actionLedgerEntries: ActionLedgerEntry[] = [];
  private receiptReconcileStatuses: ReceiptReconcileRecord[] = [];
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
    this.expectedReceipts = fixture.expectedReceipts ?? this.expectedReceipts;
    this.observedReceipts = fixture.observedReceipts ?? this.observedReceipts;
    this.actionLedgerEntries = fixture.actionLedgerEntries ?? this.actionLedgerEntries;
    this.receiptReconcileStatuses = fixture.receiptReconcileStatuses ?? this.receiptReconcileStatuses;
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

  async upsertExpectedReceipts(receipts: ExpectedReceipt[], auditEvent?: ProgramEvent): Promise<void> {
    for (const receipt of receipts) {
      this.expectedReceipts = upsertBy(
        this.expectedReceipts,
        receipt,
        (value) => `${value.portfolioId}::${value.receiptRequirementId}`,
        cloneExpectedReceipt
      );
    }
    if (auditEvent) {
      this.events.push(cloneEvent(auditEvent));
    }
  }

  async appendObservedReceipt(receipt: ObservedReceipt, auditEvent: ProgramEvent): Promise<void> {
    this.observedReceipts.push(cloneObservedReceipt(receipt));
    this.events.push(cloneEvent(auditEvent));
  }

  async appendActionLedgerEntry(entry: ActionLedgerEntry): Promise<void> {
    this.actionLedgerEntries.push(cloneActionLedgerEntry(entry));
  }

  async upsertReceiptReconcileStatus(
    status: ReceiptReconcileRecord,
    auditEvent?: ProgramEvent
  ): Promise<void> {
    this.receiptReconcileStatuses = upsertBy(
      this.receiptReconcileStatuses,
      status,
      (value) => `${value.portfolioId}::${value.receiptRequirementId}`,
      cloneReceiptReconcileRecord
    );
    if (auditEvent) {
      this.events.push(cloneEvent(auditEvent));
    }
  }

  async listReceiptLedger(query: ReceiptLedgerQuery): Promise<ReceiptLedgerState> {
    const expectedReceipts = this.expectedReceipts
      .filter((receipt) => receiptMatchesQuery(receipt, query))
      .map(cloneExpectedReceipt)
      .sort(compareExpectedReceipts);
    const observedReceipts = this.observedReceipts
      .filter((receipt) => observedReceiptMatchesQuery(receipt, query))
      .map(cloneObservedReceipt)
      .sort(compareObservedReceipts);
    const actionLedgerEntries = this.actionLedgerEntries
      .filter((entry) => actionLedgerEntryMatchesQuery(entry, query))
      .map(cloneActionLedgerEntry)
      .sort(compareActionLedgerEntries);
    const reconcileStatuses = this.receiptReconcileStatuses
      .filter((status) => reconcileStatusMatchesQuery(status, query))
      .map(cloneReceiptReconcileRecord)
      .sort(compareReceiptReconcileRecords);
    const limit = query.limit;

    return {
      expectedReceipts: typeof limit === "number" ? expectedReceipts.slice(0, limit) : expectedReceipts,
      observedReceipts: typeof limit === "number" ? observedReceipts.slice(0, limit) : observedReceipts,
      actionLedgerEntries:
        typeof limit === "number" ? actionLedgerEntries.slice(0, limit) : actionLedgerEntries,
      reconcileStatuses: typeof limit === "number" ? reconcileStatuses.slice(0, limit) : reconcileStatuses
    };
  }

  async listEvents(scope: RepositoryScope, limit?: number): Promise<ProgramEvent[]> {
    const filtered = this.events
      .filter((item) => item.portfolioId === scope.portfolioId)
      .map(cloneEvent)
      .sort(compareEventsDescending);
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

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right);
}

function sortStrings(values: string[]): string[] {
  return [...values].sort(compareStrings);
}

function cloneEvent(event: ProgramEvent): ProgramEvent {
  return {
    ...event,
    contextAnchor: event.contextAnchor ? { ...event.contextAnchor } : undefined,
    evidenceRefs: sortStrings(event.evidenceRefs),
    artifactRefs: sortStrings(event.artifactRefs)
  };
}

function cloneExpectedReceipt(receipt: ExpectedReceipt): ExpectedReceipt {
  return {
    ...receipt,
    contractRefs: sortStrings(receipt.contractRefs),
    evidencePolicyRefs: sortStrings(receipt.evidencePolicyRefs),
    requiredEvidenceRefs: sortStrings(receipt.requiredEvidenceRefs),
    scopeRefs: sortStrings(receipt.scopeRefs)
  };
}

function cloneObservedReceipt(receipt: ObservedReceipt): ObservedReceipt {
  return {
    ...receipt,
    contractRefs: sortStrings(receipt.contractRefs),
    evidenceRefs: sortStrings(receipt.evidenceRefs),
    artifactRefs: sortStrings(receipt.artifactRefs),
    observedStateRefs: sortStrings(receipt.observedStateRefs)
  };
}

function cloneActionLedgerEntry(entry: ActionLedgerEntry): ActionLedgerEntry {
  return {
    ...entry,
    contractRefs: sortStrings(entry.contractRefs),
    evidenceRefs: sortStrings(entry.evidenceRefs),
    artifactRefs: sortStrings(entry.artifactRefs)
  };
}

function cloneReceiptReconcileRecord(record: ReceiptReconcileRecord): ReceiptReconcileRecord {
  return {
    ...record,
    contractRefs: sortStrings(record.contractRefs),
    evidenceRefs: sortStrings(record.evidenceRefs)
  };
}

function upsertBy<T>(
  values: T[],
  value: T,
  keyOf: (item: T) => string,
  clone: (item: T) => T
): T[] {
  const key = keyOf(value);
  const next = values.slice();
  const index = next.findIndex((item) => keyOf(item) === key);
  if (index === -1) {
    next.push(clone(value));
  } else {
    next[index] = clone(value);
  }
  return next;
}

function scopeMatches(
  portfolioId: string,
  programId: string | undefined,
  projectId: string | undefined,
  scope: RepositoryScope
): boolean {
  if (portfolioId !== scope.portfolioId) {
    return false;
  }
  if (scope.programId && programId !== scope.programId) {
    return false;
  }
  if (scope.projectIds?.length && (!projectId || !scope.projectIds.includes(projectId))) {
    return false;
  }
  return true;
}

function overlaps(filter: string[] | undefined, values: string[]): boolean {
  if (!filter?.length) {
    return true;
  }
  return filter.some((value) => values.includes(value));
}

function matchesCommonLedgerFilters(
  value: {
    actorId?: string;
    contractRefs: string[];
    evidenceRefs?: string[];
    flightPlanId: string;
    portfolioId: string;
    programId?: string;
    projectId?: string;
    proposedActionId: string;
    receiptRequirementId?: string;
  },
  query: ReceiptLedgerQuery
): boolean {
  return (
    scopeMatches(value.portfolioId, value.programId, value.projectId, query.scope) &&
    overlaps(query.actorIds, value.actorId ? [value.actorId] : []) &&
    overlaps(query.contractRefs, value.contractRefs) &&
    overlaps(query.evidenceRefs, value.evidenceRefs ?? []) &&
    overlaps(query.flightPlanIds, [value.flightPlanId]) &&
    overlaps(query.proposedActionIds, [value.proposedActionId]) &&
    overlaps(query.receiptRequirementIds, value.receiptRequirementId ? [value.receiptRequirementId] : [])
  );
}

function receiptMatchesQuery(receipt: ExpectedReceipt, query: ReceiptLedgerQuery): boolean {
  return matchesCommonLedgerFilters(
    {
      ...receipt,
      evidenceRefs: receipt.requiredEvidenceRefs
    },
    query
  );
}

function observedReceiptMatchesQuery(receipt: ObservedReceipt, query: ReceiptLedgerQuery): boolean {
  return (
    matchesCommonLedgerFilters(receipt, query) &&
    (!query.observedStatuses?.length || query.observedStatuses.includes(receipt.status))
  );
}

function actionLedgerEntryMatchesQuery(entry: ActionLedgerEntry, query: ReceiptLedgerQuery): boolean {
  return matchesCommonLedgerFilters(entry, query);
}

function reconcileStatusMatchesQuery(
  status: ReceiptReconcileRecord,
  query: ReceiptLedgerQuery
): boolean {
  return (
    matchesCommonLedgerFilters(status, query) &&
    (!query.reconcileStatuses?.length || query.reconcileStatuses.includes(status.status))
  );
}

function compareExpectedReceipts(left: ExpectedReceipt, right: ExpectedReceipt): number {
  return (
    compareStrings(left.flightPlanId, right.flightPlanId) ||
    compareStrings(left.proposedActionId, right.proposedActionId) ||
    compareStrings(left.receiptRequirementId, right.receiptRequirementId)
  );
}

function compareObservedReceipts(left: ObservedReceipt, right: ObservedReceipt): number {
  return (
    compareStrings(left.recordedAt, right.recordedAt) ||
    compareStrings(left.observedReceiptId, right.observedReceiptId)
  );
}

function compareActionLedgerEntries(left: ActionLedgerEntry, right: ActionLedgerEntry): number {
  return (
    compareStrings(left.recordedAt, right.recordedAt) ||
    compareStrings(left.ledgerEntryId, right.ledgerEntryId)
  );
}

function compareReceiptReconcileRecords(
  left: ReceiptReconcileRecord,
  right: ReceiptReconcileRecord
): number {
  return (
    compareStrings(left.flightPlanId, right.flightPlanId) ||
    compareStrings(left.proposedActionId, right.proposedActionId) ||
    compareStrings(left.receiptRequirementId, right.receiptRequirementId)
  );
}

function compareEventsDescending(left: ProgramEvent, right: ProgramEvent): number {
  return (
    compareStrings(right.recordedAt, left.recordedAt) ||
    compareStrings(left.eventId, right.eventId)
  );
}
