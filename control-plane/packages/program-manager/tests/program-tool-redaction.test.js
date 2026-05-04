import test from "node:test";
import assert from "node:assert/strict";

import { queryProgramContextResultSchema } from "../../../../shared/schemas/program-manager.ts";
import { ProgramManagerMcpGateway } from "../src/mcp/program-manager-mcp-gateway.ts";
import { sanitizePointerPayload } from "../src/redaction/program-tool-redaction.ts";
import { ProgramToolService } from "../src/service/program-tool-service.ts";

function buildActor() {
  return {
    actorId: "actor://operators/redaction-reader",
    actorRole: "human_operator",
    tenantId: "tenant://default",
    portfolioGrants: ["portfolio://default"],
    programGrants: ["program://agentic-os"],
    projectGrants: ["project://program-manager-mcp"],
    authnMethod: "oidc_jwt",
    authnIssuer: "issuer://control-plane",
    authenticatedAt: "2026-05-03T11:00:00Z",
    expiresAt: "2026-05-03T13:00:00Z"
  };
}

test("sanitizePointerPayload omits prohibited inline payloads while keeping pointer refs", () => {
  const sanitized = sanitizePointerPayload({
    artifactRef: "artifact://docs/redaction-proof",
    contentHash: {
      algorithm: "sha256",
      value: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    },
    body: "inline document body must not survive",
    secrets: {
      token: "hidden"
    },
    logs: ["line 1", "line 2"]
  });

  assert.deepEqual(sanitized.value, {
    artifactRef: "artifact://docs/redaction-proof",
    contentHash: {
      algorithm: "sha256",
      value: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    }
  });
  assert.equal(sanitized.redactionSummary.redacted, true);
  assert.deepEqual(sanitized.redactionSummary.omittedKinds, [
    "content_body",
    "logs",
    "secrets"
  ]);
});

test("query_program_context merges adapter redaction summaries and omits prohibited observation payloads", async () => {
  const repository = {
    async getProgramContext() {
      return {
        contextAnchor: {
          portfolioId: "portfolio://default",
          programId: "program://agentic-os",
          asOf: "2026-05-03T12:00:00Z"
        },
        matchedRefs: [],
        omittedRefCount: 0
      };
    },
    async listEvidenceRefs() {
      return [];
    },
    async listArtifactRefs() {
      return [];
    },
    async getSyncCursors() {
      return [
        {
          adapterId: "probe-local",
          portfolioId: "portfolio://default",
          cursor: "cursor:redaction",
          recordedAt: "2026-05-03T12:00:00Z"
        }
      ];
    },
    async assessImpact() {
      return {
        affectedRefs: [],
        findings: [],
        requiredApprovals: [],
        evidenceObligations: []
      };
    }
  };
  const adapterRegistry = {
    async assertNoMutationAuthority() {},
    listManifests() {
      return [
        {
          adapterId: "probe-local",
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
        adapterId: "probe-local",
        status: "healthy",
        reasons: [],
        cursor: "cursor:redaction",
        observedAt: "2026-05-03T12:00:00Z",
        checkedAt: "2026-05-03T12:00:00Z",
        maxStaleCursorSeconds: 300
      };
    },
    async getSourceCursor() {
      return {
        adapterId: "probe-local",
        portfolioId: "portfolio://default",
        cursor: "cursor:redaction",
        observedAt: "2026-05-03T12:00:00Z",
        sourceRevisionHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        status: "current"
      };
    },
    async readState() {
      return {
        adapterId: "probe-local",
        sourceCursor: "cursor:redaction",
        observedAt: "2026-05-03T12:00:00Z",
        observations: [
          {
            kind: "tracker_task",
            ref: "tracker://program-manager-mcp/PMO-001",
            reason: "direct match",
            status: "stale",
            evidenceRefs: ["tracker://program-manager-mcp/PMO-001"],
            logs: ["forbidden inline log"]
          }
        ],
        artifactRefs: [],
        evidenceRefs: ["tracker://program-manager-mcp/PMO-001"],
        truncated: false,
        omittedRefCount: 0,
        omittedRefs: [],
        redactionSummary: {
          redacted: true,
          omittedKinds: ["logs"],
          policyRefs: ["policy://redaction/pointer-only-v1"]
        }
      };
    },
    async assessImpact() {
      return {
        adapterId: "probe-local",
        status: "ok",
        sourceCursor: "cursor:redaction",
        affectedRefs: [],
        findings: [],
        evidenceRefs: [],
        artifactRefs: [],
        redactionSummary: {
          redacted: false,
          omittedKinds: [],
          policyRefs: ["policy://redaction/pointer-only-v1"]
        },
        requestId: "impact"
      };
    }
  };
  const service = new ProgramToolService({
    repository,
    adapterRegistry,
    now: () => "2026-05-03T12:00:00Z"
  });
  const gateway = new ProgramManagerMcpGateway(service);

  const result = await gateway.callTool(
    "query_program_context",
    {
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      queryKind: "evidence_status",
      targetRefs: ["tracker://program-manager-mcp/PMO-001"],
      traceId: "trace://redaction",
      correlationId: "corr://redaction"
    },
    buildActor()
  );

  assert.deepEqual(queryProgramContextResultSchema.parse(result), result);
  assert.equal(result.redactionSummary.redacted, true);
  assert.ok(result.redactionSummary.omittedKinds.includes("logs"));
  assert.equal("logs" in result.deterministicCore.matchedRefs[0], false);
});
