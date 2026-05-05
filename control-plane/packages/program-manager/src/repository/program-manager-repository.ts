import type {
  ArtifactRef,
  ContextAnchor,
  DecisionRecord,
  EvidenceRef,
  ExpectedReceipt,
  GraphRelationship,
  ActionLedgerEntry,
  ObservedReceipt,
  PmoBlocker,
  PmoContract,
  PmoDependencyEdge,
  PmoMacroRegistry,
  PmoRunbook,
  PmoTask,
  IntelligenceRecordType,
  IntelligenceReviewStatus,
  ProgramEvent,
  ProgramIntelligenceRecord,
  ProgramRef,
  ProjectRef,
  ReceiptReconcileRecord,
  ReceiptReconcileStatus,
  SyncCursor
} from "../types/domain.js";

export type RepositoryScope = {
  portfolioId: string;
  programId?: string;
  projectIds?: string[];
};

export type IntegrationCoordinationItem = {
  affectedProjectIds: string[];
  artifactRefs: string[];
  blockedProjectId?: string;
  blockedOnRefs?: string[];
  clearanceCriteria?: Array<{
    ref: string;
    requiredStatus: string;
  }>;
  createdAt: string;
  evidenceRefs: string[];
  integrationPointId: string;
  itemId: string;
  itemType:
    | "artifact"
    | "blocker"
    | "conflict"
    | "decision"
    | "gap"
    | "goal"
    | "learning"
    | "response"
    | "tracker_ref";
  ownerProjectId?: string;
  projectId?: string;
  reporterProjectId?: string;
  status: string;
  summary?: string;
  trackerRefs: string[];
  updatedAt?: string;
};

export type IntegrationPointRecord = {
  integrationPointId: string;
  portfolioId: string;
  producerProjectId: string;
  consumerProjectIds: string[];
  artifactRefs?: string[];
  coordinationItems?: IntegrationCoordinationItem[];
  purpose?: string;
  recordedAt?: string;
  evidenceRefs?: string[];
  idempotencyKeys?: string[];
  projectRoles?: Record<string, string>;
  statusHistory?: Array<{
    status: "active" | "retired";
    action: string;
    recordedAt: string;
    evidenceRefs: string[];
  }>;
  status?: "active" | "retired";
};

export type DecisionQuery = {
  scope: RepositoryScope;
  contextAnchor?: ContextAnchor;
  statuses?: DecisionRecord["status"][];
  targetRefs?: string[];
};

export type ProgramContextQuery = {
  scope: RepositoryScope;
  contextAnchor?: ContextAnchor;
  targetRefs: string[];
  includeSuperseded?: boolean;
  includeFutureNotApplicable?: boolean;
  limit?: number;
};

export type ImpactAssessmentQuery = {
  scope: RepositoryScope;
  changeRef: string;
  changeKind: string;
  targetRefs: string[];
  traversalBudgetRef: string;
  contextAnchor?: ContextAnchor;
};

export type ImpactAssessmentResult = {
  affectedRefs: Array<{ kind: string; ref: string; reason: string }>;
  findings: Array<{
    findingId: string;
    severity: "low" | "medium" | "high" | "critical";
    type: string;
    summary: string;
    evidenceRefs: string[];
  }>;
  requiredApprovals: Array<{
    authorityRef: string;
    reason: string;
    evidencePolicyRefs: string[];
  }>;
  evidenceObligations: Array<{
    policyRef: string;
    targetRef: string;
    status: "satisfied" | "missing" | "stale";
  }>;
};

export type ProgramIntelligenceQuery = {
  scope: RepositoryScope;
  contextAnchor?: ContextAnchor;
  recordTypes?: IntelligenceRecordType[];
  reviewStatuses?: IntelligenceReviewStatus[];
  targetRefs?: string[];
  conditionTags?: string[];
  limit?: number;
};

export type ReceiptLedgerQuery = {
  scope: RepositoryScope;
  actorIds?: string[];
  contractRefs?: string[];
  evidenceRefs?: string[];
  flightPlanIds?: string[];
  proposedActionIds?: string[];
  receiptRequirementIds?: string[];
  reconcileStatuses?: ReceiptReconcileStatus[];
  observedStatuses?: ObservedReceipt["status"][];
  limit?: number;
};

export type ReceiptLedgerState = {
  expectedReceipts: ExpectedReceipt[];
  observedReceipts: ObservedReceipt[];
  actionLedgerEntries: ActionLedgerEntry[];
  reconcileStatuses: ReceiptReconcileRecord[];
};

export type ProgramEventCausationQuery = {
  scope: RepositoryScope;
  causedByEventId: string;
  limit?: number;
};

export type MacroFactQuery = {
  scope: RepositoryScope;
  contextAnchor?: ContextAnchor;
  targetRefs?: string[];
  includeSuperseded?: boolean;
  limit?: number;
};

export type MacroFactSet = {
  tasks: PmoTask[];
  blockers: PmoBlocker[];
  contracts: PmoContract[];
  dependencyEdges: PmoDependencyEdge[];
  runbooks: PmoRunbook[];
};

export interface ProgramManagerRepository {
  listPrograms(scope: RepositoryScope): Promise<ProgramRef[]>;
  listProjects(scope: RepositoryScope): Promise<ProjectRef[]>;
  listIntegrationPoints(scope: RepositoryScope): Promise<IntegrationPointRecord[]>;
  upsertProgram(program: ProgramRef, auditEvent?: ProgramEvent): Promise<void>;
  upsertProject(project: ProjectRef, auditEvent?: ProgramEvent): Promise<void>;
  upsertIntegrationPoint(integrationPoint: IntegrationPointRecord, auditEvent?: ProgramEvent): Promise<void>;
  getProgramContext(query: ProgramContextQuery): Promise<{
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
  }>;
  assessImpact(query: ImpactAssessmentQuery): Promise<ImpactAssessmentResult>;
  listRelationships(scope: RepositoryScope): Promise<GraphRelationship[]>;
  listEvidenceRefs(scope: RepositoryScope, refs?: string[]): Promise<EvidenceRef[]>;
  listArtifactRefs(scope: RepositoryScope, refs?: string[]): Promise<ArtifactRef[]>;
  upsertEvidenceRef(evidenceRef: EvidenceRef, auditEvent?: ProgramEvent): Promise<void>;
  upsertArtifactRef(artifactRef: ArtifactRef, auditEvent?: ProgramEvent): Promise<void>;
  listDecisions(query: DecisionQuery): Promise<DecisionRecord[]>;
  listIntelligenceRecords(query: ProgramIntelligenceQuery): Promise<ProgramIntelligenceRecord[]>;
  upsertExpectedReceipts(receipts: ExpectedReceipt[], auditEvent?: ProgramEvent): Promise<void>;
  appendObservedReceipt(receipt: ObservedReceipt, auditEvent: ProgramEvent): Promise<void>;
  appendActionLedgerEntry(entry: ActionLedgerEntry): Promise<void>;
  upsertReceiptReconcileStatus(status: ReceiptReconcileRecord, auditEvent?: ProgramEvent): Promise<void>;
  listReceiptLedger(query: ReceiptLedgerQuery): Promise<ReceiptLedgerState>;
  listMacroFacts(query: MacroFactQuery): Promise<MacroFactSet>;
  getMacroRegistry(scope: RepositoryScope): Promise<PmoMacroRegistry | undefined>;
  upsertMacroRegistry(registry: PmoMacroRegistry, auditEvent?: ProgramEvent): Promise<void>;
  appendEvent(event: ProgramEvent): Promise<ProgramEvent>;
  getEventByIdempotencyKey(scope: RepositoryScope, idempotencyKey: string): Promise<ProgramEvent | undefined>;
  listEventsByCausation(query: ProgramEventCausationQuery): Promise<ProgramEvent[]>;
  listEvents(scope: RepositoryScope, limit?: number): Promise<ProgramEvent[]>;
  getSyncCursors(scope: RepositoryScope): Promise<SyncCursor[]>;
}
