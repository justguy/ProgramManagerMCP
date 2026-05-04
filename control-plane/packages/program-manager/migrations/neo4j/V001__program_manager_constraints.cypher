CREATE CONSTRAINT pm_program_ref IF NOT EXISTS
FOR (program:PmProgram)
REQUIRE (program.portfolioId, program.ref) IS UNIQUE;

CREATE CONSTRAINT pm_project_ref IF NOT EXISTS
FOR (project:PmProject)
REQUIRE (project.portfolioId, project.ref) IS UNIQUE;

CREATE CONSTRAINT pm_integration_point_ref IF NOT EXISTS
FOR (integrationPoint:PmIntegrationPoint)
REQUIRE (integrationPoint.portfolioId, integrationPoint.ref) IS UNIQUE;

CREATE CONSTRAINT pm_contract_ref IF NOT EXISTS
FOR (contract:PmContract)
REQUIRE (contract.portfolioId, contract.ref) IS UNIQUE;

CREATE CONSTRAINT pm_evidence_ref IF NOT EXISTS
FOR (evidenceRef:PmEvidence)
REQUIRE (evidenceRef.portfolioId, evidenceRef.ref) IS UNIQUE;

CREATE CONSTRAINT pm_artifact_ref IF NOT EXISTS
FOR (artifactRef:PmArtifact)
REQUIRE (artifactRef.portfolioId, artifactRef.ref) IS UNIQUE;

CREATE CONSTRAINT pm_decision_ref IF NOT EXISTS
FOR (decision:PmDecision)
REQUIRE (decision.portfolioId, decision.ref) IS UNIQUE;

CREATE CONSTRAINT pm_sync_cursor_ref IF NOT EXISTS
FOR (cursor:PmSyncCursor)
REQUIRE (cursor.portfolioId, cursor.adapterId) IS UNIQUE;

CREATE CONSTRAINT pm_event_ref IF NOT EXISTS
FOR (event:PmEvent)
REQUIRE (event.portfolioId, event.eventId) IS UNIQUE;

CREATE CONSTRAINT pm_generic_ref IF NOT EXISTS
FOR (refNode:PmRef)
REQUIRE (refNode.portfolioId, refNode.ref) IS UNIQUE;
