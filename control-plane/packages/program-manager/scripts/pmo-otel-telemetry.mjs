import { createHash, randomUUID } from "node:crypto";
import { mergeRedactionSummaries, sanitizePointerPayload } from "../src/redaction/program-tool-redaction.ts";

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function newTraceId(seed = "pmo-telemetry") {
  return `trace://${sha256Hex(`${seed}:${randomUUID()}`).slice(0, 32)}`;
}

export function newSpanId(seed = "pmo-span") {
  return sha256Hex(`${seed}:${randomUUID()}`).slice(0, 16);
}

function timestampMs(now = Date.now()) {
  return Number(now);
}

function toSafeObject(payload) {
  if (payload == null) {
    return {};
  }
  return JSON.parse(
    JSON.stringify(payload, (key, value) => {
      if (typeof value === "bigint") {
        return value.toString();
      }
      return value;
    })
  );
}

export function sanitizeTelemetryPayload(payload, policyRefs = ["policy://redaction/pointer-only-v1"]) {
  return sanitizePointerPayload(toSafeObject(payload), policyRefs);
}

export function buildSpan({
  name,
  traceId,
  correlationId,
  startAtMs,
  endAtMs,
  status,
  parentSpanId,
  kind = "INTERNAL",
  attributes = {},
  request,
  response,
  error
}) {
  const safeRequest = sanitizeTelemetryPayload(request);
  const safeResponse = sanitizeTelemetryPayload(response);
  const redactionSummary = mergeRedactionSummaries(safeRequest.redactionSummary, safeResponse.redactionSummary);
  const started = timestampMs(startAtMs);
  const ended = timestampMs(endAtMs);

  return {
    name,
    kind,
    traceId,
    correlationId,
    spanId: newSpanId(`${traceId}:${name}:${correlationId}:${started}:${ended}`),
    parentSpanId,
    startTime: new Date(started).toISOString(),
    endTime: new Date(ended).toISOString(),
    durationMs: Math.max(0, ended - started),
    status,
    attributes: {
      ...attributes,
      traceId,
      correlationId,
      request: safeRequest.value,
      response: safeResponse.value
    },
    redactionSummary,
    error: error ? {
      name: error.name,
      message: error.message
    } : undefined
  };
}

export function buildToolSpan(options) {
  return buildSpan({
    kind: "SERVER",
    ...options,
    status: options.status ?? (options.response?.status ?? "ok")
  });
}

export function buildSignalSpan(options) {
  return buildSpan({
    kind: "INTERNAL",
    ...options,
    status: options.status ?? (options.error ? "error" : (options.response?.status ?? "ok"))
  });
}

export function summarizeTelemetryEvidence({traceId, scenario, spans, source = "pmo-script"}) {
  const statusCounts = {};
  for (const span of spans) {
    statusCounts[span.status] = (statusCounts[span.status] || 0) + 1;
  }

  const mergedRedaction = mergeRedactionSummaries(
    ...spans.map((span) => span.redactionSummary)
  );

  return {
    source,
    scenario,
    traceId,
    collectedAt: new Date().toISOString(),
    spanCount: spans.length,
    statusCounts,
    redactionSummary: mergedRedaction,
    spans
  };
}
