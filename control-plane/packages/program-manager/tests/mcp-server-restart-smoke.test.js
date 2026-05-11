import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = join(__dirname, "..");
const serverPath = join(packageRoot, "bin", "server.js");
const sharedStateSourceRef = "artifact://program-manager/state/source/shared-pmo-knowledge";
const unavailableBackendPrefix =
  "artifact://program-manager/state/backend/shared-pmo-knowledge-unavailable";
const runtimeGraphSourceFiles = [
  "src/types/domain.ts",
  "src/normalization/program-manager-normalization.ts",
  "src/repository/program-manager-repository.ts",
  "src/repository/program-manager-graph-store.ts",
  "src/repository/program-manager-graph-repository.ts",
  "src/repository/program-manager-neo4j-store.ts"
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

function startServer(env = {}) {
  const child = spawn(process.execPath, [serverPath], {
    cwd: packageRoot,
    env: {
      ...process.env,
      PMO_STORAGE_BACKEND: "neo4j",
      PMO_NEO4J_URI: "",
      PMO_NEO4J_PASSWORD: "",
      ...env
    },
    stdio: ["pipe", "pipe", "pipe"]
  });

  let nextId = 1;
  let stdoutBuffer = "";
  let stderr = "";
  let exitError;
  const pending = new Map();

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk;
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }
      const message = JSON.parse(line);
      const wait = pending.get(message.id);
      if (wait) {
        pending.delete(message.id);
        wait.resolve(message);
      }
    }
  });

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  child.on("exit", (code, signal) => {
    exitError = new Error(`server exited before response: code=${code} signal=${signal} stderr=${stderr}`);
    for (const wait of pending.values()) {
      wait.reject(exitError);
    }
    pending.clear();
  });

  function request(method, params = {}) {
    if (exitError) {
      return Promise.reject(exitError);
    }
    const id = nextId++;
    const payload = { jsonrpc: "2.0", id, method, params };
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`timed out waiting for ${method}; stderr=${stderr}`));
      }, 5000);
      pending.set(id, {
        resolve: (message) => {
          clearTimeout(timeout);
          resolve(message);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });
      child.stdin.write(`${JSON.stringify(payload)}\n`);
    });
  }

  async function callTool(name, args) {
    const message = await request("tools/call", {
      name,
      arguments: args
    });
    assert.equal(message.error, undefined, `unexpected MCP error: ${JSON.stringify(message.error)}`);
    const text = message.result.content[0].text;
    return JSON.parse(text);
  }

  async function stop() {
    if (child.exitCode !== null) {
      return;
    }
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
  }

  return {
    callTool,
    get stderr() {
      return stderr;
    },
    request,
    stop
  };
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

test("MCP server starts with blocked runtime guidance when shared PMO store configuration is missing", async () => {
  const server = startServer();

  try {
    const initialize = await server.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {}
    });
    assert.equal(initialize.result.serverInfo.stateSourceRef, sharedStateSourceRef);
    assert.equal(initialize.result.serverInfo.stateBackend, "shared-pmo-knowledge-unavailable");
    assert.match(initialize.result.serverInfo.stateBackendRef, new RegExp(`^${unavailableBackendPrefix}@sha256:`));
    assert.equal(initialize.result.serverInfo.knowledgeAuthority.sharedAcrossMcpInstances, false);
    assert.equal(
      initialize.result.serverInfo.knowledgeAuthority.statefulAuthority,
      "unavailable_shared_pmo_knowledge_store"
    );

    const toolsList = await server.request("tools/list");
    assert.deepEqual(
      toolsList.result.tools.map((tool) => tool.name),
      ["pmo_help", "manage_projects", "manage_integrations", "manage_evidence_items", "pmo_macro"]
    );
    const manageIntegrationsTool = toolsList.result.tools.find((tool) => tool.name === "manage_integrations");
    assert.match(manageIntegrationsTool.description, /optional pointer-only value context/);
    assert.match(
      manageIntegrationsTool.inputSchema.description,
      /contracts, dependencies, blockers, gaps, decisions, learnings, tracker refs/
    );
    assert.deepEqual(manageIntegrationsTool.inputSchema.properties.action.enum, MANAGE_INTEGRATION_ACTIONS);

    const help = await server.callTool("pmo_help", {
      portfolioId: "portfolio://default",
      traceId: "trace://test/runtime-gap/help",
      correlationId: "corr://test/runtime-gap/help"
    });
    assert.equal(help.toolName, "pmo_help");
    assert.ok(help.artifactRefs.includes(sharedStateSourceRef));
    assert.ok(help.warnings.some((warning) => warning.warningId === "pmo-runtime-knowledge-authority-gap"));
    assert.equal(help.deterministicCore.guidance.knowledgeAuthority.sharedAcrossMcpInstances, false);
    assert.equal("backend" in help.deterministicCore.guidance.knowledgeAuthority, false);
    assert.equal("databaseRef" in help.deterministicCore.guidance.knowledgeAuthority, false);

    const amgHelp = await server.callTool("pmo_help", {
      portfolioId: "portfolio://default",
      programId: "program://agentic-os",
      projectIds: ["project://ask-mr-gambler"],
      traceId: "trace://test/runtime-gap/amg-help",
      correlationId: "corr://test/runtime-gap/amg-help"
    });
    assert.equal(amgHelp.status, "ok");
    assert.equal(
      amgHelp.warnings.some((warning) => warning.warningId === "authz-denied"),
      false
    );

    const blocked = await server.callTool("manage_integrations", {
      action: "list",
      portfolioId: "portfolio://default",
      traceId: "trace://test/runtime-gap/integrations",
      correlationId: "corr://test/runtime-gap/integrations"
    });
    assert.equal(blocked.status, "blocked");
    assert.equal(blocked.warnings[0].warningId, "pmo-shared-knowledge-unavailable");
    assert.equal(blocked.nextRecommendedTool, "pmo_help");
    assert.match(server.stderr, /PMO_STORAGE_BACKEND=neo4j requires PMO_NEO4J_URI/);
  } finally {
    await server.stop();
  }
});

test("MCP server runtime has no fixture JSON PMO bootstrap hook", async () => {
  const serverSource = await readFile(serverPath, "utf8");

  assert.doesNotMatch(serverSource, /getBackboneRepositoryFixture/);
  assert.doesNotMatch(serverSource, /golden-fixture-backbone/);
  assert.doesNotMatch(serverSource, /PMO_NEO4J_BOOTSTRAP/);
  assert.doesNotMatch(serverSource, /program-manager-state\.json/);
  assert.doesNotMatch(serverSource, /default-json/);
});

test("MCP server runtime graph loader includes normalization dependencies", async () => {
  const serverSource = await readFile(serverPath, "utf8");

  assert.match(serverSource, /src\/normalization\/program-manager-normalization\.ts/);
  assert.ok(serverSource.includes("(?:js|ts)"));
});

test("MCP server mints a fresh host-verified actor for each tool call", async () => {
  const serverSource = await readFile(serverPath, "utf8");

  assert.doesNotMatch(serverSource, /actor\s*=\s*buildActor\(\)/);
  assert.match(serverSource, /const requestActor = buildActor\(\)/);
  assert.match(serverSource, /gateway\.callTool\(toolName, args, requestActor\)/);
});

test("MCP server runtime graph temp modules can import Neo4j repository modules", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "program-manager-runtime-graph-test-"));

  try {
    for (const relativePath of runtimeGraphSourceFiles) {
      const sourcePath = join(packageRoot, relativePath);
      const outputPath = join(tempRoot, relativePath.replace(/\.ts$/, ".mjs"));
      mkdirSync(dirname(outputPath), { recursive: true });
      const source = readFileSync(sourcePath, "utf8");
      const rewritten = source.replaceAll(/from "(\.[^"]+)\.(?:js|ts)"/g, 'from "$1.mjs"');
      const stripped = stripTypeScriptTypes(rewritten, { mode: "strip" });
      writeFileSync(outputPath, stripped, "utf8");
    }

    const repositoryModule = await import(
      pathToFileURL(join(tempRoot, "src/repository/program-manager-graph-repository.mjs")).href
    );
    const neo4jModule = await import(
      pathToFileURL(join(tempRoot, "src/repository/program-manager-neo4j-store.mjs")).href
    );

    assert.equal(typeof repositoryModule.ProgramManagerGraphRepository, "function");
    assert.equal(typeof neo4jModule.Neo4jProgramManagerGraphStore, "function");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("MCP server never uses local JSON PMO state even when legacy JSON env vars are supplied", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "program-manager-mcp-forbidden-json-"));
  const statePath = join(tempDir, "state.json");
  const server = startServer({
    PMO_STORAGE_BACKEND: "json",
    PMO_ALLOW_LEGACY_JSON_STATE: "1",
    PMO_STATE_PATH: statePath,
    PMO_STATE_BOOTSTRAP: "1"
  });

  try {
    const initialize = await server.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {}
    });
    assert.equal(initialize.result.serverInfo.stateBackend, "shared-pmo-knowledge-unavailable");
    assert.equal(initialize.result.serverInfo.stateSourceRef, sharedStateSourceRef);
    assert.equal(await pathExists(statePath), false);

    const help = await server.callTool("pmo_help", {
      portfolioId: "portfolio://default",
      traceId: "trace://test/forbidden-json/help",
      correlationId: "corr://test/forbidden-json/help"
    });
    assert.equal(help.status, "ok");
    assert.match(
      help.deterministicCore.guidance.knowledgeAuthority.gaps.join("\n"),
      /does not support local JSON PMO state/
    );

    const blocked = await server.callTool("manage_projects", {
      action: "list",
      portfolioId: "portfolio://default",
      traceId: "trace://test/forbidden-json/projects",
      correlationId: "corr://test/forbidden-json/projects"
    });
    assert.equal(blocked.status, "blocked");
    assert.equal(blocked.warnings[0].warningId, "pmo-shared-knowledge-unavailable");
  } finally {
    await server.stop();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("MCP server strict mode fails closed instead of using local JSON state", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "program-manager-mcp-strict-json-"));
  const statePath = join(tempDir, "state.json");
  const server = startServer({
    PMO_STORAGE_BACKEND: "json",
    PMO_ALLOW_LEGACY_JSON_STATE: "1",
    PMO_STATE_PATH: statePath,
    PMO_STATE_BOOTSTRAP: "1",
    PMO_FAIL_ON_SHARED_STORE_ERROR: "1"
  });

  try {
    await assert.rejects(
      server.request("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {}
      }),
      /server exited before response/
    );
    assert.match(server.stderr, /does not support local JSON PMO state/);
    assert.equal(await pathExists(statePath), false);
  } finally {
    await server.stop();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("MCP server strict mode fails closed when shared PMO store configuration is missing", async () => {
  const server = startServer({
    PMO_FAIL_ON_SHARED_STORE_ERROR: "1"
  });

  try {
    await assert.rejects(
      server.request("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {}
      }),
      /server exited before response/
    );
    assert.match(server.stderr, /PMO_STORAGE_BACKEND=neo4j requires PMO_NEO4J_URI/);
    assert.match(server.stderr, /Local JSON PMO state is not supported/);
  } finally {
    await server.stop();
  }
});
