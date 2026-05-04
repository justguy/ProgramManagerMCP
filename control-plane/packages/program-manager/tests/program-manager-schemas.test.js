import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  adapterContractFixturesDocumentSchema,
  assessProgramImpactResultSchema,
  goldenFixtureBackboneSchema,
  pmoBlockerSchema,
  pmoMacroFixtureUniverseDocumentSchema,
  pmoMacroObjectModelDocumentSchema,
  pmoMacroResultSchema,
  pmoMacroToolContractsDocumentSchema,
  pmoTaskSchema,
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

test("parses Phase 5 pmo_macro object model and tool contract fixtures", async () => {
  const objectModel = await readJson("docs/phase-5/fixtures/pmo-macro-object-model.example.json");
  const toolContracts = await readJson("docs/phase-5/fixtures/pmo-macro-tool-contracts.example.json");

  assert.deepEqual(pmoMacroObjectModelDocumentSchema.parse(objectModel), objectModel);
  assert.deepEqual(pmoMacroToolContractsDocumentSchema.parse(toolContracts), toolContracts);
});

test("parses Phase 5 macro fixture universe with exact golden scenario cores", async () => {
  const document = await readJson("docs/phase-5/fixtures/pmo-macro-fixture-universe.example.json");
  const parsed = pmoMacroFixtureUniverseDocumentSchema.parse(document);

  assert.deepEqual(parsed, document);
  assert.deepEqual(
    parsed.goldenScenarios.map((scenario) => scenario.scenarioId),
    [
      "macro-analyze-blockers",
      "macro-catch-me-up",
      "macro-detect-drift",
      "macro-simulate-impact"
    ]
  );

  for (const scenario of parsed.goldenScenarios) {
    assert.equal(scenario.result.stateVersionHash, scenario.expectedStateVersionHash);
    assert.deepEqual(scenario.result.artifactRefs, scenario.expectedArtifactRefs);
    assert.deepEqual(scenario.result.evidenceRefs, scenario.expectedEvidenceRefs);
    assert.equal(scenario.result.toolName, "pmo_macro");
    assert.equal(scenario.result.deterministicCore?.action, "invoke");
  }
});

test("rejects invalid Phase 5 macro object and envelope examples", async () => {
  const document = await readJson("docs/phase-5/fixtures/pmo-macro-invalid-objects.example.json");
  const schemaByName = {
    pmoBlocker: pmoBlockerSchema,
    pmoMacroResult: pmoMacroResultSchema,
    pmoTask: pmoTaskSchema
  };

  for (const invalidObject of document.invalidObjects) {
    const schema = schemaByName[invalidObject.schema];
    assert.ok(schema, `unknown invalid fixture schema ${invalidObject.schema}`);
    assert.throws(
      () => schema.parse(invalidObject.value),
      undefined,
      `expected invalid fixture to fail: ${invalidObject.caseId}`
    );
  }
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
