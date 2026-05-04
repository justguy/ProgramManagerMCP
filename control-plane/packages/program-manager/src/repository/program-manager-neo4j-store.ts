import type {
  ArtifactRef,
  EvidenceRef,
  GraphRelationship,
  ProgramEvent,
  ProgramIntelligenceRecord,
  ProgramRef,
  ProjectRef
} from "../types/domain.js";
import type {
  DecisionQuery,
  ProgramIntelligenceQuery,
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
  return record.get(key) as T;
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
            program.kind = 'program',
            program.recordedAt = $recordedAt
      `,
      {
        portfolioId: program.portfolioId,
        programId: program.programId,
        name: program.name,
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
            project.kind = 'project',
            project.recordedAt = $recordedAt
      `,
      {
        portfolioId: project.portfolioId,
        programId: project.programId,
        projectId: project.projectId,
        name: project.name,
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
            integrationPoint.purpose = $purpose,
            integrationPoint.kind = 'integration_point',
            integrationPoint.recordedAt = $recordedAt,
            integrationPoint.evidenceRefs = $evidenceRefs
        WITH integrationPoint
        MATCH (producer:PmRef:PmProject {portfolioId: $portfolioId, ref: $producerProjectId})
        MERGE (producer)-[:PRODUCES_INTEGRATION_POINT {portfolioId: $portfolioId, integrationPointId: $integrationPointId}]->(integrationPoint)
      `,
      {
        ...integrationPoint,
        recordedAt: normalizeRecordedAt(integrationPoint.recordedAt),
        evidenceRefs: integrationPoint.evidenceRefs ?? []
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
            evidenceRef.artifactRef = $artifactRef
      `,
      evidenceRef
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
            artifactRef.redactionStatus = $redactionStatus,
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
        redactionStatus: artifactRef.redactionStatus,
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
            record.payload = $payload,
            record.kind = 'intelligence_record'
      `,
      {
        ...record,
        payload: JSON.stringify(record)
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
            event.artifactRefs = $artifactRefs
      `,
      {
        ...event,
        contextAnchor: event.contextAnchor ? JSON.stringify(event.contextAnchor) : null
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
          name: program.name
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
        WHERE ${scopeWhere(scope, "project")}
        RETURN {
          portfolioId: project.portfolioId,
          programId: project.programId,
          projectId: project.projectId,
          name: project.name
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
        MATCH (producer:PmProject {portfolioId: $portfolioId, ref: integrationPoint.producerProjectId})
        WHERE integrationPoint.portfolioId = $portfolioId
          AND ($programId IS NULL OR producer.programId = $programId)
          AND (
            size($scopeProjectIds) = 0 OR
            integrationPoint.producerProjectId IN $scopeProjectIds OR
            any(projectId IN coalesce(integrationPoint.consumerProjectIds, []) WHERE projectId IN $scopeProjectIds)
          )
        RETURN {
          integrationPointId: integrationPoint.integrationPointId,
          portfolioId: integrationPoint.portfolioId,
          producerProjectId: integrationPoint.producerProjectId,
          consumerProjectIds: coalesce(integrationPoint.consumerProjectIds, []),
          purpose: integrationPoint.purpose,
          recordedAt: integrationPoint.recordedAt,
          evidenceRefs: coalesce(integrationPoint.evidenceRefs, [])
        } AS integrationPoint
        ORDER BY integrationPoint.integrationPointId, integrationPoint.recordedAt
      `,
      params,
      (record) => mapRecord<IntegrationPointRecord>(record, "integrationPoint")
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
          artifactRef: evidenceRef.artifactRef
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
          redactionStatus: artifactRef.redactionStatus,
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
        recordTypes: query.recordTypes ?? [],
        reviewStatuses: query.reviewStatuses ?? [],
        targetRefs: query.targetRefs ?? [],
        conditionTags: query.conditionTags ?? []
      },
      (record) => JSON.parse(mapRecord<string>(record, "payload")) as ProgramIntelligenceRecord
    );
    return typeof query.limit === "number" ? records.slice(0, query.limit) : records;
  }

  async listEvents(scope: RepositoryScope): Promise<ProgramEvent[]> {
    return runRead(
      this.driver,
      `
        MATCH (event:PmEvent)
        WHERE event.portfolioId = $portfolioId
        RETURN {
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
}
