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

export type SyncCursor = {
  adapterId: string;
  portfolioId: string;
  cursor: string;
  recordedAt: string;
};
