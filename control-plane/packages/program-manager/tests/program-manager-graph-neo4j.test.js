import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { getBackboneRepositoryFixture } from "../src/fixtures/golden-fixture-backbone.js";
import { traversalBudgetDefaults } from "../src/seed/traversal-budgets.js";
import { loadGraphModules } from "./load-graph-modules.js";

test("Neo4j migration files define PMO constraints and dependency indexes", () => {
  const migrationsDir = join(process.cwd(), "migrations/neo4j");
  const files = readdirSync(migrationsDir).sort();

  assert.deepEqual(files, [
    "V001__program_manager_constraints.cypher",
    "V002__program_manager_indexes.cypher"
  ]);

  const constraints = readFileSync(join(migrationsDir, files[0]), "utf8");
  const indexes = readFileSync(join(migrationsDir, files[1]), "utf8");

  assert.match(constraints, /CREATE CONSTRAINT pm_program_ref IF NOT EXISTS/);
  assert.match(constraints, /CREATE CONSTRAINT pm_generic_ref IF NOT EXISTS/);
  assert.match(indexes, /CREATE INDEX pm_depends_on_dependency_id IF NOT EXISTS/);
  assert.match(indexes, /CREATE INDEX pm_requires_approval_dependency_id IF NOT EXISTS/);
  assert.match(indexes, /CREATE INDEX pm_requires_evidence_dependency_id IF NOT EXISTS/);
});

test("Neo4j graph store issues typed dependency writes and ordered read queries", async () => {
  const { neo4jModule } = await loadGraphModules();
  const { Neo4jProgramManagerGraphStore } = neo4jModule;

  const reads = [];
  const writes = [];
  const driver = {
    session() {
      return {
        async executeRead(work) {
          return work({
            async run(cypher, params) {
              reads.push({ cypher, params });
              return { records: [] };
            }
          });
        },
        async executeWrite(work) {
          return work({
            async run(cypher, params) {
              writes.push({ cypher, params });
              return { records: [] };
            }
          });
        },
        async close() {}
      };
    }
  };

  const store = new Neo4jProgramManagerGraphStore(driver);
  await store.upsertRelationship({
    dependencyId: "dep-typed",
    portfolioId: "portfolio://default",
    programId: "program://control-plane",
    projectId: "project://phalanx",
    fromRef: "project://phalanx",
    toRef: "contract://hoplon/authz@sha256:cccc",
    dependencyType: "REQUIRES_APPROVAL",
    criticality: "tier_1",
    status: "active",
    recordedAt: "2026-05-03T12:00:00Z",
    validFrom: "2026-05-03T12:00:00Z",
    evidenceRefs: [],
    sourceAdapterId: "hoplon-local",
    sourceCursor: "snapshot:s-2026-05-03"
  });
  await store.listRelationships({
    portfolioId: "portfolio://default",
    programId: "program://control-plane"
  });

  assert.match(writes[1].cypher, /MERGE \(fromRef\)-\[dependency:REQUIRES_APPROVAL/);
  assert.match(reads[0].cypher, /ORDER BY dependency.recordedAt, dependency.dependencyId, fromRef.ref, toRef.ref/);
});

test(
  "live Neo4j integration hook is available behind PMO_NEO4J_URI",
  {
    skip: !process.env.PMO_NEO4J_URI
  },
  async (t) => {
    let neo4j;
    try {
      neo4j = await import("neo4j-driver");
    } catch {
      t.skip("neo4j-driver is not installed in this workspace");
      return;
    }

    const { repositoryModule, neo4jModule } = await loadGraphModules();
    const { ProgramManagerGraphRepository } = repositoryModule;
    const { Neo4jProgramManagerGraphStore } = neo4jModule;
    const driver = neo4j.default.driver(
      process.env.PMO_NEO4J_URI,
      neo4j.default.auth.basic(
        process.env.PMO_NEO4J_USERNAME ?? "neo4j",
        process.env.PMO_NEO4J_PASSWORD ?? "neo4j"
      )
    );

    t.after(async () => {
      await driver.close();
    });

    const session = driver.session();
    t.after(async () => {
      await session.close();
    });

    const migrationsDir = join(process.cwd(), "migrations/neo4j");
    for (const file of readdirSync(migrationsDir).sort()) {
      const statements = readFileSync(join(migrationsDir, file), "utf8")
        .split(";")
        .map((statement) => statement.trim())
        .filter(Boolean);
      for (const statement of statements) {
        await session.run(statement);
      }
    }

    const repository = new ProgramManagerGraphRepository(
      new Neo4jProgramManagerGraphStore(driver)
    );
    await repository.seed(getBackboneRepositoryFixture());

    const scope = {
      portfolioId: "portfolio://default",
      programId: "program://agentic-os"
    };

    const programs = await repository.listPrograms(scope);
    assert.deepEqual(
      programs.map((program) => program.programId),
      ["program://agentic-os"]
    );

    const projects = await repository.listProjects(scope);
    assert.deepEqual(
      projects.map((project) => project.projectId),
      [
        "project://guardrail",
        "project://hoplon",
        "project://phalanx",
        "project://program-manager-mcp",
        "project://semantix"
      ]
    );

    const relationships = await repository.listRelationships(scope);
    assert.deepEqual(
      relationships.map((relationship) => relationship.dependencyId),
      [
        "dep-guardrail-runtime-controls",
        "dep-hoplon-authz",
        "dep-semantix-readiness",
        "dep-tracker-evidence-freshness"
      ]
    );

    const impact = await repository.assessImpact({
      scope,
      changeRef: "project://program-manager-mcp",
      changeKind: "contract_update",
      targetRefs: [
        "tracker://program-manager-mcp/PMO-001",
        "contract://guardrail/runtime-controls@sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      ],
      traversalBudgetRef: traversalBudgetDefaults.phase1a
    });
    assert.deepEqual(
      impact.findings.map((finding) => finding.findingId),
      [
        "dep-guardrail-runtime-controls",
        "dep-tracker-evidence-freshness"
      ]
    );
  }
);
