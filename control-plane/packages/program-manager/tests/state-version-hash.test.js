import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

import {
  pmoMacroHashInputSchema
} from "../../../../shared/schemas/program-manager.ts";
import {
  canonicalizeForStateVersionHash,
  collectNondeterministicHashKeys,
  isSortedByField,
  stateVersionHashFromInput
} from "../src/hash/state-version-hash.js";
import { getGoldenFixture } from "../src/fixtures/golden-fixture-backbone.js";

async function readHashFixture() {
  const hashFixtureURL = new URL(
    "../../../../docs/phase-0/fixtures/state-version-hash-input.example.json",
    import.meta.url
  );
  const raw = await readFile(hashFixtureURL, "utf8");
  return JSON.parse(raw);
}

async function readMacroHashFixture() {
  const hashFixtureURL = new URL(
    "../../../../docs/phase-5/fixtures/pmo-macro-hash-input.example.json",
    import.meta.url
  );
  const raw = await readFile(hashFixtureURL, "utf8");
  return JSON.parse(raw);
}

test("state version hash fixture is deterministic across repeated runs", async () => {
  const goldenFixture = getGoldenFixture();
  const hashFixture = await readHashFixture();

  assert.equal(goldenFixture.H0.hashInputRef, "docs/phase-0/fixtures/state-version-hash-input.example.json");

  const firstHash = stateVersionHashFromInput(hashFixture.input);
  const secondHash = stateVersionHashFromInput(hashFixture.input);

  assert.equal(firstHash, secondHash, "hash should be stable across repeated computation");
  assert.equal(firstHash, goldenFixture.H0.expectedStateVersionHash, "fixture pinned hash must match");
});

test("state version hash input excludes non-deterministic fields and enforces stable ordering", async () => {
  const hashFixture = await readHashFixture();
  const input = hashFixture.input;

  assert.deepEqual(
    collectNondeterministicHashKeys(input),
    [],
    "hash input should not include model-assisted/raw artifacts/logs/raw timestamps"
  );

  const canonical = canonicalizeForStateVersionHash(input);

  assert.deepEqual(
    canonical,
    canonicalizeForStateVersionHash(canonical),
    "canonicalization should be deterministic"
  );

  const withAdvisoryNoise = {
    ...input,
    advisory: "model-assisted narrative excluded from hash",
    generatedAt: "2026-05-03T13:00:00Z",
    evidenceRefs: [
      {
        ...input.evidenceRefs[0],
        advisory: "evidence advisory omitted",
        logBody: "raw log body omitted",
        artifactContent: "opaque payload excluded",
        modelSummary: "ignored"
      },
      ...input.evidenceRefs.slice(1)
    ]
  };

  assert.equal(
    stateVersionHashFromInput(input),
    stateVersionHashFromInput(withAdvisoryNoise),
    "excluded fields must not affect hash input"
  );

  assert.ok(
    isSortedByField(hashFixture.input.evidenceRefs, "ref"),
    "evidence refs should be ordered lexicographically"
  );
  assert.ok(
    isSortedByField(hashFixture.input.dependencyRelationships, "dependencyId"),
    "dependency relationships should be ordered deterministically"
  );
  assert.ok(
    isSortedByField(hashFixture.input.ruleRegistry, "ruleId"),
    "rule registry should be ordered by ruleId"
  );
  assert.ok(
    isSortedByField(hashFixture.input.adapterManifests, "adapterId"),
    "adapter manifests should be ordered by adapterId"
  );
  assert.deepEqual(
    hashFixture.input.adapterCursors.map((cursor) => cursor.adapterId),
    ["tracker-local", "hoplon-local"],
    "adapter cursor ordering is explicit and stable"
  );
});

test("pmo_macro hash input is deterministic and excludes advisory identity noise", async () => {
  const hashFixture = await readMacroHashFixture();
  const input = pmoMacroHashInputSchema.parse(hashFixture.input);

  assert.deepEqual(
    collectNondeterministicHashKeys(input),
    [],
    "macro hash input should not contain advisory, raw payload, trace, or correlation fields"
  );

  assert.equal(stateVersionHashFromInput(input), hashFixture.expectedHash);
  assert.equal(stateVersionHashFromInput(input), stateVersionHashFromInput(input));

  const withExcludedNoise = {
    ...input,
    advisoryPane: {
      content: { summary: "model-assisted text is excluded" },
      excludedFromDeterministicHash: true,
      modelAssisted: true
    },
    correlationId: "corr-noise",
    generatedAt: "2026-05-04T05:30:00Z",
    rawLog: "raw logs must not enter deterministic hash material",
    traceId: "trace-noise"
  };

  assert.equal(
    stateVersionHashFromInput(input),
    stateVersionHashFromInput(withExcludedNoise),
    "advisory, trace, correlation, and raw fields must not affect pmo_macro hashes"
  );
});
