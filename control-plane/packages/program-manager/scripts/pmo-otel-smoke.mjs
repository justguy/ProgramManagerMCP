import assert from "node:assert/strict";

import {
  AdapterRegistry,
  HoplonAdapterStub,
  TrackerAdapterStub
} from "../src/adapters/program-adapter-registry.ts";
import { buildSignalSpan, buildToolSpan, newTraceId, sanitizeTelemetryPayload, summarizeTelemetryEvidence } from "./pmo-otel-telemetry.mjs";
import { InMemoryProgramManagerRepository } from "../src/repository/in-memory-program-manager-repository.ts";
import { getBackboneRepositoryFixture } from "../src/fixtures/golden-fixture-backbone.js";
import { ProgramManagerMcpGateway } from "../src/mcp/program-manager-mcp-gateway.ts";
import { ProgramToolService } from "../src/service/program-tool-service.ts";
import {
  DEFAULT_NOW,
  buildActor,
  loadFixtureJSON
} from "./pmo-check-common.mjs";

function buildGateway(adapters) {
  const repository = InMemoryProgramManagerRepository.fromFixture(getBackboneRepositoryFixture());
  const adapterRegistry = new AdapterRegistry(adapters);
  const service = new ProgramToolService({
    repository,
    adapterRegistry,
    now: () => DEFAULT_NOW
  });

  return {
    gateway: new ProgramManagerMcpGateway(service),
    adapterRegistry
  };
}

function buildDegradedAdapter(now = DEFAULT_NOW) {
  const adapterId = "probe-degraded-local";
  const manifest = {
    adapterId,
    adapterVersion: "1.0.0",
    authScopes: ["portfolio:default:read"],
    capabilityDomains: ["health_probe"],
    displayName: "Degraded PMO Probe Adapter",
    evidenceTypes: ["probe_health_marker"],
    healthModel: {
      circuitOpenAfterFailures: 2,
      circuitOpenSeconds: 120,
      statuses: ["circuit_open", "degraded", "healthy", "unavailable"]
    },
    maxStaleCursorSeconds: 300,
    methods: {
      assessImpact: true,
      describeCapabilities: true,
      getHealth: true,
      getObservationSchema: true,
      getSourceCursor: true,
      produceEvidenceRefs: true,
      readState: true,
      reconcileState: false
    },
    phase1aEnabled: true,
    redactionPolicyRefs: ["policy://redaction/pointer-only-v1"],
    sideEffectPosture: "read_only",
    supportedProjects: ["project://program-manager-mcp"]
  };
  let failures = 0;

  return {
    manifest,
    describeCapabilities: async () => manifest,
    getObservationSchema: async (domain, observationType) => ({
      schemaVersion: "1",
      domain,
      observationType
    }),
    readState: async () => {
      failures += 1;
      throw new Error("degraded adapter read path unavailable");
    },
    assessImpact: async (request) => ({
      adapterId,
      status: "warning",
      sourceCursor: "rev://degraded-probe",
      affectedRefs: [],
      findings: [
        {
          findingId: `${adapterId}-probe-finding`,
          severity: "medium",
          type: "adapter_signal",
          evidenceRefs: [],
          summary: "Probe adapter intentionally reports warning for degraded telemetry checks."
        }
      ],
      evidenceRefs: [],
      artifactRefs: [],
      redactionSummary: {
        redacted: true,
        omittedKinds: ["content_body", "traces"],
        policyRefs: ["policy://redaction/pointer-only-v1"]
      },
      requestId: request.requestId
    }),
    reconcileState: async () => {
      throw new Error("reconcile is intentionally unsupported");
    },
    produceEvidenceRefs: async (result) => result.evidenceRefs ?? [],
    getSourceCursor: async (scope, now = DEFAULT_NOW) => ({
      adapterId,
      portfolioId: scope.portfolioId,
      cursor: "rev://degraded-probe",
      observedAt: now,
      sourceRevisionHash: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      status: failures > 0 ? "stale" : "current"
    }),
    getHealth: async (_scope, checkedNow = DEFAULT_NOW) => ({
      adapterId,
      status: "healthy",
      reasons: [],
      cursor: "rev://degraded-probe",
      observedAt: DEFAULT_NOW,
      checkedAt: checkedNow,
      maxStaleCursorSeconds: 300
    })
  };
}

async function recordToolSpan({ spans, traceId, parentSpanId, gateway, actor, toolName, request, allowFailure = false }) {
  const correlationId = request.correlationId;
  const start = Date.now();
  let response;
  let error;
  try {
    response = await gateway.callTool(toolName, request, actor);
  } catch (caught) {
    error = caught;
    if (!allowFailure) {
      throw error;
    }
  }
  const end = Date.now();
  const span = buildToolSpan({
    name: `pmo.tool.${toolName}`,
    traceId,
    correlationId,
    parentSpanId,
    startAtMs: start,
    endAtMs: end,
    request,
    response: error ? { status: "error", summary: error.message } : response,
    status: error ? "error" : response.status,
    error,
    attributes: {
      tool: toolName,
      actorId: actor.actorId
    }
  });
  spans.push(span);
  return { response, error, span };
}

function recordSignalSpan({ spans, traceId, parentSpanId, correlationId, name, request, response, error, status }) {
  const start = Date.now();
  const end = Date.now();
  const span = buildSignalSpan({
    name,
    traceId,
    correlationId,
    parentSpanId,
    startAtMs: start,
    endAtMs: end,
    request,
    response,
    error,
    status,
    attributes: {
      signal: name
    }
  });
  spans.push(span);
  return span;
}

function buildCheckRootSpan({ traceId, spans, scenario }) {
  const span = buildSignalSpan({
    name: `pmo.workflow.${scenario}`,
    traceId,
    correlationId: `corr://${scenario}`,
    startAtMs: Date.now(),
    endAtMs: Date.now(),
    response: {
      status: "ok",
      scenario
    },
    status: "ok",
    attributes: {
      scenario
    }
  });
  spans.push(span);
  return span;
}

async function checkReplayAndReportTelemetry() {
  const fixture = await loadFixtureJSON("../fixtures/pmo-doctor-fixture.example.json");
  const { gateway } = buildGateway([new HoplonAdapterStub(), new TrackerAdapterStub()]);
  const actor = buildActor();
  const spans = [];
  const traceId = newTraceId("pmo-603/replay-report");
  const scenario = "replay-and-report-smoke";

  const rootSpan = buildCheckRootSpan({ traceId, spans, scenario });
  const queryRequest = {
    portfolioId: fixture.requestContext.portfolioId,
    programId: fixture.requestContext.programId,
    queryKind: fixture.replay.query.queryKind,
    targetRefs: fixture.replay.query.targetRefs,
    limit: 20,
    traceId,
    correlationId: "corr://pmo-603/query"
  };
  const impactRequest = {
    portfolioId: fixture.requestContext.portfolioId,
    programId: fixture.requestContext.programId,
    changeRef: fixture.replay.impact.changeRef,
    changeKind: fixture.replay.impact.changeKind,
    targetRefs: fixture.replay.impact.targetRefs,
    traversalBudgetRef: fixture.replay.impact.traversalBudgetRef,
    traceId,
    correlationId: "corr://pmo-603/impact"
  };
  const generateRequest = {
    portfolioId: fixture.requestContext.portfolioId,
    programId: fixture.requestContext.programId,
    reportAudience: fixture.requestContext.reportAudience,
    contextAnchor: fixture.requestContext.contextAnchor,
    traceId,
    correlationId: "corr://pmo-603/report"
  };

  const { response: queryResult } = await recordToolSpan({
    spans,
    traceId,
    parentSpanId: rootSpan.spanId,
    gateway,
    actor,
    toolName: "query_program_context",
    request: queryRequest
  });
  const { response: impactResult } = await recordToolSpan({
    spans,
    traceId,
    parentSpanId: rootSpan.spanId,
    gateway,
    actor,
    toolName: "assess_program_impact",
    request: impactRequest
  });
  const { response: reportResult } = await recordToolSpan({
    spans,
    traceId,
    parentSpanId: rootSpan.spanId,
    gateway,
    actor,
    toolName: "generate_program_update",
    request: generateRequest
  });

  assert.equal(queryResult.status !== "blocked", true);
  assert.equal(impactResult.status !== "blocked", true);
  assert.equal(reportResult.status !== "blocked", true);
  assert.equal(queryResult.traceId, traceId);
  assert.equal(impactResult.traceId, traceId);
  assert.equal(reportResult.traceId, traceId);
  assert.ok(/^sha256:[a-f0-9]{64}$/i.test(reportResult.stateVersionHash));
  assert.equal(queryResult.correlationId, "corr://pmo-603/query");
  assert.equal(impactResult.correlationId, "corr://pmo-603/impact");
  assert.equal(reportResult.correlationId, "corr://pmo-603/report");
  assert.ok(Array.isArray(queryResult.deterministicCore?.matchedRefs));
  assert.ok(impactResult.deterministicCore?.affectedRefs.length >= 1);

  const replayQuery = await recordToolSpan({
    spans,
    traceId,
    parentSpanId: rootSpan.spanId,
    gateway,
    actor,
    toolName: "query_program_context",
    request: {
      ...queryRequest,
      traceId,
      correlationId: "corr://pmo-603/query-replay"
    }
  });
  const replayImpact = await recordToolSpan({
    spans,
    traceId,
    parentSpanId: rootSpan.spanId,
    gateway,
    actor,
    toolName: "assess_program_impact",
    request: {
      ...impactRequest,
      traceId,
      correlationId: "corr://pmo-603/impact-replay"
    }
  });
  const replayReport = await recordToolSpan({
    spans,
    traceId,
    parentSpanId: rootSpan.spanId,
    gateway,
    actor,
    toolName: "generate_program_update",
    request: {
      ...generateRequest,
      traceId,
      correlationId: "corr://pmo-603/report-replay"
    }
  });

  assert.equal(replayQuery.response.status !== "blocked", true);
  assert.equal(replayImpact.response.status !== "blocked", true);
  assert.equal(replayReport.response.status !== "blocked", true);
  assert.equal(queryResult.stateVersionHash, replayQuery.response.stateVersionHash);
  assert.equal(impactResult.stateVersionHash, replayImpact.response.stateVersionHash);
  assert.equal(reportResult.stateVersionHash, replayReport.response.stateVersionHash);

  const reportEvidence = summarizeTelemetryEvidence({
    traceId,
    scenario,
    spans,
    source: "scripts/pmo-otel-smoke.mjs"
  });
  console.log(JSON.stringify(reportEvidence, null, 2));
}

async function checkDegradedAdapterTelemetry() {
  const degradedAdapter = buildDegradedAdapter();
  const { adapterRegistry } = buildGateway([new HoplonAdapterStub(), new TrackerAdapterStub(), degradedAdapter]);
  const actor = buildActor();
  const spans = [];
  const traceId = newTraceId("pmo-603/degraded-adapter");
  const scenario = "degraded-adapter-telemetry";
  const rootSpan = buildCheckRootSpan({ traceId, spans, scenario });
  const scope = { portfolioId: "portfolio://default", programId: "program://agentic-os" };
  const probeRequest = {
    requestId: "otel-probe-read",
    portfolioId: "portfolio://default",
    targetRefs: ["tracker://program-manager-mcp/PMO-001", "project://program-manager-mcp"],
    limit: 1,
    traceId,
    correlationId: "corr://otel-probe-read"
  };

  const first = await recordToolSpan({
    spans,
    traceId,
    parentSpanId: rootSpan.spanId,
    gateway: {
      async callTool() {
        return adapterRegistry.readState("probe-degraded-local", probeRequest, DEFAULT_NOW);
      }
    },
    actor,
    toolName: "adapter.readState",
    request: probeRequest,
    allowFailure: true
  });
  assert.ok(first.error instanceof Error);
  assert.equal(first.error.message, "degraded adapter read path unavailable");

  const firstHealth = await adapterRegistry.getHealth("probe-degraded-local", scope, DEFAULT_NOW);
  recordSignalSpan({
    spans,
    traceId,
    parentSpanId: rootSpan.spanId,
    correlationId: "corr://otel-probe-health-1",
    name: "adapter.health",
    request: {
      adapterId: "probe-degraded-local",
      afterFailure: 1,
      now: DEFAULT_NOW
    },
    response: firstHealth
  });
  assert.equal(firstHealth.status, "degraded");

  const second = await recordToolSpan({
    spans,
    traceId,
    parentSpanId: rootSpan.spanId,
    gateway: {
      async callTool() {
        return adapterRegistry.readState("probe-degraded-local", probeRequest, DEFAULT_NOW);
      }
    },
    actor,
    toolName: "adapter.readState",
    request: {
      ...probeRequest,
      correlationId: "corr://otel-probe-read-2"
    },
    allowFailure: true
  });
  assert.ok(second.error instanceof Error);

  const secondHealth = await adapterRegistry.getHealth("probe-degraded-local", scope, DEFAULT_NOW);
  recordSignalSpan({
    spans,
    traceId,
    parentSpanId: rootSpan.spanId,
    correlationId: "corr://otel-probe-health-2",
    name: "adapter.health",
    request: {
      adapterId: "probe-degraded-local",
      afterFailure: 2,
      now: DEFAULT_NOW
    },
    response: secondHealth
  });
  assert.equal(secondHealth.status, "circuit_open");

  const third = await recordToolSpan({
    spans,
    traceId,
    parentSpanId: rootSpan.spanId,
    gateway: {
      async callTool() {
        return adapterRegistry.readState("probe-degraded-local", probeRequest, DEFAULT_NOW);
      }
    },
    actor,
    toolName: "adapter.readState",
    request: {
      ...probeRequest,
      correlationId: "corr://otel-probe-read-3"
    },
    allowFailure: true
  });
  assert.ok(third.error instanceof Error);
  assert.ok(third.error.message.includes("circuit-open"));

  const thirdHealth = await adapterRegistry.getHealth("probe-degraded-local", scope, DEFAULT_NOW);
  recordSignalSpan({
    spans,
    traceId,
    parentSpanId: rootSpan.spanId,
    correlationId: "corr://otel-probe-health-3",
    name: "adapter.health",
    request: {
      adapterId: "probe-degraded-local",
      afterFailure: 3,
      now: DEFAULT_NOW
    },
    response: thirdHealth
  });
  assert.equal(thirdHealth.status, "circuit_open");

  const traceEvidence = summarizeTelemetryEvidence({
    traceId,
    scenario,
    spans,
    source: "scripts/pmo-otel-smoke.mjs"
  });
  assert.equal(traceEvidence.statusCounts.error >= 3, true);
  assert.equal(traceEvidence.statusCounts.circuit_open >= 2, true);
  console.log(JSON.stringify(traceEvidence, null, 2));
}

function checkTelemetryRedactionSafety() {
  const spans = [];
  const scenario = "redaction-safe-output";
  const traceId = newTraceId("pmo-603/redaction");
  const rootSpan = buildCheckRootSpan({ traceId, spans, scenario });
  const sensitiveRequest = {
    traceId,
    correlationId: "corr://otel-redaction",
    body: "inline detail must be removed",
    secret: "classified detail",
    rawLog: ["raw-log-line"],
    trace: "raw-trace-content"
  };
  const sanitized = sanitizeTelemetryPayload(sensitiveRequest);
  assert.ok(sanitized.redactionSummary.redacted);
  assert.ok(sanitized.redactionSummary.omittedKinds.includes("content_body"));
  assert.ok(sanitized.redactionSummary.omittedKinds.includes("secrets"));
  assert.ok(sanitized.redactionSummary.omittedKinds.includes("logs"));
  assert.ok(!("body" in sanitized.value));

  const span = buildToolSpan({
    name: "pmo.tool.redaction_probe",
    traceId,
    correlationId: "corr://otel-redaction",
    parentSpanId: rootSpan.spanId,
    startAtMs: Date.now(),
    endAtMs: Date.now(),
    request: sensitiveRequest,
    response: {
      status: "ok",
      result: {
        body: "another leak",
        notes: "should be removed"
      }
    },
    status: "ok",
    attributes: {
      probe: "redaction"
    }
  });
  spans.push(span);
  assert.ok(span.redactionSummary.omittedKinds.includes("content_body"));

  const evidence = summarizeTelemetryEvidence({
    traceId,
    scenario,
    spans,
    source: "scripts/pmo-otel-smoke.mjs"
  });
  assert.equal(evidence.redactionSummary.redacted, true);
  console.log(JSON.stringify(evidence, null, 2));
}

const checks = [
  ["pmo replay/report telemetry flow", checkReplayAndReportTelemetry],
  ["degraded adapter telemetry evidence", checkDegradedAdapterTelemetry],
  ["redaction-safe telemetry evidence", checkTelemetryRedactionSafety]
];

(async () => {
  for (const [name, check] of checks) {
    await check();
    console.log(`PASS ${name}`);
  }
})();
