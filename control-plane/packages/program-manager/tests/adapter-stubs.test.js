import test from "node:test";
import assert from "node:assert/strict";
import {
  HoplonAdapterStub,
  TrackerAdapterStub
} from "../src/adapters/program-adapter-registry.ts";

const hoplon = new HoplonAdapterStub();
const tracker = new TrackerAdapterStub();

test("LLM Tracker and Hoplon stubs provide bounded read and cursor/health behavior", async () => {
  const trackerRead = await tracker.readState({
    requestId: "stale-tracker-read",
    portfolioId: "portfolio://default",
    targetRefs: [
      "tracker://program-manager-mcp/PMO-001",
      "tracker://program-manager-mcp/PMO-002",
      "project://program-manager-mcp"
    ],
    limit: 1
  });

  assert.equal(trackerRead.sourceCursor, "rev:12");
  assert.equal(trackerRead.observations.length, 1);
  assert.equal(trackerRead.truncated, true);
  assert.equal(trackerRead.omittedRefCount, 2);
  assert.ok(trackerRead.omittedRefs.includes("project://program-manager-mcp"));
  assert.ok(trackerRead.omittedRefs.includes("tracker://program-manager-mcp/PMO-002"));
  assert.equal(trackerRead.redactionSummary.redacted, true);

  const trackerEvidence = await tracker.produceEvidenceRefs(trackerRead);
  assert.deepEqual(trackerEvidence, ["tracker://program-manager-mcp/PMO-001"]);

  const hoplonRead = await hoplon.readState({
    requestId: "hoplon-read",
    portfolioId: "portfolio://default",
    targetRefs: [
      "contract://hoplon-authz/escalation-grant@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      "project://program-manager-mcp",
      "project://phalanx",
      "integration://hoplon/authz-gateway",
      "policy://active-adapters/hoplon-authz-tier1"
    ],
    limit: 2
  });

  assert.equal(hoplonRead.sourceCursor, "snapshot:s-2026-05-03");
  assert.equal(hoplonRead.observations.length, 2);
  assert.equal(hoplonRead.truncated, true);
  assert.equal(hoplonRead.omittedRefCount, 3);
  assert.equal(hoplonRead.redactionSummary.redacted, true);
});

test("stub assessImpact exposes deterministic findings without mutation authority", async () => {
  const hoplonImpact = await hoplon.assessImpact({
    requestId: "impact-request-hoplon-c0",
    portfolioId: "portfolio://default",
    changeKind: "contract_update",
    changeRef: "change://program-manager-mcp/c0-hoplon-authz-contract-update",
    targetRefs: [
      "contract://hoplon-authz/escalation-grant@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    ],
    traversalBudgetRef: "budget://phase-1a/default"
  });

  assert.equal(hoplonImpact.adapterId, "hoplon-local");
  assert.equal(hoplonImpact.status, "warning");
  assert.equal(hoplonImpact.requestId, "impact-request-hoplon-c0");
  assert.equal(hoplonImpact.sourceCursor, "snapshot:s-2026-05-03");
  assert.equal(hoplonImpact.findings.length, 1);
  assert.equal(hoplonImpact.findings[0].findingId, "finding-cross-project-hoplon-authz");
  assert.equal(hoplonImpact.redactionSummary.policyRefs[0], "policy://redaction/pointer-only-v1");

  const trackerImpact = await tracker.assessImpact({
    requestId: "impact-request-tracker-c0",
    portfolioId: "portfolio://default",
    changeKind: "evidence_freshness_check",
    changeRef: "change://program-manager-mcp/c0-hoplon-authz-contract-update",
    targetRefs: ["tracker://program-manager-mcp/PMO-001"],
    traversalBudgetRef: "budget://phase-1a/default"
  });

  assert.equal(trackerImpact.adapterId, "tracker-local");
  assert.equal(trackerImpact.status, "warning");
  assert.equal(trackerImpact.findings[0].findingId, "finding-stale-tracker-evidence");
  assert.equal(trackerImpact.redactionSummary.policyRefs[0], "policy://redaction/pointer-only-v1");
});

test("stub health reflects cursor age and includes cursor fields", async () => {
  const trackerHealthy = await tracker.getHealth(
    { portfolioId: "portfolio://default" },
    "2026-05-03T12:00:00Z"
  );
  assert.equal(trackerHealthy.status, "healthy");
  assert.equal(trackerHealthy.cursor, "rev:12");
  assert.equal(trackerHealthy.maxStaleCursorSeconds, 300);

  const trackerUnavailable = await tracker.getHealth(
    { portfolioId: "portfolio://default" },
    "2026-05-03T13:00:00Z"
  );
  assert.equal(trackerUnavailable.status, "unavailable");
  assert.ok(trackerUnavailable.reasons.length > 0);

  const hoplonHealthy = await hoplon.getHealth(
    { portfolioId: "portfolio://default" },
    "2026-05-03T12:00:00Z"
  );
  assert.equal(hoplonHealthy.status, "healthy");

  const hoplonCursor = await hoplon.getSourceCursor({ portfolioId: "portfolio://default" });
  assert.equal(hoplonCursor.cursor, "snapshot:s-2026-05-03");
  assert.equal(hoplonCursor.status, "current");

  const trackerCursor = await tracker.getSourceCursor({ portfolioId: "portfolio://default" });
  assert.equal(trackerCursor.cursor, "rev:12");
  assert.equal(trackerCursor.status, "current");
});
