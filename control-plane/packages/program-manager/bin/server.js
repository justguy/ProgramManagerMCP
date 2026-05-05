#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import readline from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  AdapterRegistry,
  HoplonAdapterStub,
  TrackerAdapterStub
} from "../src/adapters/program-adapter-registry.ts";
import { ProgramManagerMcpGateway } from "../src/mcp/program-manager-mcp-gateway.ts";
import { InMemoryProgramManagerRepository } from "../src/repository/in-memory-program-manager-repository.ts";
import { ProgramToolService } from "../src/service/program-tool-service.ts";

const SERVER_INFO = {
  name: "program-manager",
  version: "0.1.0"
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PACKAGE_ROOT = resolve(__dirname, "..");
const SHARED_STATE_SOURCE_REF = "artifact://program-manager/state/source/shared-pmo-knowledge";
const SHARED_BACKEND_PREFIX = "artifact://program-manager/state/backend/shared-pmo-knowledge";
const SHARED_UNAVAILABLE_BACKEND_PREFIX = "artifact://program-manager/state/backend/shared-pmo-knowledge-unavailable";
const STATE_REVISION_PREFIX = "artifact://program-manager/state/revision";
const DEFAULT_NEO4J_SYSTEM_REF = "system://program-manager/shared-knowledge";
const RUNTIME_GRAPH_SOURCE_FILES = [
  "src/types/domain.ts",
  "src/normalization/program-manager-normalization.ts",
  "src/repository/program-manager-repository.ts",
  "src/repository/program-manager-graph-store.ts",
  "src/repository/program-manager-graph-repository.ts",
  "src/repository/program-manager-neo4j-store.ts"
];
const ALLOWED_ACTOR_ROLES = new Set([
  "human_operator",
  "program_manager_agent",
  "execution_agent",
  "c_suite_agent",
  "service_adapter"
]);
const DEFAULT_PORTFOLIO_GRANTS = ["portfolio://default"];
const DEFAULT_PROGRAM_GRANTS = ["program://agentic-os"];

const MANAGE_PROJECT_ACTIONS = [
  "help",
  "list",
  "get",
  "create",
  "upsert",
  "update",
  "rename",
  "retire",
  "add_project",
  "remove_project",
  "set_project_role",
  "link_tracker",
  "link_repo",
  "link_adapter",
  "record_goal"
];

const MANAGE_INTEGRATION_ACTIONS = [
  "help",
  "list",
  "get",
  "create",
  "upsert",
  "update",
  "rename",
  "retire",
  "delete",
  "add_project",
  "remove_project",
  "add_artifact",
  "record_goal",
  "acknowledge_goal",
  "submit_gap_report",
  "update_gap",
  "record_blocker",
  "update_blocker",
  "assign_blocker_owner",
  "mark_blocker_unblocked",
  "mark_blocker_resolved",
  "reopen_blocker",
  "identify_blockers",
  "request_decision",
  "record_decision",
  "submit_project_response",
  "record_conflict",
  "record_learning",
  "link_tracker_ref",
  "inbox",
  "catch_up",
  "supersede"
];

const MANAGE_EVIDENCE_ACTIONS = [
  "help",
  "list",
  "get",
  "register",
  "update",
  "rename",
  "retire",
  "add_artifact",
  "link_evidence",
  "classify",
  "set_retention",
  "attach_to_integration",
  "attach_to_decision",
  "attach_to_learning"
];

const PMO_MACRO_INPUT_SCHEMA = {
  type: "object",
  properties: {
    portfolioId: { type: "string" },
    programId: { type: "string" },
    projectIds: { type: "array", items: { type: "string" } },
    traceId: { type: "string" },
    correlationId: { type: "string" },
    action: {
      type: "string",
      enum: ["help", "list", "describe", "validate", "invoke", "edit_registry"]
    },
    macroId: { type: "string" },
    macroName: { type: "string" },
    input: { type: "object" },
    macroInput: { type: "object" },
    registryPatchRef: { type: "string" }
  },
  required: ["portfolioId", "traceId", "correlationId", "action"],
  additionalProperties: true
};

const PMO_HELP_INPUT_SCHEMA = {
  type: "object",
  properties: {
    portfolioId: { type: "string" },
    programId: { type: "string" },
    projectIds: { type: "array", items: { type: "string" } },
    traceId: { type: "string" },
    correlationId: { type: "string" }
  },
  required: ["traceId", "correlationId"],
  additionalProperties: true
};

const MANAGE_PROJECTS_INPUT_SCHEMA = {
  type: "object",
  properties: {
    portfolioId: { type: "string" },
    programId: { type: "string" },
    projectIds: { type: "array", items: { type: "string" } },
    traceId: { type: "string" },
    correlationId: { type: "string" },
    action: { type: "string", enum: MANAGE_PROJECT_ACTIONS },
    program: {
      type: "object",
      properties: {
        programId: { type: "string" },
        name: { type: "string" },
        goal: { type: "string" },
        repoRef: { type: "string" },
        trackerRef: { type: "string" },
        adapterRef: { type: "string" },
        status: { type: "string", enum: ["active", "retired"] }
      }
    },
    project: {
      type: "object",
      properties: {
        programId: { type: "string" },
        projectId: { type: "string" },
        name: { type: "string" },
        goal: { type: "string" },
        projectRole: { type: "string" },
        repoRef: { type: "string" },
        trackerRef: { type: "string" },
        adapterRef: { type: "string" },
        status: { type: "string", enum: ["active", "retired"] }
      }
    },
    evidenceRefs: { type: "array", items: { type: "string" } }
  },
  required: ["portfolioId", "traceId", "correlationId", "action"],
  additionalProperties: true
};

const MANAGE_INTEGRATIONS_INPUT_SCHEMA = {
  type: "object",
  description:
    "Manage PMO integration lifecycle and optional coordination value. Minimum schema fields prove registration; contracts, dependencies, blockers, gaps, decisions, learnings, tracker refs, and validation evidence are optional pointer-only value context.",
  properties: {
    portfolioId: { type: "string" },
    programId: { type: "string" },
    projectIds: { type: "array", items: { type: "string" } },
    traceId: { type: "string" },
    correlationId: { type: "string" },
    action: {
      type: "string",
      description:
        "Use get/list to read registration proof, create/upsert to register lifecycle identity, add_project/remove_project for participation, and coordination actions for optional gaps, blockers, decisions, learnings, tracker refs, and artifacts.",
      enum: MANAGE_INTEGRATION_ACTIONS
    },
    integration: {
      type: "object",
      description:
        "Integration lifecycle target and optional coordination item. For non-help/list actions include integrationPointId. For create/upsert include producerProjectId. For add_project/remove_project include consumerProjectIds. Other fields are optional value context.",
      properties: {
        artifactRef: {
          type: "string",
          description:
            "Optional pointer to one contract spec, schema, fixture digest, compatibility matrix, doc, or validation report."
        },
        integrationPointId: {
          type: "string",
          description: "Required target integration ref for every action except help and list."
        },
        producerProjectId: {
          type: "string",
          description: "Required when action is create or upsert; identifies the project that owns the contract or source-of-truth workflow."
        },
        consumerProjectIds: {
          type: "array",
          items: { type: "string" },
          description:
            "Required for add_project/remove_project. Recommended for create/upsert when initial consumers are known; otherwise use add_project later."
        },
        expectedStateVersionHash: { type: "string" },
        idempotencyKey: { type: "string" },
        item: {
          type: "object",
          description:
            "Optional coordination value record. Use itemType gap/blocker/decision/goal/learning/response/tracker_ref/artifact and pointer refs for evidence, artifacts, and tracker tasks.",
          properties: {
            affectedProjectIds: { type: "array", items: { type: "string" } },
            artifactRefs: { type: "array", items: { type: "string" } },
            blockedProjectId: { type: "string" },
            blockerRef: { type: "string" },
            decisionRef: { type: "string" },
            evidenceRefs: { type: "array", items: { type: "string" } },
            itemId: { type: "string" },
            itemType: {
              type: "string",
              description:
                "Required for coordination writes such as submit_gap_report, update_gap, record_blocker, request_decision, record_learning, and link_tracker_ref.",
              enum: [
                "artifact",
                "blocker",
                "conflict",
                "decision",
                "gap",
                "goal",
                "learning",
                "response",
                "tracker_ref"
              ]
            },
            ownerProjectId: { type: "string" },
            projectId: { type: "string" },
            reporterProjectId: { type: "string" },
            responseRef: { type: "string" },
            status: {
              type: "string",
              description:
                "Optional coordination state. To close a gap, update_gap with the same itemId, itemType gap, status resolved, and pointer-only closure evidence."
            },
            summary: { type: "string", description: "Optional concise human-readable summary." },
            trackerRefs: { type: "array", items: { type: "string" } }
          },
          additionalProperties: true
        },
        projectId: { type: "string" },
        projectRole: { type: "string" },
        status: { type: "string", enum: ["active", "retired"] },
        purpose: {
          type: "string",
          description:
            "Recommended value context describing what must stay aligned; not registration proof by itself."
        },
        trackerRef: { type: "string" }
      }
    },
    evidenceRefs: {
      type: "array",
      items: { type: "string" },
      description:
        "Optional pointer-only evidence refs. Do not inline logs, transcripts, screenshots, raw rows, secrets, or unbounded diffs."
    }
  },
  required: ["portfolioId", "traceId", "correlationId", "action"],
  additionalProperties: true
};

const MANAGE_EVIDENCE_ITEMS_INPUT_SCHEMA = {
  type: "object",
  properties: {
    portfolioId: { type: "string" },
    programId: { type: "string" },
    projectIds: { type: "array", items: { type: "string" } },
    traceId: { type: "string" },
    correlationId: { type: "string" },
    action: { type: "string", enum: MANAGE_EVIDENCE_ACTIONS },
    evidenceRefs: { type: "array", items: { type: "string" } },
    evidenceItem: {
      type: "object",
      properties: {
        artifactRef: { type: "string" },
        artifactType: { type: "string" },
        attachesToRefs: { type: "array", items: { type: "string" } },
        classification: {
          type: "string",
          enum: ["public", "internal", "operator_only", "content_bearing_evidence", "secret_adjacent"]
        },
        contentHash: {
          type: "object",
          properties: {
            algorithm: { type: "string", enum: ["sha256"] },
            value: { type: "string" }
          },
          additionalProperties: false
        },
        evidenceRef: { type: "string" },
        evidenceType: { type: "string" },
        kind: { type: "string" },
        redactionStatus: {
          type: "string",
          enum: ["not_required", "redacted", "pending_review", "blocked"]
        },
        retentionPolicyRef: { type: "string" },
        storageUri: { type: "string" },
        summary: { type: "string" }
      },
      additionalProperties: true
    }
  },
  required: ["portfolioId", "traceId", "correlationId", "action"],
  additionalProperties: true
};

function sortUniqueRefs(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function rewriteRuntimeGraphModuleSpecifiers(source) {
  return source.replaceAll(/from "(\.[^"]+)\.(?:js|ts)"/g, 'from "$1.mjs"');
}

async function loadRuntimeGraphModules() {
  const tempRoot = mkdtempSync(join(tmpdir(), "program-manager-runtime-graph-"));
  for (const relativePath of RUNTIME_GRAPH_SOURCE_FILES) {
    const sourcePath = join(PACKAGE_ROOT, relativePath);
    const outputPath = join(tempRoot, relativePath.replace(/\.ts$/, ".mjs"));
    mkdirSync(dirname(outputPath), { recursive: true });
    const stripped = stripTypeScriptTypes(rewriteRuntimeGraphModuleSpecifiers(readFileSync(sourcePath, "utf8")), {
      mode: "strip"
    });
    writeFileSync(outputPath, stripped, "utf8");
  }
  const repositoryModule = await import(
    pathToFileURL(join(tempRoot, "src/repository/program-manager-graph-repository.mjs")).href
  );
  const neo4jModule = await import(
    pathToFileURL(join(tempRoot, "src/repository/program-manager-neo4j-store.mjs")).href
  );
  return {
    Neo4jProgramManagerGraphStore: neo4jModule.Neo4jProgramManagerGraphStore,
    ProgramManagerGraphRepository: repositoryModule.ProgramManagerGraphRepository
  };
}

function neo4jBackendRefForConfig(config) {
  return `${SHARED_BACKEND_PREFIX}@sha256:${sha256Hex(
    stableJson({
      database: config.database ?? "default",
      uri: config.uri,
      username: config.username
    })
  )}`;
}

function neo4jRuntimeRevisionRef(backendRef, systemRef) {
  return `${STATE_REVISION_PREFIX}/shared-runtime@sha256:${sha256Hex(stableJson({ backendRef, systemRef }))}`;
}

function unavailableBackendRef(reason) {
  return `${SHARED_UNAVAILABLE_BACKEND_PREFIX}@sha256:${sha256Hex(reason)}`;
}

function parseGrantList(value, fallback) {
  if (value === undefined) {
    return fallback;
  }
  return sortUniqueRefs(
    value
      .split(/[,\s]+/)
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function resolveStorageBackend() {
  const backend = (process.env.PMO_STORAGE_BACKEND ?? process.env.PMO_STATE_BACKEND ?? "neo4j").toLowerCase();
  if (backend === "neo4j") {
    return "neo4j";
  }
  throw new Error(
    `Unsupported PMO storage backend ${JSON.stringify(
      backend
    )}. Program Manager MCP does not support local JSON PMO state; configure the host-managed shared PMO knowledge store.`
  );
}

function resolveNeo4jConfig() {
  const uri = process.env.PMO_NEO4J_URI;
  if (!uri) {
    throw new Error("PMO_STORAGE_BACKEND=neo4j requires PMO_NEO4J_URI.");
  }
  const password = process.env.PMO_NEO4J_PASSWORD;
  if (!password) {
    throw new Error("PMO_STORAGE_BACKEND=neo4j requires PMO_NEO4J_PASSWORD.");
  }
  return {
    database: process.env.PMO_NEO4J_DATABASE || undefined,
    password,
    systemRef: process.env.PMO_NEO4J_SYSTEM_REF ?? DEFAULT_NEO4J_SYSTEM_REF,
    uri,
    username: process.env.PMO_NEO4J_USERNAME ?? "neo4j"
  };
}

function scopedNeo4jDriver(rawDriver, database) {
  return {
    session() {
      return database ? rawDriver.session({ database }) : rawDriver.session();
    }
  };
}

async function verifyNeo4jConnectivity(driver) {
  const session = driver.session();
  try {
    await session.executeRead(async (tx) => {
      await tx.run("RETURN 1 AS ok");
    });
  } finally {
    await session.close();
  }
}

async function applyNeo4jMigrations(driver) {
  const migrationsDir = join(PACKAGE_ROOT, "migrations", "neo4j");
  const session = driver.session();
  try {
    for (const file of readdirSync(migrationsDir).sort((left, right) => left.localeCompare(right))) {
      const statements = readFileSync(join(migrationsDir, file), "utf8")
        .split(";")
        .map((statement) => statement.trim())
        .filter(Boolean);
      for (const statement of statements) {
        await session.executeWrite(async (tx) => {
          await tx.run(statement);
        });
      }
    }
  } finally {
    await session.close();
  }
}

async function ensureNeo4jSystemIdentity(driver, { backendRef, systemRef }) {
  const session = driver.session();
  const now = new Date().toISOString();
  try {
    const observedSystemRef = await session.executeWrite(async (tx) => {
      const result = await tx.run(
        `
          MERGE (identity:PmSystemIdentity {identityKey: $identityKey})
          ON CREATE SET
            identity.systemRef = $systemRef,
            identity.createdAt = $now
          SET
            identity.lastSeenAt = $now,
            identity.lastBackendRef = $backendRef
          RETURN identity.systemRef AS systemRef
        `,
        {
          backendRef,
          identityKey: "program-manager-mcp",
          now,
          systemRef
        }
      );
      return result.records[0]?.get("systemRef");
    });
    if (observedSystemRef !== systemRef) {
      throw new Error(
        `Neo4j PMO system identity mismatch. Current shared database reports ${JSON.stringify(
          observedSystemRef
        )}; expected ${systemRef}. Point every MCP server at the same PMO_NEO4J_URI/database/system ref.`
      );
    }
  } finally {
    await session.close();
  }
}

function neo4jRuntimeKnowledge({ backendRef, hasPmoKnowledge, sourceRef, systemRef }) {
  const gaps = hasPmoKnowledge
    ? []
    : [
        "The shared PMO knowledge store is reachable, but no PMO program records were found. Agents should use manage_projects/manage_integrations setup guidance instead of searching local files or probing unrelated tools."
      ];
  return {
    backend: "shared-pmo-knowledge",
    databaseRef: backendRef,
    firstAgentInstruction:
      "This MCP process is a stateless frontend over the shared PMO knowledge store; use PMO tools as the source of truth.",
    gaps,
    operatingRules: [
      "All Program Manager MCP instances must point at the same shared PMO knowledge store; writes through one instance are shared PMO knowledge for every other instance.",
      "Use pmo_help to verify knowledgeAuthority before work, then use manage_projects, manage_integrations, manage_evidence_items, and pmo_macro for PMO memory.",
      "If expected PMO records are absent, follow returned setup/gap guidance and create pointer-only PMO records through the domain tools; do not infer state from local files."
    ],
    sharedAcrossMcpInstances: true,
    sourceRef,
    statefulAuthority: "shared_pmo_knowledge_store",
    status: hasPmoKnowledge ? "ok" : "warning",
    systemRef
  };
}

function unavailableRuntimeKnowledge({ backendRef, reason, sourceRef }) {
  return {
    backend: "shared-pmo-knowledge-unavailable",
    databaseRef: backendRef,
    firstAgentInstruction:
      "This MCP host has not connected to the shared PMO knowledge store. Use pmo_help for setup guidance and surface this runtime gap to the user.",
    gaps: [
      "Shared PMO knowledge is unavailable through this MCP host. The host operator must configure the common PMO store before agents can rely on PMO memory.",
      reason
    ],
    operatingRules: [
      "Do not infer PMO memory from local repository files, chat history, or process-local fallback state.",
      "Until shared PMO knowledge is available, only pmo_help is authoritative; stateful PMO tools return blocked guidance.",
      "After the host configures the shared PMO store, retry pmo_help and verify sharedAcrossMcpInstances is true."
    ],
    sharedAcrossMcpInstances: false,
    sourceRef,
    statefulAuthority: "unavailable_shared_pmo_knowledge_store",
    status: "blocked"
  };
}

function publicRuntimeKnowledge(runtimeKnowledge) {
  const { backend: _backend, databaseRef: _databaseRef, ...publicKnowledge } = runtimeKnowledge;
  return publicKnowledge;
}

function sharedKnowledgeUnavailableEnvelope(toolName, args) {
  const input = args && typeof args === "object" ? args : {};
  const portfolioId = typeof input.portfolioId === "string" ? input.portfolioId : "portfolio://default";
  const traceId = typeof input.traceId === "string" ? input.traceId : `trace://pmo-runtime/${toolName}`;
  const correlationId =
    typeof input.correlationId === "string" ? input.correlationId : `corr://pmo-runtime/${toolName}`;
  return {
    schemaVersion: "1",
    status: "blocked",
    toolName,
    portfolioId,
    evidenceRefs: ["evidence://program-manager-mcp/runtime/shared-knowledge-unavailable"],
    artifactRefs: [],
    redactionSummary: {
      omittedKinds: [],
      policyRefs: ["policy://redaction/pointer-only-v1"],
      redacted: false
    },
    warnings: [
      {
        warningId: "pmo-shared-knowledge-unavailable",
        severity: "high",
        summary:
          "Shared PMO knowledge is not available through this MCP host. Call pmo_help and have the host operator configure the shared PMO store before using stateful PMO tools.",
        evidenceRefs: ["evidence://program-manager-mcp/runtime/shared-knowledge-unavailable"]
      }
    ],
    deterministicCore: {
      guidance: {
        knowledgeAuthority: publicRuntimeKnowledge(stateProvenance.runtimeKnowledge),
        correctForm: {
          toolName: "pmo_help",
          arguments: {
            portfolioId,
            traceId,
            correlationId: `${correlationId}/help`
          }
        },
        runtimeGapHandling: [
          "Call pmo_help first. It explains whether shared PMO knowledge is available through this MCP.",
          "Do not retry random PMO tools or inspect local source files for PMO state while this gap is present.",
          "Ask the MCP host/operator to configure the shared PMO store, then retry the same PMO tool."
        ]
      }
    },
    nextRecommendedTool: "pmo_help",
    traceId,
    correlationId
  };
}

function buildActor() {
  const actorRole = process.env.PMO_MCP_ACTOR_ROLE ?? "human_operator";
  if (!ALLOWED_ACTOR_ROLES.has(actorRole)) {
    throw new Error(
      `PMO_MCP_ACTOR_ROLE ${JSON.stringify(actorRole)} is invalid. Use one of ${[...ALLOWED_ACTOR_ROLES].join(", ")}.`
    );
  }
  const authenticatedAt = new Date();
  const expiresAt = new Date(authenticatedAt.getTime() + 12 * 60 * 60 * 1000);
  return {
    actorId: process.env.PMO_MCP_ACTOR_ID ?? "actor://operators/codex",
    actorRole,
    tenantId: process.env.PMO_MCP_TENANT_ID ?? "tenant://default",
    portfolioGrants: parseGrantList(process.env.PMO_MCP_PORTFOLIO_GRANTS, DEFAULT_PORTFOLIO_GRANTS),
    programGrants: parseGrantList(process.env.PMO_MCP_PROGRAM_GRANTS, DEFAULT_PROGRAM_GRANTS),
    projectGrants: parseGrantList(process.env.PMO_MCP_PROJECT_GRANTS, []),
    authnMethod: "host_verified",
    authnIssuer: process.env.PMO_MCP_AUTHN_ISSUER ?? "issuer://codex-local",
    authenticatedAt: authenticatedAt.toISOString(),
    expiresAt: expiresAt.toISOString()
  };
}

async function buildNeo4jGateway() {
  const config = resolveNeo4jConfig();
  const backendRef = neo4jBackendRefForConfig(config);
  const requiredStateBackendRef = process.env.PMO_REQUIRED_STATE_BACKEND_REF;
  if (requiredStateBackendRef && requiredStateBackendRef !== backendRef) {
    throw new Error(
      `PMO_REQUIRED_STATE_BACKEND_REF mismatch. Current backend is ${backendRef}; required ${requiredStateBackendRef}.`
    );
  }

  let neo4j;
  try {
    neo4j = await import("neo4j-driver");
  } catch {
    throw new Error("PMO_STORAGE_BACKEND=neo4j requires the neo4j-driver package.");
  }

  const rawDriver = neo4j.default.driver(
    config.uri,
    neo4j.default.auth.basic(config.username, config.password)
  );
  const driver = scopedNeo4jDriver(rawDriver, config.database);
  try {
    await verifyNeo4jConnectivity(driver);
    if (process.env.PMO_NEO4J_RUN_MIGRATIONS !== "0") {
      await applyNeo4jMigrations(driver);
    }
    await ensureNeo4jSystemIdentity(driver, {
      backendRef,
      systemRef: config.systemRef
    });

    const { ProgramManagerGraphRepository, Neo4jProgramManagerGraphStore } = await loadRuntimeGraphModules();
    const repository = new ProgramManagerGraphRepository(new Neo4jProgramManagerGraphStore(driver));
    const hasPmoKnowledge = (await repository.listPrograms({ portfolioId: "portfolio://default" })).length > 0;
    const adapterRegistry = new AdapterRegistry([new HoplonAdapterStub(), new TrackerAdapterStub()]);
    const runtimeKnowledge = neo4jRuntimeKnowledge({
      backendRef,
      hasPmoKnowledge,
      sourceRef: SHARED_STATE_SOURCE_REF,
      systemRef: config.systemRef
    });
    const service = new ProgramToolService({
      repository,
      adapterRegistry,
      now: () => new Date().toISOString(),
      runtimeKnowledge
    });

    console.error(
      `[program-manager-mcp] Connected to shared PMO knowledge store backend ${backendRef} system ${config.systemRef}`
    );
    return {
      gateway: new ProgramManagerMcpGateway(service),
      stateProvenance: {
        backend: "shared-pmo-knowledge",
        backendRef,
        close: () => rawDriver.close(),
        runtimeKnowledge,
        revisionRef: neo4jRuntimeRevisionRef(backendRef, config.systemRef),
        sourceRef: SHARED_STATE_SOURCE_REF
      }
    };
  } catch (error) {
    await rawDriver.close();
    throw error;
  }
}

function buildDegradedGateway(reason) {
  const backendRef = unavailableBackendRef(reason);
  const repository = InMemoryProgramManagerRepository.fromFixture({});
  const adapterRegistry = new AdapterRegistry([new HoplonAdapterStub(), new TrackerAdapterStub()]);
  const runtimeKnowledge = unavailableRuntimeKnowledge({
    backendRef,
    reason,
    sourceRef: SHARED_STATE_SOURCE_REF
  });
  const service = new ProgramToolService({
    repository,
    adapterRegistry,
    now: () => new Date().toISOString(),
    runtimeKnowledge
  });
  console.error(`[program-manager-mcp] shared PMO knowledge unavailable: ${reason}`);
  return {
    gateway: new ProgramManagerMcpGateway(service),
    stateProvenance: {
      backend: "shared-pmo-knowledge-unavailable",
      backendRef,
      degraded: true,
      runtimeKnowledge,
      revisionRef: `${STATE_REVISION_PREFIX}/shared-runtime-unavailable@sha256:${sha256Hex(reason)}`,
      sourceRef: SHARED_STATE_SOURCE_REF
    }
  };
}

async function buildGateway() {
  try {
    resolveStorageBackend();
    return await buildNeo4jGateway();
  } catch (error) {
    if (process.env.PMO_FAIL_ON_SHARED_STORE_ERROR === "1") {
      throw error;
    }
    const reason = error instanceof Error ? error.message : String(error);
    return buildDegradedGateway(reason);
  }
}

let gateway;
let actor;
let stateProvenance;
try {
  ({ gateway, stateProvenance } = await buildGateway());
  actor = buildActor();
} catch (error) {
  console.error(
    `[program-manager-mcp] startup failed: ${error instanceof Error ? error.message : String(error)}`
  );
  console.error(
    `[program-manager-mcp] expected shared PMO state source ${SHARED_STATE_SOURCE_REF}; configure the host-managed shared PMO knowledge store with PMO_STORAGE_BACKEND=neo4j, PMO_NEO4J_URI, PMO_NEO4J_USERNAME, and PMO_NEO4J_PASSWORD. Local JSON PMO state is not supported.`
  );
  process.exit(1);
}

function writeMessage(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function ok(id, result) {
  writeMessage({ jsonrpc: "2.0", id, result });
}

function fail(id, code, message, data) {
  writeMessage({
    jsonrpc: "2.0",
    id,
    error: { code, message, ...(data ? { data } : {}) }
  });
}

function addStateSourceArtifact(result) {
  if (!result || typeof result !== "object" || !Array.isArray(result.artifactRefs)) {
    return result;
  }
  const revisionRef =
    typeof stateProvenance.revisionRef === "function"
      ? stateProvenance.revisionRef()
      : stateProvenance.revisionRef;
  return {
    ...result,
    artifactRefs: sortUniqueRefs([
      ...result.artifactRefs,
      stateProvenance.sourceRef,
      stateProvenance.backendRef,
      ...(revisionRef ? [revisionRef] : [])
    ])
  };
}

function inputSchemaForTool(toolName) {
  switch (toolName) {
    case "pmo_help":
      return PMO_HELP_INPUT_SCHEMA;
    case "manage_projects":
      return MANAGE_PROJECTS_INPUT_SCHEMA;
    case "manage_integrations":
      return MANAGE_INTEGRATIONS_INPUT_SCHEMA;
    case "manage_evidence_items":
      return MANAGE_EVIDENCE_ITEMS_INPUT_SCHEMA;
    case "pmo_macro":
      return PMO_MACRO_INPUT_SCHEMA;
    default:
      return {};
  }
}

async function handleRequest(message) {
  if (!message || typeof message !== "object") {
    return;
  }

  if (!("id" in message)) {
    return;
  }

  try {
    switch (message.method) {
      case "initialize":
        ok(message.id, {
          protocolVersion: message.params?.protocolVersion ?? "2024-11-05",
          capabilities: {
            tools: {}
          },
          serverInfo: {
            ...SERVER_INFO,
            knowledgeAuthority: publicRuntimeKnowledge(stateProvenance.runtimeKnowledge),
            stateBackend: stateProvenance.backend,
            stateBackendRef: stateProvenance.backendRef,
            stateSourceRef: stateProvenance.sourceRef
          }
        });
        return;

      case "tools/list":
        ok(message.id, {
          tools: gateway.listTools().map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: inputSchemaForTool(tool.name)
          }))
        });
        return;

      case "tools/call": {
        const toolName = message.params?.name;
        const args = message.params?.arguments ?? {};
        const result =
          stateProvenance.degraded && toolName !== "pmo_help"
            ? sharedKnowledgeUnavailableEnvelope(toolName, args)
            : await gateway.callTool(toolName, args, actor);
        const resultWithStateSource = addStateSourceArtifact(result);
        ok(message.id, {
          content: [
            {
              type: "text",
              text: JSON.stringify(resultWithStateSource, null, 2)
            }
          ],
          isError: resultWithStateSource?.status === "error" || resultWithStateSource?.status === "blocked"
        });
        return;
      }

      case "ping":
        ok(message.id, {});
        return;

      default:
        fail(message.id, -32601, `Unsupported method: ${message.method}`);
    }
  } catch (error) {
    fail(message.id, -32603, error instanceof Error ? error.message : String(error));
  }
}

async function shutdown() {
  try {
    await stateProvenance.close?.();
  } finally {
    process.exit(0);
  }
}

process.once("SIGTERM", () => {
  void shutdown();
});

process.once("SIGINT", () => {
  void shutdown();
});

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity
});

rl.on("line", (line) => {
  if (!line.trim()) {
    return;
  }

  let message;
  try {
    message = JSON.parse(line);
  } catch (error) {
    fail(null, -32700, error instanceof Error ? error.message : String(error));
    return;
  }

  void handleRequest(message);
});
