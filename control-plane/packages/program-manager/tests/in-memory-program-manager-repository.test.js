import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("InMemoryProgramManagerRepository exposes fixture-based read query methods", () => {
  const source = readFileSync(
    join(process.cwd(), "src/repository/in-memory-program-manager-repository.ts"),
    "utf8"
  );

  assert.match(source, /class InMemoryProgramManagerRepository implements ProgramManagerRepository/);
  assert.match(source, /static fromFixture/);
  assert.match(source, /async listPrograms/);
  assert.match(source, /async listProjects/);
  assert.match(source, /async getProgramContext/);
  assert.match(source, /async assessImpact/);
  assert.match(source, /async listRelationships/);
  assert.match(source, /async listEvidenceRefs/);
  assert.match(source, /async listArtifactRefs/);
  assert.match(source, /async listDecisions/);
  assert.match(source, /async listMacroFacts/);
  assert.match(source, /async getMacroRegistry/);
  assert.match(source, /async upsertMacroRegistry/);
  assert.match(source, /async appendEvent/);
  assert.match(source, /async getEventByIdempotencyKey/);
  assert.match(source, /async listEventsByCausation/);
  assert.match(source, /async listEvents/);
  assert.match(source, /async getSyncCursors/);
});
