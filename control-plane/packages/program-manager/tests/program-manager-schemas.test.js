import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  adapterContractFixturesDocumentSchema,
  assessProgramImpactResultSchema,
  goldenFixtureBackboneSchema,
  schemaExamplesDocumentSchema,
  toolContractsDocumentSchema
} from "../../../../shared/schemas/program-manager.ts";
import { generateJsonSchemas } from "../../../../shared/schemas/generate-json-schema.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../../..");

async function readJson(relativePath) {
  const raw = await readFile(path.join(repoRoot, relativePath), "utf8");
  return JSON.parse(raw);
}

test("parses Phase 0 schema examples", async () => {
  const document = await readJson("docs/phase-0/fixtures/schema-examples.example.json");
  assert.deepEqual(schemaExamplesDocumentSchema.parse(document), document);
});

test("parses golden fixture backbone", async () => {
  const document = await readJson("docs/phase-0/fixtures/golden-fixture-backbone.example.json");
  assert.deepEqual(goldenFixtureBackboneSchema.parse(document), document);
});

test("parses public tool contracts and envelope examples", async () => {
  const document = await readJson("docs/phase-0/fixtures/tool-contracts.example.json");
  assert.deepEqual(toolContractsDocumentSchema.parse(document), document);
});

test("parses adapter contract fixtures", async () => {
  const document = await readJson("docs/phase-0/fixtures/adapter-contract-fixtures.example.json");
  assert.deepEqual(adapterContractFixturesDocumentSchema.parse(document), document);
});

test("tool envelopes keep evidence and artifacts pointer-only", () => {
  const invalid = {
    schemaVersion: "1",
    status: "warning",
    toolName: "assess_program_impact",
    deterministicCore: {
      changeRef: "change://program-manager-mcp/c0-hoplon-authz-contract-update",
      affectedRefs: [],
      findings: [],
      requiredApprovals: [],
      evidenceObligations: []
    },
    evidenceRefs: ["artifact://pmo/alignment-report/2026-05-03@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
    artifactRefs: [],
    redactionSummary: {
      redacted: true,
      omittedKinds: [],
      policyRefs: ["policy://redaction/pointer-only-v1"]
    },
    warnings: [],
    traceId: "trace",
    correlationId: "corr",
    logBody: "inline raw output is forbidden"
  };

  assert.throws(() => assessProgramImpactResultSchema.parse(invalid), /Unrecognized key/);
});

test("generated JSON Schema snapshots are deterministic", async () => {
  const generated = generateJsonSchemas();

  for (const [fileName, schema] of Object.entries(generated)) {
    const snapshot = await readJson(`shared/schemas/generated/${fileName}`);
    assert.deepEqual(schema, snapshot, `snapshot mismatch for ${fileName}`);
  }
});
