CREATE INDEX pm_program_lookup IF NOT EXISTS
FOR (program:PmProgram)
ON (program.portfolioId, program.programId);

CREATE INDEX pm_project_lookup IF NOT EXISTS
FOR (project:PmProject)
ON (project.portfolioId, project.programId, project.projectId);

CREATE INDEX pm_integration_point_lookup IF NOT EXISTS
FOR (integrationPoint:PmIntegrationPoint)
ON (integrationPoint.portfolioId, integrationPoint.integrationPointId);

CREATE INDEX pm_contract_lookup IF NOT EXISTS
FOR (contract:PmContract)
ON (contract.portfolioId, contract.contractRef);

CREATE INDEX pm_evidence_lookup IF NOT EXISTS
FOR (evidenceRef:PmEvidence)
ON (evidenceRef.portfolioId, evidenceRef.evidenceRef);

CREATE INDEX pm_artifact_lookup IF NOT EXISTS
FOR (artifactRef:PmArtifact)
ON (artifactRef.portfolioId, artifactRef.artifactRef);

CREATE INDEX pm_decision_lookup IF NOT EXISTS
FOR (decision:PmDecision)
ON (decision.portfolioId, decision.decisionId, decision.recordedAt);

CREATE INDEX pm_sync_cursor_lookup IF NOT EXISTS
FOR (cursor:PmSyncCursor)
ON (cursor.portfolioId, cursor.adapterId, cursor.recordedAt);

CREATE INDEX pm_event_lookup IF NOT EXISTS
FOR (event:PmEvent)
ON (event.portfolioId, event.eventId, event.recordedAt);

CREATE INDEX pm_depends_on_dependency_id IF NOT EXISTS
FOR ()-[dependency:DEPENDS_ON]-()
ON (dependency.dependencyId);

CREATE INDEX pm_requires_approval_dependency_id IF NOT EXISTS
FOR ()-[dependency:REQUIRES_APPROVAL]-()
ON (dependency.dependencyId);

CREATE INDEX pm_requires_evidence_dependency_id IF NOT EXISTS
FOR ()-[dependency:REQUIRES_EVIDENCE]-()
ON (dependency.dependencyId);

CREATE INDEX pm_blocks_dependency_id IF NOT EXISTS
FOR ()-[dependency:BLOCKS]-()
ON (dependency.dependencyId);

CREATE INDEX pm_affects_dependency_id IF NOT EXISTS
FOR ()-[dependency:AFFECTS]-()
ON (dependency.dependencyId);

CREATE INDEX pm_supersedes_dependency_id IF NOT EXISTS
FOR ()-[dependency:SUPERSEDES]-()
ON (dependency.dependencyId);

CREATE INDEX pm_has_receipt_dependency_id IF NOT EXISTS
FOR ()-[dependency:HAS_RECEIPT]-()
ON (dependency.dependencyId);

CREATE INDEX pm_consumes_contract_dependency_id IF NOT EXISTS
FOR ()-[dependency:CONSUMES_CONTRACT]-()
ON (dependency.dependencyId);

CREATE INDEX pm_produces_contract_dependency_id IF NOT EXISTS
FOR ()-[dependency:PRODUCES_CONTRACT]-()
ON (dependency.dependencyId);
