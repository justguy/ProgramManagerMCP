import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  AdapterRegistry,
  HoplonAdapterStub,
  TrackerAdapterStub
} from "../src/adapters/program-adapter-registry.ts";

const repoRoot = path.resolve(process.cwd(), "..", "..", "..");

async function readFixture() {
  const raw = await readFile(
    path.join(repoRoot, "docs/phase-0/fixtures/adapter-contract-fixtures.example.json"),
    "utf8"
  );
  return JSON.parse(raw);
}

test("adapter manifest registry includes both LLM Tracker and Hoplon stubs", async () => {
  const fixture = await readFixture();
  const registry = new AdapterRegistry([new HoplonAdapterStub(), new TrackerAdapterStub()]);
  const manifests = registry.listManifests();
  const fixtureManifestIds = fixture.adapterManifests.map((item) => item.adapterId).sort();
  const manifestIds = manifests.map((item) => item.adapterId).sort();

  assert.deepEqual(manifestIds, fixtureManifestIds);
  await registry.assertNoMutationAuthority();

  for (const manifest of manifests) {
    assert.equal(manifest.phase1aEnabled, true);
    assert.equal(manifest.methods.reconcileState, false);
  }

  const hoplon = manifests.find((manifest) => manifest.adapterId === "hoplon-local");
  const tracker = manifests.find((manifest) => manifest.adapterId === "tracker-local");

  assert.ok(hoplon);
  assert.ok(tracker);
  assert.equal(hoplon?.sideEffectPosture, "mutation_capable_not_exposed");
  assert.equal(tracker?.sideEffectPosture, "read_only");
});

test("PMO capability listing surfaces adapter manifests", async () => {
  const registry = new AdapterRegistry([new HoplonAdapterStub(), new TrackerAdapterStub()]);
  const capabilities = await registry.listCapabilities();
  const impact = capabilities.find(
    (capability) => capability.capabilityId === "capability://program-manager/impact-analysis"
  );

  assert.ok(impact);
  assert.equal(impact.sideEffectPosture, "read_only");
  assert.deepEqual(impact.adapterIds, ["hoplon-local", "tracker-local"]);
  assert.equal(impact.status, "available");
  assert.ok(impact.domains.includes("tracker_board"));
  assert.ok(impact.domains.includes("contract_context"));
  assert.deepEqual(impact.evidencePolicyRefs, [
    "policy://active-adapters/hoplon-authz-tier1",
    "policy://evidence/tracker-snapshot-fast-expiry"
  ]);

  const impactForTrackerDomain = await registry.listCapabilities("tracker_board");
  assert.equal(impactForTrackerDomain.length, 1);
  assert.deepEqual(impactForTrackerDomain[0].domains, ["tracker_board"]);

  const noMatch = await registry.listCapabilities("nonexistent-domain");
  assert.equal(noMatch.length, 0);
});
