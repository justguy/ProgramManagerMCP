import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

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
