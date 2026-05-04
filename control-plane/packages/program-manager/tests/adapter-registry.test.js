import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  AdapterRegistry,
  HoplonAdapterStub,
  TrackerAdapterStub
} from "../src/adapters/program-adapter-registry.ts";

async function readFixture() {
  const fixturePath = new URL("../../../../docs/phase-0/fixtures/adapter-contract-fixtures.example.json", import.meta.url);
  const raw = await readFile(fixturePath, "utf8");
  return JSON.parse(raw);
}

function buildCircuitProbeAdapter() {
  let readStateFailureCount = 0;

  const manifest = {
    adapterId: "probe-circuit",
    adapterVersion: "1.0.0",
    authScopes: ["portfolio:default:read"],
    capabilityDomains: ["code_context"],
    displayName: "Probe Circuit Adapter",
    evidenceTypes: ["probe_snapshot"],
    healthModel: {
      circuitOpenAfterFailures: 2,
      circuitOpenSeconds: 60,
      statuses: ["circuit_open", "degraded", "healthy", "unavailable"]
    },
    maxStaleCursorSeconds: 300,
    methods: {
      assessImpact: true,
      describeCapabilities: true,
      getHealth: true,
      getObservationSchema: true,
      getSourceCursor: true,
      produceEvidenceRefs: true,
      readState: true,
      reconcileState: false
    },
    phase1aEnabled: true,
    redactionPolicyRefs: ["policy://redaction/pointer-only-v1"],
    sideEffectPosture: "read_only",
    supportedProjects: ["project://default"]
  };

  return {
    manifest,
    describeCapabilities: async () => manifest,
    getObservationSchema: async () => ({
      schemaVersion: "1",
      domain: "probe",
      observationType: "test"
    }),
    readState: async () => {
      readStateFailureCount += 1;
      if (readStateFailureCount <= 2) {
        throw new Error(`Transient read failure #${readStateFailureCount}`);
      }

      return {
        adapterId: "probe-circuit",
        sourceCursor: "cursor://probe-circuit/current",
        observedAt: "2026-05-03T12:00:00Z",
        observations: [],
        artifactRefs: [],
        evidenceRefs: [],
        truncated: false,
        omittedRefCount: 0,
        omittedRefs: [],
        redactionSummary: {
          redacted: false,
          omittedKinds: [],
          policyRefs: ["policy://redaction/pointer-only-v1"]
        }
      };
    },
    assessImpact: async () => ({
      adapterId: "probe-circuit",
      status: "ok",
      sourceCursor: "cursor://probe-circuit/current",
      affectedRefs: [],
      findings: [],
      evidenceRefs: [],
      artifactRefs: [],
      redactionSummary: {
        redacted: false,
        omittedKinds: [],
        policyRefs: ["policy://redaction/pointer-only-v1"]
      },
      requestId: "probe"
    }),
    produceEvidenceRefs: async (input) =>
      [...input.evidenceRefs],
    getSourceCursor: async () => ({
      adapterId: "probe-circuit",
      portfolioId: "portfolio://default",
      cursor: "cursor://probe-circuit/current",
      observedAt: "2026-05-03T12:00:00Z",
      sourceRevisionHash: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      status: "current"
    }),
    getHealth: async () => ({
      adapterId: "probe-circuit",
      status: "healthy",
      reasons: [],
      cursor: "cursor://probe-circuit/current",
      observedAt: "2026-05-03T12:00:00Z",
      checkedAt: "2026-05-03T12:00:00Z",
      maxStaleCursorSeconds: 300
    })
  };
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

test("read failures open and recover the adapter circuit after backoff", async () => {
  const probe = buildCircuitProbeAdapter();
  const registry = new AdapterRegistry([probe]);
  const scope = { portfolioId: "portfolio://default" };
  const request = {
    requestId: "circuit-probe-request",
    portfolioId: "portfolio://default",
    targetRefs: ["probe://target-1"],
    limit: 10
  };

  await assert.rejects(() => registry.readState("probe-circuit", request, "2026-05-03T12:00:00Z"));
  await assert.rejects(() => registry.readState("probe-circuit", request, "2026-05-03T12:00:00Z"));
  await assert.rejects(() => registry.readState("probe-circuit", request, "2026-05-03T12:00:00Z"));
  const openHealth = await registry.getHealth("probe-circuit", scope, "2026-05-03T12:00:00Z");
  assert.equal(openHealth.status, "circuit_open");
  assert.ok(openHealth.reasons.some((reason) => reason.includes("circuit open")));

  const recovered = await registry.readState("probe-circuit", request, "2026-05-03T12:02:00Z");
  assert.equal(recovered.sourceCursor, "cursor://probe-circuit/current");

  const healthyAfterRecovery = await registry.getHealth(
    "probe-circuit",
    scope,
    "2026-05-03T12:02:00Z"
  );
  assert.equal(healthyAfterRecovery.status, "healthy");
});

test("PMO capability listing surfaces adapter manifests", async () => {
  const registry = new AdapterRegistry([new HoplonAdapterStub(), new TrackerAdapterStub()]);
  const capabilities = await registry.listCapabilities();
  const impact = capabilities.find(
    (capability) => capability.capabilityId === "capability://program-manager/impact-analysis"
  );
  const flightPlan = capabilities.find(
    (capability) => capability.capabilityId === "capability://program-manager/flight-plan-planning"
  );
  const receiptLedger = capabilities.find(
    (capability) => capability.capabilityId === "capability://program-manager/receipt-ledger"
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
  assert.ok(flightPlan);
  assert.equal(flightPlan.phase, "2");
  assert.equal(flightPlan.sideEffectPosture, "describes_actions_only");
  assert.deepEqual(flightPlan.toolNames, ["plan_program_action"]);
  assert.ok(receiptLedger);
  assert.equal(receiptLedger.phase, "3");
  assert.equal(receiptLedger.sideEffectPosture, "pmo_internal_write");
  assert.deepEqual(receiptLedger.toolNames, ["record_program_receipt", "reconcile_program_state"]);

  const capabilitiesForTrackerDomain = await registry.listCapabilities("tracker_board");
  assert.equal(capabilitiesForTrackerDomain.length, 3);
  assert.ok(
    capabilitiesForTrackerDomain.every((capability) =>
      capability.domains.includes("tracker_board")
    )
  );

  const noMatch = await registry.listCapabilities("nonexistent-domain");
  assert.equal(noMatch.length, 0);
});
