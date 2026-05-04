import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
    intelligenceRecords: [
      {
        appliesToRefs: ["contract://hoplon/authz@sha256:cccc"],
        conditionTags: ["action:implicit_approval", "integration:hoplon", "risk:approval_scope"],
        decisionRef: "decision://control-plane/discarded/implicit-authz-waiver",
        evidenceRefs: ["evidence://hoplon/authz/current"],
        portfolioId: "portfolio://default",
        programId: "program://control-plane",
        projectId: "project://phalanx",
        rationale: "Implicit authz waiver was rejected because the approval is superseded.",
        recordedAt: "2026-05-03T12:06:30Z",
        recordId: "intelligence://control-plane/discarded-decision/implicit-authz-waiver",
        recordType: "discarded_decision",
        reviewStatus: "supported",
        sourceAdapterId: "fixture-loader",
        sourceCursor: "snapshot:v1",
        sourceRefs: ["decision://control-plane/authz-waiver"],
        summary: "Do not use superseded authz waiver as current approval evidence.",
        title: "Discard implicit authz waiver",
        validFrom: "2026-05-03T12:00:00Z"
      },
      {
        appliesToRefs: ["evidence://guardrail/runtime/current"],
        conditionTags: ["action:require_cursor_check", "integration:guardrail", "risk:stale_evidence"],
        confidence: {
          mode: "supported",
          rationale: "Guardrail runtime evidence was stale in the seeded graph.",
          score: 0.8
        },
        evidenceRefs: ["evidence://guardrail/runtime/current"],
        portfolioId: "portfolio://default",
        programId: "program://control-plane",
        projectId: "project://phalanx",
        recordedAt: "2026-05-03T12:06:45Z",
        recordId: "intelligence://control-plane/learning/guardrail-stale-runtime",
        recordType: "learning",
        reusableLesson: "Require fresh Guardrail cursor evidence before clearing runtime controls.",
        reviewStatus: "supported",
        sourceAdapterId: "guardrail-local",
        sourceCursor: "cursor://guardrail/runtime",
        sourceRefs: ["evidence://guardrail/runtime/current"],
        summary: "Guardrail runtime evidence must be current before it satisfies execution readiness.",
        title: "Check Guardrail runtime cursor",
        validFrom: "2026-05-03T12:00:00Z"
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
    (await repository.listIntelligenceRecords({ scope })).map((record) => record.recordId),
    [
      "intelligence://control-plane/discarded-decision/implicit-authz-waiver",
      "intelligence://control-plane/learning/guardrail-stale-runtime"
    ]
  );
  assert.deepEqual(
    (await repository.listIntelligenceRecords({
      scope,
      recordTypes: ["learning"],
      targetRefs: ["evidence://guardrail/runtime/current"],
      conditionTags: ["risk:stale_evidence"]
    })).map((record) => record.recordId),
    ["intelligence://control-plane/learning/guardrail-stale-runtime"]
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

test("ProgramManagerGraphRepository reads PMO macro facts with stable ordering and portfolio isolation", async () => {
  const { repositoryModule } = await loadGraphModules();
  const repository = repositoryModule.ProgramManagerGraphRepository.createInMemory();
  const fixture = JSON.parse(
    readFileSync(
      join(process.cwd(), "../../../docs/phase-5/fixtures/pmo-macro-fixture-universe.example.json"),
      "utf8"
    )
  );

  await repository.seed({
    macroTasks: fixture.seedGraph.tasks,
    macroBlockers: fixture.seedGraph.blockers,
    macroContracts: fixture.seedGraph.contracts,
    macroDependencyEdges: fixture.seedGraph.dependencyEdges,
    macroRunbooks: fixture.seedGraph.runbooks
  });

  const scope = {
    portfolioId: "portfolio://default",
    programId: "program://agentic-os"
  };

  const firstRead = await repository.listMacroFacts({ scope });
  const secondRead = await repository.listMacroFacts({ scope });

  assert.deepEqual(secondRead, firstRead);
  assert.deepEqual(
    firstRead.tasks.map((task) => task.taskRef),
    [
      "task://agentic-os/pmo-701",
      "task://agentic-os/pmo-702",
      "task://agentic-os/pmo-705"
    ]
  );
  assert.deepEqual(
    firstRead.blockers.map((blocker) => blocker.blockerRef),
    [
      "blocker://agentic-os/macro-dispatcher-awaits-fixtures",
      "blocker://agentic-os/macro-fixture-evidence-gap"
    ]
  );
  assert.deepEqual(
    firstRead.contracts.map((contract) => contract.contractRef),
    [
      "contract://hoplon/authz/escalation-grant@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      "contract://semantix/readiness/control@sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    ]
  );
  assert.deepEqual(
    firstRead.dependencyEdges.map((edge) => edge.dependencyRef),
    [
      "dependency://agentic-os/guardrail-consumes-semantix-readiness",
      "dependency://agentic-os/phalanx-consumes-hoplon-authz",
      "dependency://agentic-os/pmo-701-unblocks-pmo-702"
    ]
  );
  assert.deepEqual(
    firstRead.runbooks.map((runbook) => runbook.runbookRef),
    ["runbook://code-review/request-senior-review"]
  );

  const phalanxFacts = await repository.listMacroFacts({
    scope,
    targetRefs: ["project://phalanx"]
  });
  assert.deepEqual(
    phalanxFacts.contracts.map((contract) => contract.contractRef),
    ["contract://hoplon/authz/escalation-grant@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"]
  );
  assert.deepEqual(
    phalanxFacts.dependencyEdges.map((edge) => edge.dependencyRef),
    ["dependency://agentic-os/phalanx-consumes-hoplon-authz"]
  );

  const foreignPortfolio = await repository.listMacroFacts({
    scope: {
      portfolioId: "portfolio://other",
      programId: "program://agentic-os"
    }
  });
  assert.deepEqual(foreignPortfolio, {
    tasks: [],
    blockers: [],
    contracts: [],
    dependencyEdges: [],
    runbooks: []
  });
});

test("ProgramManagerGraphRepository persists PMO macro registry deterministically", async () => {
  const { repositoryModule } = await loadGraphModules();
  const repository = repositoryModule.ProgramManagerGraphRepository.createInMemory();
  const scope = {
    portfolioId: "portfolio://default"
  };

  await repository.upsertMacroRegistry({
    artifactRefs: [],
    evidenceRefs: ["evidence://registry"],
    macros: [
      {
        description: "Simulate impact.",
        enabled: true,
        inputSchemaRef: "schema://pmo/pmo-macro-request",
        macroId: "macro://pmo/simulate_impact",
        macroName: "simulate_impact",
        outputSchemaRef: "schema://pmo/pmo-macro-result",
        registryEntryRef: "registry://pmo/macros/simulate_impact",
        requiredRoleRefs: ["role://pmo/operator", "role://pmo/admin"],
        sideEffectPosture: "describes_actions_only",
        title: "Simulate Impact",
        version: "1.0.0"
      },
      {
        description: "Return context.",
        enabled: true,
        inputSchemaRef: "schema://pmo/pmo-macro-request",
        macroId: "macro://pmo/catch_me_up",
        macroName: "catch_me_up",
        outputSchemaRef: "schema://pmo/pmo-macro-result",
        registryEntryRef: "registry://pmo/macros/catch_me_up",
        requiredRoleRefs: ["role://pmo/operator"],
        sideEffectPosture: "read_only",
        title: "Catch Me Up",
        version: "1.0.0"
      }
    ],
    portfolioId: "portfolio://default",
    recordedAt: "2026-05-04T06:00:00Z",
    registryRef: "registry://pmo/macros",
    registryVersion: "1.0.0",
    schemaVersion: "1"
  });

  const registry = await repository.getMacroRegistry(scope);
  assert.deepEqual(
    registry.macros.map((macro) => ({
      macroId: macro.macroId,
      requiredRoleRefs: macro.requiredRoleRefs
    })),
    [
      {
        macroId: "macro://pmo/catch_me_up",
        requiredRoleRefs: ["role://pmo/operator"]
      },
      {
        macroId: "macro://pmo/simulate_impact",
        requiredRoleRefs: ["role://pmo/admin", "role://pmo/operator"]
      }
    ]
  );
});
