import test from "node:test";
import assert from "node:assert/strict";

import { pmoOmniToolWriteEventSchema } from "../../../../shared/schemas/program-manager.ts";
import { buildPmoOmniToolWriteEvent } from "../src/events/program-events.ts";
import { InMemoryProgramManagerRepository } from "../src/repository/in-memory-program-manager-repository.ts";

const HASH_A = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const HASH_B = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

test("buildPmoOmniToolWriteEvent creates a typed, sorted omni-tool write event", () => {
  const event = buildPmoOmniToolWriteEvent({
    action: "upsert",
    artifactRefs: ["artifact://pmo/write-b", "artifact://pmo/write-a"],
    causation: {
      causedByEventIds: ["event://pmo/source-b", "event://pmo/source-a"],
      sourceEventId: "event://pmo/source-a",
      sourceTool: "pmo_macro"
    },
    contextAnchor: {
      portfolioId: "portfolio://default",
      programId: "program://agentic-os"
    },
    correlationId: "corr://pmo-omni-009/create",
    evidenceRefs: ["evidence://pmo/write-b", "evidence://pmo/write-a"],
    idempotencyKey: HASH_A,
    managedRefs: ["project://semantix", "project://hoplon"],
    portfolioId: "portfolio://default",
    recordedAt: "2026-05-03T12:00:00Z",
    targetRefs: ["project://semantix", "project://hoplon"],
    toolName: "manage_projects",
    traceId: "trace://pmo-omni-009"
  });

  assert.equal(event.schemaVersion, "1");
  assert.equal(event.eventKind, "pmo_omni_tool_write");
  assert.equal(event.eventType, "manage_projects.upsert");
  assert.equal(event.writeStatus, "accepted");
  assert.deepEqual(event.evidenceRefs, ["evidence://pmo/write-a", "evidence://pmo/write-b"]);
  assert.deepEqual(event.managedRefs, ["project://hoplon", "project://semantix"]);
  assert.deepEqual(event.causation.causedByEventIds, ["event://pmo/source-a", "event://pmo/source-b"]);
  assert.deepEqual(pmoOmniToolWriteEventSchema.parse(event), event);
});

test("InMemoryProgramManagerRepository stores write events idempotently by idempotencyKey", async () => {
  const repository = new InMemoryProgramManagerRepository();
  const first = buildPmoOmniToolWriteEvent({
    action: "upsert",
    correlationId: "corr://pmo-omni-009/idempotency/first",
    idempotencyKey: HASH_A,
    managedRefs: ["project://program-manager-mcp"],
    portfolioId: "portfolio://default",
    recordedAt: "2026-05-03T12:00:00Z",
    targetRefs: ["project://program-manager-mcp"],
    toolName: "manage_projects",
    traceId: "trace://pmo-omni-009"
  });
  const retry = buildPmoOmniToolWriteEvent({
    action: "upsert",
    correlationId: "corr://pmo-omni-009/idempotency/retry",
    eventId: "event://pmo-omni-tool-write/retry/should-not-store",
    idempotencyKey: HASH_A,
    managedRefs: ["project://program-manager-mcp"],
    portfolioId: "portfolio://default",
    recordedAt: "2026-05-03T12:01:00Z",
    targetRefs: ["project://program-manager-mcp"],
    toolName: "manage_projects",
    traceId: "trace://pmo-omni-009"
  });

  assert.equal((await repository.appendEvent(first)).eventId, first.eventId);
  assert.equal((await repository.appendEvent(retry)).eventId, first.eventId);

  const storedEvents = await repository.listEvents({ portfolioId: "portfolio://default" });
  assert.equal(storedEvents.length, 1);
  assert.equal(storedEvents[0].eventId, first.eventId);
  assert.equal(
    (await repository.getEventByIdempotencyKey({ portfolioId: "portfolio://default" }, HASH_A))?.eventId,
    first.eventId
  );
});

test("InMemoryProgramManagerRepository retrieves events by causation source event", async () => {
  const repository = new InMemoryProgramManagerRepository();
  const sourceEventId = "event://pmo-omni-tool-write/source";
  const caused = buildPmoOmniToolWriteEvent({
    action: "add_project",
    causation: {
      causedByEventIds: [sourceEventId],
      sourceEventId,
      sourceTool: "manage_integrations"
    },
    correlationId: "corr://pmo-omni-009/caused",
    idempotencyKey: HASH_B,
    managedRefs: ["integration://agentic-os/shared-flow"],
    portfolioId: "portfolio://default",
    recordedAt: "2026-05-03T12:02:00Z",
    targetRefs: ["integration://agentic-os/shared-flow"],
    toolName: "manage_integrations",
    traceId: "trace://pmo-omni-009"
  });

  await repository.appendEvent(caused);

  const events = await repository.listEventsByCausation({
    scope: { portfolioId: "portfolio://default" },
    causedByEventId: sourceEventId
  });

  assert.deepEqual(events.map((event) => event.eventId), [caused.eventId]);
  assert.deepEqual(events[0].causation?.targetRefs, ["integration://agentic-os/shared-flow"]);
});
