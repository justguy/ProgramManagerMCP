import type {
  ContextAnchor,
  PmoOmniToolWriteEvent,
  ProgramEvent,
  ProgramEventCausation
} from "../types/domain.js";

export type BuildPmoOmniToolWriteEventInput = {
  action: string;
  artifactRefs?: string[];
  actorId?: string;
  causation?: Partial<ProgramEventCausation>;
  contextAnchor?: ContextAnchor;
  correlationId: string;
  eventId?: string;
  eventType?: string;
  evidenceRefs?: string[];
  idempotencyKey: string;
  managedRefs?: string[];
  payloadDigest?: string;
  portfolioId: string;
  recordedAt: string;
  targetRefs?: string[];
  toolName: string;
  traceId: string;
  writeStatus?: PmoOmniToolWriteEvent["writeStatus"];
};

export function buildPmoOmniToolWriteEvent(
  input: BuildPmoOmniToolWriteEventInput
): PmoOmniToolWriteEvent {
  const targetRefs = uniqueSortedStrings(input.targetRefs ?? []);
  const causationTargetRefs = uniqueSortedStrings(input.causation?.targetRefs ?? targetRefs);

  return {
    action: input.action,
    ...(input.actorId ? { actorId: input.actorId } : {}),
    artifactRefs: uniqueSortedStrings(input.artifactRefs ?? []),
    causation: {
      sourceTool: input.causation?.sourceTool ?? input.toolName,
      ...(input.causation?.sourceEventId ? { sourceEventId: input.causation.sourceEventId } : {}),
      sourceTraceId: input.causation?.sourceTraceId ?? input.traceId,
      sourceCorrelationId: input.causation?.sourceCorrelationId ?? input.correlationId,
      causedByEventIds: uniqueSortedStrings(input.causation?.causedByEventIds ?? []),
      targetRefs: causationTargetRefs
    },
    ...(input.contextAnchor ? { contextAnchor: { ...input.contextAnchor } } : {}),
    correlationId: input.correlationId,
    eventId:
      input.eventId ??
      `event://pmo-omni-tool-write/${sanitizedPointerSegment(input.toolName)}/${sanitizedPointerSegment(input.idempotencyKey)}`,
    eventKind: "pmo_omni_tool_write",
    eventType: input.eventType ?? `${input.toolName}.${input.action}`,
    evidenceRefs: uniqueSortedStrings(input.evidenceRefs ?? []),
    idempotencyKey: input.idempotencyKey,
    managedRefs: uniqueSortedStrings(input.managedRefs ?? []),
    ...(input.payloadDigest ? { payloadDigest: input.payloadDigest } : {}),
    portfolioId: input.portfolioId,
    recordedAt: input.recordedAt,
    schemaVersion: "1",
    targetRefs,
    toolName: input.toolName,
    traceId: input.traceId,
    writeStatus: input.writeStatus ?? "accepted"
  };
}

export function isPmoOmniToolWriteEvent(event: ProgramEvent): event is PmoOmniToolWriteEvent {
  return event.schemaVersion === "1" && event.eventKind === "pmo_omni_tool_write";
}

function uniqueSortedStrings(values: string[]): string[] {
  return [...new Set(values)].filter((value) => value.length > 0).sort((left, right) => left.localeCompare(right));
}

function sanitizedPointerSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "event";
}
