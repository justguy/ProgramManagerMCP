import { readFile } from "node:fs/promises";

import {
  AdapterRegistry,
  HoplonAdapterStub,
  TrackerAdapterStub
} from "../src/adapters/program-adapter-registry.ts";
import { InMemoryProgramManagerRepository } from "../src/repository/in-memory-program-manager-repository.ts";
import { ProgramManagerMcpGateway } from "../src/mcp/program-manager-mcp-gateway.ts";
import { ProgramToolService } from "../src/service/program-tool-service.ts";
import { getBackboneRepositoryFixture } from "../src/fixtures/golden-fixture-backbone.js";

export const DEFAULT_NOW = "2026-05-03T12:00:00Z";

export const BASE_ACTOR = {
  actorId: "actor://operators/portfolio-reader",
  actorRole: "human_operator",
  tenantId: "tenant://default",
  portfolioGrants: ["portfolio://default"],
  programGrants: ["program://agentic-os"],
  projectGrants: [
    "project://guardrail",
    "project://hoplon",
    "project://phalanx",
    "project://program-manager-mcp",
    "project://semantix"
  ],
  authnMethod: "oidc_jwt",
  authnIssuer: "issuer://control-plane",
  authenticatedAt: "2026-05-03T11:00:00Z",
  expiresAt: "2026-05-03T13:00:00Z"
};

export function buildActor(overrides = {}) {
  return {
    ...BASE_ACTOR,
    ...overrides
  };
}

export function buildGateway(now = DEFAULT_NOW, repository = InMemoryProgramManagerRepository.fromFixture(getBackboneRepositoryFixture())) {
  const adapterRegistry = new AdapterRegistry([new HoplonAdapterStub(), new TrackerAdapterStub()]);
  const service = new ProgramToolService({
    repository,
    adapterRegistry,
    now: () => now
  });

  return {
    gateway: new ProgramManagerMcpGateway(service),
    registry: adapterRegistry,
    repository
  };
}

export async function loadFixtureJSON(relativePath) {
  const raw = await readFile(new URL(relativePath, import.meta.url), "utf8");
  return JSON.parse(raw);
}

export async function runChecks(checks) {
  let passed = 0;
  let failed = 0;

  for (const [name, check] of checks) {
    try {
      await check();
      passed += 1;
      console.log(`PASS ${name}`);
    } catch (error) {
      failed += 1;
      if (error instanceof Error) {
        console.error(`FAIL ${name}: ${error.message}`);
      } else {
        console.error(`FAIL ${name}: check threw`);
      }
    }
  }

  return { passed, failed };
}
