import test from "node:test";
import assert from "node:assert/strict";

import {
  assessProgramImpactResultSchema,
  listProgramCapabilitiesResultSchema,
  planProgramActionResultSchema,
  queryProgramContextResultSchema
} from "../../../../shared/schemas/program-manager.ts";
import {
  ProgramManagerMcpGateway
} from "../src/mcp/program-manager-mcp-gateway.ts";
import { ProgramToolService } from "../src/service/program-tool-service.ts";

function buildActor() {
  return {
    actorId: "actor://operators/boundary-reader",
    actorRole: "human_operator",
    tenantId: "tenant://default",
    portfolioGrants: ["portfolio://default"],
    programGrants: ["program://agentic-os"],
    projectGrants: ["project://phalanx"],
    authnMethod: "oidc_jwt",
    authnIssuer: "issuer://control-plane",
    authenticatedAt: "2026-05-03T11:00:00Z",
    expiresAt: "2026-05-03T13:00:00Z"
  };
}

test("gateway does not expose arbitrary downstream tool names", async () => {
  const service = new ProgramToolService({
    repository: {
      async getProgramContext() {
        return { contextAnchor: undefined, matchedRefs: [], omittedRefCount: 0 };
      },
      async assessImpact() {
        return {
          affectedRefs: [],
          findings: [],
          requiredApprovals: [],
          evidenceObligations: []
        };
      },
      async listRelationships() {
        return [];
      },
      async listPrograms() {
        return [];
      },
      async listProjects() {
        return [];
      },
      async listEvidenceRefs() {
        return [];
      },
      async listArtifactRefs() {
        return [];
      },
      async listDecisions() {
        return [];
      },
      async listEvents() {
        return [];
      },
      async getSyncCursors() {
        return [];
      }
    },
    adapterRegistry: {
      async assertNoMutationAuthority() {},
      listManifests() {
        return [];
      },
      async listCapabilities() {
        return [];
      },
      async getHealth() {
        throw new Error("not reached");
      },
      async getSourceCursor() {
        throw new Error("not reached");
      },
      async readState() {
        throw new Error("not reached");
      },
      async assessImpact() {
        throw new Error("not reached");
      }
    }
  });
  const gateway = new ProgramManagerMcpGateway(service);

  await assert.rejects(
    () =>
      gateway.callTool(
        "proxy_downstream_action",
        {
          portfolioId: "portfolio://default",
          traceId: "trace://boundary",
          correlationId: "corr://boundary"
        },
        buildActor()
      ),
    /Unsupported PMO MCP tool/
  );
});

test("gateway only calls read-side PMO and adapter APIs for tool execution", async () => {
  const calls = [];
  let mutationCalled = false;
  const repository = {
    async listPrograms() {
      calls.push("repository.listPrograms");
      return [];
    },
    async listProjects() {
      calls.push("repository.listProjects");
      return [];
    },
    async getProgramContext() {
      calls.push("repository.getProgramContext");
      return {
        contextAnchor: {
          portfolioId: "portfolio://default",
          programId: "program://agentic-os",
          asOf: "2026-05-03T12:00:00Z"
        },
        matchedRefs: [
          {
            ref: "project://phalanx",
            kind: "project",
            status: "active",
            reason: "direct project match",
            recordedAt: "2026-05-03T12:00:00Z",
            evidenceRefs: []
          }
        ],
        omittedRefCount: 0
      };
    },
    async assessImpact() {
      calls.push("repository.assessImpact");
      return {
        affectedRefs: [
          {
            kind: "project",
            ref: "project://phalanx",
            reason: "reachable dependency"
          }
        ],
        findings: [],
        requiredApprovals: [],
        evidenceObligations: []
      };
    },
    async listRelationships() {
      calls.push("repository.listRelationships");
      return [];
    },
    async listEvidenceRefs() {
      calls.push("repository.listEvidenceRefs");
      return [];
    },
    async listArtifactRefs() {
      calls.push("repository.listArtifactRefs");
      return [];
    },
    async listDecisions() {
      calls.push("repository.listDecisions");
      return [];
    },
    async listEvents() {
      calls.push("repository.listEvents");
      return [];
    },
    async getSyncCursors() {
      calls.push("repository.getSyncCursors");
      return [
        {
          adapterId: "probe-local",
          portfolioId: "portfolio://default",
          cursor: "cursor:read-only",
          recordedAt: "2026-05-03T12:00:00Z"
        }
      ];
    }
  };
  const adapterRegistry = {
    async assertNoMutationAuthority() {
      calls.push("registry.assertNoMutationAuthority");
    },
    listManifests() {
      calls.push("registry.listManifests");
      return [
        {
          adapterId: "probe-local",
          adapterVersion: "1.0.0",
          capabilityDomains: [
            "code_context",
            "contract_context",
            "snapshot_context",
            "tracker_board"
          ],
          sideEffectPosture: "read_only",
          redactionPolicyRefs: ["policy://redaction/pointer-only-v1"]
        }
      ];
    },
    async listCapabilities() {
      calls.push("registry.listCapabilities");
      return [
        {
          capabilityId: "capability://program-manager/impact-analysis",
          phase: "1A",
          status: "available",
          domains: ["tracker_board"],
          toolNames: ["assess_program_impact", "query_program_context"],
          adapterIds: ["probe-local"],
          evidencePolicyRefs: ["policy://redaction/pointer-only-v1"],
          sideEffectPosture: "read_only"
        }
      ];
    },
    async getHealth() {
      calls.push("registry.getHealth");
      return {
        adapterId: "probe-local",
        status: "healthy",
        reasons: [],
        cursor: "cursor:read-only",
        observedAt: "2026-05-03T12:00:00Z",
        checkedAt: "2026-05-03T12:00:00Z",
        maxStaleCursorSeconds: 300
      };
    },
    async getSourceCursor() {
      calls.push("registry.getSourceCursor");
      return {
        adapterId: "probe-local",
        portfolioId: "portfolio://default",
        cursor: "cursor:read-only",
        observedAt: "2026-05-03T12:00:00Z",
        sourceRevisionHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        status: "current"
      };
    },
    async readState() {
      calls.push("registry.readState");
      return {
        adapterId: "probe-local",
        sourceCursor: "cursor:read-only",
        observedAt: "2026-05-03T12:00:00Z",
        observations: [],
        artifactRefs: [],
        evidenceRefs: [],
        truncated: false,
        omittedRefCount: 0,
        omittedRefs: [],
        redactionSummary: {
          redacted: false,
          omittedKinds: [],
          policyRefs: ["policy://redaction/pointer-only-v1"]
        }
      };
    },
    async assessImpact() {
      calls.push("registry.assessImpact");
      return {
        adapterId: "probe-local",
        status: "ok",
        sourceCursor: "cursor:read-only",
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
    },
    async reconcileState() {
      mutationCalled = true;
      throw new Error("reconcileState must not be called");
    },
    async mutateDownstream() {
      mutationCalled = true;
      throw new Error("mutation must not be called");
    }
  };
  const service = new ProgramToolService({
    repository,
    adapterRegistry,
    now: () => "2026-05-03T12:00:00Z"
  });
  const gateway = new ProgramManagerMcpGateway(service);
  const actor = buildActor();

  const capabilities = await gateway.callTool(
    "list_program_capabilities",
    {
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      traceId: "trace://capabilities",
      correlationId: "corr://capabilities"
    },
    actor
  );
  const context = await gateway.callTool(
    "query_program_context",
    {
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      queryKind: "program_summary",
      targetRefs: ["project://phalanx"],
      traceId: "trace://context",
      correlationId: "corr://context"
    },
    actor
  );
  const impact = await gateway.callTool(
    "assess_program_impact",
    {
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      changeRef: "change://program-manager-mcp/c0-hoplon-authz-contract-update",
      changeKind: "contract_update",
      targetRefs: ["project://phalanx"],
      traversalBudgetRef: "budget://phase-1a/default",
      traceId: "trace://impact",
      correlationId: "corr://impact"
    },
    actor
  );
  const plan = await gateway.callTool(
    "plan_program_action",
    {
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      traversalBudgetRef: "budget://phase-2/default",
      proposedChange: {
        changeType: "tracker_update",
        summary: "Propose a tracker update without executing it.",
        targetRefs: ["project://phalanx"]
      },
      requestedExternalActions: [
        {
          adapterId: "tracker",
          actionType: "propose_tracker_update",
          targetRef: "project://phalanx"
        }
      ],
      traceId: "trace://plan",
      correlationId: "corr://plan",
      contextAnchor: {
        portfolioId: "portfolio://default",
        programId: "program://agentic-os",
        asOf: "2026-05-03T12:00:00Z"
      }
    },
    actor
  );

  assert.deepEqual(listProgramCapabilitiesResultSchema.parse(capabilities), capabilities);
  assert.deepEqual(queryProgramContextResultSchema.parse(context), context);
  assert.deepEqual(assessProgramImpactResultSchema.parse(impact), impact);
  assert.deepEqual(planProgramActionResultSchema.parse(plan), plan);
  assert.equal(plan.deterministicCore.proposedExternalActions[0].status, "proposed");
  assert.equal(mutationCalled, false);
  assert.ok(calls.includes("registry.listCapabilities"));
  assert.ok(calls.includes("registry.readState"));
  assert.ok(calls.includes("registry.assessImpact"));
  assert.ok(calls.includes("repository.getProgramContext"));
  assert.ok(calls.includes("repository.assessImpact"));
});
