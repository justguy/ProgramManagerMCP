import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fixturePath = join(__dirname, "../../fixtures/golden-fixture-backbone.example.json");

const FIXTURE_CUTOFF = "2026-05-03T12:00:00Z";
const FIXTURE_VALID_FROM = "2026-05-03T00:00:00Z";

function readFixture() {
  const raw = readFileSync(fixturePath, "utf8");
  return JSON.parse(raw);
}

function sortLexicographically(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function sortedDependencyRefs(values) {
  return [...values].sort((left, right) => left.dependencyId.localeCompare(right.dependencyId));
}

function sortedAffectedRefs(values) {
  return [...values].sort((left, right) =>
    left.kind.localeCompare(right.kind) || left.ref.localeCompare(right.ref)
  );
}

function sortedFindings(values) {
  const severityRank = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3
  };

  return [...values].sort(
    (left, right) =>
      (severityRank[left.severity] ?? Number.MAX_SAFE_INTEGER) -
        (severityRank[right.severity] ?? Number.MAX_SAFE_INTEGER) ||
      left.findingId.localeCompare(right.findingId)
  );
}

export function getOrderedGoldenFixture() {
  const fixture = readFixture();
  return {
    ...fixture,
    G0: {
      ...fixture.G0,
      projects: [...fixture.G0.projects].sort((left, right) =>
        left.projectId.localeCompare(right.projectId)
      ),
      contracts: [...fixture.G0.contracts].sort((left, right) =>
        left.contractRef.localeCompare(right.contractRef)
      ),
      evidenceRefs: sortLexicographically(fixture.G0.evidenceRefs),
      integrationPoints: [...fixture.G0.integrationPoints].sort(
        (left, right) => left.integrationPointId.localeCompare(right.integrationPointId)
      ),
      dependencyRelationships: sortedDependencyRefs(fixture.G0.dependencyRelationships)
    },
    A0: {
      ...fixture.A0,
      affectedRefs: sortedAffectedRefs(fixture.A0.affectedRefs)
    },
    F0: {
      ...fixture.F0,
      findings: sortedFindings(fixture.F0.findings)
    }
  };
}

function projectNameFromId(projectId) {
  const names = {
    "project://program-manager-mcp": "Program Manager MCP",
    "project://guardrail": "Guardrail",
    "project://hoplon": "Hoplon",
    "project://phalanx": "Project Phalanx",
    "project://program-manager-mcp": "Program Manager MCP",
    "project://semantix": "Semantix"
  };

  return names[projectId] ?? projectId;
}

function inferEvidenceKind(evidenceRef) {
  if (evidenceRef.startsWith("artifact://")) {
    return "artifact";
  }
  if (evidenceRef.startsWith("tracker://")) {
    return "tracker_task";
  }
  if (evidenceRef.startsWith("evidence://")) {
    return "evidence";
  }
  return "decision";
}

function shaFromPointer(pointer) {
  const match = pointer.match(/@sha256:([a-f0-9]{64})$/);
  return match ? match[1] : "0000000000000000000000000000000000000000000000000000000000000000";
}

function normalizeEvidenceObligations(findings) {
  return findings
    .map((finding) => ({
      policyRef: `policy://evidence/${finding.type === "missing_evidence" ? "guardrail-runtime-current" : "tracker-snapshot-fast-expiry"}`,
      status:
        finding.type === "missing_evidence"
          ? "missing"
          : finding.type === "stale_evidence"
            ? "stale"
            : "satisfied",
      targetRef: finding.evidenceRefs[0] ?? "artifact://pmo/alignment-report/placeholder"
    }))
    .filter((item, index, list) => list.findIndex((entry) => entry.targetRef === item.targetRef) === index);
}

export function getBackboneRepositoryFixture() {
  const fixture = readFixture();
  const portfolioId = fixture.G0.portfolios[0]?.portfolioId ?? "portfolio://default";
  const programId = fixture.G0.programs[0]?.programId ?? "program://agentic-os";
  const canonicalProjectIds = sortLexicographically(fixture.G0.projects.map((item) => item.projectId));
  const integrationPoints = fixture.G0.integrationPoints.map((item) => ({
    portfolioId,
    producerProjectId: item.producerProjectId,
    integrationPointId: item.integrationPointId,
    consumerProjectIds: [...item.consumerProjectIds].sort((left, right) =>
      left.localeCompare(right)
    )
  }));
  const integrationPointByProducer = new Map(
    integrationPoints.map((item) => [item.producerProjectId, item.integrationPointId])
  );
  const artifacts = fixture.G0.evidenceRefs
    .filter((item) => item.startsWith("artifact://"))
    .map((artifactRef) => ({
      artifactRef,
      artifactType: "alignment_report_envelope",
      createdAt: FIXTURE_CUTOFF,
      contentHash: {
        algorithm: "sha256",
        value: shaFromPointer(artifactRef)
      },
      portfolioId,
      redactionStatus: "redacted",
      storageUri: artifactRef
    }))
    .sort((left, right) => left.artifactRef.localeCompare(right.artifactRef));

  const evidenceRefs = fixture.G0.evidenceRefs
    .map((ref) => ({
      evidenceRef: ref,
      portfolioId,
      kind: inferEvidenceKind(ref),
      recordedAt: FIXTURE_CUTOFF,
      artifactRef: ref.startsWith("artifact://") ? ref : undefined
    }))
    .sort((left, right) => left.evidenceRef.localeCompare(right.evidenceRef));

  const relationships = fixture.G0.dependencyRelationships.map((relationship) => ({
    dependencyId: relationship.dependencyId,
    portfolioId,
    programId,
    fromRef: relationship.fromRef,
    toRef: relationship.toRef,
    dependencyType: relationship.dependencyType,
    criticality: relationship.criticality,
    status: relationship.status,
    recordedAt: FIXTURE_CUTOFF,
    validFrom: FIXTURE_VALID_FROM,
    evidenceRefs: [],
    sourceAdapterId: "fixture-loader",
    sourceCursor: "snapshot:v1"
  }));

  const programs = fixture.G0.programs.map((program) => ({
    portfolioId: program.portfolioId,
    programId: program.programId,
    name: "Agentic OS"
  }));

  const projects = canonicalProjectIds.map((projectId) => ({
    portfolioId,
    programId,
    projectId,
    name: projectNameFromId(projectId)
  }));

  const decisions = fixture.G0.decisionRefs.map((decisionRef, index) => ({
    decisionId: decisionRef,
    portfolioId,
    programId,
    summary: `Decision ${index + 1} for ${decisionRef}`,
    status: "applicable",
    recordedAt: FIXTURE_CUTOFF,
    validFrom: FIXTURE_VALID_FROM,
    evidenceRefs: evidenceRefs
      .filter((item) => item.kind === "artifact")
      .map((item) => item.evidenceRef)
  }));

  return {
    programs,
    projects,
    integrationPoints,
    contracts: fixture.G0.contracts.map((contract) => ({
      contractRef: contract.contractRef,
      portfolioId,
      integrationPointId:
        integrationPointByProducer.get(contract.producerProjectId) ??
        `integration://unknown/${contract.producerProjectId}`,
      producerProjectId: contract.producerProjectId
    })),
    relationships,
    evidenceRefs,
    artifactRefs: artifacts,
    decisions,
    events: [],
    syncCursors: [
      {
        adapterId: "guardrail-local",
        portfolioId,
        cursor: "cursor://guardrail/runtime-controls/missing",
        recordedAt: FIXTURE_CUTOFF
      },
      {
        adapterId: "hoplon-local",
        portfolioId,
        cursor: "snapshot:s-2026-05-03",
        recordedAt: FIXTURE_CUTOFF
      },
      {
        adapterId: "tracker-local",
        portfolioId,
        cursor: "rev:12",
        recordedAt: FIXTURE_CUTOFF
      }
    ].sort((left, right) => left.adapterId.localeCompare(right.adapterId)),
    contextAnchor: {
      asOf: FIXTURE_CUTOFF,
      portfolioId,
      programId
    },
    contextMatches: [
      ...fixture.A0.affectedRefs.map((item) => ({
        ref: item.ref,
        kind: item.kind,
        status: "active",
        reason: `${item.kind} ${item.ref} impacted by ${fixture.C0.changeId}`,
        validFrom: FIXTURE_VALID_FROM,
        recordedAt: FIXTURE_CUTOFF,
        evidenceRefs: fixture.G0.evidenceRefs
      }))
    ],
    impact: {
      affectedRefs: fixture.A0.affectedRefs.map((item) => ({
        kind: item.kind,
        ref: item.ref,
        reason: `${item.kind} ${item.ref} impacted by ${fixture.C0.changeId}`
      })),
      findings: fixture.F0.findings.map((finding) => ({
        findingId: finding.findingId,
        severity: finding.severity,
        type: finding.type,
        evidenceRefs: finding.evidenceRefs,
        summary: `${finding.type.replace(/_/g, " ")} detected from ${fixture.C0.changeId}`
      })),
      requiredApprovals: [
        {
          authorityRef: "authority://portfolio/default/tier1-operator",
          reason: "Hoplon authz contract change requires policy-backed approval context.",
          evidencePolicyRefs: ["policy://active-adapters/hoplon-authz-tier1"]
        }
      ],
      evidenceObligations: normalizeEvidenceObligations(fixture.F0.findings)
    }
  };
}

export function getGoldenFixture() {
  return readFixture();
}
