import test from "node:test";
import assert from "node:assert/strict";

import { loadGraphModules } from "./load-graph-modules.js";

test("ProgramManagerGraphRepository persists and reads graph entities with deterministic ordering", async () => {
  const { repositoryModule, storeModule } = await loadGraphModules();
  const { ProgramManagerGraphRepository } = repositoryModule;
  const { InMemoryProgramManagerGraphStore } = storeModule;

  const repository = new ProgramManagerGraphRepository(new InMemoryProgramManagerGraphStore());

  await repository.seed({
    programs: [
      {
        portfolioId: "portfolio://default",
        programId: "program://control-plane",
        name: "Control Plane"
      }
    ],
    projects: [
      {
        portfolioId: "portfolio://default",
        programId: "program://control-plane",
        projectId: "project://semantix",
        name: "Semantix"
      },
      {
        portfolioId: "portfolio://default",
        programId: "program://control-plane",
        projectId: "project://phalanx",
        name: "Phalanx"
      },
      {
        portfolioId: "portfolio://default",
        programId: "program://control-plane",
        projectId: "project://hoplon",
        name: "Hoplon"
      },
      {
        portfolioId: "portfolio://default",
        programId: "program://control-plane",
        projectId: "project://guardrail",
        name: "Guardrail"
      }
    ],
    memberships: [
      {
        portfolioId: "portfolio://default",
        programId: "program://control-plane",
        projectId: "project://phalanx",
        recordedAt: "2026-05-03T12:00:00Z"
      },
      {
        portfolioId: "portfolio://default",
        programId: "program://control-plane",
        projectId: "project://hoplon",
        recordedAt: "2026-05-03T12:00:00Z"
      },
      {
        portfolioId: "portfolio://default",
        programId: "program://control-plane",
        projectId: "project://guardrail",
        recordedAt: "2026-05-03T12:00:00Z"
      },
      {
        portfolioId: "portfolio://default",
        programId: "program://control-plane",
        projectId: "project://semantix",
        recordedAt: "2026-05-03T12:00:00Z"
      }
    ],
    integrationPoints: [
      {
        portfolioId: "portfolio://default",
        integrationPointId: "integration://hoplon/authz-gateway",
        producerProjectId: "project://hoplon",
        consumerProjectIds: ["project://phalanx", "project://semantix"],
        purpose: "Authorization checks",
        recordedAt: "2026-05-03T12:01:00Z",
        evidenceRefs: ["evidence://hoplon/authz/current"]
      },
      {
        portfolioId: "portfolio://default",
        integrationPointId: "integration://guardrail/runtime-controls",
        producerProjectId: "project://guardrail",
        consumerProjectIds: ["project://phalanx"],
        purpose: "Runtime controls",
        recordedAt: "2026-05-03T12:01:30Z",
        evidenceRefs: ["evidence://guardrail/runtime/current"]
      }
    ],
    contracts: [
      {
        portfolioId: "portfolio://default",
        contractRef: "contract://hoplon/authz@sha256:cccc",
        integrationPointId: "integration://hoplon/authz-gateway",
        producerProjectId: "project://hoplon",
        recordedAt: "2026-05-03T12:02:00Z",
        evidenceRefs: ["evidence://hoplon/authz/current"]
      }
    ],
    relationships: [
      {
        dependencyId: "dep-phalanx-hoplon-authz",
        portfolioId: "portfolio://default",
        programId: "program://control-plane",
        projectId: "project://phalanx",
        fromRef: "project://phalanx",
        toRef: "contract://hoplon/authz@sha256:cccc",
        dependencyType: "REQUIRES_APPROVAL",
        criticality: "tier_1",
        status: "blocked",
        recordedAt: "2026-05-03T12:03:00Z",
        validFrom: "2026-05-03T12:00:00Z",
        evidenceRefs: ["evidence://hoplon/authz/current"],
        sourceAdapterId: "hoplon-local",
        sourceCursor: "snapshot:s-2026-05-03"
      },
      {
        dependencyId: "dep-phalanx-guardrail-runtime",
        portfolioId: "portfolio://default",
        programId: "program://control-plane",
        projectId: "project://phalanx",
        fromRef: "project://phalanx",
        toRef: "integration://guardrail/runtime-controls",
        dependencyType: "REQUIRES_EVIDENCE",
        criticality: "tier_1",
        status: "stale",
        recordedAt: "2026-05-03T12:04:00Z",
        validFrom: "2026-05-03T12:00:00Z",
        evidenceRefs: ["evidence://guardrail/runtime/current"],
        sourceAdapterId: "guardrail-local",
        sourceCursor: "cursor://guardrail/runtime"
      },
      {
        dependencyId: "dep-hoplon-semantix",
        portfolioId: "portfolio://default",
        programId: "program://control-plane",
        projectId: "project://hoplon",
        fromRef: "contract://hoplon/authz@sha256:cccc",
        toRef: "project://semantix",
        dependencyType: "AFFECTS",
        criticality: "tier_2",
        status: "active",
        recordedAt: "2026-05-03T12:05:00Z",
        validFrom: "2026-05-03T12:00:00Z",
        evidenceRefs: [],
        sourceAdapterId: "repo-local",
        sourceCursor: "cursor://graph/1"
      }
    ],
    evidenceRefs: [
      {
        evidenceRef: "evidence://guardrail/runtime/current",
        portfolioId: "portfolio://default",
        kind: "runtime_snapshot",
        recordedAt: "2026-05-03T12:04:00Z",
        artifactRef: "artifact://guardrail/runtime/current"
      },
      {
        evidenceRef: "evidence://hoplon/authz/current",
        portfolioId: "portfolio://default",
        kind: "contract_snapshot",
        recordedAt: "2026-05-03T12:03:00Z",
        artifactRef: "artifact://hoplon/authz/current"
      }
    ],
    artifactRefs: [
      {
        artifactRef: "artifact://guardrail/runtime/current",
        portfolioId: "portfolio://default",
        artifactType: "runtime_snapshot",
        storageUri: "artifact://guardrail/runtime/current",
        contentHash: {
          algorithm: "sha256",
          value: "1111111111111111111111111111111111111111111111111111111111111111"
        },
        redactionStatus: "not_required",
        createdAt: "2026-05-03T12:04:00Z"
      },
      {
        artifactRef: "artifact://hoplon/authz/current",
        portfolioId: "portfolio://default",
        artifactType: "contract_snapshot",
        storageUri: "artifact://hoplon/authz/current",
        contentHash: {
          algorithm: "sha256",
          value: "2222222222222222222222222222222222222222222222222222222222222222"
        },
        redactionStatus: "not_required",
        createdAt: "2026-05-03T12:03:00Z"
      }
    ],
    decisions: [
      {
        decisionId: "decision://control-plane/authz-waiver",
        portfolioId: "portfolio://default",
        programId: "program://control-plane",
        projectId: "project://phalanx",
        summary: "Temporary authz waiver",
        status: "superseded",
        recordedAt: "2026-05-03T12:06:00Z",
        validFrom: "2026-05-03T12:00:00Z",
        evidenceRefs: ["evidence://hoplon/authz/current"],
        appliesToRefs: ["contract://hoplon/authz@sha256:cccc"]
      }
    ],
    events: [
      {
        eventId: "event://control-plane/graph-seed",
        portfolioId: "portfolio://default",
        eventType: "graph_seeded",
        recordedAt: "2026-05-03T12:07:00Z",
        evidenceRefs: ["evidence://hoplon/authz/current"],
        artifactRefs: ["artifact://hoplon/authz/current"]
      }
    ],
    syncCursors: [
      {
        adapterId: "guardrail-local",
        portfolioId: "portfolio://default",
        cursor: "cursor://guardrail/runtime",
        recordedAt: "2026-05-03T12:08:00Z",
        observedAt: "2026-05-03T12:08:00Z",
        sourceRevisionHash:
          "sha256:3333333333333333333333333333333333333333333333333333333333333333",
        status: "stale"
      },
      {
        adapterId: "hoplon-local",
        portfolioId: "portfolio://default",
        cursor: "snapshot:s-2026-05-03",
        recordedAt: "2026-05-03T12:08:30Z",
        observedAt: "2026-05-03T12:08:30Z",
        sourceRevisionHash:
          "sha256:4444444444444444444444444444444444444444444444444444444444444444",
        status: "current"
      }
    ]
  });

  const scope = {
    portfolioId: "portfolio://default",
    programId: "program://control-plane"
  };

  assert.deepEqual(
    (await repository.listPrograms(scope)).map((program) => program.programId),
    ["program://control-plane"]
  );
  assert.deepEqual(
    (await repository.listProjects(scope)).map((project) => project.projectId),
    [
      "project://guardrail",
      "project://hoplon",
      "project://phalanx",
      "project://semantix"
    ]
  );
  assert.deepEqual(
    (await repository.listMemberships(scope)).map((membership) => membership.projectId),
    [
      "project://guardrail",
      "project://hoplon",
      "project://phalanx",
      "project://semantix"
    ]
  );
  assert.deepEqual(
    (await repository.listIntegrationPoints(scope)).map(
      (integrationPoint) => integrationPoint.integrationPointId
    ),
    [
      "integration://guardrail/runtime-controls",
      "integration://hoplon/authz-gateway"
    ]
  );
  assert.deepEqual(
    (await repository.listContracts(scope)).map((contract) => contract.contractRef),
    ["contract://hoplon/authz@sha256:cccc"]
  );
  assert.deepEqual(
    (await repository.listRelationships(scope)).map((relationship) => relationship.dependencyId),
    [
      "dep-phalanx-hoplon-authz",
      "dep-phalanx-guardrail-runtime",
      "dep-hoplon-semantix"
    ]
  );
  assert.deepEqual(
    (await repository.listEvidenceRefs(scope)).map((evidenceRef) => evidenceRef.evidenceRef),
    [
      "evidence://guardrail/runtime/current",
      "evidence://hoplon/authz/current"
    ]
  );
  assert.deepEqual(
    (await repository.listArtifactRefs(scope)).map((artifactRef) => artifactRef.artifactRef),
    [
      "artifact://guardrail/runtime/current",
      "artifact://hoplon/authz/current"
    ]
  );
  assert.deepEqual(
    (await repository.listDecisions({ scope })).map((decision) => decision.decisionId),
    ["decision://control-plane/authz-waiver"]
  );
  assert.deepEqual(
    (await repository.listEvents(scope)).map((event) => event.eventId),
    ["event://control-plane/graph-seed"]
  );
  assert.deepEqual(
    (await repository.getSyncCursors(scope)).map((cursor) => cursor.adapterId),
    ["guardrail-local", "hoplon-local"]
  );
});

test("ProgramManagerGraphRepository returns bounded context and deterministic impact traversal", async () => {
  const { repositoryModule } = await loadGraphModules();
  const repository = repositoryModule.ProgramManagerGraphRepository.createInMemory();

  await repository.seed({
    programs: [
      {
        portfolioId: "portfolio://default",
        programId: "program://control-plane",
        name: "Control Plane"
      }
    ],
    projects: [
      {
        portfolioId: "portfolio://default",
        programId: "program://control-plane",
        projectId: "project://phalanx",
        name: "Phalanx"
      },
      {
        portfolioId: "portfolio://default",
        programId: "program://control-plane",
        projectId: "project://guardrail",
        name: "Guardrail"
      },
      {
        portfolioId: "portfolio://default",
        programId: "program://control-plane",
        projectId: "project://semantix",
        name: "Semantix"
      }
    ],
    integrationPoints: [
      {
        portfolioId: "portfolio://default",
        integrationPointId: "integration://guardrail/runtime-controls",
        producerProjectId: "project://guardrail",
        consumerProjectIds: ["project://phalanx"],
        recordedAt: "2026-05-03T12:01:00Z"
      }
    ],
    contracts: [
      {
        portfolioId: "portfolio://default",
        contractRef: "contract://hoplon/authz@sha256:cccc",
        integrationPointId: "integration://guardrail/runtime-controls",
        producerProjectId: "project://guardrail",
        recordedAt: "2026-05-03T12:02:00Z",
        evidenceRefs: ["evidence://guardrail/runtime/current"]
      }
    ],
    relationships: [
      {
        dependencyId: "dep-a",
        portfolioId: "portfolio://default",
        programId: "program://control-plane",
        projectId: "project://phalanx",
        fromRef: "project://phalanx",
        toRef: "contract://hoplon/authz@sha256:cccc",
        dependencyType: "REQUIRES_APPROVAL",
        criticality: "tier_1",
        status: "blocked",
        recordedAt: "2026-05-03T12:03:00Z",
        validFrom: "2026-05-03T12:00:00Z",
        evidenceRefs: ["evidence://guardrail/runtime/current"],
        sourceAdapterId: "hoplon-local",
        sourceCursor: "snapshot:s-2026-05-03"
      },
      {
        dependencyId: "dep-b",
        portfolioId: "portfolio://default",
        programId: "program://control-plane",
        projectId: "project://phalanx",
        fromRef: "project://phalanx",
        toRef: "integration://guardrail/runtime-controls",
        dependencyType: "REQUIRES_EVIDENCE",
        criticality: "tier_1",
        status: "stale",
        recordedAt: "2026-05-03T12:04:00Z",
        validFrom: "2026-05-03T12:00:00Z",
        evidenceRefs: ["evidence://guardrail/runtime/current"],
        sourceAdapterId: "guardrail-local",
        sourceCursor: "cursor://guardrail/runtime"
      },
      {
        dependencyId: "dep-c",
        portfolioId: "portfolio://default",
        programId: "program://control-plane",
        projectId: "project://guardrail",
        fromRef: "contract://hoplon/authz@sha256:cccc",
        toRef: "project://semantix",
        dependencyType: "AFFECTS",
        criticality: "tier_2",
        status: "active",
        recordedAt: "2026-05-03T12:05:00Z",
        validFrom: "2026-05-03T12:00:00Z",
        evidenceRefs: [],
        sourceAdapterId: "repo-local",
        sourceCursor: "cursor://graph/1"
      }
    ],
    evidenceRefs: [
      {
        evidenceRef: "evidence://guardrail/runtime/current",
        portfolioId: "portfolio://default",
        kind: "runtime_snapshot",
        recordedAt: "2026-05-03T12:04:00Z"
      }
    ],
    artifactRefs: [
      {
        artifactRef: "artifact://guardrail/runtime/current",
        portfolioId: "portfolio://default",
        artifactType: "runtime_snapshot",
        storageUri: "artifact://guardrail/runtime/current",
        contentHash: {
          algorithm: "sha256",
          value: "1111111111111111111111111111111111111111111111111111111111111111"
        },
        redactionStatus: "not_required",
        createdAt: "2026-05-03T12:04:00Z"
      }
    ],
    decisions: [
      {
        decisionId: "decision://control-plane/authz-waiver",
        portfolioId: "portfolio://default",
        programId: "program://control-plane",
        summary: "Temporary authz waiver",
        status: "superseded",
        recordedAt: "2026-05-03T12:06:00Z",
        validFrom: "2026-05-03T12:00:00Z",
        evidenceRefs: ["evidence://guardrail/runtime/current"],
        appliesToRefs: ["contract://hoplon/authz@sha256:cccc"]
      }
    ]
  });

  const context = await repository.getProgramContext({
    scope: {
      portfolioId: "portfolio://default",
      programId: "program://control-plane"
    },
    targetRefs: [
      "project://phalanx",
      "contract://hoplon/authz@sha256:cccc"
    ],
    limit: 4,
    includeSuperseded: true
  });

  assert.equal(context.contextAnchor?.portfolioId, "portfolio://default");
  assert.deepEqual(
    context.matchedRefs.map((match) => `${match.kind}:${match.ref}`),
    [
      "project:project://phalanx",
      "contract:contract://hoplon/authz@sha256:cccc",
      "contract:contract://hoplon/authz@sha256:cccc",
      "evidence:evidence://guardrail/runtime/current"
    ]
  );
  assert.equal(context.omittedRefCount, 3);

  const impact = await repository.assessImpact({
    scope: {
      portfolioId: "portfolio://default",
      programId: "program://control-plane"
    },
    changeRef: "project://phalanx",
    changeKind: "project",
    targetRefs: [
      "contract://hoplon/authz@sha256:cccc",
      "integration://guardrail/runtime-controls",
      "project://semantix"
    ],
    traversalBudgetRef: "budget://default"
  });

  assert.deepEqual(impact.affectedRefs, [
    {
      kind: "contract",
      ref: "contract://hoplon/authz@sha256:cccc",
      reason: "REQUIRES_APPROVAL:dep-a"
    },
    {
      kind: "integration_point",
      ref: "integration://guardrail/runtime-controls",
      reason: "REQUIRES_EVIDENCE:dep-b"
    },
    {
      kind: "project",
      ref: "project://semantix",
      reason: "AFFECTS:dep-c"
    }
  ]);
  assert.deepEqual(
    impact.findings.map((finding) => finding.findingId),
    ["dep-a", "dep-b", "decision:decision://control-plane/authz-waiver"]
  );
  assert.deepEqual(impact.requiredApprovals, [
    {
      authorityRef: "contract://hoplon/authz@sha256:cccc",
      reason: "REQUIRES_APPROVAL:dep-a",
      evidencePolicyRefs: []
    }
  ]);
  assert.deepEqual(impact.evidenceObligations, [
    {
      policyRef: "dep-b",
      targetRef: "integration://guardrail/runtime-controls",
      status: "stale"
    }
  ]);
});
