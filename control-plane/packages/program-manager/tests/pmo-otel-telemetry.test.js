import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSignalSpan,
  buildToolSpan,
  newSpanId,
  newTraceId,
  summarizeTelemetryEvidence
} from "../scripts/pmo-otel-telemetry.mjs";

test("telemetry helpers generate pointer-only, redacted telemetry spans", () => {
  const traceId = newTraceId("pmo-otel-test");
  const span = buildToolSpan({
    name: "pmo.tool.probe",
    traceId,
    correlationId: "corr://probe",
    startAtMs: 1_700_000_000_000,
    endAtMs: 1_700_000_000_010,
    request: {
      traceId,
      correlationId: "corr://probe",
      body: "inline payload",
      secret: "hidden",
      nested: {
        trace: "hidden trace",
        summary: "should remain"
      }
    },
    response: {
      status: "error",
      summary: "should stay as pointer"
    }
  });

  assert.ok(span.spanId.length > 0);
  assert.equal(span.status, "error");
  assert.ok(span.redactionSummary.redacted);
  assert.ok(span.redactionSummary.omittedKinds.includes("content_body"));
  assert.ok(span.redactionSummary.omittedKinds.includes("secrets"));
  assert.ok(!("body" in span.attributes.request));
  assert.equal(span.attributes.request.nested.summary, "should remain");
  assert.equal(span.attributes.response.status, "error");
});

test("telemetry evidence aggregation preserves status counts", () => {
  const traceId = newTraceId("pmo-otel-summary");
  const spanA = buildSignalSpan({
    name: "pmo.health.ok",
    traceId,
    correlationId: "corr://a",
    startAtMs: 1,
    endAtMs: 3,
    response: { status: "ok" }
  });
  const spanB = buildSignalSpan({
    name: "pmo.health.degraded",
    traceId,
    correlationId: "corr://b",
    startAtMs: 2,
    endAtMs: 4,
    response: { status: "degraded" },
    status: "degraded"
  });
  const spanC = buildSignalSpan({
    name: "pmo.health.error",
    traceId,
    correlationId: "corr://c",
    startAtMs: 2,
    endAtMs: 4,
    response: { status: "ok" },
    error: new Error("boom")
  });

  const summary = summarizeTelemetryEvidence({
    traceId,
    scenario: "telemetry-summary-test",
    spans: [spanA, spanB, spanC],
    source: "unit-test"
  });

  assert.equal(summary.spanCount, 3);
  assert.equal(summary.statusCounts.degraded, 1);
  assert.equal(summary.statusCounts.error, 1);
  assert.equal(summary.redactionSummary.redacted, false);
});

test("newSpanId is stable-enough random-looking and non-empty", () => {
  const first = newSpanId("pmo-otel-span");
  const second = newSpanId("pmo-otel-span");
  assert.ok(first.length >= 16);
  assert.ok(second.length >= 16);
  assert.notEqual(first, second);
});
