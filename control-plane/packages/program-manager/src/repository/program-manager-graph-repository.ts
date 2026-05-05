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
  MacroFactQuery,
  MacroFactSet,
  ProgramEventCausationQuery,
  ProgramContextQuery,
  ProgramIntelligenceQuery,
  ProgramManagerRepository,
  IntegrationPointRecord as RepositoryIntegrationPointRecord,
  ReceiptLedgerQuery,
  ReceiptLedgerState,
  RepositoryScope
} from "./program-manager-repository.js";
import {
  compareActionLedgerEntries,
  compareArtifactRefs,
  compareContracts,
  compareDecisions,
  compareEvents,
  compareEvidenceRefs,
  compareExpectedReceipts,
  compareIntegrationPoints,
  compareIntelligenceRecords,
  compareMacroBlockers,
  compareMacroDependencyEdges,
  compareMacroRunbooks,
  compareMacroTasks,
  compareMemberships,
  compareObservedReceipts,
  comparePrograms,
  compareProjects,
  comparePmoContracts,
  compareReceiptReconcileRecords,
  compareRelationships,
  compareSyncCursors,
  InMemoryProgramManagerGraphStore,
  normalizeRecordedAt,
  type ContractRecord,
  type DecisionRecordEnvelope,
  type IntegrationPointRecord as GraphIntegrationPointRecord,
  type ProgramManagerGraphSeed,
  type ProgramManagerGraphStore,
  type ProgramMembership,
  type SyncCursorRecord
} from "./program-manager-graph-store.js";

type ContextMatch = {
  ref: string;
  kind: string;
  status: string;
  reason: string;
  validFrom?: string;
  validTo?: string;
  recordedAt: string;
  evidenceRefs: string[];
};

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right);
}

function sortStrings(values: string[]): string[] {
  return [...values].sort(compareStrings);
}

function uniqueSortedStrings(values: Iterable<string>): string[] {
  return [...new Set(values)].filter((value) => value.length > 0).sort(compareStrings);
}

function applyLimit<T>(values: T[], limit?: number): T[] {
  return typeof limit === "number" ? values.slice(0, limit) : values;
}

function defaultScopeAnchor(scope: RepositoryScope): ContextAnchor {
  return {
    portfolioId: scope.portfolioId,
    programId: scope.programId,
    projectId: scope.projectIds?.length === 1 ? scope.projectIds[0] : undefined
  };
}

function matchesContextAnchor(
  value: {
    branchName?: string;
    gitCommit?: string;
    trackerRev?: number;
    trackerSlug?: string;
    validFrom: string;
    validTo?: string;
  },
  contextAnchor: ContextAnchor | undefined
): boolean {
  if (!contextAnchor) {
    return true;
  }
  if (contextAnchor.branchName && value.branchName && value.branchName !== contextAnchor.branchName) {
    return false;
  }
  if (contextAnchor.gitCommit && value.gitCommit && value.gitCommit !== contextAnchor.gitCommit) {
    return false;
  }
  if (
    contextAnchor.trackerRev !== undefined &&
    typeof value.trackerRev === "number" &&
    value.trackerRev > contextAnchor.trackerRev
  ) {
    return false;
  }
  if (contextAnchor.trackerSlug && value.trackerSlug && value.trackerSlug !== contextAnchor.trackerSlug) {
    return false;
  }
  if (contextAnchor.asOf) {
    return value.validFrom <= contextAnchor.asOf && (!value.validTo || value.validTo >= contextAnchor.asOf);
  }
  return true;
}

function inferKind(ref: string): string {
  const prefix = ref.split("://", 1)[0];
  return prefix || "reference";
}

function compareContextMatches(left: ContextMatch, right: ContextMatch): number {
  return (
    compareStrings(left.recordedAt, right.recordedAt) ||
    compareStrings(left.kind, right.kind) ||
    compareStrings(left.ref, right.ref) ||
    compareStrings(left.reason, right.reason)
  );
}

function compareAffectedRefs(
  left: ImpactAssessmentResult["affectedRefs"][number],
  right: ImpactAssessmentResult["affectedRefs"][number]
): number {
  return (
    compareStrings(left.kind, right.kind) ||
    compareStrings(left.ref, right.ref) ||
    compareStrings(left.reason, right.reason)
  );
}

function compareFindings(
  left: ImpactAssessmentResult["findings"][number],
  right: ImpactAssessmentResult["findings"][number]
): number {
  return (
    compareStrings(left.severity, right.severity) ||
    compareStrings(left.type, right.type) ||
    compareStrings(left.findingId, right.findingId)
  );
}

function compareApprovals(
  left: ImpactAssessmentResult["requiredApprovals"][number],
  right: ImpactAssessmentResult["requiredApprovals"][number]
): number {
  return (
    compareStrings(left.authorityRef, right.authorityRef) ||
    compareStrings(left.reason, right.reason)
  );
}

function compareEvidenceObligations(
  left: ImpactAssessmentResult["evidenceObligations"][number],
  right: ImpactAssessmentResult["evidenceObligations"][number]
): number {
  return (
    compareStrings(left.targetRef, right.targetRef) ||
    compareStrings(left.policyRef, right.policyRef) ||
    compareStrings(left.status, right.status)
  );
}

function mapDecisionRecord(decision: DecisionRecordEnvelope): DecisionRecord {
  return {
    decisionId: decision.decisionId,
    portfolioId: decision.portfolioId,
    programId: decision.programId,
    projectId: decision.projectId,
    branchName: decision.branchName,
    summary: decision.summary,
    gitCommit: decision.gitCommit,
    status: decision.status,
    recordedAt: decision.recordedAt,
    validFrom: decision.validFrom,
    validTo: decision.validTo,
    evidenceRefs: sortStrings(decision.evidenceRefs),
    trackerRev: decision.trackerRev,
    trackerSlug: decision.trackerSlug
  };
}

export class ProgramManagerGraphRepository implements ProgramManagerRepository {
  private readonly store: ProgramManagerGraphStore;

  constructor(store: ProgramManagerGraphStore = new InMemoryProgramManagerGraphStore()) {
    this.store = store;
  }

  static createInMemory(): ProgramManagerGraphRepository {
    return new ProgramManagerGraphRepository(new InMemoryProgramManagerGraphStore());
  }

  async seed(seed: ProgramManagerGraphSeed): Promise<void> {
    for (const program of [...(seed.programs ?? [])].sort(comparePrograms)) {
      await this.putProgram(program);
    }
    for (const project of [...(seed.projects ?? [])].sort(compareProjects)) {
      await this.putProject(project);
    }
    for (const membership of [...(seed.memberships ?? [])].sort(compareMemberships)) {
      await this.putMembership(membership);
    }
    for (const integrationPoint of [...(seed.integrationPoints ?? [])].sort(compareIntegrationPoints)) {
      await this.putIntegrationPoint(integrationPoint);
    }
    for (const contract of [...(seed.contracts ?? [])].sort(compareContracts)) {
      await this.putContract(contract);
    }
    for (const relationship of [...(seed.relationships ?? [])].sort(compareRelationships)) {
      await this.putRelationship(relationship);
    }
    for (const evidenceRef of [...(seed.evidenceRefs ?? [])].sort(compareEvidenceRefs)) {
      await this.putEvidenceRef(evidenceRef);
    }
    for (const artifactRef of [...(seed.artifactRefs ?? [])].sort(compareArtifactRefs)) {
      await this.putArtifactRef(artifactRef);
    }
    for (const decision of [...(seed.decisions ?? [])].sort(compareDecisions)) {
      await this.putDecision(decision);
    }
    for (const record of [...(seed.intelligenceRecords ?? [])].sort(compareIntelligenceRecords)) {
      await this.putIntelligenceRecord(record);
    }
    for (const event of [...(seed.events ?? [])].sort(compareEvents)) {
      await this.putEvent(event);
    }
    for (const cursor of [...(seed.syncCursors ?? [])].sort(compareSyncCursors)) {
      await this.putSyncCursor(cursor);
    }
    for (const task of [...(seed.macroTasks ?? [])].sort(compareMacroTasks)) {
      await this.putMacroTask(task);
    }
    for (const blocker of [...(seed.macroBlockers ?? [])].sort(compareMacroBlockers)) {
      await this.putMacroBlocker(blocker);
    }
    for (const contract of [...(seed.macroContracts ?? [])].sort(comparePmoContracts)) {
      await this.putMacroContract(contract);
    }
    for (const edge of [...(seed.macroDependencyEdges ?? [])].sort(compareMacroDependencyEdges)) {
      await this.putMacroDependencyEdge(edge);
    }
    for (const runbook of [...(seed.macroRunbooks ?? [])].sort(compareMacroRunbooks)) {
      await this.putMacroRunbook(runbook);
    }
    for (const registry of seed.macroRegistries ?? []) {
      await this.upsertMacroRegistry(registry);
    }
  }

  async putProgram(program: ProgramRef): Promise<void> {
    await this.store.upsertProgram(program);
  }

  async putProject(project: ProjectRef): Promise<void> {
    await this.store.upsertProject(project);
  }

  async putMembership(membership: ProgramMembership): Promise<void> {
    await this.store.upsertMembership({
      ...membership,
      recordedAt: normalizeRecordedAt(membership.recordedAt),
      evidenceRefs: uniqueSortedStrings(membership.evidenceRefs ?? [])
    });
  }

  async putIntegrationPoint(integrationPoint: GraphIntegrationPointRecord): Promise<void> {
    await this.store.upsertIntegrationPoint({
      ...integrationPoint,
      artifactRefs: uniqueSortedStrings(integrationPoint.artifactRefs ?? []),
      consumerProjectIds: uniqueSortedStrings(integrationPoint.consumerProjectIds),
      recordedAt: normalizeRecordedAt(integrationPoint.recordedAt),
      evidenceRefs: uniqueSortedStrings(integrationPoint.evidenceRefs ?? []),
      idempotencyKeys: uniqueSortedStrings(integrationPoint.idempotencyKeys ?? [])
    });
  }

  async putContract(contract: ContractRecord): Promise<void> {
    await this.store.upsertContract({
      ...contract,
      recordedAt: normalizeRecordedAt(contract.recordedAt),
      evidenceRefs: uniqueSortedStrings(contract.evidenceRefs ?? [])
    });
  }

  async putRelationship(relationship: GraphRelationship): Promise<void> {
    await this.store.upsertRelationship({
      ...relationship,
      evidenceRefs: uniqueSortedStrings(relationship.evidenceRefs)
    });
  }

  async putEvidenceRef(evidenceRef: EvidenceRef): Promise<void> {
    await this.store.upsertEvidenceRef({
      ...evidenceRef,
      attachesToRefs: uniqueSortedStrings(evidenceRef.attachesToRefs ?? [])
    });
  }

  async putArtifactRef(artifactRef: ArtifactRef): Promise<void> {
    await this.store.upsertArtifactRef(artifactRef);
  }

  async putDecision(decision: DecisionRecordEnvelope): Promise<void> {
    await this.store.upsertDecision({
      ...decision,
      appliesToRefs: uniqueSortedStrings(decision.appliesToRefs ?? []),
      evidenceRefs: uniqueSortedStrings(decision.evidenceRefs)
    });
  }

  async putIntelligenceRecord(record: ProgramIntelligenceRecord): Promise<void> {
    await this.store.upsertIntelligenceRecord({
      ...record,
      appliesToRefs: uniqueSortedStrings(record.appliesToRefs),
      conditionTags: uniqueSortedStrings(record.conditionTags),
      evidenceRefs: uniqueSortedStrings(record.evidenceRefs),
      sourceRefs: uniqueSortedStrings(record.sourceRefs),
      ...(record.recordType === "failure_pattern"
        ? { occurrenceRefs: uniqueSortedStrings(record.occurrenceRefs) }
        : {})
    } as ProgramIntelligenceRecord);
  }

  async putEvent(event: ProgramEvent): Promise<void> {
    await this.store.appendEvent({
      ...event,
      evidenceRefs: uniqueSortedStrings(event.evidenceRefs),
      artifactRefs: uniqueSortedStrings(event.artifactRefs),
      targetRefs: event.targetRefs ? uniqueSortedStrings(event.targetRefs) : undefined,
      managedRefs: event.managedRefs ? uniqueSortedStrings(event.managedRefs) : undefined,
      causation: event.causation
        ? {
            ...event.causation,
            causedByEventIds: uniqueSortedStrings(event.causation.causedByEventIds),
            targetRefs: uniqueSortedStrings(event.causation.targetRefs)
          }
        : undefined
    });
  }

  async appendEvent(event: ProgramEvent): Promise<ProgramEvent> {
    const existingByIdempotencyKey = event.idempotencyKey
      ? await this.getEventByIdempotencyKey({ portfolioId: event.portfolioId }, event.idempotencyKey)
      : undefined;
    if (existingByIdempotencyKey) {
      return existingByIdempotencyKey;
    }

    const existingByEventId = (await this.store.listEvents({ portfolioId: event.portfolioId }))
      .find((item) => item.eventId === event.eventId);
    if (existingByEventId) {
      return existingByEventId;
    }

    await this.putEvent(event);
    const stored = (await this.store.listEvents({ portfolioId: event.portfolioId }))
      .find((item) => item.eventId === event.eventId);
    return stored ?? event;
  }

  async putSyncCursor(cursor: SyncCursorRecord): Promise<void> {
    await this.store.upsertSyncCursor(cursor);
  }

  async putMacroTask(task: PmoTask): Promise<void> {
    await this.store.upsertMacroTask({
      ...task,
      assigneeRefs: uniqueSortedStrings(task.assigneeRefs),
      blockerRefs: uniqueSortedStrings(task.blockerRefs ?? []),
      evidenceRefs: uniqueSortedStrings(task.evidenceRefs)
    });
  }

  async putMacroBlocker(blocker: PmoBlocker): Promise<void> {
    await this.store.upsertMacroBlocker({
      ...blocker,
      blockedRefs: uniqueSortedStrings(blocker.blockedRefs),
      evidenceRefs: uniqueSortedStrings(blocker.evidenceRefs),
      ownerRefs: uniqueSortedStrings(blocker.ownerRefs)
    });
  }

  async putMacroContract(contract: PmoContract): Promise<void> {
    await this.store.upsertMacroContract({
      ...contract,
      consumerRefs: uniqueSortedStrings(contract.consumerRefs),
      evidenceRefs: uniqueSortedStrings(contract.evidenceRefs)
    });
  }

  async putMacroDependencyEdge(edge: PmoDependencyEdge): Promise<void> {
    await this.store.upsertMacroDependencyEdge({
      ...edge,
      evidenceRefs: uniqueSortedStrings(edge.evidenceRefs)
    });
  }

  async putMacroRunbook(runbook: PmoRunbook): Promise<void> {
    await this.store.upsertMacroRunbook({
      ...runbook,
      actionRefs: uniqueSortedStrings(runbook.actionRefs),
      evidenceRefs: uniqueSortedStrings(runbook.evidenceRefs)
    });
  }

  async upsertExpectedReceipts(receipts: ExpectedReceipt[], auditEvent?: ProgramEvent): Promise<void> {
    for (const receipt of [...receipts].sort(compareExpectedReceipts)) {
      await this.store.upsertExpectedReceipt({
        ...receipt,
        contractRefs: uniqueSortedStrings(receipt.contractRefs),
        evidencePolicyRefs: uniqueSortedStrings(receipt.evidencePolicyRefs),
        requiredEvidenceRefs: uniqueSortedStrings(receipt.requiredEvidenceRefs),
        scopeRefs: uniqueSortedStrings(receipt.scopeRefs)
      });
    }
    if (auditEvent) {
      await this.putEvent(auditEvent);
    }
  }

  async appendObservedReceipt(receipt: ObservedReceipt, auditEvent: ProgramEvent): Promise<void> {
    await this.store.appendObservedReceipt({
      ...receipt,
      artifactRefs: uniqueSortedStrings(receipt.artifactRefs),
      contractRefs: uniqueSortedStrings(receipt.contractRefs),
      evidenceRefs: uniqueSortedStrings(receipt.evidenceRefs),
      observedStateRefs: uniqueSortedStrings(receipt.observedStateRefs)
    });
    await this.putEvent(auditEvent);
  }

  async appendActionLedgerEntry(entry: ActionLedgerEntry): Promise<void> {
    await this.store.appendActionLedgerEntry({
      ...entry,
      artifactRefs: uniqueSortedStrings(entry.artifactRefs),
      contractRefs: uniqueSortedStrings(entry.contractRefs),
      evidenceRefs: uniqueSortedStrings(entry.evidenceRefs)
    });
  }

  async upsertReceiptReconcileStatus(
    status: ReceiptReconcileRecord,
    auditEvent?: ProgramEvent
  ): Promise<void> {
    await this.store.upsertReceiptReconcileStatus({
      ...status,
      contractRefs: uniqueSortedStrings(status.contractRefs),
      evidenceRefs: uniqueSortedStrings(status.evidenceRefs)
    });
    if (auditEvent) {
      await this.putEvent(auditEvent);
    }
  }

  async listPrograms(scope: RepositoryScope): Promise<ProgramRef[]> {
    return (await this.store.listPrograms(scope)).sort(comparePrograms);
  }

  async listProjects(scope: RepositoryScope): Promise<ProjectRef[]> {
    return (await this.store.listProjects(scope)).sort(compareProjects);
  }

  async upsertProgram(program: ProgramRef, auditEvent?: ProgramEvent): Promise<void> {
    await this.putProgram(program);
    if (auditEvent) {
      await this.putEvent(auditEvent);
    }
  }

  async upsertProject(project: ProjectRef, auditEvent?: ProgramEvent): Promise<void> {
    await this.putProject(project);
    if (auditEvent) {
      await this.putEvent(auditEvent);
    }
  }

  async listMemberships(scope: RepositoryScope): Promise<ProgramMembership[]> {
    return (await this.store.listMemberships(scope)).sort(compareMemberships);
  }

  async listIntegrationPoints(scope: RepositoryScope): Promise<RepositoryIntegrationPointRecord[]> {
    return (await this.store.listIntegrationPoints(scope)).sort(compareIntegrationPoints).map((integrationPoint) => ({
      integrationPointId: integrationPoint.integrationPointId,
      portfolioId: integrationPoint.portfolioId,
      producerProjectId: integrationPoint.producerProjectId,
      consumerProjectIds: integrationPoint.consumerProjectIds,
      artifactRefs: integrationPoint.artifactRefs,
      coordinationItems: integrationPoint.coordinationItems as RepositoryIntegrationPointRecord["coordinationItems"],
      purpose: integrationPoint.purpose,
      recordedAt: integrationPoint.recordedAt,
      evidenceRefs: integrationPoint.evidenceRefs,
      idempotencyKeys: integrationPoint.idempotencyKeys,
      projectRoles: integrationPoint.projectRoles,
      statusHistory: integrationPoint.statusHistory as RepositoryIntegrationPointRecord["statusHistory"],
      status: integrationPoint.status
    }));
  }

  async upsertIntegrationPoint(
    integrationPoint: RepositoryIntegrationPointRecord,
    auditEvent?: ProgramEvent
  ): Promise<void> {
    await this.putIntegrationPoint(integrationPoint);
    if (auditEvent) {
      await this.putEvent(auditEvent);
    }
  }

  async listContracts(scope: RepositoryScope): Promise<ContractRecord[]> {
    return (await this.store.listContracts(scope)).sort(compareContracts);
  }

  async getProgramContext(query: ProgramContextQuery): Promise<{
    contextAnchor?: ContextAnchor;
    matchedRefs: ContextMatch[];
    omittedRefCount: number;
  }> {
    const targetRefs = uniqueSortedStrings(query.targetRefs);
    const targetRefSet = new Set(targetRefs);
    const [programs, projects, integrationPoints, contracts, relationships, evidenceRefs, artifactRefs, decisions] =
      await Promise.all([
        this.listPrograms(query.scope),
        this.listProjects(query.scope),
        this.listIntegrationPoints(query.scope),
        this.listContracts(query.scope),
        this.listRelationships(query.scope),
        this.listEvidenceRefs(query.scope),
        this.listArtifactRefs(query.scope),
        this.store.listDecisions({
          scope: query.scope,
          contextAnchor: query.contextAnchor,
          targetRefs: query.targetRefs
        })
      ]);

    const matches: ContextMatch[] = [];
    const seen = new Set<string>();

    const addMatch = (match: ContextMatch): void => {
      const key = `${match.kind}::${match.ref}::${match.reason}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      matches.push({
        ...match,
        evidenceRefs: uniqueSortedStrings(match.evidenceRefs)
      });
    };

    for (const program of programs) {
      if (!targetRefSet.has(program.programId)) {
        continue;
      }
      addMatch({
        ref: program.programId,
        kind: "program",
        status: "active",
        reason: "direct program match",
        recordedAt: normalizeRecordedAt(undefined),
        evidenceRefs: []
      });
    }

    for (const project of projects) {
      if (!targetRefSet.has(project.projectId)) {
        continue;
      }
      addMatch({
        ref: project.projectId,
        kind: "project",
        status: "active",
        reason: "direct project match",
        recordedAt: normalizeRecordedAt(undefined),
        evidenceRefs: []
      });
    }

    for (const integrationPoint of integrationPoints) {
      if (!targetRefSet.has(integrationPoint.integrationPointId)) {
        continue;
      }
      addMatch({
        ref: integrationPoint.integrationPointId,
        kind: "integration_point",
        status: "active",
        reason: "direct integration point match",
        recordedAt: normalizeRecordedAt(integrationPoint.recordedAt),
        evidenceRefs: integrationPoint.evidenceRefs ?? []
      });
    }

    for (const contract of contracts) {
      if (!targetRefSet.has(contract.contractRef)) {
        continue;
      }
      addMatch({
        ref: contract.contractRef,
        kind: "contract",
        status: "active",
        reason: "direct contract match",
        recordedAt: normalizeRecordedAt(contract.recordedAt),
        evidenceRefs: contract.evidenceRefs ?? []
      });
    }

    for (const relationship of relationships) {
      if (!targetRefSet.has(relationship.fromRef) && !targetRefSet.has(relationship.toRef)) {
        continue;
      }
      const oppositeRef = targetRefSet.has(relationship.fromRef) ? relationship.toRef : relationship.fromRef;
      addMatch({
        ref: oppositeRef,
        kind: inferKind(oppositeRef),
        status: relationship.status,
        reason: `dependency ${relationship.dependencyId}`,
        validFrom: relationship.validFrom,
        validTo: relationship.validTo,
        recordedAt: relationship.recordedAt,
        evidenceRefs: relationship.evidenceRefs
      });
    }

    const decisionMatches = decisions.filter((decision) => {
      if (decision.status === "superseded" && !query.includeSuperseded) {
        return false;
      }
      if (decision.status === "future_not_applicable" && !query.includeFutureNotApplicable) {
        return false;
      }
      if (targetRefSet.has(decision.decisionId)) {
        return true;
      }
      return (decision.appliesToRefs ?? []).some((ref) => targetRefSet.has(ref));
    });

    for (const decision of decisionMatches) {
      addMatch({
        ref: decision.decisionId,
        kind: "decision",
        status: decision.status,
        reason: targetRefSet.has(decision.decisionId)
          ? "direct decision match"
          : "decision applies to target ref",
        validFrom: decision.validFrom,
        validTo: decision.validTo,
        recordedAt: decision.recordedAt,
        evidenceRefs: decision.evidenceRefs
      });
    }

    const evidenceRefSet = new Set<string>();
    for (const decision of decisionMatches) {
      for (const evidenceRef of decision.evidenceRefs) {
        evidenceRefSet.add(evidenceRef);
      }
    }
    for (const relationship of relationships) {
      if (!targetRefSet.has(relationship.fromRef) && !targetRefSet.has(relationship.toRef)) {
        continue;
      }
      for (const evidenceRef of relationship.evidenceRefs) {
        evidenceRefSet.add(evidenceRef);
      }
    }
    for (const ref of targetRefs) {
      evidenceRefSet.add(ref);
    }

    const matchedEvidenceRefs = evidenceRefs.filter((evidenceRef) => evidenceRefSet.has(evidenceRef.evidenceRef));
    for (const evidenceRef of matchedEvidenceRefs) {
      addMatch({
        ref: evidenceRef.evidenceRef,
        kind: "evidence",
        status: "active",
        reason: targetRefSet.has(evidenceRef.evidenceRef)
          ? "direct evidence match"
          : "evidence linked to target context",
        recordedAt: evidenceRef.recordedAt,
        evidenceRefs: [evidenceRef.evidenceRef]
      });
    }

    const matchedArtifactRefs = artifactRefs.filter(
      (artifactRef) =>
        targetRefSet.has(artifactRef.artifactRef) ||
        matchedEvidenceRefs.some((evidenceRef) => evidenceRef.artifactRef === artifactRef.artifactRef)
    );
    for (const artifactRef of matchedArtifactRefs) {
      addMatch({
        ref: artifactRef.artifactRef,
        kind: "artifact",
        status: artifactRef.redactionStatus,
        reason: targetRefSet.has(artifactRef.artifactRef)
          ? "direct artifact match"
          : "artifact linked to matched evidence",
        recordedAt: artifactRef.createdAt,
        evidenceRefs: matchedEvidenceRefs
          .filter((evidenceRef) => evidenceRef.artifactRef === artifactRef.artifactRef)
          .map((evidenceRef) => evidenceRef.evidenceRef)
      });
    }

    matches.sort(compareContextMatches);
    const limit = query.limit ?? matches.length;
    return {
      contextAnchor: query.contextAnchor ?? defaultScopeAnchor(query.scope),
      matchedRefs: matches.slice(0, limit),
      omittedRefCount: Math.max(0, matches.length - limit)
    };
  }

  async assessImpact(query: ImpactAssessmentQuery): Promise<ImpactAssessmentResult> {
    const [relationships, decisions, programs, projects, integrationPoints, contracts] = await Promise.all([
      this.listRelationships(query.scope),
      this.store.listDecisions({ scope: query.scope }),
      this.listPrograms(query.scope),
      this.listProjects(query.scope),
      this.listIntegrationPoints(query.scope),
      this.listContracts(query.scope)
    ]);

    const refKinds = new Map<string, string>();
    for (const program of programs) {
      refKinds.set(program.programId, "program");
    }
    for (const project of projects) {
      refKinds.set(project.projectId, "project");
    }
    for (const integrationPoint of integrationPoints) {
      refKinds.set(integrationPoint.integrationPointId, "integration_point");
    }
    for (const contract of contracts) {
      refKinds.set(contract.contractRef, "contract");
    }
    for (const decision of decisions) {
      refKinds.set(decision.decisionId, "decision");
    }

    const adjacency = new Map<string, GraphRelationship[]>();
    for (const relationship of relationships) {
      const entries = adjacency.get(relationship.fromRef) ?? [];
      entries.push(relationship);
      adjacency.set(relationship.fromRef, entries);
    }
    for (const entries of adjacency.values()) {
      entries.sort(compareRelationships);
    }

    const affectedRefs = new Map<string, ImpactAssessmentResult["affectedRefs"][number]>();
    const findings = new Map<string, ImpactAssessmentResult["findings"][number]>();
    const approvals = new Map<string, ImpactAssessmentResult["requiredApprovals"][number]>();
    const obligations = new Map<string, ImpactAssessmentResult["evidenceObligations"][number]>();
    const targetRefSet = new Set(query.targetRefs);
    const visited = new Set<string>([query.changeRef]);
    const queue = [query.changeRef];

    while (queue.length > 0) {
      const currentRef = queue.shift();
      if (!currentRef) {
        continue;
      }
      for (const relationship of adjacency.get(currentRef) ?? []) {
        if (query.contextAnchor?.asOf && relationship.validFrom > query.contextAnchor.asOf) {
          continue;
        }
        if (query.contextAnchor?.asOf && relationship.validTo && relationship.validTo < query.contextAnchor.asOf) {
          continue;
        }
        const nextRef = relationship.toRef;
        if (!visited.has(nextRef)) {
          visited.add(nextRef);
          queue.push(nextRef);
        }
        if (!targetRefSet.size || targetRefSet.has(nextRef)) {
          affectedRefs.set(
            nextRef,
            {
              kind: refKinds.get(nextRef) ?? inferKind(nextRef),
              ref: nextRef,
              reason: `${relationship.dependencyType}:${relationship.dependencyId}`
            }
          );
        }
        if (relationship.status !== "active" && !findings.has(relationship.dependencyId)) {
          findings.set(relationship.dependencyId, {
            findingId: relationship.dependencyId,
            severity:
              relationship.status === "blocked"
                ? "critical"
                : relationship.status === "stale"
                  ? "high"
                  : relationship.status === "pending"
                    ? "medium"
                    : "low",
            type: relationship.dependencyType,
            summary: `${relationship.dependencyType} is ${relationship.status}`,
            evidenceRefs: uniqueSortedStrings(relationship.evidenceRefs)
          });
        }
        if (relationship.dependencyType.includes("APPROVAL")) {
          const authorityRef = relationship.contractRef ?? relationship.toRef;
          approvals.set(authorityRef, {
            authorityRef,
            reason: `${relationship.dependencyType}:${relationship.dependencyId}`,
            evidencePolicyRefs: []
          });
        }
        if (relationship.dependencyType.includes("EVIDENCE")) {
          const policyRef = relationship.contractRef ?? relationship.dependencyId;
          obligations.set(`${policyRef}::${nextRef}`, {
            policyRef,
            targetRef: nextRef,
            status:
              relationship.status === "active" || relationship.status === "satisfied"
                ? "satisfied"
                : relationship.status === "stale"
                  ? "stale"
                  : "missing"
          });
        }
      }
    }

    for (const decision of decisions) {
      const appliesToTarget = (decision.appliesToRefs ?? []).some((ref) => targetRefSet.has(ref));
      if (!appliesToTarget || decision.status === "applicable") {
        continue;
      }
      findings.set(`decision:${decision.decisionId}`, {
        findingId: `decision:${decision.decisionId}`,
        severity: decision.status === "superseded" ? "medium" : "low",
        type: "decision_status",
        summary: `${decision.decisionId} is ${decision.status}`,
        evidenceRefs: uniqueSortedStrings(decision.evidenceRefs)
      });
    }

    return {
      affectedRefs: [...affectedRefs.values()].sort(compareAffectedRefs),
      findings: [...findings.values()].sort(compareFindings),
      requiredApprovals: [...approvals.values()].sort(compareApprovals),
      evidenceObligations: [...obligations.values()].sort(compareEvidenceObligations)
    };
  }

  async listRelationships(scope: RepositoryScope): Promise<GraphRelationship[]> {
    return (await this.store.listRelationships(scope)).sort(compareRelationships);
  }

  async listEvidenceRefs(scope: RepositoryScope, refs?: string[]): Promise<EvidenceRef[]> {
    return (await this.store.listEvidenceRefs(scope, refs)).sort(compareEvidenceRefs);
  }

  async listArtifactRefs(scope: RepositoryScope, refs?: string[]): Promise<ArtifactRef[]> {
    return (await this.store.listArtifactRefs(scope, refs)).sort(compareArtifactRefs);
  }

  async upsertEvidenceRef(evidenceRef: EvidenceRef, auditEvent?: ProgramEvent): Promise<void> {
    await this.putEvidenceRef(evidenceRef);
    if (auditEvent) {
      await this.putEvent(auditEvent);
    }
  }

  async upsertArtifactRef(artifactRef: ArtifactRef, auditEvent?: ProgramEvent): Promise<void> {
    await this.putArtifactRef(artifactRef);
    if (auditEvent) {
      await this.putEvent(auditEvent);
    }
  }

  async listDecisions(query: DecisionQuery): Promise<DecisionRecord[]> {
    return (await this.store.listDecisions(query)).sort(compareDecisions).map(mapDecisionRecord);
  }

  async listIntelligenceRecords(
    query: ProgramIntelligenceQuery
  ): Promise<ProgramIntelligenceRecord[]> {
    const records = (await this.store.listIntelligenceRecords(query)).sort(compareIntelligenceRecords);
    return typeof query.limit === "number" ? records.slice(0, query.limit) : records;
  }

  async listReceiptLedger(query: ReceiptLedgerQuery): Promise<ReceiptLedgerState> {
    const [
      expectedReceipts,
      observedReceipts,
      actionLedgerEntries,
      reconcileStatuses
    ] = await Promise.all([
      this.store.listExpectedReceipts(query),
      this.store.listObservedReceipts(query),
      this.store.listActionLedgerEntries(query),
      this.store.listReceiptReconcileStatuses(query)
    ]);

    return {
      expectedReceipts: expectedReceipts.sort(compareExpectedReceipts),
      observedReceipts: observedReceipts.sort(compareObservedReceipts),
      actionLedgerEntries: actionLedgerEntries.sort(compareActionLedgerEntries),
      reconcileStatuses: reconcileStatuses.sort(compareReceiptReconcileRecords)
    };
  }

  async listMacroFacts(query: MacroFactQuery): Promise<MacroFactSet> {
    const [tasks, blockers, contracts, dependencyEdges, runbooks] = await Promise.all([
      this.store.listMacroTasks(query.scope),
      this.store.listMacroBlockers(query.scope),
      this.store.listMacroContracts(query.scope),
      this.store.listMacroDependencyEdges(query.scope),
      this.store.listMacroRunbooks(query.scope)
    ]);
    const targetRefs = new Set(query.targetRefs ?? []);
    const isCurrent = (value: {
      branchName?: string;
      gitCommit?: string;
      trackerRev?: number;
      trackerSlug?: string;
      validFrom: string;
      validTo?: string;
      supersededBy?: string;
    }): boolean => {
      if (!query.includeSuperseded && value.supersededBy) {
        return false;
      }
      return matchesContextAnchor(value, query.contextAnchor);
    };
    const matchesTargets = (values: string[]): boolean => {
      if (targetRefs.size === 0) {
        return true;
      }
      return values.some((value) => targetRefs.has(value));
    };
    const limit = query.limit;

    return {
      tasks: applyLimit(
        tasks
          .filter((task) =>
            isCurrent(task) &&
            matchesTargets([
              task.id,
              task.taskRef,
              task.projectId ?? "",
              ...task.assigneeRefs,
              ...(task.blockerRefs ?? []),
              ...task.evidenceRefs
            ])
          )
          .sort(compareMacroTasks),
        limit
      ),
      blockers: applyLimit(
        blockers
          .filter((blocker) =>
            isCurrent(blocker) &&
            matchesTargets([
              blocker.id,
              blocker.blockerRef,
              blocker.projectId ?? "",
              ...blocker.blockedRefs,
              ...blocker.ownerRefs,
              ...blocker.evidenceRefs
            ])
          )
          .sort(compareMacroBlockers),
        limit
      ),
      contracts: applyLimit(
        contracts
          .filter((contract) =>
            isCurrent(contract) &&
            matchesTargets([
              contract.id,
              contract.contractRef,
              contract.projectId ?? "",
              contract.producerRef,
              ...contract.consumerRefs,
              ...contract.evidenceRefs
            ])
          )
          .sort(comparePmoContracts),
        limit
      ),
      dependencyEdges: applyLimit(
        dependencyEdges
          .filter((edge) =>
            isCurrent(edge) &&
            matchesTargets([
              edge.id,
              edge.dependencyRef,
              edge.projectId ?? "",
              edge.fromRef,
              edge.toRef,
              ...edge.evidenceRefs
            ])
          )
          .sort(compareMacroDependencyEdges),
        limit
      ),
      runbooks: applyLimit(
        runbooks
          .filter((runbook) =>
            isCurrent(runbook) &&
            matchesTargets([
              runbook.id,
              runbook.runbookRef,
              runbook.projectId ?? "",
              ...runbook.actionRefs,
              ...runbook.evidenceRefs
            ])
          )
          .sort(compareMacroRunbooks),
        limit
      )
    };
  }

  async getMacroRegistry(scope: RepositoryScope): Promise<PmoMacroRegistry | undefined> {
    return this.store.getMacroRegistry(scope);
  }

  async upsertMacroRegistry(registry: PmoMacroRegistry, auditEvent?: ProgramEvent): Promise<void> {
    await this.store.upsertMacroRegistry({
      ...registry,
      evidenceRefs: uniqueSortedStrings(registry.evidenceRefs),
      macros: registry.macros
        .map((macro) => ({
          ...macro,
          requiredRoleRefs: uniqueSortedStrings(macro.requiredRoleRefs)
        }))
        .sort((left, right) => left.macroId.localeCompare(right.macroId))
    });
    if (auditEvent) {
      await this.putEvent(auditEvent);
    }
  }

  async listEvents(scope: RepositoryScope, limit?: number): Promise<ProgramEvent[]> {
    const events = (await this.store.listEvents(scope)).sort(
      (left, right) => right.recordedAt.localeCompare(left.recordedAt) || left.eventId.localeCompare(right.eventId)
    );
    return typeof limit === "number" ? events.slice(0, limit) : events;
  }

  async getEventByIdempotencyKey(
    scope: RepositoryScope,
    idempotencyKey: string
  ): Promise<ProgramEvent | undefined> {
    return (await this.listEvents(scope)).find((event) => event.idempotencyKey === idempotencyKey);
  }

  async listEventsByCausation(query: ProgramEventCausationQuery): Promise<ProgramEvent[]> {
    const events = (await this.listEvents(query.scope))
      .filter(
        (event) =>
          event.causation?.sourceEventId === query.causedByEventId ||
          event.causation?.causedByEventIds.includes(query.causedByEventId)
      );
    return typeof query.limit === "number" ? events.slice(0, query.limit) : events;
  }

  async getSyncCursors(scope: RepositoryScope): Promise<SyncCursor[]> {
    return (await this.store.listSyncCursors(scope))
      .sort(compareSyncCursors)
      .map((cursor) => ({
        adapterId: cursor.adapterId,
        portfolioId: cursor.portfolioId,
        cursor: cursor.cursor,
        recordedAt: cursor.recordedAt
      }));
  }
}
