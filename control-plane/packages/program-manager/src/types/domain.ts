export type Criticality = "tier_0" | "tier_1" | "tier_2" | "tier_3";

export type DependencyStatus =
  | "active"
  | "pending"
  | "satisfied"
  | "blocked"
  | "stale"
  | "superseded"
  | "discarded";

export type DecisionStatus =
  | "applicable"
  | "superseded"
  | "discarded"
  | "future_not_applicable";

export type EvidenceObligationStatus = "satisfied" | "missing" | "stale";

export type ReceiptReconcileStatus =
  | "expected"
  | "in_flight"
  | "partial"
  | "satisfied"
  | "late"
  | "lost"
  | "stuck"
  | "conflicting";

export type ContextAnchor = {
  portfolioId?: string;
  programId?: string;
  projectId?: string;
  repoId?: string;
  branchName?: string;
  gitCommit?: string;
  trackerSlug?: string;
  trackerRev?: number;
  hoplonSnapshotRef?: string;
  asOf?: string;
};

export type ProgramRef = {
  portfolioId: string;
  programId: string;
  name: string;
};

export type ProjectRef = {
  portfolioId: string;
  programId: string;
  projectId: string;
  name: string;
};

export type GraphRelationship = {
  dependencyId: string;
  portfolioId: string;
  programId?: string;
  projectId?: string;
  contractRef?: string;
  fromRef: string;
  toRef: string;
  dependencyType: string;
  criticality: Criticality;
  status: DependencyStatus;
  recordedAt: string;
  validFrom: string;
  validTo?: string;
  evidenceRefs: string[];
  policyRefs?: string[];
  sourceAdapterId: string;
  sourceCursor: string;
};

export type EvidenceRef = {
  evidenceRef: string;
  portfolioId: string;
  kind: string;
  recordedAt: string;
  artifactRef?: string;
};

export type ArtifactRef = {
  artifactRef: string;
  portfolioId: string;
  artifactType: string;
  storageUri: string;
  contentHash: {
    algorithm: "sha256";
    value: string;
  };
  redactionStatus: "not_required" | "redacted" | "pending_review" | "blocked";
  createdAt: string;
};

export type DecisionRecord = {
  decisionId: string;
  portfolioId: string;
  programId?: string;
  projectId?: string;
  summary: string;
  status: DecisionStatus;
  recordedAt: string;
  validFrom: string;
  validTo?: string;
  evidenceRefs: string[];
};

export type ProgramEvent = {
  eventId: string;
  portfolioId: string;
  eventType: string;
  recordedAt: string;
  contextAnchor?: ContextAnchor;
  evidenceRefs: string[];
  artifactRefs: string[];
};

export type ExpectedReceipt = {
  receiptRequirementId: string;
  portfolioId: string;
  programId?: string;
  projectId?: string;
  contractRefs: string[];
  flightPlanId: string;
  flightPlanHash: string;
  flightPlanStateVersionHash: string;
  proposedActionId: string;
  expectedReceiptType: string;
  actorId: string;
  traceId: string;
  correlationId: string;
  idempotencyKey: string;
  requiredVerifier: "adapter_observed_state" | "content_digest" | "operator_attestation";
  requiredEvidenceRefs: string[];
  evidencePolicyRefs: string[];
  scopeRefs: string[];
  dueAt?: string;
  recordedAt: string;
  status: "expected";
};

export type ObservedReceipt = {
  observedReceiptId: string;
  receiptRequirementId: string;
  portfolioId: string;
  programId?: string;
  projectId?: string;
  contractRefs: string[];
  flightPlanId: string;
  flightPlanHash: string;
  proposedActionId: string;
  actorId: string;
  traceId: string;
  correlationId: string;
  idempotencyKey: string;
  receiptType: string;
  receiptDigest: string;
  evidenceRefs: string[];
  artifactRefs: string[];
  observedStateRefs: string[];
  observedAt: string;
  recordedAt: string;
  status: "accepted" | "late" | "duplicate" | "conflicting" | "rejected";
  summary: string;
};

export type ActionLedgerEntry = {
  ledgerEntryId: string;
  portfolioId: string;
  programId?: string;
  projectId?: string;
  contractRefs: string[];
  flightPlanId: string;
  proposedActionId: string;
  receiptRequirementId?: string;
  observedReceiptId?: string;
  actorId: string;
  traceId: string;
  correlationId: string;
  entryType: "expected_receipt" | "observed_receipt" | "reconcile_status";
  status: ReceiptReconcileStatus | ObservedReceipt["status"];
  summary: string;
  evidenceRefs: string[];
  artifactRefs: string[];
  recordedAt: string;
};

export type ReceiptReconcileRecord = {
  receiptRequirementId: string;
  portfolioId: string;
  programId?: string;
  projectId?: string;
  contractRefs: string[];
  flightPlanId: string;
  flightPlanHash: string;
  proposedActionId: string;
  status: ReceiptReconcileStatus;
  expectedCount: number;
  observedCount: number;
  acceptedCount: number;
  missingCount: number;
  duplicateCount: number;
  conflictingCount: number;
  evidenceRefs: string[];
  updatedAt: string;
};

export type SyncCursor = {
  adapterId: string;
  portfolioId: string;
  cursor: string;
  recordedAt: string;
};

export type IntelligenceRecordType =
  | "learning"
  | "attempt"
  | "discarded_decision"
  | "failure_pattern"
  | "risk_signal";

export type IntelligenceReviewStatus = "supported" | "needs_review";

export type LearningConfidence = {
  mode: "supported" | "needs_review";
  score: number;
  rationale: string;
};

export type IntelligenceRecordBase = {
  recordId: string;
  recordType: IntelligenceRecordType;
  portfolioId: string;
  programId?: string;
  projectId?: string;
  title: string;
  summary: string;
  recordedAt: string;
  validFrom: string;
  validTo?: string;
  evidenceRefs: string[];
  sourceRefs: string[];
  sourceAdapterId: string;
  sourceCursor: string;
  conditionTags: string[];
  appliesToRefs: string[];
  reviewStatus: IntelligenceReviewStatus;
};

export type LearningRecord = IntelligenceRecordBase & {
  recordType: "learning";
  reusableLesson: string;
  confidence: LearningConfidence;
};

export type AttemptRecord = IntelligenceRecordBase & {
  recordType: "attempt";
  outcome: "failed" | "partial" | "abandoned";
  attemptedAction: string;
};

export type DiscardedDecision = IntelligenceRecordBase & {
  recordType: "discarded_decision";
  decisionRef: string;
  rationale: string;
  supersededBy?: string;
};

export type FailurePattern = IntelligenceRecordBase & {
  recordType: "failure_pattern";
  patternKey: string;
  occurrenceRefs: string[];
};

export type RiskSignal = IntelligenceRecordBase & {
  recordType: "risk_signal";
  severity: "low" | "medium" | "high" | "critical";
  riskType: string;
};

export type ProgramIntelligenceRecord =
  | LearningRecord
  | AttemptRecord
  | DiscardedDecision
  | FailurePattern
  | RiskSignal;

export type PmoFactEvidenceStatus = "supported" | "unevidenced" | "advisory" | "needs_review";

export type PmoFactBase = {
  id: string;
  objectType: "task" | "blocker" | "contract" | "dependency_edge" | "runbook";
  portfolioId: string;
  programId?: string;
  projectId?: string;
  schemaVersion: string;
  sourceAdapterId: string;
  sourceCursor?: string;
  recordedAt: string;
  validFrom: string;
  validTo?: string;
  evidenceRefs: string[];
  evidenceStatus: PmoFactEvidenceStatus;
  supersededBy?: string;
};

export type PmoTask = PmoFactBase & {
  objectType: "task";
  taskRef: string;
  title: string;
  status: "not_started" | "in_progress" | "blocked" | "complete" | "cancelled";
  priority: "p0" | "p1" | "p2" | "p3";
  assigneeRefs: string[];
  blockerRefs?: string[];
  trackerSlug?: string;
  trackerRev?: number;
};

export type PmoBlocker = PmoFactBase & {
  objectType: "blocker";
  blockerRef: string;
  summary: string;
  status: "open" | "mitigated" | "resolved" | "accepted";
  severity: "low" | "medium" | "high" | "critical";
  blockedRefs: string[];
  ownerRefs: string[];
};

export type PmoContract = PmoFactBase & {
  objectType: "contract";
  contractRef: string;
  summary: string;
  status: "active" | "draft" | "stale" | "superseded";
  criticality: Criticality;
  producerRef: string;
  consumerRefs: string[];
};

export type PmoDependencyEdge = PmoFactBase & {
  objectType: "dependency_edge";
  dependencyRef: string;
  fromRef: string;
  toRef: string;
  dependencyType: string;
  status: DependencyStatus;
  criticality: Criticality;
};

export type PmoRunbook = PmoFactBase & {
  objectType: "runbook";
  runbookRef: string;
  title: string;
  summary: string;
  status: "active" | "draft" | "stale" | "retired";
  actionRefs: string[];
};

export type PmoMacroDefinition = {
  description: string;
  enabled: boolean;
  inputSchemaRef: string;
  macroId: string;
  macroName:
    | "analyze_blockers"
    | "catch_me_up"
    | "describe_macro"
    | "discover_macros"
    | "simulate_impact"
    | "detect_drift"
    | "export_registry"
    | "object_type_docs"
    | "propose_unblock_plan"
    | "registry_help"
    | "validate_macro";
  outputSchemaRef: string;
  registryEntryRef: string;
  requiredRoleRefs: string[];
  sideEffectPosture: "read_only" | "pmo_internal_write" | "describes_actions_only";
  title: string;
  version: string;
};

export type PmoMacroRegistry = {
  artifactRefs?: string[];
  evidenceRefs: string[];
  macros: PmoMacroDefinition[];
  portfolioId: string;
  recordedAt: string;
  registryRef: string;
  registryVersion: string;
  schemaVersion?: "1";
};
