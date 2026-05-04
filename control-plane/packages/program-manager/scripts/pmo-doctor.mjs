import assert from "node:assert/strict";

import {
  adapterContractFixturesDocumentSchema,
  adapterManifestSchema,
  assessProgramImpactResultSchema,
  generateProgramUpdateResultSchema,
  goldenFixtureBackboneSchema,
  listProgramCapabilitiesResultSchema,
  phase1aToolExamplesSchema,
  queryProgramContextResultSchema,
  schemaExamplesDocumentSchema,
  toolContractsDocumentSchema
} from "../../../../shared/schemas/program-manager.ts";
import {
  canonicalizeForStateVersionHash,
  collectNondeterministicHashKeys,
  stateVersionHashFromInput
} from "../src/hash/state-version-hash.js";
import { sanitizePointerPayload } from "../src/redaction/program-tool-redaction.ts";
import { ProgramToolService } from "../src/service/program-tool-service.ts";
import { ProgramManagerMcpGateway } from "../src/mcp/program-manager-mcp-gateway.ts";
import { getGoldenFixture } from "../src/fixtures/golden-fixture-backbone.js";

import {
  DEFAULT_NOW,
  buildActor,
  buildGateway,
  loadFixtureJSON,
  runChecks
} from "./pmo-check-common.mjs";

function asSortedSet(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function assertDisjointSet(left, right) {
  for (const value of left) {
    assert.ok(right.has(value), `missing required value: ${value}`);
  }
}

async function checkSchemaArtifacts() {
  const goldenFixture = await loadFixtureJSON("../../../../docs/phase-0/fixtures/golden-fixture-backbone.example.json");
  const adapterFixtures = await loadFixtureJSON("../../../../docs/phase-0/fixtures/adapter-contract-fixtures.example.json");
  const toolContracts = await loadFixtureJSON("../../../../docs/phase-0/fixtures/tool-contracts.example.json");
  const schemaExamples = await loadFixtureJSON("../../../../docs/phase-0/fixtures/schema-examples.example.json");

  goldenFixtureBackboneSchema.parse(goldenFixture);
  adapterContractFixturesDocumentSchema.parse(adapterFixtures);
  toolContractsDocumentSchema.parse(toolContracts);
  schemaExamplesDocumentSchema.parse(schemaExamples);
  phase1aToolExamplesSchema.parse(toolContracts.phase1aToolExamples);

  assert.equal(
    goldenFixture.H0.hashInputRef,
    "docs/phase-0/fixtures/state-version-hash-input.example.json"
  );
}

async function checkRegistryCore() {
  const { registry } = buildGateway();
  const manifests = registry.listManifests();

  assert.equal(manifests.length, 2, "expect two Phase 1A stubs");
  const manifestIds = manifests.map((manifest) => manifest.adapterId).sort();
  assert.deepEqual(manifestIds, ["hoplon-local", "tracker-local"]);

  const hoplon = manifests.find((manifest) => manifest.adapterId === "hoplon-local");
  const tracker = manifests.find((manifest) => manifest.adapterId === "tracker-local");

  assert.ok(hoplon);
  assert.ok(tracker);

  for (const manifest of [hoplon, tracker]) {
    adapterManifestSchema.parse(manifest);
    assert.equal(manifest.phase1aEnabled, true);
    assert.equal(manifest.methods.reconcileState, false);
    assert.equal(manifest.methods.readState, true);
    assert.equal(manifest.methods.getHealth, true);
    assert.ok(manifest.healthModel.statuses.includes("healthy"));
  }

  await registry.assertNoMutationAuthority();
}

async function checkGraphInvariants() {
  const golden = getGoldenFixture();
  const { repository } = buildGateway();
  const scope = {
    portfolioId: "portfolio://default",
    programId: golden.G0.programs[0].programId
  };

  const programs = await repository.listPrograms(scope);
  const projects = await repository.listProjects(scope);
  const relationships = await repository.listRelationships(scope);
  const decisions = await repository.listDecisions({ scope, statuses: ["applicable"] });
  const impact = await repository.assessImpact({
    scope,
    changeRef: golden.C0.changeId,
    changeKind: golden.C0.changeKind,
    targetRefs: golden.C0.targetRefs,
    traversalBudgetRef: "snapshot:v1"
  });

  assert.equal(programs.length, golden.G0.programs.length);
  assert.equal(asSortedSet(projects.map((entry) => entry.projectId)).length, asSortedSet(golden.G0.projects.map((entry) => entry.projectId)).length);
  assert.equal(decisions.length, golden.G0.decisionRefs.length);
  assert.equal(relationships.length, golden.G0.dependencyRelationships.length);
  assert.ok(relationships.length > 0, "fixture graph has dependency relationships");

  const expectedAffected = new Set(golden.A0.affectedRefs.map((item) => `${item.kind}:${item.ref}`));
  assertDisjointSet(
    [...new Set(impact.affectedRefs.map((item) => `${item.kind}:${item.ref}`))],
    expectedAffected
  );

  const expectedFindings = new Set(golden.F0.findings.map((finding) => finding.findingId));
  assertDisjointSet(
    new Set(impact.findings.map((finding) => finding.findingId)),
    expectedFindings
  );
}

async function checkHashInvariants() {
  const hashFixture = await loadFixtureJSON("../../../../docs/phase-0/fixtures/state-version-hash-input.example.json");
  const golden = getGoldenFixture();

  const expectedHash = golden.H0.expectedStateVersionHash;
  const canonicalHash = stateVersionHashFromInput(hashFixture.input);

  assert.equal(canonicalHash, expectedHash, "golden fixture hash should be stable");
  assert.equal(canonicalHash, stateVersionHashFromInput(canonicalizeForStateVersionHash(hashFixture.input)));
  assert.deepEqual(collectNondeterministicHashKeys(hashFixture.input), []);
}

async function checkRedactionInvariants() {
  const sanitized = sanitizePointerPayload({
    artifactRef: "artifact://test/redaction",
    body: "inline detail must be removed",
    secret: "do-not-export",
    logs: ["forbidden"],
    transcript: "forbidden transcript"
  });

  assert.equal(sanitized.redactionSummary.redacted, true);
  assert.ok(sanitized.redactionSummary.policyRefs.includes("policy://redaction/pointer-only-v1"));
  assert.ok(sanitized.redactionSummary.omittedKinds.includes("content_body"));
  assert.ok(sanitized.redactionSummary.omittedKinds.includes("secrets"));
  assert.ok(sanitized.redactionSummary.omittedKinds.includes("logs"));
  assert.ok(sanitized.redactionSummary.omittedKinds.includes("provider_transcripts"));

  const repository = {
    async getProgramContext() {
      return {
        contextAnchor: {
          portfolioId: "portfolio://default",
          programId: "program://agentic-os",
          asOf: DEFAULT_NOW
        },
      matchedRefs: [
        {
          kind: "tracker_task",
          ref: "tracker://program-manager-mcp/PMO-001",
          status: "stale",
          reason: "redaction test observation",
          logs: ["forbidden"],
          body: "forbidden inline payload",
          transcript: "forbidden transcript",
          recordedAt: DEFAULT_NOW,
          evidenceRefs: ["tracker://program-manager-mcp/PMO-001"]
        }
      ],
      omittedRefCount: 0
      };
    },
    async assessImpact() {
      return {
        affectedRefs: [],
        findings: [],
        requiredApprovals: [],
        evidenceObligations: []
      };
    },
    async listPrograms() {
      return [
        {
          portfolioId: "portfolio://default",
          programId: "program://agentic-os"
        }
      ];
    },
    async listProjects() {
      return [
        {
          portfolioId: "portfolio://default",
          projectId: "project://program-manager-mcp"
        }
      ];
    },
    async listEvidenceRefs() {
      return [
        {
          evidenceRef: "tracker://program-manager-mcp/PMO-001",
          portfolioId: "portfolio://default",
          classification: "internal",
          contentHash: {
            algorithm: "sha256",
            value: "b16e0c2d4f9224b939f223b60abf233c6ca766ebf22e13f5949b5fc706da3d79"
          },
          evidenceType: "tracker_task_ref",
          redactionStatus: "redacted",
          verificationMethod: "content_digest"
        }
      ];
    },
    async listArtifactRefs() {
      return [
        {
          artifactRef: "artifact://pmo/alignment-report/2026-05-03@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          artifactType: "alignment_report_envelope",
          classification: "internal",
          contentHash: {
            algorithm: "sha256",
            value: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
          },
          createdAt: "2026-05-03T12:00:00Z",
          portfolioId: "portfolio://default",
          redactionStatus: "redacted",
          retentionPolicyRef: "policy://retention/pmo-artifact-metadata-v1",
          storageUri: "artifact://pmo/alignment-report/2026-05-03@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        }
      ];
    },
    async listDecisions() {
      return [];
    },
    async listRelationships() {
      return [];
    },
    async listEvents() {
      return [];
    },
    async getSyncCursors() {
      return [];
    }
  };

  const adapterRegistry = {
    async assertNoMutationAuthority() {},
    listManifests() {
      return [
        {
          adapterId: "probe-redaction",
          adapterVersion: "1.0.0",
          authScopes: ["portfolio:default:read"],
          capabilityDomains: ["tracker_board"],
          redactionPolicyRefs: ["policy://redaction/pointer-only-v1"]
        }
      ];
    },
    async listCapabilities() {
      return [];
    },
    async getHealth() {
      return {
        adapterId: "probe-redaction",
        status: "healthy",
        reasons: [],
        cursor: "cursor://probe-redaction",
        observedAt: DEFAULT_NOW,
        checkedAt: DEFAULT_NOW,
        maxStaleCursorSeconds: 300
      };
    },
    async getSourceCursor() {
      return {
        adapterId: "probe-redaction",
        portfolioId: "portfolio://default",
        cursor: "cursor://probe-redaction",
        observedAt: DEFAULT_NOW,
        sourceRevisionHash: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
        status: "current"
      };
    },
    async readState() {
      return {
        adapterId: "probe-redaction",
        sourceCursor: "cursor://probe-redaction",
        observedAt: DEFAULT_NOW,
        observations: [
          {
            kind: "tracker_task",
            ref: "tracker://program-manager-mcp/PMO-001",
            reason: "contains inline evidence",
            status: "stale",
            logs: ["forbidden"],
            artifactBody: "inline",
            evidenceRefs: ["tracker://program-manager-mcp/PMO-001"],
            redactionSummary: {
              redacted: true,
              omittedKinds: ["content_body", "logs"],
              policyRefs: ["policy://redaction/pointer-only-v1"]
            }
          }
        ],
        artifactRefs: ["artifact://pmo/alignment-report/2026-05-03@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
        evidenceRefs: ["tracker://program-manager-mcp/PMO-001"],
        truncated: false,
        omittedRefCount: 0,
        omittedRefs: [],
        redactionSummary: {
          redacted: true,
          omittedKinds: ["content_body", "logs"],
          policyRefs: ["policy://redaction/pointer-only-v1"]
        }
      };
    },
    async assessImpact() {
      return {
        adapterId: "probe-redaction",
        status: "ok",
        sourceCursor: "cursor://probe-redaction",
        affectedRefs: [],
        findings: [],
        evidenceRefs: [],
        artifactRefs: [],
        redactionSummary: {
          redacted: true,
          omittedKinds: ["content_body"],
          policyRefs: ["policy://redaction/pointer-only-v1"]
        },
        requestId: "probe-redaction-request"
      };
    }
  };

  const service = new ProgramToolService({
    repository,
    adapterRegistry,
    now: () => DEFAULT_NOW
  });
  const gateway = new ProgramManagerMcpGateway(service);

  const result = await gateway.callTool(
    "query_program_context",
    {
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      queryKind: "program_summary",
      targetRefs: ["tracker://program-manager-mcp/PMO-001"],
      traceId: "trace://pmo-doctor-redaction",
      correlationId: "corr://pmo-doctor-redaction"
    },
    buildActor()
  );

  queryProgramContextResultSchema.parse(result);
  assert.equal(result.redactionSummary.redacted, true);
  assert.ok(result.redactionSummary.omittedKinds.includes("content_body"));
  assert.equal("logs" in result.deterministicCore.matchedRefs[0], false);
}

async function checkFixtureAndSmoke() {
  const fixture = await loadFixtureJSON("../fixtures/pmo-doctor-fixture.example.json");
  const golden = getGoldenFixture();
  const { gateway } = buildGateway();
  const actor = buildActor();

  const listResult = await gateway.callTool(
    "list_program_capabilities",
    {
      portfolioId: fixture.requestContext.portfolioId,
      programId: fixture.requestContext.programId,
      traceId: "trace://doctor-list",
      correlationId: "corr://doctor-list"
    },
    actor
  );
  listProgramCapabilitiesResultSchema.parse(listResult);
  assert.ok(listResult.toolName, "list_program_capabilities");

  const queryResult = await gateway.callTool(
    "query_program_context",
    {
      portfolioId: fixture.requestContext.portfolioId,
      programId: fixture.requestContext.programId,
      queryKind: fixture.replay.query.queryKind,
      targetRefs: fixture.replay.query.targetRefs,
      traceId: "trace://doctor-query",
      correlationId: "corr://doctor-query"
    },
    actor
  );
  queryProgramContextResultSchema.parse(queryResult);

  const impactResult = await gateway.callTool(
    "assess_program_impact",
    {
      portfolioId: fixture.requestContext.portfolioId,
      programId: fixture.requestContext.programId,
      changeRef: fixture.replay.impact.changeRef,
      changeKind: fixture.replay.impact.changeKind,
      targetRefs: fixture.replay.impact.targetRefs,
      traversalBudgetRef: fixture.replay.impact.traversalBudgetRef,
      traceId: "trace://doctor-impact",
      correlationId: "corr://doctor-impact"
    },
    actor
  );
  assessProgramImpactResultSchema.parse(impactResult);

  const generateResult = await gateway.callTool(
    "generate_program_update",
    {
      portfolioId: fixture.requestContext.portfolioId,
      programId: fixture.requestContext.programId,
      reportAudience: fixture.requestContext.reportAudience,
      contextAnchor: fixture.requestContext.contextAnchor,
      traceId: "trace://doctor-generate",
      correlationId: "corr://doctor-generate"
    },
    actor
  );
  generateProgramUpdateResultSchema.parse(generateResult);

  assert.equal(generateResult.stateVersionHash, fixture.report.stateVersionHash);
  assert.equal(generateResult.deterministicCore.sectionRefs.length, fixture.report.sectionIds.length);
  assert.ok(golden.G0.evidenceRefs.includes(fixture.report.evidenceRefs[0]));
  assert.ok(golden.G0.decisionRefs.includes("decision://agentic-os/hoplon-authz-tier1-approval"));
}

const checks = [
  ["schema fixtures", checkSchemaArtifacts],
  ["registry core invariants", checkRegistryCore],
  ["graph invariants", checkGraphInvariants],
  ["hash invariants", checkHashInvariants],
  ["redaction invariants", checkRedactionInvariants],
  ["fixture + report smoke", checkFixtureAndSmoke]
];

const outcome = await runChecks(checks);
if (outcome.failed > 0) {
  process.exitCode = 1;
}
