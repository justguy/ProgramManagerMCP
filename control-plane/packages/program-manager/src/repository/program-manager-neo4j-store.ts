import type {
  ArtifactRef,
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
  ReceiptReconcileRecord
} from "../types/domain.js";
import type {
  DecisionQuery,
  ProgramIntelligenceQuery,
  ReceiptLedgerQuery,
  RepositoryScope
} from "./program-manager-repository.js";
import {
  normalizeRecordedAt,
  type ContractRecord,
  type DecisionRecordEnvelope,
  type IntegrationPointRecord,
  type ProgramManagerGraphStore,
  type ProgramMembership,
  type SyncCursorRecord
} from "./program-manager-graph-store.js";
import { normalizePmoReadModel } from "../normalization/program-manager-normalization.ts";

type Neo4jRecordLike = {
  get(key: string): unknown;
};

type Neo4jResultLike = {
  records: Neo4jRecordLike[];
};

type Neo4jTransactionLike = {
  run(cypher: string, params?: Record<string, unknown>): Promise<Neo4jResultLike>;
};

type Neo4jSessionLike = {
  executeRead<T>(work: (tx: Neo4jTransactionLike) => Promise<T>): Promise<T>;
  executeWrite<T>(work: (tx: Neo4jTransactionLike) => Promise<T>): Promise<T>;
  close(): Promise<void>;
};

export type Neo4jDriverLike = {
  session(): Neo4jSessionLike;
};

function sanitizeRelationshipType(dependencyType: string): string {
  const sanitized = dependencyType.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  return sanitized.length > 0 ? sanitized : "PM_DEPENDENCY";
}

function mapRecord<T>(record: Neo4jRecordLike, key: string): T {
  return normalizePmoReadModel(record.get(key)) as T;
}

function normalizeParams(cypher: string, params: Record<string, unknown>): Record<string, unknown> {
  const normalized = Object.fromEntries(
    Object.entries(params).map(([key, value]) => [key, value === undefined ? null : value])
  );
  for (const match of cypher.matchAll(/\$([A-Za-z_][A-Za-z0-9_]*)/g)) {
    normalized[match[1]] ??= null;
  }
  return normalized;
}

function scopeWhere(scope: RepositoryScope, alias: string): string {
  const clauses = [`${alias}.portfolioId = $portfolioId`];
  if (scope.programId) {
    clauses.push(`${alias}.programId = $programId`);
  }
  if (scope.projectIds?.length) {
    clauses.push(`${alias}.projectId IN $projectIds`);
  }
  return clauses.join(" AND ");
}

function toScopeParams(scope: RepositoryScope): Record<string, unknown> {
  return {
    portfolioId: scope.portfolioId,
    programId: scope.programId,
    projectIds: scope.projectIds
  };
}

function matchesLedgerScope(
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

function matchesLedgerQuery(
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
    matchesLedgerScope(value.portfolioId, value.programId, value.projectId, query.scope) &&
    overlaps(query.actorIds, value.actorId ? [value.actorId] : []) &&
    overlaps(query.contractRefs, value.contractRefs) &&
    overlaps(query.evidenceRefs, value.evidenceRefs ?? []) &&
    overlaps(query.flightPlanIds, [value.flightPlanId]) &&
    overlaps(query.proposedActionIds, [value.proposedActionId]) &&
    overlaps(query.receiptRequirementIds, value.receiptRequirementId ? [value.receiptRequirementId] : [])
  );
}

function compareLedgerValues(
  left: { recordedAt?: string; flightPlanId?: string; proposedActionId?: string; receiptRequirementId?: string },
  right: { recordedAt?: string; flightPlanId?: string; proposedActionId?: string; receiptRequirementId?: string }
): number {
  return (
    (left.flightPlanId ?? "").localeCompare(right.flightPlanId ?? "") ||
    (left.proposedActionId ?? "").localeCompare(right.proposedActionId ?? "") ||
    (left.receiptRequirementId ?? "").localeCompare(right.receiptRequirementId ?? "") ||
    (left.recordedAt ?? "").localeCompare(right.recordedAt ?? "")
  );
}

function parsePayload<T>(record: Neo4jRecordLike, key: string): T {
  const payload = record.get(key);
  return JSON.parse(payload as string) as T;
}

function macroScopeWhere(scope: RepositoryScope, alias: string): string {
  return scopeWhere(scope, alias);
}

async function runWrite(
  driver: Neo4jDriverLike,
  cypher: string,
  params: Record<string, unknown>
): Promise<void> {
  const session = driver.session();
  try {
    await session.executeWrite((tx) => tx.run(cypher, normalizeParams(cypher, params)).then(() => undefined));
  } finally {
    await session.close();
  }
}

async function runRead<T>(
  driver: Neo4jDriverLike,
  cypher: string,
  params: Record<string, unknown>,
  map: (record: Neo4jRecordLike) => T
): Promise<T[]> {
  const session = driver.session();
  try {
    return await session.executeRead(async (tx) => {
      const result = await tx.run(cypher, normalizeParams(cypher, params));
      return result.records.map(map);
    });
  } finally {
    await session.close();
  }
}

export class Neo4jProgramManagerGraphStore implements ProgramManagerGraphStore {
  private readonly driver: Neo4jDriverLike;

  constructor(driver: Neo4jDriverLike) {
    this.driver = driver;
  }

  async upsertProgram(program: ProgramRef): Promise<void> {
    await runWrite(
      this.driver,
      `
        MERGE (program:PmRef {portfolioId: $portfolioId, ref: $programId})
        SET program:PmProgram,
            program.programId = $programId,
            program.name = $name,
            program.status = $status,
            program.trackerRef = $trackerRef,
            program.repoRef = $repoRef,
            program.adapterRef = $adapterRef,
            program.goal = $goal,
            program.kind = 'program',
            program.recordedAt = $recordedAt
      `,
      {
        portfolioId: program.portfolioId,
        programId: program.programId,
        name: program.name,
        status: program.status,
        trackerRef: program.trackerRef,
        repoRef: program.repoRef,
        adapterRef: program.adapterRef,
        goal: program.goal,
        recordedAt: normalizeRecordedAt(undefined)
      }
    );
  }

  async upsertProject(project: ProjectRef): Promise<void> {
    await runWrite(
      this.driver,
      `
        MERGE (project:PmRef {portfolioId: $portfolioId, ref: $projectId})
        SET project:PmProject,
            project.programId = $programId,
            project.projectId = $projectId,
            project.name = $name,
            project.activeProgramIds = $activeProgramIds,
            project.status = $status,
            project.projectRole = $projectRole,
            project.trackerRef = $trackerRef,
            project.repoRef = $repoRef,
            project.adapterRef = $adapterRef,
            project.goal = $goal,
            project.kind = 'project',
            project.recordedAt = $recordedAt
      `,
      {
        portfolioId: project.portfolioId,
        programId: project.programId,
        projectId: project.projectId,
        name: project.name,
        activeProgramIds: project.activeProgramIds,
        status: project.status,
        projectRole: project.projectRole,
        trackerRef: project.trackerRef,
        repoRef: project.repoRef,
        adapterRef: project.adapterRef,
        goal: project.goal,
        recordedAt: normalizeRecordedAt(undefined)
      }
    );
  }

  async upsertMembership(membership: ProgramMembership): Promise<void> {
    await runWrite(
      this.driver,
      `
        MERGE (program:PmRef {portfolioId: $portfolioId, ref: $programId})
        SET program:PmProgram
        MERGE (project:PmRef {portfolioId: $portfolioId, ref: $projectId})
        SET project:PmProject
        MERGE (program)-[membership:HAS_PROJECT {portfolioId: $portfolioId, programId: $programId, projectId: $projectId}]->(project)
        SET membership.recordedAt = $recordedAt,
            membership.evidenceRefs = $evidenceRefs
      `,
      {
        ...membership,
        recordedAt: normalizeRecordedAt(membership.recordedAt),
        evidenceRefs: membership.evidenceRefs ?? []
      }
    );
  }

  async upsertIntegrationPoint(integrationPoint: IntegrationPointRecord): Promise<void> {
    await runWrite(
      this.driver,
      `
        MERGE (integrationPoint:PmRef {portfolioId: $portfolioId, ref: $integrationPointId})
        SET integrationPoint:PmIntegrationPoint,
            integrationPoint.integrationPointId = $integrationPointId,
            integrationPoint.producerProjectId = $producerProjectId,
            integrationPoint.consumerProjectIds = $consumerProjectIds,
            integrationPoint.artifactRefs = $artifactRefs,
            integrationPoint.coordinationItemsJson = $coordinationItemsJson,
            integrationPoint.purpose = $purpose,
            integrationPoint.status = $status,
            integrationPoint.kind = 'integration_point',
            integrationPoint.recordedAt = $recordedAt,
            integrationPoint.evidenceRefs = $evidenceRefs,
            integrationPoint.idempotencyKeys = $idempotencyKeys,
            integrationPoint.projectRolesJson = $projectRolesJson,
            integrationPoint.statusHistoryJson = $statusHistoryJson
        WITH integrationPoint
        MATCH (producer:PmRef:PmProject {portfolioId: $portfolioId, ref: $producerProjectId})
        MERGE (producer)-[:PRODUCES_INTEGRATION_POINT {portfolioId: $portfolioId, integrationPointId: $integrationPointId}]->(integrationPoint)
      `,
      {
        ...integrationPoint,
        artifactRefs: integrationPoint.artifactRefs ?? [],
        coordinationItemsJson: JSON.stringify(integrationPoint.coordinationItems ?? []),
        recordedAt: normalizeRecordedAt(integrationPoint.recordedAt),
        evidenceRefs: integrationPoint.evidenceRefs ?? [],
        idempotencyKeys: integrationPoint.idempotencyKeys ?? [],
        projectRolesJson: JSON.stringify(integrationPoint.projectRoles ?? {}),
        statusHistoryJson: JSON.stringify(integrationPoint.statusHistory ?? []),
        status: integrationPoint.status ?? "active"
      }
    );

    for (const consumerProjectId of integrationPoint.consumerProjectIds) {
      await runWrite(
        this.driver,
        `
          MATCH (integrationPoint:PmRef:PmIntegrationPoint {portfolioId: $portfolioId, ref: $integrationPointId})
          MATCH (consumer:PmRef:PmProject {portfolioId: $portfolioId, ref: $consumerProjectId})
          MERGE (consumer)-[:CONSUMES_INTEGRATION_POINT {portfolioId: $portfolioId, integrationPointId: $integrationPointId}]->(integrationPoint)
        `,
        {
          portfolioId: integrationPoint.portfolioId,
          integrationPointId: integrationPoint.integrationPointId,
          consumerProjectId
        }
      );
    }
  }

  async upsertContract(contract: ContractRecord): Promise<void> {
    await runWrite(
      this.driver,
      `
        MERGE (contract:PmRef {portfolioId: $portfolioId, ref: $contractRef})
        SET contract:PmContract,
            contract.contractRef = $contractRef,
            contract.integrationPointId = $integrationPointId,
            contract.producerProjectId = $producerProjectId,
            contract.kind = 'contract',
            contract.recordedAt = $recordedAt,
            contract.evidenceRefs = $evidenceRefs
        WITH contract
        MATCH (project:PmRef:PmProject {portfolioId: $portfolioId, ref: $producerProjectId})
        MERGE (project)-[:PRODUCES_CONTRACT {portfolioId: $portfolioId, contractRef: $contractRef}]->(contract)
        WITH contract
        MATCH (integrationPoint:PmRef:PmIntegrationPoint {portfolioId: $portfolioId, ref: $integrationPointId})
        MERGE (integrationPoint)-[:IMPLEMENTS_CONTRACT {portfolioId: $portfolioId, contractRef: $contractRef}]->(contract)
      `,
      {
        ...contract,
        recordedAt: normalizeRecordedAt(contract.recordedAt),
        evidenceRefs: contract.evidenceRefs ?? []
      }
    );
  }

  async upsertRelationship(relationship: GraphRelationship): Promise<void> {
    const relationshipType = sanitizeRelationshipType(relationship.dependencyType);
    await runWrite(
      this.driver,
      `
        MATCH ()-[existing]->()
        WHERE existing.portfolioId = $portfolioId AND existing.dependencyId = $dependencyId
        DELETE existing
      `,
      {
        portfolioId: relationship.portfolioId,
        dependencyId: relationship.dependencyId
      }
    );
    await runWrite(
      this.driver,
      `
        MERGE (fromRef:PmRef {portfolioId: $portfolioId, ref: $fromRef})
        ON CREATE SET fromRef.kind = 'reference', fromRef.recordedAt = $recordedAt
        MERGE (toRef:PmRef {portfolioId: $portfolioId, ref: $toRef})
        ON CREATE SET toRef.kind = 'reference', toRef.recordedAt = $recordedAt
        MERGE (fromRef)-[dependency:${relationshipType} {portfolioId: $portfolioId, dependencyId: $dependencyId}]->(toRef)
        SET dependency.programId = $programId,
            dependency.projectId = $projectId,
            dependency.dependencyType = $dependencyType,
            dependency.criticality = $criticality,
            dependency.status = $status,
            dependency.recordedAt = $recordedAt,
            dependency.validFrom = $validFrom,
            dependency.validTo = $validTo,
            dependency.evidenceRefs = $evidenceRefs,
            dependency.sourceAdapterId = $sourceAdapterId,
            dependency.sourceCursor = $sourceCursor
      `,
      relationship
    );
  }

  async upsertEvidenceRef(evidenceRef: EvidenceRef): Promise<void> {
    await runWrite(
      this.driver,
      `
        MERGE (evidenceRef:PmRef {portfolioId: $portfolioId, ref: $evidenceRef})
        SET evidenceRef:PmEvidence,
            evidenceRef.evidenceRef = $evidenceRef,
            evidenceRef.kind = $kind,
            evidenceRef.recordedAt = $recordedAt,
            evidenceRef.artifactRef = $artifactRef,
            evidenceRef.attachesToRefs = $attachesToRefs,
            evidenceRef.classification = $classification,
            evidenceRef.redactionStatus = $redactionStatus,
            evidenceRef.retentionPolicyRef = $retentionPolicyRef,
            evidenceRef.summary = $summary
      `,
      {
        ...evidenceRef,
        attachesToRefs: evidenceRef.attachesToRefs ?? []
      }
    );
  }

  async upsertArtifactRef(artifactRef: ArtifactRef): Promise<void> {
    await runWrite(
      this.driver,
      `
        MERGE (artifactRef:PmRef {portfolioId: $portfolioId, ref: $artifactRef})
        SET artifactRef:PmArtifact,
            artifactRef.artifactRef = $artifactRef,
            artifactRef.artifactType = $artifactType,
            artifactRef.storageUri = $storageUri,
            artifactRef.contentHashAlgorithm = $contentHashAlgorithm,
            artifactRef.contentHashValue = $contentHashValue,
            artifactRef.classification = $classification,
            artifactRef.redactionStatus = $redactionStatus,
            artifactRef.retentionPolicyRef = $retentionPolicyRef,
            artifactRef.kind = 'artifact',
            artifactRef.createdAt = $createdAt
      `,
      {
        portfolioId: artifactRef.portfolioId,
        artifactRef: artifactRef.artifactRef,
        artifactType: artifactRef.artifactType,
        storageUri: artifactRef.storageUri,
        contentHashAlgorithm: artifactRef.contentHash.algorithm,
        contentHashValue: artifactRef.contentHash.value,
        classification: artifactRef.classification,
        redactionStatus: artifactRef.redactionStatus,
        retentionPolicyRef: artifactRef.retentionPolicyRef,
        createdAt: artifactRef.createdAt
      }
    );
  }

  async upsertDecision(decision: DecisionRecordEnvelope): Promise<void> {
    await runWrite(
      this.driver,
      `
        MERGE (decision:PmRef {portfolioId: $portfolioId, ref: $decisionId})
        SET decision:PmDecision,
            decision.decisionId = $decisionId,
            decision.programId = $programId,
            decision.projectId = $projectId,
            decision.summary = $summary,
            decision.status = $status,
            decision.recordedAt = $recordedAt,
            decision.validFrom = $validFrom,
            decision.validTo = $validTo,
            decision.evidenceRefs = $evidenceRefs,
            decision.appliesToRefs = $appliesToRefs,
            decision.actorId = $actorId,
            decision.authorityRef = $authorityRef,
            decision.decisionType = $decisionType,
            decision.branchName = $branchName,
            decision.gitCommit = $gitCommit,
            decision.trackerRev = $trackerRev,
            decision.trackerSlug = $trackerSlug,
            decision.kind = 'decision'
      `,
      {
        ...decision,
        appliesToRefs: decision.appliesToRefs ?? []
      }
    );
  }

  async upsertIntelligenceRecord(record: ProgramIntelligenceRecord): Promise<void> {
    await runWrite(
      this.driver,
      `
        MERGE (record:PmRef {portfolioId: $portfolioId, ref: $recordId})
        SET record:PmIntelligenceRecord,
            record.recordId = $recordId,
            record.recordType = $recordType,
            record.programId = $programId,
            record.projectId = $projectId,
            record.title = $title,
            record.summary = $summary,
            record.recordedAt = $recordedAt,
            record.validFrom = $validFrom,
            record.validTo = $validTo,
            record.evidenceRefs = $evidenceRefs,
            record.sourceRefs = $sourceRefs,
            record.sourceAdapterId = $sourceAdapterId,
            record.sourceCursor = $sourceCursor,
            record.conditionTags = $conditionTags,
            record.appliesToRefs = $appliesToRefs,
            record.reviewStatus = $reviewStatus,
            record.branchName = $branchName,
            record.gitCommit = $gitCommit,
            record.trackerRev = $trackerRev,
            record.trackerSlug = $trackerSlug,
            record.payload = $payload,
            record.kind = 'intelligence_record'
      `,
      {
        ...record,
        payload: JSON.stringify(record)
      }
    );
  }

  async upsertExpectedReceipt(receipt: ExpectedReceipt): Promise<void> {
    await runWrite(
      this.driver,
      `
        MERGE (receipt:PmExpectedReceipt {portfolioId: $portfolioId, receiptRequirementId: $receiptRequirementId})
        SET receipt.payload = $payload,
            receipt.flightPlanId = $flightPlanId,
            receipt.proposedActionId = $proposedActionId,
            receipt.projectId = $projectId,
            receipt.programId = $programId,
            receipt.actorId = $actorId,
            receipt.recordedAt = $recordedAt
      `,
      {
        ...receipt,
        payload: JSON.stringify(receipt)
      }
    );
  }

  async appendObservedReceipt(receipt: ObservedReceipt): Promise<void> {
    await runWrite(
      this.driver,
      `
        CREATE (receipt:PmObservedReceipt {
          portfolioId: $portfolioId,
          observedReceiptId: $observedReceiptId,
          receiptRequirementId: $receiptRequirementId,
          flightPlanId: $flightPlanId,
          proposedActionId: $proposedActionId,
          projectId: $projectId,
          programId: $programId,
          actorId: $actorId,
          recordedAt: $recordedAt,
          status: $status,
          payload: $payload
        })
      `,
      {
        ...receipt,
        payload: JSON.stringify(receipt)
      }
    );
  }

  async appendActionLedgerEntry(entry: ActionLedgerEntry): Promise<void> {
    await runWrite(
      this.driver,
      `
        CREATE (entry:PmActionLedgerEntry {
          portfolioId: $portfolioId,
          ledgerEntryId: $ledgerEntryId,
          flightPlanId: $flightPlanId,
          proposedActionId: $proposedActionId,
          receiptRequirementId: $receiptRequirementId,
          observedReceiptId: $observedReceiptId,
          projectId: $projectId,
          programId: $programId,
          actorId: $actorId,
          recordedAt: $recordedAt,
          entryType: $entryType,
          status: $status,
          payload: $payload
        })
      `,
      {
        ...entry,
        payload: JSON.stringify(entry)
      }
    );
  }

  async upsertReceiptReconcileStatus(status: ReceiptReconcileRecord): Promise<void> {
    await runWrite(
      this.driver,
      `
        MERGE (status:PmReceiptReconcileStatus {portfolioId: $portfolioId, receiptRequirementId: $receiptRequirementId})
        SET status.payload = $payload,
            status.flightPlanId = $flightPlanId,
            status.proposedActionId = $proposedActionId,
            status.projectId = $projectId,
            status.programId = $programId,
            status.reconcileStatus = $status,
            status.updatedAt = $updatedAt
      `,
      {
        ...status,
        payload: JSON.stringify(status)
      }
    );
  }

  async appendEvent(event: ProgramEvent): Promise<void> {
    await runWrite(
      this.driver,
      `
        MERGE (event:PmEvent {portfolioId: $portfolioId, eventId: $eventId})
        SET event.eventType = $eventType,
            event.recordedAt = $recordedAt,
            event.contextAnchor = $contextAnchor,
            event.evidenceRefs = $evidenceRefs,
            event.artifactRefs = $artifactRefs,
            event.payload = $payload
      `,
      {
        ...event,
        contextAnchor: event.contextAnchor ? JSON.stringify(event.contextAnchor) : null,
        payload: JSON.stringify(event)
      }
    );
  }

  async upsertSyncCursor(cursor: SyncCursorRecord): Promise<void> {
    await runWrite(
      this.driver,
      `
        MERGE (cursor:PmSyncCursor {portfolioId: $portfolioId, adapterId: $adapterId})
        SET cursor.cursor = $cursor,
            cursor.recordedAt = $recordedAt,
            cursor.observedAt = $observedAt,
            cursor.status = $status,
            cursor.sourceRevisionHash = $sourceRevisionHash
      `,
      cursor
    );
  }

  async upsertMacroTask(task: PmoTask): Promise<void> {
    await this.upsertMacroFact("PmMacroTask", task.taskRef, task);
  }

  async upsertMacroBlocker(blocker: PmoBlocker): Promise<void> {
    await this.upsertMacroFact("PmMacroBlocker", blocker.blockerRef, blocker);
  }

  async upsertMacroContract(contract: PmoContract): Promise<void> {
    await this.upsertMacroFact("PmMacroContract", contract.contractRef, contract);
  }

  async upsertMacroDependencyEdge(edge: PmoDependencyEdge): Promise<void> {
    await this.upsertMacroFact("PmMacroDependencyEdge", edge.dependencyRef, edge);
  }

  async upsertMacroRunbook(runbook: PmoRunbook): Promise<void> {
    await this.upsertMacroFact("PmMacroRunbook", runbook.runbookRef, runbook);
  }

  async upsertMacroRegistry(registry: PmoMacroRegistry): Promise<void> {
    await runWrite(
      this.driver,
      `
        MERGE (registry:PmMacroRegistry {portfolioId: $portfolioId, registryRef: $registryRef})
        SET registry.registryVersion = $registryVersion,
            registry.recordedAt = $recordedAt,
            registry.evidenceRefs = $evidenceRefs,
            registry.payload = $payload
      `,
      {
        ...registry,
        payload: JSON.stringify(registry)
      }
    );
  }

  private async upsertMacroFact(
    label: "PmMacroTask" | "PmMacroBlocker" | "PmMacroContract" | "PmMacroDependencyEdge" | "PmMacroRunbook",
    ref: string,
    fact: PmoTask | PmoBlocker | PmoContract | PmoDependencyEdge | PmoRunbook
  ): Promise<void> {
    await runWrite(
      this.driver,
      `
        MERGE (fact:PmRef {portfolioId: $portfolioId, ref: $ref})
        SET fact:PmMacroFact:${label},
            fact.id = $id,
            fact.ref = $ref,
            fact.objectType = $objectType,
            fact.programId = $programId,
            fact.projectId = $projectId,
            fact.recordedAt = $recordedAt,
            fact.validFrom = $validFrom,
            fact.validTo = $validTo,
            fact.evidenceRefs = $evidenceRefs,
            fact.evidenceStatus = $evidenceStatus,
            fact.supersededBy = $supersededBy,
            fact.sourceAdapterId = $sourceAdapterId,
            fact.sourceCursor = $sourceCursor,
            fact.payload = $payload
      `,
      {
        ...fact,
        ref,
        payload: JSON.stringify(fact)
      }
    );
  }

  async listPrograms(scope: RepositoryScope): Promise<ProgramRef[]> {
    return runRead(
      this.driver,
      `
        MATCH (program:PmProgram)
        WHERE program.portfolioId = $portfolioId
          AND ($programId IS NULL OR program.programId = $programId)
        RETURN {
          portfolioId: program.portfolioId,
          programId: program.programId,
          name: program.name,
          status: program.status,
          trackerRef: program.trackerRef,
          repoRef: program.repoRef,
          adapterRef: program.adapterRef,
          goal: program.goal
        } AS program
        ORDER BY program.programId, program.name
      `,
      toScopeParams(scope),
      (record) => mapRecord<ProgramRef>(record, "program")
    );
  }

  async listProjects(scope: RepositoryScope): Promise<ProjectRef[]> {
    return runRead(
      this.driver,
      `
        MATCH (project:PmProject)
        WHERE project.portfolioId = $portfolioId
          AND ($programId IS NULL OR $programId IN coalesce(project.activeProgramIds, [project.programId]))
          AND ($projectIds IS NULL OR size($projectIds) = 0 OR project.projectId IN $projectIds)
        RETURN {
          portfolioId: project.portfolioId,
          programId: project.programId,
          projectId: project.projectId,
          name: project.name,
          activeProgramIds: project.activeProgramIds,
          status: project.status,
          projectRole: project.projectRole,
          trackerRef: project.trackerRef,
          repoRef: project.repoRef,
          adapterRef: project.adapterRef,
          goal: project.goal
        } AS project
        ORDER BY project.programId, project.projectId, project.name
      `,
      toScopeParams(scope),
      (record) => mapRecord<ProjectRef>(record, "project")
    );
  }

  async listMemberships(scope: RepositoryScope): Promise<ProgramMembership[]> {
    return runRead(
      this.driver,
      `
        MATCH (:PmProgram)-[membership:HAS_PROJECT]->(:PmProject)
        WHERE ${scopeWhere(scope, "membership")}
        RETURN {
          portfolioId: membership.portfolioId,
          programId: membership.programId,
          projectId: membership.projectId,
          recordedAt: membership.recordedAt,
          evidenceRefs: coalesce(membership.evidenceRefs, [])
        } AS membership
        ORDER BY membership.programId, membership.projectId, membership.recordedAt
      `,
      toScopeParams(scope),
      (record) => mapRecord<ProgramMembership>(record, "membership")
    );
  }

  async listIntegrationPoints(scope: RepositoryScope): Promise<IntegrationPointRecord[]> {
    const params = toScopeParams(scope);
    params.scopeProjectIds = scope.projectIds ?? [];
    return runRead(
      this.driver,
      `
        MATCH (integrationPoint:PmIntegrationPoint)
        WITH integrationPoint,
             [integrationPoint.producerProjectId] + coalesce(integrationPoint.consumerProjectIds, []) AS relatedProjectIds
        OPTIONAL MATCH (relatedProject:PmProject {portfolioId: $portfolioId})
        WHERE relatedProject.ref IN relatedProjectIds
        WITH integrationPoint,
             relatedProjectIds,
             [project IN collect(relatedProject) WHERE project.programId IS NOT NULL | project.programId] AS directProgramIds
        WHERE integrationPoint.portfolioId = $portfolioId
          AND ($programId IS NULL OR $programId IN directProgramIds)
          AND (
            size($scopeProjectIds) = 0 OR
            any(projectId IN relatedProjectIds WHERE projectId IN $scopeProjectIds)
          )
        RETURN {
          integrationPointId: integrationPoint.integrationPointId,
          portfolioId: integrationPoint.portfolioId,
          producerProjectId: integrationPoint.producerProjectId,
          consumerProjectIds: coalesce(integrationPoint.consumerProjectIds, []),
          artifactRefs: coalesce(integrationPoint.artifactRefs, []),
          coordinationItemsJson: integrationPoint.coordinationItemsJson,
          purpose: integrationPoint.purpose,
          recordedAt: integrationPoint.recordedAt,
          evidenceRefs: coalesce(integrationPoint.evidenceRefs, []),
          idempotencyKeys: coalesce(integrationPoint.idempotencyKeys, []),
          projectRolesJson: integrationPoint.projectRolesJson,
          statusHistoryJson: integrationPoint.statusHistoryJson,
          status: coalesce(integrationPoint.status, 'active')
        } AS integrationPoint
        ORDER BY integrationPoint.integrationPointId, integrationPoint.recordedAt
      `,
      params,
      (record) => {
        const value = mapRecord<
          IntegrationPointRecord & {
            coordinationItemsJson?: string | null;
            projectRolesJson?: string | null;
            statusHistoryJson?: string | null;
          }
        >(record, "integrationPoint");
        const {
          coordinationItemsJson,
          projectRolesJson,
          statusHistoryJson,
          ...integrationPoint
        } = value;
        return {
          ...integrationPoint,
          coordinationItems: coordinationItemsJson ? JSON.parse(coordinationItemsJson) : [],
          projectRoles: projectRolesJson ? JSON.parse(projectRolesJson) : {},
          statusHistory: statusHistoryJson ? JSON.parse(statusHistoryJson) : []
        };
      }
    );
  }

  async listContracts(scope: RepositoryScope): Promise<ContractRecord[]> {
    const params = toScopeParams(scope);
    return runRead(
      this.driver,
      `
        MATCH (contract:PmContract)
        MATCH (producer:PmProject {portfolioId: $portfolioId, ref: contract.producerProjectId})
        WHERE contract.portfolioId = $portfolioId
          AND ($programId IS NULL OR producer.programId = $programId)
          AND ($projectIds IS NULL OR size($projectIds) = 0 OR contract.producerProjectId IN $projectIds)
        RETURN {
          contractRef: contract.contractRef,
          portfolioId: contract.portfolioId,
          integrationPointId: contract.integrationPointId,
          producerProjectId: contract.producerProjectId,
          recordedAt: contract.recordedAt,
          evidenceRefs: coalesce(contract.evidenceRefs, [])
        } AS contract
        ORDER BY contract.contractRef, contract.recordedAt
      `,
      params,
      (record) => mapRecord<ContractRecord>(record, "contract")
    );
  }

  async listRelationships(scope: RepositoryScope): Promise<GraphRelationship[]> {
    return runRead(
      this.driver,
      `
        MATCH (fromRef:PmRef)-[dependency]->(toRef:PmRef)
        WHERE dependency.portfolioId = $portfolioId
          AND dependency.dependencyId IS NOT NULL
          AND ($programId IS NULL OR dependency.programId = $programId)
          AND ($projectIds IS NULL OR size($projectIds) = 0 OR dependency.projectId IN $projectIds)
        RETURN {
          dependencyId: dependency.dependencyId,
          portfolioId: dependency.portfolioId,
          programId: dependency.programId,
          projectId: dependency.projectId,
          fromRef: fromRef.ref,
          toRef: toRef.ref,
          dependencyType: dependency.dependencyType,
          criticality: dependency.criticality,
          status: dependency.status,
          recordedAt: dependency.recordedAt,
          validFrom: dependency.validFrom,
          validTo: dependency.validTo,
          evidenceRefs: coalesce(dependency.evidenceRefs, []),
          sourceAdapterId: dependency.sourceAdapterId,
          sourceCursor: dependency.sourceCursor
        } AS relationship
        ORDER BY dependency.recordedAt, dependency.dependencyId, fromRef.ref, toRef.ref
      `,
      toScopeParams(scope),
      (record) => mapRecord<GraphRelationship>(record, "relationship")
    );
  }

  async listEvidenceRefs(scope: RepositoryScope, refs?: string[]): Promise<EvidenceRef[]> {
    return runRead(
      this.driver,
      `
        MATCH (evidenceRef:PmEvidence)
        WHERE evidenceRef.portfolioId = $portfolioId
          AND ($refs IS NULL OR size($refs) = 0 OR evidenceRef.evidenceRef IN $refs)
        RETURN {
          evidenceRef: evidenceRef.evidenceRef,
          portfolioId: evidenceRef.portfolioId,
          kind: evidenceRef.kind,
          recordedAt: evidenceRef.recordedAt,
          artifactRef: evidenceRef.artifactRef,
          attachesToRefs: coalesce(evidenceRef.attachesToRefs, []),
          classification: evidenceRef.classification,
          redactionStatus: evidenceRef.redactionStatus,
          retentionPolicyRef: evidenceRef.retentionPolicyRef,
          summary: evidenceRef.summary
        } AS evidenceRef
        ORDER BY evidenceRef.evidenceRef
      `,
      {
        portfolioId: scope.portfolioId,
        refs: refs ?? []
      },
      (record) => mapRecord<EvidenceRef>(record, "evidenceRef")
    );
  }

  async listArtifactRefs(scope: RepositoryScope, refs?: string[]): Promise<ArtifactRef[]> {
    return runRead(
      this.driver,
      `
        MATCH (artifactRef:PmArtifact)
        WHERE artifactRef.portfolioId = $portfolioId
          AND ($refs IS NULL OR size($refs) = 0 OR artifactRef.artifactRef IN $refs)
        RETURN {
          artifactRef: artifactRef.artifactRef,
          portfolioId: artifactRef.portfolioId,
          artifactType: artifactRef.artifactType,
          storageUri: artifactRef.storageUri,
          contentHash: {
            algorithm: artifactRef.contentHashAlgorithm,
            value: artifactRef.contentHashValue
          },
          classification: artifactRef.classification,
          redactionStatus: artifactRef.redactionStatus,
          retentionPolicyRef: artifactRef.retentionPolicyRef,
          createdAt: artifactRef.createdAt
        } AS artifactRef
        ORDER BY artifactRef.artifactRef
      `,
      {
        portfolioId: scope.portfolioId,
        refs: refs ?? []
      },
      (record) => mapRecord<ArtifactRef>(record, "artifactRef")
    );
  }

  async listDecisions(query: DecisionQuery): Promise<DecisionRecordEnvelope[]> {
    return runRead(
      this.driver,
      `
        MATCH (decision:PmDecision)
        WHERE decision.portfolioId = $portfolioId
          AND ($programId IS NULL OR decision.programId = $programId)
          AND ($projectIds IS NULL OR size($projectIds) = 0 OR decision.projectId IN $projectIds)
          AND ($branchName IS NULL OR decision.branchName IS NULL OR decision.branchName = $branchName)
          AND ($gitCommit IS NULL OR decision.gitCommit IS NULL OR decision.gitCommit = $gitCommit)
          AND ($trackerSlug IS NULL OR decision.trackerSlug IS NULL OR decision.trackerSlug = $trackerSlug)
          AND ($trackerRev IS NULL OR decision.trackerRev IS NULL OR decision.trackerRev <= $trackerRev)
          AND (
            $asOf IS NULL OR (
              decision.validFrom <= $asOf AND
              (decision.validTo IS NULL OR decision.validTo >= $asOf)
            )
          )
          AND ($statuses IS NULL OR size($statuses) = 0 OR decision.status IN $statuses)
          AND (
            $targetRefs IS NULL OR size($targetRefs) = 0 OR decision.decisionId IN $targetRefs OR
            any(ref IN coalesce(decision.appliesToRefs, []) WHERE ref IN $targetRefs)
          )
        RETURN {
          decisionId: decision.decisionId,
          portfolioId: decision.portfolioId,
          programId: decision.programId,
          projectId: decision.projectId,
          summary: decision.summary,
            status: decision.status,
            branchName: decision.branchName,
            gitCommit: decision.gitCommit,
            trackerRev: decision.trackerRev,
            trackerSlug: decision.trackerSlug,
            recordedAt: decision.recordedAt,
            validFrom: decision.validFrom,
            validTo: decision.validTo,
            evidenceRefs: coalesce(decision.evidenceRefs, []),
          appliesToRefs: coalesce(decision.appliesToRefs, []),
          actorId: decision.actorId,
          authorityRef: decision.authorityRef,
          decisionType: decision.decisionType
        } AS decision
        ORDER BY decision.recordedAt, decision.decisionId
      `,
      {
        ...toScopeParams(query.scope),
        branchName: query.contextAnchor?.branchName,
        gitCommit: query.contextAnchor?.gitCommit,
        trackerSlug: query.contextAnchor?.trackerSlug,
        trackerRev: query.contextAnchor?.trackerRev,
        asOf: query.contextAnchor?.asOf,
        statuses: query.statuses ?? [],
        targetRefs: query.targetRefs ?? []
      },
      (record) => mapRecord<DecisionRecordEnvelope>(record, "decision")
    );
  }

  async listIntelligenceRecords(
    query: ProgramIntelligenceQuery
  ): Promise<ProgramIntelligenceRecord[]> {
    const records = await runRead(
      this.driver,
      `
        MATCH (record:PmIntelligenceRecord)
        WHERE record.portfolioId = $portfolioId
          AND ($programId IS NULL OR record.programId = $programId)
          AND ($projectIds IS NULL OR size($projectIds) = 0 OR record.projectId IN $projectIds)
          AND ($branchName IS NULL OR record.branchName IS NULL OR record.branchName = $branchName)
          AND ($gitCommit IS NULL OR record.gitCommit IS NULL OR record.gitCommit = $gitCommit)
          AND ($trackerSlug IS NULL OR record.trackerSlug IS NULL OR record.trackerSlug = $trackerSlug)
          AND ($trackerRev IS NULL OR record.trackerRev IS NULL OR record.trackerRev <= $trackerRev)
          AND (
            $asOf IS NULL OR (
              record.validFrom <= $asOf AND
              (record.validTo IS NULL OR record.validTo >= $asOf)
            )
          )
          AND ($recordTypes IS NULL OR size($recordTypes) = 0 OR record.recordType IN $recordTypes)
          AND ($reviewStatuses IS NULL OR size($reviewStatuses) = 0 OR record.reviewStatus IN $reviewStatuses)
          AND (
            $targetRefs IS NULL OR size($targetRefs) = 0 OR record.recordId IN $targetRefs OR
            any(ref IN coalesce(record.appliesToRefs, []) WHERE ref IN $targetRefs) OR
            any(ref IN coalesce(record.sourceRefs, []) WHERE ref IN $targetRefs) OR
            any(ref IN coalesce(record.evidenceRefs, []) WHERE ref IN $targetRefs)
          )
          AND (
            $conditionTags IS NULL OR size($conditionTags) = 0 OR
            any(tag IN coalesce(record.conditionTags, []) WHERE tag IN $conditionTags)
          )
        RETURN record.payload AS payload
        ORDER BY record.recordedAt, record.recordType, record.recordId
      `,
      {
        ...toScopeParams(query.scope),
        branchName: query.contextAnchor?.branchName,
        gitCommit: query.contextAnchor?.gitCommit,
        trackerSlug: query.contextAnchor?.trackerSlug,
        trackerRev: query.contextAnchor?.trackerRev,
        asOf: query.contextAnchor?.asOf,
        recordTypes: query.recordTypes ?? [],
        reviewStatuses: query.reviewStatuses ?? [],
        targetRefs: query.targetRefs ?? [],
        conditionTags: query.conditionTags ?? []
      },
      (record) => JSON.parse(mapRecord<string>(record, "payload")) as ProgramIntelligenceRecord
    );
    return typeof query.limit === "number" ? records.slice(0, query.limit) : records;
  }

  async listExpectedReceipts(query: ReceiptLedgerQuery): Promise<ExpectedReceipt[]> {
    const records = await runRead(
      this.driver,
      `
        MATCH (receipt:PmExpectedReceipt)
        WHERE receipt.portfolioId = $portfolioId
        RETURN receipt.payload AS payload
      `,
      toScopeParams(query.scope),
      (record) => parsePayload<ExpectedReceipt>(record, "payload")
    );
    const filtered = records
      .filter((receipt) =>
        matchesLedgerQuery({ ...receipt, evidenceRefs: receipt.requiredEvidenceRefs }, query)
      )
      .sort(compareLedgerValues);
    return typeof query.limit === "number" ? filtered.slice(0, query.limit) : filtered;
  }

  async listObservedReceipts(query: ReceiptLedgerQuery): Promise<ObservedReceipt[]> {
    const records = await runRead(
      this.driver,
      `
        MATCH (receipt:PmObservedReceipt)
        WHERE receipt.portfolioId = $portfolioId
        RETURN receipt.payload AS payload
      `,
      toScopeParams(query.scope),
      (record) => parsePayload<ObservedReceipt>(record, "payload")
    );
    const filtered = records
      .filter(
        (receipt) =>
          matchesLedgerQuery(receipt, query) &&
          (!query.observedStatuses?.length || query.observedStatuses.includes(receipt.status))
      )
      .sort(compareLedgerValues);
    return typeof query.limit === "number" ? filtered.slice(0, query.limit) : filtered;
  }

  async listActionLedgerEntries(query: ReceiptLedgerQuery): Promise<ActionLedgerEntry[]> {
    const records = await runRead(
      this.driver,
      `
        MATCH (entry:PmActionLedgerEntry)
        WHERE entry.portfolioId = $portfolioId
        RETURN entry.payload AS payload
      `,
      toScopeParams(query.scope),
      (record) => parsePayload<ActionLedgerEntry>(record, "payload")
    );
    const filtered = records
      .filter((entry) => matchesLedgerQuery(entry, query))
      .sort(compareLedgerValues);
    return typeof query.limit === "number" ? filtered.slice(0, query.limit) : filtered;
  }

  async listReceiptReconcileStatuses(
    query: ReceiptLedgerQuery
  ): Promise<ReceiptReconcileRecord[]> {
    const records = await runRead(
      this.driver,
      `
        MATCH (status:PmReceiptReconcileStatus)
        WHERE status.portfolioId = $portfolioId
        RETURN status.payload AS payload
      `,
      toScopeParams(query.scope),
      (record) => parsePayload<ReceiptReconcileRecord>(record, "payload")
    );
    const filtered = records
      .filter(
        (status) =>
          matchesLedgerQuery(status, query) &&
          (!query.reconcileStatuses?.length || query.reconcileStatuses.includes(status.status))
      )
      .sort(compareLedgerValues);
    return typeof query.limit === "number" ? filtered.slice(0, query.limit) : filtered;
  }

  async listEvents(scope: RepositoryScope): Promise<ProgramEvent[]> {
    return runRead(
      this.driver,
      `
        MATCH (event:PmEvent)
        WHERE event.portfolioId = $portfolioId
        RETURN {
          payload: event.payload,
          eventId: event.eventId,
          portfolioId: event.portfolioId,
          eventType: event.eventType,
          recordedAt: event.recordedAt,
          contextAnchor: CASE
            WHEN event.contextAnchor IS NULL THEN NULL
            ELSE event.contextAnchor
          END,
          evidenceRefs: coalesce(event.evidenceRefs, []),
          artifactRefs: coalesce(event.artifactRefs, [])
        } AS event
        ORDER BY event.recordedAt, event.eventId
      `,
      toScopeParams(scope),
      (record) => {
        const event = mapRecord<Record<string, unknown>>(record, "event");
        if (typeof event.payload === "string") {
          return JSON.parse(event.payload) as ProgramEvent;
        }
        return {
          eventId: event.eventId as string,
          portfolioId: event.portfolioId as string,
          eventType: event.eventType as string,
          recordedAt: event.recordedAt as string,
          contextAnchor:
            typeof event.contextAnchor === "string"
              ? (JSON.parse(event.contextAnchor) as ProgramEvent["contextAnchor"])
              : undefined,
          evidenceRefs: (event.evidenceRefs as string[]) ?? [],
          artifactRefs: (event.artifactRefs as string[]) ?? []
        };
      }
    );
  }

  async listSyncCursors(scope: RepositoryScope): Promise<SyncCursorRecord[]> {
    return runRead(
      this.driver,
      `
        MATCH (cursor:PmSyncCursor)
        WHERE cursor.portfolioId = $portfolioId
        RETURN {
          adapterId: cursor.adapterId,
          portfolioId: cursor.portfolioId,
          cursor: cursor.cursor,
          recordedAt: cursor.recordedAt,
          observedAt: cursor.observedAt,
          sourceRevisionHash: cursor.sourceRevisionHash,
          status: cursor.status
        } AS cursor
        ORDER BY cursor.adapterId, cursor.recordedAt
      `,
      toScopeParams(scope),
      (record) => mapRecord<SyncCursorRecord>(record, "cursor")
    );
  }

  async listMacroTasks(scope: RepositoryScope): Promise<PmoTask[]> {
    return this.listMacroFactsByLabel<PmoTask>(scope, "PmMacroTask", "taskRef");
  }

  async listMacroBlockers(scope: RepositoryScope): Promise<PmoBlocker[]> {
    return this.listMacroFactsByLabel<PmoBlocker>(scope, "PmMacroBlocker", "blockerRef");
  }

  async listMacroContracts(scope: RepositoryScope): Promise<PmoContract[]> {
    return this.listMacroFactsByLabel<PmoContract>(scope, "PmMacroContract", "contractRef");
  }

  async listMacroDependencyEdges(scope: RepositoryScope): Promise<PmoDependencyEdge[]> {
    return this.listMacroFactsByLabel<PmoDependencyEdge>(scope, "PmMacroDependencyEdge", "dependencyRef");
  }

  async listMacroRunbooks(scope: RepositoryScope): Promise<PmoRunbook[]> {
    return this.listMacroFactsByLabel<PmoRunbook>(scope, "PmMacroRunbook", "runbookRef");
  }

  async getMacroRegistry(scope: RepositoryScope): Promise<PmoMacroRegistry | undefined> {
    const registries = await runRead(
      this.driver,
      `
        MATCH (registry:PmMacroRegistry)
        WHERE registry.portfolioId = $portfolioId
        RETURN registry.payload AS payload
        ORDER BY registry.recordedAt DESC, registry.registryRef
      `,
      toScopeParams(scope),
      (record) => parsePayload<PmoMacroRegistry>(record, "payload")
    );
    return registries[0];
  }

  private async listMacroFactsByLabel<T>(
    scope: RepositoryScope,
    label: "PmMacroTask" | "PmMacroBlocker" | "PmMacroContract" | "PmMacroDependencyEdge" | "PmMacroRunbook",
    orderProperty: string
  ): Promise<T[]> {
    return runRead(
      this.driver,
      `
        MATCH (fact:PmMacroFact:${label})
        WHERE ${macroScopeWhere(scope, "fact")}
        RETURN fact.payload AS payload
        ORDER BY fact.${orderProperty}, fact.recordedAt
      `,
      toScopeParams(scope),
      (record) => parsePayload<T>(record, "payload")
    );
  }
}
